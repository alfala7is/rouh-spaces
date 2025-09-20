import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { EventsGateway } from '../events.gateway';
import { HandlerRegistry } from './handlers/handler-registry';
import { CafeOrderHandler } from './handlers/cafe-order.handler';
import { EmailHandler } from './handlers/email.handler';
import { ManualTaskHandler } from './handlers/manual.handler';
import { ActionExecutionService } from './execution.service';

@Injectable()
export class ActionsService implements OnModuleInit {
  private readonly logger = new Logger(ActionsService.name);

  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
    private handlerRegistry: HandlerRegistry,
    private cafeOrderHandler: CafeOrderHandler,
    private emailHandler: EmailHandler,
    private manualTaskHandler: ManualTaskHandler,
    private execution: ActionExecutionService,
  ) {}

  async onModuleInit() {
    // Register all handlers on module initialization
    this.handlerRegistry.registerHandler(this.cafeOrderHandler);
    this.handlerRegistry.registerHandler(this.emailHandler);
    this.handlerRegistry.registerHandler(this.manualTaskHandler);

    this.logger.log('Action handlers registered successfully');
  }

  // Basic action creation without agentic features
  async create(
    spaceId: string,
    userId: string | undefined,
    body: {
      itemId?: string;
      type: 'contact' | 'inquiry' | 'hold' | 'book' | 'intro' | 'order' | 'schedule' | 'submit';
      parameters?: Record<string, any>;
    }
  ) {
    this.logger.log(`Creating action of type ${body.type} in space ${spaceId}`);

    // If a demo item is referenced but doesn't exist, create a lightweight item for it
    if (body.itemId) {
      const exists = await this.prisma.item.findUnique({ where: { id: body.itemId } });
      if (!exists) {
        const mock = body.parameters?.mock_item_data || {};
        const inferredType = mock.type || 'listing';
        await this.prisma.item.create({
          data: {
            id: body.itemId,
            spaceId,
            type: inferredType,
            canonicalJson: Object.keys(mock).length ? mock : { title: 'Demo Item' },
            lastSeenAt: new Date(),
          },
        });
      }
    }

    const action = await this.prisma.action.create({
      data: {
        spaceId,
        userId: userId ?? null,
        itemId: body.itemId ?? null,
        type: body.type,
        status: 'queued',
        parameters: body.parameters || undefined,
      },
    });

    let lead: any = null;
    if (body.type === 'contact' || body.type === 'inquiry') {
      lead = await this.prisma.lead.create({
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

    // Create ledger event
    const ledger = await this.prisma.ledgerEvent.create({
      data: {
        spaceId,
        actorId: userId ?? null,
        entity: 'action',
        eventType: `action.${body.type}`,
        payloadJson: {
          actionId: action.id,
          leadId: lead?.id,
          parameters: body.parameters,
        },
      },
    });

    // Broadcast action creation
    this.events.broadcast('action.created', { action, lead, ledger });

    // Kick off execution asynchronously (no await to keep request snappy)
    this.execution
      .executeAction(action.id)
      .catch((err) => this.logger.error(`Failed to execute action ${action.id}: ${err?.message}`));

    return { action, lead, ledger };
  }

  async getActionsBySpace(spaceId: string, limit = 50, offset = 0) {
    return this.prisma.action.findMany({
      where: { spaceId },
      include: {
        item: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async cancelAction(actionId: string, userId: string) {
    const action = await this.prisma.action.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      throw new Error('Action not found');
    }

    if (action.status === 'completed') {
      throw new Error('Cannot cancel completed action');
    }

    await this.prisma.action.update({
      where: { id: actionId },
      data: { status: 'cancelled' },
    });

    // Broadcast cancellation
    this.events.broadcast('action.cancelled', { actionId, userId });

    return { success: true };
  }
}
