"""
Rouh MCP Server - HTTP Version (without official SDK)

Implements MCP-like interface over HTTP until official Python SDK is available.
Provides same tools and resources as planned MCP server.
"""

import os
import logging
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, text as sql_text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import json
import uuid

# Load environment
load_dotenv()  # Load from current directory or environment

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/rouh")
SYNC_DB_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://")
engine = create_engine(SYNC_DB_URL, echo=False)
SessionLocal = sessionmaker(bind=engine)

# FastAPI app
app = FastAPI(title="Rouh MCP HTTP Server")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Pydantic Models
# ============================================================================

class ToolCallRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]


class ToolCallResponse(BaseModel):
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None


# ============================================================================
# Helper Functions
# ============================================================================

def set_space_context(session, space_id: str):
    """Set RLS context for all queries"""
    session.execute(sql_text("SELECT set_config('app.space_id', :sid, true)").bindparams(sid=space_id))


def generate_uuid() -> str:
    """Generate a UUID for database records"""
    return str(uuid.uuid4())


# ============================================================================
# MCP Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Health check"""
    return {"status": "ok", "service": "Rouh MCP HTTP Server"}


@app.get("/{space_id}/resources")
async def list_resources(space_id: str):
    """List all available resources in this Space"""
    return [
        {
            "uri": f"space://{space_id}/items",
            "name": "Space Items",
            "description": "All items in this Space"
        },
        {
            "uri": f"space://{space_id}/knowledge",
            "name": "Knowledge Base",
            "description": "Curated knowledge entries"
        },
        {
            "uri": f"space://{space_id}/training",
            "name": "Training Examples",
            "description": "Training conversations"
        },
        {
            "uri": f"space://{space_id}/ledger",
            "name": "Event Ledger",
            "description": "Audit trail of activities"
        }
    ]


@app.get("/{space_id}/resources/items")
async def get_items(space_id: str):
    """Get all items in Space"""
    try:
        with SessionLocal() as session:
            set_space_context(session, space_id)

            result = session.execute(
                sql_text('SELECT id, type, "canonicalJson" FROM "Item" WHERE "spaceId" = :space_id LIMIT 100')
                .bindparams(space_id=space_id)
            ).fetchall()

            items = [
                {
                    "id": row[0],
                    "type": row[1],
                    "data": row[2]
                }
                for row in result
            ]
            return {"items": items}
    except Exception as e:
        logger.error(f"Error getting items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/{space_id}/resources/knowledge")
async def get_knowledge(space_id: str):
    """Get knowledge base"""
    try:
        with SessionLocal() as session:
            set_space_context(session, space_id)

            result = session.execute(
                sql_text('SELECT id, type, title, "canonicalText", tags FROM "SpaceKnowledge" WHERE "spaceId" = :space_id')
                .bindparams(space_id=space_id)
            ).fetchall()

            knowledge = [
                {
                    "id": row[0],
                    "type": row[1],
                    "title": row[2],
                    "text": row[3],
                    "tags": row[4]
                }
                for row in result
            ]
            return {"knowledge": knowledge}
    except Exception as e:
        logger.error(f"Error getting knowledge: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/{space_id}/tools")
async def list_tools(space_id: str):
    """List all available tools"""
    return [
        {
            "name": "rag_query",
            "description": "Query knowledge base using RAG",
            "parameters": {
                "query": "string (required)",
                "k": "integer (default: 3)"
            }
        },
        {
            "name": "execute_action",
            "description": "Execute an action in the Space",
            "parameters": {
                "action_type": "string (required)",
                "item_id": "string (optional)",
                "parameters": "object (optional)"
            }
        },
        {
            "name": "store_knowledge",
            "description": "Store knowledge entry",
            "parameters": {
                "type": "string (required: fact/behavior/workflow)",
                "title": "string (required)",
                "text": "string (required)",
                "tags": "array (optional)"
            }
        },
        {
            "name": "send_notification",
            "description": "Send notification to user",
            "parameters": {
                "user_id": "string (required)",
                "message": "string (required)",
                "options": "array (optional)",
                "slot_name": "string (optional)"
            }
        }
    ]


@app.post("/{space_id}/tools/call")
async def call_tool(space_id: str, request: ToolCallRequest):
    """Execute a tool"""
    try:
        logger.info(f"Calling tool {request.tool_name} for space {space_id}")

        if request.tool_name == "rag_query":
            # Proxy to AI service
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://localhost:8000/rag/query",
                    json={
                        "space_id": space_id,
                        "query": request.arguments["query"],
                        "k": request.arguments.get("k", 3)
                    },
                    timeout=30.0
                )
                result = response.json()
                return ToolCallResponse(success=True, result=result)

        elif request.tool_name == "execute_action":
            # Create action in database
            with SessionLocal() as session:
                set_space_context(session, space_id)

                action_id = generate_uuid()
                session.execute(
                    sql_text('''
                        INSERT INTO "Action" (id, "spaceId", "itemId", type, status, parameters, "createdAt", "updatedAt")
                        VALUES (:id, :space_id, :item_id, :type, 'pending', :params, NOW(), NOW())
                    ''').bindparams(
                        id=action_id,
                        space_id=space_id,
                        item_id=request.arguments.get("item_id"),
                        type=request.arguments["action_type"],
                        params=json.dumps(request.arguments.get("parameters", {}))
                    )
                )
                session.commit()

                return ToolCallResponse(success=True, result={"action_id": action_id})

        elif request.tool_name == "store_knowledge":
            # Store knowledge entry
            with SessionLocal() as session:
                set_space_context(session, space_id)

                knowledge_id = generate_uuid()
                session.execute(
                    sql_text('''
                        INSERT INTO "SpaceKnowledge" (id, "spaceId", type, title, "canonicalText", tags, "createdAt", "updatedAt")
                        VALUES (:id, :space_id, :type, :title, :text, :tags, NOW(), NOW())
                    ''').bindparams(
                        id=knowledge_id,
                        space_id=space_id,
                        type=request.arguments["type"],
                        title=request.arguments["title"],
                        text=request.arguments["text"],
                        tags=request.arguments.get("tags", [])
                    )
                )
                session.commit()

                return ToolCallResponse(success=True, result={"knowledge_id": knowledge_id})

        elif request.tool_name == "send_notification":
            # Log notification (in production would integrate with real system)
            logger.info(f"Notification to {request.arguments['user_id']}: {request.arguments['message']}")
            return ToolCallResponse(success=True, result={"status": "queued"})

        else:
            return ToolCallResponse(success=False, error=f"Unknown tool: {request.tool_name}")

    except Exception as e:
        logger.error(f"Tool execution error: {e}")
        return ToolCallResponse(success=False, error=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("MCP_PORT", "5000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
