# 🧠 Gyaani AI
### AI-Powered Personalized Learning & Cognitive Insight System  

> From Notes → Understanding → Personalization → Insight  

---

```markdown
🔗 Live Demo: <your deployed link>  
🎥 Demo Video: <your video link>
```

## 🚀 Overview

StudyBuddy is an AI-driven learning platform designed to transform how students study, understand, and improve.

Unlike traditional tools that only deliver content, StudyBuddy focuses on **understanding the learner** by combining:
- Multi-modal AI
- Behavioral analytics
- Cognitive insights
- Personalized learning pipelines  

---

## ▶️ How to Run the Project

Follow these steps to run StudyBuddy locally:

---

### 🔹 1. Clone the Repository

```bash
git clone <YOUR_REPO_LINK>
cd <PROJECT_FOLDER>
```

---

### 🔹 2. Backend Setup (FastAPI)

Navigate to the backend folder:
```bash
cd backend
```

Install the required dependencies:
```bash
pip install -r requirements.txt
```

Run the server:
```bash
uvicorn main:app --reload
```

👉 **Backend will run at:** [http://127.0.0.1:8000](http://127.0.0.1:8000)

---

### 🔹 3. Frontend Setup (React / Next.js)

Open a **new terminal** and navigate to the frontend folder:
```bash
cd frontend
```

Install the required dependencies:
```bash
npm install
```

Run the frontend:
```bash
npm run dev
```

👉 **Visit in browser:** [http://localhost:3000](http://localhost:3000)

---

#### ⚠️ Notes

* Make sure the backend is running before starting the frontend.
* Ensure all environment variables (API keys for Azure / GPT) are configured.
* Use Python 3.9+ and Node.js 18+ for the best compatibility.

## 🎯 Problem

Students often:
- Don’t know what they don’t understand  
- Study without structured guidance  
- Lack personalized feedback  
- Experience stress without awareness  

Current solutions focus on *content*, not *comprehension or cognition*.

---

## 💡 Solution

StudyBuddy converts raw study inputs into:
- Structured explanations  
- Adaptive quizzes  
- Concept graphs  
- Behavioral insights  
- Stress & learner profiling  

---

## ⚙️ Core Features

### 📥 Smart Input System
- Handwritten notes upload (OCR-based)
- Syllabus input (text/image)
- YouTube video summarization

---

### 🧠 AI Processing Engine
- Vision OCR (text + equations extraction)
- GPT-based structured explanation generation
- Multi-language support (English + Indian languages)

---

### 🔥 Cognitive Analysis (Key Innovation)
- Confusion Heatmap (detects unclear regions in notes)
- Behavioral Signals Extraction:
  - Quiz patterns  
  - Chat interactions  
  - Study timing  

---

### 🧬 Intelligence Layer
- **Stress Prediction Model (34 features)**
  - Tracks trends over time  
- **DNA Model (Learner Persona)**
  - Classifies users (Scholar, Hustler, Curious Mind, etc.)

---

### 🧩 Learning System
- Constellation Graph (topic dependency mapping)
- Dynamic node states (progress tracking)
- Direct navigation to notes & content generation

---

### 🎯 Personalized Learning
- Adaptive Quiz Generator (difficulty, time, constraints)
- Context-aware Chatbots (notes + quiz + general)
- Sticky Notes layer on uploaded notes
- Video Summary + Quiz system

---

### 🌍 Accessibility
- Multi-language explanations
- Speech-to-speech interaction
- Designed for inclusive learning

---

### 🛡️ Responsible AI
- Azure Content Safety integration  
- Blocks unsafe/illegal uploads at entry point  

---

## 📊 Insights & Analytics
- Quiz performance tracking  
- Stress trend visualization  
- Learning behavior analysis  
- Personalized feedback loop  

---

## ☁️ Architecture

- Azure Blob Storage → Notes & media  
- Azure Cosmos DB → User & metadata  
- GPT-4.1 → Explanation, quiz, chat  
- Azure Vision → OCR  
- Azure Speech → Voice interaction  

---

## 🚀 Impact

StudyBuddy shifts learning from:
**“What you study” → to → “How well you understand”**

It enables:
- Early confusion detection  
- Personalized learning paths  
- Mental state awareness  
- Scalable education systems  

---

## 🧪 Tech Stack

- Frontend: React / Next.js  
- Backend: Node.js / APIs  
- AI Models: GPT-4.1, Azure Vision, Azure Speech  
- ML Models: Stress Prediction + Persona Classification  
- Cloud: Azure (Blob, Cosmos DB)  

---

## 📌 Future Scope

- Real-time adaptive learning paths  
- Institutional deployment (schools/colleges)  
- Advanced mental health insights  
- AI-driven mentorship system  
