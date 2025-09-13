import { Module, OnModuleInit } from '@nestjs/common';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';
import { PrismaService } from '../../prisma.service';
import { IngestQueue } from '../../queues/ingest.queue';

@Module({
  controllers: [SourcesController],
  providers: [SourcesService, PrismaService, IngestQueue],
  exports: [SourcesService],
})
export class SourcesModule implements OnModuleInit {
  constructor(private readonly ingest: IngestQueue) {}
  async onModuleInit() {
    await this.ingest.startWorker();
  }
}

