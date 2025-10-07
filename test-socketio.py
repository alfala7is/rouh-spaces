import asyncio
import socketio

sio = socketio.AsyncClient()

@sio.event
async def connect():
    print('✅ Connected to server')
    await sio.emit('facilitator:message', {
        'runId': '15fb774a-c78f-4814-b366-8bdbe81384ee',
        'participantId': 'test',
        'magicToken': 'test',
        'from': 'facilitator',
        'to': 'Emma',
        'text': 'Test message from facilitator',
        'type': 'info'
    })
    print('📤 Message emitted')

@sio.event
async def disconnect():
    print('❌ Disconnected from server')

async def main():
    try:
        await sio.connect('http://localhost:3001')
        await asyncio.sleep(3)
        await sio.disconnect()
    except Exception as e:
        print(f'Error: {e}')

asyncio.run(main())
