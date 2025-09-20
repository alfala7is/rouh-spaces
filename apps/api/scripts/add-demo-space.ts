import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Quick script to add a single demo space
// Usage: npx ts-node scripts/add-demo-space.ts "Space Name" "Category" "Description"

async function addDemoSpace() {
  const [,, name, category, description] = process.argv;

  if (!name || !category || !description) {
    console.log('Usage: npx ts-node scripts/add-demo-space.ts "Space Name" "Category" "Description"');
    console.log('Example: npx ts-node scripts/add-demo-space.ts "Pizza Palace" "food" "Best pizza in town with quick delivery"');
    process.exit(1);
  }

  try {
    // Get the appropriate template
    const template = await prisma.spaceTemplate.findFirst({
      where: { domain: category }
    });

    const space = await prisma.space.create({
      data: {
        name,
        description,
        category,
        isPublic: true,
        verified: Math.random() > 0.5,
        templateId: template?.id,
        tags: [category, 'demo'],
      }
    });

    // Create a basic provider profile
    await prisma.providerProfile.create({
      data: {
        spaceId: space.id,
        businessName: name,
        contactName: 'Demo Owner',
        email: `info@${name.toLowerCase().replace(/\s/g, '')}.com`,
        phone: '+1 555 DEMO',
        bio: description,
        rating: Math.round((4 + Math.random()) * 10) / 10, // 4.0 - 5.0
        reviewCount: Math.floor(Math.random() * 200) + 10, // 10-210
        responseTime: Math.floor(Math.random() * 30) + 5, // 5-35 minutes
      }
    });

    console.log(`✅ Created demo space: ${name} (${category})`);
    console.log(`   Space ID: ${space.id}`);

  } catch (error) {
    console.error('❌ Error creating demo space:', error);
    process.exit(1);
  }
}

addDemoSpace()
  .finally(async () => {
    await prisma.$disconnect();
  });