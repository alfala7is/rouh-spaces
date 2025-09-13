import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const space = await prisma.space.create({ data: { name: 'Demo Space' } });
  console.log('Space created', space.id);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`select set_config('app.space_id', '${space.id}', true)`);
    await tx.member.create({ data: { userId: 'demo-user', spaceId: space.id, role: 'operator', status: 'active' } });
    const s1 = await tx.source.create({ data: { spaceId: space.id, type: 'csv', status: 'ok' } });
    await tx.source.create({ data: { spaceId: space.id, type: 'manual', status: 'ok' } });

    const items = [
      { title: 'Sunny Apartment', price: { value: 1200, source: 'AgencyA' }, phone: '+111' },
      { title: 'Cozy Studio', price: { value: 900, source: 'AgencyB' }, phone: '+222' },
      { title: 'Beach House', price: { value: 3000, source: 'Owner' }, phone: '+333' },
    ];
    for (const it of items) {
      await tx.item.create({ data: { spaceId: space.id, type: 'listing', canonicalJson: it, lastSeenAt: new Date() } });
    }
    const first = await tx.item.findFirstOrThrow({ where: { spaceId: space.id } });
    const act = await tx.action.create({ data: { spaceId: space.id, userId: 'demo-user', itemId: first.id, type: 'contact' } });
    await tx.ledgerEvent.create({ data: { spaceId: space.id, actorId: 'demo-user', entity: 'action', eventType: 'action.contact', payloadJson: { actionId: act.id } } });
    console.log('Seeded: sources', s1.id, 'items + action');
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

