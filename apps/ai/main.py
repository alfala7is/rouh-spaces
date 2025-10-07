import os
import logging
import hashlib
import time
from collections import defaultdict
from typing import Optional, List, Dict, Any, Tuple, Literal
from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from sqlalchemy import text as sql_text, create_engine
from openai import OpenAI
import io
import base64
import json
import math
import re
from datetime import datetime, timedelta
try:
    import PyPDF2
except ImportError:
    PyPDF2 = None
    print("Warning: PyPDF2 not installed. PDF processing will be limited.")
try:
    import guardrails as gd
    GUARDRAILS_AVAILABLE = True
except ImportError:
    gd = None
    GUARDRAILS_AVAILABLE = False
    print("Warning: Guardrails not installed. Template compilation will be limited.")

from template_models import CoordinationTemplateModel


def slugify_lower(identifier: str, fallback: str = "item") -> str:
    cleaned = re.sub(r'[^a-z0-9]+', '_', identifier.lower()).strip('_')
    return cleaned or fallback


def normalize_compiled_template(template_json: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce loose LLM output into the expected template structure."""
    data = template_json.copy()

    if 'schemaJson' not in data and 'coordinationPattern' in data:
        data['schemaJson'] = data.pop('coordinationPattern')

    phases = ['express', 'explore', 'commit', 'evidence', 'confirm']
    normalized_schema = {}
    schema_source = data.get('schemaJson') or {}
    for phase in phases:
        phase_source = schema_source.get(phase, {}) if isinstance(schema_source, dict) else {}
        base = {
            'enabled': phase_source.get('enabled', True),
            'description': phase_source.get('description'),
            'timeout': phase_source.get('timeout'),
        }
        if phase == 'commit':
            base['requireDeposit'] = phase_source.get('requireDeposit', False)
        if phase == 'evidence':
            base['requireProof'] = phase_source.get('requireProof', True)
        if phase == 'confirm':
            base['autoComplete'] = phase_source.get('autoComplete', False)
        normalized_schema[phase] = base
    data['schemaJson'] = normalized_schema

    roles = data.get('roles', [])
    role_lookup: Dict[str, str] = {}
    normalized_roles = []
    if isinstance(roles, dict):
        roles_iterable = roles.items()
    elif isinstance(roles, list):
        roles_iterable = enumerate(roles)
    else:
        roles_iterable = []

    for key, value in roles_iterable:
        role_payload = value if isinstance(value, dict) else {'description': str(value)}
        display_name = role_payload.get('name') or (key if isinstance(key, str) else f'role_{key}')
        slug = slugify_lower(display_name, 'role')
        role_lookup[display_name] = slug
        if isinstance(key, str):
            role_lookup[key] = slug
        role_payload = role_payload.copy()
        role_payload['name'] = slug
        role_payload.setdefault('description', display_name.title())
        role_payload.setdefault('minParticipants', 1)
        role_payload.setdefault('capabilities', ['create'])
        role_payload.setdefault('constraints', {})
        normalized_roles.append(role_payload)

    if not normalized_roles:
        normalized_roles = [
            {'name': 'requester', 'description': 'Primary requester', 'minParticipants': 1, 'capabilities': ['create', 'comment']},
            {'name': 'provider', 'description': 'Responsible fulfiller', 'minParticipants': 1, 'capabilities': ['approve', 'complete']},
        ]
        role_lookup.update({'requester': 'requester', 'provider': 'provider'})

    data['roles'] = normalized_roles

    slots = data.get('slots', [])
    normalized_slots = []
    if isinstance(slots, dict):
        slot_iterable = slots.items()
    elif isinstance(slots, list):
        slot_iterable = enumerate(slots)
    else:
        slot_iterable = []

    for key, value in slot_iterable:
        slot_payload = value if isinstance(value, dict) else {'type': 'text'}
        slot_payload = slot_payload.copy()
        slot_name = slot_payload.get('name') or (key if isinstance(key, str) else f'slot_{key}')
        slot_slug = slugify_lower(slot_name, 'slot')
        slot_payload['name'] = slot_slug
        slot_payload.setdefault('type', slot_payload.get('fieldType', 'text'))
        slot_payload.setdefault('description', slot_name.title())
        slot_payload['visibility'] = [role_lookup.get(r, slugify_lower(r, 'role')) for r in slot_payload.get('visibility', [])]
        slot_payload['editable'] = [role_lookup.get(r, slugify_lower(r, 'role')) for r in slot_payload.get('editable', [])]
        normalized_slots.append(slot_payload)

    data['slots'] = normalized_slots if normalized_slots else None

    states = data.get('states', [])
    normalized_states = []
    if isinstance(states, dict):
        state_iterable = states.items()
    elif isinstance(states, list):
        state_iterable = enumerate(states)
    else:
        state_iterable = []

    for idx, value in state_iterable:
        if isinstance(states, dict):
            key = idx
            state_payload = value
        else:
            key = None
            state_payload = value
        state_payload = state_payload if isinstance(state_payload, dict) else {}
        state_payload = state_payload.copy()
        display_name = state_payload.get('name') or (key if isinstance(key, str) else f'state_{idx}')
        state_slug = slugify_lower(display_name, 'state')
        state_payload['name'] = state_slug
        state_payload.setdefault('type', state_payload.get('phase', 'collect'))
        state_payload.setdefault('description', display_name.title())
        allowed_roles = state_payload.get('allowedRoles', []) or state_payload.get('participants', [])
        state_payload['allowedRoles'] = [role_lookup.get(r, slugify_lower(r, 'role')) for r in allowed_roles]
        state_payload.setdefault('requiredSlots', [])
        state_payload.setdefault('transitions', {})
        state_payload['sequence'] = len(normalized_states)
        normalized_states.append(state_payload)

    if not normalized_states:
        normalized_states = [
            {'name': 'express_need', 'type': 'collect', 'description': 'Gather initial request', 'sequence': 0, 'requiredSlots': [], 'allowedRoles': [normalized_roles[0]['name']], 'transitions': {'always': 'explore_options'}},
            {'name': 'explore_options', 'type': 'negotiate', 'description': 'Discuss options', 'sequence': 1, 'requiredSlots': [], 'allowedRoles': [normalized_roles[0]['name'], normalized_roles[-1]['name']], 'transitions': {'always': 'commit_agreement'}},
            {'name': 'commit_agreement', 'type': 'commit', 'description': 'Confirm agreement', 'sequence': 2, 'requiredSlots': [], 'allowedRoles': [normalized_roles[-1]['name']], 'transitions': {'always': 'evidence_delivery'}},
            {'name': 'evidence_delivery', 'type': 'evidence', 'description': 'Provide proof of completion', 'sequence': 3, 'requiredSlots': [], 'allowedRoles': [normalized_roles[-1]['name']], 'transitions': {'always': 'confirm_outcome'}},
            {'name': 'confirm_outcome', 'type': 'signoff', 'description': 'Confirm success and close run', 'sequence': 4, 'requiredSlots': [], 'allowedRoles': [normalized_roles[0]['name']], 'transitions': {}},
        ]

    data['states'] = normalized_states

    return data

# Enhanced utility functions for template compilation
def create_cache_key(description: str, space_context: Optional[Dict] = None) -> str:
    """Create a unique cache key for template compilation requests"""
    context_str = json.dumps(space_context, sort_keys=True) if space_context else ""
    content = f"{description.lower().strip()}{context_str}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]

def check_rate_limit(client_id: str) -> bool:
    """Check if client has exceeded rate limits"""
    current_time = time.time()
    client_requests = request_history[client_id]

    # Remove old requests outside the window
    client_requests[:] = [req_time for req_time in client_requests
                         if current_time - req_time < RATE_LIMIT_WINDOW]

    if len(client_requests) >= RATE_LIMIT_REQUESTS:
        return False

    client_requests.append(current_time)
    return True

def calculate_quality_score(template: Dict, description: str, business_context: Optional[str] = None) -> Tuple[float, Dict[str, float]]:
    """Calculate quality score for generated template with detailed breakdown"""
    scores = {}

    # Completeness score (0-1)
    completeness_factors = [
        bool(template.get('name')),
        bool(template.get('description')),
        bool(template.get('participants', [])),
        bool(template.get('states', [])),
        len(template.get('states', [])) >= 3,  # At least 3 states
        len(template.get('participants', [])) >= 2,  # At least 2 participants
        bool(template.get('coordinationPattern')),
    ]
    scores['completeness'] = sum(completeness_factors) / len(completeness_factors)

    # Clarity score (0-1)
    desc_length = len(template.get('description', ''))
    name_length = len(template.get('name', ''))
    has_clear_states = all(state.get('description') for state in template.get('states', []))

    clarity_factors = [
        min(desc_length / 100, 1.0),  # Description length (optimal ~100 chars)
        min(name_length / 50, 1.0),   # Name length (optimal ~50 chars)
        has_clear_states,
        not any(word in template.get('description', '').lower() for word in ['todo', 'tbd', 'placeholder'])
    ]
    scores['clarity'] = sum(clarity_factors) / len(clarity_factors)

    # Feasibility score (0-1)
    state_count = len(template.get('states', []))
    participant_count = len(template.get('participants', []))

    feasibility_factors = [
        0.8 if 2 <= state_count <= 8 else 0.4,  # Reasonable number of states
        0.8 if 2 <= participant_count <= 6 else 0.4,  # Reasonable number of participants
        not any(word in description.lower() for word in ['complex', 'complicated', 'advanced']),
        len(description) < 1000,  # Not overly complex description
    ]
    scores['feasibility'] = sum(feasibility_factors) / len(feasibility_factors)

    # Business relevance score (0-1)
    business_terms = ['customer', 'service', 'order', 'request', 'approval', 'review', 'delivery']
    has_business_terms = any(term in description.lower() for term in business_terms)

    relevance_factors = [
        has_business_terms,
        bool(business_context),
        'coordination' in template.get('description', '').lower(),
        any(role.get('name', '').lower() in ['customer', 'provider', 'manager', 'reviewer']
            for role in template.get('participants', [])),
    ]
    scores['business_relevance'] = sum(relevance_factors) / len(relevance_factors)

    # Calculate weighted total
    total_score = sum(scores[key] * QUALITY_WEIGHTS[key] for key in scores)

    return total_score, scores

def extract_patterns(description: str) -> Dict[str, Any]:
    """Extract common patterns and keywords from description for analytics"""
    patterns = {
        'industry_keywords': [],
        'process_type': 'general',
        'complexity_indicators': [],
        'participant_hints': [],
    }

    desc_lower = description.lower()

    # Industry detection
    industries = {
        'restaurant': ['restaurant', 'food', 'dining', 'menu', 'kitchen'],
        'retail': ['store', 'shopping', 'purchase', 'inventory', 'sales'],
        'healthcare': ['patient', 'medical', 'health', 'appointment', 'treatment'],
        'education': ['student', 'course', 'class', 'assignment', 'grade'],
        'tech': ['software', 'development', 'code', 'deployment', 'testing'],
    }

    for industry, keywords in industries.items():
        if any(keyword in desc_lower for keyword in keywords):
            patterns['industry_keywords'].append(industry)

    # Process type detection
    if any(word in desc_lower for word in ['request', 'order', 'booking']):
        patterns['process_type'] = 'request_fulfillment'
    elif any(word in desc_lower for word in ['review', 'approval', 'feedback']):
        patterns['process_type'] = 'review_approval'
    elif any(word in desc_lower for word in ['event', 'meeting', 'gathering']):
        patterns['process_type'] = 'event_coordination'

    # Complexity indicators
    complexity_words = ['complex', 'multiple', 'various', 'different', 'many']
    patterns['complexity_indicators'] = [word for word in complexity_words if word in desc_lower]

    # Participant hints
    participant_words = ['customer', 'user', 'client', 'team', 'member', 'staff', 'manager']
    patterns['participant_hints'] = [word for word in participant_words if word in desc_lower]

    return patterns

def generate_enhanced_system_prompt(business_context: Optional[str] = None, previous_patterns: Optional[Dict] = None) -> str:
    """Generate an enhanced system prompt with context awareness"""

    base_prompt = """You are an expert coordination template architect with deep understanding of business processes and workflow optimization. Your expertise spans multiple industries and you excel at creating practical, efficient coordination templates.

CORE MISSION: Transform natural language descriptions into structured, actionable coordination templates that follow proven 5-state coordination patterns while being tailored to specific business needs.

COORDINATION PATTERN MASTERY:
1. EXPRESS: Participants articulate needs, proposals, or requirements (clear communication entry point)
2. EXPLORE: Collaborative exploration of options, negotiation, and requirement refinement
3. COMMIT: Formal agreements, commitments, and resource allocation decisions
4. EVIDENCE: Delivery of work products, proof of completion, or milestone achievements
5. CONFIRM: Final validation, satisfaction confirmation, and process closure

TEMPLATE ARCHITECTURE PRINCIPLES:
• Clarity: Every element must be immediately understandable to end users
• Efficiency: Minimize unnecessary steps while maintaining process integrity
• Flexibility: Support variations in scale, timing, and participant involvement
• Accountability: Clear ownership and responsibility at each stage
• Measurability: Enable progress tracking and outcome evaluation"""

    if business_context:
        base_prompt += f"\n\nBUSINESS CONTEXT INTEGRATION:\n{business_context}"

    if previous_patterns:
        industries = previous_patterns.get('industry_keywords', [])
        process_types = previous_patterns.get('process_type', 'general')

        if industries:
            base_prompt += f"\n\nINDUSTRY EXPERTISE: Drawing from experience in {', '.join(industries)} sectors"

        if process_types != 'general':
            base_prompt += f"\nPROCESS SPECIALIZATION: Optimized for {process_types} workflows"

    base_prompt += """

TEMPLATE QUALITY STANDARDS:
• Names should be descriptive yet concise (20-60 characters)
• Descriptions should explain the business value and process flow (50-200 words)
• Each state must have clear success criteria and exit conditions
• Participant roles must map to real business functions
• Data collection should serve genuine business needs
• Timeouts should reflect realistic business cycles

VALIDATION CHECKPOINTS:
✓ Does this solve a real business problem?
✓ Can a non-technical user understand and execute this?
✓ Are the coordination states logical and sequential?
✓ Do the participant roles have clear value-add functions?
✓ Is the complexity appropriate for the described need?

Generate templates that business teams will actually want to use and that deliver measurable coordination value."""

    return base_prompt

def enhance_template_with_metadata(template: Dict, quality_score: float, processing_time: float, patterns: Dict) -> Dict:
    """Enhance generated template with metadata for better analytics and user experience"""

    enhanced = template.copy()

    # Add compilation metadata
    enhanced['metadata'] = enhanced.get('metadata', {})
    enhanced['metadata'].update({
        'compilation': {
            'quality_score': round(quality_score, 3),
            'processing_time_ms': round(processing_time * 1000),
            'compiled_at': datetime.utcnow().isoformat(),
            'ai_version': '1.0-enhanced',
        },
        'analytics': {
            'detected_industry': patterns.get('industry_keywords', []),
            'process_type': patterns.get('process_type', 'general'),
            'complexity_level': 'high' if len(patterns.get('complexity_indicators', [])) > 2 else 'medium' if len(patterns.get('complexity_indicators', [])) > 0 else 'low',
            'participant_count': len(template.get('participants', [])),
            'state_count': len(template.get('states', [])),
        },
        'recommendations': generate_recommendations(template, quality_score, patterns)
    })

    return enhanced

def generate_recommendations(template: Dict, quality_score: float, patterns: Dict) -> List[str]:
    """Generate actionable recommendations for template improvement"""
    recommendations = []

    if quality_score < 0.7:
        recommendations.append("Consider adding more specific details to improve template clarity")

    if len(template.get('participants', [])) < 2:
        recommendations.append("Add at least one more participant role for better coordination")

    if len(template.get('states', [])) < 3:
        recommendations.append("Consider adding more workflow states for comprehensive process coverage")

    if not patterns.get('participant_hints'):
        recommendations.append("Specify clear participant roles (e.g., customer, provider, manager)")

    complexity_level = len(patterns.get('complexity_indicators', []))
    if complexity_level > 3:
        recommendations.append("Consider simplifying the process to improve adoption and execution")
    elif complexity_level == 0:
        recommendations.append("Consider adding more detail to capture important process nuances")

    if not template.get('coordinationPattern', {}).get('evidence', {}).get('enabled'):
        recommendations.append("Consider enabling evidence collection for better process accountability")

    return recommendations[:3]  # Limit to top 3 recommendations

def update_compilation_stats(space_id: str, success: bool, processing_time: float, quality_score: Optional[float] = None, patterns: Optional[Dict] = None):
    """Update compilation statistics for analytics"""
    stats = compilation_stats[space_id]
    stats['attempts'] += 1

    if success:
        stats['successes'] += 1
        if quality_score:
            stats['quality_scores'].append(quality_score)
            stats['avg_confidence'] = sum(stats['quality_scores']) / len(stats['quality_scores'])
    else:
        stats['failures'] += 1

    # Update average processing time
    total_time = stats['avg_processing_time'] * (stats['attempts'] - 1) + processing_time
    stats['avg_processing_time'] = total_time / stats['attempts']

    # Track patterns
    if patterns:
        for industry in patterns.get('industry_keywords', []):
            stats['common_patterns'][industry] += 1
        if patterns.get('process_type'):
            stats['common_patterns'][patterns['process_type']] += 1

# Load environment variables from the root .env file
load_dotenv(dotenv_path="../../.env")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/rouh")
# SQLAlchemy sync URL - using psycopg2 instead of async
SYNC_DB_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://")

engine = create_engine(SYNC_DB_URL, echo=False)
app = FastAPI(title="Rouh AI Service - Enhanced Template Compilation")

# Enhanced analytics and caching
compilation_cache = {}
compilation_stats = defaultdict(lambda: {
    'attempts': 0,
    'successes': 0,
    'failures': 0,
    'avg_processing_time': 0,
    'avg_confidence': 0,
    'quality_scores': [],
    'common_patterns': defaultdict(int)
})

# Rate limiting
request_history = defaultdict(list)
RATE_LIMIT_REQUESTS = 10
RATE_LIMIT_WINDOW = 300  # 5 minutes

# Quality scoring parameters
QUALITY_WEIGHTS = {
    'completeness': 0.3,
    'clarity': 0.25,
    'feasibility': 0.25,
    'business_relevance': 0.2
}

# Add CORS middleware to allow browser requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Web and API origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

openai_key = os.getenv("OPENAI_API_KEY")
print(f"OpenAI API Key loaded: {'Yes' if openai_key else 'No'}")

# Initialize OpenAI client
client = None
if openai_key:
    try:
        client = OpenAI(api_key=openai_key)
        print("OpenAI client initialized successfully")
    except Exception as e:
        print(f"Warning: Could not initialize OpenAI client: {e}")
        client = None


class EmbedInput(BaseModel):
  space_id: str
  text: str
  item_id: Optional[str] = None


class SpaceProfile(BaseModel):
  businessName: str
  bio: Optional[str] = None
  phone: Optional[str] = None
  email: Optional[str] = None
  hours: Optional[Dict[str, Any]] = None
  services: Optional[List[str]] = None

class SpaceItem(BaseModel):
  type: str
  name: Optional[str] = None
  description: Optional[str] = None
  services: Optional[List[str]] = None
  price: Optional[float] = None

class KnowledgeEntry(BaseModel):
  id: str
  title: str
  text: str
  tags: Optional[List[str]] = None
  metadata: Optional[Dict[str, Any]] = None

class KnowledgeContext(BaseModel):
  facts: List[KnowledgeEntry] = []
  behaviors: List[KnowledgeEntry] = []
  workflows: List[KnowledgeEntry] = []

class SpaceRule(BaseModel):
  category: str
  description: Optional[str] = None
  conditions: Dict[str, Any]
  responses: Dict[str, Any]

class SpaceInfo(BaseModel):
  name: str
  description: Optional[str] = None
  category: Optional[str] = None
  tags: Optional[List[str]] = None

class TrainingExample(BaseModel):
  role: str  # "user" or "assistant"
  content: str
  sequence: int

class SpaceContext(BaseModel):
  space: SpaceInfo
  profile: Optional[SpaceProfile] = None
  items: List[SpaceItem]
  availableActions: List[str]
  rules: Optional[List[SpaceRule]] = None
  knowledge: Optional[KnowledgeContext] = None
  trainingExamples: Optional[List[List[TrainingExample]]] = None

class RAGQuery(BaseModel):
  space_id: str
  query: str
  k: int = 3
  context: Optional[SpaceContext] = None


class PromptCompileRequest(BaseModel):
  space_context: SpaceContext


def set_space(conn, space_id: str):
  conn.execute(sql_text("select set_config('app.space_id', :sid, true)").bindparams(sid=space_id))


def chunk_text(text: str, chunk_size: int = 1200, overlap: int = 200) -> List[str]:
  """Split large documents into overlapping chunks to improve retrieval granularity."""
  cleaned = text.strip()
  if not cleaned:
    return []

  if len(cleaned) <= chunk_size:
    return [cleaned]

  chunks: List[str] = []
  start = 0
  length = len(cleaned)

  while start < length:
    end = min(length, start + chunk_size)
    chunk = cleaned[start:end]

    if end < length:
      newline_idx = cleaned.rfind("\n", start, end)
      if newline_idx != -1 and newline_idx - start > chunk_size * 0.5:
        end = newline_idx
        chunk = cleaned[start:end]
      else:
        space_idx = cleaned.rfind(" ", start, end)
        if space_idx != -1 and space_idx - start > chunk_size * 0.5:
          end = space_idx
          chunk = cleaned[start:end]

    chunk = chunk.strip()
    if chunk:
      chunks.append(chunk)

    if end >= length:
      break

    start = max(end - overlap, start + 1)

  return chunks


def build_document_summary(text: str, max_length: int = 600) -> str:
  """Create a concise summary from raw document text without extra model calls."""
  cleaned = re.sub(r'\s+', ' ', text or '').strip()
  if not cleaned:
    return "Document contents could not be read; ask the user to re-upload or provide details."

  sentences = re.split(r'(?<=[.!?])\s+', cleaned)
  summary_parts: List[str] = []
  length_so_far = 0

  for sentence in sentences:
    if not sentence:
      continue
    summary_parts.append(sentence)
    length_so_far += len(sentence)
    if length_so_far >= max_length:
      break

  summary = ' '.join(summary_parts) if summary_parts else cleaned[:max_length]
  if len(summary) > max_length:
    summary = summary[:max_length].rsplit(' ', 1)[0] + '...'

  return summary


def _get_example_value(example: Any, key: str, default: Any = None) -> Any:
  """Safely extract a field from TrainingExample instances or dicts."""
  if hasattr(example, key):
    return getattr(example, key)
  if isinstance(example, dict):
    return example.get(key, default)
  if hasattr(example, 'model_dump'):
    return example.model_dump().get(key, default)
  return default


def build_system_prompt(context: Optional[SpaceContext] = None) -> str:
  """Build a dynamic system prompt based on space context"""

  if not context:
    return "You are a helpful AI assistant. Answer briefly and helpfully."

  space = context.space
  profile = context.profile

  # Start with basic identity
  if profile and profile.businessName:
    business_name = profile.businessName
  else:
    business_name = space.name

  prompt_parts = [f"You are the AI assistant for {business_name}"]

  # Add business category/type with personality
  category_personalities = {
    'coffee-shop': ', your friendly neighborhood coffee shop',
    'restaurant': ', your local restaurant',
    'auto-dealer': ', your trusted automotive dealership',
    'medical-clinic': ', your healthcare practice',
    'consultant': ', your professional consulting firm',
    'food': ', your delicious food establishment',
    'healthcare': ', your healthcare provider',
    'automotive': ', your automotive service center'
  }

  if space.category and space.category.lower() in category_personalities:
    prompt_parts.append(category_personalities[space.category.lower()])
  elif space.category:
    prompt_parts.append(f", a {space.category}")
  elif space.description:
    prompt_parts.append(f" - {space.description}")

  prompt_parts.append(". You know everything about our business and genuinely want to help customers.")

  # Add business description/bio
  if profile and profile.bio:
    prompt_parts.append(f"\n\nAbout us: {profile.bio}")
  elif space.description and space.description != space.name:
    prompt_parts.append(f"\n\nAbout us: {space.description}")

  # Add services offered
  if profile and profile.services:
    services_text = ", ".join(profile.services)
    prompt_parts.append(f"\n\nWe offer: {services_text}")

  # Add available items/products
  if context.items:
    items_info = []
    for item in context.items[:10]:  # Limit to first 10 items
      item_desc = item.name or f"{item.type}"
      if item.description:
        item_desc += f" - {item.description}"
      if item.price:
        item_desc += f" (${item.price})"
      items_info.append(item_desc)

    if items_info:
      prompt_parts.append(f"\n\nAvailable items/services:\n• " + "\n• ".join(items_info))

  # Add available actions
  if context.availableActions:
    actions_map = {
      'contact': 'contact us',
      'inquiry': 'ask questions',
      'order': 'place orders',
      'book': 'book appointments or test drives',
      'schedule': 'schedule meetings or consultations'
    }

    action_descriptions = []
    for action in context.availableActions:
      desc = actions_map.get(action, action)
      action_descriptions.append(desc)

    actions_text = ", ".join(action_descriptions)
    prompt_parts.append(f"\n\nI can help you: {actions_text}")

  # Add contact information
  contact_info = []
  if profile:
    if profile.phone:
      contact_info.append(f"Phone: {profile.phone}")
    if profile.email:
      contact_info.append(f"Email: {profile.email}")

  if contact_info:
    prompt_parts.append(f"\n\nContact: {', '.join(contact_info)}")

  # Add hours information
  if profile and profile.hours:
    prompt_parts.append(f"\n\nOur hours: {profile.hours}")

  # Add behavioral guidelines based on business type
  base_guidelines = [
    "\n\nHow to help customers:",
    f"• Always speak as a representative of {business_name}",
    "• Be warm, helpful, and knowledgeable about our offerings",
    "• Use specific information from our documents and training when available",
    "• Proactively suggest relevant actions (ordering, booking, contacting)",
    "• Keep responses conversational but informative"
  ]

  # Add category-specific guidelines
  category_guidelines = {
    'coffee-shop': [
      "• Help customers explore our menu and make recommendations",
      "• Suggest customizations and explain drink options",
      "• Provide accurate pricing and availability information"
    ],
    'restaurant': [
      "• Describe dishes enthusiastically and suggest pairings",
      "• Help with dietary restrictions and special requests",
      "• Assist with reservations and timing questions"
    ],
    'auto-dealer': [
      "• Help customers find the right vehicle for their needs",
      "• Explain features, financing options, and next steps",
      "• Schedule test drives and appointments with confidence"
    ],
    'medical-clinic': [
      "• Provide clear information about services and procedures",
      "• Help patients prepare for appointments and understand policies",
      "• Maintain professional, caring, and reassuring tone"
    ],
    'consultant': [
      "• Demonstrate expertise and understanding of client challenges",
      "• Explain our process and how we can help solve their problems",
      "• Focus on building trust and scheduling consultations"
    ]
  }

  guidelines = base_guidelines[:]
  if space.category and space.category.lower() in category_guidelines:
    guidelines.extend(category_guidelines[space.category.lower()])
  else:
    guidelines.extend([
      "• Provide detailed information about our services",
      "• Help customers understand what we offer and how we can help",
      "• Guide them toward appropriate next steps"
    ])

  prompt_parts.extend(guidelines)

  if context.knowledge:
    knowledge = context.knowledge

    if knowledge.facts:
      prompt_parts.append("\n\nBusiness facts you must reference accurately:\n")
      for entry in knowledge.facts[:15]:
        prompt_parts.append(f"• {entry.text}\n")

    if knowledge.behaviors:
      prompt_parts.append("\n\nBehavior guidelines to follow:\n")
      for entry in knowledge.behaviors[:15]:
        prompt_parts.append(f"• {entry.text}\n")

    if knowledge.workflows:
      prompt_parts.append("\n\nService workflows:\n")
      for entry in knowledge.workflows[:10]:
        prompt_parts.append(f"• {entry.title}: {entry.text}\n")

  # Add custom training instructions from user
  if context.trainingExamples:
    training_instructions = []
    logger.info(f"Processing {len(context.trainingExamples)} training sessions")

    for session_idx, example_session in enumerate(context.trainingExamples):
      try:
        # Validate session structure
        if not isinstance(example_session, list) or len(example_session) == 0:
          logger.warning(f"Invalid or empty training session {session_idx}")
          continue

        # Check if this is a single system instruction
        if len(example_session) == 1 and _get_example_value(example_session[0], 'role') == 'system':
          instruction = _get_example_value(example_session[0], 'content')
          if instruction and instruction.strip():
            # Sanitize instruction to prevent injection
            clean_instruction = instruction.strip()[:500]  # Limit length
            training_instructions.append(clean_instruction)
            logger.info(f"Added training instruction {session_idx}: {clean_instruction[:50]}...")
          else:
            logger.warning(f"Empty training instruction in session {session_idx}")
        else:
          logger.debug(f"Skipping non-system training session {session_idx} with {len(example_session)} messages")
      except Exception as e:
        logger.error(f"Failed to process training session {session_idx}: {e}")
        continue

    if training_instructions:
      logger.info(f"Applied {len(training_instructions)} training instructions")
      prompt_parts.append(f"\n\n🎯 IMPORTANT BEHAVIOR INSTRUCTIONS:\n")
      for instruction in training_instructions:
        prompt_parts.append(f"• {instruction}\n")
      prompt_parts.append("Follow these instructions carefully in your responses.")
    else:
      logger.warning("No valid training instructions found despite having training examples")

  return "".join(prompt_parts)


@app.post("/embed")
def embed(inp: EmbedInput):
  if client is None:
    raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")
  try:
    # Create embedding
    emb = client.embeddings.create(model="text-embedding-3-small", input=inp.text)
    vec = emb.data[0].embedding
    values = ",".join(str(x) for x in vec)
    with engine.begin() as conn:
      set_space(conn, inp.space_id)
      # Insert text and embedding
      query = f"""
        INSERT INTO "AiEmbedding" (id, "spaceId", "itemId", text, embedding)
        VALUES (gen_random_uuid()::text, :space_id, :item_id, :text, '[{values}]')
        """
      conn.execute(sql_text(query).bindparams(space_id=inp.space_id, item_id=inp.item_id, text=inp.text))
    return {"ok": True}
  except Exception as e:
    error_msg = str(e)
    if "insufficient_quota" in error_msg or "exceeded your current quota" in error_msg:
      raise HTTPException(status_code=402, detail="OpenAI API quota exceeded. Please check your billing.")
    raise HTTPException(status_code=500, detail=f"Failed to create embedding: {error_msg}")


@app.post("/rag/query")
def rag(q: RAGQuery):
  if client is None:
    raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")
  try:
    print(f"RAG Query - Space ID: {q.space_id}, Query: {q.query}, K: {q.k}")

    # Step 1: Generate embedding for the user query
    query_emb = client.embeddings.create(model="text-embedding-3-small", input=q.query)
    query_vector = query_emb.data[0].embedding
    query_values = ",".join(str(x) for x in query_vector)
    print(f"Generated query embedding with {len(query_vector)} dimensions")

    # Step 2: Search for similar embeddings using cosine similarity
    retrieved_contexts = []
    with engine.begin() as conn:
      set_space(conn, q.space_id)

      # Get embeddings for this space with limit to prevent memory issues
      embeddings_query = """
        SELECT id, "itemId", text, embedding
        FROM "AiEmbedding"
        WHERE "spaceId" = :space_id
          AND embedding IS NOT NULL
        ORDER BY "createdAt" DESC
        LIMIT 500
      """

      result = conn.execute(
        sql_text(embeddings_query).bindparams(space_id=q.space_id)
      ).fetchall()
      print(f"Found {len(result)} stored embeddings for space {q.space_id} (limited to 500 most recent)")

      # Calculate cosine similarity in Python
      similarities = []
      query_magnitude = math.sqrt(sum(a * a for a in query_vector))

      if query_magnitude == 0:
        print("Warning: Query vector has zero magnitude")
        return {"answer": "Invalid query vector", "citations": [], "retrieved_count": 0}

      for row in result:
        try:
          # Parse stored embedding JSON
          stored_embedding = json.loads(row[3])

          # Validate embedding dimensions
          if len(stored_embedding) != len(query_vector):
            logger.warning(f"Embedding dimension mismatch: {len(stored_embedding)} vs {len(query_vector)}")
            continue

          # Calculate cosine similarity more efficiently
          dot_product = sum(a * b for a, b in zip(query_vector, stored_embedding))
          stored_magnitude = math.sqrt(sum(b * b for b in stored_embedding))

          if stored_magnitude > 0:
            similarity = dot_product / (query_magnitude * stored_magnitude)
            # Only keep similarities above threshold to reduce memory usage
            if similarity > 0.3:  # Improved threshold for text-embedding-3-small model
              similarities.append({
                "embedding_id": row[0],
                "item_id": row[1],
                "text": row[2],
                "similarity": similarity
              })
        except (json.JSONDecodeError, ValueError, TypeError) as e:
          logger.warning(f"Failed to process embedding {row[0]}: {e}")
          continue

      # Sort by similarity and take top k results
      similarities.sort(key=lambda x: x["similarity"], reverse=True)
      print(f"Calculated similarities for {len(similarities)} embeddings")
      if similarities:
        print(f"Top similarity score: {similarities[0]['similarity']:.3f}")

      max_candidates = max(q.k * 2, q.k + 2)
      for item in similarities[:max_candidates]:
        print(f"Checking item with similarity: {item['similarity']:.3f}")
        if item["similarity"] > 0.35 or len(retrieved_contexts) < q.k:
          retrieved_contexts.append(item)
          print(f"✅ Added context: {item['text'][:100]}...")
        if len(retrieved_contexts) >= q.k:
          break

      # If no good matches, try text search as fallback
      if not retrieved_contexts:
        print("No good vector matches found, trying text search fallback")
        fallback_query = """
          SELECT id, "itemId", text FROM "AiEmbedding"
          WHERE "spaceId" = :space_id
            AND (text ILIKE :query_text OR text ILIKE :query_words)
          LIMIT :k
        """

        # Extract keywords from query for better text matching
        query_words = ' '.join([f'%{word}%' for word in q.query.split() if len(word) > 2])

        fallback_result = conn.execute(
          sql_text(fallback_query).bindparams(
            space_id=q.space_id,
            query_text=f"%{q.query}%",
            query_words=query_words,
            k=q.k
          )
        ).fetchall()

        for row in fallback_result:
          retrieved_contexts.append({
            "embedding_id": row[0],
            "item_id": row[1],
            "text": row[2],
            "similarity": 0.6  # Lower similarity for text matches
          })

    # Step 3: Build context-aware system prompt
    system_prompt = build_system_prompt(q.context)

    # Step 4: Add retrieved context to the prompt
    print(f"Retrieved {len(retrieved_contexts)} relevant contexts")
    if retrieved_contexts:
      context_text = "\n\nRelevant information from uploaded documents:\n"
      for i, ctx in enumerate(retrieved_contexts[:3]):  # Use top 3 results
        context_text += f"\n{i+1}. {ctx['text']}\n"
      system_prompt += context_text
      system_prompt += "\nPlease use this information to answer the user's question accurately."
      print(f"Added {len(retrieved_contexts[:3])} contexts to prompt")
    else:
      print("⚠️  No relevant contexts found - using fallback text search...")

    # Step 5: Create messages with enhanced system context
    messages = [
      {"role": "system", "content": system_prompt}
    ]

    # Add training examples as few-shot learning (only user/assistant pairs, not system instructions)
    if q.context and q.context.trainingExamples:
      try:
        for session_idx, example_session in enumerate(q.context.trainingExamples[:3]):  # Use up to 3 training sessions
          try:
            # Validate session structure
            if not isinstance(example_session, list) or len(example_session) == 0:
              logger.warning(f"Invalid training session {session_idx} in RAG query")
              continue

            # Skip single system instruction sessions (they're handled in system prompt)
            if len(example_session) == 1 and _get_example_value(example_session[0], 'role') == 'system':
              continue

            # Sort by sequence to maintain conversation order
            sorted_examples = sorted(
              example_session,
              key=lambda x: _get_example_value(x, 'sequence', 0)
            )

            for example in sorted_examples:
              role = _get_example_value(example, 'role', 'user')
              content = _get_example_value(example, 'content', '')

              # Validate role and content
              if role not in ['user', 'assistant'] or not content.strip():
                logger.warning(f"Invalid training example in session {session_idx}: role={role}")
                continue

              messages.append({
                "role": role,
                "content": content.strip()[:1000]  # Limit content length
              })
          except Exception as e:
            logger.error(f"Failed to process training session {session_idx} in RAG: {e}")
            continue
      except Exception as e:
        logger.error(f"Failed to process training examples in RAG: {e}")

    # Add the current user query
    messages.append({"role": "user", "content": q.query})

    completion = client.chat.completions.create(
      model="gpt-4o-mini",
      messages=messages,
      temperature=0.3,
      max_tokens=500,
    )
    answer = completion.choices[0].message.content

    # Return answer with properly formatted citations
    citations = [{
      "embedding_id": ctx["embedding_id"],
      "item_id": ctx["item_id"]
    } for ctx in retrieved_contexts[:3]]

    print(f"Final response - Retrieved: {len(retrieved_contexts)}, Citations: {len(citations)}")
    return {
      "answer": answer,
      "citations": citations,
      "retrieved_count": len(retrieved_contexts)
    }

  except Exception as e:
    error_msg = str(e)
    if "insufficient_quota" in error_msg or "exceeded your current quota" in error_msg:
      raise HTTPException(status_code=402, detail="OpenAI API quota exceeded. Please check your billing.")
    raise HTTPException(status_code=500, detail=f"Failed to query RAG: {error_msg}")


class TrainingChatRequest(BaseModel):
  space_id: str
  message: str
  conversation_history: List[Dict[str, str]]
  space_context: SpaceContext

class GeneratePromptRequest(BaseModel):
  space_id: str
  conversation_history: List[Dict[str, str]]
  space_context: SpaceContext

class UpdatePromptRequest(BaseModel):
  space_id: str
  prompt_update: str
  reason: str
  confidence: float = 0.7

def get_dynamic_prompts(conn, space_id: str) -> str:
  """Retrieve and combine all active dynamic prompt updates for a space"""
  try:
    result = conn.execute(
      sql_text("""
        SELECT content, metadata
        FROM "SpaceTrainingConversation"
        WHERE "spaceId" = :space_id
        AND role = 'system'
        AND content LIKE 'SYSTEM_PROMPT_UPDATE:%'
        AND "isActive" = true
        ORDER BY "createdAt" DESC
        LIMIT 10
      """).bindparams(space_id=space_id)
    ).fetchall()

    if not result:
      return ""

    prompts = []
    for row in result:
      content = row[0]
      # Extract the actual prompt update after the prefix
      if content.startswith("SYSTEM_PROMPT_UPDATE:"):
        update = content[len("SYSTEM_PROMPT_UPDATE:"):].strip()
        prompts.append(update)

    if prompts:
      return "\n\n🔄 DYNAMIC UPDATES FROM USER INTERACTIONS:\n" + "\n".join(f"- {p}" for p in prompts)
    return ""
  except Exception as e:
    logger.warning(f"Failed to get dynamic prompts: {e}")
    return ""

@app.post("/training/conversation")
async def training_conversation(request: TrainingChatRequest):
  """Handle conversational training with context-aware setup assistant"""
  if client is None:
    raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

  try:
    # Build setup assistant prompt based on space context
    space = request.space_context.space
    profile = request.space_context.profile

    # Determine business type from category or description
    business_type = space.category or "custom"
    business_name = profile.businessName if profile else space.name
    business_description = profile.bio if profile and profile.bio else space.description

    # Check if documents were uploaded recently (check for embeddings in database)
    recently_uploaded_docs = []
    doc_summaries: List[str] = []
    dynamic_prompts = ""
    with engine.begin() as conn:
      set_space(conn, request.space_id)
      # Check for recent embeddings (documents)
      doc_check = conn.execute(
        sql_text("""
          SELECT text
          FROM "AiEmbedding"
          WHERE "spaceId" = :space_id
          AND "itemId" IS NULL
          ORDER BY "createdAt" DESC
          LIMIT 5
        """).bindparams(space_id=request.space_id)
      ).fetchall()

      print(f"🔍 Found {len(doc_check)} documents for space {request.space_id}")
      for row in doc_check:
        # Extract meaningful content from document (increased from 150 to 2000 chars)
        doc_text = row[0]
        if doc_text:
          # Get full document text up to 2000 chars
          preview = doc_text[:2000]
          if len(doc_text) > 2000:
            preview = preview + "..."
          recently_uploaded_docs.append(preview)
          doc_summaries.append(build_document_summary(preview))
          print(f"📄 Document preview (first 300 chars): {preview[:300]}...")

    # Build document context for the AI
    doc_context = ""
    if doc_summaries:
      max_summaries = 3
      limited_summaries = doc_summaries[:max_summaries]
      doc_context_lines = [
        "Recent documents uploaded for this space (summaries you must reference explicitly):"
      ]
      for idx, summary in enumerate(limited_summaries, 1):
        doc_context_lines.append(f"{idx}. {summary}")

      if len(doc_summaries) > max_summaries:
        doc_context_lines.append("Additional documents are available; ask the user which ones matter most if needed.")

      if any("could not be read" in summary.lower() for summary in doc_summaries):
        doc_context_lines.append("At least one document could not be parsed. Ask the user to re-upload clearer material.")

      doc_context_lines.append("Cite only the facts above. If the information you need is missing, ask follow-up questions instead of inventing details.")
      doc_context = "\n" + "\n".join(doc_context_lines)

    dynamic_prompts = get_dynamic_prompts(conn, request.space_id)

    # Create context-aware system prompt for setup assistant
    system_prompt = f"""You are helping set up an AI assistant for {business_name}.

Business context: {business_description or f"A {business_type} business"}
{doc_context}
{dynamic_prompts}

Your role is to have a natural conversation to understand their business better.
Based on what they tell you AND any documents they upload, ask relevant follow-up questions about:
- Their specific services or products (especially those mentioned in uploaded documents)
- Operating hours and availability
- Policies (reservations, returns, delivery, etc.)
- What makes them unique or special
- Common customer questions they handle
- Their target audience

Be conversational and friendly. Adapt your questions based on the business type and uploaded documents.
When documents are uploaded, ALWAYS acknowledge them immediately and discuss their specific content.
Don't ask too many questions at once - keep it natural.
When you feel you have enough information, let them know you can generate their AI assistant's personality."""

    # Build conversation messages
    messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history
    for msg in request.conversation_history:
      messages.append({
        "role": msg.get("role", "user"),
        "content": msg.get("content", "")
      })

    # Add current message (handle special system triggers)
    if request.message:
      # Check if this is a system trigger for document upload
      if request.message.startswith("[SYSTEM: Document"):
        # Extract document info from system message
        doc_name = ""
        doc_size = ""
        import re
        match = re.search(r'Document "([^"]+)" was just uploaded with (\d+) characters', request.message)
        if match:
          doc_name = match.group(1)
          doc_size = match.group(2)

        # Force AI to proactively discuss the document
        messages.append({
          "role": "user",
          "content": f"I just uploaded a document called '{doc_name}' ({doc_size} characters). Please immediately acknowledge it and discuss what you see in its contents."
        })
      else:
        messages.append({"role": "user", "content": request.message})
    else:
      # Empty message - AI should proactively discuss any recently uploaded documents
      if recently_uploaded_docs:
        messages.append({"role": "user", "content": "Please review and discuss the document I just uploaded."})
      else:
        messages.append({"role": "user", "content": "Continue our conversation."})

    # Get response from GPT-4o-mini
    print(f"🤖 Sending {len(messages)} messages to GPT-4o-mini for training conversation")
    print(f"📝 System prompt length: {len(messages[0]['content']) if messages else 0}")
    print(f"💬 User message: {messages[-1]['content'][:200] if messages else 'No messages'}")

    completion = client.chat.completions.create(
      model="gpt-4o-mini",
      messages=messages,
      temperature=0.7,
      max_tokens=300
    )

    response = completion.choices[0].message.content
    print(f"🎯 GPT-4o-mini response: {response[:200]}...")

    # Analyze if user is correcting the AI's behavior and AI should update its prompt
    should_update_prompt = False
    prompt_update = ""
    update_reason = ""

    # Check for correction patterns in the last user message
    if request.message:
      correction_indicators = [
        "no, you should",
        "actually, please",
        "instead, you need to",
        "wrong, you must",
        "that's not right",
        "you're supposed to",
        "always remember to",
        "never forget",
        "make sure you",
        "you need to understand"
      ]

      user_msg_lower = request.message.lower()
      for indicator in correction_indicators:
        if indicator in user_msg_lower:
          should_update_prompt = True
          # Extract the correction instruction
          prompt_update = f"Based on user feedback: {request.message}"
          update_reason = f"User provided correction: {indicator}"
          break

    # If we should update the prompt, do it automatically
    if should_update_prompt:
      try:
        with engine.begin() as update_conn:
          set_space(update_conn, request.space_id)
          session_id = f"auto-update-{datetime.now().isoformat()}"

          update_conn.execute(
            sql_text("""
              INSERT INTO "SpaceTrainingConversation" (id, "spaceId", role, content, metadata, sequence, "sessionId", "isActive")
              VALUES (
                gen_random_uuid()::text,
                :space_id,
                'system',
                :content,
                :metadata,
                1,
                :session_id,
                true
              )
            """).bindparams(
              space_id=request.space_id,
              content=f"SYSTEM_PROMPT_UPDATE: {prompt_update}",
              metadata=json.dumps({
                "type": "auto_prompt_update",
                "reason": update_reason,
                "confidence": 0.8,
                "timestamp": datetime.now().isoformat(),
                "original_message": request.message
              }),
              session_id=session_id
            )
          )

        # Add acknowledgment to response
        response += "\n\n💡 I've updated my understanding based on your feedback and will remember this going forward."
      except Exception as e:
        logger.warning(f"Failed to auto-update prompt: {e}")

    return {
      "response": response,
      "ready_to_generate": "generate" in response.lower() or "enough information" in response.lower(),
      "prompt_updated": should_update_prompt
    }

  except Exception as e:
    logger.error(f"Training conversation error: {e}")
    raise HTTPException(status_code=500, detail=str(e))

@app.post("/training/update-prompt")
async def update_system_prompt(request: UpdatePromptRequest):
  """Allow AI to update its own system prompt based on user interactions"""
  try:
    with engine.begin() as conn:
      set_space(conn, request.space_id)

      # Store the prompt update as a special training conversation
      session_id = f"prompt-update-{datetime.now().isoformat()}"

      # Store the AI's decision to update its prompt
      conn.execute(
        sql_text("""
          INSERT INTO "SpaceTrainingConversation" (id, "spaceId", role, content, metadata, sequence, "sessionId", "isActive")
          VALUES (
            gen_random_uuid()::text,
            :space_id,
            'system',
            :content,
            :metadata,
            1,
            :session_id,
            true
          )
        """).bindparams(
          space_id=request.space_id,
          content=f"SYSTEM_PROMPT_UPDATE: {request.prompt_update}",
          metadata=json.dumps({
            "type": "prompt_update",
            "reason": request.reason,
            "confidence": request.confidence,
            "timestamp": datetime.now().isoformat()
          }),
          session_id=session_id
        )
      )

      return {
        "success": True,
        "message": "System prompt updated",
        "confidence": request.confidence
      }

  except Exception as e:
    logger.error(f"Failed to update system prompt: {e}")
    raise HTTPException(status_code=500, detail=str(e))

@app.post("/training/generate-prompt")
async def generate_system_prompt(request: GeneratePromptRequest):
  """Generate optimized system prompt from training conversation"""
  if client is None:
    raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

  try:
    # Prepare conversation for analysis
    conversation_text = "\n".join([
      f"{msg['role']}: {msg['content']}"
      for msg in request.conversation_history
    ])

    space = request.space_context.space
    profile = request.space_context.profile
    business_name = profile.businessName if profile else space.name

    # Ask GPT to extract business information and generate system prompt
    analysis_prompt = f"""Based on this training conversation for {business_name}, generate an optimized system prompt for their AI assistant.

Training Conversation:
{conversation_text}

Extract key information about:
- Business type and services
- Operating hours
- Policies and procedures
- Unique features
- Target audience
- Personality/tone

Generate a concise, effective system prompt that will make the AI assistant helpful and knowledgeable about this specific business.
The prompt should be specific to their business, not generic.
Include their actual services, hours, and policies mentioned in the conversation."""

    completion = client.chat.completions.create(
      model="gpt-4o-mini",
      messages=[
        {"role": "system", "content": "You are an expert at creating AI system prompts."},
        {"role": "user", "content": analysis_prompt}
      ],
      temperature=0.5,
      max_tokens=500
    )

    generated_prompt = completion.choices[0].message.content

    return {
      "system_prompt": generated_prompt,
      "extracted_info": {
        "business_name": business_name,
        "category": space.category,
        "from_conversation": True
      }
    }

  except Exception as e:
    logger.error(f"Prompt generation error: {e}")
    raise HTTPException(status_code=500, detail=str(e))


@app.post("/prompt/compile")
async def compile_prompt(request: PromptCompileRequest):
  """Compile a system prompt from structured knowledge/context without needing a conversation."""
  prompt = build_system_prompt(request.space_context)
  return {"system_prompt": prompt}

class DirectChatRequest(BaseModel):
  message: str
  system_prompt: Optional[str] = None
  conversation_history: Optional[List[Dict[str, str]]] = None

@app.post("/chat/direct")
async def direct_chat(request: DirectChatRequest):
  """Direct chat using system prompt without RAG"""
  if client is None:
    raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

  try:
    # Use provided system prompt or a default one
    system_prompt = request.system_prompt or "You are a helpful AI assistant."

    # Build messages
    messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history if provided
    if request.conversation_history:
      for msg in request.conversation_history[-10:]:  # Keep last 10 messages
        messages.append({
          "role": msg.get("role", "user"),
          "content": msg.get("content", "")
        })

    # Add current message
    messages.append({"role": "user", "content": request.message})

    # Get response from GPT-4o-mini
    completion = client.chat.completions.create(
      model="gpt-4o-mini",
      messages=messages,
      temperature=0.7,
      max_tokens=300
    )

    response = completion.choices[0].message.content

    return {
      "response": response,
      "model": "gpt-4o-mini"
    }

  except Exception as e:
    logger.error(f"Direct chat error: {e}")
    error_msg = str(e)
    if "insufficient_quota" in error_msg or "exceeded your current quota" in error_msg:
      raise HTTPException(status_code=402, detail="OpenAI API quota exceeded. Please check your billing.")
    raise HTTPException(status_code=500, detail=str(e))

@app.post("/normalize")
def normalize(payload: dict):
  # Placeholder normalizer
  return {"normalized": payload}


def extract_text_from_pdf(file_content: bytes) -> str:
  """Extract text from PDF content"""
  if PyPDF2 is None:
    return "PDF processing unavailable - PyPDF2 not installed"
  try:
    pdf_file = io.BytesIO(file_content)
    pdf_reader = PyPDF2.PdfReader(pdf_file)
    text = ""
    for page in pdf_reader.pages:
      text += page.extract_text() + "\n"
    return text.strip()
  except Exception as e:
    raise HTTPException(status_code=400, detail=f"Failed to extract text from PDF: {str(e)}")

def analyze_document_content(text: str) -> dict:
  """Analyze document content to determine type and extract key entities"""
  import re

  text_lower = text.lower()

  # Detect document type based on content patterns
  document_type = "document"
  if any(word in text_lower for word in ["menu", "coffee", "drinks", "food", "restaurant", "cafe"]):
    if "$" in text and any(word in text_lower for word in ["coffee", "americano", "latte", "cappuccino", "espresso"]):
      document_type = "coffee_menu"
    elif "$" in text and any(word in text_lower for word in ["pizza", "burger", "salad", "pasta", "appetizer"]):
      document_type = "restaurant_menu"
    else:
      document_type = "menu"
  elif any(word in text_lower for word in ["price", "cost", "pricing", "rates", "fee"]):
    document_type = "price_list"
  elif any(word in text_lower for word in ["faq", "frequently asked", "questions", "q&a"]):
    document_type = "faq"
  elif any(word in text_lower for word in ["policy", "terms", "conditions", "rules"]):
    document_type = "policy"
  elif any(word in text_lower for word in ["service", "appointment", "consultation", "booking"]):
    document_type = "services"

  # Extract key entities based on document type
  entities = {}

  if document_type in ["coffee_menu", "restaurant_menu", "menu"]:
    # Extract items with prices
    price_pattern = r'[\$][\d,]+\.?\d*'
    prices = re.findall(price_pattern, text)

    # Extract menu items (words before prices, or common menu items)
    menu_items = []
    lines = text.split('\n')
    for line in lines:
      if '$' in line and len(line.split()) > 1:
        # Try to extract item name from line with price
        item_part = re.sub(price_pattern, '', line).strip()
        if item_part and len(item_part) > 3:
          menu_items.append(item_part.strip('-: '))

    entities = {
      "items": menu_items[:10],  # Top 10 items
      "price_range": {"min": prices[0] if prices else None, "max": prices[-1] if prices else None},
      "total_items": len(menu_items)
    }

  elif document_type == "price_list":
    prices = re.findall(r'[\$][\d,]+\.?\d*', text)
    entities = {
      "prices": prices[:5],  # First 5 prices
      "price_count": len(prices)
    }

  else:
    # General content analysis
    words = text.split()
    entities = {
      "word_count": len(words),
      "key_topics": []  # Could be enhanced with NLP
    }

  return {
    "type": document_type,
    "entities": entities
  }


def process_image_with_vision(file_content: bytes, filename: str) -> str:
  """Process image using GPT-4o vision"""
  if client is None:
    return f"Image document: {filename}"

  try:
    # Convert image to base64
    base64_image = base64.b64encode(file_content).decode('utf-8')

    # Use GPT-4o to extract text and understand the image
    response = client.chat.completions.create(
      model="gpt-4o-mini",  # Using mini for cost efficiency
      messages=[
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": "Extract all text from this image. If it's a menu, list all items with prices. If it's a document, extract all information. Be thorough and preserve the structure."
            },
            {
              "type": "image_url",
              "image_url": {
                "url": f"data:image/jpeg;base64,{base64_image}"
              }
            }
          ]
        }
      ],
      max_tokens=1000
    )

    extracted_text = response.choices[0].message.content
    return f"Image content from {filename}:\n{extracted_text}"
  except Exception as e:
    print(f"Vision processing failed: {e}")
    return f"Image document: {filename} (vision processing failed)"


