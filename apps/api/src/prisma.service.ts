import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
    // Skip RLS and complex setup for now - just connect to database
  }

  async enableShutdownHooks(app: INestApplication) {
    // Note: beforeExit event is not available in Prisma client type
    // this.$on('beforeExit', async () => {
    //   await app.close();
    // });
  }

  async withSpaceTx(spaceId: string, fn: (tx: any) => Promise<any>) {
    return this.$transaction(async (tx: any) => {
      // Ensure RLS applies by setting per-request space id
      await tx.$executeRawUnsafe(`select set_config('app.space_id', $1, true)`, spaceId);
      return fn(tx);
    });
  }
}
