import { apiFetch } from './api';
import type { CoordinationRunDto, ParticipantContextDto, CoordinationMessageDto, CoordinationState, CoordinationApiResponse } from '@/types/coordination';

/**
 * Adapter function to map backend participant data to ParticipantContextDto
 */
function mapParticipantToDto(participant: any, permissions?: any): ParticipantContextDto {
  // Extract role name - prefer role.name when role is an object, fallback to roleName or role
  const role = participant.role?.name || participant.roleName || participant.role || participant.roleId;

  // Extract email - prefer top-level email, fallback to metadata.email
  const email = participant.email || participant.metadata?.email;

  // Extract name - prefer top-level name, fallback to metadata.name
  const name = participant.name || participant.metadata?.name;

  return {
    id: participant.id,
    email,
    name,
    role,
    isOnline: participant.isOnline,
    lastActivity: participant.lastActivity,
    permissions: permissions || participant.permissions || {},
    // Map permission flags from backend permissions
    canViewParticipants: Boolean(permissions?.canView || permissions?.canViewParticipants),
    canManageParticipants: Boolean(permissions?.canManage || permissions?.canManageParticipants),
    canExpressNeeds: Boolean(permissions?.canAdvanceState),
    canViewOptions: Boolean(permissions?.canView || permissions?.canViewStates),
    canCommit: Boolean(permissions?.canAdvanceState || permissions?.canProvideSlotData),
    canUploadEvidence: Boolean(permissions?.canProvideSlotData),
    canConfirm: Boolean(permissions?.canAdvanceState),
    canViewMessages: Boolean(permissions?.canView),
    canSendMessages: Boolean(permissions?.canAdvanceState),
  };
}

/**
 * Adapter function to map backend run data to CoordinationRunDto
 */
function mapRunToDto(run: any): CoordinationRunDto {
  return {
    id: run.id,
    currentState: mapStateToEnum(run.currentStateId || run.currentState),
    participants: run.participants?.map((p: any) => mapParticipantToDto(p)) || [],
    metadata: run.metadata || {},
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
    slotData: run.slotData,
    stateHistory: run.stateHistory || [],
  };
}

/**
 * Maps backend state ID/object to frontend CoordinationState enum
 */
function mapStateToEnum(backendState: any): CoordinationState {
  if (typeof backendState === 'string') {
    // Handle string state IDs or names
    const stateMap: Record<string, CoordinationState> = {
      'express_need': 'Express_Need',
      'explore_options': 'Explore_Options',
      'commit': 'Commit',
      'evidence': 'Evidence',
      'confirm': 'Confirm',
    };
    return stateMap[backendState.toLowerCase()] || 'Express_Need';
  }
  if (typeof backendState === 'object' && backendState?.name) {
    return mapStateToEnum(backendState.name);
  }
  return 'Express_Need'; // Default fallback
}

/**
 * Public helper to map state IDs from socket events to UI enum labels
 * Exported for use in components that need to normalize socket event data
 */
export function mapStateToEnumPublic(backendState: any): CoordinationState {
  return mapStateToEnum(backendState);
}

/**
 * Validates magic link token and resolves participant context
 */
export async function validateMagicLink(
  runId: string,
  token?: string,
  role?: string | null
): Promise<{ participantContext: ParticipantContextDto; runData: CoordinationRunDto }> {
  try {
    const params = new URLSearchParams();
    if (token) params.append('token', token);
    if (role) params.append('role', role);

    const url = `/r/${runId}${params.toString() ? '?' + params.toString() : ''}`;
    const response: CoordinationApiResponse = await apiFetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.success || !response.data) {
      throw new Error('Invalid magic link - no data returned');
    }

    const { run, participant, permissions } = response.data;

    if (!participant) {
      throw new Error('Invalid magic link - no participant context returned');
    }

    return {
      participantContext: mapParticipantToDto(participant, permissions),
      runData: mapRunToDto(run),
    };
  } catch (error) {
    console.error('Failed to validate magic link:', error);
    throw new Error('Invalid or expired magic link');
  }
}

/**
 * Fetches coordination run details
 */