@app.post("/documents/process")
async def process_document(space_id: str, file: UploadFile = File(...)):
  """Process uploaded document and create embeddings"""
  if client is None:
    raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

  try:
    # Read file content
    content = await file.read()

    # Extract text based on file type
    if file.content_type == "application/pdf":
      text = extract_text_from_pdf(content)
    elif file.content_type.startswith("text/"):
      text = content.decode('utf-8')
    elif file.content_type.startswith("image/"):
      # Use GPT-4o vision to process images
      text = process_image_with_vision(content, file.filename)
    else:
      text = f"Document: {file.filename}"

    if not text.strip():
      raise HTTPException(status_code=400, detail="No text could be extracted from document")

    # Create embeddings for document chunks to increase recall during retrieval
    chunks = chunk_text(text, chunk_size=1200, overlap=200)
    original_chunk_count = len(chunks)
    if not chunks:
      chunks = [text]
      original_chunk_count = 1

    max_chunks = 50
    if len(chunks) > max_chunks:
      logger.warning(f"Document produced {len(chunks)} chunks; truncating to {max_chunks} for embedding")
      chunks = chunks[:max_chunks]

    emb = client.embeddings.create(model="text-embedding-3-small", input=chunks)

    with engine.begin() as conn:
      set_space(conn, space_id)
      for idx, chunk in enumerate(chunks):
        vec = emb.data[idx].embedding
        values = ",".join(str(x) for x in vec)
        query = f"""
          INSERT INTO "AiEmbedding" (id, "spaceId", "itemId", text, embedding)
          VALUES (gen_random_uuid()::text, :space_id, NULL, :doc_text, '[{values}]')
          """
        conn.execute(sql_text(query).bindparams(space_id=space_id, doc_text=chunk))

    # Extract key information for preview
    preview = text[:300] + "..." if len(text) > 300 else text

    # Detect document type and extract key entities
    document_analysis = analyze_document_content(text)

    return {
      "ok": True,
      "filename": file.filename,
      "extracted_text_length": len(text),
      "extracted_preview": preview,
      "chunk_count": len(chunks),
      "original_chunk_count": original_chunk_count,
      "document_type": document_analysis["type"],
      "key_entities": document_analysis["entities"],
      "message": f"Document '{file.filename}' processed into {len(chunks)} chunk(s) and embedded successfully"
    }

  except Exception as e:
    error_msg = str(e)
    if "insufficient_quota" in error_msg or "exceeded your current quota" in error_msg:
      raise HTTPException(status_code=402, detail="OpenAI API quota exceeded. Please check your billing.")
    raise HTTPException(status_code=500, detail=f"Failed to process document: {error_msg}")


