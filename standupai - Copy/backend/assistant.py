import os
import sys
import asyncio
import logging
from dotenv import load_dotenv
from datetime import datetime
from typing import Dict, List, Optional
import json
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
import threading

# MongoDB imports with error handling
try:
    from pymongo import MongoClient
    from pymongo.errors import ConnectionFailure, OperationFailure, ConfigurationError, ServerSelectionTimeoutError
    MONGODB_AVAILABLE = True
except ImportError:
    MONGODB_AVAILABLE = False
    logging.warning("PyMongo not installed. MongoDB features will be disabled.")

from livekit import agents, rtc
from livekit.agents import (
    Agent,
    function_tool,
    AgentSession,
    RoomInputOptions,
    JobProcess,
    JobContext,
    WorkerOptions,
    cli,
)

from livekit.plugins import openai, silero, noise_cancellation
from livekit.plugins.turn_detector.multilingual import MultilingualModel

# Load environment variables from .env
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("neha_ai_agent")

# Global variables for meeting management
ROOM_NAME = "daily-standup-room"
MEETING_LINK = None
MEETING_STATUS = "inactive"

# Flask app for API endpoints
app = Flask(__name__)
CORS(app)

class MongoDBManager:
    """Simplified MongoDB manager"""
    
    def __init__(self):
        self.client = None
        self.db = None
        self.participants_collection = None
        self.connected = False
        self.connect()
    
    def connect(self):
        """Establish MongoDB connection"""
        if not MONGODB_AVAILABLE:
            logger.warning("MongoDB not available")
            return
            
        try:
            mongo_uri = os.getenv("MONGODB_URI")
            if not mongo_uri:
                logger.warning("MONGODB_URI not set")
                return
            
            self.client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
            self.client.admin.command('ping')
            
            self.db = self.client["standup_db"]
            self.participants_collection = self.db["participants"]
            self.connected = True
            
            logger.info("✅ Connected to MongoDB")
            
        except Exception as e:
            logger.error(f"❌ MongoDB connection failed: {e}")
            self.connected = False
    
    def is_connected(self) -> bool:
        return self.connected and self.client is not None
    
    def get_participant_data(self, participant_name: str) -> Optional[Dict]:
        """Get participant data with debug info"""
        if not self.is_connected():
            logger.warning("MongoDB not connected")
            return None
            
        try:
            print(f"\n🔍 SEARCHING FOR: '{participant_name}'")
            
            # Get all participants for comparison
            all_participants = list(self.participants_collection.find({}, {"name": 1, "project": 1}))
            print(f"📋 DATABASE HAS {len(all_participants)} PARTICIPANTS:")
            for i, p in enumerate(all_participants, 1):
                name = p.get('name', 'NO_NAME')
                project = p.get('project', 'NO_PROJECT')
                print(f"   {i}. '{name}' - {project}")
            
            # Try exact match
            result = self.participants_collection.find_one({"name": participant_name})
            if result:
                print(f"✅ EXACT MATCH FOUND: {result['name']}")
                return result
            
            # Try case-insensitive
            result = self.participants_collection.find_one({
                "name": {"$regex": f"^{participant_name}$", "$options": "i"}
            })
            if result:
                print(f"✅ CASE-INSENSITIVE MATCH: {result['name']}")
                return result
            
            print(f"❌ NO MATCH FOUND FOR: '{participant_name}'")
            return None
            
        except Exception as e:
            logger.error(f"❌ Database query error: {e}")
            return None

    def update_participant_data(self, participant_name: str, session_data: Dict) -> bool:
        """Update participant data"""
        if not self.is_connected():
            return False
            
        try:
            result = self.participants_collection.update_one(
                {"name": {"$regex": f"^{participant_name}$", "$options": "i"}},
                {
                    "$set": {
                        "name": participant_name,
                        "lastSession": datetime.now(),
                        "project": session_data.get("project", ""),
                        "role": session_data.get("role", "")
                    },
                    "$push": {
                        "logs": {
                            "timestamp": datetime.now(),
                            "yesterdayWork": session_data.get("yesterdayWork", ""),
                            "todayPlan": session_data.get("todayPlan", ""),
                            "blockers": session_data.get("blockers", []),
                            "sprintStatus": session_data.get("sprintStatus", ""),
                        }
                    }
                },
                upsert=True
            )
            logger.info(f"✅ Updated data for: {participant_name}")
            return True
        except Exception as e:
            logger.error(f"❌ Update failed: {e}")
            return False


