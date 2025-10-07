/**
 * Test Existing Coordination System
 *
 * This script tests if the existing coordination infrastructure works:
 * 1. Create a Space
 * 2. Create a simple blueprint (CoordinationTemplate)
 * 3. Create a CoordinationRun with participants
 * 4. Get magic links
 * 5. Test if chat interface is accessible
 */

const axios = require('axios');

const API_URL = 'http://localhost:3001';

// Helper to make API calls
async function api(method, path, data, headers = {}) {
  try {
    const response = await axios({
      method,
      url: `${API_URL}${path}`,
      data,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'test-user',
        ...headers
      }
    });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}

async function test() {
  console.log('\n🧪 Testing Existing Coordination System\n');
  console.log('=' .repeat(60));

  // Test 1: Create a Space
  console.log('\n📦 Test 1: Creating a test Space...');
  const spaceResult = await api('POST', '/spaces', {
    name: 'Test Therapy Space',
    description: 'Testing coordination system'
  });

  if (!spaceResult.success) {
    console.log('❌ Failed to create space:', spaceResult.error);
    return;
  }

  const spaceId = spaceResult.data.id;
  console.log(`✅ Space created: ${spaceId}`);

  // Test 2: Create a simple blueprint template
  console.log('\n📋 Test 2: Creating therapy blueprint template...');

  const templateData = {
    spaceId,
    name: 'Simple Therapy Check-In',
    description: 'A simple 3-state therapy session',
    version: '1.0',
    isActive: true,
    schemaJson: {
      express: { enabled: true, description: 'Mood check-in' },
      explore: { enabled: true, description: 'Share feelings' },
      commit: { enabled: false },
      evidence: { enabled: false },
      confirm: { enabled: true, description: 'Rate session' }
    },
    roles: [
      {
        name: 'participant_a',
        description: 'First participant',
        minParticipants: 1,
        maxParticipants: 1,
        capabilities: ['respond', 'share']
      },
      {
        name: 'participant_b',
        description: 'Second participant',
        minParticipants: 1,
        maxParticipants: 1,
        capabilities: ['respond', 'share']
      }
    ],
    states: [
      {
        name: 'warmup',
        type: 'collect',
        description: 'Mood check-in',
        sequence: 0,
        requiredSlots: ['mood_a', 'mood_b'],
        allowedRoles: ['participant_a', 'participant_b'],
        transitions: { always: 'share' }
      },
      {
        name: 'share',
        type: 'negotiate',
        description: 'Share feelings',
        sequence: 1,
        requiredSlots: ['share_a', 'share_b'],
        allowedRoles: ['participant_a', 'participant_b'],
        transitions: { always: 'reflection' }
      },
      {
        name: 'reflection',
        type: 'signoff',
        description: 'Rate session',
        sequence: 2,
        requiredSlots: ['rating_a', 'rating_b'],
        allowedRoles: ['participant_a', 'participant_b'],
        transitions: {}
      }
    ],
    slots: [
      { name: 'mood_a', type: 'text', required: true, visibility: ['participant_a', 'participant_b'], editable: ['participant_a'] },
      { name: 'mood_b', type: 'text', required: true, visibility: ['participant_a', 'participant_b'], editable: ['participant_b'] },
      { name: 'share_a', type: 'text', required: true, visibility: ['participant_a', 'participant_b'], editable: ['participant_a'] },
      { name: 'share_b', type: 'text', required: true, visibility: ['participant_a', 'participant_b'], editable: ['participant_b'] },
      { name: 'rating_a', type: 'number', required: true, visibility: ['participant_a', 'participant_b'], editable: ['participant_a'] },
      { name: 'rating_b', type: 'number', required: true, visibility: ['participant_a', 'participant_b'], editable: ['participant_b'] }
    ]
  };

  const templateResult = await api('POST', `/spaces/${spaceId}/templates`, templateData, { 'x-space-id': spaceId });

  if (!templateResult.success) {
    console.log('❌ Failed to create template:', templateResult.error);
    return;
  }

  const template = templateResult.data.data;
  const templateId = template.id;
  const roles = template.roles;

  console.log(`✅ Template created: ${templateId}`);
  console.log(`   Roles: ${roles.map(r => r.name).join(', ')}`);

  // Test 3: Create a coordination run
  console.log('\n🏃 Test 3: Creating coordination run...');

  const runResult = await api('POST', '/coordination/runs', {
    templateId,
    spaceId,
    participants: [
      { roleId: roles[0]?.id, metadata: { name: 'Emma' } },
      { roleId: roles[1]?.id, metadata: { name: 'Jake' } }
    ]
  }, { 'x-space-id': spaceId });

  if (!runResult.success) {
    console.log('❌ Failed to create run:', runResult.error);
    return;
  }

  const runId = runResult.data.id;
  console.log(`✅ Run created: ${runId}`);

  // Test 4: Get the run with participants to extract magic tokens
  console.log('\n🔗 Test 4: Getting magic links...');

  const runDetailsResult = await api('GET', `/coordination/runs/${runId}`, null, { 'x-space-id': spaceId });

  if (!runDetailsResult.success) {
    console.log('❌ Failed to get run details:', runDetailsResult.error);
    return;
  }

  const participants = runDetailsResult.data.participants || [];

  if (participants.length < 2) {
    console.log('❌ Not enough participants with magic tokens');
    return;
  }

  const emmaToken = participants[0].magicToken;
  const jakeToken = participants[1].magicToken;

  console.log('✅ Magic tokens generated:');
  console.log(`   Emma: http://localhost:3000/r/${runId}?token=${emmaToken}`);
  console.log(`   Jake: http://localhost:3000/r/${runId}?token=${jakeToken}`);

  // Test 5: Verify the endpoint exists
  console.log('\n🌐 Test 5: Testing magic link validation...');

  const validateResult = await api('GET', `/coordination/runs/${runId}/validate?token=${emmaToken}`, null);

  if (validateResult.success) {
    console.log('✅ Magic link validation works!');
  } else {
    console.log('⚠️  Magic link validation endpoint not found (may need to be created)');
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 TEST RESULTS:\n');
  console.log('✅ Space creation: WORKS');
  console.log('✅ Template creation: WORKS');
  console.log('✅ Run creation: WORKS');
  console.log('✅ Magic token generation: WORKS');
  console.log(`${validateResult.success ? '✅' : '⚠️ '} Magic link validation: ${validateResult.success ? 'WORKS' : 'NEEDS IMPLEMENTATION'}`);

  console.log('\n🎯 NEXT STEPS:');
  console.log('1. Open Emma\'s link in browser');
  console.log('2. See if CoordinationChat component loads');
  console.log('3. Check if real-time messaging works');
  console.log('4. Build Facilitator agent to drive the conversation');

  console.log('\n📋 MAGIC LINKS TO TEST:');
  console.log(`Emma: http://localhost:3000/r/${runId}?token=${emmaToken}`);
  console.log(`Jake: http://localhost:3000/r/${runId}?token=${jakeToken}`);

  console.log('\n');
}

test().catch(console.error);
