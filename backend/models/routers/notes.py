from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException, Depends, Form
from pydantic import BaseModel
import uuid
import sys
import io
import time
import datetime
import tempfile
import re
import requests
from pathlib import Path
import fitz
from PIL import Image, ImageOps

from services.pdf_processor import pdf_to_images
from services.vision_ocr import ocr_multiple_pages, extract_text_from_image
from services.azure_blob import upload_image, upload_image_bytes
from services.cosmos_db import (
    create_note,
    delete_note,
    get_note,
    get_all_notes,
    update_note,
    get_recent_sessions,
    upsert_study_dna,
    get_study_dna,
    get_notes_by_user,
    get_signals,
    merge_signals,
    upsert_signals_document,
    get_topic_graphs_by_user,
    get_user_by_id,
    save_stress_log,
    get_latest_stress,
    get_stress_logs_by_user,
)
from services.responsible_ai import (
    UnsafeContentError,
    validate_upload_bytes_or_raise,
)
from services.azure_openai import client as azure_openai_client, generate_explanation
from services.azure_translator import translate_text
from services.azure_speech import generate_audio
from routers.users import DEFAULT_USER_ID, get_current_user, require_user, build_predict_params_for_user, record_subject_activity

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from models.dna.predictor import predict_dna, BEGINNER_PROFILE
from models.stress.predictor import STRESS_FEATURES, predict_from_dict as predict_stress

router = APIRouter()
PREVIEW_SIZE = (480, 640)
PREVIEW_QUALITY = 68
STRESS_LOG_MIN_INTERVAL = datetime.timedelta(minutes=2)


class PromptExplanationRequest(BaseModel):
    subject: str = "General"
    topic: str | None = None
    language: str = "hi-en"
    custom_prompt: str
    signals: dict | None = None


def _note_user_message(note: dict) -> str | None:
    return note.get("user_message") or note.get("custom_prompt")


def _first_non_empty_value(concept: dict, keys: list[str]) -> str:
    for key in keys:
        value = concept.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _normalize_explanation_concepts(concepts: list[dict] | None) -> list[dict]:
    normalized = []
    for concept in concepts or []:
        if not isinstance(concept, dict):
            continue

        item = dict(concept)
        item["visual_link"] = _first_non_empty_value(item, [
            "visual_link",
            "image_link",
            "image_url",
            "visual_url",
            "visualLink",
            "imageLink",
            "imageUrl",
        ])
        item["wikipedia_link"] = _first_non_empty_value(item, [
            "wikipedia_link",
            "wiki_link",
            "wikipedia_url",
            "wiki_url",
            "wikipedia",
            "wiki",
            "wikipediaLink",
            "wikipediaUrl",
        ])
        normalized.append(item)
    return normalized


SUPPORTED_TRANSLATION_LANGS = ["hi", "ta", "te", "bn"]
CONCEPT_TRANSLATION_FIELDS = ["term", "definition", "example", "context"]


def _safe_lang_value(value: str | None, fallback: str = "") -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def _looks_like_untranslated_copy(source_text: str, candidate_text: str, lang: str) -> bool:
    if lang == "en":
        return False
    source = _safe_lang_value(source_text)
    candidate = _safe_lang_value(candidate_text)
    if not source or not candidate:
        return False
    if len(source) < 60:
        return False
    return source == candidate


def _fallback_translate_with_llm_batch(texts: dict[str, str], target_langs: list[str]) -> dict[str, dict[str, str]]:
    """
    Batch translate multiple texts for multiple languages in a single LLM call.
    texts: {text_id: text_content} where text_id should be string
    Returns: {text_id: {lang: translation}}
    """
    if not texts or not target_langs:
        return {key: {lang: "" for lang in target_langs} for key in texts.keys()}

    language_names = {
        "hi": "Hindi",
        "ta": "Tamil",
        "te": "Telugu",
        "bn": "Bengali",
    }
    target_names = [language_names.get(lang) for lang in target_langs if language_names.get(lang)]
    if not target_names:
        return {key: {lang: "" for lang in target_langs} for key in texts.keys()}

    # Ensure all keys are strings
    texts_str = {str(k): v for k, v in texts.items()}
    
    text_items = list(texts_str.items())
    prompt_parts = []
    for text_id, text in text_items:
        prompt_parts.append(f"TEXT_{text_id}:\n{text}")
    
    batch_text = "\n\n".join(prompt_parts)
    target_langs_str = ", ".join(target_names)

    try:
        response = azure_openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a translation engine. Translate texts into the requested target languages. "
                        "Preserve formulas, symbols, variable names, and technical terms where appropriate. "
                        'Return ONLY valid JSON in the format: {"TEXT_id": {"lang": "translation"}}'
                    ),
                },
                {
                    "role": "user",
                    "content": f"Translate all TEXT items below into: {target_langs_str}\n\n{batch_text}",
                },
            ],
            temperature=0,
            max_tokens=2000,
        )
        content = response.choices[0].message.content
        import json as json_module
        import re as re_module
        content = re_module.sub(r"```json|```", "", content).strip()
        result = json_module.loads(content)
        
        output = {key: {lang: "" for lang in target_langs} for key in texts_str.keys()}
        if isinstance(result, dict):
            for text_id, translations in result.items():
                # Handle both string and int keys, normalize to string
                text_id_str = str(text_id)
                if text_id_str in output and isinstance(translations, dict):
                    for lang in target_langs:
                        output[text_id_str][lang] = _safe_lang_value(translations.get(lang, ""))
        return output
    except Exception as exc:
        print(f"LLM batch translation fallback failed:", exc)
        return {key: {lang: "" for lang in target_langs} for key in texts_str.keys()}


def _translate_text_with_retry(
    text: str,
    *,
    to_langs: list[str],
    max_attempts: int = 3,
) -> dict[str, str]:
    """
    Simple translation with fallback to LLM for missing languages.
    Handles single text (used for large text fallback in _translate_values).
    """
    source_text = _safe_lang_value(text)
    if not source_text:
        return {lang: "" for lang in to_langs}

    translations = {lang: "" for lang in to_langs}
    
    # Try Azure Translator first
    for attempt in range(max_attempts):
        try:
            result = translate_text(source_text, to_langs=to_langs, from_lang="en")
        except Exception as exc:
            print(f"Translation attempt {attempt + 1} failed:", exc)
            result = {}

        for lang in to_langs:
            candidate = _safe_lang_value((result or {}).get(lang))
            if candidate and not _looks_like_untranslated_copy(source_text, candidate, lang):
                translations[lang] = candidate

        missing_langs = [lang for lang, value in translations.items() if not value]
        if not missing_langs:
            return translations
        to_langs = missing_langs

    # If still missing translations, use LLM fallback
    missing_langs_final = [lang for lang in to_langs if not translations.get(lang)]
    if missing_langs_final:
        try:
            fallback_results = _fallback_translate_with_llm_batch({"0": source_text}, missing_langs_final)
            for lang in missing_langs_final:
                fallback_text = _safe_lang_value(fallback_results.get("0", {}).get(lang, ""))
                if fallback_text and not _looks_like_untranslated_copy(source_text, fallback_text, lang):
                    translations[lang] = fallback_text
        except Exception as e:
            print(f"LLM fallback for {missing_langs_final} failed: {e}")
    
    return translations