class ConversationAnalysisRequest(BaseModel):
  space_id: str
  conversation: List[Dict[str, Any]]  # Array of {role: str, content: str, timestamp: str}
  space_context: Optional[Dict[str, Any]] = None

class TemplateCompilationRequest(BaseModel):
  description: str
  space_context: Optional[SpaceContext] = None

class TemplateCompilationResponse(BaseModel):
  valid: bool
  template: Optional[Dict[str, Any]] = None
  errors: Optional[List[str]] = None
  rawOutput: Optional[str] = None
  confidence: Optional[float] = None


class DesignerMessage(BaseModel):
  role: Literal['user', 'assistant', 'system']
  content: str


class DesignerGraphNode(BaseModel):
  id: str
  label: str
  type: Literal['identity', 'state', 'slot', 'policy', 'signal', 'automation']
  description: Optional[str] = None
  meta: Optional[Dict[str, Any]] = None


class DesignerGraphEdge(BaseModel):
  id: str
  source: str
  target: str
  label: Optional[str] = None
  meta: Optional[Dict[str, Any]] = None


class DesignerTurnRequest(BaseModel):
  space_id: Optional[str] = None
  history: List[DesignerMessage] = Field(default_factory=list)
  notes: Optional[Dict[str, Any]] = None
  graph: Optional[Dict[str, Any]] = None


