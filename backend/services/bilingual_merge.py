def merge_bilingual(english_text, hindi_text):

    eng_words = english_text.split()
    hin_words = hindi_text.split()

    merged_words = []

    for i in range(min(len(eng_words), len(hin_words))):

        eng = eng_words[i]
        hin = hin_words[i]

        if eng.lower() != hin.lower():
            merged_words.append(f"{eng} ({hin})")
        else:
            merged_words.append(eng)

    merged = " ".join(merged_words)

    return merged