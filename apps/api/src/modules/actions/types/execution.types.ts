import { Action, Item, Space } from '@prisma/client';

export interface ActionExecutionContext {
  action: Action;
  item: Item | null;
  space: Space;
  parameters: Record<string, any>;
  attempt: number;
  maxAttempts: number;
}

export interface ExecutionResult {
  status: 'completed' | 'failed' | 'pending';
  externalReference?: string;
  externalData?: Record<string, any>;
  receiptData?: Record<string, any>;
  providerName?: string;
  totalAmount?: number;
  currency?: string;
  errorMessage?: string;
  shouldRetry?: boolean;
  retryAfterMs?: number;
}

export interface ActionHandler {
  name: string;
  type: 'api' | 'webhook' | 'email' | 'form' | 'manual';
  description: string;
  supportedActionTypes: string[];

  canHandle(actionType: string, item: Item | null): boolean;
  execute(context: ActionExecutionContext): Promise<ExecutionResult>;
  validate?(context: ActionExecutionContext): Promise<boolean>;
  estimateExecutionTime?(context: ActionExecutionContext): Promise<number>; // in seconds
}

export interface HandlerConfig {
  type: 'api' | 'webhook' | 'email' | 'form' | 'manual';
  config: Record<string, any>;
  isActive: boolean;
  priority: number;
}

export interface ProviderIntegration {
  name: string;
  type: 'api' | 'webhook';
  baseUrl?: string;
  authConfig?: {
    type: 'bearer' | 'api_key' | 'oauth' | 'basic';
    credentials: Record<string, string>;
  };
  endpoints?: Record<string, {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    headers?: Record<string, string>;
  }>;
}

export interface ActionQueueJob {
  actionId: string;
  priority: number;
  delay?: number;
  maxAttempts: number;
  backoffSettings: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
}