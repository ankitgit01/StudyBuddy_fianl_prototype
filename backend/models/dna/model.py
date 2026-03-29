# ─────────────────────────────────────────────────────────────
#  GYAANI AI — Study DNA Model Training
#  Run this in Google Colab
#  Output: dna_model.pkl, dna_scaler.pkl, dna_label_encoder.pkl
# ─────────────────────────────────────────────────────────────

# ── CELL 1: Install dependencies ─────────────────────────────
# !pip install scikit-learn pandas numpy matplotlib seaborn joblib

# ── CELL 2: Imports ──────────────────────────────────────────
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix
import joblib
import json

# ── CELL 3: Define profiles ───────────────────────────────────
PROFILES = [
    "The Achiever",        # High scores, low confusion, consistent
    "The Hustler",         # High study time, many uploads, high streak
    "The Curious Mind",    # Many subjects, heatmap explorer, audio lover
    "The Comeback Kid",    # Was struggling, now improving fast
    "The Deep Thinker",    # High confusion but revisits, high audio
    "The Consistent Scholar", # Long streak, regular uploads, steady scores
]

# ── CELL 4: Generate synthetic training data ──────────────────
np.random.seed(42)
N = 3000  # samples per profile = 18000 total

def clip(val, lo, hi):
    return max(lo, min(hi, val))

