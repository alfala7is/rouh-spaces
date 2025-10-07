// Coordination-specific type definitions
// These types should match the DTOs from the backend API

export interface CoordinationRunDto {
  id: string;
  currentState: 'Express_Need' | 'Explore_Options' | 'Commit' | 'Evidence' | 'Confirm';
  participants: ParticipantContextDto[];
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  slotData?: Record<string, any>;
  stateHistory?: CoordinationStateHistoryEntry[];
}

export interface ParticipantContextDto {
  id: string;
  email?: string;
  name?: string;
  role: string; // 'requester' | 'provider' | 'organizer' | 'observer'
  isOnline?: boolean;
  lastActivity?: string;
  permissions?: Record<string, boolean>;

  // Permission flags for easy access
  canViewParticipants?: boolean;
  canManageParticipants?: boolean;
  canExpressNeeds?: boolean;
  canViewOptions?: boolean;
  canCommit?: boolean;
  canUploadEvidence?: boolean;
  canConfirm?: boolean;
  canViewMessages?: boolean;
  canSendMessages?: boolean;
}

export interface CoordinationMessageDto {
  id: string;
  runId: string;
  content: string;
  messageType: 'user' | 'system' | 'state_transition' | 'evidence' | 'commitment';
  timestamp: string;
  sender: ParticipantContextDto | null;
  metadata: Record<string, any>;

  // Optional fields for specific message types
  evidence?: {
    files: Array<{
      name: string;
      size: number;
      url?: string;
      type?: string;
    }>;
    description?: string;
    status?: 'pending' | 'approved' | 'rejected';
  };

  commitment?: {
    terms: string;
    deadline?: string;
    deposit?: number;
    status?: 'pending' | 'confirmed' | 'cancelled';
  };

  stateTransition?: {
    fromState: string;
    toState: string;
    transitionData?: Record<string, any>;
  };
}

