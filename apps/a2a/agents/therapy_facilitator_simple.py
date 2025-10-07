"""
Simple Therapy Facilitator Agent

MVP version - direct database access, simple Socket.IO messages.
No complex coordination service, just works.

Usage:
    python3 therapy_facilitator_simple.py <run_id>
"""

import sys
import os
import asyncio
import json
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
import socketio

# Database connection
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://humaid:password@localhost:5432/rouh')

# Socket.IO client
sio = socketio.AsyncClient()

class TherapyFacilitator:
    """
    Simple facilitator for therapy sessions.
    Guides two participants through 4 conversation phases.
    """

    def __init__(self, run_id: str):
        self.run_id = run_id
        self.db = None
        self.run = None
        self.participants = {}
        self.current_state = None

    async def connect(self):
        """Connect to database and Socket.IO"""
        # Database
        self.db = psycopg2.connect(DATABASE_URL)

        # Socket.IO - connect to API server
        await sio.connect('http://localhost:3001')
        print('✓ Connected to Socket.IO')

        # Load run data
        await self.load_run()

    async def load_run(self):
        """Load run and participant data from database"""
        cursor = self.db.cursor(cursor_factory=RealDictCursor)

        # Get run
        cursor.execute('''
            SELECT r.*, s.name as state_name, s.type as state_type, s.sequence
            FROM "CoordinationRun" r
            JOIN "TemplateState" s ON r."currentStateId" = s.id
            WHERE r.id = %s
        ''', (self.run_id,))

        self.run = cursor.fetchone()

        if not self.run:
            raise Exception(f"Run {self.run_id} not found")

        print(f"✓ Loaded run: {self.run['id']}")
        print(f"  Current state: {self.run['state_name']} (sequence {self.run['sequence']})")

        # Get participants
        cursor.execute('''
            SELECT p.*, r.name as role_name
            FROM "RunParticipant" p
            JOIN "TemplateRole" r ON p."roleId" = r.id
            WHERE p."runId" = %s
        ''', (self.run_id,))

        for participant in cursor.fetchall():
            self.participants[participant['role_name']] = participant
            print(f"  Participant: {participant['metadata'].get('name')} ({participant['role_name']})")

        cursor.close()

    async def send_message(self, participant_role: str, message: dict):
        """Send message to specific participant via HTTP API"""
        participant = self.participants.get(participant_role)
        if not participant:
            print(f"⚠️  Participant {participant_role} not found")
            return

        # Prepare message with participant info
        message_data = {
            'runId': self.run_id,
            'participantId': participant['id'],
            'magicToken': participant['magicToken'],
            'from': 'facilitator',
            'to': participant['metadata'].get('name'),
            'timestamp': datetime.utcnow().isoformat(),
            **message
        }

        # Send via HTTP API instead of Socket.IO
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f'http://localhost:3001/coordination/facilitator/message',
                json=message_data,
                headers={'Content-Type': 'application/json'}
            ) as resp:
                if resp.status in [200, 201]:
                    print(f"📤 Sent to {participant['metadata'].get('name')}: {message.get('text', '')[:50]}...")
                else:
                    print(f"⚠️  Failed to send message: HTTP {resp.status}")

    async def wait_for_response(self, participant_role: str, slot_name: str, timeout: int = 300):
        """Wait for participant response by polling slotData"""
        print(f"⏳ Waiting for {participant_role} to fill {slot_name}...")

        start_time = asyncio.get_event_loop().time()

        while True:
            # Check if timeout
            if asyncio.get_event_loop().time() - start_time > timeout:
                print(f"⏰ Timeout waiting for {slot_name}")
                return None

            # Poll database for slot data
            cursor = self.db.cursor(cursor_factory=RealDictCursor)
            cursor.execute('''
                SELECT "slotData"
                FROM "RunState"
                WHERE "runId" = %s AND "exitedAt" IS NULL
                ORDER BY "enteredAt" DESC
                LIMIT 1
            ''', (self.run_id,))

            result = cursor.fetchone()
            cursor.close()

            if result and result['slotData'].get(slot_name):
                response = result['slotData'][slot_name]
                print(f"✓ Received: {slot_name} = {response}")
                return response

            # Wait before polling again
            await asyncio.sleep(2)

    async def update_slot_data(self, slot_name: str, value: any):
        """Update slot data in current run state"""
        cursor = self.db.cursor()

        # Get current slot data
        cursor.execute('''
            SELECT "slotData"
            FROM "RunState"
            WHERE "runId" = %s AND "exitedAt" IS NULL
            ORDER BY "enteredAt" DESC
            LIMIT 1
        ''', (self.run_id,))

        result = cursor.fetchone()
        slot_data = result[0] if result else {}

        # Update
        slot_data[slot_name] = value

        cursor.execute('''
            UPDATE "RunState"
            SET "slotData" = %s
            WHERE "runId" = %s AND "exitedAt" IS NULL
        ''', (json.dumps(slot_data), self.run_id))

        self.db.commit()
        cursor.close()

    async def transition_to_next_state(self, next_state_name: str):
        """Move to next state"""
        cursor = self.db.cursor(cursor_factory=RealDictCursor)

        # Get next state
        cursor.execute('''
            SELECT * FROM "TemplateState"
            WHERE "templateId" = %s AND name = %s
        ''', (self.run['templateId'], next_state_name))

        next_state = cursor.fetchone()

        if not next_state:
            print(f"⚠️  State {next_state_name} not found")
            return

        # Mark current state as exited
        cursor.execute('''
            UPDATE "RunState"
            SET "exitedAt" = NOW()
            WHERE "runId" = %s AND "exitedAt" IS NULL
        ''', (self.run_id,))

        # Create new run state with UUID
        import uuid
        cursor.execute('''
            INSERT INTO "RunState" (id, "runId", "stateId", "slotData", "metadata")
            VALUES (%s, %s, %s, %s, %s)
        ''', (str(uuid.uuid4()), self.run_id, next_state['id'], json.dumps({}), json.dumps({})))

        # Update run's current state
        cursor.execute('''
            UPDATE "CoordinationRun"
            SET "currentStateId" = %s
            WHERE id = %s
        ''', (next_state['id'], self.run_id))

        self.db.commit()
        cursor.close()

        print(f"✓ Transitioned to state: {next_state_name}")

    async def complete_run(self):
        """Mark run as completed"""
        cursor = self.db.cursor()

        cursor.execute('''
            UPDATE "CoordinationRun"
            SET status = 'completed', "completedAt" = NOW()
            WHERE id = %s
        ''', (self.run_id,))

        self.db.commit()
        cursor.close()

        print("✅ Run completed!")

    # ==================================================================
    # STATE HANDLERS
    # ==================================================================

    async def state_warmup(self):
        """State 1: Mood check-in"""
        print("\n🌅 STATE 1: Warmup Check-In")

        # Send to Emma
        await self.send_message('participant_a', {
            'text': "Hi Emma! Ready for tonight's check-in? Let's start simple. How are you feeling right now?",
            'type': 'button_choice',
            'options': ['Joyful', 'Content', 'Neutral', 'Stressed', 'Sad', 'Anxious', 'Angry'],
            'slot': 'mood_a'
        })

        # Send to Jake
        await self.send_message('participant_b', {
            'text': "Hey Jake! Time for our check-in. How are you feeling tonight?",
            'type': 'button_choice',
            'options': ['Joyful', 'Content', 'Neutral', 'Stressed', 'Sad', 'Anxious', 'Angry'],
            'slot': 'mood_b'
        })

        # Wait for both responses
        emma_mood = await self.wait_for_response('participant_a', 'mood_a')
        jake_mood = await self.wait_for_response('participant_b', 'mood_b')

        # Acknowledge
        await self.send_message('participant_a', {
            'text': f"Thanks, Emma. I hear you're feeling {emma_mood}. Let's move forward.",
            'type': 'info'
        })

        await self.send_message('participant_b', {
            'text': f"Thanks, Jake. I hear you're feeling {jake_mood}. Let's continue.",
            'type': 'info'
        })

    async def state_share_a(self):
        """State 2: Participant A shares, B listens"""
        print("\n💬 STATE 2: Emma Shares, Jake Listens")

        # Prompt Emma to share
        await self.send_message('participant_a', {
            'text': "Emma, what's been on your mind today? Take your time to share. Jake is here to listen.",
            'type': 'text_input',
            'slot': 'share_a_topic'
        })

        # Prompt Jake to prepare to listen
        await self.send_message('participant_b', {
            'text': "Jake, Emma is about to share something. Your job is to listen deeply and reflect back what you hear. Don't try to fix it, just understand.",
            'type': 'info'
        })

        # Wait for Emma's share
        emma_share = await self.wait_for_response('participant_a', 'share_a_topic')

        # Show Jake what Emma said
        await self.send_message('participant_b', {
            'text': f"Emma shared: \"{emma_share}\"\n\nJake, what did you hear? Try to reflect back what she's feeling. Start with \"It sounds like you're feeling...\"",
            'type': 'text_input',
            'slot': 'share_a_reflection'
        })

        # Wait for Jake's reflection
        jake_reflection = await self.wait_for_response('participant_b', 'share_a_reflection')

        # Show Emma Jake's reflection
        await self.send_message('participant_a', {
            'text': f"Jake's reflection: \"{jake_reflection}\"",
            'type': 'info'
        })

    async def state_share_b(self):
        """State 3: Participant B shares, A listens"""
        print("\n💬 STATE 3: Jake Shares, Emma Listens")

        # Same pattern, roles reversed
        await self.send_message('participant_b', {
            'text': "Jake, your turn. What's been on your mind? Emma is here to listen.",
            'type': 'text_input',
            'slot': 'share_b_topic'
        })

        await self.send_message('participant_a', {
            'text': "Emma, Jake is about to share. Listen carefully and then reflect back what you hear.",
            'type': 'info'
        })

        jake_share = await self.wait_for_response('participant_b', 'share_b_topic')

        await self.send_message('participant_a', {
            'text': f"Jake shared: \"{jake_share}\"\n\nEmma, what did you hear?",
            'type': 'text_input',
            'slot': 'share_b_reflection'
        })

        emma_reflection = await self.wait_for_response('participant_a', 'share_b_reflection')

        await self.send_message('participant_b', {
            'text': f"Emma's reflection: \"{emma_reflection}\"",
            'type': 'info'
        })

    async def state_reflection(self):
        """State 4: Rate the session"""
        print("\n⭐ STATE 4: Session Reflection")

        # Ask both to rate
        await self.send_message('participant_a', {
            'text': "Emma, on a scale of 1-10, how helpful was this session for you?",
            'type': 'button_choice',
            'options': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
            'slot': 'rating_a'
        })

        await self.send_message('participant_b', {
            'text': "Jake, on a scale of 1-10, how helpful was this session?",
            'type': 'button_choice',
            'options': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
            'slot': 'rating_b'
        })

        # Wait for ratings
        emma_rating = await self.wait_for_response('participant_a', 'rating_a')
        jake_rating = await self.wait_for_response('participant_b', 'rating_b')

        # Thank them
        await self.send_message('participant_a', {
            'text': f"Thank you, Emma. Great work tonight. 💙",
            'type': 'info'
        })

        await self.send_message('participant_b', {
            'text': f"Thank you, Jake. Great work tonight. 💙",
            'type': 'info'
        })

    # ==================================================================
    # MAIN EXECUTION
    # ==================================================================

    async def run_session(self):
        """Execute the complete therapy session"""
        print(f"\n{'='*60}")
        print(f"🎯 Starting Therapy Session")
        print(f"{'='*60}\n")

        # Execute states in sequence
        await self.state_warmup()
        await self.transition_to_next_state('share_a')
        await asyncio.sleep(2)

        await self.state_share_a()
        await self.transition_to_next_state('share_b')
        await asyncio.sleep(2)

        await self.state_share_b()
        await self.transition_to_next_state('reflection')
        await asyncio.sleep(2)

        await self.state_reflection()

        # Complete
        await self.complete_run()

        print(f"\n{'='*60}")
        print(f"✅ Session Complete!")
        print(f"{'='*60}\n")


async def main():
    if len(sys.argv) < 2:
        print("Usage: python3 therapy_facilitator_simple.py <run_id>")
        sys.exit(1)

    run_id = sys.argv[1]

    facilitator = TherapyFacilitator(run_id)

    try:
        await facilitator.connect()
        await facilitator.run_session()
    finally:
        if facilitator.db:
            facilitator.db.close()
        await sio.disconnect()


if __name__ == '__main__':
    asyncio.run(main())
