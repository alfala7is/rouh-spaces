"""
Rouh A2A Server - Agent2Agent Protocol Server

This server enables agent-to-agent communication following Google's A2A protocol.
Agents can discover each other, create tasks, and coordinate workflows.

Architecture:
- Exposes A2A endpoints (/a2a/agents, /a2a/tasks)
- Manages agent cards and discovery
- Coordinates multi-agent workflows (coordination runs)
- Integrates with MCP servers for tool access
"""

import os
import logging
import json
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text as sql_text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import httpx

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
app = FastAPI(title="Rouh A2A Server")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Pydantic Models (A2A Protocol)
# ============================================================================

class AgentCard(BaseModel):
    """
    Agent Card following A2A specification.
    Describes an agent's capabilities and how to interact with it.
    """
    name: str
    description: str
    version: str = "1.0"
    service_endpoint: str
    capabilities: List[str] = Field(default_factory=list)
    supported_modalities: List[str] = Field(default_factory=lambda: ["text"])
    auth_requirements: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class A2ATask(BaseModel):
    """
    Task following A2A protocol.
    Represents a unit of work to be performed by an agent.
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    type: str  # e.g., "collect_mood_data", "facilitate_deep_share"
    assigned_to: List[str]  # Agent IDs
    required_outputs: List[str] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)
    status: str = "pending"  # pending, in_progress, completed, failed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    outputs: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None


class A2ATaskRequest(BaseModel):
    """Request to create a new task"""
    type: str
    assigned_to: List[str]
    required_outputs: List[str] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)


class A2ATaskUpdate(BaseModel):
    """Update to an existing task"""
    status: Optional[str] = None
    outputs: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


# ============================================================================
# A2A Server Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Health check"""
    return {"status": "ok", "service": "Rouh A2A Server"}


@app.get("/a2a/agents")
async def list_agents(space_id: Optional[str] = Header(None, alias="x-space-id")):
    """
    List all agents available in a Space.
    Returns agent cards for discovery.
    """
    if not space_id:
        raise HTTPException(status_code=400, detail="x-space-id header required")

    try:
        with SessionLocal() as session:
            session.execute(sql_text("SELECT set_config('app.space_id', :sid, true)").bindparams(sid=space_id))

            # Get personas (which become agents)
            # Note: This is simplified - in reality, we'd have a Persona table
            # For now, we'll return a facilitator agent as an example

            agents = [
                AgentCard(
                    name=f"space-{space_id}-facilitator",
                    description="AI facilitator for coordination sessions",
                    version="1.0",
                    service_endpoint=f"/a2a/agents/facilitator-{space_id}",
                    capabilities=[
                        "guide_conversation",
                        "collect_data",
                        "analyze_sentiment",
                        "transition_states",
                        "generate_prompts"
                    ],
                    supported_modalities=["text"],
                    auth_requirements={"space_id": space_id},
                    metadata={"type": "facilitator", "space_id": space_id}
                )
            ]

            return [agent.model_dump() for agent in agents]

    except Exception as e:
        logger.error(f"Error listing agents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/a2a/agents/{agent_id}")
async def get_agent_card(agent_id: str):
    """
    Get a specific agent's card.
    """
    # Placeholder - would retrieve from database
    return AgentCard(
        name=agent_id,
        description=f"Agent: {agent_id}",
        version="1.0",
        service_endpoint=f"/a2a/agents/{agent_id}",
        capabilities=["general"],
        supported_modalities=["text"]
    ).model_dump()


@app.post("/a2a/tasks")
async def create_task(
    task_request: A2ATaskRequest,
    space_id: Optional[str] = Header(None, alias="x-space-id")
):
    """
    Create a new A2A task.
    This is how agents request work from other agents.
    """
    if not space_id:
        raise HTTPException(status_code=400, detail="x-space-id header required")

    try:
        task = A2ATask(
            type=task_request.type,
            assigned_to=task_request.assigned_to,
            required_outputs=task_request.required_outputs,
            context=task_request.context,
            status="pending"
        )

        # Store task in database (simplified - would use proper storage)
        logger.info(f"Created task {task.id} of type {task.type} for agents {task.assigned_to}")

        # Trigger task execution (asynchronously in production)
        # For now, we'll just return the task
        return task.model_dump()

    except Exception as e:
        logger.error(f"Error creating task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/a2a/tasks/{task_id}")
async def get_task(task_id: str):
    """Get task status and outputs"""
    # Placeholder - would retrieve from database
    return {
        "id": task_id,
        "status": "completed",
        "outputs": {}
    }


@app.patch("/a2a/tasks/{task_id}")
async def update_task(task_id: str, update: A2ATaskUpdate):
    """
    Update task status and outputs.
    Agents call this to report progress.
    """
    logger.info(f"Updating task {task_id}: {update}")
    # Would update in database
    return {"success": True, "task_id": task_id}


# ============================================================================
# Agent Execution (handles tasks)
# ============================================================================

