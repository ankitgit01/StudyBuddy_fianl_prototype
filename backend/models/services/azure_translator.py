import time

import requests
from config import (
    TRANSLATOR_KEY,
    TRANSLATOR_ENDPOINT,
    TRANSLATOR_REGION
)


def _chunk_text(text: str, max_chars: int = 1800) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    chunks = []
    current = []
    current_len = 0
    paragraphs = [part.strip() for part in text.split("\n") if part.strip()]
    if not paragraphs:
        paragraphs = [text]

    for paragraph in paragraphs:
        paragraph_len = len(paragraph)
        separator_len = 1 if current else 0
        if paragraph_len > max_chars:
            if current:
                chunks.append("\n".join(current))
                current = []
                current_len = 0
            start = 0
            while start < paragraph_len:
                chunks.append(paragraph[start:start + max_chars])
                start += max_chars
            continue

        if current_len + separator_len + paragraph_len <= max_chars:
            current.append(paragraph)
            current_len += separator_len + paragraph_len
        else:
            chunks.append("\n".join(current))
            current = [paragraph]
            current_len = paragraph_len

    if current:
        chunks.append("\n".join(current))
    return chunks


def _translate_chunk(text, *, to_langs, from_lang="en", timeout=30):
    """
    Translate text to the given target languages.
    Defaults to ["hi", "te", "ta", "bn"].
    Pass to_langs=["en", "hi", "te", "ta", "bn"] when the source is not English
    so that the English translation is also returned correctly.
    """

    if not text:
        return {
            "en": None,
            "hi": None,
            "te": None,
            "ta": None,
            "bn": None
        }

    url = f"{TRANSLATOR_ENDPOINT}/translate"

    params = {
        "api-version": "3.0",
        "to": to_langs
    }
    if from_lang:
        params["from"] = from_lang

    headers = {
        "Ocp-Apim-Subscription-Key": TRANSLATOR_KEY,
        "Ocp-Apim-Subscription-Region": TRANSLATOR_REGION,
        "Content-Type": "application/json"
    }

    body = [{"text": text}]

    response = requests.post(url, params=params, headers=headers, json=body, timeout=timeout)

    if response.status_code != 200:
        print("Translator API error:", response.text)
        return {
            "en": text,
            "hi": None,
            "te": None,
            "ta": None,
            "bn": None
        }

    result = response.json()

    translations = {
        "en": None,
        "hi": None,
        "te": None,
        "ta": None,
        "bn": None
    }

    if isinstance(result, list) and len(result) > 0:
        for t in result[0]["translations"]:
            lang = t["to"]
            translations[lang] = t["text"]

    # fallback if English not returned
    if not translations["en"]:
        translations["en"] = text

    return translations


def translate_text(text, to_langs=None, from_lang="en", max_retries=3):
    if not text:
        return {
            "en": None,
            "hi": None,
            "te": None,
            "ta": None,
            "bn": None
        }

    if to_langs is None:
        to_langs = ["hi", "te", "ta", "bn"]

    chunks = _chunk_text(text)
    combined = {
        "en": text if "en" in to_langs else None,
        "hi": None,
        "te": None,
        "ta": None,
        "bn": None,
    }

    per_lang_parts = {lang: [] for lang in to_langs}

    for chunk in chunks:
        chunk_result = None
        for attempt in range(max_retries):
            chunk_result = _translate_chunk(
                chunk,
                to_langs=to_langs,
                from_lang=from_lang,
            )
            missing = [
                lang for lang in to_langs
                if lang != "en" and not (chunk_result.get(lang) or "").strip()
            ]
            if not missing:
                break
            time.sleep(0.6)

        chunk_result = chunk_result or {}
        for lang in to_langs:
            translated = chunk_result.get(lang)
            if translated is None:
                translated = chunk if lang == "en" else None
            per_lang_parts[lang].append(translated)

    for lang in to_langs:
        parts = [part for part in per_lang_parts.get(lang, []) if isinstance(part, str)]
        if parts:
            combined[lang] = "\n".join(parts).strip()
        elif lang == "en":
            combined[lang] = text

    if "en" not in to_langs:
        combined["en"] = text

    return combined