def _translate_values(values: list[str], *, to_langs: list[str]) -> dict[str, list[str]]:
    """
    OPTIMIZED: Batch translate all values at once using tag-and-split approach.
    Instead of calling API N times (once per value), we batch all values and split results.
    """
    if not values:
        return {lang: [] for lang in to_langs}

    # Filter out empty values
    non_empty_values = [(i, v) for i, v in enumerate(values) if _safe_lang_value(v)]
    if not non_empty_values:
        return {lang: [""] * len(values) for lang in to_langs}

    # Tag each value with its index for later extraction
    tagged_text = "".join([f"<<<{idx}>>>{v}" for idx, v in non_empty_values])
    
    # Limit tag+value text to prevent API overload
    if len(tagged_text) > 4000:
        # Fall back to per-value translation if text is too large
        output = {lang: [""] * len(values) for lang in to_langs}
        for idx, value in non_empty_values:
            source_text = _safe_lang_value(value)
            translated = _translate_text_with_retry(source_text, to_langs=to_langs)
            for lang in to_langs:
                output[lang][idx] = _safe_lang_value(translated.get(lang))
        return output

    # Single batch translation call
    try:
        result = translate_text(tagged_text, to_langs=to_langs, from_lang="en")
    except Exception as exc:
        print(f"Batch translation failed: {exc}")
        result = {}

    output = {lang: [""] * len(values) for lang in to_langs}
    
    # Track which values got translated for each language
    missing_by_lang = {lang: {} for lang in to_langs}
    
    for lang in to_langs:
        raw = result.get(lang) or ""
        
        # Extract values using tag-based splitting
        import re as re_module
        segments = re_module.split(r'<<<\d+>>>', raw)
        
        segment_idx = 0
        for orig_idx, _ in non_empty_values:
            if segment_idx + 1 < len(segments):
                translated_text = segments[segment_idx + 1].strip()
                if translated_text and not _looks_like_untranslated_copy(
                    _safe_lang_value(values[orig_idx]), translated_text, lang
                ):
                    output[lang][orig_idx] = translated_text
                else:
                    # Mark as missing for fallback
                    missing_by_lang[lang][orig_idx] = values[orig_idx]
            else:
                missing_by_lang[lang][orig_idx] = values[orig_idx]
            segment_idx += 1

    # Batch LLM fallback for only missing translations
    for lang in to_langs:
        if missing_by_lang[lang]:
            try:
                fallback_results = _fallback_translate_with_llm_batch(missing_by_lang[lang], [lang])
                for orig_idx, text in missing_by_lang[lang].items():
                    fallback_text = _safe_lang_value(
                        fallback_results.get(str(orig_idx), {}).get(lang, "")
                    )
                    if fallback_text and not _looks_like_untranslated_copy(text, fallback_text, lang):
                        output[lang][orig_idx] = fallback_text
            except Exception as e:
                print(f"Batch fallback translation for {lang} failed: {e}")

    return output


def _normalize_main_pages(main_pages: list[dict] | None) -> list[dict]:
    normalized = []
    for index, page in enumerate(main_pages or [], start=1):
        if not isinstance(page, dict):
            continue
        item = dict(page)
        item["page"] = int(item.get("page") or index)
        item["explanation"] = _first_non_empty_value(item, [
            "explanation",
            "explanation_en",
            "text",
        ])
        item["explanation_hi_en"] = _first_non_empty_value(item, [
            "explanation_hi_en",
            "explanation_hie_en",
            "explanation_hin_en",
            "explanation_hi",
            "explanation",
            "explanation_en",
        ])
        for lang in SUPPORTED_TRANSLATION_LANGS:
            item[f"explanation_{lang}"] = _first_non_empty_value(item, [
                f"explanation_{lang}",
            ])
        normalized.append(item)
    return normalized


def _normalize_structured_translations(explanation_structured: dict | None) -> dict:
    structured = explanation_structured if isinstance(explanation_structured, dict) else {}
    normalized = {
        "meta": structured.get("meta", {}) if isinstance(structured.get("meta"), dict) else {},
        "main": _normalize_main_pages(structured.get("main", [])),
        "concepts": [],
    }

    concepts = _normalize_explanation_concepts(structured.get("concepts", []))
    for concept in concepts:
        item = dict(concept)
        for field in CONCEPT_TRANSLATION_FIELDS:
            item[field] = _first_non_empty_value(item, [field, f"{field}_en"])
            item[f"{field}_hi_en"] = _first_non_empty_value(item, [
                f"{field}_hi_en",
                f"{field}_hie_en",
                f"{field}_hin_en",
                f"{field}_hi",
                field,
                f"{field}_en",
            ])
            for lang in SUPPORTED_TRANSLATION_LANGS:
                item[f"{field}_{lang}"] = _first_non_empty_value(item, [f"{field}_{lang}"])
        normalized["concepts"].append(item)
    return normalized


def _populate_structured_translations(explanation_structured: dict | None) -> dict:
    """
    OPTIMIZED: Batch translate all pages and concepts at once.
    """
    structured = _normalize_structured_translations(explanation_structured)

    pages = structured.get("main", [])
    if pages:
        page_texts = [page.get("explanation", "") for page in pages]
        page_translations = _translate_values(page_texts, to_langs=SUPPORTED_TRANSLATION_LANGS)
        for idx, page in enumerate(pages):
            for lang in SUPPORTED_TRANSLATION_LANGS:
                if not page.get(f"explanation_{lang}"):
                    page[f"explanation_{lang}"] = page_translations.get(lang, [""] * len(pages))[idx]

    concepts = structured.get("concepts", [])
    if concepts:
        # Batch translate all concept fields at once
        for field in CONCEPT_TRANSLATION_FIELDS:
            field_values = [concept.get(field, "") for concept in concepts]
            translated = _translate_values(field_values, to_langs=SUPPORTED_TRANSLATION_LANGS)
            for idx, concept in enumerate(concepts):
                for lang in SUPPORTED_TRANSLATION_LANGS:
                    key = f"{field}_{lang}"
                    if not concept.get(key):
                        concept[key] = translated.get(lang, [""] * len(concepts))[idx]

    return structured


def _structured_translations_missing(explanation_structured: dict | None) -> bool:
    structured = _normalize_structured_translations(explanation_structured)

    for page in structured.get("main", []):
        if not _safe_lang_value(page.get("explanation")):
            continue
        for lang in SUPPORTED_TRANSLATION_LANGS:
            if not _safe_lang_value(page.get(f"explanation_{lang}")):
                return True

    for concept in structured.get("concepts", []):
        for field in CONCEPT_TRANSLATION_FIELDS:
            if not _safe_lang_value(concept.get(field)):
                continue
            for lang in SUPPORTED_TRANSLATION_LANGS:
                if not _safe_lang_value(concept.get(f"{field}_{lang}")):
                    return True

    return False


def _ensure_translations_present(explanation_structured: dict | None) -> dict:
    """
    Only populate missing translations. If stored translations already exist,
    keep this path read-only so GET requests do not re-trigger translator usage.
    """
    structured = _normalize_structured_translations(explanation_structured)
    if not _structured_translations_missing(structured):
        return structured
    return _populate_structured_translations(structured)


def _combine_main_explanations(explanation_structured: dict | None, lang_key: str) -> str:
    structured = _normalize_structured_translations(explanation_structured)
    field = "explanation_hi_en" if lang_key == "hi_en" else (
        "explanation" if lang_key == "en" else f"explanation_{lang_key}"
    )
    pages = []
    for page in structured.get("main", []):
        text = page.get(field) or page.get("explanation") or ""
        if text:
            pages.append(f"Page {page.get('page')}:\n{text}")
    return "\n\n".join(pages)


def _explanation_translation_map(explanation_structured: dict | None) -> dict:
    structured = _normalize_structured_translations(explanation_structured)
    english_text = _combine_main_explanations(structured, "en")
    hi_en_text = _combine_main_explanations(structured, "hi_en") or english_text
    return {
        "en": english_text,
        "hi_en": hi_en_text,
        "hi": _combine_main_explanations(structured, "hi") or english_text,
        "ta": _combine_main_explanations(structured, "ta") or english_text,
        "te": _combine_main_explanations(structured, "te") or english_text,
        "bn": _combine_main_explanations(structured, "bn") or english_text,
    }


def _audio_text_map(explanation_structured: dict | None) -> dict:
    translations = _explanation_translation_map(explanation_structured)
    return {
        "en": translations.get("en", ""),
        "hi_en": translations.get("hi") or translations.get("hi_en") or translations.get("en", ""),
        "hi": translations.get("hi") or translations.get("en", ""),
        "ta": translations.get("ta") or translations.get("en", ""),
        "te": translations.get("te") or translations.get("en", ""),
        "bn": translations.get("bn") or translations.get("en", ""),
    }


