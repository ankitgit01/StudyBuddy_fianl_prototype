import re

# simple stopwords list
STOPWORDS = {
    "the","is","are","was","were","this","that","these","those",
    "a","an","and","or","but","in","on","at","to","for","with"
}

def extract_concepts(structured_content):

    words = []

    for paragraph in structured_content.get("paragraphs", []):

        text = paragraph["text"]

        tokens = re.findall(r'\b[A-Za-z]{4,}\b', text)

        for token in tokens:

            token = token.lower()

            if token not in STOPWORDS:

                words.append(token)

    # count frequency
    freq = {}

    for w in words:
        freq[w] = freq.get(w, 0) + 1

    # pick top concepts
    sorted_concepts = sorted(freq.items(), key=lambda x: x[1], reverse=True)

    concepts = [c[0] for c in sorted_concepts[:10]]

    return concepts