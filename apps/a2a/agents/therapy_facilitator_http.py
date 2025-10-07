"""
AI Therapy Facilitator - HTTP Only

Uses HTTP to send messages and polls database for participant responses.
No Socket.IO - just simple HTTP requests.
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

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://humaid:password@localhost:5432/rouh')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

if not OPENAI_API_KEY:
    print("ERROR: OPENAI_API_KEY not set!")
    sys.exit(1)

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

class AITherapyFacilitator:
    """
    AI-powered therapy facilitator using OpenAI + HTTP polling.
    """

    def __init__(self, run_id: str):
        self.run_id = run_id
        self.db = None
        self.run = None
        self.participants = {}
        self.last_message_check = datetime.utcnow()

    async def connect(self):
        self.db = psycopg2.connect(DATABASE_URL)
        await self.load_run()

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
        """Send AI-generated message to participant via HTTP"""
        participant = self.participants.get(participant_role)
        if not participant:
            return

        message_data = {
            'runId': self.run_id,
            'participantId': participant['id'],
            'from': 'facilitator',
            'to': participant['metadata'].get('name'),
            'text': message,
            'messageType': 'message'
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                'http://localhost:3001/coordination/facilitator/message',
                json=message_data,
                headers={'Content-Type': 'application/json'}
            ) as resp:
                if resp.status in [200, 201]:
                    result = await resp.json()
                    print(f"📤 Sent to {participant['metadata'].get('name')}: {message[:50]}... (ID: {result.get('messageId')})")
                else:
                    print(f"⚠️  Failed to send message: HTTP {resp.status}")

    async def check_for_participant_messages(self):
        """Poll database for new participant messages"""
        cursor = self.db.cursor(cursor_factory=RealDictCursor)

        # Get messages since last check
        cursor.execute('''
            SELECT m.*, p."metadata" as participant_metadata, r.name as role_name
            FROM "RunMessage" m
            JOIN "RunParticipant" p ON m."participantId" = p.id
            JOIN "TemplateRole" r ON p."roleId" = r.id
            WHERE m."runId" = %s
              AND m."from" != 'facilitator'
              AND m."createdAt" > %s
            ORDER BY m."createdAt" ASC
        ''', (self.run_id, self.last_message_check))

        messages = cursor.fetchall()
        cursor.close()

        if messages:
            self.last_message_check = messages[-1]['createdAt']

        return messages

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

    async def handle_participant_message(self, message_data):
        """Handle participant message and generate AI response"""
        participant_name = message_data['participant_metadata'].get('name')
        role_name = message_data['role_name']
        text = message_data['text']

        print(f"📨 Received from {participant_name}: {text[:50]}...")

        # Generate AI response
        context = f"{participant_name} said: '{text}'. Generate a therapeutic response."
        response = await self.generate_facilitator_response(context, participant_name)

        # Send response back
        await self.send_message(role_name, response)

    async def run_session(self):
        """Run AI-facilitated therapy session"""
        print("\n" + "="*60)
        print("🤖 AI Therapy Facilitator Starting (HTTP-only, gpt-4o-mini)")
        print("="*60 + "\n")

        # Warmup - send initial messages
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

        print("\n✅ AI facilitator polling for participant messages...")

        # Poll for messages every 3 seconds
        try:
            while True:
                await asyncio.sleep(3)

                messages = await self.check_for_participant_messages()

                for msg in messages:
                    await self.handle_participant_message(msg)

        except KeyboardInterrupt:
            print("\n👋 AI facilitator shutting down...")


async def main():
    if len(sys.argv) < 2:
        print("Usage: python3 therapy_facilitator_http.py <run_id>")
        sys.exit(1)

    run_id = sys.argv[1]
    facilitator = AITherapyFacilitator(run_id)

    try:
        await facilitator.connect()
        await facilitator.run_session()
    finally:
        if facilitator.db:
            facilitator.db.close()


if __name__ == '__main__':
    asyncio.run(main())