export async function getCoordinationRun(runId: string): Promise<CoordinationRunDto> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/coordination/runs/${runId}`, {
      method: 'GET',
    });

    if (!response.success || !response.data) {
      throw new Error('Coordination run not found');
    }

    return mapRunToDto(response.data);
  } catch (error) {
    console.error('Failed to get coordination run:', error);
    throw error;
  }
}

/**
 * Fetches coordination run state history and converts to system messages
 */
export async function getCoordinationStateHistory(runId: string, magicToken?: string): Promise<CoordinationMessageDto[]> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/coordination/runs/${runId}/states`, {
      method: 'GET',
      magicToken,
    });

    if (!response.success || !response.data) {
      return [];
    }

    // Convert state history to system messages
    return response.data.map((state: any, index: number) => ({
      id: `state_${index}_${state.enteredAt}`,
      runId,
      content: `State transitioned to ${mapStateToEnum(state.state)}`,
      messageType: 'state_transition' as const,
      timestamp: state.enteredAt,
      sender: null,
      metadata: state.metadata || {},
      stateTransition: {
        fromState: index > 0 ? mapStateToEnum(response.data[index - 1]?.state) : 'Initial',
        toState: mapStateToEnum(state.state),
        transitionData: state.metadata || {},
      },
    }));
  } catch (error) {
    console.error('Failed to get coordination state history:', error);
    return [];
  }
}

/**
 * Advances coordination state with correct backend DTO format
 */
export async function advanceCoordinationState(
  runId: string,
  data: {
    participantId: string;
    targetStateId?: string;
    slotData?: any;
    metadata?: any;
  }
): Promise<any> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/coordination/runs/${runId}/advance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to advance state');
    }

    return response.data;
  } catch (error) {
    console.error('Failed to advance coordination state:', error);
    throw error;
  }
}

/**
 * Send participant message in coordination
 */
export async function sendParticipantMessage(
  runId: string,
  participantId: string,
  text: string,
  magicToken?: string
): Promise<any> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/coordination/participant/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(magicToken && { 'x-magic-token': magicToken }),
      },
      body: JSON.stringify({
        runId,
        participantId,
        text,
        timestamp: new Date().toISOString(),
        type: 'user',
      }),
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to send message');
    }

    return response.data;
  } catch (error) {
    console.error('Failed to send participant message:', error);
    throw error;
  }
}

/**
 * Uploads evidence for coordination
 */
export async function uploadCoordinationEvidence(
  runId: string,
  files: File[],
  description?: string,
  participantContext?: ParticipantContextDto | null
): Promise<any> {
  try {
    const formData = new FormData();

    files.forEach((file, index) => {
      formData.append(`files`, file);
    });

    if (description) {
      formData.append('description', description);
    }

    if (participantContext) {
      formData.append('participantContext', JSON.stringify(participantContext));
    }

    const response = await apiFetch(`/coordination/runs/${runId}/evidence`, {
      method: 'POST',
      body: formData,
    });

    if (!response.success) {
      throw new Error(response.error || 'Upload failed');
    }
    return response.data;
  } catch (error) {
    console.error('Failed to upload coordination evidence:', error);
    throw error;
  }
}

/**
 * Creates a commitment in coordination
 */
export async function createCoordinationCommitment(
  runId: string,
  commitment: {
    terms: string;
    deadline?: string;
    deposit?: number;
    participantContext?: ParticipantContextDto | null;
  }
): Promise<any> {
  try {
    const response = await apiFetch(`/coordination/runs/${runId}/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commitment),
    });

    if (!response.success) {
      throw new Error(response.error || 'Upload failed');
    }
    return response.data;
  } catch (error) {
    console.error('Failed to create coordination commitment:', error);
    throw error;
  }
}

/**
 * Confirms coordination completion
 */
export async function confirmCoordinationCompletion(
  runId: string,
  confirmation: {
    satisfied: boolean;
    feedback?: string;
    rating?: number;
    participantContext?: ParticipantContextDto | null;
  }
): Promise<any> {
  try {
    const response = await apiFetch(`/coordination/runs/${runId}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(confirmation),
    });

    if (!response.success) {
      throw new Error(response.error || 'Upload failed');
    }
    return response.data;
  } catch (error) {
    console.error('Failed to confirm coordination completion:', error);
    throw error;
  }
}

/**
 * Adds a participant to coordination run
 */