class DesignerTurnResponse(BaseModel):
  reply: str
  summary: Optional[str] = None
  notes: Dict[str, Any] = Field(default_factory=dict)
  graph: Dict[str, Any] = Field(default_factory=dict)
  ready: bool = False
  followUps: List[str] = Field(default_factory=list)


async def fallback_llm_compilation(request: TemplateCompilationRequest, system_prompt: str) -> TemplateCompilationResponse:
  """Fallback LLM generation without Guardrails"""
  logger.info("Using direct LLM generation fallback...")
  try:
    completion = client.chat.completions.create(
      model="gpt-4o-mini",
      messages=[
        {"role": "system", "content": system_prompt + "\n\nRespond with valid JSON matching the CoordinationTemplate schema."},
        {"role": "user", "content": f"Create a coordination template for: {request.description}"}
      ],
      temperature=0.3,
      max_tokens=2000
    )

    raw_output = completion.choices[0].message.content
    logger.info("Direct LLM generation completed")

    # Try to parse and validate the JSON output
    try:
      # Clean the output first - remove any markdown code blocks
      cleaned_output = raw_output
      if "```json" in cleaned_output:
        cleaned_output = cleaned_output.split("```json")[1].split("```")[0]
      elif "```" in cleaned_output:
        cleaned_output = cleaned_output.split("```")[1].split("```")[0]

      # Extract JSON from the response using greedy match to get full JSON
      json_match = re.search(r'\{.*\}', cleaned_output, re.DOTALL)
      if not json_match:
        # If no JSON found, try the original output
        json_match = re.search(r'\{.*\}', raw_output, re.DOTALL)

      if json_match:
        template_json = json.loads(json_match.group())
        normalized_template = normalize_compiled_template(template_json)

        # Validate with Pydantic model
        validated_template = CoordinationTemplateModel(**normalized_template)
        template_data = validated_template.model_dump()

        logger.info("Direct LLM output validated successfully")
        return TemplateCompilationResponse(
          valid=True,
          template=template_data,
          confidence=0.7,
          rawOutput=raw_output
        )
      else:
        logger.warning("No JSON found in LLM response")
        return TemplateCompilationResponse(
          valid=False,
          errors=["No valid JSON template found in response"],
          rawOutput=raw_output,
          confidence=0.2
        )

    except (json.JSONDecodeError, ValueError) as parse_error:
      logger.error(f"Failed to parse LLM output: {parse_error}")
      return TemplateCompilationResponse(
        valid=False,
        errors=[f"Invalid JSON in response: {str(parse_error)}"],
        rawOutput=raw_output,
        confidence=0.1
      )

  except Exception as fallback_error:
    logger.error(f"Fallback LLM generation failed: {fallback_error}")
    raise HTTPException(status_code=500, detail=f"Template compilation failed: {str(fallback_error)}")


