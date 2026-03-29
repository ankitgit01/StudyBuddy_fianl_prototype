import os
from dotenv import load_dotenv

# Load environment variables from cwD (if not found, moves up the tree)
load_dotenv()

COSMOS_CONTAINER_SIGNALS   = os.getenv("COSMOS_CONTAINER_SIGNALS")

CONTENT_SAFETY_ENDPOINT = os.getenv("CONTENT_SAFETY_ENDPOINT")
CONTENT_SAFETY_KEY = os.getenv("CONTENT_SAFETY_KEY")

# ─────────────────────────────────────────────
# Azure OpenAI Config
# ─────────────────────────────────────────────

AZURE_OPENAI_KEY = os.getenv("AZURE_OPENAI_KEY")
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_API_VERSION = "2024-12-01-preview"

# -----------------------------
# Blob Storage
# -----------------------------
STORAGE_CONNECTION_STRING = os.getenv("STORAGE_CONNECTION_STRING")
AZURE_BLOB_CONTAINER = os.getenv("AZURE_BLOB_CONTAINER")

# -----------------------------
# Cosmos DB
# -----------------------------
COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT")
COSMOS_KEY = os.getenv("COSMOS_KEY")
COSMOS_DATABASE = os.getenv("COSMOS_DATABASE")
COSMOS_CONTAINER = os.getenv("COSMOS_CONTAINER")
COSMOS_CONTAINER_USERS     = os.getenv("COSMOS_CONTAINER_USERS")
COSMOS_CONTAINER_DNA       = os.getenv("COSMOS_CONTAINER_DNA") 
COSMOS_CONTAINER_STRESS    = os.getenv("COSMOS_CONTAINER_STRESS")
COSMOS_CONTAINER_TOPIC_GRAPHS = os.getenv("COSMOS_CONTAINER_TOPIC_GRAPHS", "topic_graphs")
COSMOS_CONTAINER_VIDEO_SUMMARY = os.getenv("COSMOS_CONTAINER_VIDEO_SUMMARY")

# -----------------------------
# Vision OCR
# -----------------------------
VISION_ENDPOINT = os.getenv("VISION_ENDPOINT")
VISION_KEY = os.getenv("VISION_KEY")

# -----------------------------
# Groq AI
# -----------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL")

# -----------------------------
# Translator
# -----------------------------
TRANSLATOR_KEY = os.getenv("TRANSLATOR_KEY")
TRANSLATOR_ENDPOINT = os.getenv("TRANSLATOR_ENDPOINT")
TRANSLATOR_REGION = os.getenv("TRANSLATOR_REGION")

# -----------------------------
# Speech
# -----------------------------
SPEECH_KEY = os.getenv("SPEECH_KEY")
SPEECH_REGION = os.getenv("SPEECH_REGION")

# Debug prints
print("Storage:", STORAGE_CONNECTION_STRING)
print("Translator:", TRANSLATOR_ENDPOINT)