export async function addCoordinationParticipant(
  runId: string,
  participant: {
    email: string;
    roleId?: string;
    role?: string;
    permissions?: Record<string, boolean>;
  }
): Promise<{ participant: ParticipantContextDto; magicLink: string }> {
  try {
    // Use email-based endpoint if email is provided and no roleId
    if (participant.email && !participant.roleId) {
      const response: CoordinationApiResponse = await apiFetch(`/coordination/runs/${runId}/participants/by-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: participant.email,
          role: participant.role,
        }),
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to add participant');
      }

      return {
        participant: mapParticipantToDto(response.data.participant || response.data),
        magicLink: response.data.magicLink || '',
      };
    }

    // Use original endpoint for roleId-based requests
    const requestBody = {
      roleId: participant.roleId,
      permissions: participant.permissions,
    };

    const response: CoordinationApiResponse = await apiFetch(`/coordination/runs/${runId}/participants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to add participant');
    }

    return {
      participant: mapParticipantToDto(response.data.participant || response.data),
      magicLink: response.data.magicLink || '',
    };
  } catch (error) {
    console.error('Failed to add coordination participant:', error);
    throw error;
  }
}

/**
 * Removes a participant from coordination run
 */
export async function removeCoordinationParticipant(
  runId: string,
  participantId: string
): Promise<void> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/coordination/runs/${runId}/participants/${participantId}`, {
      method: 'DELETE',
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to remove participant');
    }
  } catch (error) {
    console.error('Failed to remove coordination participant:', error);
    throw error;
  }
}

/**
 * Updates participant permissions
 */
export async function updateCoordinationParticipant(
  runId: string,
  participantId: string,
  updates: {
    permissions?: Record<string, boolean>;
    role?: string;
  }
): Promise<ParticipantContextDto> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/coordination/runs/${runId}/participants/${participantId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update participant');
    }

    return mapParticipantToDto(response.data.participant || response.data);
  } catch (error) {
    console.error('Failed to update coordination participant:', error);
    throw error;
  }
}

/**
 * Gets coordination run state history (duplicate function - consider removing)
 */
export async function getCoordinationRunStateHistory(runId: string): Promise<any[]> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/coordination/runs/${runId}/states`, {
      method: 'GET',
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to get state history');
    }

    return response.data || [];
  } catch (error) {
    console.error('Failed to get coordination state history:', error);
    throw error;
  }
}

/**
 * Generates a new magic link for existing participant
 */
export async function generateCoordinationMagicLink(
  runId: string,
  participantId: string,
  expirationHours: number = 24
): Promise<{ magicLink: string; expiresAt: string }> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/coordination/runs/${runId}/participants/${participantId}/magic-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expirationHours }),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to generate magic link');
    }

    return response.data;
  } catch (error) {
    console.error('Failed to generate coordination magic link:', error);
    throw error;
  }
}

/**
 * Error handling utility for coordination API calls
 */
