from datetime import datetime, timezone
from pathlib import Path
import tempfile
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel

from routers.users import DEFAULT_USER_ID, ensure_default_user, get_optional_user_from_auth_header
from services.cosmos_db import (
    create_topic_graph,
    delete_topic_graph,
    get_orphan_topic_graphs,
    get_notes_by_user,
    get_topic_graph,
    get_topic_graphs_by_user,
    update_topic_graph,
)
from services.pdf_processor import pdf_to_images
from services.responsible_ai import UnsafeContentError, validate_upload_bytes_or_raise
from services.topic_graph import generate_topic_graph
from services.vision_ocr import extract_text_from_local_image, ocr_multiple_pages

router = APIRouter(tags=["Topic Graph"])


class TopicGraphRequest(BaseModel):
    user_prompt: str
    subject: Optional[str] = None


class TopicNodeStatusRequest(BaseModel):
    is_marked_done: bool


def _resolved_user_id(request: Request) -> str:
    current_user = get_optional_user_from_auth_header(request.headers.get("Authorization"))
    if current_user and current_user.get("user_id"):
        return current_user["user_id"]
    ensure_default_user()
    return DEFAULT_USER_ID


def _extract_title(user_prompt: str) -> str:
    cleaned = " ".join((user_prompt or "").split())
    if not cleaned:
        return "Untitled Graph"
    return cleaned[:80]


def _normalize_topic_key(value: str) -> str:
    return " ".join((value or "").strip().lower().split())


def _collect_graph_labels(graph: dict) -> list[str]:
    labels = set()
    for topic, dependents in (graph or {}).items():
        if topic:
            labels.add(topic)
        if isinstance(dependents, list):
            for child in dependents:
                if child:
                    labels.add(child)
    return sorted(labels)


def _collect_note_topics(notes: list[dict]) -> set[str]:
    topics = set()

    for note in notes or []:
        raw_topic = note.get("topic")
        if isinstance(raw_topic, str):
            for item in raw_topic.split(","):
                normalized = _normalize_topic_key(item)
                if normalized:
                    topics.add(normalized)

        concepts = note.get("concepts", [])
        if isinstance(concepts, list):
            for concept in concepts:
                if isinstance(concept, str):
                    normalized = _normalize_topic_key(concept)
                    if normalized:
                        topics.add(normalized)

        structured = note.get("explanation_structured") or {}
        for concept in structured.get("concepts", []) or []:
            term = concept.get("term") if isinstance(concept, dict) else None
            normalized = _normalize_topic_key(term)
            if normalized:
                topics.add(normalized)

    return topics


def _build_node_states(graph: dict, notes: list[dict], existing_states: Optional[dict] = None) -> dict:
    note_topics = _collect_note_topics(notes)
    state_map = existing_states or {}
    node_states = {}

    for label in _collect_graph_labels(graph):
        existing = state_map.get(label) or {}
        node_states[label] = {
            "label": label,
            "is_marked_done": bool(existing.get("is_marked_done", False)),
            "is_in_uploaded_notes": _normalize_topic_key(label) in note_topics,
        }

    return node_states


def _graph_response_payload(graph: dict) -> dict:
    graph_data = graph.get("graph", {})
    edge_count = sum(len(value) for value in graph_data.values() if isinstance(value, list))
    return {
        "id": graph["id"],
        "title": graph.get("title") or _extract_title(graph.get("user_prompt", "")),
        "subject": graph.get("subject", "General"),
        "user_prompt": graph.get("user_prompt", ""),
        "topics_used": graph.get("topics_used", []),
        "graph": graph_data,
        "nodes": list((graph.get("node_states") or {}).values()),
        "created_at": graph.get("created_at"),
        "input_mode": graph.get("input_mode", "text"),
        "source_filename": graph.get("source_filename"),
        "node_count": len(graph_data),
        "edge_count": edge_count,
    }


def _collect_note_concepts(notes: list[dict]) -> list[str]:
    all_topics = []
    for note in notes or []:
        concepts = note.get("concepts", [])
        if isinstance(concepts, list):
            all_topics.extend(concepts)
    return sorted(set(topic for topic in all_topics if topic))