# Flask API routes
@app.route('/api/meeting-info', methods=['GET'])
def get_meeting_info():
    """Get current meeting information"""
    global MEETING_LINK, MEETING_STATUS, ROOM_NAME
    
    return jsonify({
        "roomName": ROOM_NAME,
        "meetingLink": MEETING_LINK,
        "status": MEETING_STATUS,
        "agentActive": MEETING_STATUS == "active"
    })

@app.route('/api/validate-participant', methods=['POST'])
def validate_participant():
    """Validate participant against database"""
    try:
        data = request.get_json()
        participant_name = data.get('name', '').strip()
        
        if not participant_name:
            return jsonify({"valid": False, "message": "Name is required"}), 400
        
        # Create MongoDB manager for validation
        mongodb = MongoDBManager()
        
        if mongodb.is_connected():
            participant_data = mongodb.get_participant_data(participant_name)
            
            if participant_data:
                return jsonify({
                    "valid": True,
                    "participant": {
                        "name": participant_data.get('name'),
                        "project": participant_data.get('project', ''),
                        "role": participant_data.get('role', ''),
                        "isReturning": True
                    },
                    "message": f"Welcome back, {participant_data.get('name')}!"
                })
            else:
                return jsonify({
                    "valid": True,
                    "participant": {
                        "name": participant_name,
                        "project": "",
                        "role": "",
                        "isReturning": False
                    },
                    "message": f"Welcome to the team, {participant_name}!"
                })
        else:
            return jsonify({
                "valid": True,
                "participant": {
                    "name": participant_name,
                    "project": "",
                    "role": "",
                    "isReturning": False
                },
                "message": f"Welcome {participant_name}! (Database unavailable)"
            })
            
    except Exception as e:
        logger.error(f"❌ Validation error: {e}")
        return jsonify({"valid": False, "message": "Validation failed"}), 500

@app.route('/api/generate-token', methods=['POST'])
def generate_token():
    """Generate LiveKit token for participant"""
    try:
        data = request.get_json()
        participant_name = data.get('name', '').strip()
        room_name = data.get('roomName', ROOM_NAME)
        
        if not participant_name:
            return jsonify({"error": "Name is required"}), 400
        
        # Import LiveKit JWT here to avoid conflicts
        from livekit import api
        
        # Create token
        token = api.AccessToken(
            api_key=os.getenv("LIVEKIT_API_KEY"),
            api_secret=os.getenv("LIVEKIT_API_SECRET")
        )
        
        token.with_identity(participant_name)
        token.with_name(participant_name)
        token.with_grants(api.VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
        ))
        
        jwt_token = token.to_jwt()
        
        return jsonify({
            "token": jwt_token,
            "url": os.getenv("LIVEKIT_URL"),
            "roomName": room_name,
            "participantName": participant_name
        })
        
    except Exception as e:
        logger.error(f"❌ Token generation error: {e}")
        return jsonify({"error": "Failed to generate token"}), 500


