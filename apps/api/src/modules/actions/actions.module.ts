import { Module } from '@nestjs/common';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';
import { PrismaService } from '../../prisma.service';
import { EventsGateway } from '../events.gateway';

@Module({
  controllers: [ActionsController],
  providers: [ActionsService, PrismaService, EventsGateway],
})
export class ActionsModule {}