export interface CoordinationStateHistoryEntry {
  state: string;
  enteredAt: string;
  exitedAt?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface CoordinationAdvanceRequest {
  message?: string;
  messageType?: string;
  senderContext?: ParticipantContextDto | null;
  stateTransitionData?: Record<string, any>;
  slotData?: Record<string, any>;
}

export interface CoordinationEvidenceUpload {
  files: File[];
  description?: string;
  participantContext?: ParticipantContextDto;
}

export interface CoordinationCommitment {
  terms: string;
  deadline?: string;
  deposit?: number;
  participantContext?: ParticipantContextDto;
}

export interface CoordinationCompletion {
  satisfied: boolean;
  feedback?: string;
  rating?: number;
  participantContext?: ParticipantContextDto;
}

export interface MagicLinkValidationResponse {
  participantContext: ParticipantContextDto;
  runData: CoordinationRunDto;
  isValid: boolean;
  expiresAt?: string;
}

export interface AddParticipantRequest {
  email: string;
  role: string;
  permissions?: Record<string, boolean>;
}

export interface AddParticipantResponse {
  participant: ParticipantContextDto;
  magicLink: string;
  expiresAt: string;
}

export interface UpdateParticipantRequest {
  permissions?: Record<string, boolean>;
  role?: string;
}

export interface GenerateMagicLinkRequest {
  expirationHours?: number;
}

export interface GenerateMagicLinkResponse {
  magicLink: string;
  expiresAt: string;
}

// WebSocket event types for coordination
export interface CoordinationSocketEvents {
  'coordination.state.changed': CoordinationStateChangedEvent;
  'coordination.participant.joined': CoordinationParticipantJoinedEvent;
  'coordination.participant.left': CoordinationParticipantLeftEvent;
  'coordination.message': CoordinationMessageDto;
  'coordination.evidence.uploaded': CoordinationEvidenceUploadedEvent;
  'coordination.commitment.made': CoordinationCommitmentMadeEvent;
  'coordination.completed': CoordinationCompletedEvent;
  'coordination.error': CoordinationErrorEvent;
}

export interface CoordinationStateChangedEvent {
  runId: string;
  previousState: string;
  newState: string;
  data?: any;
  timestamp: string;
  triggeredBy?: string;
}

export interface CoordinationParticipantJoinedEvent {
  runId: string;
  participant: ParticipantContextDto;
  timestamp: string;
}

export interface CoordinationParticipantLeftEvent {
  runId: string;
  participantId: string;
  timestamp: string;
}

export interface CoordinationEvidenceUploadedEvent {
  runId: string;
  evidence: {
    files: Array<{
      name: string;
      size: number;
      url?: string;
    }>;
    description?: string;
  };
  uploadedBy: string;
  timestamp: string;
}

export interface CoordinationCommitmentMadeEvent {
  runId: string;
  commitment: {
    terms: string;
    deadline?: string;
    deposit?: number;
  };
  madeBy: string;
  timestamp: string;
}

export interface CoordinationCompletedEvent {
  runId: string;
  completedBy: string;
  timestamp: string;
  rating?: number;
  feedback?: string;
}

export interface CoordinationErrorEvent {
  runId: string;
  message: string;
  code?: string;
  participantId?: string;
}

// Utility types for coordination state management
export type CoordinationState = 'Express_Need' | 'Explore_Options' | 'Commit' | 'Evidence' | 'Confirm';

export type ParticipantRole = 'requester' | 'provider' | 'organizer' | 'observer';

export type MessageType = 'user' | 'system' | 'state_transition' | 'evidence' | 'commitment';

// Component prop types
export interface CoordinationChatProps {
  runData: CoordinationRunDto;
  participantContext: ParticipantContextDto | null;
}

export interface StateProgressBarProps {
  currentState: CoordinationState;
  participantRole: string | null;
  runData: CoordinationRunDto;
}

export interface ParticipantListProps {
  participants: ParticipantContextDto[];
  currentUser: ParticipantContextDto | null;
  runData: CoordinationRunDto;
}

export interface CoordinationMessageProps {
  message: CoordinationMessageDto;
  currentUser: ParticipantContextDto | null;
  currentState: string;
}

// API response wrapper types
export interface CoordinationApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CoordinationMessagesResponse {
  messages: CoordinationMessageDto[];
  totalCount: number;
  hasMore: boolean;
}

export interface CoordinationStateHistoryResponse {
  history: CoordinationStateHistoryEntry[];
  currentState: CoordinationState;
  totalStates: number;
}

// Error types for coordination
export interface CoordinationError extends Error {
  code?: string;
  runId?: string;
  participantId?: string;
  state?: string;
}

export class CoordinationPermissionError extends Error {
  constructor(message: string, public participantRole: string, public requiredPermission: string) {
    super(message);
    this.name = 'CoordinationPermissionError';
  }
}

export class CoordinationStateError extends Error {
  constructor(message: string, public currentState: string, public attemptedAction: string) {
    super(message);
    this.name = 'CoordinationStateError';
  }
}

// Utility type guards
export function isCoordinationMessage(obj: any): obj is CoordinationMessageDto {
  return obj && typeof obj.id === 'string' && typeof obj.runId === 'string' && typeof obj.content === 'string';
}

export function isParticipantContext(obj: any): obj is ParticipantContextDto {
  return obj && typeof obj.id === 'string' && typeof obj.role === 'string';
}

export function isCoordinationRun(obj: any): obj is CoordinationRunDto {
  return obj && typeof obj.id === 'string' && typeof obj.currentState === 'string';
}

// Constants for coordination
export const COORDINATION_STATES: readonly CoordinationState[] = [
  'Express_Need',
  'Explore_Options',
  'Commit',
  'Evidence',
  'Confirm'
] as const;

export const PARTICIPANT_ROLES: readonly ParticipantRole[] = [
  'requester',
  'provider',
  'organizer',
  'observer'
] as const;

export const MESSAGE_TYPES: readonly MessageType[] = [
  'user',
  'system',
  'state_transition',
  'evidence',
  'commitment'
] as const;

// Default permissions by role
export const DEFAULT_ROLE_PERMISSIONS: Record<ParticipantRole, Record<string, boolean>> = {
  requester: {
    canViewParticipants: true,
    canManageParticipants: false,
    canExpressNeeds: true,
    canViewOptions: true,
    canCommit: true,
    canUploadEvidence: false,
    canConfirm: true,
    canViewMessages: true,
    canSendMessages: true,
  },
  provider: {
    canViewParticipants: true,
    canManageParticipants: false,
    canExpressNeeds: false,
    canViewOptions: true,
    canCommit: true,
    canUploadEvidence: true,
    canConfirm: false,
    canViewMessages: true,
    canSendMessages: true,
  },
  organizer: {
    canViewParticipants: true,
    canManageParticipants: true,
    canExpressNeeds: true,
    canViewOptions: true,
    canCommit: true,
    canUploadEvidence: true,
    canConfirm: true,
    canViewMessages: true,
    canSendMessages: true,
  },
  observer: {
    canViewParticipants: true,
    canManageParticipants: false,
    canExpressNeeds: false,
    canViewOptions: true,
    canCommit: false,
    canUploadEvidence: false,
    canConfirm: false,
    canViewMessages: true,
    canSendMessages: false,
  },
};