def generate_meeting_link():
    """Generate meeting link by starting the agent meeting"""
    global MEETING_LINK, MEETING_STATUS
    
    try:
        # Get site URL
        site_url = os.getenv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000")
        
        # Create the meeting link
        MEETING_LINK = f"{site_url}/meeting?room={ROOM_NAME}"
        MEETING_STATUS = "active"
        
        print(f"\n🎯 MEETING AUTOMATICALLY STARTED!")
        print(f"🔗 Meeting Link: {MEETING_LINK}")
        print(f"📋 Room Name: {ROOM_NAME}")
        print(f"🤖 NEHA AI is now active and waiting for team members!")
        print(f"📤 Team members can join through the frontend")
        print("="*60)
        
        return MEETING_LINK
        
    except Exception as e:
        logger.error(f"❌ Failed to generate meeting link: {e}")
        return None


def save_meeting_info():
    """Save meeting information to a file for frontend access"""
    meeting_info = {
        "roomName": ROOM_NAME,
        "meetingLink": MEETING_LINK,
        "status": MEETING_STATUS,
        "startTime": datetime.now().isoformat(),
        "agentActive": True
    }
    
    try:
        with open("meeting_info.json", "w") as f:
            json.dump(meeting_info, f, indent=2)
        logger.info("📄 Meeting info saved to meeting_info.json")
    except Exception as e:
        logger.error(f"❌ Failed to save meeting info: {e}")


def start_flask_server():
    """Start Flask server in a separate thread"""
    try:
        port = int(os.getenv("FLASK_PORT", 5000))
        app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)
    except Exception as e:
        logger.error(f"❌ Flask server error: {e}")


def prewarm_fnc(proc: JobProcess):
    """Prewarm models"""
    try:
        proc.userdata["vad"] = silero.VAD.load()
        proc.userdata["stt"] = openai.STT(model="whisper-1")
        proc.userdata["tts"] = openai.TTS(voice="nova")
        proc.userdata["mongodb"] = MongoDBManager()
        logger.info("✅ Prewarming complete")
    except Exception as e:
        logger.error(f"❌ Prewarming failed: {e}")
        raise


