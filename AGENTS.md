# Repository Guidelines

## Project Structure & Module Organization
- `apps/web` Next.js 14 UI with Tailwind; chat, outcomes, and operator flows live in `components` and `app/s/[spaceId]`.
- `apps/api` NestJS + Prisma domain services under `src/modules`; automation logic in `modules/actions`.
- `apps/ai` FastAPI RAG orchestrator in `main.py` managing embeddings, prompts, and ingestion.
- `packages/ui` shared React primitives; `packages/types` canonical DTOs.
- `infra` Docker Compose stacks, database bootstrap, and e2e harness `infra/e2e.ts`.
- `agents/` stores role definitions (`team.yaml`) and playbooks for multi-agent collaboration.

## Build, Test, and Development Commands
- `pnpm i` installs all workspaces; rerun after lockfile updates.
- `pnpm -w dev` launches web, API, and AI services via Turborepo.
- `pnpm -w db:migrate` applies Prisma migrations; `pnpm -w db:setup` enforces RLS + pgvector.
- `pnpm -w seed` prepares demo spaces for local testing.
- `pnpm -w e2e` executes the RLS isolation smoke test.
- `bash test-api-execution.sh` replays action execution flows; `python3 test-rag-fix.py` guards RAG regressions.

## Coding Style & Naming Conventions
- TypeScript/JavaScript: 2-space indentation, camelCase for variables/functions, PascalCase components, kebab-case filenames (`outcome-panel.tsx`).
- Python: 4-space indentation, snake_case modules and functions.
- Before PRs, run `pnpm -w lint` (ESLint) and `pnpm -w format` (Prettier); adopt Ruff when Python linting enters.

## Testing Guidelines
- Co-locate unit tests with implementations; keep integration helpers in `infra/` or `test-*.{js,py}`.
- Ensure new changes trigger at least one automated check (e2e harness, API script, or RAG regression).
- Document any manual verification in PR descriptions until coverage is automated.

## Commit & Pull Request Guidelines
- Use short, imperative commit messages (e.g., `Add cafe order handler`).
- PRs must state scope, tests run (`pnpm -w e2e`, scripts), and flag schema or environment changes.
- Attach relevant screenshots or terminal captures for UX-impacting updates and link backlog items or incidents.

## Security & Configuration Tips
- Copy `.env.example` and set `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY` before running services.
- Respect RLS by sending `x-space-id` headers and using `PrismaService.withSpaceTx` helpers.
- Coordinate secrets or infra changes with `infra_ops` and `tech_lead` listed in `agents/team.yaml`.
