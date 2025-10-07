"""
Enhanced Template Models for Coordination Templates

This module defines comprehensive Pydantic models for coordination templates with
advanced validation, business rules, and documentation to ensure data integrity
and provide clear API contracts.

Version: 2.0 Enhanced
Author: Rouh AI System
"""

from typing import Any, Dict, List, Optional, Union, Literal
from pydantic import BaseModel, Field, field_validator, model_validator
from enum import Enum
import re
from datetime import datetime

def get_field_value(info, field_name: str, default=None):
    """Safely get field value from validation context."""
    if hasattr(info, 'data') and isinstance(info.data, dict):
        return info.data.get(field_name, default)
    return default

class CoordinationStateType(str, Enum):
    """
    Enumeration of coordination state types following the 5-phase pattern.

    Each state type represents a distinct phase in the coordination lifecycle:
    - collect: Gathering initial requirements and expressions
    - negotiate: Discussion and refinement of proposals
    - commit: Formal agreements and commitments
    - evidence: Proof of work or completion
    - signoff: Final validation and closure
    """
    collect = "collect"
    negotiate = "negotiate"
    commit = "commit"
    evidence = "evidence"
    signoff = "signoff"

class SlotType(str, Enum):
    """
    Data field types supported in coordination templates.

    These types define how data is collected, validated, and displayed
    throughout the coordination process.
    """
    text = "text"              # Free-form text input
    number = "number"          # Numeric values (integer or float)
    date = "date"             # Date/datetime values
    file = "file"             # File uploads and attachments
    location = "location"     # Geographic locations
    currency = "currency"     # Monetary amounts with currency
    boolean = "boolean"       # True/false values
    select = "select"         # Single-choice from predefined options
    multiselect = "multiselect"  # Multiple-choice from predefined options
    email = "email"           # Email addresses
    phone = "phone"           # Phone numbers
    url = "url"               # Web URLs
    json = "json"             # Structured JSON data

class ProcessComplexity(str, Enum):
    """Template complexity levels for optimization and user guidance."""
    simple = "simple"         # 2-3 states, 2-3 participants
    moderate = "moderate"     # 4-5 states, 3-5 participants
    complex = "complex"       # 6+ states, 5+ participants
    enterprise = "enterprise" # Complex with advanced features

class TemplateCategory(str, Enum):
    """Business category classifications for templates."""
    general = "general"
    service_request = "service_request"
    approval_workflow = "approval_workflow"
    event_coordination = "event_coordination"
    group_purchase = "group_purchase"
    project_management = "project_management"
    content_review = "content_review"
    booking_reservation = "booking_reservation"
    supply_chain = "supply_chain"
    customer_support = "customer_support"

class CoordinationPhaseModel(BaseModel):
    enabled: bool = True
    description: Optional[str] = None
    timeout: Optional[int] = None

class CoordinationCommitModel(CoordinationPhaseModel):
    requireDeposit: bool = False

class CoordinationEvidenceModel(CoordinationPhaseModel):
    requireProof: bool = True

class CoordinationConfirmModel(CoordinationPhaseModel):
    autoComplete: bool = False

class CoordinationPatternModel(BaseModel):
    express: CoordinationPhaseModel
    explore: CoordinationPhaseModel
    commit: CoordinationCommitModel
    evidence: CoordinationEvidenceModel
    confirm: CoordinationConfirmModel

class TemplateRoleModel(BaseModel):
    """
    Defines a participant role within a coordination template.

    Roles specify who can participate in different phases of coordination,
    their capabilities, and any constraints on their participation.
    """
    name: str = Field(..., min_length=1, max_length=50,
                     description="Unique role identifier (e.g., 'requester', 'approver')")
    description: Optional[str] = Field(None, max_length=200,
                                     description="Human-readable role description")
    minParticipants: int = Field(default=1, ge=0, le=100,
                               description="Minimum required participants for this role")
    maxParticipants: Optional[int] = Field(None, ge=1, le=1000,
                                         description="Maximum allowed participants (None = unlimited)")
    capabilities: List[str] = Field(default_factory=list,
                                  description="List of capabilities this role possesses")
    constraints: Optional[Dict[str, Any]] = Field(None,
                                                description="Role-specific validation constraints")

    @field_validator('name')
    @classmethod
    def validate_role_name(cls, v):
        """Ensure role name follows naming conventions."""
        if not re.match(r'^[a-z][a-z0-9_]*$', v):
            raise ValueError('Role name must be lowercase alphanumeric with underscores')
        return v

    @field_validator('maxParticipants')
    @classmethod
    def validate_max_participants(cls, v, info):
        """Ensure maximum participants is greater than or equal to minimum."""
        if v is not None:
            min_participants = get_field_value(info, 'minParticipants', 1)
            if v < min_participants:
                raise ValueError('maxParticipants must be >= minParticipants')
        return v

    @field_validator('capabilities')
    @classmethod
    def validate_capabilities(cls, v):
        """Validate capability names and remove duplicates."""
        valid_capabilities = {
            'create', 'read', 'update', 'delete', 'approve', 'reject',
            'upload', 'comment', 'assign', 'review', 'complete', 'archive'
        }
        for capability in v:
            if capability not in valid_capabilities:
                raise ValueError(f'Unknown capability: {capability}')
        # Remove duplicates while preserving order
        seen = set()
        result = []
        for item in v:
            if item not in seen:
                seen.add(item)
                result.append(item)
        return result

