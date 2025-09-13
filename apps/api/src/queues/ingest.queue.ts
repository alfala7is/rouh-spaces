import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma.service';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

export type IngestJob = { spaceId: string; sourceId: string; kind: 'csv-poll'; payload?: any };

export class IngestQueue {
  queue: Queue<IngestJob>;
  worker?: Worker<IngestJob>;

  constructor(private prisma: PrismaService) {
    this.queue = new Queue<IngestJob>('ingest', { connection });
  }

  async startWorker() {
    if (this.worker) return;
    this.worker = new Worker<IngestJob>(
      'ingest',
      async (job: Job<IngestJob>) => {
        const { spaceId, kind, payload } = job.data;
        if (kind === 'csv-poll') {
          // In a real impl, fetch CSV from S3/MinIO. For MVP, use payload.rows
          const rows: any[] = payload?.rows || [];
          await this.prisma.withSpaceTx(spaceId, async (tx) => {
            for (const r of rows) {
              await tx.$executeRawUnsafe(`SELECT set_config('app.space_id', '${spaceId}', true)`);
              await tx.item.create({
                data: {
                  spaceId,
                  type: r.type || 'listing',
                  canonicalJson: r,
                  lastSeenAt: new Date(),
                },
              });
            }
          });
        }
      },
      { connection },
    );
  }
}
