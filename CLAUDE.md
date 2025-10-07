# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Rouh Spaces is a monorepo for building reusable coordination blueprints (executable playbooks) that enable human-agent collaboration across personal, family, and business workflows. The platform uses blueprints to declare roles, states, data slots, policies, and automations that guide coordination from Express ’ Confirm phases, with continuous learning from ledger events and training loops.

**Tech Stack:**
- **Web**: Next.js 14 + TypeScript + Tailwind
- **API**: NestJS + Prisma (Postgres) + BullMQ (Redis)
- **AI**: FastAPI (Python) for embeddings + RAG with OpenAI
- **Infra**: Postgres (pgvector + PostGIS + pgcrypto), Redis, MinIO (Docker Compose)

## Essential Commands

### Setup & Development
```bash
# Install all dependencies
pnpm i

# Install Python AI service dependencies
python3 -m pip install -r apps/ai/requirements.txt

# Start infrastructure (Postgres on 5433, Redis on 6379, MinIO on 9000/9001)
docker compose -f infra/docker-compose.yml up -d --build

# Run database migrations and setup RLS policies
pnpm -w db:migrate
pnpm -w db:setup

# Seed demo data
pnpm -w seed

# Seed coordination templates (plumber demo, etc.)
pnpm --filter @rouh/api run seed:coordination

# Start all services (web:3000, api:3001, ai:8000)
pnpm -w dev
```

### Individual Service Commands
```bash
# API only
pnpm --filter @rouh/api run dev

# API with faster transpilation (when type-check is slow)
pnpm --filter @rouh/api run dev:transpile

# Web only
pnpm --filter @rouh/web run dev

# AI service only (from apps/ai directory)
python3 -m uvicorn main:app --reload --port 8000
```

### Database Operations
```bash
# Create new migration
cd apps/api
npx prisma migrate dev --name migration_name

# Apply migrations in production
pnpm -w db:migrate

# Setup RLS policies and extensions
pnpm -w db:setup

# Generate Prisma client
pnpm --filter @rouh/api run prisma:generate
```

### Testing & Validation
```bash
# Run RLS isolation smoke test
pnpm -w e2e

# Test action execution flow
bash test-api-execution.sh

# Test RAG query flow
python3 test-rag-fix.py

# Test chat flow
node test-chat-flow.js

# Test AI training
node test-ai-training.js
```

### Code Quality
```bash
# Lint all packages
pnpm -w lint

# Format all packages
pnpm -w format
```

### Building
```bash
# Build all packages
pnpm -w build

# Build specific package
pnpm --filter @rouh/api run build
pnpm --filter @rouh/web run build
```

## Architecture & Key Concepts

### Row-Level Security (RLS) Architecture

**Critical**: Every database table uses Postgres RLS policies. All requests MUST include `x-space-id` header.

**How it works:**
1. SpaceIdMiddleware (`apps/api/src/shared/space.middleware.ts`) extracts `x-space-id` from headers/query
2. API wraps database calls in transactions that set `current_setting('app.space_id')`
3. RLS policies filter queries to only return rows matching the space ID
4. Setup script: `apps/api/scripts/setup-rls.cjs` creates policies on tables: Member, Source, Item, Action, Lead, LedgerEvent, AiEmbedding

**Authentication Methods** (priority order):
1. **Magic link tokens** (for coordination participants): Query param `?token=xxx` or `x-magic-token` header validates against `RunParticipant.magicToken`
2. **Bearer tokens**: `Authorization: Bearer <token>` validates against `UserSession` table
3. **Header-based** (dev/testing): `x-user-id` and `x-roles` headers

### Coordination Blueprint System

**Blueprints** are reusable coordination patterns stored as `CoordinationTemplate` records with:
- **Roles** (`TemplateRole`): Participants like requester, provider, organizer with capabilities
- **States** (`TemplateState`): 5-phase flow (Express ’ Explore ’ Commit ’ Evidence ’ Confirm)
- **Slots** (`TemplateSlot`): Data fields collected/produced during coordination
- **Runs** (`CoordinationRun`): Live executions with `RunParticipant` and `RunState` tracking