class BaseAgent:
    """
    Base class for A2A agents.
    Subclasses implement specific agent behaviors.
    """

    def __init__(self, agent_id: str, space_id: str, mcp_endpoint: Optional[str] = None):
        self.agent_id = agent_id
        self.space_id = space_id
        self.mcp_endpoint = mcp_endpoint or f"http://localhost:5000/mcp/{space_id}"

    async def get_mcp_client(self):
        """Get MCP client for this agent's Space"""
        # Would create actual MCP client
        return MCPClient(self.space_id)

    async def handle_task(self, task: A2ATask) -> Dict[str, Any]:
        """
        Handle an A2A task.
        Subclasses override this to implement specific behaviors.
        """
        raise NotImplementedError("Subclasses must implement handle_task")


class FacilitatorAgent(BaseAgent):
    """
    Facilitator agent for therapy sessions.
    Guides participants through coordination states.
    """

    async def handle_task(self, task: A2ATask) -> Dict[str, Any]:
        """Execute facilitator tasks"""
        logger.info(f"FacilitatorAgent handling task: {task.type}")

        if task.type == "collect_mood_data":
            return await self._collect_mood_data(task)
        elif task.type == "facilitate_deep_share":
            return await self._facilitate_deep_share(task)
        elif task.type == "facilitate_commitment":
            return await self._facilitate_commitment(task)
        else:
            return {"error": f"Unknown task type: {task.type}"}

    async def _collect_mood_data(self, task: A2ATask) -> Dict[str, Any]:
        """Collect mood data from participants"""
        # Get MCP client to send notifications
        mcp = await self.get_mcp_client()

        # Send mood prompts to participants
        participants = task.context.get("participants", [])

        for participant in participants:
            await mcp.call_tool("send_notification", {
                "user_id": participant["id"],
                "message": f"Hi {participant['name']}! How are you feeling tonight?",
                "options": ["joyful", "content", "neutral", "stressed", "sad", "anxious", "angry"],
                "slot_name": f"mood_{participant['role']}"
            })

        return {
            "status": "notifications_sent",
            "waiting_for": [p["id"] for p in participants]
        }

    async def _facilitate_deep_share(self, task: A2ATask) -> Dict[str, Any]:
        """Facilitate deep sharing between participants"""
        mcp = await self.get_mcp_client()

        # Get context from previous state
        mood_data = task.context.get("mood_data", {})

        # Generate contextual prompt based on moods
        prompt = self._generate_deep_share_prompt(mood_data)

        # Send to participant A
        await mcp.call_tool("send_notification", {
            "user_id": task.context["participant_a_id"],
            "message": prompt,
            "slot_name": "share_topic"
        })

        return {
            "status": "prompt_sent",
            "waiting_for": task.context["participant_a_id"]
        }

    async def _facilitate_commitment(self, task: A2ATask) -> Dict[str, Any]:
        """Facilitate action commitments"""
        # Similar pattern - generate prompts, collect data
        return {"status": "commitment_phase_started"}

    def _generate_deep_share_prompt(self, mood_data: Dict[str, Any]) -> str:
        """Generate contextual prompt based on participant moods"""
        # Simplified - would use LLM
        return "What's been on your mind today? Take your time to share."


class MCPClient:
    """
    Simple MCP client for agents to call MCP tools.
    In production, would use official MCP SDK.
    """

    def __init__(self, space_id: str):
        self.space_id = space_id
        self.endpoint = f"http://localhost:5000/mcp/{space_id}"

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call an MCP tool"""
        logger.info(f"MCP call: {tool_name} with {arguments}")
        # Would make actual HTTP request to MCP server
        # For now, just log it
        return {"success": True}

    async def get_resource(self, uri: str) -> Dict[str, Any]:
        """Get an MCP resource"""
        logger.info(f"MCP get resource: {uri}")
        # Would make actual HTTP request
        return {}


# ============================================================================
# Coordination Orchestrator
# ============================================================================

class CoordinationOrchestrator:
    """
    Orchestrates coordination runs using A2A tasks.
    Manages state transitions and agent coordination.
    """

    def __init__(self, space_id: str):
        self.space_id = space_id

    async def start_run(self, run_id: str, template_id: str):
        """Start a coordination run"""
        logger.info(f"Starting coordination run {run_id} from template {template_id}")

        # Get template states from database
        with SessionLocal() as session:
            session.execute(sql_text("SELECT set_config('app.space_id', :sid, true)").bindparams(sid=self.space_id))

            # Get first state
            result = session.execute(
                sql_text('''
                    SELECT id, name, type
                    FROM "TemplateState"
                    WHERE "templateId" = :template_id
                    ORDER BY sequence
                    LIMIT 1
                ''').bindparams(template_id=template_id)
            ).fetchone()

            if not result:
                logger.error(f"No states found for template {template_id}")
                return

            first_state_id, state_name, state_type = result

            # Create A2A task for first state
            task = A2ATask(
                type=f"execute_state_{state_name}",
                assigned_to=["facilitator"],
                context={
                    "run_id": run_id,
                    "state_id": first_state_id,
                    "state_name": state_name
                }
            )

            # Execute task (would be async in production)
            await self.execute_task(task)

    async def execute_task(self, task: A2ATask):
        """Execute an A2A task by routing to appropriate agent"""
        logger.info(f"Executing task {task.id}: {task.type}")

        # Get facilitator agent
        facilitator = FacilitatorAgent(
            agent_id="facilitator",
            space_id=self.space_id
        )

        # Execute task
        result = await facilitator.handle_task(task)
        logger.info(f"Task {task.id} result: {result}")

        return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9000)
