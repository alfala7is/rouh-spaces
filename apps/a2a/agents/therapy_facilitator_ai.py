"""
AI Therapy Facilitator - REAL MVP

Uses OpenAI to facilitate conversations between Emma and Jake.
Listens to their messages and responds intelligently.
"""

import sys
import os
import asyncio
import json
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
import aiohttp
from openai import AsyncOpenAI
import socketio

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://humaid:password@localhost:5432/rouh')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

if not OPENAI_API_KEY:
    print("ERROR: OPENAI_API_KEY not set!")
    sys.exit(1)

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)
sio = socketio.AsyncClient()

class AITherapyFacilitator:
    """
    AI-powered therapy facilitator using OpenAI.
    """

    def __init__(self, run_id: str):
        self.run_id = run_id
        self.db = None
        self.run = None
        self.participants = {}
        self.conversation_history = []

    async def connect(self):
        self.db = psycopg2.connect(DATABASE_URL)
        await self.load_run()

        # Set up Socket.IO event handler FIRST
        @sio.on('participant:message')
        async def on_participant_message(data):
            print(f"🎯 RAW EVENT RECEIVED: participant:message = {data}")
            await self.handle_participant_message(data)

        @sio.event
        async def connect():
            print("🔌 Socket.IO connected!")

        @sio.event
        async def disconnect():
            print("🔌 Socket.IO disconnected!")

        @sio.on('*')
        async def catch_all(event, data):
            print(f"📡 ANY EVENT: {event} = {data}")

        # THEN connect to Socket.IO and join run room
        await sio.connect('http://localhost:3001')
        print(f"📡 Emitting joinCoordinationRun for {self.run_id}...")

        # Emit join event
        await sio.emit('joinCoordinationRun', {'runId': self.run_id})
        # Small delay to ensure message is sent before continuing
        await asyncio.sleep(0.5)
        print(f"✓ AI Facilitator joined Socket.IO room: run:{self.run_id}")
        
    async def load_run(self):
        cursor = self.db.cursor(cursor_factory=RealDictCursor)
        cursor.execute('''
            SELECT r.*, s.name as state_name
            FROM "CoordinationRun" r
            JOIN "TemplateState" s ON r."currentStateId" = s.id
            WHERE r.id = %s
        ''', (self.run_id,))
        
        self.run = cursor.fetchone()
        print(f"✓ Loaded run: {self.run['id']}")
        
        cursor.execute('''
            SELECT p.*, r.name as role_name
            FROM "RunParticipant" p
            JOIN "TemplateRole" r ON p."roleId" = r.id
            WHERE p."runId" = %s
        ''', (self.run_id,))
        
        for p in cursor.fetchall():
            self.participants[p['role_name']] = p
            print(f"  Participant: {p['metadata'].get('name')} ({p['role_name']})")
        
        cursor.close()
        
    async def send_message(self, participant_role: str, message: str):
        """Send AI-generated message to participant"""
        participant = self.participants.get(participant_role)
        if not participant:
            return
            
        message_data = {
            'runId': self.run_id,
            'participantId': participant['id'],
            'from': 'facilitator',
            'to': participant['metadata'].get('name'),
            'timestamp': datetime.utcnow().isoformat(),
            'text': message,
            'type': 'message'
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                'http://localhost:3001/coordination/facilitator/message',
                json=message_data
            ) as resp:
                if resp.status in [200, 201]:
                    print(f"📤 AI → {participant['metadata'].get('name')}: {message[:80]}...")
                    
    async def generate_facilitator_response(self, context: str, participant_name: str) -> str:
        """Use OpenAI to generate therapeutic facilitator response"""
        
        system_prompt = """You are a compassionate therapy facilitator guiding a couple (Emma and Jake) through a structured check-in conversation.

Your role:
- Guide them through: warmup → sharing → listening → reflection
- Ask open questions
- Reflect feelings back
- Keep it brief (1-2 sentences)
- Be warm and supportive"""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Context: {context}\n\nGenerate your next message to {participant_name}:"}
        ]
        
        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=150,
            temperature=0.7
        )
        
        return response.choices[0].message.content.strip()

    async def handle_participant_message(self, data):
        """Handle incoming participant messages and generate AI responses"""
        participant_id = data.get('participantId')
        text = data.get('text')

        if not participant_id or not text:
            return

        # Find which participant sent this
        participant_role = None
        participant_name = None
        for role, p in self.participants.items():
            if p['id'] == participant_id:
                participant_role = role
                participant_name = p['metadata'].get('name')
                break

        if not participant_role:
            return

        print(f"📨 Received from {participant_name}: {text[:50]}...")

        # Add to conversation history
        self.conversation_history.append({
            'from': participant_name,
            'text': text,
            'timestamp': datetime.utcnow().isoformat()
        })

        # Generate AI response
        context = f"{participant_name} said: '{text}'. Generate a therapeutic response."
        response = await self.generate_facilitator_response(context, participant_name)

        # Send response back
        await self.send_message(participant_role, response)

    async def run_session(self):
        """Run AI-facilitated therapy session"""
        print("\n" + "="*60)
        print("🤖 AI Therapy Facilitator Starting (gpt-4o-mini)")
        print("="*60 + "\n")

        # Warmup
        emma_greeting = await self.generate_facilitator_response(
            "Starting therapy check-in session. Warmup phase - ask Emma how she's feeling",
            "Emma"
        )
        await self.send_message('participant_a', emma_greeting)

        jake_greeting = await self.generate_facilitator_response(
            "Starting therapy check-in session. Warmup phase - ask Jake how he's feeling",
            "Jake"
        )
        await self.send_message('participant_b', jake_greeting)

        print("\n✅ AI facilitator listening for participant messages...")

        # Keep alive - prevent script from exiting
        print("🎧 AI is listening for events (Ctrl+C to stop)...")
        try:
            # Create a future that never completes to keep event loop running
            await asyncio.Event().wait()
        except KeyboardInterrupt:
            print("\n👋 AI facilitator shutting down...")
        

async def main():
    if len(sys.argv) < 2:
        print("Usage: python3 therapy_facilitator_ai.py <run_id>")
        sys.exit(1)
        
    run_id = sys.argv[1]
    facilitator = AITherapyFacilitator(run_id)
    
    try:
        await facilitator.connect()
        await facilitator.run_session()
    finally:
        if facilitator.db:
            facilitator.db.close()
        await sio.disconnect()


if __name__ == '__main__':
    asyncio.run(main())