class TemplateStateModel(BaseModel):
    """
    Represents a single state in the coordination workflow.

    Each state defines a phase of work, who can participate,
    what data is required, and how to transition to other states.
    """
    name: str = Field(..., min_length=1, max_length=100,
                     description="Unique state identifier")
    type: CoordinationStateType = Field(..., description="State type from coordination pattern")
    description: Optional[str] = Field(None, max_length=300,
                                     description="Human-readable state description")
    sequence: Optional[int] = Field(None, ge=0, le=100,
                                  description="Order in workflow (0 = start state)")
    requiredSlots: List[str] = Field(default_factory=list,
                                   description="Data slots required in this state")
    allowedRoles: List[str] = Field(default_factory=list,
                                  description="Roles permitted to act in this state")
    transitions: Dict[str, Any] = Field(default_factory=dict,
                                      description="Valid transitions to other states")
    timeoutMinutes: Optional[int] = Field(None, gt=0, le=43200,  # Max 30 days
                                        description="Auto-transition timeout in minutes")
    uiHints: Optional[Dict[str, Any]] = Field(None,
                                            description="UI rendering hints and preferences")

    @field_validator('name')
    @classmethod
    def validate_state_name(cls, v):
        """Ensure state name follows naming conventions."""
        if not re.match(r'^[a-z][a-z0-9_-]*$', v):
            raise ValueError('State name must be lowercase alphanumeric with hyphens/underscores')
        return v

    @field_validator('transitions')
    @classmethod
    def validate_transitions(cls, v):
        """Validate transition definitions."""
        valid_conditions = {'always', 'approved', 'rejected', 'timeout', 'manual'}
        for condition, target_states in v.items():
            if condition not in valid_conditions:
                raise ValueError(f'Invalid transition condition: {condition}')
            if not isinstance(target_states, (str, list)):
                raise ValueError('Transition targets must be string or list of strings')
        return v

class TemplateSlotModel(BaseModel):
    """
    Defines a data field within a coordination template.

    Slots represent structured data that participants provide
    throughout the coordination process.
    """
    name: str = Field(..., min_length=1, max_length=50,
                     description="Unique slot identifier")
    type: SlotType = Field(..., description="Data type for validation and UI rendering")
    description: Optional[str] = Field(None, max_length=200,
                                     description="Human-readable field description")
    required: bool = Field(False, description="Whether this field must be provided")
    defaultValue: Optional[Any] = Field(None, description="Default value if not provided")
    validation: Optional[Dict[str, Any]] = Field(None,
                                               description="Type-specific validation rules")
    visibility: List[str] = Field(default_factory=list,
                                description="Roles that can view this slot")
    editable: List[str] = Field(default_factory=list,
                              description="Roles that can edit this slot")

    @field_validator('name')
    @classmethod
    def validate_slot_name(cls, v):
        """Ensure slot name follows naming conventions."""
        if not re.match(r'^[a-z][a-zA-Z0-9_]*$', v):
            raise ValueError('Slot name must start lowercase, use camelCase')
        return v

    @field_validator('validation')
    @classmethod
    def validate_validation_rules(cls, v, info):
        """Validate type-specific validation rules."""
        if v is None:
            return v

        slot_type = get_field_value(info, 'type')
        if slot_type == SlotType.text:
            allowed_keys = {'minLength', 'maxLength', 'pattern', 'format'}
        elif slot_type == SlotType.number:
            allowed_keys = {'min', 'max', 'step', 'precision'}
        elif slot_type == SlotType.date:
            allowed_keys = {'minDate', 'maxDate', 'format'}
        elif slot_type == SlotType.file:
            allowed_keys = {'maxSize', 'allowedTypes', 'maxFiles'}
        elif slot_type == SlotType.location:
            allowed_keys = {'precision', 'bounds'}
        elif slot_type == SlotType.currency:
            allowed_keys = {'min', 'max', 'currency', 'precision'}
        elif slot_type == SlotType.boolean:
            allowed_keys = {'defaultValue'}
        elif slot_type == SlotType.select:
            allowed_keys = {'options', 'allowOther'}
        elif slot_type == SlotType.multiselect:
            allowed_keys = {'options', 'minSelections', 'maxSelections'}
        elif slot_type == SlotType.email:
            allowed_keys = {'pattern', 'domain'}
        elif slot_type == SlotType.phone:
            allowed_keys = {'pattern', 'country'}
        elif slot_type == SlotType.url:
            allowed_keys = {'protocol', 'domain'}
        elif slot_type == SlotType.json:
            allowed_keys = {'schema', 'maxDepth'}
        else:
            # For unknown types, allow common validation keys to avoid breaking clients
            allowed_keys = {'minLength', 'maxLength', 'min', 'max', 'pattern', 'format', 'options'}

        invalid_keys = set(v.keys()) - allowed_keys
        if invalid_keys:
            raise ValueError(f'Invalid validation keys for {slot_type}: {invalid_keys}')

        return v

    @field_validator('defaultValue')
    @classmethod
    def validate_default_value(cls, v, info):
        """Ensure default value matches slot type."""
        if v is None:
            return v

        slot_type = get_field_value(info, 'type')
        if slot_type == SlotType.boolean and not isinstance(v, bool):
            raise ValueError('Boolean slot default must be true/false')
        elif slot_type == SlotType.number and not isinstance(v, (int, float)):
            raise ValueError('Number slot default must be numeric')
        elif slot_type == SlotType.email and '@' not in str(v):
            raise ValueError('Email slot default must be valid email format')

        return v

