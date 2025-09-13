import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { EventsGateway } from '../events.gateway';

@Injectable()
export class ActionsService {
  constructor(private prisma: PrismaService, private events: EventsGateway) {}

  async create(spaceId: string, userId: string | undefined, body: { itemId?: string; type: 'contact' | 'inquiry' | 'hold' | 'book' | 'intro' }) {
    return this.prisma.withSpaceTx(spaceId, async (tx) => {
      const action = await tx.action.create({
        data: { spaceId, userId: userId ?? null, itemId: body.itemId ?? null, type: body.type, status: 'pending' },
      });
      let lead: any = null;
      if (body.type === 'contact' || body.type === 'inquiry') {
        // simple qualification stub
        lead = await tx.lead.create({
          data: {
            spaceId,
            itemId: body.itemId!,
            providerId: null,
            seekerId: userId ?? null,
            qualified: true,
            refunded: false,
          },
        });
      }
      const ledger = await tx.ledgerEvent.create({
        data: {
          spaceId,
          actorId: userId ?? null,
          entity: 'action',
          eventType: `action.${body.type}`,
          payloadJson: { actionId: action.id, leadId: lead?.id },
        },
      });
      this.events.broadcast('action.created', { action, lead, ledger });
      return { action, lead, ledger };
    });
  }
}

