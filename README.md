# The-Autonomous-Stand-up-Facilitator
Personalized 1-on-1 AI Meetings Contextual Memory from Database Transcripts Automated Synthesis Leadership Summaries After all individual meetings Intelligent Blocker Detection for immediate action
# 🤖 The Autonomous Stand-up Facilitator

**The Autonomous Stand-up Facilitator** is a fully AI-powered platform that transforms daily team stand-ups into a **seamless, autonomous, and intelligent** experience.

Designed for remote or hybrid teams, it automates 1-on-1 check-ins, understands developer progress through **contextual memory**, and synthesizes leadership-ready updates — **no human moderator needed.**

---

## 🚀 Key Features

### 🗣️ Personalized 1-on-1 AI Meetings  
- Each team member engages in a natural, voice-based daily check-in with a personalized AI agent.
- Hosted via **Livekit** with **ElevenLabs**-powered voice interaction.

### 🧠 Contextual Memory & Retention  
- Stores past interactions in a **MongoDB transcript database**.
- Uses **LangChain + GPT-4** to build memory graphs and maintain continuity in daily updates.

### 📋 Automated Summary Generation  
- After all meetings, a **Leadership Summary** is auto-synthesized for stakeholders.
- Tailored by department, role, or sprint goals.

### 🚧 Intelligent Blocker Detection  
- Real-time detection of blockers using fine-tuned GPT-4 prompts.
- Immediately flags critical risks to team leads or PMs via WebSocket alerts.

---

## 🛠️ Tech Stack

| Layer               | Tools / Libraries                           |
|--------------------|----------------------------------------------|
| Backend            | Python, LangChain, OpenAI GPT-4, WebSocket   |
| Frontend           | Next.js, LiveKit, Tavus, Vercel              |
| Database           | MongoDB                                      |
| Voice Engine       | ElevenLabs                                   |
| Real-Time Comm     | LiveKit, WebSockets                          |
| Deployment         | Vercel, Git                                  |

---

## 📁 Folder Structure

Autonomous-Standup-Facilitator/
├── backend/
│ ├── memory_engine/ # LangChain logic and vector store
│ ├── transcript_db/ # MongoDB schema and queries
│ ├── blockers_detector/ # GPT-4 prompt logic
│ └── websocket_server.py # Real-time event handling
├── frontend/
│ ├── pages/ # Next.js page routes
│ ├── components/ # Reusable UI components
│ └── meeting-ui/ # LiveKit + Tavus UI for 1-on-1 sessions
├── public/ # Assets and voice avatars
├── utils/ # Logging, config, helpers
├── vercel.json # Deployment settings
├── README.md
└── requirements.txt

yaml
Copy
Edit

---

## 🧪 How It Works

1. **Daily Trigger** (Slack webhook, scheduler, or cron job)
2. Each team member joins a short, voice-driven 1-on-1 meeting
3. Transcripts are stored and analyzed for:
   - Task progress
   - Confidence and sentiment
   - Blockers or concerns
4. After all meetings:
   - GPT-4 generates a **Leadership Summary**
   - Critical blockers are sent to leads in real time

---

## ⚙️ Installation & Local Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
python websocket_server.py
