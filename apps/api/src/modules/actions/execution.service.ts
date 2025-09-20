import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { EventsGateway } from '../events.gateway';
import { HandlerRegistry } from './handlers/handler-registry';
import { ActionExecutionContext, ExecutionResult } from './types/execution.types';

@Injectable()
export class ActionExecutionService {
  private readonly logger = new Logger(ActionExecutionService.name);

  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
    private handlerRegistry: HandlerRegistry,
  ) {}

  async executeAction(actionId: string): Promise<void> {
    this.logger.log(`Starting execution for action ${actionId}`);

    try {
      const action = await this.prisma.action.findUnique({
        where: { id: actionId },
        include: {
          item: true,
          space: true,
          executions: true
        },
      });

      if (!action) {
        throw new Error(`Action ${actionId} not found`);
      }

      if (action.status !== 'queued') {
        this.logger.warn(`Action ${actionId} is not in queued status: ${action.status}`);
        return;
      }

      // Update action status to executing
      await this.updateActionStatus(actionId, 'executing', 'Starting action execution...');

      // Create execution context
      const context: ActionExecutionContext = {
        action,
        item: action.item,
        space: action.space,
        parameters: action.parameters as any,
        attempt: 1,
        maxAttempts: 3,
      };

      // Get appropriate handler
      const handler = await this.handlerRegistry.getHandler(action.type, action.item);

      if (!handler) {
        throw new Error(`No handler found for action type: ${action.type}`);
      }

      // Create execution record
      const execution = await this.prisma.actionExecution.create({
        data: {
          actionId,
          handlerType: handler.type,
          handlerName: handler.name,
          status: 'executing',
          attempt: context.attempt,
          maxAttempts: context.maxAttempts,
          executedAt: new Date(),
        },
      });

      try {
        // Execute the action
        const result = await handler.execute(context);

        // Handle execution result
        await this.handleExecutionResult(actionId, execution.id, result);

      } catch (error) {
        await this.handleExecutionError(actionId, execution.id, error as Error, context);
      }

    } catch (error) {
      this.logger.error(`Failed to execute action ${actionId}:`, error);
      await this.updateActionStatus(actionId, 'failed', `Execution failed: ${(error as Error).message}`);
    }
  }

  private async handleExecutionResult(
    actionId: string,
    executionId: string,
    result: ExecutionResult
  ): Promise<void> {
    this.logger.log(`Action ${actionId} execution result:`, result);

    // Update execution record
    await this.prisma.actionExecution.update({
      where: { id: executionId },
      data: {
        status: result.status === 'completed' ? 'completed' : 'failed',
        completedAt: result.status === 'completed' ? new Date() : undefined,
        failedAt: result.status === 'failed' ? new Date() : undefined,
        externalRef: result.externalReference,
        externalData: result.externalData,
        errorMessage: result.errorMessage,
      },
    });

    if (result.status === 'completed') {
      // Update action status
      await this.updateActionStatus(actionId, 'completed', 'Action completed successfully!');

      // Create receipt if execution was successful
      if (result.receiptData) {
        await this.createReceipt(actionId, result);
      }

      // Broadcast success
      this.events.broadcast('action.completed', {
        actionId,
        externalReference: result.externalReference,
        receiptData: result.receiptData,
      });

    } else if (result.status === 'failed') {
      await this.updateActionStatus(actionId, 'failed', result.errorMessage || 'Action execution failed');
    }
  }

  private async handleExecutionError(
    actionId: string,
    executionId: string,
    error: Error,
    context: ActionExecutionContext
  ): Promise<void> {
    this.logger.error(`Action ${actionId} execution error:`, error);

    // Update execution record
    await this.prisma.actionExecution.update({
      where: { id: executionId },
      data: {
        status: 'failed',
        failedAt: new Date(),
        errorMessage: error.message,
      },
    });

    // Check if we should retry
    if (context.attempt < context.maxAttempts) {
      const nextRetryAt = new Date(Date.now() + Math.pow(2, context.attempt) * 1000); // Exponential backoff

      await this.prisma.actionExecution.update({
        where: { id: executionId },
        data: { nextRetryAt },
      });

      await this.updateActionStatus(
        actionId,
        'queued',
        `Execution failed, retrying in ${Math.pow(2, context.attempt)} seconds...`
      );

      // Schedule retry (in a real implementation, this would be handled by a job queue)
      setTimeout(() => {
        this.executeAction(actionId);
      }, Math.pow(2, context.attempt) * 1000);

    } else {
      // Max attempts reached, mark as failed
      await this.updateActionStatus(actionId, 'failed', `Action failed after ${context.maxAttempts} attempts: ${error.message}`);
    }
  }

  private async updateActionStatus(actionId: string, status: any, message: string): Promise<void> {
    // Update action status
    await this.prisma.action.update({
      where: { id: actionId },
      data: { status },
    });

    // Create status update record
    await this.prisma.actionStatusUpdate.create({
      data: {
        actionId,
        status,
        message,
      },
    });

    // Broadcast real-time update
    this.events.broadcast('action.status', {
      actionId,
      status,
      message,
      timestamp: new Date(),
    });

    this.logger.log(`Action ${actionId} status updated to ${status}: ${message}`);
  }

  private async createReceipt(actionId: string, result: ExecutionResult): Promise<void> {
    const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const receipt = await this.prisma.receipt.create({
      data: {
        actionId,
        receiptNumber,
        status: 'confirmed',
        data: result.receiptData || {},
        externalProof: result.externalData ? {
          system: result.externalReference?.split('_')[0],
          reference: result.externalReference,
          timestamp: new Date(),
          data: result.externalData
        } : undefined,
        providerName: result.providerName,
        totalAmount: result.totalAmount,
        currency: result.currency || 'USD',
        externalRef: result.externalReference,
        confirmedAt: new Date(),
      },
    });

    this.logger.log(`Receipt created for action ${actionId}: ${receiptNumber}`);

    // Broadcast receipt creation
    this.events.broadcast('receipt.created', {
      actionId,
      receipt,
    });
  }

  async getActionStatus(actionId: string) {
    const action = await this.prisma.action.findUnique({
      where: { id: actionId },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        receipts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const statusUpdates = await this.prisma.actionStatusUpdate.findMany({
      where: { actionId },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    return {
      action,
      statusUpdates,
    };
  }
}