def generate_profile_data(profile, n):
    rows = []
    for _ in range(n):
        if profile == "The Achiever":
            row = {
                "audio_replays"       : clip(np.random.randint(0, 5),    0, 50),
                "quiz_attempts"       : clip(np.random.randint(15, 40),   0, 100),
                "avg_quiz_score"      : clip(np.random.normal(82, 8),     0, 100),
                "notes_viewed"        : clip(np.random.randint(10, 30),   0, 100),
                "heatmap_views"       : clip(np.random.randint(5, 20),    0, 100),
                "red_zone_clicks"     : clip(np.random.randint(0, 5),     0, 50),
                "login_streak"        : clip(np.random.randint(7, 30),    0, 365),
                "days_since_last"     : clip(np.random.randint(1, 3),     0, 30),
                "total_study_minutes" : clip(np.random.normal(180, 40),   0, 600),
                "quiz_retry_rate"     : clip(np.random.uniform(0.1, 0.3), 0, 1),
                "quiz_improvement"    : clip(np.random.normal(8, 4),      -20, 30),
                "time_on_explanation" : clip(np.random.normal(25, 8),     0, 120),
                "upload_count"        : clip(np.random.randint(8, 25),    0, 100),
                "mean_confusion"      : clip(np.random.uniform(0.05, 0.25), 0, 1),
                "subjects_count"      : clip(np.random.randint(2, 5),     1, 20),
                "concepts_total"      : clip(np.random.randint(20, 60),   0, 200),
                "concepts_completed"  : clip(np.random.randint(15, 55),   0, 200),
            }

        elif profile == "The Hustler":
            row = {
                "audio_replays"       : clip(np.random.randint(2, 10),   0, 50),
                "quiz_attempts"       : clip(np.random.randint(20, 50),   0, 100),
                "avg_quiz_score"      : clip(np.random.normal(65, 12),    0, 100),
                "notes_viewed"        : clip(np.random.randint(20, 50),   0, 100),
                "heatmap_views"       : clip(np.random.randint(10, 30),   0, 100),
                "red_zone_clicks"     : clip(np.random.randint(5, 20),    0, 50),
                "login_streak"        : clip(np.random.randint(10, 60),   0, 365),
                "days_since_last"     : clip(np.random.randint(1, 2),     0, 30),
                "total_study_minutes" : clip(np.random.normal(320, 60),   0, 600),
                "quiz_retry_rate"     : clip(np.random.uniform(0.2, 0.5), 0, 1),
                "quiz_improvement"    : clip(np.random.normal(3, 5),      -20, 30),
                "time_on_explanation" : clip(np.random.normal(40, 10),    0, 120),
                "upload_count"        : clip(np.random.randint(15, 50),   0, 100),
                "mean_confusion"      : clip(np.random.uniform(0.2, 0.45), 0, 1),
                "subjects_count"      : clip(np.random.randint(3, 8),     1, 20),
                "concepts_total"      : clip(np.random.randint(30, 80),   0, 200),
                "concepts_completed"  : clip(np.random.randint(20, 60),   0, 200),
            }

        elif profile == "The Curious Mind":
            row = {
                "audio_replays"       : clip(np.random.randint(8, 25),   0, 50),
                "quiz_attempts"       : clip(np.random.randint(5, 20),    0, 100),
                "avg_quiz_score"      : clip(np.random.normal(60, 15),    0, 100),
                "notes_viewed"        : clip(np.random.randint(15, 40),   0, 100),
                "heatmap_views"       : clip(np.random.randint(15, 40),   0, 100),
                "red_zone_clicks"     : clip(np.random.randint(8, 25),    0, 50),
                "login_streak"        : clip(np.random.randint(3, 20),    0, 365),
                "days_since_last"     : clip(np.random.randint(1, 5),     0, 30),
                "total_study_minutes" : clip(np.random.normal(150, 50),   0, 600),
                "quiz_retry_rate"     : clip(np.random.uniform(0.1, 0.4), 0, 1),
                "quiz_improvement"    : clip(np.random.normal(2, 6),      -20, 30),
                "time_on_explanation" : clip(np.random.normal(50, 15),    0, 120),
                "upload_count"        : clip(np.random.randint(5, 20),    0, 100),
                "mean_confusion"      : clip(np.random.uniform(0.25, 0.50), 0, 1),
                "subjects_count"      : clip(np.random.randint(5, 12),    1, 20),
                "concepts_total"      : clip(np.random.randint(40, 100),  0, 200),
                "concepts_completed"  : clip(np.random.randint(10, 40),   0, 200),
            }

        elif profile == "The Comeback Kid":
            row = {
                "audio_replays"       : clip(np.random.randint(5, 20),   0, 50),
                "quiz_attempts"       : clip(np.random.randint(10, 30),   0, 100),
                "avg_quiz_score"      : clip(np.random.normal(58, 15),    0, 100),
                "notes_viewed"        : clip(np.random.randint(8, 25),    0, 100),
                "heatmap_views"       : clip(np.random.randint(8, 25),    0, 100),
                "red_zone_clicks"     : clip(np.random.randint(10, 30),   0, 50),
                "login_streak"        : clip(np.random.randint(2, 15),    0, 365),
                "days_since_last"     : clip(np.random.randint(1, 4),     0, 30),
                "total_study_minutes" : clip(np.random.normal(200, 60),   0, 600),
                "quiz_retry_rate"     : clip(np.random.uniform(0.3, 0.7), 0, 1),
                "quiz_improvement"    : clip(np.random.normal(15, 5),     -20, 30),
                "time_on_explanation" : clip(np.random.normal(35, 12),    0, 120),
                "upload_count"        : clip(np.random.randint(5, 20),    0, 100),
                "mean_confusion"      : clip(np.random.uniform(0.30, 0.60), 0, 1),
                "subjects_count"      : clip(np.random.randint(2, 6),     1, 20),
                "concepts_total"      : clip(np.random.randint(15, 50),   0, 200),
                "concepts_completed"  : clip(np.random.randint(5, 30),    0, 200),
            }

        elif profile == "The Deep Thinker":
            row = {
                "audio_replays"       : clip(np.random.randint(15, 40),  0, 50),
                "quiz_attempts"       : clip(np.random.randint(3, 15),    0, 100),
                "avg_quiz_score"      : clip(np.random.normal(55, 18),    0, 100),
                "notes_viewed"        : clip(np.random.randint(20, 50),   0, 100),
                "heatmap_views"       : clip(np.random.randint(20, 50),   0, 100),
                "red_zone_clicks"     : clip(np.random.randint(15, 40),   0, 50),
                "login_streak"        : clip(np.random.randint(3, 20),    0, 365),
                "days_since_last"     : clip(np.random.randint(1, 5),     0, 30),
                "total_study_minutes" : clip(np.random.normal(240, 60),   0, 600),
                "quiz_retry_rate"     : clip(np.random.uniform(0.4, 0.8), 0, 1),
                "quiz_improvement"    : clip(np.random.normal(1, 5),      -20, 30),
                "time_on_explanation" : clip(np.random.normal(70, 15),    0, 120),
                "upload_count"        : clip(np.random.randint(5, 20),    0, 100),
                "mean_confusion"      : clip(np.random.uniform(0.40, 0.70), 0, 1),
                "subjects_count"      : clip(np.random.randint(1, 4),     1, 20),
                "concepts_total"      : clip(np.random.randint(10, 40),   0, 200),
                "concepts_completed"  : clip(np.random.randint(2, 15),    0, 200),
            }

        elif profile == "The Consistent Scholar":
            row = {
                "audio_replays"       : clip(np.random.randint(3, 12),   0, 50),
                "quiz_attempts"       : clip(np.random.randint(10, 30),   0, 100),
                "avg_quiz_score"      : clip(np.random.normal(72, 10),    0, 100),
                "notes_viewed"        : clip(np.random.randint(15, 35),   0, 100),
                "heatmap_views"       : clip(np.random.randint(8, 25),    0, 100),
                "red_zone_clicks"     : clip(np.random.randint(3, 12),    0, 50),
                "login_streak"        : clip(np.random.randint(14, 90),   0, 365),
                "days_since_last"     : clip(np.random.randint(1, 2),     0, 30),
                "total_study_minutes" : clip(np.random.normal(200, 40),   0, 600),
                "quiz_retry_rate"     : clip(np.random.uniform(0.1, 0.3), 0, 1),
                "quiz_improvement"    : clip(np.random.normal(4, 4),      -20, 30),
                "time_on_explanation" : clip(np.random.normal(30, 8),     0, 120),
                "upload_count"        : clip(np.random.randint(10, 40),   0, 100),
                "mean_confusion"      : clip(np.random.uniform(0.10, 0.35), 0, 1),
                "subjects_count"      : clip(np.random.randint(2, 6),     1, 20),
                "concepts_total"      : clip(np.random.randint(25, 70),   0, 200),
                "concepts_completed"  : clip(np.random.randint(20, 65),   0, 200),
            }

        row["profile"] = profile
        rows.append(row)
    return rows

