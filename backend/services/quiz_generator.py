import json
import re
import time

from services.azure_openai import (
    client,
)
MODEL_MINI = "gpt-4.1-mini"


# ─────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────

def letter_to_index(letter):
    mapping = {
        "A": 0,
        "B": 1,
        "C": 2,
        "D": 3
    }
    return mapping.get(letter, 0)


def clean_json(content: str):
    content = re.sub(r"```json|```", "", content).strip()

    try:
        return json.loads(content)
    except:
        try:
            start = content.find("{")
            end = content.rfind("}") + 1
            return json.loads(content[start:end])
        except:
            return None


# ─────────────────────────────────────────────
# MAIN FUNCTION
# ─────────────────────────────────────────────

def generate_quiz(
    explanation,
    concepts,
    num_questions=5,
    difficulty="mixed",
    user_message=None,
    max_retries=3,
):

    concept_names = [c.get("term") for c in concepts]

    prompt = f"""
You are an expert AI tutor and exam setter.

Your job is to create HIGH-QUALITY, NON-TRIVIAL questions.

─────────────────────────────
INPUT
─────────────────────────────

Explanation:
{explanation}

Concepts:
{concept_names}

User request:
{user_message}

─────────────────────────────
INTELLIGENCE REQUIREMENTS
─────────────────────────────

1. FIRST analyze the academic level:
   - If content resembles JEE / competitive exam → create tricky, multi-step, conceptual questions
   - If content is basic (class 10 or below) → create direct but meaningful conceptual questions

2. DO NOT create obvious or definition-based questions.

3. Prefer:
   - Application-based questions
   - Multi-step reasoning
   - Edge cases
   - Conceptual traps
   - Numerical thinking (if applicable)

4. Difficulty handling:
   - Total questions: {num_questions}
   - Difficulty preference: {difficulty}
   - If "mixed":
        → include easy + medium + hard
   - If "hard":
        → focus on tricky conceptual questions

5. Each question MUST:
   - Test real understanding
   - Be answerable from explanation
   - Avoid repetition

6. Randomize the position of correct answers so that each option (A, B, C, D) is used approximately equally, with no obvious patterns or clustering.
7. Ensure the corect option for two adjacent questions are never the same. Number of questions for which "correct_answer": "A" must not exceed 2
─────────────────────────────
OUTPUT FORMAT (STRICT JSON)
─────────────────────────────

{{
  "quiz_title": "Topic name",
  "questions": [
    {{
      "id": 1,
      "type": "mcq",
      "question": "Question text",
      "options": ["A","B","C","D"],
      "correct_answer": "A",
      "difficulty": "easy | medium | hard",
      "concept": "Concept tested",
      "explanation": "Why this answer is correct (short explanation)"
    }}
  ]
}}

─────────────────────────────
STRICT RULES
─────────────────────────────

- Output ONLY JSON
- No markdown
- No trivial questions like "What is X?"
- Avoid copy-paste from explanation
- Ensure all options are plausible (no obvious wrong answers)
- Ensure exactly 4 options
- Ensure correct_answer is A/B/C/D
- Ensure JSON is valid
"""

    for attempt in range(max_retries):

        try:
            response = client.chat.completions.create(
                model=MODEL_MINI,
                messages=[
                    {"role": "system", "content": "You create high-quality exam-level quizzes."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.5,  # Increase slightly for higher creativity
            )

            content = response.choices[0].message.content
            quiz = clean_json(content)

            if quiz:
                break

        except Exception as e:
            print(f"Quiz attempt {attempt+1} failed:", e)
            time.sleep(1)

    if not quiz:
        quiz = {
            "quiz_title": "Generated Quiz",
            "questions": []
        }

    # ─────────────────────────────────────────────
    # Normalize for frontend
    # ─────────────────────────────────────────────

    questions = []

    for q in quiz.get("questions", []):

        correct_letter = q.get("correct_answer", "A").upper()
        correct_index = letter_to_index(correct_letter)

        questions.append({
            "id": q.get("id", len(questions) + 1),
            "type": q.get("type", "mcq"),
            "question": q.get("question", ""),
            "options": q.get("options", []),
            "correct": correct_index,
            "explanation": q.get("explanation", ""),
            "difficulty": q.get("difficulty", "medium"),
            "concept": q.get("concept", "")
        })

    # ─────────────────────────────
    # Fallback
    # ─────────────────────────────

    if len(questions) == 0:

        questions = [
            {
                "id": 1,
                "type": "mcq",
                "question": "Which concept is most important in this topic?",
                "options": concept_names[:4] if len(concept_names) >= 4 else concept_names + ["Concept"]*(4-len(concept_names)),
                "correct": 0,
                "explanation": "Fallback question due to generation failure.",
                "difficulty": "easy",
                "concept": concept_names[0] if concept_names else "general"
            }
        ]

    return questions


# ─────────────────────────────────────────────
# VIDEO SUMMARY QUIZ
# Adapts the video summary dict (from summariser.py)
# into the same generate_quiz() pipeline.
# ─────────────────────────────────────────────

def generate_quiz_from_video_summary(
    summary: dict,
    num_questions: int = 10,
    difficulty: str = "mixed",
) -> list:
    """
    Generate quiz questions from a video summary dict.

    Maps the summary structure into the same generate_quiz() pipeline
    so the same model, prompt logic, and normalization is reused.

    Args:
        summary:       The structured summary dict from summariser.py.
        num_questions: Number of questions (5, 10, or 15).
        difficulty:    "easy", "medium", "hard", or "mixed".

    Returns:
        List of normalized question dicts (same shape as generate_quiz()).
    """
    num_questions = max(5, min(15, num_questions))

    # ── Build explanation text from summary fields ────────────
    lines = []

    title = summary.get("title_guess") or summary.get("title", "")
    if title:
        lines.append(f"Video Title: {title}\n")

    overall = summary.get("overall_summary", "")
    if overall:
        lines.append(f"Overview:\n{overall}\n")

    key_takeaways = summary.get("key_takeaways", [])
    if key_takeaways:
        lines.append("Key Takeaways:")
        for i, t in enumerate(key_takeaways, 1):
            lines.append(f"  {i}. {t}")
        lines.append("")

    topics = summary.get("topics", [])
    for topic in topics:
        lines.append(f"Topic: {topic.get('title', '')}")
        lines.append(topic.get("summary", ""))
        for kp in topic.get("key_points", []):
            lines.append(f"  • {kp}")
        if topic.get("key_formula"):
            lines.append(f"  Formula: {topic['key_formula']}")
        lines.append("")

    explanation = "\n".join(lines)

    # ── Build concepts list (same shape generate_quiz() expects) ─
    concepts = []
    for topic in topics:
        concepts.append({"term": topic.get("title", "")})
    for takeaway in key_takeaways:
        # Truncate to a short label (first 60 chars)
        concepts.append({"term": takeaway[:60]})

    # ── Delegate to the shared generate_quiz() ────────────────
    return generate_quiz(
        explanation=explanation,
        concepts=concepts,
        num_questions=num_questions,
        difficulty=difficulty,
        user_message=(
            f"Generate {num_questions} exam-quality MCQ questions from this video summary. "
            f"Focus on key concepts, formulas, and takeaways."
        ),
    )