def merge_entity_lists(existing: Any, incoming: Any, key: str = 'id') -> List[Dict[str, Any]]:
  existing_list = existing if isinstance(existing, list) else []
  incoming_list = incoming if isinstance(incoming, list) else []
  merged: Dict[str, Dict[str, Any]] = {}

  for item in existing_list:
    if isinstance(item, dict) and key in item:
      merged[str(item[key])] = item

  for item in incoming_list:
    if isinstance(item, dict) and key in item:
      merged[str(item[key])] = item

  return list(merged.values())


def merge_notes(existing: Optional[Dict[str, Any]], incoming: Optional[Dict[str, Any]]) -> Dict[str, Any]:
  base: Dict[str, Any] = existing.copy() if isinstance(existing, dict) else {}
  updates = incoming or {}

  for key, value in updates.items():
    if value in (None, '', [], {}):
      continue
    if isinstance(value, list):
      base[key] = merge_entity_lists(base.get(key), value)
    elif isinstance(value, dict):
      nested_existing = base.get(key) if isinstance(base.get(key), dict) else {}
      merged_nested = merge_notes(nested_existing, value)
      base[key] = merged_nested
    else:
      base[key] = value

  return base


def merge_graph(existing: Optional[Dict[str, Any]], incoming: Optional[Dict[str, Any]]) -> Dict[str, Any]:
  existing_graph = existing if isinstance(existing, dict) else {}
  incoming_graph = incoming if isinstance(incoming, dict) else {}

  nodes = merge_entity_lists(existing_graph.get('nodes'), incoming_graph.get('nodes'))
  edges = merge_entity_lists(existing_graph.get('edges'), incoming_graph.get('edges'))

  graph: Dict[str, Any] = {
    'nodes': nodes,
    'edges': edges,
  }

  # Preserve any other metadata keys from incoming graph
  for key, value in incoming_graph.items():
    if key not in graph:
      graph[key] = value

  return graph