**Key files:**
- DB schema: `apps/api/prisma/schema.prisma` (lines 703-891)
- API modules: `apps/api/src/modules/coordination/`, `apps/api/src/modules/templates/`, `apps/api/src/modules/blueprints/`
- AI compiler: `apps/ai/main.py` (template normalization logic)
- Template models: `apps/ai/template_models.py`

### AI & RAG System

**FastAPI service** (`apps/ai/main.py`) provides:
- `/embed` - Create embeddings with OpenAI and store in `AiEmbedding` table
- `/rag/query` - Semantic search + LLM generation with space context
- `/compile` - Convert natural language blueprint descriptions into structured templates

**Flow:**
1. NestJS `AiService` (`apps/api/src/modules/ai/ai.service.ts`) calls Python service
2. Python queries Postgres directly for embeddings (no pgvector extension currently due to install issues)
3. Uses cosine similarity on JSON-stored embedding arrays
4. OpenAI generates responses with space context (rules, profile, training examples)

### Module Structure

**API Modules** (`apps/api/src/modules/`):
- `spaces/` - Space CRUD, exploration, profiles
- `items/` - Item upsert, search (canonical JSON storage)
- `actions/` - Action creation, execution tracking, handlers
- `sources/` - Data source management, CSV ingestion stub
- `ledger/` - Event logging
- `ai/` - Proxy to Python AI service
- `auth/` - User registration, login, session management
- `templates/` - CoordinationTemplate CRUD
- `coordination/` - Run management, participant magic links
- `blueprints/` - Blueprint-aware chat and matching
- `events.gateway.ts` - Socket.IO gateway for real-time updates

**Web Components** (`apps/web/components/`):
- `AiChat.tsx` - Main chat interface with blueprint matching
- `SpaceStudio.tsx` - Blueprint designer/editor
- `ChatThread.tsx` - Conversation rendering
- `LiveChat.tsx` - Studio embedded chat
- `coordination/` - Coordination UI components
- `studio/CoordinationPanel.tsx` - Template builder UI
- `templates/` - Template gallery components

### Data Model Highlights

**Core Tables:**
- `Space` - Isolated workspaces with autonomy levels (L0-L3), templates, policies
- `Item` - Flexible JSON documents (`canonicalJson`) representing listings, services, etc.
- `Action` - User/agent actions with execution tracking and handlers
- `ActionExecution` - Retry logic, external refs, handler results
- `Handler` - Provider system handlers (api, webhook, email, form, manual)
- `Receipt` - Proof of completed actions

**Autonomy & Intelligence:**
- `SpacePolicy` - Action constraints and conditions (JSONPath)
- `SpaceTrigger` - Automated monitoring (freshness, SLA, price changes)
- `ActionProposal` - AI-suggested actions awaiting consent
- `Escalation` - Human operator intervention requests
- `MonitoringTask` - Scheduled checks on items/actions
- `SpaceRule` - FAQ, routing, decision logic
- `SpaceKnowledge` - Extracted facts, behaviors, workflows
- `SpaceTrainingConversation` - Training examples for AI behavior

**Provider Features:**
- `ProviderProfile` - Business info, credentials, ratings
- `SpaceAnalytics` - Daily metrics aggregation
- `Integration` - External service connections (Square, Calendly, etc.)
- `SpaceReview` - User ratings and feedback

### Real-time Updates

**Socket.IO Gateway** (`apps/api/src/modules/events.gateway.ts`):
- Clients join room: `join:space:{spaceId}`
- Events: `action:created`, `action:completed`, `run:updated`, etc.
- Web client: `apps/web/lib/api.ts` includes WebSocket utilities

### Environment Configuration

