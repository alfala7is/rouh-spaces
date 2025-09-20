import { Module } from '@nestjs/common';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';
import { HandlerRegistry } from './handlers/handler-registry';
import { CafeOrderHandler } from './handlers/cafe-order.handler';
import { EmailHandler } from './handlers/email.handler';
import { ManualTaskHandler } from './handlers/manual.handler';
import { PrismaService } from '../../prisma.service';
import { EventsGateway } from '../events.gateway';
import { ActionExecutionService } from './execution.service';

@Module({
  controllers: [ActionsController],
  providers: [
    ActionsService,
    ActionExecutionService,
    HandlerRegistry,
    CafeOrderHandler,
    EmailHandler,
    ManualTaskHandler,
    PrismaService,
    EventsGateway,
  ],
  exports: [HandlerRegistry],
})
export class ActionsModule {}