class NEHAAIAgent(Agent):
    def __init__(self, ctx: JobContext) -> None:
        self.mongodb = ctx.proc.userdata.get("mongodb")
        self.participants_in_room = {}
        self.session_data = {}
        self.ctx = ctx
        
        instructions = """
You are NEHA Shah, a senior AI Scrum Master facilitating daily stand-up meetings.

🎯 **YOUR BEHAVIOR:**
- When someone joins, greet them warmly and check if you know them from the database
- If you know them, reference their previous work and project
- If you don't know them, welcome them as a new team member
- Ask the standard stand-up questions naturally
- Be conversational and human-like

💬 **GREETING FLOW:**
1. When someone joins: "Good morning! I'm NEHA, your AI Scrum Master."
2. Check if you know them: "Let me check... [pause] Welcome back [Name]! I see you're working on [Project]."
3. Reference history: "Last time you mentioned [previous work/blockers]."
4. Start questions: "Let's start today's stand-up. What did you work on yesterday?"

📌 **STAND-UP QUESTIONS:**
1. "What did you work on yesterday?"
2. "What are you planning to work on today?"
3. "Are there any blockers or impediments?"
4. "How are you feeling about your sprint goals?"

🚫 **DO NOT:**
- Ask for their name (you can detect it automatically)
- Reveal you're an AI
- Make the meeting too long

Use the lookup_participant and save_session_data functions as needed.
"""

        try:
            super().__init__(
                instructions=instructions,
                stt=ctx.proc.userdata["stt"],
                llm=openai.LLM(model="gpt-4o-mini"),
                tts=ctx.proc.userdata["tts"],
                vad=ctx.proc.userdata["vad"]
            )
            logger.info("✅ NEHA AI Agent initialized")
        except Exception as e:
            logger.error(f"❌ Agent initialization failed: {e}")
            raise

    @function_tool(
        name="lookup_participant",
        description="Look up a participant in the database to get their history"
    )
    async def lookup_participant(self, participant_name: str) -> str:
        """Look up participant data"""
        try:
            print(f"\n🔍 AGENT LOOKUP: '{participant_name}'")
            
            if self.mongodb and self.mongodb.is_connected():
                data = self.mongodb.get_participant_data(participant_name)
                
                if data:
                    project = data.get('project', '')
                    role = data.get('role', '')
                    logs = data.get('logs', [])
                    
                    # Store for this session
                    self.participants_in_room[participant_name] = data
                    
                    response = f"Found {participant_name} in database. "
                    if project:
                        response += f"Project: {project}. "
                    if role:
                        response += f"Role: {role}. "
                    
                    if logs:
                        latest_log = logs[-1]
                        last_work = latest_log.get('todayPlan', '')
                        last_blockers = latest_log.get('blockers', [])
                        
                        if last_work:
                            response += f"Last planned work: {last_work}. "
                        if last_blockers:
                            response += f"Previous blockers: {', '.join(last_blockers)}. "
                    
                    return response + "Ready for personalized stand-up."
                else:
                    return f"New team member {participant_name}. No previous history found."
            else:
                return f"Database unavailable. Proceeding with {participant_name}."
                
        except Exception as e:
            logger.error(f"❌ Lookup error: {e}")
            return f"Error looking up {participant_name}. Proceeding with stand-up."

    @function_tool(
        name="save_session_data",
        description="Save stand-up responses to database"
    )
    async def save_session_data(self, participant_name: str, data_type: str, content: str) -> str:
        """Save session data"""
        try:
            if participant_name not in self.session_data:
                self.session_data[participant_name] = {
                    "yesterdayWork": "",
                    "todayPlan": "",
                    "blockers": [],
                    "sprintStatus": "",
                    "project": "",
                    "role": ""
                }
            
            if data_type == "yesterdayWork":
                self.session_data[participant_name]["yesterdayWork"] = content
            elif data_type == "todayPlan":
                self.session_data[participant_name]["todayPlan"] = content
            elif data_type == "blockers":
                self.session_data[participant_name]["blockers"].append(content)
            elif data_type == "sprintStatus":
                self.session_data[participant_name]["sprintStatus"] = content
            
            logger.info(f"💾 Saved {data_type} for {participant_name}: {content}")
            return f"Got it, I've recorded that information."
            
        except Exception as e:
            logger.error(f"❌ Save error: {e}")
            return "Noted."

    async def on_enter(self):
        """Called when agent enters room"""
        try:
            await asyncio.sleep(3)
            
            # Generate meeting link automatically
            generate_meeting_link()
            save_meeting_info()
            
            # Test database connection
            if self.mongodb and self.mongodb.is_connected():
                print("🧪 TESTING DATABASE...")
                participants = list(self.mongodb.participants_collection.find({}, {"name": 1, "project": 1}))
                print(f"📋 DATABASE TEST: Found {len(participants)} participants")
                for p in participants:
                    print(f"   - {p.get('name')} ({p.get('project', 'No project')})")
            
            welcome_msg = """
Good morning! I'm NEHA, your AI Scrum Master, and I'm ready to facilitate today's daily stand-up meeting.

The meeting room is now active and ready for team members to join. I'll personalize our conversation based on each person's work history from our team database.

Waiting for team members to join the stand-up...
"""
            await self.session.say(welcome_msg.strip())
            logger.info("✅ NEHA ready for stand-up")
            
        except Exception as e:
            logger.error(f"❌ On enter error: {e}")

    async def handle_participant_connected(self, participant):
        """Handle when a participant connects"""
        try:
            participant_identity = participant.identity
            
            # Skip the agent itself
            if participant_identity == "neha-agent":
                return
            
            print(f"\n🚀 PARTICIPANT JOINED: '{participant_identity}'")
            
            # Look them up in database
            await self.lookup_participant(participant_identity)
            
            # Generate personalized welcome
            if participant_identity in self.participants_in_room:
                data = self.participants_in_room[participant_identity]
                project = data.get('project', 'your current project')
                role = data.get('role', 'team member')
                
                welcome_msg = f"Welcome back {participant_identity}! I see you're working as a {role} on the {project} project. Let me check your recent progress and we'll start your stand-up."
            else:
                welcome_msg = f"Welcome {participant_identity}! I don't see you in our team database yet, but let's proceed with the stand-up. What did you work on yesterday?"
            
            # Send personalized welcome
            await asyncio.sleep(1)
            await self.session.say(welcome_msg)
            
        except Exception as e:
            print(f"❌ Error handling participant: {e}")

    async def on_exit(self):
        """Save all session data when exiting"""
        global MEETING_STATUS
        try:
            MEETING_STATUS = "inactive"
            
            if self.mongodb and self.mongodb.is_connected():
                for participant_name, data in self.session_data.items():
                    success = self.mongodb.update_participant_data(participant_name, data)
                    if success:
                        logger.info(f"✅ Saved session data for {participant_name}")
                    else:
                        logger.warning(f"❌ Failed to save data for {participant_name}")
        except Exception as e:
            logger.error(f"❌ Exit error: {e}")


