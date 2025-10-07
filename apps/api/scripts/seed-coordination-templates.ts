import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedCoordinationTemplates() {
  console.log('Seeding coordination templates...');

  try {
    // Create or find test space
    let testSpace = await prisma.space.findFirst({ where: { name: 'Test Coordination Space' } });
    if (!testSpace) {
      testSpace = await prisma.space.create({
        data: {
          name: 'Test Coordination Space',
          description: 'Space for testing coordination templates',
          ownerId: null
        }
      });
    }
    console.log('✓ Test space created/found');

    // Create coordination template schema
    const schemaJson = {
      name: 'Plumber Service Request',
      description: 'Coordinate plumber service requests with quotes and completion tracking',
      version: '1.0',
      flow: {
        states: ['collect', 'negotiate', 'commit', 'evidence', 'signoff'],
        transitions: {
          collect: ['negotiate'],
          negotiate: ['commit', 'collect'],
          commit: ['evidence'],
          evidence: ['signoff'],
          signoff: []
        }
      },
      roles: ['requester', 'provider'],
      slots: [
        'issue_description',
        'location',
        'quote_amount',
        'timeline',
        'deposit_paid',
        'completion_photos',
        'customer_approval'
      ]
    };

    // Create coordination template
    const template = await prisma.coordinationTemplate.upsert({
      where: {
        spaceId_name_version: {
          spaceId: testSpace.id,
          name: 'Plumber Service Request',
          version: '1.0'
        }
      },
      update: {
        description: 'Coordinate plumber service requests with quotes and completion tracking',
        schemaJson,
        metadata: {
          category: 'home_services',
          estimatedDuration: '3-7 days',
          complexity: 'medium'
        }
      },
      create: {
        spaceId: testSpace.id,
        name: 'Plumber Service Request',
        description: 'Coordinate plumber service requests with quotes and completion tracking',
        version: '1.0',
        schemaJson,
        metadata: {
          category: 'home_services',
          estimatedDuration: '3-7 days',
          complexity: 'medium'
        }
      },
    });
    console.log('✓ Coordination template created');

    await prisma.$transaction(async (tx) => {
      // Create template roles
      const roles = [
        {
          templateId: template.id,
          name: 'requester',
          description: 'Customer requesting plumber services',
          capabilities: [
            'express_need',
            'accept_quote',
            'pay_deposit',
            'approve_completion'
          ],
          minParticipants: 1,
          maxParticipants: null
        },
        {
          templateId: template.id,
          name: 'provider',
          description: 'Plumber providing services',
          capabilities: [
            'provide_quote',
            'upload_evidence',
            'confirm_completion'
          ],
          minParticipants: 1,
          maxParticipants: null
        }
      ];

      for (const roleData of roles) {
        await tx.templateRole.upsert({
          where: {
            templateId_name: {
              templateId: template.id,
              name: roleData.name
            }
          },
          update: roleData,
          create: roleData,
        });
      }

      // Create template slots
      const slots = [
        {
          templateId: template.id,
          name: 'issue_description',
          type: 'text',
          description: 'Description of the plumbing issue',
          required: true,
          visibility: ['requester', 'provider'],
          editable: ['requester'],
          validation: {
            maxLength: 1000
          }
        },
        {
          templateId: template.id,
          name: 'location',
          type: 'location',
          description: 'Address where service is needed',
          required: true,
          visibility: ['requester', 'provider'],
          editable: ['requester'],
          validation: {}
        },
        {
          templateId: template.id,
          name: 'quote_amount',
          type: 'currency',
          description: 'Service quote amount',
          required: true,
          visibility: ['requester', 'provider'],
          editable: ['provider'],
          validation: {
            min: 0,
            max: 10000
          }
        },
        {
          templateId: template.id,
          name: 'timeline',
          type: 'text',
          description: 'Expected timeline for completion',
          required: true,
          visibility: ['requester', 'provider'],
          editable: ['provider'],
          validation: {
            maxLength: 200
          }
        },
        {
          templateId: template.id,
          name: 'deposit_paid',
          type: 'text',
          description: 'Confirmation of deposit payment',
          required: true,
          visibility: ['requester', 'provider'],
          editable: ['requester'],
          validation: {
            maxLength: 200
          }
        },
        {
          templateId: template.id,
          name: 'completion_photos',
          type: 'file',
          description: 'Photos showing completed work',
          required: true,
          visibility: ['requester', 'provider'],
          editable: ['provider'],
          validation: {
            fileTypes: ['image/jpeg', 'image/png'],
            maxFiles: 5,
            maxSizeMB: 10
          }
        },
        {
          templateId: template.id,
          name: 'customer_approval',
          type: 'text',
          description: 'Customer approval of completed work',
          required: true,
          visibility: ['requester', 'provider'],
          editable: ['requester'],
          validation: {
            maxLength: 500
          }
        }
      ];

      for (const slotData of slots) {
        await tx.templateSlot.upsert({
          where: {
            templateId_name: {
              templateId: template.id,
              name: slotData.name
            }
          },
          update: slotData,
          create: slotData,
        });
      }

      // Fetch created slots to get their IDs
      const slotList = await tx.templateSlot.findMany({ where: { templateId: template.id } });
      const slotIdByName = Object.fromEntries(slotList.map((s) => [s.name, s.id] as const));

      // Create template states with slot IDs
      const states = [
        {
          templateId: template.id,
          name: 'collect_requirements',
          type: 'collect' as const,
          description: 'Collect initial service requirements',
          sequence: 1,
          requiredSlots: ['issue_description', 'location'].map(n => slotIdByName[n]),
          allowedRoles: ['requester'],
          transitions: {
            next: ['negotiate_terms'],
            conditions: {
              hasRequiredSlots: true,
              roleApproval: ['requester']
            }
          }
        },
        {
          templateId: template.id,
          name: 'negotiate_terms',
          type: 'negotiate' as const,
          description: 'Negotiate service terms and pricing',
          sequence: 2,
          requiredSlots: ['quote_amount', 'timeline'].map(n => slotIdByName[n]),
          allowedRoles: ['provider', 'requester'],
          transitions: {
            next: ['commit_service', 'collect_requirements'],
            conditions: {
              hasRequiredSlots: true,
              roleApproval: ['requester']
            }
          }
        },
        {
          templateId: template.id,
          name: 'commit_service',
          type: 'commit' as const,
          description: 'Commit to service agreement with deposit',
          sequence: 3,
          requiredSlots: ['deposit_paid'].map(n => slotIdByName[n]),
          allowedRoles: ['requester'],
          transitions: {
            next: ['provide_evidence'],
            conditions: {
              hasRequiredSlots: true,
              roleApproval: ['requester']
            }
          }
        },
        {
          templateId: template.id,
          name: 'provide_evidence',
          type: 'evidence' as const,
          description: 'Provide evidence of completed work',
          sequence: 4,
          requiredSlots: ['completion_photos'].map(n => slotIdByName[n]),
          allowedRoles: ['provider'],
          transitions: {
            next: ['final_signoff'],
            conditions: {
              hasRequiredSlots: true,
              roleApproval: ['provider']
            }
          }
        },
        {
          templateId: template.id,
          name: 'final_signoff',
          type: 'signoff' as const,
          description: 'Final customer approval and completion',
          sequence: 5,
          requiredSlots: ['customer_approval'].map(n => slotIdByName[n]),
          allowedRoles: ['requester'],
          transitions: {
            next: [],
            conditions: {
              hasRequiredSlots: true,
              roleApproval: ['requester']
            }
          }
        }
      ];

      // Validate that all slot names resolve to IDs
      for (const state of states) {
        for (const slotId of state.requiredSlots) {
          if (!slotId) {
            throw new Error(`Could not resolve slot ID for state ${state.name}`);
          }
        }
      }

      for (const stateData of states) {
        await tx.templateState.upsert({
          where: {
            templateId_sequence: {
              templateId: template.id,
              sequence: stateData.sequence
            }
          },
          update: stateData,
          create: stateData,
        });
      }
    });

    console.log('✓ Template roles created');
    console.log('✓ Template slots created');
    console.log('✓ Template states created');

    const templateWithRelations = await prisma.coordinationTemplate.findUnique({
      where: { id: template.id },
      include: {
        roles: true,
        states: true,
        slots: true,
      },
    });

    if (!templateWithRelations) {
      throw new Error('Failed to load template with relations after seeding.');
    }

    const roleByName = Object.fromEntries(
      templateWithRelations.roles.map((role) => [role.name, role])
    );
    const stateByName = Object.fromEntries(
      templateWithRelations.states.map((state) => [state.name, state])
    );

    const runSeedMetadata = {
      seedName: 'plumber-demo-run',
      scenario: 'Leaking kitchen sink emergency',
      customer: {
        name: 'Amira Salem',
        contact: '+965 5555 1234',
        address: 'Al Shaheed Tower, Apt 5B, Kuwait City',
      },
      provider: {
        businessName: 'RapidFlow Plumbing Co.',
        technician: 'Hisham Al-Mutairi',
        license: 'PL-48217-KW',
      },
    } as const;

    const existingRun = await prisma.coordinationRun.findFirst({
      where: {
        spaceId: testSpace.id,
        templateId: template.id,
        metadata: {
          path: ['seedName'],
          equals: runSeedMetadata.seedName,
        },
      },
      include: {
        participants: true,
        states: true,
      },
    });

    const targetState = stateByName['negotiate_terms'] || stateByName['collect_requirements'];
    if (!targetState) {
      throw new Error('Expected template state "negotiate_terms" to be present.');
    }

    let run = existingRun;

    if (!run) {
      run = await prisma.coordinationRun.create({
        data: {
          spaceId: testSpace.id,
          templateId: template.id,
          initiatorId: 'demo-owner',
          currentStateId: targetState.id,
          status: 'active',
          metadata: runSeedMetadata,
          startedAt: new Date(Date.now() - 1000 * 60 * 60 * 6), // 6 hours ago
        },
        include: {
          participants: true,
          states: true,
        },
      });
      console.log('✓ Demo coordination run created');
    } else {
      // Ensure current state matches target if we already had a run
      if (run.currentStateId !== targetState.id) {
        await prisma.coordinationRun.update({
          where: { id: run.id },
          data: { currentStateId: targetState.id },
        });
        run.currentStateId = targetState.id;
      }
      console.log('✓ Demo coordination run found');
    }

    const participantsSeed = [
      {
        identifier: 'demo-requester',
        roleName: 'requester',
        magicToken: 'demo-requester-token',
        metadata: {
          name: 'Amira Salem',
          email: 'amira.salem@example.com',
          persona: {
            tone: 'stressed homeowner',
            goals: [
              'Stop the kitchen leak quickly',
              'Keep total cost under 200 KWD',
              'Receive written confirmation of repairs',
            ],
          },
        },
      },
      {
        identifier: 'demo-provider',
        roleName: 'provider',
        magicToken: 'demo-provider-token',
        metadata: {
          name: 'Hisham Al-Mutairi',
          email: 'dispatch@rapidflowplumbing.com',
          persona: {
            tone: 'practical technician',
            goals: [
              'Diagnose issue on first visit',
              'Collect 30% deposit before starting',
              'Document repair with before/after photos',
            ],
          },
        },
      },
    ];

    for (const participant of participantsSeed) {
      const role = roleByName[participant.roleName];
      if (!role) {
        throw new Error(`Role ${participant.roleName} not found on template`);
      }

      await prisma.runParticipant.upsert({
        where: {
          runId_userId_roleId: {
            runId: run.id,
            userId: participant.identifier,
            roleId: role.id,
          },
        },
        update: {
          metadata: participant.metadata,
          magicToken: participant.magicToken,
        },
        create: {
          runId: run.id,
          roleId: role.id,
          userId: participant.identifier,
          magicToken: participant.magicToken,
          metadata: participant.metadata,
        },
      });
    }

    const slotByName = Object.fromEntries(
      templateWithRelations.slots.map((slot) => [slot.name, slot])
    );

    const runStates = await prisma.runState.findMany({
      where: { runId: run.id },
    });

    const ensureRunState = async (
      stateName: string,
      data: {
        slotData: Record<string, unknown>;
        enteredMinutesAgo: number;
        exitedMinutesAgo?: number;
      }
    ) => {
      const stateTemplate = stateByName[stateName];
      if (!stateTemplate) {
        throw new Error(`Template state ${stateName} not found`);
      }

      const existing = runStates.find((rs) => rs.stateId === stateTemplate.id);
      if (existing) {
        return;
      }

      const enteredAt = new Date(Date.now() - data.enteredMinutesAgo * 60 * 1000);
      const exitedAt = data.exitedMinutesAgo
        ? new Date(Date.now() - data.exitedMinutesAgo * 60 * 1000)
        : null;

      await prisma.runState.create({
        data: {
          runId: run.id,
          stateId: stateTemplate.id,
          enteredAt,
          exitedAt,
          slotData: data.slotData,
        },
      });
    };

    await ensureRunState('collect_requirements', {
      slotData: {
        issue_description: {
          slotId: slotByName['issue_description']?.id,
          value: 'Water leaking continuously from kitchen sink and damaging cabinets.',
        },
        location: {
          slotId: slotByName['location']?.id,
          value: 'Al Shaheed Tower, Apt 5B, Kuwait City',
        },
      },
      enteredMinutesAgo: 360,
      exitedMinutesAgo: 240,
    });

    await ensureRunState('negotiate_terms', {
      slotData: {
        quote_amount: {
          slotId: slotByName['quote_amount']?.id,
          currency: 'KWD',
          value: 180,
        },
        timeline: {
          slotId: slotByName['timeline']?.id,
          value: 'Technician on-site at 7pm tonight',
        },
      },
      enteredMinutesAgo: 200,
    });

    await ensureRunState('commit_service', {
      slotData: {
        deposit_paid: {
          slotId: slotByName['deposit_paid']?.id,
          value: '30% deposit paid via KNET transaction 928388',
        },
      },
      enteredMinutesAgo: 90,
      exitedMinutesAgo: 30,
    });

    const refreshedRun = await prisma.coordinationRun.findUnique({
      where: { id: run.id },
      include: {
        participants: { include: { role: true } },
        states: { include: { state: true } },
      },
    });

    console.log('✓ Demo participants ensured');
    console.log(`   Participants: ${(refreshedRun?.participants || []).length}`);
    console.log('✓ Run state history ensured');
    console.log(`   States: ${(refreshedRun?.states || []).length}`);

    console.log('✅ Coordination templates seeded successfully!');
    console.log(`   Template ID: ${template.id}`);
    console.log(`   Space ID: ${testSpace.id}`);
    if (refreshedRun) {
      console.log(`   Demo Run ID: ${refreshedRun.id}`);
    }

  } catch (error) {
    console.error('Error seeding coordination templates:', error);
    throw error;
  }
}

seedCoordinationTemplates()
  .catch((e) => {
    console.error('Failed to seed coordination templates:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
