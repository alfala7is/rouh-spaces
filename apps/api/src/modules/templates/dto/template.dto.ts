import { z } from 'zod';
import { CoordinationStateType } from '@prisma/client';

// ============================================================================
// Zod Validation Schemas
// ============================================================================

/**
 * Schema for template role validation
 */
const templateRoleSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  minParticipants: z.number().int().min(0).default(1),
  maxParticipants: z.number().int().min(1).optional(),
  capabilities: z.array(z.string()).default([]),
  constraints: z.record(z.any()).optional(),
});

/**
 * Schema for template state validation
 */
const templateStateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.nativeEnum(CoordinationStateType),
  description: z.string().optional(),
  sequence: z.number().int().min(0).optional(),
  requiredSlots: z.array(z.string()).default([]),
  allowedRoles: z.array(z.string()).default([]),
  transitions: z.record(z.any()).default({}),
  timeoutMinutes: z.number().int().positive().optional(),
  uiHints: z.record(z.any()).optional(),
});

/**
 * Schema for template slot validation
 */
const templateSlotSchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(['text', 'number', 'date', 'file', 'location', 'currency', 'boolean', 'select']),
  description: z.string().optional(),
  required: z.boolean().default(false),
  defaultValue: z.any().optional(),
  validation: z.record(z.any()).optional(),
  visibility: z.array(z.string()).default([]),
  editable: z.array(z.string()).default([]),
});

/**
 * Schema for the 5-state coordination pattern
 */
const coordinationPatternSchema = z.object({
  express: z.object({
    enabled: z.boolean().default(true),
    description: z.string().optional(),
    timeout: z.number().optional(),
  }),
  explore: z.object({
    enabled: z.boolean().default(true),
    description: z.string().optional(),
    timeout: z.number().optional(),
  }),
  commit: z.object({
    enabled: z.boolean().default(true),
    description: z.string().optional(),
    timeout: z.number().optional(),
    requireDeposit: z.boolean().default(false),
  }),
  evidence: z.object({
    enabled: z.boolean().default(true),
    description: z.string().optional(),
    timeout: z.number().optional(),
    requireProof: z.boolean().default(true),
  }),
  confirm: z.object({
    enabled: z.boolean().default(true),
    description: z.string().optional(),
    timeout: z.number().optional(),
    autoComplete: z.boolean().default(false),
  }),
});

/**
 * Main template schema validator
 */
export const templateSchemaValidator = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  version: z.string().regex(/^\d+\.\d+$/).default('1.0'),
  isActive: z.boolean().optional(),
  schemaJson: coordinationPatternSchema,
  metadata: z.record(z.any()).optional(),
  roles: z.array(templateRoleSchema).min(1).optional(),
  states: z.array(templateStateSchema).min(1).optional(),
  slots: z.array(templateSlotSchema).optional(),
});

// ============================================================================
// TypeScript DTOs
// ============================================================================

/**
 * DTO for creating a template role
 */
export interface TemplateRoleDto {
  name: string;
  description?: string;
  minParticipants?: number;
  maxParticipants?: number;
  capabilities?: string[];
  constraints?: Record<string, any>;
}

/**
 * DTO for creating a template state
 */
export interface TemplateStateDto {
  name: string;
  type: CoordinationStateType;
  description?: string;
  sequence?: number;
  requiredSlots?: string[];
  allowedRoles?: string[];
  transitions?: Record<string, any>;
  timeoutMinutes?: number;
  uiHints?: Record<string, any>;
}

/**
 * DTO for creating a template slot
 */
export interface TemplateSlotDto {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  defaultValue?: any;
  validation?: Record<string, any>;
  visibility?: string[];
  editable?: string[];
}

/**
 * DTO for creating a new coordination template
 */