def _register_note_read(note: dict) -> dict:
    note_id = note.get("id")
    if not note_id:
        return note

    now = datetime.datetime.utcnow().isoformat()
    now_dt = datetime.datetime.fromisoformat(now)
    view_count = int(note.get("view_count", 0) or 0)
    next_view_count = view_count + 1
    view_events = list(note.get("view_events", []) or [])
    view_events.append(now)
    last_viewed_at = note.get("last_viewed_at")
    last_reread_tracked_at = note.get("last_reread_tracked_at")
    should_track_reread = view_count >= 1
    if should_track_reread and last_viewed_at:
        try:
            last_viewed_dt = datetime.datetime.fromisoformat(last_viewed_at)
            if (now_dt - last_viewed_dt).total_seconds() < 60:
                should_track_reread = False
        except Exception:
            pass
    if should_track_reread and last_reread_tracked_at:
        try:
            last_reread_dt = datetime.datetime.fromisoformat(last_reread_tracked_at)
            if (now_dt - last_reread_dt).total_seconds() < 60:
                should_track_reread = False
        except Exception:
            pass

    update_note(note_id, {
        "view_count": next_view_count,
        "last_viewed_at": now,
        "view_events": view_events[-200:],
    })

    if note.get("user_id"):
        try:
            signals = get_signals(note["user_id"]) or {
                "id": f"signals_{note['user_id']}",
                "user_id": note["user_id"],
                "notes_viewed": 0,
            }
            signals["notes_viewed"] = int(signals.get("notes_viewed", 0) or 0) + 1
            upsert_signals_document(signals)
        except Exception as exc:
            print(f"[READ TRACK] notes_viewed update failed: {exc}")

    if should_track_reread and note.get("user_id"):
        try:
            merge_signals(note["user_id"], {
                "reread_count": 1,
                "reread_at": now,
            })
            signals = get_signals(note["user_id"]) or {
                "id": f"signals_{note['user_id']}",
                "user_id": note["user_id"],
                "explanation_events": [],
            }
            explanation_events = list(signals.get("explanation_events", []))
            explanation_events.append({
                "type": "explanation_revisit",
                "occurred_at": now,
                "note_id": note_id,
            })
            signals["explanation_events"] = explanation_events[-500:]
            upsert_signals_document(signals)
            update_note(note_id, {"last_reread_tracked_at": now})
        except Exception as exc:
            print(f"[READ TRACK] reread merge failed: {exc}")

    return get_note(note_id) or note


def _unsafe_note_payload(exc: UnsafeContentError) -> dict:
    return {
        "processing_status": "blocked",
        "error_code": "unsafe_content",
        "error": exc.message,
        "user_message": exc.message,
        "moderation_details": exc.details,
    }


def _make_uniform_preview(file_bytes: bytes, filename: str, note_id: str) -> str | None:
    is_pdf = filename.lower().endswith(".pdf")

    try:
        if is_pdf:
            with fitz.open(stream=file_bytes, filetype="pdf") as doc:
                if doc.page_count == 0:
                    return None
                page = doc.load_page(0)
                pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
                source = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        else:
            source = Image.open(io.BytesIO(file_bytes)).convert("RGB")

        source = ImageOps.exif_transpose(source)
        target_w, target_h = PREVIEW_SIZE

        scale = max(target_w / source.width, target_h / source.height)
        new_size = (int(source.width * scale), int(source.height * scale))
        resized = source.resize(new_size, Image.Resampling.LANCZOS)

        left = (resized.width - target_w) // 2
        top  = (resized.height - target_h) // 2
        final = resized.crop((left, top, left + target_w, top + target_h))

        output = io.BytesIO()
        final.save(output, format="JPEG", quality=PREVIEW_QUALITY, optimize=True, progressive=True)
        output.seek(0)
        return upload_image_bytes(output.getvalue(), f"{note_id}_preview.jpg")

    except Exception as e:
        print("Preview generation failed:", e)
        return None


def _finalize_note_outputs(
    note_id: str,
    explanation_structured: dict,
    structured_content: dict,
    extracted_text: str,
    target_lang: str,
    user_id: str | None = None,
    confusion_scores: list | None = None,
    mean_confusion: float = 0.5,
    overall_confusion: str = "medium",
    heatmap_url: str | None = None,
    heatmap_urls: list | None = None,
    llm_stress_signal: float = 0.0,
    llm_confusion_keywords: float = 0,
):
    heatmap_urls = heatmap_urls or []
    confusion_scores = confusion_scores or []
    explanation_structured = _ensure_translations_present(
        explanation_structured,
    )

    update_note(note_id, {
        "processing_status": "processed",
        "extracted_text": extracted_text,
        "structured_content": structured_content,
        "explanation_structured": explanation_structured,
        "confusion_scores": confusion_scores,
        "mean_confusion": mean_confusion,
        "overall_confusion": overall_confusion,
        "heatmap_url": heatmap_url,
        "heatmap_urls": heatmap_urls,
        "has_heatmap": bool(heatmap_url or heatmap_urls),
        "llm_stress_signal": llm_stress_signal,
        "llm_confusion_keywords": llm_confusion_keywords,
    })

    if user_id:
        try:
            _update_dna(user_id, mean_confusion)
        except Exception as e:
            print(f"[DNA] update failed: {e}")


