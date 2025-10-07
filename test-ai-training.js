const API_URL = 'http://localhost:3001';

async function testAITrainingFlow() {
  try {
    console.log('🚀 Starting comprehensive AI training system test...\n');

    // Step 1: Create a test space with a template
    console.log('Step 1: Creating test space with Restaurant template...');
    const templatesRes = await fetch(`${API_URL}/spaces/templates`);
    const templates = await templatesRes.json();
    const cafeTemplate = templates.find(t => t.domain === 'food');

    if (!cafeTemplate) {
      throw new Error('Restaurant template not found');
    }

    const createRes = await fetch(`${API_URL}/spaces/create-full`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'ai-test-user'
      },
      body: JSON.stringify({
        name: "Joe's Test Café",
        description: "A cozy café serving great coffee and pastries",
        templateId: cafeTemplate.id,
        category: 'food',
        isPublic: false,
        phone: '+1-555-0100',
        hours: 'Mon-Fri 7AM-7PM, Sat-Sun 8AM-6PM'
      })
    });

    if (!createRes.ok) {
      throw new Error(`Failed to create space: ${await createRes.text()}`);
    }

    const space = await createRes.json();
    console.log(`✅ Space created: ${space.name} (${space.id})\n`);

    // Step 2: Start a training session
    console.log('Step 2: Starting training session...');
    const sessionRes = await fetch(`${API_URL}/spaces/${space.id}/training/start`, {
      method: 'POST',
      headers: {
        'x-user-id': 'ai-test-user',
        'x-space-id': space.id
      }
    });

    if (!sessionRes.ok) {
      throw new Error(`Failed to start training: ${await sessionRes.text()}`);
    }

    const session = await sessionRes.json();
    console.log(`✅ Training session started: ${session.sessionId}\n`);

    // Step 3: Add training conversation
    console.log('Step 3: Adding training conversation...');
    const trainingMessages = [
      { role: 'user', content: "What are your hours?" },
      { role: 'assistant', content: "We're open Monday through Friday from 7AM to 7PM, and weekends from 8AM to 6PM!" },
      { role: 'user', content: "Do you have espresso?" },
      { role: 'assistant', content: "Yes! We serve excellent espresso - single shots, doubles, and all espresso-based drinks like cappuccinos, lattes, and americanos." },
      { role: 'user', content: "What pastries do you have?" },
      { role: 'assistant', content: "We have fresh croissants, muffins (blueberry and chocolate chip), danish pastries, and our famous cinnamon rolls. Everything is baked fresh daily!" },
      { role: 'user', content: "Can I place an order for pickup?" },
      { role: 'assistant', content: "Absolutely! You can call us at +1-555-0100 to place a pickup order, and we'll have it ready for you in about 15 minutes." }
    ];

    for (let i = 0; i < trainingMessages.length; i++) {
      const msg = trainingMessages[i];
      const messageRes = await fetch(`${API_URL}/spaces/${space.id}/training/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'ai-test-user',
          'x-space-id': space.id
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          role: msg.role,
          content: msg.content,
          sequence: i + 1
        })
      });

      if (!messageRes.ok) {
        throw new Error(`Failed to add message ${i + 1}: ${await messageRes.text()}`);
      }
      console.log(`  Added ${msg.role} message ${i + 1}: "${msg.content.substring(0, 50)}..."`);
    }
    console.log('✅ Training conversation added\n');

    // Step 4: Analyze the training conversation
    console.log('Step 4: Analyzing training conversation...');
    const conversation = trainingMessages.map((msg, i) => ({
      ...msg,
      timestamp: new Date(Date.now() - (trainingMessages.length - i) * 1000).toISOString()
    }));

    const analyzeRes = await fetch(`${API_URL}/spaces/${space.id}/training/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'ai-test-user',
        'x-space-id': space.id
      },
      body: JSON.stringify({
        conversation,
        sessionId: session.sessionId
      })
    });

    if (!analyzeRes.ok) {
      const error = await analyzeRes.text();
      console.warn(`⚠️  Analysis endpoint returned: ${analyzeRes.status} - ${error}`);
      console.log('This might be expected if AI service integration is not fully configured.\n');
    } else {
      const analysis = await analyzeRes.json();
      console.log('✅ Training analysis completed');
      if (analysis.patterns) {
        console.log(`  Found ${analysis.patterns.length} patterns`);
      }
      if (analysis.rules) {
        console.log(`  Generated ${analysis.rules.length} suggested rules`);
      }
      console.log('');
    }

    // Step 5: Verify training data was saved
    console.log('Step 5: Verifying training data...');
    const verifyRes = await fetch(`${API_URL}/spaces/${space.id}/training/verify`, {
      headers: {
        'x-user-id': 'ai-test-user',
        'x-space-id': space.id
      }
    });

    if (!verifyRes.ok) {
      throw new Error(`Failed to verify training: ${await verifyRes.text()}`);
    }

    const verification = await verifyRes.json();
    console.log('✅ Training verification:');
    console.log(`  Total sessions: ${verification.totalSessions}`);
    console.log(`  Total conversations: ${verification.totalConversations}`);
    console.log(`  Messages in this session: ${verification.sessionMessages || 'N/A'}`);
    console.log('');

    // Step 6: Test the space with a query (if RAG is configured)
    console.log('Step 6: Testing space with a query...');
    const testRes = await fetch(`${API_URL}/spaces/${space.id}/blueprints/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'ai-test-user',
        'x-space-id': space.id
      },
      body: JSON.stringify({
        message: "What time do you open on Saturday?"
      })
    });

    if (!testRes.ok) {
      const error = await testRes.text();
      console.warn(`⚠️  Test query returned: ${testRes.status} - ${error}`);
      console.log('This might be expected if OpenAI API key is not configured.\n');
    } else {
      const testResponse = await testRes.json();
      console.log('✅ Test query response received');
      if (testResponse?.suggestedResponse?.text) {
        console.log(`  AI Response: "${testResponse.suggestedResponse.text}"`);
      }
      if (testResponse?.suggestedResponse?.blueprintMatches?.length) {
        console.log(
          `  Blueprint matches: ${testResponse.suggestedResponse.blueprintMatches.map((m) => m.name).join(', ')}`
        );
      }
      console.log('');
    }

    // Step 7: Check AI service directly
    console.log('Step 7: Checking AI service endpoints...');
    const aiEndpoints = [
      { url: 'http://localhost:8000/embed', method: 'POST', body: { text: 'test' } },
      { url: 'http://localhost:8000/analyze-training', method: 'POST', body: {
        conversation: [
          { role: 'user', content: 'test', timestamp: new Date().toISOString() }
        ],
        spaceContext: {}
      }}
    ];

    for (const endpoint of aiEndpoints) {
      try {
        const res = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(endpoint.body)
        });

        const status = res.ok ? '✅' : '⚠️';
        console.log(`  ${status} ${endpoint.url.split('/').pop()}: ${res.status} ${res.statusText}`);

        if (!res.ok && res.status === 422) {
          const error = await res.json();
          console.log(`     Validation error: ${JSON.stringify(error.detail?.[0]?.msg || error.detail)}`);
        }
      } catch (error) {
        console.log(`  ❌ ${endpoint.url.split('/').pop()}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 AI Training System Test Complete!');
    console.log('='.repeat(60));
    console.log('\nSummary:');
    console.log('✅ Space creation with templates: Working');
    console.log('✅ Training session management: Working');
    console.log('✅ Training message storage: Working');
    console.log('✅ Training data persistence: Working');

    const aiStatus = testRes.ok ? '✅ Working (OpenAI configured)' : '⚠️  Needs OpenAI API key';
    console.log(`${testRes.ok ? '✅' : '⚠️'} AI query responses: ${aiStatus}`);

    console.log('\nYou can now visit the space at:');
    console.log(`http://localhost:3000/s/${space.id}`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

console.log('Starting AI Training System Test...\n');
testAITrainingFlow();
