import { Injectable, Logger } from '@nestjs/common';
import { Item } from '@prisma/client';
import { PrismaService } from '../../../prisma.service';
import { ActionHandler, HandlerConfig } from '../types/execution.types';

@Injectable()
export class HandlerRegistry {
  private readonly logger = new Logger(HandlerRegistry.name);
  private handlers = new Map<string, ActionHandler>();

  constructor(private prisma: PrismaService) {}

  registerHandler(handler: ActionHandler): void {
    this.handlers.set(handler.name, handler);
    this.logger.log(`Registered handler: ${handler.name} (${handler.type})`);
  }

  async getHandler(actionType: string, item: Item | null): Promise<ActionHandler | null> {
    // First, try to find a handler based on database configuration
    const dbHandlers = await this.prisma.handler.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        priority: 'asc',
      },
    });

    // Check database-configured handlers first
    for (const dbHandler of dbHandlers) {
      const handler = this.handlers.get(dbHandler.name);
      if (handler && handler.canHandle(actionType, item)) {
        this.logger.log(`Selected handler from DB config: ${handler.name} for action ${actionType}`);
        return handler;
      }
    }

    // Fallback to any registered handler that can handle this action type
    for (const [name, handler] of this.handlers) {
      if (handler.canHandle(actionType, item)) {
        this.logger.log(`Selected fallback handler: ${name} for action ${actionType}`);
        return handler;
      }
    }

    this.logger.warn(`No handler found for action type: ${actionType}`);
    return null;
  }

  getHandlerByName(name: string): ActionHandler | null {
    return this.handlers.get(name) || null;
  }

  getAllHandlers(): ActionHandler[] {
    return Array.from(this.handlers.values());
  }

  async createHandlerConfig(config: Omit<HandlerConfig, 'id'>): Promise<void> {
    await this.prisma.handler.create({
      data: {
        name: `${config.type}_handler_${Date.now()}`,
        type: config.type,
        configJson: config.config,
        isActive: config.isActive,
        priority: config.priority,
      },
    });
  }

  async updateHandlerConfig(name: string, updates: Partial<HandlerConfig>): Promise<void> {
    await this.prisma.handler.update({
      where: { name },
      data: {
        ...(updates.config && { configJson: updates.config }),
        ...(updates.isActive !== undefined && { isActive: updates.isActive }),
        ...(updates.priority !== undefined && { priority: updates.priority }),
      },
    });
  }
}