def process_ocr(note_id: str, file_url: str, file_bytes: bytes, user_id: str = None, filename: str = "", custom_prompt: str = None):
    is_pdf = filename.lower().endswith(".pdf")

    try:
        if is_pdf:
            with tempfile.TemporaryDirectory(prefix=f"note_{note_id}_") as temp_dir:
                temp_path = str(Path(temp_dir) / "upload.pdf")
                pages_dir = str(Path(temp_dir) / "pages")

                with open(temp_path, "wb") as f:
                    f.write(file_bytes)

                pages       = pdf_to_images(temp_path, output_dir=pages_dir)
                ocr_results = ocr_multiple_pages(pages)

                pdf_heatmap_bytes_list = []
                for page_result in ocr_results:
                    page_path  = page_result.get("path")
                    page_paras = page_result.get("paragraphs", [])
                    if page_path and page_paras:
                        try:
                            with open(page_path, "rb") as f:
                                page_bytes = f.read()
                            hm = _draw_heatmap_from_ocr(page_bytes, page_paras)
                            if hm:
                                pdf_heatmap_bytes_list.append({
                                    "page" : page_result["page"],
                                    "bytes": hm,
                                })
                        except Exception as e:
                            print(f"[HEATMAP] page {page_result['page']} failed: {e}")

            extracted_text = "\n\n".join(
                [f"Page {p['page']}:\n{p['text']}" for p in ocr_results]
            )

            pdf_paragraphs = []
            for page_result in ocr_results:
                for paragraph in page_result.get("paragraphs", []):
                    paragraph_text = paragraph.get("text", "")
                    if not paragraph_text:
                        continue
                    pdf_paragraphs.append({
                        "text"           : f"[Page {page_result['page']}] {paragraph_text}",
                        "confidence"     : paragraph.get("confidence", 0),
                        "confusion_score": paragraph.get("confusion_score", 0.5),
                        "confusion_label": paragraph.get("confusion_label", "medium"),
                        "confusion_color": paragraph.get("confusion_color", "#FFB300"),
                        "bbox"           : paragraph.get("bbox"),
                    })

            structured_content = {
                "paragraphs"    : pdf_paragraphs,
                "equations"     : [],
                "bilingual_lines": [],
            }
            note        = get_note(note_id)
            target_lang = note.get("language", "en")

            explanation_structured, llm_stress_signal, llm_confusion_keywords = generate_explanation(
                ocr_results, custom_prompt=custom_prompt
            )

        else:
            structured_content = extract_text_from_image(file_url)
            paragraphs         = structured_content.get("paragraphs", [])
            extracted_text     = "\n".join([p.get("text", "") for p in paragraphs])

            note        = get_note(note_id)
            target_lang = note.get("language", "en")

            explanation_structured, llm_stress_signal, llm_confusion_keywords = generate_explanation([
                {"page": 1, "text": extracted_text}
            ], custom_prompt=custom_prompt)

    except UnsafeContentError as e:
        print("OCR blocked by safety policy:", e)
        update_note(note_id, _unsafe_note_payload(e))
        return
    except Exception as e:
        print("OCR/Explanation failed:", e)
        update_note(note_id, {
            "processing_status": "blocked",
            "error_code"       : "processing_failed",
            "error"            : str(e),
        })
        return

    # ── Heatmap ───────────────────────────────────────────────
    heatmap_url       = None
    heatmap_urls      = []
    confusion_scores  = []
    mean_confusion    = 0.5
    overall_confusion = "medium"

    paragraphs_all   = structured_content.get("paragraphs", [])
    confusion_scores = [p.get("confusion_score", 0.5) for p in paragraphs_all]
    if confusion_scores:
        mean_confusion    = round(sum(confusion_scores) / len(confusion_scores), 4)
        overall_confusion = _score_to_label(mean_confusion)

    # FIX: Upload all heatmaps BEFORE finalization
    if is_pdf:
        for item in pdf_heatmap_bytes_list:
            try:
                url = upload_image_bytes(
                    item["bytes"],
                    filename=f"{note_id}_heatmap_page{item['page']}.jpg"
                )
                heatmap_urls.append({"page": item["page"], "url": url})
                if item["page"] == 1:
                    heatmap_url = url
                print(f"[HEATMAP] page {item['page']} uploaded: {url}")
            except Exception as e:
                print(f"[HEATMAP] page {item['page']} upload failed: {e}")
    else:
        try:
            heatmap_bytes = _draw_heatmap_from_ocr(file_bytes, paragraphs_all)
            if heatmap_bytes:
                heatmap_url = upload_image_bytes(
                    heatmap_bytes,
                    filename=f"{note_id}_heatmap.jpg"
                )
                print(f"[HEATMAP] uploaded: {heatmap_url}")
        except Exception as e:
            print(f"[HEATMAP] failed: {e}")

    # ── Translations ──────────────────────────────────────────
    # Translate the combined explanation text for the top-level note fields
    page_explanations = explanation_structured.get("main", [])

    def _page_hi_text(p):
        return p.get("explanation_hi_en") or p.get("explanation") or ""

    explanation_text = "\n\n".join([
        f"Page {p.get('page')}:\n{p.get('explanation') or ''}"
        for p in page_explanations
    ])

    try:
        explanation_structured = _ensure_translations_present(explanation_structured)
        translations = _explanation_translation_map(explanation_structured)
        if target_lang == "hi-en":
            explanation_text_hi_en = "\n\n".join([
                f"Page {p.get('page')}:\n{_page_hi_text(p)}"
                for p in page_explanations
            ])
            if explanation_text_hi_en and explanation_text_hi_en.strip():
                translations["hi_en"] = explanation_text_hi_en
                translations["hi"] = translations.get("hi") or explanation_text_hi_en
    except Exception as e:
        print("Translation preparation failed:", e)
        translations = {"en": explanation_text[:3000], "hi_en": explanation_text[:3000], "hi": "", "ta": "", "te": "", "bn": ""}

    # ── Translate concepts ────────────────────────────────────
    explanation_structured = _normalize_structured_translations(explanation_structured)

    # ── Finalized Save to Cosmos ──────────────────────────────
    update_note(note_id, {
        "processing_status"     : "processed",
        "extracted_text"        : extracted_text,
        "structured_content"    : structured_content,
        "explanation_structured": explanation_structured,
        "explanation_en"        : translations.get("en"),
        "explanation_hi_en"     : translations.get("hi_en"),
        "explanation_hi"        : translations.get("hi"),
        "explanation_ta"        : translations.get("ta"),
        "explanation_te"        : translations.get("te"),
        "explanation_bn"        : translations.get("bn"),
        "confusion_scores"      : confusion_scores,
        "mean_confusion"        : mean_confusion,
        "overall_confusion"     : overall_confusion,
        "heatmap_url"           : heatmap_url,
        "heatmap_urls"          : heatmap_urls, # Now contains all 3 pages
        "llm_stress_signal"     : llm_stress_signal,
        "llm_confusion_keywords": llm_confusion_keywords,
    })

    if user_id:
        try:
            _update_dna(user_id, mean_confusion)
        except Exception as e:
            print(f"[DNA] update failed: {e}")

    # Final wrap-up
    _finalize_note_outputs(
        note_id=note_id,
        explanation_structured=explanation_structured,
        structured_content=structured_content,
        extracted_text=extracted_text,
        target_lang=target_lang,
        user_id=user_id,
        confusion_scores=confusion_scores,
        mean_confusion=mean_confusion,
        overall_confusion=overall_confusion,
        heatmap_url=heatmap_url,
        heatmap_urls=heatmap_urls,
        llm_stress_signal=llm_stress_signal,
        llm_confusion_keywords=llm_confusion_keywords,
    )
    return


def process_prompt_note(note_id: str, user_id: str | None = None, custom_prompt: str = "", language: str = "hi-en"):
    prompt_text = (custom_prompt or "").strip()
    if not prompt_text:
        update_note(note_id, {
            "processing_status": "blocked",
            "error_code": "missing_custom_prompt",
            "error": "Custom prompt is required.",
            "user_message": "Custom prompt is required.",
        })
        return

    try:
        explanation_structured, llm_stress_signal, llm_confusion_keywords = generate_explanation(
            [{"page": 1, "text": prompt_text}],
            custom_prompt=prompt_text,
            language=language,
        )
    except Exception as e:
        print("Prompt explanation generation failed:", e)
        update_note(note_id, {
            "processing_status": "blocked",
            "error_code": "processing_failed",
            "error": str(e),
        })
        return

    _finalize_note_outputs(
        note_id=note_id,
        explanation_structured=explanation_structured,
        structured_content={
            "paragraphs": [],
            "equations": [],
            "bilingual_lines": [],
        },
        extracted_text="",
        target_lang=language,
        user_id=user_id,
        confusion_scores=[],
        mean_confusion=0.0,
        overall_confusion="clean",
        heatmap_url=None,
        heatmap_urls=[],
        llm_stress_signal=llm_stress_signal,
        llm_confusion_keywords=llm_confusion_keywords,
    )


