# MCP + A2A Setup Guide

This guide walks you through setting up and testing the Model Context Protocol (MCP) and Agent2Agent (A2A) infrastructure for Rouh Spaces.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  NestJS API (Port 3001)             │
│  ┌──────────────┐              ┌──────────────┐    │
│  │ MCP Adapter  │              │ A2A Adapter  │    │
│  │   Module     │              │   Module     │    │
│  └──────┬───────┘              └──────┬───────┘    │
└─────────┼──────────────────────────────┼───────────┘
          │                              │
          ↓                              ↓
┌─────────────────┐           ┌──────────────────┐
│  MCP Server     │           │  A2A Server      │
│  (Python)       │←─────────→│  (Python)        │
│  Port: 5000+    │           │  Port: 9000      │
│  One per Space  │           │  Global          │
└─────────────────┘           └──────────────────┘
```

## Installation Steps

### 1. Install Python Dependencies

```bash
# MCP server
cd apps/mcp
python3 -m pip install -r requirements.txt

# A2A server
cd ../a2a
python3 -m pip install -r requirements.txt
```

### 2. Install NestJS Dependencies

```bash
cd apps/api
pnpm install
# or npm install if not using pnpm
```

### 3. Environment Setup

Ensure your `.env` file has:

```bash
# Database (note: port 5433, not 5432)
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/rouh

# A2A Server
A2A_SERVER_URL=http://localhost:9000

# AI Service (existing)
AI_SERVICE_URL=http://localhost:8000
OPENAI_API_KEY=your_key_here
```

## Running the Services

### Option 1: Individual Services (for development)

**Terminal 1 - Infrastructure:**
```bash
# Start Postgres, Redis, MinIO
docker compose -f infra/docker-compose.yml up -d
```

**Terminal 2 - A2A Server:**
```bash
cd apps/a2a
python3 -m uvicorn a2a_server:app --reload --port 9000
```

**Terminal 3 - AI Service (existing):**
```bash
cd apps/ai
python3 -m uvicorn main:app --reload --port 8000
```

**Terminal 4 - NestJS API:**
```bash
cd apps/api
pnpm run dev
# MCP servers will auto-start when needed
```

**Terminal 5 - Web App:**
```bash
cd apps/web
pnpm run dev
```

### Option 2: All at Once (when ready)

```bash
# From root directory
pnpm -w dev
# This will start all services via Turborepo
```

## Testing the Setup

### Test 1: Verify A2A Server

```bash
curl http://localhost:9000/
# Should return: {"status":"ok","service":"Rouh A2A Server"}
```

### Test 2: List Agents for a Space

```bash
# Replace SPACE_ID with actual space ID from your database
curl http://localhost:3001/a2a/agents \
  -H "x-space-id: YOUR_SPACE_ID"
```

### Test 3: Create an A2A Task

```bash
curl -X POST http://localhost:3001/a2a/tasks \
  -H "x-space-id: YOUR_SPACE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "collect_mood_data",
    "assigned_to": ["facilitator"],
    "context": {
      "participants": [
        {"id": "user1", "name": "Emma", "role": "participant_a"},
        {"id": "user2", "name": "Jake", "role": "participant_b"}
      ]
    }
  }'
```

### Test 4: MCP Resource Access

```bash
# Get Space items via MCP
curl http://localhost:3001/mcp/YOUR_SPACE_ID/resources/items \
  -H "x-space-id: YOUR_SPACE_ID"
```

### Test 5: MCP Tool Call

```bash
# Call RAG query tool
curl -X POST http://localhost:3001/mcp/YOUR_SPACE_ID/tools/rag_query \
  -H "x-space-id: YOUR_SPACE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What items are available?",
    "k": 3
  }'
```

## Integration with Existing System

### How It Works

1. **MCP Servers** (one per Space):
   - Expose Space data as MCP resources (items, knowledge, ledger)
   - Expose actions as MCP tools (RAG query, execute action, etc.)
   - Auto-started by NestJS when first accessed
   - RLS-protected (all queries scoped to Space)

2. **A2A Server** (single global instance):
   - Manages agent cards and discovery
   - Creates and routes tasks to agents
   - Coordinates multi-agent workflows
   - Integrates with MCP for tool access

3. **NestJS Integration**:
   - `MCPAdapterModule`: Manages MCP server processes
   - `A2AAdapterModule`: Proxies to A2A Python server
   - Controllers expose HTTP endpoints for testing
   - Services can call MCP tools and A2A tasks programmatically

## Next Steps

### Week 1 POC Goals:

- [x] Install MCP and A2A SDKs
- [x] Create base MCP server
- [x] Create base A2A server
- [x] Create NestJS integration modules
- [ ] Create end-to-end POC: RAG query via MCP+A2A
- [ ] Test with real Space data

### Week 2: Facilitator Agent

- [ ] Build FacilitatorAgent with full capabilities
- [ ] Implement therapy session states
- [ ] Add prompt customization system
- [ ] Test with Emma+Jake scenario

### Week 3: Full Workflow

- [ ] Implement all 6 therapy session states
- [ ] Add in-session correction flow
- [ ] Build training loop integration
- [ ] Create Blueprint Studio UI for customization

### Week 4: Decision Gate

- [ ] Deploy to staging
- [ ] Run full therapy session simulation
- [ ] Measure performance and user experience
- [ ] **DECISION**: Does this architecture feel right? Continue or pivot?

## Troubleshooting

### MCP Server Won't Start

Check Python path:
```bash
which python3
# Update MCP_SERVER_PATH in mcp-server-manager.service.ts if needed
```

### A2A Server Connection Refused

Verify server is running:
```bash
lsof -i :9000
# Should show Python process
```

### RLS Errors

Ensure RLS policies are applied:
```bash
cd apps/api
pnpm run db:setup
```

### Port Conflicts

Check what's using ports:
```bash
lsof -i :3000  # Web
lsof -i :3001  # API
lsof -i :8000  # AI
lsof -i :9000  # A2A
lsof -i :5000  # MCP (first Space)
```

## Architecture Decisions Made

1. **One MCP server per Space** (not global):
   - Pros: Perfect RLS isolation, scales horizontally
   - Cons: More processes, more complex orchestration
   - Decision: Start here, optimize later if needed

2. **One global A2A server** (not per Space):
   - Pros: Simpler, cross-Space coordination possible
   - Cons: Needs good Space isolation in code
   - Decision: Global for now, can split later

3. **Python for MCP+A2A, TypeScript for API**:
   - Pros: Use best SDKs (MCP/A2A Python more mature)
   - Cons: Polyglot complexity
   - Decision: Accept complexity for better ecosystem fit

4. **Lazy-load MCP servers** (not pre-start all):
   - Pros: Lower resource usage, faster startup
   - Cons: First request slower
   - Decision: Lazy-load, profile and optimize later

## Questions & Answers

**Q: Why not run MCP servers as HTTP endpoints?**
A: MCP specification requires stdio transport. We could add HTTP wrapper later, but starting with spec compliance.

**Q: Can external agents join?**
A: Yes! They can call `/a2a/tasks` with proper auth. Coming in Phase 5 (Weeks 25-36).

**Q: How does RLS work with MCP?**
A: Each MCP server sets `app.space_id` in Postgres session context. All queries auto-filtered.

**Q: What about scaling?**
A: MCP servers are stateless, can run on different machines. A2A server can be replicated behind load balancer.

---

**Ready to proceed?** Run the tests above, then we'll build the POC end-to-end flow.