def build_designer_system_prompt(existing_notes: Optional[Dict[str, Any]], existing_graph: Optional[Dict[str, Any]]) -> str:
  notes_json = json.dumps(existing_notes or {}, ensure_ascii=False, indent=2)
  graph_json = json.dumps(existing_graph or {}, ensure_ascii=False, indent=2)

  schema_description = (
    '{\n'
    '  "reply": "Assistant response in natural language",\n'
    '  "summary": "Concise blueprint summary for compilation",\n'
    '  "notes": {\n'
    '    "goal": "string",\n'
    '    "identities": [{"id": "string", "name": "string", "persona": "optional", "description": "optional"}],\n'
    '    "states": [{"id": "string", "name": "string", "category": "express|explore|commit|evidence|confirm|other", "description": "optional"}],\n'
    '    "guardrails": [{"id": "string", "rule": "string", "trigger": "optional"}],\n'
    '    "signals": [{"id": "string", "name": "string", "type": "optional", "description": "optional"}],\n'
    '    "automations": [{"id": "string", "name": "string", "mode": "suggest|assist|auto", "description": "optional"}],\n'
    '    "success": "string"\n'
    '  },\n'
    '  "graph": {\n'
    '    "nodes": [{"id": "string", "label": "string", "type": "identity|state|slot|policy|signal|automation", "description": "optional", "meta": { }}],\n'
    '    "edges": [{"id": "string", "source": "string", "target": "string", "label": "optional"}]\n'
    '  },\n'
    '  "ready": true or false,\n'
    '  "followUps": ["string"]\n'
    '}'
  )

  return (
    "You are Rouh Studio's blueprint designer. Collaborate with the user to model a coordination blueprint. "
    "Maintain context, ask clarifying questions only when necessary, and translate their plain language "
    "into structured coordination notes and a graph of identities, states, and supporting elements.\n\n"
    "Existing structured notes (JSON):\n"
    f"{notes_json}\n\n"
    "Existing graph (JSON):\n"
    f"{graph_json}\n\n"
    "Respond strictly with a single JSON object following this schema:\n"
    f"{schema_description}\n\n"
    "Guidelines:\n"
    "- Update fields incrementally; preserve useful information that already exists.\n"
    "- Always include the latest summary reflecting the current blueprint.\n"
    "- Generate stable IDs using lowercase slug-like tokens (e.g., therapy_session, warmup_checkin).\n"
    "- In the graph, reuse node IDs for existing entities to avoid duplicates.\n"
    "- Add edges to illustrate progression between states or key relationships.\n"
    "- Set ready=true only when the blueprint has a clear goal, participants, at least two states, and success criteria.\n"
    "- Use followUps to list the next helpful questions if the design is not ready.\n"
    "- Never include markdown code fences or explanatory text outside the JSON object."
  )


