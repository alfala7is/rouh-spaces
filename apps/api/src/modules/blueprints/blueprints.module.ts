import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BlueprintsController } from './blueprints.controller';
import { BlueprintsService } from './blueprints.service';

@Module({
  controllers: [BlueprintsController],
  providers: [BlueprintsService, PrismaService],
  exports: [BlueprintsService],
})
export class BlueprintsModule {}
