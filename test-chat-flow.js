const API_URL = 'http://localhost:3001';

async function testChatFlow() {
  try {
    console.log('🤖 Testing complete chat flow with AI...\n');

    // Use one of the demo spaces we created earlier
    const spacesRes = await fetch(`${API_URL}/spaces/explore?limit=1`);
    const { spaces } = await spacesRes.json();

    if (!spaces || spaces.length === 0) {
      console.log('No demo spaces found. Creating one...');
      // Create a test space
      const createRes = await fetch(`${API_URL}/spaces/create-full`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'chat-test'
        },
        body: JSON.stringify({
          name: 'Chat Test Space',
          description: 'Testing chat functionality',
          templateId: 'custom',
          category: 'services',
          isPublic: true
        })
      });

      const space = await createRes.json();
      spaces = [space];
    }

    const testSpace = spaces[0];
    console.log(`Using space: ${testSpace.name} (${testSpace.id})\n`);

    // Test chat queries
    const testQueries = [
      "Hello! What services do you offer?",
      "What are your business hours?",
      "Can I schedule an appointment?",
      "Do you have any special offers?"
    ];

    console.log('Testing chat queries:');
    console.log('=' .repeat(50));

    for (const query of testQueries) {
      console.log(`\n👤 User: "${query}"`);

      const chatRes = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-space-id': testSpace.id,
          'x-user-id': 'chat-test'
        },
        body: JSON.stringify({
          message: query,
          sessionId: 'test-session-' + Date.now()
        })
      });

      if (!chatRes.ok) {
        const errorText = await chatRes.text();

        // Check if it's a 404 (endpoint doesn't exist)
        if (chatRes.status === 404) {
          console.log('  ℹ️  Chat endpoint not found, trying space test endpoint...');

          // Try the test endpoint instead
          const testRes = await fetch(`${API_URL}/spaces/${testSpace.id}/test`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': 'chat-test',
              'x-space-id': testSpace.id
            },
            body: JSON.stringify({ message: query })
          });

          if (testRes.ok) {
            const response = await testRes.json();
            console.log(`  🤖 Assistant: "${response.response || response.text || 'No response'}"`);
          } else {
            console.log(`  ⚠️  Response: ${testRes.status} - ${await testRes.text()}`);
          }
        } else {
          console.log(`  ⚠️  Chat failed: ${chatRes.status} - ${errorText}`);
        }
      } else {
        const response = await chatRes.json();
        console.log(`  🤖 Assistant: "${response.response || response.text || 'No response'}"`);

        if (response.actions && response.actions.length > 0) {
          console.log(`  📋 Actions: ${response.actions.map(a => a.type).join(', ')}`);
        }
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Chat flow test complete!\n');

    // Test RAG query endpoint
    console.log('Testing RAG query endpoint...');
    const ragRes = await fetch('http://localhost:8000/rag/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: "What are your hours?",
        space_id: testSpace.id,
        top_k: 5
      })
    });

    if (ragRes.ok) {
      const ragData = await ragRes.json();
      console.log('✅ RAG query successful');
      if (ragData.response) {
        console.log(`  Response: "${ragData.response}"`);
      }
      if (ragData.sources && ragData.sources.length > 0) {
        console.log(`  Found ${ragData.sources.length} relevant sources`);
      }
    } else {
      console.log(`⚠️  RAG query failed: ${ragRes.status}`);
      if (ragRes.status === 422) {
        const error = await ragRes.json();
        console.log(`  Details: ${JSON.stringify(error.detail)}`);
      }
    }

    console.log('\n🎉 All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testChatFlow();