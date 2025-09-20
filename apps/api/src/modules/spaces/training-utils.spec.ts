import assert from 'node:assert/strict';
import { groupTrainingConversations } from './spaces.service';

const rawConversations = [
  { sessionId: 'instruction_alpha', role: 'user', content: 'Always add emojis to drink suggestions.', sequence: 1 },
  { sessionId: 'instruction_alpha', role: 'assistant', content: 'Understood, emojis will be added.', sequence: 2 },
  { sessionId: 'qa_sample', role: 'user', content: 'Do you offer curbside pickup?', sequence: 1 },
  { sessionId: 'qa_sample', role: 'assistant', content: 'Yes, we offer curbside daily until 8pm.', sequence: 2 },
  { sessionId: 'legacy_system', role: 'system', content: 'Greet every customer with their first name.', sequence: 1 },
  { sessionId: 'training_misc', role: 'user', content: 'Customer asked about group discounts.', sequence: 1 },
  { sessionId: 'training_misc', role: 'assistant', content: 'Offer 10% off for groups of 6 or more.', sequence: 2 },
  { sessionId: 'broken_entry', role: 'user', content: '', sequence: 1 },
];

const sessions = groupTrainingConversations(rawConversations);

assert.equal(sessions.length, 4, 'Expected four grouped sessions');

const orderedSessionIds = sessions.map((session) => session[0]?.sessionId);
assert.deepEqual(
  orderedSessionIds,
  ['instruction_alpha', 'legacy_system', 'qa_sample', 'training_misc'],
  'Instruction sessions should be prioritized before QA and other sessions',
);

assert.ok(
  sessions[0].every((message) => message.sessionId === 'instruction_alpha'),
  'Instruction session should retain the sessionId on every message',
);

assert.equal(
  sessions[1][0]?.role,
  'system',
  'Legacy single-message instructions should be preserved as training examples',
);

assert.equal(
  sessions[2][0]?.sessionId,
  'qa_sample',
  'QA sessions should retain their sessionId for downstream few-shot logic',
);

console.log('groupTrainingConversations spec passed');