# ── CELL 5: Build dataset ─────────────────────────────────────
all_rows = []
for profile in PROFILES:
    all_rows.extend(generate_profile_data(profile, N))

df = pd.DataFrame(all_rows)
print(f"Dataset shape: {df.shape}")
print(df["profile"].value_counts())

# ── CELL 6: Add derived feature ───────────────────────────────
df["concept_completion_rate"] = (
    df["concepts_completed"] / (df["concepts_total"] + 1)
).round(4)

# ── CELL 7: Features and labels ───────────────────────────────
FEATURES = [
    "audio_replays",
    "quiz_attempts",
    "avg_quiz_score",
    "notes_viewed",
    "heatmap_views",
    "red_zone_clicks", #
    "login_streak",
    "days_since_last",
    "total_study_minutes",
    "quiz_retry_rate",
    "quiz_improvement",
    "time_on_explanation",
    "upload_count",
    "mean_confusion",
    "subjects_count",
    "concepts_total",
    "concepts_completed",
    "concept_completion_rate",
]

X = df[FEATURES].values
y = df["profile"].values

# ── CELL 8: Encode labels ─────────────────────────────────────
le = LabelEncoder()
y_encoded = le.fit_transform(y)
print("Classes:", le.classes_)

# ── CELL 9: Scale features ────────────────────────────────────
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# ── CELL 10: Train/test split ─────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
)
print(f"Train: {X_train.shape}, Test: {X_test.shape}")

# ── CELL 11: Train Random Forest ──────────────────────────────
model = RandomForestClassifier(
    n_estimators=300,
    max_depth=15,
    min_samples_split=5,
    min_samples_leaf=2,
    max_features="sqrt",
    class_weight="balanced",
    random_state=42,
    n_jobs=-1,
)
model.fit(X_train, y_train)

# ── CELL 12: Evaluate ─────────────────────────────────────────
y_pred = model.predict(X_test)
acc = (y_pred == y_test).mean()
print(f"\nTest Accuracy: {acc:.4f} ({acc*100:.2f}%)")
print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=le.classes_))