def _draw_heatmap_from_ocr(image_bytes: bytes, paragraphs: list):
    import cv2
    import numpy as np

    nparr  = np.frombuffer(image_bytes, np.uint8)
    image  = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        return None

    img_h, img_w = image.shape[:2]
    result       = image.copy()

    COLOR_MAP = {
        "clean"   : (80, 233, 67),
        "medium"  : (0, 179, 255),
        "confused": (79, 79, 255),
    }

    drawn = 0
    for para in paragraphs:
        bbox  = para.get("bbox")
        label = para.get("confusion_label", "medium")

        if not bbox:
            continue

        x = int(bbox["x"])
        y = int(bbox["y"])
        w = int(bbox["width"])
        h = int(bbox["height"])

        if w < 20 or h < 5:
            continue

        x = max(0, min(x, img_w - 1))
        y = max(0, min(y, img_h - 1))
        w = min(w, img_w - x)
        h = min(h, img_h - y)

        color   = COLOR_MAP.get(label, COLOR_MAP["medium"])
        overlay = result.copy()
        cv2.rectangle(overlay, (x, y), (x + w, y + h), color, -1)
        result = cv2.addWeighted(overlay, 0.28, result, 0.72, 0)
        cv2.rectangle(result, (x, y), (x + w, y + h), color, 1)
        drawn += 1

    print(f"[HEATMAP] drew {drawn} regions")

    _, buf = cv2.imencode(".jpg", result, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return buf.tobytes()


def _has_meaningful_text(text: str) -> bool:
    if not text:
        return False
    stripped = re.sub(r"Page\s+\d+:\s*", "", text, flags=re.IGNORECASE)
    return bool(stripped.strip())


def _predict_and_store_dna(user_id: str) -> dict:
    snapshot = build_predict_params_for_user(user_id, touch_session=False)
    dna_signals = dict(snapshot.get("dna_params") or {})
    result = predict_dna(dna_signals)
    payload = {
        "user_id": user_id,
        "profile": result.profile,
        "emoji": result.emoji,
        "color": result.color,
        "tagline": result.tagline,
        "strengths": result.strengths,
        "tips": result.tips,
        "probabilities": result.probabilities,
        "confidence": result.confidence,
        "is_beginner": result.is_beginner,
        "top_features": result.top_features,
        "signals_used": dna_signals,
        "updated_at": datetime.datetime.utcnow().isoformat(),
    }
    upsert_study_dna(user_id, payload)
    return payload


def _update_dna(user_id: str, mean_confusion: float):
    """Refresh stored DNA prediction from the shared persisted signal snapshot."""
    try:
        payload = _predict_and_store_dna(user_id)
        print(f"[DNA] profile={payload.get('profile')} confidence={float(payload.get('confidence', 0.0) or 0.0):.0%}")
    except Exception as e:
        print(f"[DNA] _update_dna failed: {e}")




@router.post("/upload")
async def upload_note(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    signals: str = Form(None),
    subject: str = Form("General"),
    topic: str = Form(None),
    language: str = Form("hi-en"),
    custom_prompt: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["user_id"] if current_user else None
    file_bytes = await file.read()
    file.file = io.BytesIO(file_bytes)

    file_type = file.filename.lower()
    note_id   = str(uuid.uuid4())

    try:
        import json
        user_signals = json.loads(signals) if signals else {}
    except Exception:
        user_signals = {}

    try:
        validate_upload_bytes_or_raise(file_bytes, file.filename)
    except UnsafeContentError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "message": exc.message,
                "error_code": "unsafe_content",
                "moderation_details": exc.details,
            },
        ) from exc

    preview_url = _make_uniform_preview(file_bytes, file.filename, note_id)

    create_note({
        "id"              : note_id,
        "file_name"       : file.filename,
        "image_url"       : None,
        "preview_url"     : preview_url,
        "user_id"         : user_id,
        "processing_status": "processing",
        "source_mode"     : "upload",
        "has_source_file" : True,
        "has_heatmap"     : False,
        "created_at"      : datetime.datetime.utcnow().isoformat(),
        "subject"         : subject,
        "topic"           : topic,
        "language"        : language,
        "custom_prompt"   : custom_prompt,
        "user_message"    : custom_prompt,
        "file_type"       : "pdf" if file_type.endswith(".pdf") else "image",
        "audio_replays"   : user_signals.get("audio_replays", 0),
        "quiz_attempts"   : user_signals.get("quiz_attempts", 0),
        "avg_quiz_score"  : user_signals.get("avg_quiz_score", 50),
        "notes_viewed"    : user_signals.get("notes_viewed", 0),
        "days_since_last" : user_signals.get("days_since_last", 1),
        "total_study_minutes": user_signals.get("total_study_minutes", 0),
    })
    if user_id:
        record_subject_activity(user_id, subject)

    file_url = upload_image(file)
    update_note(note_id, {
        "image_url"        : file_url,
        "processing_status": "processing",
    })

    # ── Persist signals to Cosmos immediately on upload ───────
    if user_id and user_signals:
        try:
            merge_signals(user_id, {
                "audio_replays"       : user_signals.get("audio_replays", 0),
                "quiz_attempts"       : user_signals.get("quiz_attempts", 0),
                "avg_quiz_score"      : user_signals.get("avg_quiz_score", 50),
                "notes_viewed"        : user_signals.get("notes_viewed", 0),
                "heatmap_views"       : user_signals.get("heatmap_views", 0),
                "red_zone_clicks"     : user_signals.get("red_zone_clicks", 0),
                "login_streak"        : user_signals.get("login_streak", 0),
                "days_since_last"     : user_signals.get("days_since_last", 1),
                "total_study_minutes" : user_signals.get("total_study_minutes", 0),
                "quiz_retry_rate"     : user_signals.get("quiz_retry_rate", 0.0),
                "quiz_improvement"    : user_signals.get("quiz_improvement", 0.0),
                "time_on_explanation" : user_signals.get("time_on_explanation", 0.0),
            })
            print(f"[SIGNALS] merged for user {user_id}")
        except Exception as e:
            print(f"[SIGNALS] merge failed: {e}")

    background_tasks.add_task(
        process_ocr, note_id, file_url, file_bytes, user_id, file.filename, custom_prompt
    )

    return {
        "note_id"   : note_id,
        "image_url" : file_url,
        "preview_url": preview_url,
        "file_type" : "pdf" if file_type.endswith(".pdf") else "image",
        "status"    : "processing",
    }


@router.post("/prompt")
async def create_prompt_note(
    body: PromptExplanationRequest,
    current_user: dict = Depends(get_current_user),
):
    custom_prompt = (body.custom_prompt or "").strip()
    if not custom_prompt:
        raise HTTPException(status_code=400, detail="Custom prompt is required")

    user_id = current_user["user_id"] if current_user else None
    note_id = str(uuid.uuid4())
    user_signals = body.signals or {}

    create_note({
        "id": note_id,
        "file_name": None,
        "image_url": None,
        "preview_url": None,
        "user_id": user_id,
        "processing_status": "processing",
        "source_mode": "prompt",
        "has_source_file": False,
        "has_heatmap": False,
        "created_at": datetime.datetime.utcnow().isoformat(),
        "subject": body.subject or "General",
        "topic": body.topic,
        "language": body.language or "hi-en",
        "custom_prompt": custom_prompt,
        "user_message": custom_prompt,
        "file_type": "text",
        "extracted_text": "",
        "structured_content": {
            "paragraphs": [],
            "equations": [],
            "bilingual_lines": [],
        },
        "heatmap_url": None,
        "heatmap_urls": [],
        "audio_replays": user_signals.get("audio_replays", 0),
        "quiz_attempts": user_signals.get("quiz_attempts", 0),
        "avg_quiz_score": user_signals.get("avg_quiz_score", 50),
        "notes_viewed": user_signals.get("notes_viewed", 0),
        "days_since_last": user_signals.get("days_since_last", 1),
        "total_study_minutes": user_signals.get("total_study_minutes", 0),
    })
    if user_id:
        record_subject_activity(user_id, body.subject or "General")

    if user_id and user_signals:
        try:
            merge_signals(user_id, {
                "audio_replays": user_signals.get("audio_replays", 0),
                "quiz_attempts": user_signals.get("quiz_attempts", 0),
                "avg_quiz_score": user_signals.get("avg_quiz_score", 50),
                "notes_viewed": user_signals.get("notes_viewed", 0),
                "heatmap_views": user_signals.get("heatmap_views", 0),
                "red_zone_clicks": user_signals.get("red_zone_clicks", 0),
                "login_streak": user_signals.get("login_streak", 0),
                "days_since_last": user_signals.get("days_since_last", 1),
                "total_study_minutes": user_signals.get("total_study_minutes", 0),
                "quiz_retry_rate": user_signals.get("quiz_retry_rate", 0.0),
                "quiz_improvement": user_signals.get("quiz_improvement", 0.0),
                "time_on_explanation": user_signals.get("time_on_explanation", 0.0),
            })
        except Exception as e:
            print(f"[SIGNALS] prompt merge failed: {e}")

    process_prompt_note(
        note_id,
        user_id,
        custom_prompt,
        body.language or "hi-en",
    )

    note = get_note(note_id) or {}

    return {
        "note_id": note_id,
        "image_url": None,
        "preview_url": None,
        "file_type": "text",
        "status": note.get("processing_status", "processing"),
    }


@router.get("/")
def list_notes(current_user: dict = Depends(get_current_user)):
    if current_user:
        notes = get_notes_by_user(current_user["user_id"])
    else:
        notes = get_all_notes()

    filtered_notes = [
        n for n in notes
        if n.get("processing_status") != "blocked"
    ]

    return [
        {
            "note_id": n["id"],
            "status" : n.get("processing_status", "processing"),
            "subject": n.get("subject", "General"),
            "language": n.get("language", "hi-en"),
            "file_name": n.get("file_name"),
            "topic": (
                ", ".join(n.get("concepts", []))
                if isinstance(n.get("concepts"), list) and n.get("concepts")
                else (
                    ", ".join([
                        c.get("term")
                        for c in (n.get("explanation_structured", {}) or {}).get("concepts", [])
                        if c.get("term")
                    ])
                    if n.get("explanation_structured")
                    else None
                )
            ),
            "preview_url"     : n.get("preview_url"),
            "file_type"       : n.get("file_type", "image"),
            "heatmap_url"     : n.get("heatmap_url"),
            "source_mode"     : n.get("source_mode", "upload"),
            "has_source_file" : n.get("has_source_file", bool(n.get("image_url"))),
            "has_heatmap"     : n.get("has_heatmap", bool(n.get("heatmap_url") or n.get("heatmap_urls"))),
            "mean_confusion"  : n.get("mean_confusion"),
            "overall_confusion": n.get("overall_confusion"),
            "created_at"      : n.get("created_at"),
        }
        for n in filtered_notes
    ]




