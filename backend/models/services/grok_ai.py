from groq import Groq
import json
import re
from config import GROQ_API_KEY, GROQ_MODEL

client = Groq(api_key=GROQ_API_KEY)


def generate_explanation(text):

    prompt = f"""
You are an expert AI tutor helping a student understand handwritten notes.

Text extracted from the student's notes:
{text}

Return ONLY valid JSON in this structure:

{{
 "main_explanation": "Clear explanation of what the notes are about. Include every information present in the text and include all steps in case the text is the solution of a numerical question",
 "concepts": [
  {{
   "term": "Concept name",
   "definition": "Simple definition of concepts",
   "example": "Simple example",
   "context": "Why this concept matters in this topic",
   "difficulty": "beginner | intermediate | advanced",
   "related_topics": ["topic1","topic2"],
   "prerequisites": ["concept1","concept2"]
   "YouTube link": "working link for a youtube video strictly related to this particular concept"
   "Wikipedia link": "Link to a wikipedia page strictly related to this concept"
  }}
 ]
}}

Rules:
- Output strictly valid JSON
- No markdown
"""

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": "You are an expert teacher."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3
    )

    content = response.choices[0].message.content
    content = re.sub(r"```json|```", "", content).strip()

    try:
        explanation = json.loads(content)

    except Exception as e:

        print("JSON parsing failed:", e)

        try:
            start = content.find("{")
            end = content.rfind("}") + 1
            repaired = content[start:end]
            explanation = json.loads(repaired)

        except:

            explanation = {
                "main_explanation": content[:3000],
                "concepts": []
            }

    return explanation