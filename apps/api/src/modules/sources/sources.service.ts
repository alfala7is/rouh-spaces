import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { IngestQueue } from '../../queues/ingest.queue';

@Injectable()
export class SourcesService {
  constructor(private prisma: PrismaService, private ingest: IngestQueue) {}

  async register(spaceId: string, type: 'api' | 'csv' | 'form' | 'manual', authJson?: any) {
    return this.prisma.withSpaceTx(spaceId, (tx) =>
      tx.source.create({ data: { spaceId, type, authJson: authJson ?? null, status: 'ok' } }),
    );
  }

  async scheduleCsvSync(spaceId: string, sourceId: string, rows: any[]) {
    await this.ingest.queue.add('csv', { spaceId, sourceId, kind: 'csv-poll', payload: { rows } });
    return { enqueued: true };
  }
}

