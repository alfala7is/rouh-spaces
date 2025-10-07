import { z } from 'zod';

export const CreateRunDtoSchema = z.object({
  templateId: z.string().uuid(),
  participants: z
    .array(
      z.object({
        userId: z.string().uuid().optional(),
        roleId: z.string().uuid(),
        metadata: z.record(z.any()).optional(),
      }),
    )
    .optional()
    .default([]),
  metadata: z.record(z.any()).optional(),
});

export type CreateRunDto = z.infer<typeof CreateRunDtoSchema>;

export const AddParticipantDtoSchema = z.object({
  userId: z.string().uuid().optional(),
  roleId: z.string().uuid(),
  metadata: z.record(z.any()).optional(),
});

export type AddParticipantDto = z.infer<typeof AddParticipantDtoSchema>;

export const AdvanceStateDtoSchema = z.object({
  participantId: z.string().uuid().optional(),
  targetStateId: z.string().uuid().optional(),
  slotData: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

export type AdvanceStateDto = z.infer<typeof AdvanceStateDtoSchema>;

export const GenerateLinkDtoSchema = z.object({
  roleId: z.string().uuid().optional(),
  expiresIn: z.number().positive().optional(),
});

export type GenerateLinkDto = z.infer<typeof GenerateLinkDtoSchema>;

export interface RunStatusDto {
  id: string;
  templateId: string;
  spaceId: string;
  status: string;
  currentState: {
    id: string;
    name: string;
    type: string;
    slotData?: any;
    createdAt: Date;
    completedAt?: Date;
  };
  participants: number;
  progress: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ParticipantContextDto {
  id: string;
  runId: string;
  userId?: string;
  roleId: string;
  metadata?: any;
  permissions: {
    canView: boolean;
    canViewParticipants: boolean;
    canViewStates: boolean;
    canAdvanceState: boolean;
    canProvideSlotData: boolean;
    canAddParticipants?: boolean;
    canRemoveParticipants?: boolean;
    canCancelRun?: boolean;
    canPauseRun?: boolean;
    canGenerateLinks?: boolean;
  };
}

export interface StateTransitionResultDto {
  success: boolean;
  previousState: {
    id: string;
    name: string;
    type: string;
  };
  currentState: {
    id: string;
    name: string;
    type: string;
  };
  action?: {
    id: string;
    type: string;
    timestamp: Date;
  };
}

export interface MagicLinkResponseDto {
  roleId: string;
  link: string;
  expiresAt: Date;
}

export interface RunParticipantDto {
  id: string;
  runId: string;
  userId?: string;
  roleId: string;
  roleName?: string;
  hasValidToken: boolean;
  lastActiveAt?: Date;
  joinedAt: Date;
  metadata?: any;
}

export interface RunStateHistoryDto {
  id: string;
  stateId: string;
  slotData?: any;
  enteredAt: Date;
  exitedAt?: Date;
  duration?: number;
  actorId?: string;
}

export interface CoordinationActionDto {
  id: string;
  type: string;
  parameters: any;
  participantId?: string;
  roleId?: string;
  timestamp: Date;
}

export interface RunDetailDto {
  run: RunStatusDto;
  states: RunStateHistoryDto[];
  participants: RunParticipantDto[];
  recentActions: CoordinationActionDto[];
}

export const validateCreateRunDto = (data: unknown) => {
  return CreateRunDtoSchema.parse(data);
};

export const validateAddParticipantDto = (data: unknown) => {
  return AddParticipantDtoSchema.parse(data);
};

export const validateAdvanceStateDto = (data: unknown) => {
  return AdvanceStateDtoSchema.parse(data);
};

export const validateGenerateLinkDto = (data: unknown) => {
  return GenerateLinkDtoSchema.parse(data);
};