def _extract_uploaded_prompt(file_bytes: bytes, filename: str) -> str:
    safe_name = filename or "upload"
    suffix = Path(safe_name).suffix.lower()
    is_pdf = suffix == ".pdf"

    with tempfile.TemporaryDirectory(prefix="topic_graph_upload_") as temp_dir:
        temp_dir_path = Path(temp_dir)

        if is_pdf:
            pdf_path = temp_dir_path / safe_name
            pdf_path.write_bytes(file_bytes)
            pages = pdf_to_images(str(pdf_path), output_dir=str(temp_dir_path / "pages"))
            ocr_results = ocr_multiple_pages(pages)
            extracted_text = "\n\n".join(
                f"Page {page['page']}:\n{page['text']}".strip()
                for page in ocr_results
                if page.get("text")
            )
        else:
            image_path = temp_dir_path / safe_name
            image_path.write_bytes(file_bytes)
            structured = extract_text_from_local_image(str(image_path))
            extracted_text = "\n".join(
                paragraph.get("text", "")
                for paragraph in structured.get("paragraphs", [])
                if paragraph.get("text")
            )

    prompt = extracted_text.strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="Could not extract readable text from the uploaded syllabus file")

    return prompt


def _create_saved_graph_record(
    *,
    user_prompt: str,
    subject: Optional[str],
    user_id: Optional[str],
    notes: list[dict],
    input_mode: str = "text",
    source_filename: Optional[str] = None,
) -> dict:
    note_topics = _collect_note_concepts(notes)
    generated = generate_topic_graph(user_prompt, note_topics)
    graph_data = generated.get("graph", {}) if isinstance(generated, dict) else {}
    if not isinstance(graph_data, dict) or not graph_data or generated.get("error"):
        raise HTTPException(status_code=502, detail="Failed to generate topic graph")

    saved_graph = {
        "id": f"topic_graph_{uuid4().hex}",
        "user_id": user_id,
        "subject": subject or "General",
        "title": generated.get("title") or _extract_title(user_prompt),
        "user_prompt": user_prompt,
        "topics_used": generated.get("topics_used", []),
        "graph": graph_data,
        "node_states": _build_node_states(graph_data, notes),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "input_mode": input_mode,
        "source_filename": source_filename,
    }
    create_topic_graph(saved_graph)
    return saved_graph


@router.post("/topic-graph/")
@router.post("/topic_graph/", include_in_schema=False)
@router.post("/topic_graphs/", include_in_schema=False)
def create_topic_graph_route(
    req: TopicGraphRequest,
    request: Request,
):
    user_id = _resolved_user_id(request)
    notes = get_notes_by_user(user_id)
    saved_graph = _create_saved_graph_record(
        user_prompt=req.user_prompt,
        subject=req.subject,
        user_id=user_id,
        notes=notes,
        input_mode="text",
    )

    return _graph_response_payload(saved_graph)


@router.post("/topic-graph/upload/")
async def create_topic_graph_from_upload(
    request: Request,
    file: UploadFile = File(...),
    subject: str = Form("General"),
):
    user_id = _resolved_user_id(request)
    notes = get_notes_by_user(user_id)
    filename = file.filename or "syllabus_upload"
    file_bytes = await file.read()

    try:
        validate_upload_bytes_or_raise(file_bytes, filename)
    except UnsafeContentError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc

    user_prompt = _extract_uploaded_prompt(file_bytes, filename)
    saved_graph = _create_saved_graph_record(
        user_prompt=user_prompt,
        subject=subject,
        user_id=user_id,
        notes=notes,
        input_mode="upload",
        source_filename=filename,
    )

    return _graph_response_payload(saved_graph)


@router.get("/topic-graph/")
@router.get("/topic_graph/", include_in_schema=False)
@router.get("/topic_graphs/", include_in_schema=False)
def list_topic_graphs(
    request: Request,
):
    user_id = _resolved_user_id(request)
    graphs = get_topic_graphs_by_user(user_id)
    if user_id == DEFAULT_USER_ID:
        for graph in get_orphan_topic_graphs():
            adopted = update_topic_graph(graph["id"], {"user_id": DEFAULT_USER_ID})
            if adopted:
                graphs.append(adopted)
        graphs.sort(key=lambda x: x.get("_ts", 0), reverse=True)
    return [
        {
            "id": graph["id"],
            "title": graph.get("title") or _extract_title(graph.get("user_prompt", "")),
            "subject": graph.get("subject", "General"),
            "user_prompt": graph.get("user_prompt", ""),
            "topics_used": graph.get("topics_used", []),
            "created_at": graph.get("created_at"),
            "input_mode": graph.get("input_mode", "text"),
            "source_filename": graph.get("source_filename"),
            "topics_used_count": len(graph.get("topics_used", [])),
            "node_count": len(graph.get("graph", {})),
            "edge_count": sum(len(value) for value in graph.get("graph", {}).values() if isinstance(value, list)),
        }
        for graph in graphs
    ]


