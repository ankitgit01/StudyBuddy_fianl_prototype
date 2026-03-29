import json
import re

from openai import AzureOpenAI

from config import AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY

client = AzureOpenAI(
    api_key=AZURE_OPENAI_KEY,
    azure_endpoint=AZURE_OPENAI_ENDPOINT,
    api_version="2024-12-01-preview",
)


def _clean_json(content: str):
    content = re.sub(r"```json|```", "", content or "").strip()
    try:
        return json.loads(content)
    except Exception:
        try:
            start = content.find("{")
            end = content.rfind("}") + 1
            return json.loads(content[start:end])
        except Exception:
            return None


def build_prompt(user_query: str, context: str = None):
    system_prompt = """You are a helpful AI tutor for students.

Return strict JSON with these keys only:
- answer: string (Markdown formatted, see rules below)
- llm_stress_signal: number from 0 to 1
- llm_confusion_keywords: integer >= 0

=== ANSWER FORMATTING RULES ===
Your answer MUST be rich Markdown with proper math notation. Follow these strictly:

1. MATH:
   - Inline math: use $...$ for expressions within text, e.g. "the value of $x = 5$"
   - Block/display math: use $$...$$ on its own line for equations, integrals, fractions, etc.
   - NEVER write fractions as a/b in plain text. Always use $$\\frac{a}{b}$$ for display or $\\frac{a}{b}$ inline.
   - Use $$\\int$$, $$\\sum$$, $$\\sqrt{}$$, $$\\lim$$, $$\\infty$$ etc. for all math symbols.

2. STRUCTURE:
   - Use ## or ### headings to organize multi-part answers.
   - Use **bold** for key terms.
   - Use bullet lists (- item) or numbered lists (1. item) for steps or enumerations.
   - Use > blockquotes for important rules or definitions.
   - Use `code` or ```code blocks``` for formulas in programming context.

3. EXAMPLES:
   - Always include a worked example section when solving problems, under a ### Example heading.
   - Show step-by-step working, one step per line with display math.

4. TONE: Concise, clear, student-friendly. No unnecessary filler.

=== SCORING RULES ===
- llm_stress_signal: estimate how stressed/panicked the student sounds (0 = calm, 1 = very stressed).
- llm_confusion_keywords: count distinct confusion/stress indicator words in the question.
"""

    if context:
        user_prompt = f"""
Context:
{context}

Question:
{user_query}
"""
    else:
        user_prompt = f"""
Question:
{user_query}
"""

    return system_prompt, user_prompt


def get_chat_response_with_signals(user_query: str, context: str = None) -> dict:
    system_prompt, user_prompt = build_prompt(user_query, context)

    response = client.chat.completions.create(
        model="gpt-4.1",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.4,
        max_tokens=800,
    )

    content = response.choices[0].message.content or ""
    parsed = _clean_json(content) or {}
    return {
        "answer": parsed.get("answer") or content,
        "llm_stress_signal": float(parsed.get("llm_stress_signal", 0.0) or 0.0),
        "llm_confusion_keywords": float(parsed.get("llm_confusion_keywords", 0.0) or 0.0),
    }


def get_chat_response(user_query: str, context: str = None):
    return get_chat_response_with_signals(user_query, context=context)["answer"]
