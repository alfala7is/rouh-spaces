/**
 * Seed Simple Therapy Blueprint
 *
 * Creates a minimal therapy check-in blueprint directly in the database.
 * Bypasses the buggy coordination service for MVP.
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Simple Therapy Blueprint...\n');

  // 1. Find or create a test space
  console.log('1️⃣ Finding or creating test space...');

  let space = await prisma.space.findFirst({
    where: { name: 'Therapy Test Space' }
  });

  if (!space) {
    space = await prisma.space.create({
      data: {
        name: 'Therapy Test Space',
        description: 'Space for testing therapy sessions',
        autonomyLevel: 'L1',
        metadata: {}
      }
    });
  }

  console.log(`   ✓ Space: ${space.id}`);

  // 2. Create coordination template
  console.log('\n2️⃣ Creating therapy blueprint template...');

  // Delete existing if present
  await prisma.coordinationTemplate.deleteMany({
    where: {
      spaceId: space.id,
      name: 'Daily Therapy Check-In'
    }
  });

  const template = await prisma.coordinationTemplate.create({
    data: {
      spaceId: space.id,
      name: 'Daily Therapy Check-In',
      description: 'A simple 3-phase guided conversation for couples or family members',
      version: '1.0',
      isActive: true,
      schemaJson: {
        express: { enabled: true, description: 'Mood check-in' },
        explore: { enabled: true, description: 'Share and listen' },
        commit: { enabled: false },
        evidence: { enabled: false },
        confirm: { enabled: true, description: 'Rate session' }
      },
      metadata: {
        category: 'relationship',
        duration: '15-20 minutes'
      }
    }
  });

  console.log(`   ✓ Template: ${template.id}`);

  // 3. Create roles
  console.log('\n3️⃣ Creating participant roles...');

  const roleA = await prisma.templateRole.create({
    data: {
      templateId: template.id,
      name: 'participant_a',
      description: 'First participant',
      minParticipants: 1,
      maxParticipants: 1,
      capabilities: ['respond', 'share', 'listen'],
      constraints: {}
    }
  });

  const roleB = await prisma.templateRole.create({
    data: {
      templateId: template.id,
      name: 'participant_b',
      description: 'Second participant',
      minParticipants: 1,
      maxParticipants: 1,
      capabilities: ['respond', 'share', 'listen'],
      constraints: {}
    }
  });

  console.log(`   ✓ Role A: ${roleA.id}`);
  console.log(`   ✓ Role B: ${roleB.id}`);

  // 4. Create states
  console.log('\n4️⃣ Creating conversation states...');

  const state1 = await prisma.templateState.create({
    data: {
      templateId: template.id,
      name: 'warmup',
      type: 'collect',
      description: 'Quick mood check-in',
      sequence: 0,
      requiredSlots: ['mood_a', 'mood_b'],
      allowedRoles: ['participant_a', 'participant_b'],
      transitions: { next: 'share_a' },
      uiHints: {}
    }
  });

  const state2 = await prisma.templateState.create({
    data: {
      templateId: template.id,
      name: 'share_a',
      type: 'negotiate',
      description: 'Participant A shares, B listens',
      sequence: 1,
      requiredSlots: ['share_a_topic', 'share_a_reflection'],
      allowedRoles: ['participant_a', 'participant_b'],
      transitions: { next: 'share_b' },
      uiHints: {}
    }
  });

  const state3 = await prisma.templateState.create({
    data: {
      templateId: template.id,
      name: 'share_b',
      type: 'negotiate',
      description: 'Participant B shares, A listens',
      sequence: 2,
      requiredSlots: ['share_b_topic', 'share_b_reflection'],
      allowedRoles: ['participant_a', 'participant_b'],
      transitions: { next: 'reflection' },
      uiHints: {}
    }
  });

  const state4 = await prisma.templateState.create({
    data: {
      templateId: template.id,
      name: 'reflection',
      type: 'signoff',
      description: 'Rate the session',
      sequence: 3,
      requiredSlots: ['rating_a', 'rating_b'],
      allowedRoles: ['participant_a', 'participant_b'],
      transitions: {},
      uiHints: {}
    }
  });

  console.log(`   ✓ State 1: warmup`);
  console.log(`   ✓ State 2: share_a`);
  console.log(`   ✓ State 3: share_b`);
  console.log(`   ✓ State 4: reflection`);

  // 5. Create slots
  console.log('\n5️⃣ Creating data slots...');

  const slots = [
    { name: 'mood_a', type: 'text', role: 'participant_a' },
    { name: 'mood_b', type: 'text', role: 'participant_b' },
    { name: 'share_a_topic', type: 'text', role: 'participant_a' },
    { name: 'share_a_reflection', type: 'text', role: 'participant_b' },
    { name: 'share_b_topic', type: 'text', role: 'participant_b' },
    { name: 'share_b_reflection', type: 'text', role: 'participant_a' },
    { name: 'rating_a', type: 'number', role: 'participant_a' },
    { name: 'rating_b', type: 'number', role: 'participant_b' }
  ];

  for (const slot of slots) {
    await prisma.templateSlot.create({
      data: {
        templateId: template.id,
        name: slot.name,
        type: slot.type,
        required: true,
        visibility: ['participant_a', 'participant_b'],
        editable: [slot.role],
        validation: {}
      }
    });
  }

  console.log(`   ✓ Created ${slots.length} slots`);

  // 6. Create a test coordination run with Emma and Jake
  console.log('\n6️⃣ Creating test run with Emma and Jake...');

  const run = await prisma.coordinationRun.create({
    data: {
      spaceId: space.id,
      templateId: template.id,
      initiatorId: 'system',
      currentStateId: state1.id,
      status: 'active',
      metadata: {
        type: 'therapy_session',
        participants: ['Emma', 'Jake']
      }
    }
  });

  console.log(`   ✓ Run: ${run.id}`);

  // 7. Create initial run state
  const runState = await prisma.runState.create({
    data: {
      runId: run.id,
      stateId: state1.id,
      slotData: {},
      metadata: {}
    }
  });

  console.log(`   ✓ Run state initialized`);

  // 8. Create participants with magic tokens
  const emmaToken = crypto.randomBytes(32).toString('hex');
  const jakeToken = crypto.randomBytes(32).toString('hex');

  const emmaParticipant = await prisma.runParticipant.create({
    data: {
      runId: run.id,
      roleId: roleA.id,
      magicToken: emmaToken,
      metadata: { name: 'Emma', phone: '+1-555-0001', email: 'emma@test.com' }
    }
  });

  const jakeParticipant = await prisma.runParticipant.create({
    data: {
      runId: run.id,
      roleId: roleB.id,
      magicToken: jakeToken,
      metadata: { name: 'Jake', phone: '+1-555-0002', email: 'jake@test.com' }
    }
  });

  console.log(`   ✓ Emma (participant_a): ${emmaParticipant.id}`);
  console.log(`   ✓ Jake (participant_b): ${jakeParticipant.id}`);

  // Done!
  console.log('\n' + '='.repeat(60));
  console.log('✅ SEED COMPLETE!\n');
  console.log('📋 Summary:');
  console.log(`   Space: ${space.id}`);
  console.log(`   Template: ${template.id}`);
  console.log(`   Run: ${run.id}`);
  console.log(`\n🔗 Magic Links:`);
  console.log(`   Emma: http://localhost:3000/r/${run.id}?token=${emmaToken}`);
  console.log(`   Jake: http://localhost:3000/r/${run.id}?token=${jakeToken}`);
  console.log('\n💡 Next Steps:');
  console.log('   1. Start Facilitator agent: python3 apps/a2a/agents/therapy_facilitator_simple.py');
  console.log('   2. Open Emma\'s link in browser');
  console.log('   3. Open Jake\'s link in another browser/incognito');
  console.log('   4. Watch the magic happen!\n');
}

main()
  .catch((e) => {
    console.error('Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
