import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

interface TrainingMessage {
  id: string;
  spaceId: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sequence: number;
}

async function createEmbedding(spaceId: string, text: string, itemId?: string) {
  try {
    const payload: any = {
      space_id: spaceId,
      text,
    };

    // Only include item_id if provided
    if (itemId) {
      payload.item_id = itemId;
    }

    const response = await axios.post('http://localhost:8000/embed', payload);
    return response.data;
  } catch (error: any) {
    console.error(`Failed to create embedding: ${error.response?.data?.detail || error.message}`);
    return null;
  }
}

async function seedEmbeddings() {
  console.log('🚀 Starting embedding generation for existing training data...\n');

  try {
    // Get all spaces
    const spaces = await prisma.space.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    console.log(`Found ${spaces.length} active spaces\n`);

    for (const space of spaces) {
      console.log(`Processing space: ${space.name} (${space.id})`);

      // Get all training conversations for this space
      const trainingMessages = await prisma.spaceTrainingConversation.findMany({
        where: {
          spaceId: space.id,
          isActive: true,
        },
        orderBy: [
          { sessionId: 'asc' },
          { sequence: 'asc' },
        ],
      });

      if (trainingMessages.length === 0) {
        console.log('  No training data found\n');
        continue;
      }

      console.log(`  Found ${trainingMessages.length} training messages`);

      // Group messages by session
      const sessions = trainingMessages.reduce((acc, msg) => {
        if (!acc[msg.sessionId]) {
          acc[msg.sessionId] = [];
        }
        acc[msg.sessionId].push(msg);
        return acc;
      }, {} as Record<string, typeof trainingMessages>);

      console.log(`  Found ${Object.keys(sessions).length} training sessions`);

      let embeddingsCreated = 0;
      let embeddingsFailed = 0;

      // Create embeddings for individual messages
      for (const msg of trainingMessages) {
        const text = `${msg.role}: ${msg.content}`;
        // Don't pass itemId for training messages - it's not needed
        const result = await createEmbedding(space.id, text);
        if (result) {
          embeddingsCreated++;
        } else {
          embeddingsFailed++;
        }

        // Rate limiting - wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Create embeddings for conversation chunks (combining messages in context)
      for (const [sessionId, messages] of Object.entries(sessions)) {
        // Create chunks of 3-5 messages for better context
        const chunkSize = 4;
        for (let i = 0; i < messages.length; i += chunkSize) {
          const chunk = messages.slice(i, Math.min(i + chunkSize, messages.length));
          const conversationText = chunk
            .map(msg => `${msg.role}: ${msg.content}`)
            .join('\n');

          // Don't pass itemId for conversation chunks either
          const result = await createEmbedding(space.id, conversationText);

          if (result) {
            embeddingsCreated++;
          } else {
            embeddingsFailed++;
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`  ✅ Created ${embeddingsCreated} embeddings`);
      if (embeddingsFailed > 0) {
        console.log(`  ⚠️  Failed to create ${embeddingsFailed} embeddings`);
      }
      console.log('');
    }

    // Check how many embeddings exist now
    const totalEmbeddings = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "AiEmbedding"
    `;

    console.log(`✅ Embedding seeding complete!`);
    console.log(`Total embeddings in database: ${(totalEmbeddings as any)[0].count}`);

  } catch (error) {
    console.error('Error seeding embeddings:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Check if AI service is running
async function checkAiService() {
  try {
    await axios.post('http://localhost:8000/embed', {
      space_id: 'test',
      text: 'test',
    });
    return true;
  } catch (error: any) {
    // Check various error conditions that indicate the service is running
    if (error.response) {
      // Any response (even error) means the service is running
      const status = error.response.status;
      if (status === 422 || status === 500 || status === 400) {
        return true; // Service is running, just validation/processing errors
      }
    }
    return false;
  }
}

async function main() {
  console.log('Checking AI service availability...');
  const aiServiceRunning = await checkAiService();

  if (!aiServiceRunning) {
    console.error('❌ AI service is not running on http://localhost:8000');
    console.error('Please start the AI service first with: cd apps/ai && python -m uvicorn main:app --reload');
    process.exit(1);
  }

  console.log('✅ AI service is running\n');

  await seedEmbeddings();
}

main();