**Required variables** (`.env`):
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/rouh
REDIS_URL=redis://localhost:6379
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=rouh-local
OPENAI_API_KEY=sk-...
JWT_SECRET=devsecret
API_PORT=3001
WEB_PORT=3000
AI_PORT=8000
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_API_WS=http://localhost:3001
AI_SERVICE_URL=http://localhost:8000
```

**Note**: Postgres runs on port **5433** (not default 5432) to avoid conflicts.

## Development Patterns

### Making Database Changes

1. Update `apps/api/prisma/schema.prisma`
2. Create migration: `cd apps/api && npx prisma migrate dev --name change_description`
3. If adding RLS-protected tables, update `apps/api/scripts/setup-rls.cjs`
4. Run `pnpm -w db:setup` to apply RLS changes
5. Generate client: `pnpm --filter @rouh/api run prisma:generate`

### Adding New API Endpoints

1. Create/update module in `apps/api/src/modules/`
2. Add service methods with `PrismaService` injection
3. Use `@spaceId` decorator or `req.spaceId` from middleware
4. Controllers should validate with `class-validator` DTOs
5. Register module in `apps/api/src/modules/app.module.ts`
6. Remember RLS: queries auto-filter by space_id via transaction wrapper

### Working with AI Service

1. Python changes in `apps/ai/main.py`
2. Add dependencies to `apps/ai/requirements.txt`
3. Restart AI service to reload
4. Update TypeScript interfaces in `apps/api/src/modules/ai/ai.service.ts`
5. Test with curl or integration tests

### Adding Web Features

1. Components in `apps/web/components/`
2. Pages/routes in `apps/web/app/`
3. API calls via `apps/web/lib/api.ts` helper (includes retry, cache, auth)
4. Use `apiFetch(path, { spaceId, ...options })` for API calls
5. Socket connection via `apps/web/lib/coordination-socket.ts` or similar

## Coding Standards

- **TypeScript/JavaScript**: 2-space indentation, camelCase variables/functions, PascalCase components, kebab-case filenames
- **Python**: 4-space indentation, snake_case
- **Commits**: Imperative mood (e.g., "Add cafe order handler", not "Added" or "Adds")
- Run `pnpm -w lint` and `pnpm -w format` before commits
- Husky runs lint-staged on pre-commit

## Troubleshooting

### Postgres Connection Issues
- Verify Docker container running: `docker ps`
- Check port 5433 (not 5432): `DATABASE_URL=postgresql://...@localhost:5433/rouh`
- Recreate: `docker compose -f infra/docker-compose.yml down -v && docker compose -f infra/docker-compose.yml up -d`

### RLS Blocking Queries
- Ensure `x-space-id` header is set
- Check `setup-rls.cjs` ran successfully
- Verify transaction wrapper: `PrismaService.withSpaceTx((prisma) => {...})`

### AI Service Errors
- Check `OPENAI_API_KEY` is valid
- Verify `AI_SERVICE_URL` points to http://localhost:8000
- Check Python dependencies: `python3 -m pip install -r apps/ai/requirements.txt`
- Review logs: AI service prints to console

### Type Errors During Development
- Use faster mode: `pnpm --filter @rouh/api run dev:transpile`
- Regenerate Prisma client: `pnpm --filter @rouh/api run prisma:generate`

### pgvector Extension Missing
- Currently disabled in `setup-rls.cjs` due to installation issues
- Embeddings stored as JSON arrays instead of native vector type
- Future: uncomment `CREATE EXTENSION IF NOT EXISTS vector;` when available

## Important Files Reference

- **README.md** - Quick start guide and curl examples
- **AGENTS.md** - Product vision, sprint plan, and engineering guidelines
- `apps/api/prisma/schema.prisma` - Complete data model
- `apps/api/src/shared/space.middleware.ts` - RLS and auth middleware
- `apps/api/scripts/setup-rls.cjs` - RLS policy setup
- `apps/ai/main.py` - AI service entrypoint
- `apps/web/lib/api.ts` - Web API client with retry/cache
- `infra/seed.ts` - Demo data seeder
- `infra/e2e.ts` - RLS isolation test
