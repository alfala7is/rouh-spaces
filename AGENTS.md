# Rouh Agent Brief

## Product Vision
- Deliver reusable blueprints for human coordination that scale from individual life logistics to family routines and corporate operations.
- Blueprints are executable playbooks: they declare the actors (roles/identities), states, data slots, policies, and automations that drive a coordination from Express → Confirm.
- Space identities (people, orgs, agent personas) are assigned to blueprint roles so runs can execute end-to-end with human-in-the-loop escalation.
- Every run feeds ledger + training loops so knowledge, policies, and automations improve continuously.

## Vocabulary
- Blueprints are executable coordination contracts: they define roles, states, data slots, policies, and automations that govern how identities collaborate inside a space.
- **Space** – A secure, RLS-scoped container for one or more blueprints, their data sources, and the digital identities that operate inside.
- **Blueprint** – A coordination contract describing participants, states, triggers, knowledge, and actions that drive a recurring process.
- **Identity** – A digital representation of a person, family, or organization living inside a space; it can participate in multiple blueprints.
- **Persona** – The autonomous or semi-autonomous behavior package attached to an identity (prompts, policies, guardrails).
- **Run** – A live execution of a blueprint with specific identities playing their assigned roles.

## Current Focus (keep this section fresh)
> Update cadence: refresh the goals below whenever priorities shift, and append “Reviewed YYYY-MM-DD by <name>” to the end of this block when you do. Reviewed 2025-09-26 by Codex.

- Make blueprint creation seamless: opinionated Studio flow from description → AI draft → human refinement → publish with validation.
- Ship a library of realistic demo blueprints (individual, family, business) complete with data, policies, and scripted outcomes ready to clone.
- Populate spaces with simulated identities and personas that drive autonomous runs so we can observe, measure, and optimize live coordination loops.

## Sprint Plan
- **North Star**: ship a blueprint lifecycle that moves from AI-assisted drafting to published runs with telemetry, keep demo spaces “alive,” and expose observability so operators can steer automation.
- **Track A – Blueprint Authoring**: replace the static brief with a conversational “Blueprint Designer,” persist structured notes in real time, render an interactive coordination graph that mirrors the conversation, and lock in compiler guardrails + snapshot-based publishing.
- **Track B – Simulation & Personas**: stand up a persona registry tied to template roles, script success/escalation paths for flagship demos (plumber service + “daily therapy” relationship coach), and emit run metrics (SLA, satisfaction, rework) into dashboards.
- **Track C – Operator Experience**: extend the run console with a state timeline, inline interventions, and blueprint-aware assistant cards; make provider dashboards stream live automation data instead of static snapshots.

## Next Sprint Objectives (2025-09-27)
- **Designer Persistence & Replay**: store designer sessions (transcript, structured notes, graph) per space so authors can resume, branch, or diff drafts; expose a session picker in the template flow.
- **Graph Editing Controls**: enable inline edits on the coordination graph (rename nodes, adjust roles/states, attach artifacts) and sync changes back into the notes/compiler payload.
- **Simulation Kickstart**: wire the seeded demos to lightweight personas so we can auto-run the plumber workflow and the “daily therapy” sibling sessions, logging transitions and feedback for future tuning.

## Foundational Workstreams
- Harden the data model and APIs for blueprints, identities, cloning/versioning, and policy enforcement.
- Enhance the Studio UX (SpaceStudio and related modules) to cover drafting, editing, testing, and publishing blueprints.
- Build a demo factory that seeds spaces, templates, personas, and scheduled runs plus telemetry for “living” examples.
- Expand the persona execution harness so scripted or model-driven agents can act deterministically and surface ledger/audit trails.
- Instrument observability: dashboards for run health, automation efficacy, and feedback loops that feed training and rule suggestions.

## Simulation & Personas
- Curate persona profiles per blueprint role so every run can bind to real or simulated identities.
- Ship scripted scenarios (JSON playbooks) that exercise each blueprint end-to-end for demos and regression.
- Use the coordination engine and action handlers to auto-play simulations, logging state transitions, ledger events, and outcomes.
- Feed simulation metrics (SLA, completion time, UX) back into blueprint tuning and knowledge updates.

