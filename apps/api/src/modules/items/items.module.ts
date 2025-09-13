import { Module } from '@nestjs/common';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { PrismaService } from '../../prisma.service';
import { NormalizeDedupeService } from './normalize-dedupe.service';

@Module({
  controllers: [ItemsController],
  providers: [ItemsService, NormalizeDedupeService, PrismaService],
  exports: [ItemsService],
})
export class ItemsModule {}