class CoordinationTemplateModel(BaseModel):
    """
    Complete coordination template specification.

    This is the root model that defines an entire coordination workflow,
    including all roles, states, data slots, and configuration.
    """
    name: str = Field(..., min_length=1, max_length=100,
                     description="Human-readable template name")
    description: str = Field(..., min_length=1, max_length=500,
                           description="Detailed template description and use case")
    version: str = Field(default="1.0", pattern=r'^\d+\.\d+(\.\d+)?$',
                        description="Semantic version (major.minor.patch)")
    isActive: Optional[bool] = Field(True, description="Whether template can be used")
    schemaJson: CoordinationPatternModel = Field(...,
                                                description="5-phase coordination pattern configuration")
    metadata: Optional[Dict[str, Any]] = Field(None,
                                             description="Additional template metadata")
    roles: List[TemplateRoleModel] = Field(..., min_items=1, max_items=20,
                                         description="Participant roles in this template")
    states: List[TemplateStateModel] = Field(..., min_items=1, max_items=50,
                                           description="Workflow states and transitions")
    slots: Optional[List[TemplateSlotModel]] = Field(None, max_items=100,
                                                   description="Data fields collected during coordination")
    category: TemplateCategory = Field(default=TemplateCategory.general,
                                     description="Business category for organization")
    complexity: ProcessComplexity = Field(default=ProcessComplexity.simple,
                                        description="Template complexity level")
    tags: List[str] = Field(default_factory=list, max_items=10,
                          description="Searchable tags for template discovery")
    estimatedDurationHours: Optional[int] = Field(None, gt=0, le=8760,  # Max 1 year
                                                 description="Expected completion time in hours")

    @field_validator('name')
    @classmethod
    def validate_template_name(cls, v):
        """Ensure template name is descriptive and follows conventions."""
        if len(v.split()) < 2:
            raise ValueError('Template name should contain at least 2 words')
        return v.strip()

    @field_validator('tags')
    @classmethod
    def validate_tags(cls, v):
        """Clean and validate template tags."""
        cleaned_tags = []
        for tag in v:
            tag = tag.strip().lower()
            if re.match(r'^[a-z0-9-]+$', tag) and len(tag) >= 2:
                cleaned_tags.append(tag)
        return list(set(cleaned_tags))  # Remove duplicates

    @model_validator(mode='after')
    def validate_template_consistency(self):
        """Cross-validate template components for consistency."""
        roles = self.roles
        states = self.states
        slots = self.slots or []

        # Collect all role names
        role_names = {role.name for role in roles}

        # Collect all slot names
        slot_names = {slot.name for slot in slots}

        # Validate state references
        for state in states:
            # Check that allowedRoles reference existing roles
            for role_ref in state.allowedRoles:
                if role_ref not in role_names:
                    raise ValueError(f'State {state.name} references unknown role: {role_ref}')

            # Check that requiredSlots reference existing slots
            for slot_ref in state.requiredSlots:
                if slot_ref not in slot_names:
                    raise ValueError(f'State {state.name} references unknown slot: {slot_ref}')

        # Validate slot visibility/editability references
        for slot in slots:
            for role_ref in slot.visibility + slot.editable:
                if role_ref not in role_names:
                    raise ValueError(f'Slot {slot.name} references unknown role: {role_ref}')

        # Validate sequence numbers are unique and consecutive
        sequences = [s.sequence for s in states if s.sequence is not None]
        if sequences:
            sequences.sort()
            if sequences != list(range(len(sequences))):
                raise ValueError('State sequences must be consecutive starting from 0')

        return self

    model_config = {
        "json_encoders": {
            datetime: lambda v: v.isoformat()
        },
        "json_schema_extra": {
            "example": {
                "name": "Service Request Approval",
                "description": "Multi-stage approval process for service requests with budget review",
                "version": "1.2.0",
                "category": "approval_workflow",
                "complexity": "moderate",
                "tags": ["approval", "service", "budget"],
                "estimatedDurationHours": 48
            }
        }
    }

