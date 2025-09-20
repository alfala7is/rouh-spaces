import { Module } from '@nestjs/common';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { PrismaService } from '../../prisma.service';
import { NormalizeDedupeService } from './normalize-dedupe.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [ItemsController],
  providers: [ItemsService, NormalizeDedupeService, PrismaService],
  exports: [ItemsService],
})
export class ItemsModule {}