@router.get("/topic-graph/{graph_id}")
@router.get("/topic_graph/{graph_id}", include_in_schema=False)
@router.get("/topic_graphs/{graph_id}", include_in_schema=False)
def get_saved_topic_graph(
    graph_id: str,
    request: Request,
):
    user_id = _resolved_user_id(request)
    graph = get_topic_graph(graph_id, user_id=user_id)
    if not graph and user_id == DEFAULT_USER_ID:
        graph = get_topic_graph(graph_id)
        if graph and not graph.get("user_id"):
            graph = update_topic_graph(graph_id, {"user_id": DEFAULT_USER_ID}) or graph
    if not graph:
        raise HTTPException(status_code=404, detail="Topic graph not found")

    notes = get_notes_by_user(user_id)
    next_node_states = _build_node_states(graph.get("graph", {}), notes, graph.get("node_states"))

    if next_node_states != (graph.get("node_states") or {}):
        graph = update_topic_graph(graph_id, {"node_states": next_node_states}, user_id=user_id) or graph
    else:
        graph["node_states"] = next_node_states

    return _graph_response_payload(graph)


@router.delete("/topic-graph/{graph_id}")
@router.delete("/topic_graph/{graph_id}", include_in_schema=False)
@router.delete("/topic_graphs/{graph_id}", include_in_schema=False)
def remove_topic_graph(
    graph_id: str,
    request: Request,
):
    user_id = _resolved_user_id(request)
    graph = get_topic_graph(graph_id, user_id=user_id)
    if not graph and user_id == DEFAULT_USER_ID:
        graph = get_topic_graph(graph_id)
        if graph and not graph.get("user_id"):
            graph = update_topic_graph(graph_id, {"user_id": DEFAULT_USER_ID}) or graph
    if not graph:
        raise HTTPException(status_code=404, detail="Topic graph not found")

    graph_user_id = graph.get("user_id")
    if graph_user_id and graph_user_id != user_id:
        raise HTTPException(status_code=403, detail="You cannot delete this topic graph")

    try:
        deleted = delete_topic_graph(graph_id, user_id=user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete topic graph: {exc}") from exc

    if not deleted:
        raise HTTPException(status_code=404, detail="Topic graph not found")

    return {"status": "deleted", "graph_id": graph_id}


@router.patch("/topic-graph/{graph_id}/nodes/{node_label}")
@router.patch("/topic_graph/{graph_id}/nodes/{node_label}", include_in_schema=False)
@router.patch("/topic_graphs/{graph_id}/nodes/{node_label}", include_in_schema=False)
def update_topic_node_status(
    graph_id: str,
    node_label: str,
    req: TopicNodeStatusRequest,
    request: Request,
):
    user_id = _resolved_user_id(request)
    graph = get_topic_graph(graph_id, user_id=user_id)
    if not graph and user_id == DEFAULT_USER_ID:
        graph = get_topic_graph(graph_id)
        if graph and not graph.get("user_id"):
            graph = update_topic_graph(graph_id, {"user_id": DEFAULT_USER_ID}) or graph
    if not graph:
        raise HTTPException(status_code=404, detail="Topic graph not found")

    notes = get_notes_by_user(user_id)
    node_states = _build_node_states(graph.get("graph", {}), notes, graph.get("node_states"))
    if node_label not in node_states:
        raise HTTPException(status_code=404, detail="Topic node not found")

    node_states[node_label]["is_marked_done"] = req.is_marked_done
    updated = update_topic_graph(graph_id, {"node_states": node_states}, user_id=user_id)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update topic graph node")

    return {
        "graph_id": graph_id,
        "node": node_states[node_label],
        "nodes": list(node_states.values()),
    }
