import os

folders = [
    "backend",
    "backend/routers",
    "backend/services",
    "backend/models",
    "backend/agents"
]

files = [
    "backend/main.py",
    "backend/config.py",
    "backend/routers/notes.py",
    "backend/routers/user.py",
    "backend/services/azure_blob.py",
    "backend/services/azure_openai.py",
    "backend/services/azure_speech.py",
    "backend/services/azure_translator.py",
    "backend/services/cosmos_db.py",
    "backend/services/cognitive_search.py",
    "backend/models/note_model.py",
    "backend/agents/bilingual_merge.py",
    "backend/agents/graph_builder.py",
    ".env",
    "requirements.txt"
]

for folder in folders:
    os.makedirs(folder, exist_ok=True)

for file in files:
    with open(file, "w") as f:
        pass

print("Project structure created successfully.")