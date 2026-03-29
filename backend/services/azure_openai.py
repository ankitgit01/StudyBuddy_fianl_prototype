import json
import re
import time

from openai import AzureOpenAI

from config import (
    AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_KEY,
)

client = AzureOpenAI(
    api_key=AZURE_OPENAI_KEY,
    api_version=AZURE_OPENAI_API_VERSION,
    azure_endpoint=AZURE_OPENAI_ENDPOINT,
)

MODEL_MINI = "gpt-4.1-mini"
MODEL_FULL = "gpt-4.1"


def estimate_tokens(text: str) -> int:
    return len(text) // 4


def choose_model(text: str) -> str:
    return MODEL_MINI if estimate_tokens(text) < 8000 else MODEL_FULL


def trim_text(text: str, max_tokens: int = 12000) -> str:
    if estimate_tokens(text) <= max_tokens:
        return text

    chars = max_tokens * 4
    return text[: chars // 2] + "\n...\n" + text[-chars // 2 :]


def clean_json(content: str):
    content = re.sub(r"```json|```", "", content).strip()

    try:
        return json.loads(content)
    except Exception:
        try:
            start = content.find("{")
            end = content.rfind("}") + 1
            return json.loads(content[start:end])
        except Exception:
            return None


def generate_explanation(
    pages,
    max_retries: int = 3,
    custom_prompt=None,
    language: str = "en",
) -> tuple[dict, float, float]:
    combined_text = "\n\n".join([p["text"] for p in pages])
    combined_text = trim_text(combined_text)

    model = choose_model(combined_text)

    lang_instruction = """
Generate BOTH of these output styles for every explanation/concept field:

1. MAIN ENGLISH FIELDS:
- "explanation", "term", "definition", "example", and "context" must be in clear English only.
- These English fields are the canonical source text and will later be sent to the translator service to create explanation_hi, explanation_ta, term_te, etc.
- Do not mix Hindi into these base English fields.

2. DISPLAY HI_EN FIELDS:
- "explanation_hi_en", "term_hi_en", "definition_hi_en", "example_hi_en", and "context_hi_en" are final frontend display strings for the Eng+Hin option.
- Write primarily in Hindi (Devanagari script).
- Every technical term, concept name, or domain-specific word must appear in English inside brackets immediately after its Hindi equivalent.
- Keep the flow natural, like how an Indian engineering student would explain to a friend.

IMPORTANT:
- The English fields and the hi_en fields must describe the same idea, but they serve different purposes.
- English fields are for translation and language-specific audio pipelines.
- hi_en fields are for direct frontend display only.
"""

    custom_instruction = ""
    if custom_prompt and custom_prompt.strip():
        custom_instruction = f"""

USER'S CUSTOM INSTRUCTION:
{custom_prompt.strip()}

IMPORTANT RULES FOR CUSTOM INSTRUCTION:
- Follow this instruction strictly without hallucinating.
- If the instruction asks to list formulas, equations, or derivations:
  -> Do NOT create a separate top-level key for them.
  -> Instead, embed them within the JSON structure using one of these two approaches:
     OPTION A: Append them clearly in the explanation of the last page.
     OPTION B: Add them as the last entry or entries in the "concepts" array.
- Apply the same logic for other structured data the user asks for:
  embed inside "main" or "concepts", never as a new top-level key.
"""

    prompt = f"""
You are an expert AI tutor.

You are given OCR text from multiple pages.

INPUT:
{pages}

{lang_instruction}

{custom_instruction}

TASK:

1. Generate a separate explanation for each page.
2. Maintain page order.
3. Keep explanations clear and student-friendly.
4. If math exists, explain step-by-step.
5. Extract important concepts across all pages.
6. Also estimate:
   - llm_stress_signal: a number between 0 and 1 for how stressed/confused the student request sounds
   - llm_confusion_keywords: integer count of confusion indicators in the request
7. Output only the keys defined in the JSON schema below.

RETURN STRICT JSON:

{{
  "meta": {{
    "llm_stress_signal": 0.0,
    "llm_confusion_keywords": 0
  }},
  "main": [
    {{
      "page": 1,
      "explanation": "",
      "explanation_hi_en": ""
    }}
  ],
  "concepts": [
    {{
      "term": "",
      "term_hi_en": "",
      "definition": "",
      "definition_hi_en": "",
      "example": "",
      "example_hi_en": "",
      "context": "",
      "context_hi_en": "",
      "difficulty": "easy | medium | hard",
      "related_topics": [],
      "prerequisites": [],
      "visual_link": "",
      "wikipedia_link": ""
    }}
  ]
}}

RULES:
- Strict JSON only, no markdown and no code fences.
- No hallucinated links.
- Avoid trivial concepts.
- Never add keys outside of "meta", "main" and "concepts".
- "visual_link" must be a direct web image URL that visually represents the concept.
- Prefer reliable educational or public sources for visual_link.
- If you are not confident about a valid visual_link, return an empty string instead of guessing.
- Formulas or any extra content requested via custom instruction must be embedded inside "main[last page].explanation" or appended as entries in "concepts".
"""

    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a structured AI teacher. You always return valid JSON with only 'meta', 'main' and 'concepts' as top-level keys. You never add extra keys.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
            )

            content = response.choices[0].message.content
            parsed = clean_json(content)

            if parsed and isinstance(parsed, dict):
                allowed_keys = {"meta", "main", "concepts"}
                rogue_keys = set(parsed.keys()) - allowed_keys
                if rogue_keys:
                    last_page = parsed.get("main", [{}])[-1]
                    for key in rogue_keys:
                        rogue_data = parsed.pop(key)
                        suffix = f"\n\n{key.upper()}:\n"
                        if isinstance(rogue_data, list):
                            for item in rogue_data:
                                if isinstance(item, dict):
                                    for inner_key, value in item.items():
                                        suffix += f"- {inner_key}: {value}\n"
                                else:
                                    suffix += f"- {item}\n"
                        else:
                            suffix += str(rogue_data)

                        for exp_key in (
                            "explanation",
                            "explanation_hi_en",
                            "explanation_en",
                            "explanation_hi",
                        ):
                            if exp_key in last_page:
                                last_page[exp_key] += suffix

            if parsed:
                meta = (
                    parsed.get("meta", {})
                    if isinstance(parsed.get("meta"), dict)
                    else {}
                )
                llm_stress_signal = float(meta.get("llm_stress_signal", 0.0) or 0.0)
                llm_confusion_keywords = float(
                    meta.get("llm_confusion_keywords", 0) or 0
                )
                return parsed, llm_stress_signal, llm_confusion_keywords

        except Exception as exc:
            print(f"Attempt {attempt + 1} failed:", exc)

        time.sleep(1)

    return {
        "main": [
            {
                "page": p["page"],
                "explanation": p["text"][:1000],
                "explanation_hi_en": p["text"][:1000],
            }
            for p in pages
        ],
        "concepts": [],
    }, 0.0, 0.0
