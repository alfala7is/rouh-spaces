import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
    // Idempotent setup: ensure JSONB GIN index and RLS policies exist; ensure pgvector column
    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'item_canonical_json_gin'
        ) THEN
          CREATE INDEX item_canonical_json_gin ON "Item" USING gin (("canonicalJson"::jsonb));
        END IF;
      END $$;
    `);

    // Ensure AiEmbedding has vector column and index. Prisma can't model vector, so we manage manually.
    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='AiEmbedding' AND column_name='embedding'
        ) THEN
          -- ok
        ELSIF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name='AiEmbedding'
        ) THEN
          ALTER TABLE "AiEmbedding" ADD COLUMN embedding vector(1536);
        END IF;
      END $$;
    `);
    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'ai_embedding_ivfflat'
        ) THEN
          CREATE INDEX ai_embedding_ivfflat ON "AiEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
        END IF;
      END $$;
    `);

    // Enable RLS and add policies based on app.space_id
    const policySpec = [
      { table: 'Member', column: 'spaceId' },
      { table: 'Source', column: 'spaceId' },
      { table: 'Item', column: 'spaceId' },
      { table: 'Action', column: 'spaceId' },
      { table: 'Lead', column: 'spaceId' },
      { table: 'LedgerEvent', column: 'spaceId' },
      { table: 'AiEmbedding', column: 'spaceId' },
    ];
    for (const { table: t, column: c } of policySpec) {
      await this.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`);
      await this.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = '${t}' AND policyname = '${t.toLowerCase()}_by_space'
          ) THEN
            CREATE POLICY ${t.toLowerCase()}_by_space ON "${t}"
            USING (${c}::text = current_setting('app.space_id', true))
            WITH CHECK (${c}::text = current_setting('app.space_id', true));
          END IF;
        END $$;
      `);
    }

    // Space table: allow select/update/delete by matching id; allow insert for anyone
    await this.$executeRawUnsafe(`ALTER TABLE "Space" ENABLE ROW LEVEL SECURITY;`);
    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'Space' AND policyname = 'space_by_space_select'
        ) THEN
          CREATE POLICY space_by_space_select ON "Space" FOR SELECT
          USING (id::text = current_setting('app.space_id', true));
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'Space' AND policyname = 'space_by_space_update'
        ) THEN
          CREATE POLICY space_by_space_update ON "Space" FOR UPDATE
          USING (id::text = current_setting('app.space_id', true))
          WITH CHECK (id::text = current_setting('app.space_id', true));
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'Space' AND policyname = 'space_insert'
        ) THEN
          CREATE POLICY space_insert ON "Space" FOR INSERT WITH CHECK (true);
        END IF;
      END $$;
    `);
  }

  async enableShutdownHooks(app: INestApplication) {
    this.$on('beforeExit', async () => {
      await app.close();
    });
  }

  async withSpaceTx(spaceId: string, fn: (tx: PrismaClient) => Promise<any>) {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.space_id', '${spaceId}', true);`);
      return fn(tx);
    });
  }
}
