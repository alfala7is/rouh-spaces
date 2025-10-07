import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error('OpenAI API key not found in environment variables');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a Rouh automation expert. Convert the user's recurring task into a synchronized cinema scenario.

Each step has:
1. A user message (what they see/do)
2. Background processes that lead to or result from that message

Return ONLY valid JSON with this EXACT structure:
{
  "title": "Short title (2-3 words)",
  "trigger": "What triggers this task",
  "cinematicSteps": [
    {
      "userMessage": {"type": "notification", "icon": "🔔", "text": "Rouh notification", "time": "9:42 AM"},
      "backgroundLogs": [
        {"text": "🔴 SENSOR: Detection..."},
        {"text": "🤖 AI: Analysis..."},
        {"text": "📊 DATA: Fetching..."},
        {"text": "📱 NOTIFY: Sending notification..."}
      ]
    },
    {
      "userMessage": {"type": "action", "icon": "👆", "text": "User action", "time": "9:42 AM"},
      "backgroundLogs": [
        {"text": "⏳ WAIT: Awaiting approval..."},
        {"text": "✓ USER: Approved"}
      ]
    },
    {
      "userMessage": {"type": "confirmation", "icon": "✓", "text": "Confirmed", "time": "9:43 AM"},
      "backgroundLogs": [
        {"text": "📧 VENDOR: Coordinating..."},
        {"text": "✓ VENDOR: Confirmed"},
        {"text": "📆 CALENDAR: Updated"}
      ]
    },
    {
      "userMessage": {"type": "complete", "icon": "✅", "text": "Completed!", "time": "Later"},
      "backgroundLogs": [
        {"text": "✓ COMPLETED: Work done"},
        {"text": "📝 LOG: Stored details"},
        {"text": "🧠 LEARN: Improved automation"}
      ]
    }
  ]
}

IMPORTANT:
- Create 3-4 steps total
- Each step shows cause-and-effect relationship
- Background logs should be 2-8 entries per step
- Use realistic emojis and clear, concise text
- Make it specific to the user's task`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to generate scenario from OpenAI', details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Extract JSON from potential markdown code blocks
    let jsonContent = content;
    if (content.includes('```')) {
      const match = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (match) jsonContent = match[1];
    }

    const parsed = JSON.parse(jsonContent.trim());

    return NextResponse.json({ scenario: parsed });
  } catch (error) {
    console.error('Error generating scenario:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
