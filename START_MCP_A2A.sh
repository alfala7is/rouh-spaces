#!/bin/bash

# Start MCP and A2A Servers
# Run from project root: bash START_MCP_A2A.sh

echo "🚀 Starting Rouh MCP + A2A Infrastructure"
echo ""

# Set environment
export DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:postgres@localhost:5432/rouh"}

# Check if Docker containers are running
echo "Checking Docker infrastructure..."
if ! docker ps | grep -q rouh-postgres; then
    echo "⚠️  Postgres not running. Starting with:"
    echo "   docker compose -f infra/docker-compose.yml up -d"
    docker compose -f infra/docker-compose.yml up -d
    sleep 5
fi

echo "✓ Docker infrastructure ready"
echo ""

# Start MCP HTTP Server
echo "Starting MCP HTTP Server (port 5000)..."
cd apps/mcp
DATABASE_URL=$DATABASE_URL python3 -m uvicorn mcp_http_server:app --port 5000 > /tmp/mcp.log 2>&1 &
MCP_PID=$!
echo "✓ MCP Server started (PID: $MCP_PID)"
cd ../..

# Start A2A Server
echo "Starting A2A Server (port 9000)..."
cd apps/a2a
DATABASE_URL=$DATABASE_URL python3 -m uvicorn a2a_server:app --port 9000 > /tmp/a2a.log 2>&1 &
A2A_PID=$!
echo "✓ A2A Server started (PID: $A2A_PID)"
cd ../..

# Wait for servers to start
sleep 3

# Health check
echo ""
echo "Health check..."
if curl -s http://127.0.0.1:5000/ | grep -q "MCP"; then
    echo "✓ MCP Server responding"
else
    echo "❌ MCP Server not responding (check /tmp/mcp.log)"
fi

if curl -s http://localhost:9000/ | grep -q "A2A"; then
    echo "✓ A2A Server responding"
else
    echo "❌ A2A Server not responding (check /tmp/a2a.log)"
fi

echo ""
echo "Servers running:"
echo "  MCP HTTP: http://127.0.0.1:5000"
echo "  A2A:      http://localhost:9000"
echo ""
echo "Logs:"
echo "  MCP: tail -f /tmp/mcp.log"
echo "  A2A: tail -f /tmp/a2a.log"
echo ""
echo "To stop: ps aux | grep uvicorn | grep -v grep | awk '{print \$2}' | xargs kill"
