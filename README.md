# Rouh Spaces Monorepo (MVP)

Production-ready MVP for Rouh Spaces featuring:

- Web app: Next.js 14 + TypeScript + Tailwind
- API: NestJS + Prisma + RLS + BullMQ
- AI: FastAPI (Python) for embeddings + RAG
- Infra: Postgres (pgvector + PostGIS + pgcrypto), Redis, MinIO via Docker Compose

## Repo Layout

```
/apps
  /web      # Next.js
  /api      # NestJS API + Prisma
  /ai       # FastAPI service
/packages
  /ui       # shared UI primitives
  /config   # tsconfig/eslint/prettier shared
  /types    # zod types & shared interfaces
/infra
  docker-compose.yml
  /db/init  # DB init extensions
  seed.ts   # seed demo data
  e2e.ts    # simple end-to-end script
.env.example
```

## Quick Start

1) Install dependencies (Node + Python)

```
pnpm i
python3 -m pip install -r apps/ai/requirements.txt
```

2) Start local infra (Postgres + Redis + MinIO)

```
docker compose -f infra/docker-compose.yml up -d --build
```

3) Apply database migrations and setup policies

```
pnpm -w db:migrate
pnpm -w db:setup
```

4) Seed demo data

```
pnpm -w seed
```

5) Run all apps

```
pnpm -w dev
```

- Web: http://localhost:3000
- API: http://localhost:3001
- AI:  http://localhost:8000
- MinIO Console: http://localhost:9001 (minioadmin/minioadmin)

Notes:
- Prisma applies RLS and pgvector setup at API startup and also via `pnpm -w db:setup`.
- RLS reads `current_setting('app.space_id')` set by API per-request using a transaction wrapper.

## Environment

Copy `.env.example` to `.env` and update as needed.

Important:

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rouh`
- `REDIS_URL=redis://localhost:6379`
- `OPENAI_API_KEY=...` (for AI embeddings + RAG)

## API Endpoints (Minimal)

- POST `/spaces` { name }
- GET `/spaces/:id`
- POST `/sources` { type, authJson? }
- POST `/sources/:id/sync` { rows[] }  (stub CSV ingestion via BullMQ)
- POST `/items/upsert` { type?, canonicalJson }
- GET `/items/search?query=&limit=&offset=`
- POST `/actions` { itemId?, type }
- GET `/ledger?spaceId=`

Headers:

- `x-space-id`: UUID of the current space (required for all table access)
- `x-user-id`: user identifier (placeholder for Clerk)

## Curl Examples

Create a space:

```
curl -s -X POST http://localhost:3001/spaces \
  -H 'content-type: application/json' \
  -d '{"name":"Demo Space"}' | jq
```

Upsert items:

```
SPACE=... # space id from create
curl -s -X POST http://localhost:3001/items/upsert \
  -H "x-space-id: $SPACE" -H 'content-type: application/json' \
  -d '{"canonicalJson":{"title":"Sunny Apartment","phone":"+111"}}' | jq
```

Search items:

```
curl -s "http://localhost:3001/items/search?query=Sunny" -H "x-space-id: $SPACE" | jq
```

Post an action (contact):

```
ITEM=... # one of the item ids
curl -s -X POST http://localhost:3001/actions \
  -H "x-space-id: $SPACE" -H 'content-type: application/json' \
  -d '{"itemId":"'$ITEM'","type":"contact"}' | jq
```

RAG query:

```
curl -s -X POST http://localhost:8000/rag/query \
  -H 'content-type: application/json' \
  -d '{"space_id":"'$SPACE'","query":"What listings exist?"}' | jq
```

## RLS Isolation Demo

Simulate two requests with different `x-space-id` headers. Searching with a different space id returns 0 results:

```
pnpm -w e2e
```

## Dev Scripts

- `pnpm -w dev` runs web, api, ai concurrently (Turborepo)
- `pnpm -w db:migrate` applies Prisma migrations
- `pnpm -w db:setup` ensures extensions + RLS + pgvector extras
- `pnpm -w seed` populates demo data
- `pnpm -w e2e` simple e2e script

## Implementation Notes

- Row Level Security uses `current_setting('app.space_id')`. The API wraps each request’s DB calls in a transaction and calls `set_config('app.space_id', $space, true)`.
- Web uses Socket.IO to receive realtime action confirmation toasts.
- AI service stores embeddings in `AiEmbedding` with `pgvector` and performs cosine similarity search.
- For auth, placeholders use `x-user-id` and `x-roles` headers; swap in Clerk in the API middleware when ready.