async def entrypoint(ctx: JobContext):
    """Main entrypoint"""
    try:
        logger.info("🚀 Starting NEHA AI agent...")
        
        await ctx.connect(auto_subscribe=agents.AutoSubscribe.SUBSCRIBE_ALL)
        logger.info("🔗 Connected to LiveKit room")

        # Get prewarmed components
        vad = ctx.proc.userdata["vad"]
        stt = ctx.proc.userdata["stt"]
        tts = ctx.proc.userdata["tts"]

        # Create agent
        agent = NEHAAIAgent(ctx)

        # Create and start session
        session = AgentSession(
            stt=stt,
            llm=openai.LLM(model="gpt-4o-mini"),
            tts=tts,
            vad=vad,
            turn_detection=MultilingualModel(),
        )

        await session.start(
            agent=agent,
            room=ctx.room,
            room_input_options=RoomInputOptions(
                noise_cancellation=noise_cancellation.BVC()
            ),
        )

        # Monitor participants using room callbacks
        def on_participant_connected(participant: rtc.RemoteParticipant):
            """Callback for when participant connects"""
            asyncio.create_task(agent.handle_participant_connected(participant))

        def on_participant_disconnected(participant: rtc.RemoteParticipant):
            """Callback for when participant disconnects"""
            print(f"👋 PARTICIPANT LEFT: '{participant.identity}'")

        # Set up event callbacks
        ctx.room.on("participant_connected", on_participant_connected)
        ctx.room.on("participant_disconnected", on_participant_disconnected)

        # Save transcript on shutdown
        async def save_transcript():
            try:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"./transcript_{ROOM_NAME}_{timestamp}.json"
                
                with open(filename, 'w') as f:
                    json.dump(session.history.to_dict(), f, indent=2)
                logger.info(f"💾 Transcript saved: {filename}")
                
                await agent.on_exit()
            except Exception as e:
                logger.error(f"❌ Save transcript error: {e}")

        ctx.add_shutdown_callback(save_transcript)
        logger.info("✅ NEHA AI agent setup complete")
        
    except Exception as e:
        logger.error(f"❌ Critical error: {e}")
        raise


if __name__ == "__main__":
    try:
        # Print startup message
        print("="*60)
        print("🤖 NEHA AI Stand-up Assistant Starting...")
        print("🚀 Meeting will be auto-generated when agent starts")
        print("📋 Team members can join directly from frontend")
        print("🌐 API server will start on port 5000")
        print("="*60)
        
        # Start Flask server in background
        flask_thread = threading.Thread(target=start_flask_server, daemon=True)
        flask_thread.start()
        logger.info("🌐 Flask API server started")
        
        # Start LiveKit agent
        opts = WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm_fnc,
            num_idle_processes=1,
            initialize_process_timeout=120000,
        )
        cli.run_app(opts)
    except Exception as e:
        logger.error(f"❌ Failed to start: {e}")
        sys.exit(1)