export interface CreateTemplateDto {
  name: string;
  description: string;
  version?: string;
  isActive?: boolean;
  schemaJson: {
    express: {
      enabled?: boolean;
      description?: string;
      timeout?: number;
    };
    explore: {
      enabled?: boolean;
      description?: string;
      timeout?: number;
    };
    commit: {
      enabled?: boolean;
      description?: string;
      timeout?: number;
      requireDeposit?: boolean;
    };
    evidence: {
      enabled?: boolean;
      description?: string;
      timeout?: number;
      requireProof?: boolean;
    };
    confirm: {
      enabled?: boolean;
      description?: string;
      timeout?: number;
      autoComplete?: boolean;
    };
  };
  metadata?: Record<string, any>;
  roles?: TemplateRoleDto[];
  states?: TemplateStateDto[];
  slots?: TemplateSlotDto[];
}

/**
 * DTO for updating an existing coordination template
 */
export interface UpdateTemplateDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  schemaJson?: CreateTemplateDto['schemaJson'];
  metadata?: Record<string, any>;
  roles?: TemplateRoleDto[];
  states?: TemplateStateDto[];
  slots?: TemplateSlotDto[];
}

/**
 * Example template creation DTO for reference
 */
export const exampleTemplateDto: CreateTemplateDto = {
  name: 'Service Request',
  description: 'Coordinate service requests between requesters and providers',
  version: '1.0',
  isActive: true,
  schemaJson: {
    express: {
      enabled: true,
      description: 'Requester expresses their need',
      timeout: 24 * 60, // 24 hours
    },
    explore: {
      enabled: true,
      description: 'Explore options and negotiate terms',
      timeout: 48 * 60, // 48 hours
    },
    commit: {
      enabled: true,
      description: 'Commit to the agreement',
      requireDeposit: true,
      timeout: 12 * 60, // 12 hours
    },
    evidence: {
      enabled: true,
      description: 'Provide evidence of completion',
      requireProof: true,
      timeout: 72 * 60, // 72 hours
    },
    confirm: {
      enabled: true,
      description: 'Confirm completion and release payment',
      autoComplete: false,
      timeout: 24 * 60, // 24 hours
    },
  },
  metadata: {
    category: 'services',
    tags: ['general', 'p2p'],
  },
  roles: [
    {
      name: 'requester',
      description: 'Person requesting the service',
      minParticipants: 1,
      maxParticipants: 1,
      capabilities: ['propose', 'accept', 'pay_deposit', 'sign_off'],
    },
    {
      name: 'provider',
      description: 'Person or business providing the service',
      minParticipants: 1,
      maxParticipants: 5,
      capabilities: ['accept', 'negotiate', 'upload_evidence', 'request_payment'],
    },
  ],
  states: [
    {
      name: 'express_need',
      type: CoordinationStateType.collect,
      description: 'Collect initial service request details',
      sequence: 0,
      requiredSlots: ['service_description', 'location', 'timeline'],
      allowedRoles: ['requester'],
      transitions: {
        nextStates: ['explore_options'],
        conditions: {
          allSlotsRequired: true,
        },
      },
      timeoutMinutes: 1440, // 24 hours
    },
    {
      name: 'explore_options',
      type: CoordinationStateType.negotiate,
      description: 'Negotiate terms with providers',
      sequence: 1,
      requiredSlots: ['budget', 'terms'],
      allowedRoles: ['requester', 'provider'],
      transitions: {
        nextStates: ['commit_agreement'],
        conditions: {
          requireConsensus: true,
        },
      },
      timeoutMinutes: 2880, // 48 hours
    },
    {
      name: 'commit_agreement',
      type: CoordinationStateType.commit,
      description: 'Finalize agreement and collect deposits',
      sequence: 2,
      requiredSlots: ['final_terms', 'deposit_amount'],
      allowedRoles: ['requester', 'provider'],
      transitions: {
        nextStates: ['provide_evidence'],
        conditions: {
          depositPaid: true,
        },
      },
      timeoutMinutes: 720, // 12 hours
    },
    {
      name: 'provide_evidence',
      type: CoordinationStateType.evidence,
      description: 'Upload proof of service completion',
      sequence: 3,
      requiredSlots: ['completion_photos', 'completion_notes'],
      allowedRoles: ['provider'],
      transitions: {
        nextStates: ['confirm_completion'],
        conditions: {
          evidenceProvided: true,
        },
      },
      timeoutMinutes: 4320, // 72 hours
    },
    {
      name: 'confirm_completion',
      type: CoordinationStateType.signoff,
      description: 'Confirm service completion and release payment',
      sequence: 4,
      requiredSlots: ['satisfaction_rating', 'final_notes'],
      allowedRoles: ['requester'],
      transitions: {
        nextStates: [],
        conditions: {
          signoffComplete: true,
        },
      },
      timeoutMinutes: 1440, // 24 hours
    },
  ],
  slots: [
    {
      name: 'service_description',
      type: 'text',
      description: 'Detailed description of the service needed',
      required: true,
      validation: {
        minLength: 20,
        maxLength: 1000,
      },
      visibility: ['requester', 'provider'],
      editable: ['requester'],
    },
    {
      name: 'location',
      type: 'location',
      description: 'Service location',
      required: true,
      visibility: ['requester', 'provider'],
      editable: ['requester'],
    },
    {
      name: 'timeline',
      type: 'date',
      description: 'When the service is needed',
      required: true,
      validation: {
        minDate: 'now',
      },
      visibility: ['requester', 'provider'],
      editable: ['requester'],
    },
    {
      name: 'budget',
      type: 'currency',
      description: 'Budget for the service',
      required: true,
      validation: {
        min: 0,
      },
      visibility: ['requester', 'provider'],
      editable: ['requester', 'provider'],
    },
    {
      name: 'terms',
      type: 'text',
      description: 'Agreed terms and conditions',
      required: true,
      visibility: ['requester', 'provider'],
      editable: ['requester', 'provider'],
    },
    {
      name: 'final_terms',
      type: 'text',
      description: 'Final agreed terms',
      required: true,
      visibility: ['requester', 'provider'],
      editable: [],
    },
    {
      name: 'deposit_amount',
      type: 'currency',
      description: 'Deposit amount to secure service',
      required: true,
      visibility: ['requester', 'provider'],
      editable: [],
    },
    {
      name: 'completion_photos',
      type: 'file',
      description: 'Photos showing completed work',
      required: true,
      validation: {
        maxFiles: 10,
        allowedTypes: ['image/jpeg', 'image/png'],
      },
      visibility: ['requester', 'provider'],
      editable: ['provider'],
    },
    {
      name: 'completion_notes',
      type: 'text',
      description: 'Notes about the completed service',
      required: false,
      visibility: ['requester', 'provider'],
      editable: ['provider'],
    },
    {
      name: 'satisfaction_rating',
      type: 'number',
      description: 'Rate the service from 1-5',
      required: true,
      validation: {
        min: 1,
        max: 5,
      },
      visibility: ['requester', 'provider'],
      editable: ['requester'],
    },
    {
      name: 'final_notes',
      type: 'text',
      description: 'Any final notes or feedback',
      required: false,
      visibility: ['requester', 'provider'],
      editable: ['requester'],
    },
  ],
};

/**
 * Type guards for validation
 */
export const isTemplateRoleDto = (obj: any): obj is TemplateRoleDto => {
  return templateRoleSchema.safeParse(obj).success;
};

export const isTemplateStateDto = (obj: any): obj is TemplateStateDto => {
  return templateStateSchema.safeParse(obj).success;
};

export const isTemplateSlotDto = (obj: any): obj is TemplateSlotDto => {
  return templateSlotSchema.safeParse(obj).success;
};

export const isCreateTemplateDto = (obj: any): obj is CreateTemplateDto => {
  return templateSchemaValidator.safeParse(obj).success;
};