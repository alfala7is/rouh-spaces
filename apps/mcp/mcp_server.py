"""
Rouh MCP Server - Model Context Protocol Server for Spaces

This server exposes Space data and tools via the Model Context Protocol,
enabling AI agents to interact with Space resources in a standardized way.

Architecture:
- One MCP server instance per active Space (lazy-loaded)
- Scoped to Space via RLS (app.space_id context)
- Tools: RAG query, action execution, knowledge retrieval
- Resources: Items, knowledge base, training data, ledger
"""

import os
import logging
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, Resource, TextContent, ImageContent, EmbeddedResource
from sqlalchemy import create_engine, text as sql_text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import json

# Load environment
load_dotenv(dotenv_path="../../../.env")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/rouh")
SYNC_DB_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://")
engine = create_engine(SYNC_DB_URL, echo=False)
SessionLocal = sessionmaker(bind=engine)


class SpaceMCPServer:
    """
    MCP Server for a specific Space.

    Exposes Space-scoped resources and tools following the MCP specification.
    All database queries are RLS-protected via app.space_id setting.
    """

    def __init__(self, space_id: str):
        self.space_id = space_id
        self.server = Server(f"rouh-space-{space_id}")
        self._setup_resources()
        self._setup_tools()

        logger.info(f"MCP Server initialized for Space: {space_id}")

    def _set_space_context(self, session):
        """Set RLS context for all queries"""
        session.execute(sql_text("SELECT set_config('app.space_id', :sid, true)").bindparams(sid=self.space_id))

    def _setup_resources(self):
        """Register MCP resources (read-only data)"""

        @self.server.list_resources()
        async def list_resources() -> List[Resource]:
            """List all available resources in this Space"""
            return [
                Resource(
                    uri=f"space://{self.space_id}/items",
                    name="Space Items",
                    mimeType="application/json",
                    description="All items in this Space (listings, services, etc.)"
                ),
                Resource(
                    uri=f"space://{self.space_id}/knowledge",
                    name="Knowledge Base",
                    mimeType="application/json",
                    description="Curated knowledge entries (facts, behaviors, workflows)"
                ),
                Resource(
                    uri=f"space://{self.space_id}/training",
                    name="Training Examples",
                    mimeType="application/json",
                    description="Training conversations for AI behavior tuning"
                ),
                Resource(
                    uri=f"space://{self.space_id}/ledger",
                    name="Event Ledger",
                    mimeType="application/json",
                    description="Complete audit trail of all Space activities"
                ),
                Resource(
                    uri=f"space://{self.space_id}/embeddings",
                    name="Document Embeddings",
                    mimeType="application/json",
                    description="Embedded documents for RAG queries"
                )
            ]

        @self.server.read_resource()
        async def read_resource(uri: str) -> str:
            """Read a specific resource by URI"""
            logger.info(f"Reading resource: {uri}")

            with SessionLocal() as session:
                self._set_space_context(session)

                if uri.endswith("/items"):
                    # Get all items
                    result = session.execute(
                        sql_text('SELECT id, type, "canonicalJson" FROM "Item" WHERE "spaceId" = :space_id LIMIT 100')
                        .bindparams(space_id=self.space_id)
                    ).fetchall()

                    items = [
                        {
                            "id": row[0],
                            "type": row[1],
                            "data": row[2]
                        }
                        for row in result
                    ]
                    return json.dumps(items, indent=2)

                elif uri.endswith("/knowledge"):
                    # Get knowledge entries
                    result = session.execute(
                        sql_text('SELECT id, type, title, "canonicalText", tags FROM "SpaceKnowledge" WHERE "spaceId" = :space_id')
                        .bindparams(space_id=self.space_id)
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
                    return json.dumps(knowledge, indent=2)

                elif uri.endswith("/training"):
                    # Get training conversations
                    result = session.execute(
                        sql_text('SELECT id, role, content, metadata, "sessionId" FROM "SpaceTrainingConversation" WHERE "spaceId" = :space_id AND "isActive" = true ORDER BY sequence')
                        .bindparams(space_id=self.space_id)
                    ).fetchall()

                    training = [
                        {
                            "id": row[0],
                            "role": row[1],
                            "content": row[2],
                            "metadata": row[3],
                            "sessionId": row[4]
                        }
                        for row in result
                    ]
                    return json.dumps(training, indent=2)

                elif uri.endswith("/ledger"):
                    # Get recent ledger events
                    result = session.execute(
                        sql_text('SELECT id, ts, "actorId", entity, "eventType", "payloadJson" FROM "LedgerEvent" WHERE "spaceId" = :space_id ORDER BY ts DESC LIMIT 100')
                        .bindparams(space_id=self.space_id)
                    ).fetchall()

                    events = [
                        {
                            "id": row[0],
                            "timestamp": row[1].isoformat(),
                            "actorId": row[2],
                            "entity": row[3],
                            "eventType": row[4],
                            "payload": row[5]
                        }
                        for row in result
                    ]
                    return json.dumps(events, indent=2)

                elif uri.endswith("/embeddings"):
                    # Get document embeddings (metadata only, not vectors)
                    result = session.execute(
                        sql_text('SELECT id, "itemId", text, "createdAt" FROM "AiEmbedding" WHERE "spaceId" = :space_id LIMIT 50')
                        .bindparams(space_id=self.space_id)
                    ).fetchall()

                    embeddings = [
                        {
                            "id": row[0],
                            "itemId": row[1],
                            "text": row[2][:200] + "..." if len(row[2]) > 200 else row[2],
                            "createdAt": row[3].isoformat()
                        }
                        for row in result
                    ]
                    return json.dumps(embeddings, indent=2)

                else:
                    return json.dumps({"error": "Unknown resource URI"})

    def _setup_tools(self):
        """Register MCP tools (executable actions)"""

        @self.server.list_tools()
        async def list_tools() -> List[Tool]:
            """List all available tools in this Space"""
            return [
                Tool(
                    name="rag_query",
                    description="Query the Space's knowledge base using RAG (Retrieval-Augmented Generation)",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "The question or search query"
                            },
                            "k": {
                                "type": "integer",
                                "description": "Number of results to retrieve",
                                "default": 3
                            }
                        },
                        "required": ["query"]
                    }
                ),
                Tool(
                    name="execute_action",
                    description="Execute an action in the Space (contact, inquiry, order, etc.)",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "action_type": {
                                "type": "string",
                                "enum": ["contact", "inquiry", "hold", "book", "order", "schedule", "submit"],
                                "description": "Type of action to execute"
                            },
                            "item_id": {
                                "type": "string",
                                "description": "Optional: ID of item related to this action"
                            },
                            "parameters": {
                                "type": "object",
                                "description": "Action-specific parameters"
                            }
                        },
                        "required": ["action_type"]
                    }
                ),
                Tool(
                    name="store_knowledge",
                    description="Store a new knowledge entry (fact, behavior, or workflow)",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": ["fact", "behavior", "workflow"],
                                "description": "Type of knowledge entry"
                            },
                            "title": {
                                "type": "string",
                                "description": "Short title for the knowledge entry"
                            },
                            "text": {
                                "type": "string",
                                "description": "Detailed knowledge content"
                            },
                            "tags": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Tags for categorization"
                            }
                        },
                        "required": ["type", "title", "text"]
                    }
                ),
                Tool(
                    name="send_notification",
                    description="Send a notification to a user in the Space",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "user_id": {
                                "type": "string",
                                "description": "ID of the user to notify"
                            },
                            "message": {
                                "type": "string",
                                "description": "Notification message"
                            },
                            "options": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Optional: Response options for the user"
                            },
                            "slot_name": {
                                "type": "string",
                                "description": "Optional: Slot name if collecting data for a coordination run"
                            }
                        },
                        "required": ["user_id", "message"]
                    }
                )
            ]

        @self.server.call_tool()
        async def call_tool(name: str, arguments: Dict[str, Any]) -> List[TextContent]:
            """Execute a tool and return results"""
            logger.info(f"Calling tool: {name} with args: {arguments}")

            try:
                if name == "rag_query":
                    # Proxy to existing AI service RAG endpoint
                    import httpx
                    async with httpx.AsyncClient() as client:
                        response = await client.post(
                            "http://localhost:8000/rag/query",
                            json={
                                "space_id": self.space_id,
                                "query": arguments["query"],
                                "k": arguments.get("k", 3)
                            },
                            timeout=30.0
                        )
                        result = response.json()
                        return [TextContent(
                            type="text",
                            text=json.dumps(result, indent=2)
                        )]

                elif name == "execute_action":
                    # Create action in database
                    with SessionLocal() as session:
                        self._set_space_context(session)

                        action_id = self._generate_uuid()
                        session.execute(
                            sql_text('''
                                INSERT INTO "Action" (id, "spaceId", "itemId", type, status, parameters, "createdAt", "updatedAt")
                                VALUES (:id, :space_id, :item_id, :type, 'pending', :params, NOW(), NOW())
                            ''').bindparams(
                                id=action_id,
                                space_id=self.space_id,
                                item_id=arguments.get("item_id"),
                                type=arguments["action_type"],
                                params=json.dumps(arguments.get("parameters", {}))
                            )
                        )
                        session.commit()

                        return [TextContent(
                            type="text",
                            text=json.dumps({"success": True, "action_id": action_id})
                        )]

                elif name == "store_knowledge":
                    # Store knowledge entry
                    with SessionLocal() as session:
                        self._set_space_context(session)

                        knowledge_id = self._generate_uuid()
                        session.execute(
                            sql_text('''
                                INSERT INTO "SpaceKnowledge" (id, "spaceId", type, title, "canonicalText", tags, "createdAt", "updatedAt")
                                VALUES (:id, :space_id, :type, :title, :text, :tags, NOW(), NOW())
                            ''').bindparams(
                                id=knowledge_id,
                                space_id=self.space_id,
                                type=arguments["type"],
                                title=arguments["title"],
                                text=arguments["text"],
                                tags=arguments.get("tags", [])
                            )
                        )
                        session.commit()

                        return [TextContent(
                            type="text",
                            text=json.dumps({"success": True, "knowledge_id": knowledge_id})
                        )]

                elif name == "send_notification":
                    # Send notification (placeholder - would integrate with real notification system)
                    logger.info(f"Sending notification to {arguments['user_id']}: {arguments['message']}")
                    return [TextContent(
                        type="text",
                        text=json.dumps({
                            "success": True,
                            "message": "Notification queued",
                            "user_id": arguments["user_id"]
                        })
                    )]

                else:
                    return [TextContent(
                        type="text",
                        text=json.dumps({"error": f"Unknown tool: {name}"})
                    )]

            except Exception as e:
                logger.error(f"Tool execution error: {e}")
                return [TextContent(
                    type="text",
                    text=json.dumps({"error": str(e)})
                )]

    def _generate_uuid(self) -> str:
        """Generate a UUID for database records"""
        import uuid
        return str(uuid.uuid4())

    async def run(self):
        """Start the MCP server using stdio transport"""
        async with stdio_server() as (read_stream, write_stream):
            await self.server.run(
                read_stream,
                write_stream,
                self.server.create_initialization_options()
            )


async def main():
    """Main entry point - starts MCP server for a specific Space"""
    import sys

    if len(sys.argv) < 2:
        print("Usage: python mcp_server.py <space_id>")
        sys.exit(1)

    space_id = sys.argv[1]
    server = SpaceMCPServer(space_id)
    await server.run()


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
