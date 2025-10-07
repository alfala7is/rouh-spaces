import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { EventsGateway } from '../events.gateway';
import { ActionsModule } from '../actions/actions.module';
import { AuthService } from '../auth/auth.service';
import { CoordinationService } from './coordination.service';
import { CoordinationController } from './coordination.controller';
import { MagicLinkController } from './magic-link.controller';
import { CoordinationEngine } from './coordination.engine';
import { MagicLinkGuard } from './guards/magic-link.guard';

@Module({
  imports: [ActionsModule],
  controllers: [CoordinationController, MagicLinkController],
  providers: [
    PrismaService,
    EventsGateway,
    AuthService,
    CoordinationService,
    CoordinationEngine,
    MagicLinkGuard,
  ],
  exports: [CoordinationService, CoordinationEngine],
})
export class CoordinationModule {}