export function handleCoordinationApiError(error: any): string {
  if (error?.message) {
    // Handle specific coordination errors
    if (error.message.includes('magic link')) {
      return 'Invalid or expired magic link. Please request a new invitation.';
    }
    if (error.message.includes('permission')) {
      return 'You do not have permission to perform this action.';
    }
    if (error.message.includes('state')) {
      return 'This action is not available in the current coordination state.';
    }
    if (error.message.includes('not found')) {
      return 'Coordination run not found.';
    }
    return error.message;
  }

  if (error?.status) {
    switch (error.status) {
      case 401:
        return 'Authentication required. Please check your access link.';
      case 403:
        return 'Access denied. You may not have permission to view this coordination.';
      case 404:
        return 'Coordination run not found.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
        return 'Server error. Please try again later.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }

  return 'An unexpected error occurred. Please check your connection and try again.';
}

/**
 * Utility to check if coordination is in a specific state
 */
export function isCoordinationInState(
  runData: CoordinationRunDto,
  state: string
): boolean {
  return runData.currentState === state;
}

/**
 * Utility to get next possible states from current state
 */
export function getNextCoordinationStates(
  currentState: string
): string[] {
  const stateTransitions: Record<string, string[]> = {
    'Express_Need': ['Explore_Options'],
    'Explore_Options': ['Commit'],
    'Commit': ['Evidence'],
    'Evidence': ['Confirm'],
    'Confirm': [] // Final state
  };

  return stateTransitions[currentState] || [];
}

/**
 * Utility to check if participant can perform action in current state
 */
export function canParticipantPerformAction(
  participant: ParticipantContextDto,
  action: string,
  currentState: string
): boolean {
  // Role-based permissions for different states
  const permissions: Record<string, Record<string, string[]>> = {
    'Express_Need': {
      'send_message': ['requester', 'provider', 'organizer'],
      'upload_evidence': [],
      'make_commitment': []
    },
    'Explore_Options': {
      'send_message': ['requester', 'provider', 'organizer'],
      'upload_evidence': [],
      'make_commitment': []
    },
    'Commit': {
      'send_message': ['requester', 'provider', 'organizer'],
      'make_commitment': ['requester', 'provider'],
      'upload_evidence': []
    },
    'Evidence': {
      'send_message': ['requester', 'provider', 'organizer'],
      'upload_evidence': ['provider'],
      'approve_evidence': ['requester']
    },
    'Confirm': {
      'send_message': ['requester', 'provider', 'organizer'],
      'confirm_completion': ['requester']
    }
  };

  const statePermissions = permissions[currentState];
  if (!statePermissions || !statePermissions[action]) {
    return false;
  }

  return statePermissions[action].includes(participant.role);
}

/**
 * Formats coordination state for display and returns progress information
 */
export function formatCoordinationState(state: CoordinationState): {
  label: string;
  description: string;
  progressIndex: number;
  progressPercent: number;
  icon: string;
  color: string;
} {
  const stateOrder: CoordinationState[] = [
    'Express_Need',
    'Explore_Options',
    'Commit',
    'Evidence',
    'Confirm'
  ];

  const stateInfo: Record<CoordinationState, {
    label: string;
    description: string;
    icon: string;
    color: string;
  }> = {
    'Express_Need': {
      label: 'Express Need',
      description: 'Participants are expressing their needs and requirements',
      icon: '💭',
      color: 'blue'
    },
    'Explore_Options': {
      label: 'Explore Options',
      description: 'Exploring different options and possibilities',
      icon: '🔍',
      color: 'yellow'
    },
    'Commit': {
      label: 'Commit',
      description: 'Making commitments and agreements',
      icon: '🤝',
      color: 'purple'
    },
    'Evidence': {
      label: 'Evidence',
      description: 'Providing evidence and documentation',
      icon: '📋',
      color: 'orange'
    },
    'Confirm': {
      label: 'Confirm',
      description: 'Confirming completion and satisfaction',
      icon: '✅',
      color: 'green'
    }
  };

  const progressIndex = stateOrder.indexOf(state);
  const progressPercent = progressIndex >= 0 ? ((progressIndex + 1) / stateOrder.length) * 100 : 0;
  const info = stateInfo[state] || stateInfo['Express_Need'];

  return {
    ...info,
    progressIndex,
    progressPercent,
  };
}

/**
 * Gets CSS classes for state-based styling
 */
export function getCoordinationStateClasses(state: CoordinationState): {
  badge: string;
  progress: string;
  background: string;
} {
  const stateFormat = formatCoordinationState(state);

  const colorClasses: Record<string, { badge: string; progress: string; background: string; }> = {
    blue: {
      badge: 'bg-blue-100 text-blue-800',
      progress: 'bg-blue-500',
      background: 'bg-blue-50'
    },
    yellow: {
      badge: 'bg-yellow-100 text-yellow-800',
      progress: 'bg-yellow-500',
      background: 'bg-yellow-50'
    },
    purple: {
      badge: 'bg-purple-100 text-purple-800',
      progress: 'bg-purple-500',
      background: 'bg-purple-50'
    },
    orange: {
      badge: 'bg-orange-100 text-orange-800',
      progress: 'bg-orange-500',
      background: 'bg-orange-50'
    },
    green: {
      badge: 'bg-green-100 text-green-800',
      progress: 'bg-green-500',
      background: 'bg-green-50'
    }
  };

  return colorClasses[stateFormat.color] || colorClasses.blue;
}

// ============================================================================
// SPACE INTEGRATION FUNCTIONS
// ============================================================================

/**
 * Creates a coordination run from a template within a space context
 */
export async function createCoordinationRunFromTemplate(
  spaceId: string,
  templateId: string,
  runConfig: {
    name: string;
    description?: string;
    participants: Array<{
      email: string;
      role: string;
      name?: string;
    }>;
    metadata?: Record<string, any>;
  }
): Promise<{ run: CoordinationRunDto; participants: ParticipantContextDto[]; magicLinks: Record<string, string> }> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/spaces/${spaceId}/coordination/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        templateId,
        name: runConfig.name,
        description: runConfig.description,
        participants: runConfig.participants,
        metadata: runConfig.metadata,
      }),
      spaceId,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create coordination run');
    }

    return {
      run: mapRunToDto(response.data.run),
      participants: response.data.participants?.map((p: any) => mapParticipantToDto(p)) || [],
      magicLinks: response.data.magicLinks || {},
    };
  } catch (error) {
    console.error('Failed to create coordination run from template:', error);
    throw error;
  }
}

