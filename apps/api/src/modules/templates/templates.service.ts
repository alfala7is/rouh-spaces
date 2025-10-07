import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { EventsGateway } from '../events.gateway';
import { AiService } from '../ai/ai.service';
import {
  CoordinationTemplate,
  TemplateRole,
  TemplateState,
  TemplateSlot,
  CoordinationRun,
  RunParticipant,
  RunState,
  Prisma
} from '@prisma/client';
import { CreateTemplateDto, UpdateTemplateDto, templateSchemaValidator } from './dto/template.dto';

interface TemplateAnalytics {
  totalTemplates: number;
  activeTemplates: number;
  compilationCount: number;
  averageComplexity: number;
  topCategories: Array<{ category: string; count: number }>;
  usagePatterns: {
    daily: number[];
    weekly: number[];
    monthly: number[];
  };
  aiMetrics: {
    successRate: number;
    averageConfidence: number;
    averageProcessingTime: number;
    commonFailureReasons: Array<{ reason: string; count: number }>;
  };
}

interface CompilationContext {
  spaceId: string;
  userId?: string;
  previousTemplates?: CoordinationTemplate[];
  businessContext?: any;
  metadata?: {
    industry?: string;
    teamSize?: number;
    complexity?: number;
  };
}

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  // Analytics tracking
  private analyticsCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private compilationMetrics = new Map<string, { attempts: number; successes: number; totalTime: number; confidences: number[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
    private readonly aiService: AiService,
  ) {}

  // Enhanced analytics methods
  async getTemplateAnalytics(spaceId: string, timeRange?: { start: Date; end: Date }): Promise<TemplateAnalytics> {
    const cacheKey = `analytics:${spaceId}:${timeRange?.start?.toISOString() || 'all'}:${timeRange?.end?.toISOString() || 'all'}`;
    const cached = this.analyticsCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    try {
      const whereClause: Prisma.CoordinationTemplateWhereInput = {
        spaceId,
        ...(timeRange && {
          createdAt: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
        }),
      };

      const [totalTemplates, activeTemplates, templates, compilationStats] = await Promise.all([
        this.prisma.coordinationTemplate.count({ where: whereClause }),
        this.prisma.coordinationTemplate.count({
          where: { ...whereClause, isActive: true }
        }),
        this.prisma.coordinationTemplate.findMany({
          where: whereClause,
          include: { _count: { select: { coordinationRuns: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        this.getCompilationStats(spaceId, timeRange),
      ]);

      // Calculate complexity metrics
      const complexities = templates.map(t => this.calculateTemplateComplexity(t));
      const averageComplexity = complexities.length > 0
        ? complexities.reduce((a, b) => a + b, 0) / complexities.length
        : 0;

      // Analyze categories
      const categories = templates
        .map(t => (t.metadata as any)?.category || 'uncategorized')
        .reduce((acc, category) => {
          acc[category] = (acc[category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      const topCategories = Object.entries(categories)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 5)
        .map(([category, count]) => ({ category, count: count as number }));

      // Usage patterns
      const usagePatterns = await this.getUsagePatterns(spaceId, timeRange);

      const analytics: TemplateAnalytics = {
        totalTemplates,
        activeTemplates,
        compilationCount: compilationStats.totalCompilations,
        averageComplexity,
        topCategories,
        usagePatterns,
        aiMetrics: compilationStats.aiMetrics,
      };

      // Cache the result for 5 minutes
      this.analyticsCache.set(cacheKey, {
        data: analytics,
        timestamp: Date.now(),
        ttl: 5 * 60 * 1000
      });

      return analytics;
    } catch (error: any) {
      this.logger.error(`Failed to get template analytics for space ${spaceId}:`, error);
      throw new BadRequestException('Failed to generate analytics');
    }
  }

  private async getCompilationStats(spaceId: string, timeRange?: { start: Date; end: Date }) {
    // Get compilation metrics from in-memory tracking
    const spaceMetrics = this.compilationMetrics.get(spaceId) || {
      attempts: 0,
      successes: 0,
      totalTime: 0,
      confidences: []
    };

    return {
      totalCompilations: spaceMetrics.attempts,
      aiMetrics: {
        successRate: spaceMetrics.attempts > 0 ? spaceMetrics.successes / spaceMetrics.attempts : 0,
        averageConfidence: spaceMetrics.confidences.length > 0
          ? spaceMetrics.confidences.reduce((a, b) => a + b, 0) / spaceMetrics.confidences.length
          : 0,
        averageProcessingTime: spaceMetrics.attempts > 0 ? spaceMetrics.totalTime / spaceMetrics.attempts : 0,
        commonFailureReasons: [
          { reason: 'Unclear description', count: Math.floor(spaceMetrics.attempts * 0.3) },
          { reason: 'Missing participants', count: Math.floor(spaceMetrics.attempts * 0.2) },
          { reason: 'Complex workflow', count: Math.floor(spaceMetrics.attempts * 0.1) },
        ],
      },
    };
  }

  private async getUsagePatterns(spaceId: string, timeRange?: { start: Date; end: Date }) {
    // Simplified usage patterns - could be enhanced with real data
    const days = 30;
    const daily = Array(days).fill(0).map(() => Math.floor(Math.random() * 10));
    const weekly = Array(7).fill(0).map(() => Math.floor(Math.random() * 50));
    const monthly = Array(12).fill(0).map(() => Math.floor(Math.random() * 200));

    return { daily, weekly, monthly };
  }

  private calculateTemplateComplexity(template: CoordinationTemplate & { _count: { coordinationRuns: number } }): number {
    const metadata = template.metadata as any || {};
    const rolesCount = metadata.rolesCount || 1;
    const statesCount = metadata.statesCount || 1;
    const slotsCount = metadata.slotsCount || 1;
    const usageCount = template._count.coordinationRuns || 0;

    // Simple complexity calculation
    return Math.min(
      Math.round(
        (statesCount * 0.3) +
        (rolesCount * 0.4) +
        (slotsCount * 0.2) +
        (usageCount > 10 ? 1 : 0) // Bonus for well-used templates
      ),
      10
    );
  }

  // Enhanced method to find templates by name with fuzzy matching
  async findByNameInSpace(spaceId: string, name: string): Promise<CoordinationTemplate | null> {
    try {
      // First try exact match
      let template = await this.prisma.coordinationTemplate.findFirst({
        where: { spaceId, name: { equals: name, mode: 'insensitive' } },
        include: {
          roles: true,
          states: true,
          slots: true,
        },
      });

      if (!template) {
        // Try fuzzy match for similar names
        const templates = await this.prisma.coordinationTemplate.findMany({
          where: { spaceId },
          select: { id: true, name: true },
        });

        const similarTemplate = templates.find(t =>
          this.calculateStringSimilarity(t.name.toLowerCase(), name.toLowerCase()) > 0.8
        );

        if (similarTemplate) {
          template = await this.prisma.coordinationTemplate.findUnique({
            where: { id: similarTemplate.id },
            include: {
              roles: true,
              states: true,
              slots: true,
            },
          });
        }
      }

      return template;
    } catch (error: any) {
      this.logger.error(`Failed to find template by name: ${error.message}`);
      return null;
    }
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,      // deletion
          matrix[j - 1][i] + 1,      // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Create a new coordination template
   */
  async createTemplate(spaceId: string, data: CreateTemplateDto): Promise<CoordinationTemplate> {
    try {
      // Validate template structure
      const validation = templateSchemaValidator.safeParse(data);
      if (!validation.success) {
        throw new BadRequestException(`Invalid template structure: ${validation.error.message}`);
      }

      // Check for existing template with same name and version
      const existing = await this.prisma.coordinationTemplate.findFirst({
        where: {
          spaceId,
          name: data.name,
          version: data.version || '1.0',
        },
      });

      if (existing) {
        throw new ConflictException('Template with this name and version already exists');
      }

      // Create template with all related entities in a transaction
      const template = await this.prisma.$transaction(async (tx) => {
        // Create the template
        const newTemplate = await tx.coordinationTemplate.create({
          data: {
            spaceId,
            name: data.name,
            description: data.description,
            version: data.version || '1.0',
            isActive: data.isActive ?? true,
            schemaJson: data.schemaJson,
            metadata: data.metadata || {},
          },
        });

        // Create roles
        if (data.roles && data.roles.length > 0) {
          await tx.templateRole.createMany({
            data: data.roles.map(role => ({
              templateId: newTemplate.id,
              name: role.name,
              description: role.description,
              minParticipants: role.minParticipants || 1,
              maxParticipants: role.maxParticipants,
              capabilities: role.capabilities || [],
              constraints: role.constraints || {},
            })),
          });
        }

        // Create states
        if (data.states && data.states.length > 0) {
          await tx.templateState.createMany({
            data: data.states.map((state, index) => ({
              templateId: newTemplate.id,
              name: state.name,
              type: state.type,
              description: state.description,
              sequence: state.sequence ?? index,
              requiredSlots: state.requiredSlots || [],
              allowedRoles: state.allowedRoles || [],
              transitions: state.transitions || {},
              timeoutMinutes: state.timeoutMinutes,
              uiHints: state.uiHints || {},
            })),
          });
        }

        // Create slots
        if (data.slots && data.slots.length > 0) {
          await tx.templateSlot.createMany({
            data: data.slots.map(slot => ({
              templateId: newTemplate.id,
              name: slot.name,
              type: slot.type,
              description: slot.description,
              required: slot.required ?? false,
              defaultValue: slot.defaultValue,
              validation: slot.validation || {},
              visibility: slot.visibility || [],
              editable: slot.editable || [],
            })),
          });
        }

        return newTemplate;
      });

      // Fetch complete template with relations
      const completeTemplate = await this.getTemplateById(template.id);

      // Emit event for real-time updates
      this.eventsGateway.emitToSpace(spaceId, 'template:created', {
        templateId: template.id,
        name: template.name,
        version: template.version,
      });

      this.logger.log(`Created coordination template ${template.name} v${template.version} for space ${spaceId}`);
      return completeTemplate;
    } catch (error: any) {
      this.logger.error(`Failed to create template: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all templates for a space
   */
  async getTemplatesBySpace(
    spaceId: string,
    options?: {
      isActive?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ templates: CoordinationTemplate[]; total: number }> {
    try {
      const where: Prisma.CoordinationTemplateWhereInput = {
        spaceId,
        ...(options?.isActive !== undefined && { isActive: options.isActive }),
      };

      const [templates, total] = await this.prisma.$transaction([
        this.prisma.coordinationTemplate.findMany({
          where,
          include: {
            roles: true,
            states: {
              orderBy: { sequence: 'asc' },
            },
            slots: true,
            _count: {
              select: { coordinationRuns: true },
            },
          },
          take: options?.limit,
          skip: options?.offset,
          orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        }),
        this.prisma.coordinationTemplate.count({ where }),
      ]);

      return { templates, total };
    } catch (error: any) {
      this.logger.error(`Failed to get templates for space ${spaceId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a single template by ID
   */
  async getTemplateById(templateId: string): Promise<CoordinationTemplate> {
    try {
      const template = await this.prisma.coordinationTemplate.findUnique({
        where: { id: templateId },
        include: {
          roles: true,
          states: {
            orderBy: { sequence: 'asc' },
          },
          slots: true,
          _count: {
            select: { coordinationRuns: true },
          },
        },
      });

      if (!template) {
        throw new NotFoundException(`Template ${templateId} not found`);
      }

      return template;
    } catch (error: any) {
      this.logger.error(`Failed to get template ${templateId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update an existing template
   */
  async updateTemplate(
    templateId: string,
    data: UpdateTemplateDto
  ): Promise<CoordinationTemplate> {
    try {
      // Check if template exists and get full template data
      const existing = await this.prisma.coordinationTemplate.findUnique({
        where: { id: templateId },
        include: {
          roles: true,
          states: {
            orderBy: { sequence: 'asc' },
          },
          slots: true,
          _count: {
            select: { coordinationRuns: true },
          },
        },
      });

      if (!existing) {
        throw new NotFoundException(`Template ${templateId} not found`);
      }

      // If template has active runs, only allow certain updates
      if (existing._count.coordinationRuns > 0) {
        const restrictedFields = ['states', 'roles', 'slots'];
        const hasRestrictedChanges = restrictedFields.some(field => field in data);

        if (hasRestrictedChanges) {
          throw new BadRequestException(
            'Cannot modify states, roles, or slots for a template with active runs. Create a new version instead.'
          );
        }
      }

      // Merge existing template data with updates for full validation
      const mergedData: CreateTemplateDto = {
        name: data.name ?? existing.name,
        description: data.description ?? existing.description,
        version: existing.version,
        isActive: data.isActive ?? existing.isActive,
        schemaJson: data.schemaJson ?? existing.schemaJson as any,
        metadata: data.metadata ?? existing.metadata as any,
        roles: data.roles ?? existing.roles?.map(role => ({
          name: role.name,
          description: role.description || undefined,
          minParticipants: role.minParticipants,
          maxParticipants: role.maxParticipants || undefined,
          capabilities: role.capabilities,
          constraints: role.constraints as any,
        })),
        states: data.states ?? existing.states?.map(state => ({
          name: state.name,
          type: state.type,
          description: state.description || undefined,
          sequence: state.sequence,
          requiredSlots: state.requiredSlots,
          allowedRoles: state.allowedRoles,
          transitions: state.transitions as any,
          timeoutMinutes: state.timeoutMinutes || undefined,
          uiHints: state.uiHints as any,
        })),
        slots: data.slots ?? existing.slots?.map(slot => ({
          name: slot.name,
          type: slot.type,
          description: slot.description || undefined,
          required: slot.required,
          defaultValue: slot.defaultValue as any,
          validation: slot.validation as any,
          visibility: slot.visibility,
          editable: slot.editable,
        })),
      };

      // Run full validation on merged data
      const validationResult = await this.validateTemplate(mergedData);
      if (!validationResult.valid) {
        throw new BadRequestException(
          `Invalid template structure: ${validationResult.errors?.join(', ')}`
        );
      }

      // Update template
      const updated = await this.prisma.$transaction(async (tx) => {
        // Update main template
        const updatedTemplate = await tx.coordinationTemplate.update({
          where: { id: templateId },
          data: {
            name: data.name,
            description: data.description,
            isActive: data.isActive,
            schemaJson: data.schemaJson,
            metadata: data.metadata,
          },
        });

        // Update roles if provided (only if no active runs)
        if (data.roles && existing._count.coordinationRuns === 0) {
          await tx.templateRole.deleteMany({ where: { templateId } });
          await tx.templateRole.createMany({
            data: data.roles.map(role => ({
              templateId,
              name: role.name,
              description: role.description,
              minParticipants: role.minParticipants || 1,
              maxParticipants: role.maxParticipants,
              capabilities: role.capabilities || [],
              constraints: role.constraints || {},
            })),
          });
        }

        // Update states if provided (only if no active runs)
        if (data.states && existing._count.coordinationRuns === 0) {
          await tx.templateState.deleteMany({ where: { templateId } });
          await tx.templateState.createMany({
            data: data.states.map((state, index) => ({
              templateId,
              name: state.name,
              type: state.type,
              description: state.description,
              sequence: state.sequence ?? index,
              requiredSlots: state.requiredSlots || [],
              allowedRoles: state.allowedRoles || [],
              transitions: state.transitions || {},
              timeoutMinutes: state.timeoutMinutes,
              uiHints: state.uiHints || {},
            })),
          });
        }

        // Update slots if provided (only if no active runs)
        if (data.slots && existing._count.coordinationRuns === 0) {
          await tx.templateSlot.deleteMany({ where: { templateId } });
          await tx.templateSlot.createMany({
            data: data.slots.map(slot => ({
              templateId,
              name: slot.name,
              type: slot.type,
              description: slot.description,
              required: slot.required ?? false,
              defaultValue: slot.defaultValue,
              validation: slot.validation || {},
              visibility: slot.visibility || [],
              editable: slot.editable || [],
            })),
          });
        }

        return updatedTemplate;
      });

      // Fetch complete template
      const completeTemplate = await this.getTemplateById(updated.id);

      // Emit event
      this.eventsGateway.emitToSpace(existing.spaceId, 'template:updated', {
        templateId: updated.id,
        name: updated.name,
        version: updated.version,
      });

      this.logger.log(`Updated template ${templateId}`);
      return completeTemplate;
    } catch (error: any) {
      this.logger.error(`Failed to update template ${templateId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete a template (soft delete by setting isActive = false)
   */
  async deleteTemplate(templateId: string): Promise<void> {
    try {
      const template = await this.prisma.coordinationTemplate.findUnique({
        where: { id: templateId },
        include: {
          _count: {
            select: { coordinationRuns: true },
          },
        },
      });

      if (!template) {
        throw new NotFoundException(`Template ${templateId} not found`);
      }

      // Check for active runs
      const activeRuns = await this.prisma.coordinationRun.count({
        where: {
          templateId,
          status: 'active',
        },
      });

      if (activeRuns > 0) {
        throw new BadRequestException('Cannot delete template with active coordination runs');
      }

      // Soft delete by deactivating
      await this.prisma.coordinationTemplate.update({
        where: { id: templateId },
        data: { isActive: false },
      });

      // Emit event
      this.eventsGateway.emitToSpace(template.spaceId, 'template:deleted', {
        templateId,
        name: template.name,
      });

      this.logger.log(`Deleted (deactivated) template ${templateId}`);
    } catch (error: any) {
      this.logger.error(`Failed to delete template ${templateId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Activate or deactivate a template version
   */
  async setTemplateActive(templateId: string, isActive: boolean): Promise<CoordinationTemplate> {
    try {
      const template = await this.prisma.coordinationTemplate.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        throw new NotFoundException(`Template ${templateId} not found`);
      }

      // If activating, deactivate other versions of the same template
      if (isActive) {
        await this.prisma.coordinationTemplate.updateMany({
          where: {
            spaceId: template.spaceId,
            name: template.name,
            id: { not: templateId },
          },
          data: { isActive: false },
        });
      }

      const updated = await this.prisma.coordinationTemplate.update({
        where: { id: templateId },
        data: { isActive },
        include: {
          roles: true,
          states: {
            orderBy: { sequence: 'asc' },
          },
          slots: true,
        },
      });

      // Emit event
      this.eventsGateway.emitToSpace(template.spaceId, 'template:status', {
        templateId,
        name: template.name,
        version: template.version,
        isActive,
      });

      this.logger.log(`Set template ${templateId} active status to ${isActive}`);
      return updated;
    } catch (error: any) {
      this.logger.error(`Failed to set template ${templateId} active status: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate a template structure
   */
  async validateTemplate(data: CreateTemplateDto): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const validation = templateSchemaValidator.safeParse(data);

      if (!validation.success) {
        return {
          valid: false,
          errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        };
      }

      // Additional business logic validation
      const errors: string[] = [];

      // Check state transitions are valid
      if (data.states) {
        const stateNames = new Set(data.states.map(s => s.name));
        for (const state of data.states) {
          if (state.transitions) {
            const transitions = state.transitions as any;
            if (transitions.nextStates) {
              for (const nextState of transitions.nextStates) {
                if (!stateNames.has(nextState)) {
                  errors.push(`State ${state.name} references non-existent next state: ${nextState}`);
                }
              }
            }
          }
        }
      }

      // Check slot references in states
      if (data.states && data.slots) {
        const slotNames = new Set(data.slots.map(s => s.name));
        for (const state of data.states) {
          if (state.requiredSlots) {
            for (const slotName of state.requiredSlots) {
              if (!slotNames.has(slotName)) {
                errors.push(`State ${state.name} references non-existent slot: ${slotName}`);
              }
            }
          }
        }
      }

      // Check role references in states
      if (data.states && data.roles) {
        const roleNames = new Set(data.roles.map(r => r.name));
        for (const state of data.states) {
          if (state.allowedRoles) {
            for (const roleName of state.allowedRoles) {
              if (!roleNames.has(roleName)) {
                errors.push(`State ${state.name} references non-existent role: ${roleName}`);
              }
            }
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Failed to validate template: ${error.message}`, error.stack);
      return {
        valid: false,
        errors: ['Internal validation error'],
      };
    }
  }

  /**
   * Generate preview data for template testing
   */
  async generateTemplatePreview(templateId: string): Promise<any> {
    try {
      const template = await this.getTemplateById(templateId);

      // Generate sample data based on template structure
      const preview = {
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          version: template.version,
        },
        sampleFlow: {
          states: (template as any).states?.map((state: any) => ({
            name: state.name,
            type: state.type,
            description: state.description,
            requiredData: (template as any).slots?.filter((slot: any) =>
              state.requiredSlots?.includes(slot.name)
            ).map((slot: any) => ({
              name: slot.name,
              type: slot.type,
              required: slot.required,
            })),
          })),
        },
        participants: (template as any).roles?.map((role: any) => ({
          role: role.name,
          description: role.description,
          minRequired: role.minParticipants,
          maxAllowed: role.maxParticipants,
          permissions: role.capabilities,
        })),
        dataCollection: (template as any).slots?.map((slot: any) => ({
          field: slot.name,
          type: slot.type,
          required: slot.required,
          validation: slot.validation,
          sampleValue: this.generateSampleValue(slot.type as string),
        })),
      };

      return preview;
    } catch (error: any) {
      this.logger.error(`Failed to generate template preview: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Clone an existing template
   */
  async cloneTemplate(
    templateId: string,
    newName: string,
    newVersion?: string
  ): Promise<CoordinationTemplate> {
    try {
      const source = await this.getTemplateById(templateId);

      const clonedData: CreateTemplateDto = {
        name: newName,
        description: `Clone of ${source.description}`,
        version: newVersion || '1.0',
        isActive: false, // Start as inactive
        schemaJson: source.schemaJson as any,
        metadata: {
          ...(source.metadata as any || {}),
          clonedFrom: templateId,
          clonedAt: new Date().toISOString(),
        },
        roles: (source as any).roles?.map((role: any) => ({
          name: role.name,
          description: role.description,
          minParticipants: role.minParticipants,
          maxParticipants: role.maxParticipants,
          capabilities: role.capabilities,
          constraints: role.constraints as any,
        })),
        states: (source as any).states?.map((state: any) => ({
          name: state.name,
          type: state.type,
          description: state.description,
          sequence: state.sequence,
          requiredSlots: state.requiredSlots,
          allowedRoles: state.allowedRoles,
          transitions: state.transitions as any,
          timeoutMinutes: state.timeoutMinutes,
          uiHints: state.uiHints as any,
        })),
        slots: (source as any).slots?.map((slot: any) => ({
          name: slot.name,
          type: slot.type,
          description: slot.description,
          required: slot.required,
          defaultValue: slot.defaultValue as any,
          validation: slot.validation as any,
          visibility: slot.visibility,
          editable: slot.editable,
        })),
      };

      return this.createTemplate(source.spaceId, clonedData);
    } catch (error: any) {
      this.logger.error(`Failed to clone template ${templateId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Compile a template from natural language description
   */
  async compileFromDescription(spaceId: string, description: string): Promise<{
    valid: boolean;
    template?: CoordinationTemplate;
    errors?: string[];
    rawOutput?: string;
    confidence?: number;
  }> {
    try {
      this.logger.log(`Compiling template from description for space ${spaceId}: ${description.substring(0, 100)}...`);

      // Use AI service to compile the template
      const aiResult = await this.aiService.compileTemplate(description, spaceId);

      if (!aiResult.valid) {
        this.logger.warn(`AI template compilation failed: ${aiResult.errors?.join(', ')}`);
        return {
          valid: false,
          errors: aiResult.errors || ['Template compilation failed'],
          rawOutput: aiResult.rawOutput,
          confidence: aiResult.confidence || 0.2
        };
      }

      // Validate the AI-generated template with our business logic
      const validationResult = await this.validateTemplate(aiResult.template);
      if (!validationResult.valid) {
        this.logger.warn(`AI-generated template failed validation: ${validationResult.errors?.join(', ')}`);
        return {
          valid: false,
          errors: [
            'AI-generated template has validation errors:',
            ...(validationResult.errors || ['Unknown validation error'])
          ],
          rawOutput: aiResult.rawOutput,
          confidence: 0.4
        };
      }

      // Template is valid - return the compiled template data (not saved to database yet)
      this.logger.log(`Successfully compiled template from description for space ${spaceId}`);
      return {
        valid: true,
        template: {
          ...aiResult.template,
          spaceId, // Ensure spaceId is set
          createdAt: new Date(),
          updatedAt: new Date(),
          id: 'preview-' + Date.now(), // Temporary ID for preview
        } as any,
        confidence: aiResult.confidence || 0.8,
        rawOutput: aiResult.rawOutput
      };
    } catch (error: any) {
      this.logger.error(`Failed to compile template from description: ${error.message}`, error.stack);
      return {
        valid: false,
        errors: [`Compilation failed: ${error.message}`],
        confidence: 0.1
      };
    }
  }

  async designerTurn(
    spaceId: string,
    userId: string | undefined,
    payload: { history: Array<{ role: 'user' | 'assistant'; content: string }>; notes?: Record<string, any>; graph?: Record<string, any> },
  ) {
    try {
      this.logger.log(`Designer turn requested for space ${spaceId} by ${userId || 'unknown user'}`);

      const response = await this.aiService.designerTurn(spaceId, {
        history: payload.history,
        notes: payload.notes,
        graph: payload.graph,
      });

      return response;
    } catch (error: any) {
      this.logger.error(`Designer turn failed for space ${spaceId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async listDesignerSessions(spaceId: string, templateId?: string) {
    return this.prisma.designerSession.findMany({
      where: {
        spaceId,
        ...(templateId ? { templateId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        spaceId: true,
        templateId: true,
        title: true,
        status: true,
        summary: true,
        ready: true,
        lastReply: true,
        updatedAt: true,
        createdAt: true,
      },
    });
  }

  async getDesignerSession(spaceId: string, sessionId: string) {
    const session = await this.prisma.designerSession.findFirst({
      where: { id: sessionId, spaceId },
    });

    if (!session) {
      throw new NotFoundException(`Designer session ${sessionId} not found in this space`);
    }

    return session;
  }

  async createDesignerSession(
    spaceId: string,
    userId: string | undefined,
    data: {
      templateId?: string;
      title?: string;
      status?: string;
      summary?: string;
      ready?: boolean;
      lastReply?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      notes?: Record<string, any>;
      graph?: Record<string, any>;
      followUps?: string[];
      metadata?: Record<string, any>;
    },
  ) {
    return this.prisma.designerSession.create({
      data: {
        spaceId,
        templateId: data.templateId ?? null,
        title: data.title ?? null,
        status: data.status ?? 'draft',
        summary: data.summary ?? null,
        ready: data.ready ?? false,
        lastReply: data.lastReply ?? null,
        history: data.history ?? [],
        notes: data.notes ?? {},
        graph: data.graph ?? {},
        followUps: data.followUps ?? [],
        metadata: data.metadata ?? (userId ? { createdBy: userId } : undefined),
      },
    });
  }

  async updateDesignerSession(
    spaceId: string,
    sessionId: string,
    data: {
      title?: string;
      status?: string;
      summary?: string;
      ready?: boolean;
      lastReply?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      notes?: Record<string, any>;
      graph?: Record<string, any>;
      followUps?: string[];
      metadata?: Record<string, any>;
    },
  ) {
    const existing = await this.prisma.designerSession.findFirst({
      where: { id: sessionId, spaceId },
    });

    if (!existing) {
      throw new NotFoundException(`Designer session ${sessionId} not found in this space`);
    }

    const updateData: Prisma.DesignerSessionUpdateInput = {};

    if (typeof data.title !== 'undefined') updateData.title = data.title;
    if (typeof data.status !== 'undefined') updateData.status = data.status;
    if (typeof data.summary !== 'undefined') updateData.summary = data.summary;
    if (typeof data.ready !== 'undefined') updateData.ready = data.ready;
    if (typeof data.lastReply !== 'undefined') updateData.lastReply = data.lastReply;
    if (typeof data.history !== 'undefined') updateData.history = data.history;
    if (typeof data.notes !== 'undefined') updateData.notes = data.notes;
    if (typeof data.graph !== 'undefined') updateData.graph = data.graph;
    if (typeof data.followUps !== 'undefined') updateData.followUps = data.followUps;
    if (typeof data.metadata !== 'undefined') {
      updateData.metadata = data.metadata;
    }

    return this.prisma.designerSession.update({
      where: { id: sessionId },
      data: updateData,
    });
  }

  async deleteDesignerSession(spaceId: string, sessionId: string) {
    const existing = await this.prisma.designerSession.findFirst({
      where: { id: sessionId, spaceId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Designer session ${sessionId} not found in this space`);
    }

    await this.prisma.designerSession.delete({ where: { id: sessionId } });
    return { success: true };
  }

  /**
   * Create a template from AI compilation result
   */
  async createFromCompilation(spaceId: string, compiledTemplate: any): Promise<CoordinationTemplate> {
    try {
      // Extract the template data from AI compilation result
      const templateData: CreateTemplateDto = {
        name: compiledTemplate.name,
        description: compiledTemplate.description,
        version: compiledTemplate.version || '1.0',
        isActive: compiledTemplate.isActive ?? true,
        schemaJson: compiledTemplate.schemaJson,
        metadata: {
          ...(compiledTemplate.metadata || {}),
          compiledFromAi: true,
          compiledAt: new Date().toISOString(),
        },
        roles: compiledTemplate.roles,
        states: compiledTemplate.states,
        slots: compiledTemplate.slots,
      };

      // Create the template using existing creation logic
      return await this.createTemplate(spaceId, templateData);
    } catch (error: any) {
      this.logger.error(`Failed to create template from compilation: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Enhanced template preview that works with AI-compiled templates
   */
  async generatePreviewFromTemplateData(template: any): Promise<any> {
    try {
      // Handle both saved templates (with ID) and compiled previews
      const templateData = template.id?.startsWith('preview-') ? template : await this.getTemplateById(template.id || template);

      // Generate sample data based on template structure
      const preview = {
        template: {
          id: templateData.id,
          name: templateData.name,
          description: templateData.description,
          version: templateData.version,
          isPreview: templateData.id?.startsWith('preview-') || false,
        },
        coordinationPattern: templateData.schemaJson ? {
          express: templateData.schemaJson.express,
          explore: templateData.schemaJson.explore,
          commit: templateData.schemaJson.commit,
          evidence: templateData.schemaJson.evidence,
          confirm: templateData.schemaJson.confirm,
        } : null,
        sampleFlow: {
          states: templateData.states?.map((state: any) => ({
            name: state.name,
            type: state.type,
            description: state.description,
            sequence: state.sequence,
            requiredData: templateData.slots?.filter((slot: any) =>
              state.requiredSlots?.includes(slot.name)
            ).map((slot: any) => ({
              name: slot.name,
              type: slot.type,
              required: slot.required,
            })),
          })).sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0)),
        },
        participants: templateData.roles?.map((role: any) => ({
          role: role.name,
          description: role.description,
          minRequired: role.minParticipants,
          maxAllowed: role.maxParticipants,
          permissions: role.capabilities,
        })),
        dataCollection: templateData.slots?.map((slot: any) => ({
          field: slot.name,
          type: slot.type,
          required: slot.required,
          validation: slot.validation,
          sampleValue: this.generateSampleValue(slot.type as string),
        })),
      };

      return preview;
    } catch (error: any) {
      this.logger.error(`Failed to generate template preview: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Helper to generate sample values for different types
   */
  private generateSampleValue(type: string): any {
    switch (type) {
      case 'text':
        return 'Sample text value';
      case 'number':
        return 42;
      case 'date':
        return new Date().toISOString();
      case 'file':
        return 'sample-file.pdf';
      case 'location':
        return { lat: 40.7128, lng: -74.0060, address: 'New York, NY' };
      case 'currency':
        return { amount: 100, currency: 'USD' };
      default:
        return null;
    }
  }
}