async def generate_designer_turn(request: DesignerTurnRequest) -> DesignerTurnResponse:
  if not client:
    raise HTTPException(status_code=503, detail="OpenAI client not initialized")

  try:
    existing_notes = request.notes or {}
    existing_graph = request.graph or {}

    system_prompt = build_designer_system_prompt(existing_notes, existing_graph)

    chat_messages: List[Dict[str, str]] = [
      {"role": "system", "content": system_prompt}
    ]

    if request.history:
      for message in request.history:
        role = message.role if message.role in ('user', 'assistant') else 'user'
        chat_messages.append({"role": role, "content": message.content})
    else:
      chat_messages.append({
        "role": "user",
        "content": "We're starting a new blueprint design session. Greet the user and ask them to describe the coordination they need."
      })

    completion = client.chat.completions.create(
      model="gpt-4o-mini",
      messages=chat_messages,
      temperature=0.4,
      max_tokens=1600
    )

    raw_output = completion.choices[0].message.content.strip()

    cleaned_output = raw_output
    if cleaned_output and cleaned_output.startswith("```"):
      cleaned_output = cleaned_output.split('```', 2)[1] if '```' in cleaned_output else cleaned_output

    json_match = re.search(r'\{.*\}', cleaned_output, re.DOTALL) if cleaned_output else None
    if not json_match and raw_output:
      json_match = re.search(r'\{.*\}', raw_output, re.DOTALL)

    if not json_match:
      logger.warning('No JSON payload returned by LLM; falling back to plain-text reply')
      fallback_reply = raw_output or "I'm still processing your request—could you share more detail?"
      fallback_summary = existing_notes.get('summary') or existing_notes.get('goal')
      return DesignerTurnResponse(
        reply=fallback_reply,
        summary=fallback_summary,
        notes=existing_notes,
        graph=merge_graph(existing_graph, None),
        ready=False,
        followUps=[
          'Could you restate the coordination goal with more detail so I can structure it?',
        ] if request.history else []
      )

    payload = json.loads(json_match.group())

    merged_notes = merge_notes(existing_notes, payload.get('notes'))
    merged_graph = merge_graph(existing_graph, payload.get('graph'))

    reply_text = payload.get('reply') or "I'm still processing your request. Could you share more about what you need coordinated?"
    summary_text = payload.get('summary') or merged_notes.get('summary') or merged_notes.get('goal')
    ready_flag = bool(payload.get('ready', False))
    follow_ups = payload.get('followUps') if isinstance(payload.get('followUps'), list) else []

    return DesignerTurnResponse(
      reply=reply_text,
      summary=summary_text,
      notes=merged_notes,
      graph=merged_graph,
      ready=ready_flag,
      followUps=follow_ups
    )

  except HTTPException:
    raise
  except Exception as error:
    logger.error(f"Designer turn generation failed: {error}")
    raise HTTPException(status_code=500, detail=f"Designer turn failed: {error}")

