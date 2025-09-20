import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugProfiles() {
  console.log('Checking Spaces and their Profiles...\n');

  const spaces = await prisma.space.findMany({
    where: { name: { contains: 'Dr. Jasem' } },
    include: {
      profile: true,
    }
  });

  console.log('Spaces found:', spaces.length);

  for (const space of spaces) {
    console.log(`\nSpace: ${space.name}`);
    console.log(`ID: ${space.id}`);
    console.log(`Profile:`, space.profile ? 'EXISTS' : 'MISSING');
    if (space.profile) {
      console.log(`Business Name: ${space.profile.businessName}`);
      console.log(`Rating: ${space.profile.rating}`);
    }
  }

  // Also check raw profiles
  const profiles = await prisma.providerProfile.findMany();
  console.log(`\nTotal ProviderProfile records: ${profiles.length}`);

  for (const profile of profiles) {
    console.log(`- ${profile.businessName} (Space ID: ${profile.spaceId})`);
  }
}

debugProfiles()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });