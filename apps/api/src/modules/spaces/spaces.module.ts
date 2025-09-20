import { Module } from '@nestjs/common';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { PrismaService } from '../../prisma.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [SpacesController],
  providers: [SpacesService, PrismaService],
})
export class SpacesModule {}