## Recent Progress
- Seeded a plumber service coordination demo (template, run, personas) via `pnpm --filter @rouh/api seed:coordination`, giving Studio insight cards real data.
- Space Studio ships a floating Rouh AI chat entry point and smarter insight prompts that reference active templates/runs.
- Provider dashboard now pulls live space metrics from `/spaces/explore` instead of placeholder data.
- Template builder begins with a guided brief (goal, roles, states, data, success) before invoking the AI compiler, giving authors clearer control over draft prompts.
- Blueprint chat now flows through `/spaces/:spaceId/blueprints/chat`, replacing the legacy `/test` endpoint so every surface pulls structured blueprint matches, suggested actions, and run context.
- Web clients (AiChat, Studio live chat, training threads, dashboard tester) are aligned with the new API, letting us observe blueprint fit while we iterate on creation UX.
- AiChat and the dashboard tester now surface blueprint matches, suggested follow-ups, and run context inline so we can validate responses without digging into logs.
- Coordination panel now has a one-click "Generate Blueprint Insight" summary so we can preview template matches before starting a run.
- Template compiler normalizes LLM output (schema, roles, states, slots) so descriptions compile to preview instead of failing JSON validation.

## Operating Principles
- RLS-first isolation: every request sets `x-space-id`, and identities only see data for their space.
- Gradual autonomy: start with suggestions, escalate to execution only with clear policies and audit trails.
- Human-visible state: coordination runs broadcast real-time updates; operators can intervene at any point.
- Continuous learning: ingest conversations, docs, and corrections to tighten knowledge and rule accuracy over time.


## Engineering Guidelines

### Project Structure & Module Organization
- `apps/web` hosts the Next.js 14 UI; chat, outcomes, and operator flows live under `components` and route groups in `app/s/[spaceId]`.
- `apps/api` contains the NestJS + Prisma services; business logic sits in `src/modules` and automation flows reside in `modules/actions`.
- `apps/ai` runs the FastAPI RAG orchestrator in `main.py`, coordinating embeddings, prompts, and ingestion jobs.
- Shared primitives and DTOs live in `packages/ui` and `packages/types`; integration helpers and e2e harness scripts live in `infra/`.

### Build, Test, and Development Commands
- `pnpm i` installs all workspace dependencies; rerun after lockfile updates.
- `pnpm -w dev` launches web, API, and AI services via Turborepo for local development.
- `pnpm -w db:migrate` applies Prisma migrations; follow with `pnpm -w db:setup` to enforce RLS and pgvector extensions.
- `pnpm -w e2e` runs the RLS isolation smoke test; `bash test-api-execution.sh` and `python3 test-rag-fix.py` replay action and RAG flows.

### Coding Style & Naming Conventions
- TypeScript/JavaScript: 2-space indentation, camelCase for variables/functions, PascalCase for components, kebab-case filenames such as `outcome-panel.tsx`.
- Python: 4-space indentation and snake_case modules/functions; prefer Ruff when introduced.
- Run `pnpm -w lint` and `pnpm -w format` before commits to satisfy ESLint and Prettier.

### Testing Guidelines
- Co-locate unit tests with their implementations; keep integration helpers in `infra/` or `test-*.{js,py}` scripts.
- Ensure new changes trigger at least one automated check (e2e harness, API script, or RAG regression) and document any manual validation.

### Commit & Pull Request Guidelines
- Use short, imperative commit messages (e.g., `Add cafe order handler`).
- PRs should summarize scope, list tests executed (`pnpm -w e2e`, replay scripts), and flag schema or environment changes; include screenshots or captures for UX-impacting updates and link backlog items or incidents.

### Security & Configuration Tips
- Respect row-level security by sending `x-space-id` headers and using `PrismaService.withSpaceTx` helpers; coordinate secret or infra updates with the contacts in `agents/team.yaml`.

## Tooling Notes
- Chrome DevTools MCP is vendored at `.mcp/chrome-devtools-mcp.tgz`; launch with `npx --yes ./.mcp/chrome-devtools-mcp.tgz --headless=true --isolated=true` from the repo root once the Codex CLI config is updated.
- Keep the MCP block in `~/.codex/config.toml` up to date so new contributors can attach Chrome DevTools quickly; regenerate the tarball with `npm pack chrome-devtools-mcp@latest --silent` when upgrading.
- Document new MCP or automation helpers here as they land so future sessions can reuse them without re-debugging setup.
