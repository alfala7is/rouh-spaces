/* eslint-disable */
require('dotenv/config');
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const run = (sql) => client.query(sql).catch((e) => console.error(e.message));

  await run(`CREATE EXTENSION IF NOT EXISTS postgis;`);
  // Skip vector extension for now due to installation issues
  // await run(`CREATE EXTENSION IF NOT EXISTS vector;`);
  await run(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await run(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'item_canonical_json_gin'
      ) THEN
        CREATE INDEX item_canonical_json_gin ON "Item" USING gin (("canonicalJson"::jsonb));
      END IF;
    END $$;
  `);

  const policies = [
    { table: 'Member', column: '"spaceId"' },
    { table: 'Source', column: '"spaceId"' },
    { table: 'Item', column: '"spaceId"' },
    { table: 'Action', column: '"spaceId"' },
    { table: 'Lead', column: '"spaceId"' },
    { table: 'LedgerEvent', column: '"spaceId"' },
    { table: 'AiEmbedding', column: '"spaceId"' },
  ];
  for (const { table, column } of policies) {
    await run(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    await run(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = '${table}' AND policyname = '${table.toLowerCase()}_by_space'
        ) THEN
          CREATE POLICY ${table.toLowerCase()}_by_space ON "${table}"
          USING (${column}::text = current_setting('app.space_id', true))
          WITH CHECK (${column}::text = current_setting('app.space_id', true));
        END IF;
      END $$;
    `);
  }

  // Space table policies
  await run(`ALTER TABLE "Space" ENABLE ROW LEVEL SECURITY;`);
  await run(`
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

  // Vector column on AiEmbedding - commented out until vector extension is fixed
  /*
  await run(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='AiEmbedding') THEN
        BEGIN
          ALTER TABLE "AiEmbedding" ADD COLUMN IF NOT EXISTS embedding vector(1536);
        EXCEPTION WHEN duplicate_column THEN
          -- ignore
        END;
        CREATE INDEX IF NOT EXISTS ai_embedding_ivfflat ON "AiEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
      END IF;
    END $$;
  `);
  */

  await client.end();
  console.log('RLS and extensions ensured.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
