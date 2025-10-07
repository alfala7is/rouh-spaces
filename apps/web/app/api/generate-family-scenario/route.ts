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
            content: `You are a Rouh family orchestration expert. Convert the user's family coordination task into a multi-person orchestration scenario.

Each step shows:
1. Group chat messages (family members communicating)
2. Orchestration logs (Rouh working behind the scenes)

Return ONLY valid JSON with this EXACT structure:
{
  "title": "Short title (2-4 words)",
  "description": "Brief description of coordination",
  "orchestrationSteps": [
    {
      "groupChat": [
        {"from": "School", "text": "Message text", "time": "2:15 PM", "type": "alert"},
        {"from": "Rouh", "text": "Response", "time": "2:15 PM", "type": "system"}
      ],
      "orchestrationLogs": [
        {"text": "🚨 ALERT: Event detected..."},
        {"text": "📍 LOCATE: Finding family members..."},
        {"text": "✓ FOUND: Solution identified"}
      ]
    },
    {
      "groupChat": [
        {"from": "Dad", "text": "Approval message", "time": "2:16 PM", "type": "user"}
      ],
      "orchestrationLogs": [
        {"text": "⏳ WAIT: Awaiting approval..."},
        {"text": "✓ APPROVED: Action confirmed"}
      ]
    }
  ]
}

Message types: "alert", "system", "user", "suggestion", "complete"

IMPORTANT:
- Create 3-4 steps showing family coordination
- Each step has 1-3 group chat messages and 2-8 orchestration logs
- Show how Rouh coordinates multiple people's schedules, preferences, locations
- Use realistic emojis and clear, concise text
- Focus on multi-person orchestration (calendars, locations, preferences)`
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
    console.error('Error generating family scenario:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