/**
 * Gets all coordination runs for a space with optional filtering
 */
export async function getSpaceCoordinationRuns(
  spaceId: string,
  filters?: {
    status?: 'active' | 'paused' | 'completed' | 'cancelled';
    templateId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<CoordinationRunDto[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.templateId) params.append('templateId', filters.templateId);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));

    const queryString = params.toString();
    const path = `/spaces/${spaceId}/coordination/runs${queryString ? `?${queryString}` : ''}`;

    const response: CoordinationApiResponse = await apiFetch(path, {
      method: 'GET',
      spaceId,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to get space coordination runs');
    }

    return (response.data || []).map((run: any) => mapRunToDto(run));
  } catch (error) {
    console.error('Failed to get space coordination runs:', error);
    throw error;
  }
}

/**
 * Gets available templates for coordination in a space
 */
export async function getSpaceCoordinationTemplates(
  spaceId: string,
  options?: {
    isActive?: boolean;
    withUsageStats?: boolean;
  }
): Promise<any[]> {
  try {
    const params = new URLSearchParams();
    if (options?.isActive !== undefined) params.append('isActive', String(options.isActive));
    if (options?.withUsageStats) params.append('withUsageStats', 'true');

    const queryString = params.toString();
    const path = `/spaces/${spaceId}/templates${queryString ? `?${queryString}` : ''}`;

    const response = await apiFetch(path, {
      method: 'GET',
      spaceId,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to get space templates');
    }

    return response.data || [];
  } catch (error) {
    console.error('Failed to get space coordination templates:', error);
    throw error;
  }
}

/**
 * Gets basic analytics for space coordination activity
 */
export async function getSpaceCoordinationAnalytics(
  spaceId: string,
  timeRange?: '7d' | '30d' | '90d'
): Promise<{
  totalRuns: number;
  activeRuns: number;
  completedRuns: number;
  averageCompletionTime: number;
  participantCount: number;
  templateUsage: Record<string, number>;
}> {
  try {
    const params = new URLSearchParams();
    if (timeRange) params.append('timeRange', timeRange);

    const queryString = params.toString();
    const path = `/spaces/${spaceId}/coordination/analytics${queryString ? `?${queryString}` : ''}`;

    const response: CoordinationApiResponse = await apiFetch(path, {
      method: 'GET',
      spaceId,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to get coordination analytics');
    }

    return response.data || {
      totalRuns: 0,
      activeRuns: 0,
      completedRuns: 0,
      averageCompletionTime: 0,
      participantCount: 0,
      templateUsage: {},
    };
  } catch (error) {
    console.error('Failed to get space coordination analytics:', error);
    throw error;
  }
}

/**
 * Gets space members suitable for a coordination role
 */
export async function getSpaceMembersForRole(
  spaceId: string,
  roleId: string,
  templateId?: string
): Promise<Array<{
  id: string;
  email: string;
  name: string;
  role: string;
  isAvailable: boolean;
  suitabilityScore?: number;
}>> {
  try {
    const params = new URLSearchParams();
    if (templateId) params.append('templateId', templateId);

    const queryString = params.toString();
    const path = `/spaces/${spaceId}/members/for-role/${roleId}${queryString ? `?${queryString}` : ''}`;

    const response = await apiFetch(path, {
      method: 'GET',
      spaceId,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to get space members for role');
    }

    return response.data || [];
  } catch (error) {
    console.error('Failed to get space members for role:', error);
    throw error;
  }
}

/**
 * Invites existing space members to a coordination run
 */
export async function inviteSpaceMemberToRun(
  spaceId: string,
  runId: string,
  memberId: string,
  roleId: string
): Promise<{ participant: ParticipantContextDto; magicLink: string }> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/spaces/${spaceId}/coordination/runs/${runId}/invite-member`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        memberId,
        roleId,
      }),
      spaceId,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to invite space member to run');
    }

    return {
      participant: mapParticipantToDto(response.data.participant),
      magicLink: response.data.magicLink,
    };
  } catch (error) {
    console.error('Failed to invite space member to run:', error);
    throw error;
  }
}

/**
 * Generates space-scoped magic links with space context
 */
export async function generateSpaceScopedMagicLinks(
  spaceId: string,
  runId: string,
  roles: string[],
  expirationHours: number = 24
): Promise<Record<string, string>> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/spaces/${spaceId}/coordination/runs/${runId}/magic-links/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roles,
        expirationHours,
      }),
      spaceId,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to generate space-scoped magic links');
    }

    return response.data.magicLinks || {};
  } catch (error) {
    console.error('Failed to generate space-scoped magic links:', error);
    throw error;
  }
}

/**
 * Validates magic link within space context
 */
export async function validateSpaceMagicLink(
  spaceId: string,
  runId: string,
  token: string
): Promise<{ participantContext: ParticipantContextDto; runData: CoordinationRunDto; spaceContext?: any }> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/spaces/${spaceId}/coordination/runs/${runId}/validate-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
      spaceId,
    });

    if (!response.success || !response.data) {
      throw new Error('Invalid or expired magic link');
    }

    const { run, participant, permissions, spaceContext } = response.data;

    return {
      participantContext: mapParticipantToDto(participant, permissions),
      runData: mapRunToDto(run),
      spaceContext: spaceContext,
    };
  } catch (error) {
    console.error('Failed to validate space magic link:', error);
    throw new Error('Invalid or expired magic link');
  }
}

/**
 * Gets magic links for a run with expiration info
 */
export async function getRunMagicLinksWithExpiry(
  spaceId: string,
  runId: string
): Promise<Array<{
  participantId: string;
  email: string;
  role: string;
  magicLink: string;
  expiresAt: string;
  isExpired: boolean;
}>> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/spaces/${spaceId}/coordination/runs/${runId}/magic-links`, {
      method: 'GET',
      spaceId,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to get run magic links');
    }

    return response.data || [];
  } catch (error) {
    console.error('Failed to get run magic links with expiry:', error);
    throw error;
  }
}

/**
 * Updates coordination run status within space context
 */
export async function updateSpaceCoordinationRunStatus(
  spaceId: string,
  runId: string,
  status: 'active' | 'paused' | 'completed' | 'cancelled',
  reason?: string
): Promise<CoordinationRunDto> {
  try {
    const response: CoordinationApiResponse = await apiFetch(`/coordination/runs/${runId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status,
        reason,
      }),
      spaceId,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update run status');
    }

    return mapRunToDto(response.data);
  } catch (error) {
    console.error('Failed to update space coordination run status:', error);
    throw error;
  }
}

/**
 * Subscribes to space coordination events via WebSocket
 */
export function subscribeToSpaceCoordinationEvents(
  spaceId: string,
  callback: (event: string, data: any) => void
): () => void {
  // This would integrate with your existing WebSocket infrastructure
  // For now, returning a no-op cleanup function
  const eventSource = new EventSource(`/api/spaces/${spaceId}/coordination/events`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      callback(data.type, data.payload);
    } catch (error) {
      console.error('Failed to parse coordination event:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('Space coordination event source error:', error);
  };

  return () => {
    eventSource.close();
  };
}

/**
 * Maps space member to coordination participant
 */
export function mapSpaceMemberToParticipant(
  member: { id: string; email: string; name: string; role: string },
  coordinationRole: string
): {
  email: string;
  role: string;
  name?: string;
  permissions?: Record<string, boolean>;
} {
  // Default permissions based on coordination role
  const rolePermissions: Record<string, Record<string, boolean>> = {
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

  return {
    email: member.email,
    role: coordinationRole,
    name: member.name,
    permissions: rolePermissions[coordinationRole] || rolePermissions.observer,
  };
}

/**
 * Gets coordination permissions for a user in a space
 */
export async function getCoordinationPermissions(
  spaceId: string,
  userId: string
): Promise<{
  canCreateRuns: boolean;
  canManageRuns: boolean;
  canViewAllRuns: boolean;
  canInviteParticipants: boolean;
  canManageTemplates: boolean;
}> {
  try {
    const response = await apiFetch(`/spaces/${spaceId}/coordination/permissions`, {
      method: 'GET',
      headers: {
        'x-user-id': userId,
      },
      spaceId,
    });

    if (!response.success) {
      // Default to minimal permissions
      return {
        canCreateRuns: false,
        canManageRuns: false,
        canViewAllRuns: false,
        canInviteParticipants: false,
        canManageTemplates: false,
      };
    }

    return response.data || {
      canCreateRuns: true, // Default for space members
      canManageRuns: true,
      canViewAllRuns: true,
      canInviteParticipants: true,
      canManageTemplates: true,
    };
  } catch (error) {
    console.error('Failed to get coordination permissions:', error);
    return {
      canCreateRuns: false,
      canManageRuns: false,
      canViewAllRuns: false,
      canInviteParticipants: false,
      canManageTemplates: false,
    };
  }
}