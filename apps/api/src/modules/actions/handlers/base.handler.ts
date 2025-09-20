import { Logger } from '@nestjs/common';
import { Item } from '@prisma/client';
import { ActionHandler, ActionExecutionContext, ExecutionResult } from '../types/execution.types';

export abstract class BaseActionHandler implements ActionHandler {
  protected readonly logger = new Logger(this.constructor.name);

  abstract name: string;
  abstract type: 'api' | 'webhook' | 'email' | 'form' | 'manual';
  abstract description: string;
  abstract supportedActionTypes: string[];

  canHandle(actionType: string, item: Item | null): boolean {
    return this.supportedActionTypes.includes(actionType);
  }

  abstract execute(context: ActionExecutionContext): Promise<ExecutionResult>;

  async validate(context: ActionExecutionContext): Promise<boolean> {
    // Default validation - can be overridden by specific handlers
    if (!context.action) {
      this.logger.warn('No action provided in context');
      return false;
    }

    if (!this.supportedActionTypes.includes(context.action.type)) {
      this.logger.warn(`Action type ${context.action.type} not supported by ${this.name}`);
      return false;
    }

    return true;
  }

  async estimateExecutionTime(context: ActionExecutionContext): Promise<number> {
    // Default estimate - can be overridden
    return 30; // 30 seconds
  }

  protected createSuccessResult(data: Partial<ExecutionResult>): ExecutionResult {
    return {
      status: 'completed',
      ...data,
    };
  }

  protected createFailureResult(errorMessage: string, shouldRetry = false): ExecutionResult {
    return {
      status: 'failed',
      errorMessage,
      shouldRetry,
    };
  }

  protected createPendingResult(data: Partial<ExecutionResult>): ExecutionResult {
    return {
      status: 'pending',
      ...data,
    };
  }

  protected extractItemData(item: Item | null): Record<string, any> {
    if (!item || !item.canonicalJson) {
      return {};
    }

    try {
      return typeof item.canonicalJson === 'object'
        ? item.canonicalJson as Record<string, any>
        : JSON.parse(item.canonicalJson as string);
    } catch (error) {
      this.logger.warn('Failed to parse item canonical JSON:', error);
      return {};
    }
  }

  protected generateExternalReference(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  protected formatCurrency(amount: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  }
}