@router.get("/dna/{user_id}")
def get_dna(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"] if current_user else (user_id or DEFAULT_USER_ID)
    try:
        return _predict_and_store_dna(user_id)
    except Exception as exc:
        print(f"[DNA] live refresh failed: {exc}")
        dna = get_study_dna(user_id)
        if dna:
            return dna
        return {
            "user_id"      : user_id,
            "profile"      : BEGINNER_PROFILE["profile"],
            "emoji"        : BEGINNER_PROFILE["emoji"],
            "color"        : BEGINNER_PROFILE["color"],
            "tagline"      : BEGINNER_PROFILE["tagline"],
            "strengths"    : BEGINNER_PROFILE["strengths"],
            "tips"         : BEGINNER_PROFILE["tips"],
            "probabilities": BEGINNER_PROFILE["probabilities"],
            "confidence"   : 0.0,
            "is_beginner"  : True,
            "top_features" : {},
            "signals_used" : {},
        }

def _score_to_label(score: float) -> str:
    if score < 0.30: return "clean"
    if score < 0.70: return "medium"
    return "confused"

class StressRequest(BaseModel):
    user_id: str
    days_to_exam: float = 30
    avg_quiz_score: float = 50.0
    confusion_score_today: float = 0.5
    days_since_last_break: float = 1
    total_study_minutes: float = 0
    night_sessions: float = 0
    pending_subjects_count: float = 0
    heatmap_red_regions: float = 0
    notes_uploaded_today: float = 0
    sessions_count: float = 0
    early_morning_sessions: float = 0
    reread_count: float = 0
    avg_session_gap_hours: float = 4.0
    quiz_attempts_today: float = 0


class WellnessPredictParamsOverrideRequest(BaseModel):
    clear_existing: bool = False
    days_to_exam: float | None = None
    pending_subjects_count: float | None = None
    subjects_active_today: float | None = None
    total_study_minutes: float | None = None
    study_minutes_vs_7day_avg: float | None = None
    sessions_count: float | None = None
    night_sessions: float | None = None
    early_morning_sessions: float | None = None
    days_since_last_break: float | None = None
    notes_uploaded_today: float | None = None
    total_notes_uploaded: float | None = None
    reread_count: float | None = None
    avg_quiz_score: float | None = None
    quiz_attempts_today: float | None = None
    quiz_difficulty_drop: float | None = None
    quiz_avg_time_per_question: float | None = None
    quiz_correct_streak_broken: float | None = None
    quiz_llm_stress_signal: float | None = None
    quiz_llm_confusion_keywords: float | None = None
    confusion_score_today: float | None = None
    heatmap_red_ratio: float | None = None
    max_page_confusion_score: float | None = None
    unvisited_topic_ratio: float | None = None
    stale_constellation_topics: float | None = None
    chatbot_questions_today: float | None = None
    repeated_question_ratio: float | None = None
    chatbot_llm_stress_signal: float | None = None
    chatbot_llm_confusion_keywords: float | None = None
    explanation_revisit_count: float | None = None
    explanation_llm_stress_signal: float | None = None
    explanation_llm_confusion_keywords: float | None = None
    translation_used: float | None = None
    audio_playback_loops: float | None = None
    upload_modalities_today: float | None = None


def _resolve_stress_snapshot(
    user_id: str,
    *,
    fallback_signals: dict | None = None,
) -> tuple[dict | None, dict]:
    try:
        user_exists = bool(user_id and get_user_by_id(user_id))
        if user_exists:
            snapshot = build_predict_params_for_user(user_id, touch_session=False)
            signals = dict(snapshot.get("predict_params") or {})
            stored_signals = get_signals(user_id) or {}
            overrides = stored_signals.get("stress_predict_overrides") or {}
            if isinstance(overrides, dict):
                valid_overrides = {
                    key: float(value)
                    for key, value in overrides.items()
                    if key in STRESS_FEATURES
                }
                signals.update(valid_overrides)
            return snapshot, signals
    except Exception as exc:
        print(f"[STRESS SNAPSHOT] Falling back to request signals: {exc}")

    signals = dict(fallback_signals or {})
    signals.pop("user_id", None)
    return None, signals


def _run_stress_assessment(
    user_id: str,
    *,
    fallback_signals: dict | None = None,
) -> dict:
    snapshot, signals = _resolve_stress_snapshot(user_id, fallback_signals=fallback_signals)
    result = predict_stress(signals)
    checked_at = datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc).isoformat()

    return {
        "snapshot": snapshot,
        "signals": signals,
        "result": result,
        "checked_at": checked_at,
        "current_assessment": {
            "checked_at": checked_at,
            "stress_score": result.stress_score,
            "stress_label": result.risk_level,
            "stress_alert": result.alert_needed,
            "top_stressor": result.top_stressor,
            "wellness_message": result.wellness_message,
        },
    }


def _parse_stress_log_time(entry: dict) -> datetime.datetime | None:
    checked_at_raw = entry.get("checked_at") or entry.get("created_at")
    if not checked_at_raw:
        return None
    try:
        parsed = datetime.datetime.fromisoformat(
            str(checked_at_raw).replace("Z", "+00:00")
        )
    except Exception:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed.astimezone(datetime.timezone.utc)


def _dedupe_stress_logs(logs: list[dict]) -> list[dict]:
    ordered_logs = sorted(
        (entry for entry in (logs or []) if isinstance(entry, dict)),
        key=lambda entry: (
            _parse_stress_log_time(entry)
            or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
            int(entry.get("_ts", 0) or 0),
        ),
    )

    deduped: list[dict] = []
    for entry in ordered_logs:
        entry_time = _parse_stress_log_time(entry)
        if entry_time is None:
            continue

        if deduped:
            previous_time = _parse_stress_log_time(deduped[-1])
            if previous_time and entry_time - previous_time < STRESS_LOG_MIN_INTERVAL:
                deduped[-1] = entry
                continue

        deduped.append(entry)

    return deduped[-1000:]


def _should_insert_stress_log(latest_log: dict | None, checked_at: str) -> bool:
    latest_time = _parse_stress_log_time(latest_log or {})
    current_time = _parse_stress_log_time({"checked_at": checked_at})
    if current_time is None:
        return False
    if latest_time is None:
        return True
    return current_time - latest_time >= STRESS_LOG_MIN_INTERVAL


def _build_stress_history(logs: list[dict], fallback_score: float) -> dict:
    local_tz = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
    raw_points: list[dict] = []

    deduped_logs = _dedupe_stress_logs(logs)

    for entry in deduped_logs:
        checked_at_utc = _parse_stress_log_time(entry)
        if checked_at_utc is None:
            continue
        checked_at = checked_at_utc.astimezone(local_tz)

        raw_points.append({
            "id": entry.get("id"),
            "day": checked_at.strftime("%a"),
            "label": checked_at.strftime("%d %b"),
            "time": checked_at.strftime("%I:%M %p"),
            "score": round(float(entry.get("stress_score", fallback_score) or fallback_score), 2),
            "checked_at": checked_at.isoformat(),
            "_checked_at": checked_at,
        })
    raw_points = raw_points[-1000:]

    if not raw_points:
        now_local = datetime.datetime.now(local_tz)
        fallback_point = {
            "id": "current",
            "day": now_local.strftime("%a"),
            "label": now_local.strftime("%d %b"),
            "time": now_local.strftime("%I:%M %p"),
            "score": round(float(fallback_score), 2),
            "checked_at": now_local.isoformat(),
            "_checked_at": now_local,
        }
        raw_points = [fallback_point]

    start_at = raw_points[0]["_checked_at"]
    end_at = raw_points[-1]["_checked_at"]
    span_seconds = max((end_at - start_at).total_seconds(), 0.0)

    plot_points = [
        {
            "id": item.get("id"),
            "day": item["day"],
            "label": item["label"],
            "time": item["time"],
            "score": item["score"],
            "checked_at": item["checked_at"],
            "chart_label": (
                item["time"] if span_seconds <= 24 * 3600 else f'{item["label"]} {item["time"]}'
            ),
            "samples": 1,
        }
        for item in raw_points
    ]

    return {
        "plot_points": plot_points[-1000:],
        "raw_points": [
            {key: value for key, value in item.items() if key != "_checked_at"}
            for item in raw_points
        ],
        "range": {
            "plot_granularity": "stored_points",
            "interval_seconds": int(STRESS_LOG_MIN_INTERVAL.total_seconds()),
            "plot_points_count": len(plot_points[-1000:]),
            "raw_points_count": len(raw_points),
            "from": raw_points[0]["checked_at"],
            "to": raw_points[-1]["checked_at"],
        },
    }

