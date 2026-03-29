from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.users import ensure_default_user
# ── All router imports at the top ──────────────────────────────
from routers import notes, users, chatbot, topic_graph, video_summary, quiz , video_quiz
from config import STORAGE_CONNECTION_STRING

print("Storage:", STORAGE_CONNECTION_STRING)

app = FastAPI(title="StudyBuddy Backend")

# ── CORS — must be added BEFORE routers ───────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "https://frontendforged-bfb2g7b8babpb0at.koreacentral-01.azurewebsites.net",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────
app.include_router(topic_graph.router)
app.include_router(video_summary.router)          # mounts at /api/video-summary
app.include_router(quiz.router, prefix="/quiz", tags=["quiz"])
app.include_router(chatbot.router)                # mounts at /chat/
app.include_router(notes.router, prefix="/notes")
app.include_router(users.router, prefix="/auth")
app.include_router(video_quiz.router)


@app.on_event("startup")
def startup():
    ensure_default_user()
    print("\nML Models status:")

    try:
        from models.dna.predictor import _model
        print("  ✓ LSTM DNA model loaded")
    except Exception as e:
        print(f"  ✗ LSTM failed: {e}")

    try:
        from models.stress.predictor import _xgb_model
        print("  ✓ Stress Predictor loaded")
    except Exception as e:
        print(f"  ✗ Stress failed: {e}")
    print()


@app.get("/")
def home():
    return {"message": "StudyBuddy Backend Running"}


@app.get("/health")
def health():
    return {"status": "ok"}
