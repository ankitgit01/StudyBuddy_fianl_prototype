import json
from typing import List
from services.azure_openai import client


MODEL = "gpt-4.1"

import datetime
import uuid

def create_topic_graph(container, user_id, user_prompt, topics_used, graph):
    graph_id = str(uuid.uuid4())

    doc = {
        "id": graph_id,
        "user_id": user_id,
        "user_prompt": user_prompt,
        "topics_used": topics_used,
        "graph": graph,
        "created_at": datetime.datetime.utcnow().isoformat(),
    }

    container.create_item(doc)
    return graph_id


def get_topic_graph(container, graph_id):
    try:
        return container.read_item(graph_id, partition_key=None)
    except:
        return None


def _clean_text(value: str) -> str:
    return " ".join((value or "").split()).strip()


def _dedupe_topics(values) -> list[str]:
    seen = set()
    topics = []

    for value in values or []:
        cleaned = _clean_text(value)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        topics.append(cleaned)

    return topics


def _coerce_graph(raw_graph) -> dict[str, list[str]]:
    if not isinstance(raw_graph, dict):
        return {}

    graph = {}
    for key, value in raw_graph.items():
        topic = _clean_text(key)
        if not topic:
            continue
        dependents = value if isinstance(value, list) else []
        graph[topic] = _dedupe_topics(dependents)

    return graph


def _graph_topics(graph: dict[str, list[str]]) -> list[str]:
    topics = []
    for topic, dependents in (graph or {}).items():
        topics.append(topic)
        topics.extend(dependents or [])
    return _dedupe_topics(topics)


def _fallback_title(user_prompt: str, graph: dict[str, list[str]]) -> str:
    prompt = _clean_text(user_prompt)
    if ":" in prompt:
        chapter = _clean_text(prompt.split(":", 1)[0])
        if chapter:
            return chapter[:80]

    graph_topics = _graph_topics(graph)
    if graph_topics:
        return graph_topics[0][:80]

    return prompt[:80] if prompt else "Untitled Graph"

def _build_prompt(user_prompt: str, all_topics: List[str]) -> str:
    topics_text = ", ".join([t for t in all_topics if t])

    return f"""
You are an expert curriculum designer.

INPUT:
1. User Prompt or OCR-extracted syllabus text:
{user_prompt}
2. Topics found in the user's uploaded study notes (optional context, may be empty):
{topics_text or "None"}

IMPORTANT CONTEXT RULES (VERY STRICT):
- If a reference book name is provided in INPUT 1, striclty include all the topics present in that book related to the given chapter name.
- The topics listed in INPUT (2) represent topics for which the user already has notes.
- If your generated topics include a concept whose synonym or equivalent exists in INPUT (2),
  you MUST use the exact same wording as in INPUT (2), not your own variation.
  Example: If INPUT has "Electric Field", do NOT use "Field Intensity".

- If a topic from INPUT (2) is a prerequisite for any generated topic, you SHOULD include it
  in the roadmap (even if not explicitly mentioned in INPUT 1).

- If a topic from INPUT (2) is NOT:
  (a) relevant to the user_prompt, AND
  (b) not a prerequisite of any generated topic,
  then IGNORE it completely.

- Do NOT blindly include all topics from INPUT (2). Only include them if they are relevant
  or required as prerequisites.

TASK:
1. Infer the chapter or roadmap title from the input. It should look like a chapter name
2. Extract the main syllabus topics actually mentioned or clearly implied by the input.
3. Remove:
   - Exact duplicates
   - Synonyms (while respecting INPUT (2) naming if overlap exists)
4. Add:
   - Missing prerequisite topics ONLY if strongly required
5. Create a LEARNING ROADMAP as a DIRECTED GRAPH:
   - Each topic maps to topics that depend on it
6. Prefer topic names that are concise and useful as node labels.
7. If the input comes from OCR, ignore obvious OCR noise, page numbers, headers, and broken fragments.

FORMAT STRICTLY AS JSON:
{{
  "title": "Chapter name or roadmap title",
  "topics_used": ["Topic A", "Topic B", "Topic C"],
  "graph": {{
    "Topic A": ["Topic B"],
    "Topic B": ["Topic C"]
  }}
}}

RULES:
- No explanations
- No markdown
- Only valid JSON
- Keep topic names concise
- Avoid repetition
- Ensure logical learning flow
- "topics_used" should be a deduplicated list
- "graph" must be an object whose values are arrays
"""

def generate_topic_graph(user_prompt: str, all_topics: List[str]) -> dict:
    prompt = _build_prompt(user_prompt, all_topics)

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You generate structured learning graphs."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )

        content = response.choices[0].message.content.strip()

        # 🔥 Try parsing JSON safely
        try:
            parsed = json.loads(content)
        except Exception:
            content = content.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(content)

        if isinstance(parsed, dict) and "graph" in parsed:
            graph = _coerce_graph(parsed.get("graph"))
            topics_used = _dedupe_topics(parsed.get("topics_used") or _graph_topics(graph))
            return {
                "title": _clean_text(parsed.get("title")) or _fallback_title(user_prompt, graph),
                "topics_used": topics_used,
                "graph": graph,
            }

        graph = _coerce_graph(parsed)
        return {
            "title": _fallback_title(user_prompt, graph),
            "topics_used": _graph_topics(graph),
            "graph": graph,
        }

    except Exception as e:
        print("Topic graph generation failed:", e)
        return {"error": "Failed to generate topic graph"}
