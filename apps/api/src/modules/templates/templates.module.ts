import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { PrismaService } from '../../prisma.service';
import { EventsGateway } from '../events.gateway';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, PrismaService, EventsGateway],
  exports: [TemplatesService],
})
export class TemplatesModule {}