@router.post("/stress/predict")
def predict_stress_endpoint(req: StressRequest):
    """
    Predict stress for a user.
    Can accept optional StressRequest with manual signals, or will fetch from GET /auth/me.
    """
    user_id = req.user_id or DEFAULT_USER_ID

    assessment = _run_stress_assessment(user_id, fallback_signals=req.dict())
    result = assessment["result"]
    return {
        "user_id": user_id,
        "stress_score": result.stress_score,
        "stress_label": result.risk_level,
        "stress_alert": result.alert_needed,
        "tip": result.advice,
        "top_stressor": result.top_stressor,
        "wellness_message": result.wellness_message,
        "feature_contributions": result.feature_contributions,
        "predict_params": assessment["signals"],
        "risk_level": result.risk_level,
        "alert_needed": result.alert_needed,
        "advice": result.advice,
    }


@router.patch("/wellness/{user_id}/predict-params")
def update_wellness_predict_params(
    user_id: str,
    req: WellnessPredictParamsOverrideRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"] if current_user else (user_id or DEFAULT_USER_ID)
    signals = get_signals(user_id) or {
        "id": f"signals_{user_id}",
        "user_id": user_id,
    }

    if req.clear_existing:
        next_overrides = {}
    else:
        existing_overrides = signals.get("stress_predict_overrides") or {}
        next_overrides = dict(existing_overrides) if isinstance(existing_overrides, dict) else {}

    payload = req.model_dump(exclude_none=True)
    payload.pop("clear_existing", None)

    for key, value in payload.items():
        if key not in STRESS_FEATURES:
            raise HTTPException(status_code=400, detail=f"Unsupported stress feature override: {key}")
        next_overrides[key] = float(value)

    signals["stress_predict_overrides"] = next_overrides
    upsert_signals_document(signals)

    assessment = _run_stress_assessment(user_id)
    result = assessment["result"]

    return {
        "user_id": user_id,
        "stored_overrides": next_overrides,
        "predict_params_used": assessment["signals"],
        "current_assessment": assessment["current_assessment"],
        "stress_score": result.stress_score,
        "stress_label": result.risk_level,
        "stress_alert": result.alert_needed,
        "top_stressor": result.top_stressor,
        "feature_contributions": result.feature_contributions,
    }


@router.get("/wellness/{user_id}")
def get_wellness(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"] if current_user else (user_id or DEFAULT_USER_ID)
    assessment = _run_stress_assessment(user_id)
    snapshot = assessment["snapshot"] or {}
    signals = assessment["signals"]
    result = assessment["result"]
    checked_at = assessment["checked_at"]
    notes = get_notes_by_user(user_id)
    quiz_scores = [
        float(attempt.get("score", 0) or 0)
        for note in notes
        for attempt in (note.get("quiz_attempts", []) if isinstance(note.get("quiz_attempts", []), list) else [])
        if isinstance(attempt, dict)
    ]
    streak_days = int(round(float(signals.get("days_since_last_break", 0) or 0)))

    latest_stress = get_latest_stress(user_id)
    inserted_new_log = False
    if _should_insert_stress_log(latest_stress, checked_at):
        save_stress_log(user_id, {
            "checked_at": checked_at,
            "stress_score": result.stress_score,
            "stress_label": result.risk_level,
            "stress_alert": result.alert_needed,
            "top_stressor": result.top_stressor,
            "feature_contributions": result.feature_contributions,
        })
        inserted_new_log = True
    history_logs = get_stress_logs_by_user(user_id, limit=500)
    stress_history = _build_stress_history(history_logs, result.stress_score)
    mood_history = [
        {
            "day": item["day"],
            "score": item["score"],
            "label": item["label"],
            "time": item["time"],
            "checked_at": item["checked_at"],
        }
        for item in (stress_history.get("plot_points") or [])
    ]

    return {
        "stress_score" : result.stress_score,
        "stress_label" : result.risk_level,
        "stress_alert" : result.alert_needed,
        "streak_days"  : streak_days,
        "streak_goal"  : 7,
        "days_to_exam" : snapshot["days_to_exam"],
        "avg_quiz_score": round(sum(quiz_scores) / len(quiz_scores), 1) if quiz_scores else 0.0,
        "confusion_score": round(signals.get("confusion_score_today", 0.0), 3),
        "mood_history" : mood_history,
        "stress_history": stress_history,
        "current_assessment": assessment["current_assessment"],
        "tip"          : result.advice,
        "top_stressor" : result.top_stressor,
        "wellness_message": result.wellness_message,
        "feature_contributions": result.feature_contributions,
        "predict_params": signals,
        "stress_predict_overrides": (get_signals(user_id) or {}).get("stress_predict_overrides", {}),
        "tracking_summary": snapshot.get("tracking_summary", {}),
        "subject_statuses": snapshot.get("subject_statuses", []),
        "stress_history_saved": inserted_new_log,
        "last_checkin" : datetime.datetime.utcnow().isoformat(),
    }


@router.get("/heatmaps/{user_id}")
async def get_all_heatmaps(
    user_id     : str,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"] if current_user else (user_id or DEFAULT_USER_ID)
    notes = get_notes_by_user(user_id)
    if not notes:
        return []

    results = []
    for note in notes:
        note_id    = note.get("id")
        is_pdf     = note.get("file_type") == "pdf"
        paragraphs = note.get("structured_content", {}).get("paragraphs", [])

        results.append({
            "note_id"      : note_id,
            "subject"      : note.get("subject", "General"),
            "created_at"   : note.get("created_at"),
            "image_url"    : note.get("image_url"),
            "heatmap_url"  : note.get("heatmap_url"),
            "heatmap_urls" : note.get("heatmap_urls", []),   # ← PDF pages
            "is_pdf"       : is_pdf,
            "mean_confusion": note.get("mean_confusion", 0.5),
            "paragraphs"   : paragraphs,
        })

    return results


@router.get("/{note_id}/status")
def note_status(note_id: str):
    note = get_note(note_id)
    if not note:
        raise HTTPException(404, "Note not found")
    processing_status = note.get("processing_status", "processing")
    if (
        processing_status == "processing"
        and note.get("error_code") != "unsafe_content"
        and (
            note.get("explanation_structured")
            or note.get("explanation_en")
            or _has_meaningful_text(note.get("extracted_text", ""))
        )
    ):
        processing_status = "processed"
        update_note(note_id, {"processing_status": "processed"})
    return {
        "note_id"          : note_id,
        "processing_status": processing_status,
        "error_code"       : note.get("error_code"),
        "error"            : note.get("error"),
        "user_message"     : _note_user_message(note),
        "user_messege"     : _note_user_message(note),
    }


@router.delete("/{note_id}")
def remove_note(
    note_id     : str,
    current_user: dict = Depends(require_user),
):
    note = get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    note_user_id = note.get("user_id")
    if note_user_id and note_user_id != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="You cannot delete this note")

    update_note(note_id, {
        "heatmap_url": None,
        "heatmap_urls": [],
        "has_heatmap": False,
    })

    try:
        deleted = delete_note(note_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete note: {exc}") from exc

    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found")

    return {"status": "deleted", "note_id": note_id}


@router.get("/{note_id}/heatmap")
def get_heatmap(
    note_id: str,
    current_user: dict = Depends(get_current_user),
):
    note = get_note(note_id)
    if not note:
        raise HTTPException(404, "Note not found")

    user_id = note.get("user_id") or (current_user["user_id"] if current_user else None)
    if user_id:
        try:
            signals = get_signals(user_id) or {
                "id": f"signals_{user_id}",
                "user_id": user_id,
                "heatmap_views": 0,
            }
            signals["heatmap_views"] = int(signals.get("heatmap_views", 0) or 0) + 1
            upsert_signals_document(signals)
        except Exception as exc:
            print(f"[HEATMAP TRACK] failed: {exc}")

    paragraphs = note.get("structured_content", {}).get("paragraphs", [])
    return {
        "note_id"         : note_id,
        "image_url"       : note.get("image_url"),
        "file_type"       : note.get("file_type", "image"),
        "heatmap_url"     : note.get("heatmap_url"),
        "heatmap_urls"    : note.get("heatmap_urls", []),
        "mean_confusion"  : note.get("mean_confusion", 0.5),
        "overall_confusion": note.get("overall_confusion", "medium"),
        "paragraphs"      : paragraphs,
    }


@router.get("/{note_id}")
def fetch_note(note_id: str):
    note = get_note(note_id)
    if not note:
        raise HTTPException(404, "Note not found")
    note = _register_note_read(note)

    extracted_text_existing = note.get("extracted_text", "")
    needs_pdf_reprocess = (
        note.get("file_type") == "pdf"
        and note.get("processing_status") != "blocked"
        and not _has_meaningful_text(extracted_text_existing)
        and bool(note.get("image_url"))
    )

    if needs_pdf_reprocess:
        try:
            response = requests.get(note["image_url"], timeout=30)
            response.raise_for_status()
            filename = Path(note["image_url"]).name or f"{note_id}.pdf"
            process_ocr(
                note_id=note_id,
                file_url=note["image_url"],
                file_bytes=response.content,
                user_id=note.get("user_id"),
                filename=filename,
                custom_prompt=note.get("custom_prompt"),
            )
            note = get_note(note_id) or note
        except Exception as e:
            print("PDF reprocess on fetch failed:", repr(e))

    structured_content = note.get("structured_content", {})
    paragraphs = structured_content.get("paragraphs", [])
    extracted_text = "\n".join([p.get("text", "") for p in paragraphs]) or note.get("extracted_text", "")

    explanation_structured = note.get("explanation_structured")
    if not explanation_structured and extracted_text:
        try:
            target_lang = note.get("language", "en")
            explanation_structured, _, _ = generate_explanation(
                [{"page": 1, "text": extracted_text}],
                custom_prompt=note.get("custom_prompt"),
                language=target_lang,
            )
        except Exception as e:
            print("Explanation generation failed:", e)
            explanation_structured = {
                "main": [{
                    "page": 1,
                    "explanation": extracted_text[:2000],
                    "explanation_hi_en": extracted_text[:2000],
                }],
                "concepts": [],
            }

        explanation_structured = _ensure_translations_present(explanation_structured)
        concept_terms = [
            c.get("term") or c.get("term_en")
            for c in explanation_structured.get("concepts", [])
            if c.get("term") or c.get("term_en")
        ]
        update_note(note_id, {
            "explanation_structured": explanation_structured,
            "concepts": concept_terms,
        })
        note = get_note(note_id) or note

    explanation_structured = note.get("explanation_structured") or explanation_structured
    if _structured_translations_missing(explanation_structured):
        explanation_structured = _ensure_translations_present(explanation_structured)
        update_note(note_id, {"explanation_structured": explanation_structured})
        note = get_note(note_id) or note
    else:
        explanation_structured = _normalize_structured_translations(explanation_structured)

    heatmap = [
        {
            "text": p.get("text"),
            "confusion_score": p.get("confusion_score", 0.5),
            "confusion_label": p.get("confusion_label", "medium"),
            "confusion_color": p.get("confusion_color", "#eab308"),
        }
        for p in paragraphs
    ]
    translations = _explanation_translation_map(explanation_structured)

    return {
        "note_id": note["id"],
        "image_url": note.get("image_url"),
        "preview_url": note.get("preview_url"),
        "file_type": note.get("file_type", "image"),
        "source_mode": note.get("source_mode", "upload"),
        "has_source_file": note.get("has_source_file", bool(note.get("image_url"))),
        "has_heatmap": note.get("has_heatmap", bool(note.get("heatmap_url") or note.get("heatmap_urls"))),
        "subject": note.get("subject", "General"),
        "topic": note.get("topic"),
        "processing_status": note.get("processing_status"),
        "error_code": note.get("error_code"),
        "error": note.get("error"),
        "user_message": _note_user_message(note),
        "user_messege": _note_user_message(note),
        "custom_prompt": note.get("custom_prompt"),
        "extracted_text": note.get("extracted_text", extracted_text),
        "explanation": {
            "main": explanation_structured.get("main", []),
            "concepts": explanation_structured.get("concepts", []),
        },
        "explanation_structured": explanation_structured,
        "quiz_id": note.get("last_quiz_id"),
        "quiz_data": note.get("last_quiz_data"),
        "quizzes_generated": note.get("quizzes_generated", []),
        "quiz_attempts": note.get("quiz_attempts", []),
        "heatmap_url": note.get("heatmap_url"),
        "heatmap_urls": note.get("heatmap_urls", []),
        "confusion_scores": note.get("confusion_scores", []),
        "mean_confusion": note.get("mean_confusion", 0.5),
        "overall_confusion": note.get("mean_confusion", 0.5),
        "heatmap": note.get("heatmap", heatmap),
        "translations": translations,
        "explanation_en": translations.get("en"),
        "explanation_hi_en": translations.get("hi_en"),
        "explanation_hi": translations.get("hi"),
        "explanation_ta": translations.get("ta"),
        "explanation_te": translations.get("te"),
        "explanation_bn": translations.get("bn"),
        "audio_urls": {
            "en": note.get("audio_en"),
            "hi_en": note.get("audio_hi_en"),
            "hi": note.get("audio_hi"),
            "ta": note.get("audio_ta"),
            "te": note.get("audio_te"),
            "bn": note.get("audio_bn"),
        },
        "created_at": note.get("created_at"),
        "user_id": note.get("user_id"),
        "language": note.get("language", "hi-en"),
    }


class AudioRequest(BaseModel):
    lang: str


class NoteInteractionRequest(BaseModel):
    event_type: str
    lang: str | None = None
    value: float | None = None


def _record_explanation_interaction(user_id: str | None, note_id: str, event_type: str, lang: str | None = None):
    if not user_id:
        return
    signals = get_signals(user_id) or {
        "id": f"signals_{user_id}",
        "user_id": user_id,
        "explanation_events": [],
    }
    explanation_events = list(signals.get("explanation_events", []))
    explanation_events.append({
        "type": event_type,
        "occurred_at": datetime.datetime.utcnow().isoformat(),
        "note_id": note_id,
        "lang": lang,
    })
    signals["explanation_events"] = explanation_events[-500:]
    upsert_signals_document(signals)


@router.post("/{note_id}/generate-audio")
def generate_audio_for_note(note_id: str, body: AudioRequest):
    lang = body.lang
    note = get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    existing_audio = {
        "en": note.get("audio_en"),
        "hi_en": note.get("audio_hi_en"),
        "hi": note.get("audio_hi"),
        "ta": note.get("audio_ta"),
        "te": note.get("audio_te"),
        "bn": note.get("audio_bn"),
    }

    if existing_audio.get(lang):
        return {"audio_urls": {lang: existing_audio.get(lang)}}

    audio_text = _audio_text_map(note.get("explanation_structured"))

    text = audio_text.get(lang)
    if not text:
        return {"audio_urls": {}}

    try:
        audio_urls = generate_audio(note_id, {lang: text})
        update_note(note_id, {f"audio_{lang}": audio_urls.get(lang)})
        return {"audio_urls": audio_urls}
    except Exception as e:
        print("Speech generation failed:", e)
        return {"audio_urls": {}}


@router.post("/{note_id}/interaction")
def track_note_interaction(
    note_id: str,
    body: NoteInteractionRequest,
    current_user: dict = Depends(get_current_user),
):
    note = get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if body.event_type not in {"translation_used", "audio_playback_loop", "time_on_explanation"}:
        raise HTTPException(status_code=400, detail="Unsupported interaction type")

    user_id = note.get("user_id") or (current_user["user_id"] if current_user else None)
    _record_explanation_interaction(user_id, note_id, body.event_type, body.lang)
    if user_id:
        try:
            signals = get_signals(user_id) or {
                "id": f"signals_{user_id}",
                "user_id": user_id,
                "audio_replays": 0,
                "time_on_explanation": 0.0,
            }
            if body.event_type == "audio_playback_loop":
                signals["audio_replays"] = int(signals.get("audio_replays", 0) or 0) + 1
            elif body.event_type == "time_on_explanation":
                duration_minutes = max(0.0, float(body.value or 0.0))
                signals["time_on_explanation"] = round(
                    float(signals.get("time_on_explanation", 0.0) or 0.0) + duration_minutes,
                    2,
                )
            upsert_signals_document(signals)
        except Exception as exc:
            print(f"[NOTE INTERACTION] failed: {exc}")
    return {"status": "ok", "note_id": note_id, "event_type": body.event_type}