# Cross validation
cv_scores = cross_val_score(model, X_scaled, y_encoded, cv=5, scoring="accuracy")
print(f"\nCross-val accuracy: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

# ── CELL 13: Confusion matrix ─────────────────────────────────
plt.figure(figsize=(10, 8))
cm = confusion_matrix(y_test, y_pred)
sns.heatmap(
    cm,
    annot=True,
    fmt="d",
    cmap="Blues",
    xticklabels=le.classes_,
    yticklabels=le.classes_,
)
plt.title("DNA Model — Confusion Matrix")
plt.ylabel("True")
plt.xlabel("Predicted")
plt.xticks(rotation=45, ha="right")
plt.tight_layout()
plt.savefig("confusion_matrix.png", dpi=150)
plt.show()

# ── CELL 14: Feature importance ───────────────────────────────
importances = model.feature_importances_
feat_imp = pd.Series(importances, index=FEATURES).sort_values(ascending=False)

plt.figure(figsize=(10, 6))
feat_imp.plot(kind="bar", color="#6C63FF")
plt.title("DNA Model — Feature Importance")
plt.ylabel("Importance")
plt.xticks(rotation=45, ha="right")
plt.tight_layout()
plt.savefig("feature_importance.png", dpi=150)
plt.show()

print("\nTop 5 most important features:")
print(feat_imp.head())

# ── CELL 15: Save model files ─────────────────────────────────
joblib.dump(model,  "dna_model.pkl")
joblib.dump(scaler, "dna_scaler.pkl")
joblib.dump(le,     "dna_label_encoder.pkl")
joblib.dump(FEATURES, "dna_features.pkl")

# Save feature list as JSON too
with open("dna_features.json", "w") as f:
    json.dump(FEATURES, f)

print("\n✅ Saved:")
print("  dna_model.pkl")
print("  dna_scaler.pkl")
print("  dna_label_encoder.pkl")
print("  dna_features.pkl")
print("  dna_features.json")

# ── CELL 16: Quick prediction test ───────────────────────────
print("\n── Quick prediction test ──")

test_cases = [
    {
        "name": "High scorer",
        "signals": {
            "audio_replays": 2, "quiz_attempts": 25, "avg_quiz_score": 88,
            "notes_viewed": 20, "heatmap_views": 12, "red_zone_clicks": 2,
            "login_streak": 15, "days_since_last": 1, "total_study_minutes": 200,
            "quiz_retry_rate": 0.15, "quiz_improvement": 10, "time_on_explanation": 28,
            "upload_count": 12, "mean_confusion": 0.12, "subjects_count": 3,
            "concepts_total": 40, "concepts_completed": 35,
        }
    },
    {
        "name": "Heavy studier",
        "signals": {
            "audio_replays": 5, "quiz_attempts": 35, "avg_quiz_score": 62,
            "notes_viewed": 35, "heatmap_views": 20, "red_zone_clicks": 12,
            "login_streak": 25, "days_since_last": 1, "total_study_minutes": 350,
            "quiz_retry_rate": 0.35, "quiz_improvement": 3, "time_on_explanation": 45,
            "upload_count": 30, "mean_confusion": 0.32, "subjects_count": 5,
            "concepts_total": 55, "concepts_completed": 40,
        }
    },
    {
        "name": "Audio + confused",
        "signals": {
            "audio_replays": 25, "quiz_attempts": 8, "avg_quiz_score": 52,
            "notes_viewed": 35, "heatmap_views": 35, "red_zone_clicks": 28,
            "login_streak": 8, "days_since_last": 2, "total_study_minutes": 260,
            "quiz_retry_rate": 0.6, "quiz_improvement": 1, "time_on_explanation": 75,
            "upload_count": 10, "mean_confusion": 0.58, "subjects_count": 2,
            "concepts_total": 20, "concepts_completed": 5,
        }
    },
]

for case in test_cases:
    s = case["signals"]
    s["concept_completion_rate"] = s["concepts_completed"] / (s["concepts_total"] + 1)
    x = np.array([[s[f] for f in FEATURES]])
    x_scaled = scaler.transform(x)
    pred = model.predict(x_scaled)[0]
    proba = model.predict_proba(x_scaled)[0]
    profile = le.inverse_transform([pred])[0]
    confidence = proba.max()
    print(f"\n{case['name']} → {profile} ({confidence:.0%} confidence)")

# # ── CELL 17: Download files ────────────────────────────────────
# # Run this in Colab to download all model files
# from google.colab import files
# files.download("dna_model.pkl")
# files.download("dna_scaler.pkl")
# files.download("dna_label_encoder.pkl")
# files.download("dna_features.json")
# print("✅ All files downloaded!")