@app.post("/analyze-training")
async def analyze_training_conversation(request: ConversationAnalysisRequest):
  """
  Analyze a conversation thread to extract intelligent training patterns.
  Uses GPT-4 to understand what correction was made and how to generalize it.
  """
  if not client:
    raise HTTPException(status_code=503, detail="OpenAI client not initialized")

  try:
    # Validate request data
    if not request.conversation or len(request.conversation) < 2:
      return {
        "analysis": {
          "correction_detected": False,
          "error_type": "insufficient_data",
          "scenario_category": "other",
          "incorrect_pattern": "Not enough conversation data",
          "correct_pattern": "Provide more conversation context",
          "general_principle": "Need at least 2 messages for analysis",
          "similar_queries": [],
          "response_template": "",
          "confidence": 0.0
        },
        "conversation_length": len(request.conversation),
        "space_id": request.space_id
      }

    # Build analysis prompt
    conversation_text = ""
    for i, msg in enumerate(request.conversation):
      try:
        role_label = "Customer" if msg.get("role") == "user" else "Assistant"
        content = msg.get("content", "").strip()
        if content:
          conversation_text += f"{role_label}: {content[:1000]}\n"  # Limit message length
      except Exception as e:
        logger.warning(f"Failed to process message {i}: {e}")
        continue

    space_info = ""
    if request.space_context:
      space_info = f"""
Business Context:
- Name: {request.space_context.get('space', {}).get('name', 'Unknown')}
- Type: {request.space_context.get('space', {}).get('category', 'Unknown')}
- Services: {', '.join(request.space_context.get('profile', {}).get('services', []))}
"""

    analysis_prompt = f"""You are an AI training analyst. A business owner just corrected their AI assistant in a training conversation.

{space_info}

Here's the conversation:
{conversation_text}

Analyze this conversation and extract actionable knowledge the assistant must remember. Focus only on what the **owner** says (ignore the assistant's reply). Identify:
1. Any correction or new factual information provided
2. The behavior change the assistant should adopt next time
3. Whether this is a fact, a behavior guideline, or a workflow
4. A concise principle the assistant must follow going forward (imperative tone)
5. Similar customer queries where this principle applies

Important:
- "general_principle" must reflect the owner's guidance, not the assistant's wording.
- Never quote or paraphrase the assistant's reply.
- If no actionable owner instruction exists, set "correction_detected" to false and leave the other fields empty or neutral.


Return a JSON object with this structure:
{{
  "correction_detected": true/false,
  "knowledge_type": "fact|behavior|workflow",
  "knowledge_title": "short descriptive title (<= 10 words)",
  "error_type": "factual_error|tone_issue|policy_violation|missing_information|other",
  "scenario_category": "delivery|hours|pricing|booking|contact|menu|services|other",
  "incorrect_pattern": "description of what was wrong",
  "correct_pattern": "description of correct behavior",
  "general_principle": "imperative rule derived from the owner's correction",
  "similar_queries": ["example query 1", "example query 2", "example query 3"],
  "response_template": "template for similar future responses",
  "confidence": 0.0-1.0
}}

Produce strictly valid JSON and do not include any commentary outside the JSON payload."""

    completion = client.chat.completions.create(
      model="gpt-4o-mini",
      messages=[
        {"role": "system", "content": "You are an expert at analyzing customer service conversations and extracting training patterns. Always respond with valid JSON."},
        {"role": "user", "content": analysis_prompt}
      ],
      temperature=0.1,
      max_tokens=800
    )

    # Parse the response
    analysis_text = completion.choices[0].message.content.strip()

    # Try to extract JSON from the response
    import re
    json_match = re.search(r'\{.*\}', analysis_text, re.DOTALL)
    if json_match:
      analysis = json.loads(json_match.group())
    else:
      # Fallback if no JSON found
      analysis = {
        "correction_detected": False,
        "error_type": "other",
        "scenario_category": "other",
        "incorrect_pattern": "Unable to parse correction",
        "correct_pattern": "Unable to determine",
        "general_principle": "Follow user guidance",
        "similar_queries": [],
        "response_template": "",
        "confidence": 0.3
      }

    return {
      "analysis": analysis,
      "conversation_length": len(request.conversation),
      "space_id": request.space_id
    }

  except Exception as e:
    error_msg = str(e)
    if "insufficient_quota" in error_msg or "exceeded your current quota" in error_msg:
      raise HTTPException(status_code=402, detail="OpenAI API quota exceeded. Please check your billing.")
    raise HTTPException(status_code=500, detail=f"Failed to analyze training conversation: {error_msg}")


@app.post("/designer/turn")
async def designer_turn(request: DesignerTurnRequest):
  """Proxy a conversational turn for the blueprint designer."""
  return await generate_designer_turn(request)

@app.post("/compile-template", response_model=TemplateCompilationResponse)
async def compile_template(request: TemplateCompilationRequest):
  """Compile a coordination template from natural language description using Guardrails"""
  if not client:
    raise HTTPException(status_code=500, detail="OpenAI API key not configured")

  try:
    logger.info(f"Starting template compilation for description: {request.description[:100]}...")

    # Build context-aware system prompt
    business_context = ""
    if request.space_context:
      space = request.space_context.space
      profile = request.space_context.profile
      business_name = profile.businessName if profile else space.name
      business_type = space.category or "business"

      business_context = f"""
Business Context:
- Name: {business_name}
- Type: {business_type}
- Description: {space.description or "No description provided"}
"""

    # Create comprehensive system prompt for template generation
    system_prompt = f"""You are an expert at creating coordination templates for collaborative processes. Your task is to convert natural language descriptions into structured coordination templates that follow the 5-state pattern: Express → Explore → Commit → Evidence → Confirm.

{business_context}

COORDINATION PATTERN EXPLANATION:
1. EXPRESS: Participants express their needs, proposals, or requirements
2. EXPLORE: Participants explore options, negotiate terms, and discuss details
3. COMMIT: Participants make firm commitments and agreements
4. EVIDENCE: Participants provide proof, deliverables, or evidence of completion
5. CONFIRM: Participants confirm satisfaction and close the coordination

TEMPLATE STRUCTURE REQUIREMENTS:
- Template must have a clear name and description
- Each coordination phase can be enabled/disabled with custom descriptions and timeouts
- Roles define who can participate with specific capabilities and constraints
- States define the workflow steps with transitions and requirements
- Slots define data fields that participants fill during the process

EXAMPLE SCENARIOS:
- Service Request: Customer expresses need → Explore providers → Commit to agreement → Provider shows evidence → Customer confirms
- Group Purchase: Organizer expresses opportunity → Explore interest → Commit to buy → Receive evidence → Confirm delivery
- Event Planning: Host expresses event idea → Explore details → Commit to plan → Execute event → Confirm success

Generate a complete, realistic template based on the user's description. Make it specific to their needs while following coordination best practices."""

    # Try Guardrails first if available
    if GUARDRAILS_AVAILABLE:
      try:
        guard = gd.Guard.from_pydantic(
          output_class=CoordinationTemplateModel,
          prompt=system_prompt,
          num_reasks=3
        )
        logger.info("Guardrails guard created successfully")

        # Generate template with Guardrails validation
        logger.info("Starting LLM generation with Guardrails validation...")
        result = guard(
          llm_api=client.chat.completions.create,
          prompt_params={},
          model="gpt-4o-mini",
          max_tokens=2000,
          temperature=0.3,
          messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Create a coordination template for: {request.description}"}
          ]
        )

        logger.info("Guardrails generation completed")

        # Extract validated output
        if result.validation_passed:
          template_data = result.validated_output.model_dump() if hasattr(result.validated_output, 'model_dump') else result.validated_output
          logger.info("Template validation passed")

          return TemplateCompilationResponse(
            valid=True,
            template=template_data,
            confidence=0.9,
            rawOutput=str(result.raw_llm_output) if hasattr(result, 'raw_llm_output') else None
          )
        else:
          error_messages = []
          if hasattr(result, 'error') and result.error:
            error_messages.append(str(result.error))
          if hasattr(result, 'validation_history'):
            for validation in result.validation_history:
              if hasattr(validation, 'error_message'):
                error_messages.append(validation.error_message)

          logger.warning(f"Guardrails validation failed, falling back to direct LLM: {error_messages}")
          # Fall through to fallback

      except Exception as guard_error:
        logger.error(f"Guardrails execution failed, falling back to direct LLM: {guard_error}")
        # Fall through to fallback

    # Use fallback LLM for both "Guardrails not available" and "Guardrails failed" cases
    return await fallback_llm_compilation(request, system_prompt)

  except HTTPException:
    raise
  except Exception as e:
    error_msg = str(e)
    logger.error(f"Template compilation error: {error_msg}")

    if "insufficient_quota" in error_msg or "exceeded your current quota" in error_msg:
      raise HTTPException(status_code=402, detail="OpenAI API quota exceeded. Please check your billing.")
    raise HTTPException(status_code=500, detail=f"Template compilation failed: {error_msg}")
