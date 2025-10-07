import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ServiceUnavailableException,
  UseGuards,
  UseInterceptors,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  PayloadTooLargeException,
  Headers,
  Req,
  Logger,
  HttpException,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';

// Custom TooManyRequestsException
class TooManyRequestsException extends HttpException {
  constructor(message?: string) {
    super(message || 'Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
  }
}
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';
import { z } from 'zod';

// Enhanced validation schemas
const compileTemplateSchema = z.object({
  description: z.string()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description cannot exceed 2000 characters'),
  preview: z.boolean().optional().default(true),
  metadata: z.object({
    complexity: z.number().min(1).max(10).optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
    category: z.string().max(100).optional(),
  }).optional(),
});

const saveCompiledTemplateSchema = z.object({
  compiledTemplate: z.object({
    name: z.string().min(1, 'Template name is required').max(100, 'Template name cannot exceed 100 characters'),
    description: z.string().min(10, 'Description must be at least 10 characters').max(2000, 'Description cannot exceed 2000 characters'),
    roles: z.array(z.any()).min(1, 'At least one role is required'),
    states: z.array(z.any()).min(1, 'At least one state is required'),
    slots: z.array(z.any()).optional(),
  }).required(),
});

const previewTemplateSchema = z.object({
  template: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
  }).required(),
});

const designerMessageSchema = z.object({
  role: z.enum(['user', 'assistant']).default('user'),
  content: z.string().min(1).max(4000),
});

const designerTurnSchema = z.object({
  sessionId: z.string().uuid().optional(),
  history: z.array(designerMessageSchema).max(40).default([]),
  notes: z.record(z.any()).optional(),
  graph: z.record(z.any()).optional(),
});

const designerSessionCreateSchema = z.object({
  title: z.string().max(200).optional(),
  templateId: z.string().uuid().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  ready: z.boolean().optional(),
  lastReply: z.string().optional(),
  notes: z.record(z.any()).optional(),
  graph: z.record(z.any()).optional(),
  history: z.array(designerMessageSchema).optional(),
  followUps: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

const designerSessionUpdateSchema = designerSessionCreateSchema.partial();

// Rate limiting configuration
const RATE_LIMITS = {
  DEFAULT: { ttl: 60000, limit: 100 }, // 100 requests per minute
  COMPILE: { ttl: 300000, limit: 10 }, // 10 compilation requests per 5 minutes
  CREATE: { ttl: 60000, limit: 20 },   // 20 template creations per minute
  UPDATE: { ttl: 60000, limit: 50 },   // 50 updates per minute
};

// Request tracking for analytics
const requestStats = new Map<string, { count: number; lastReset: number }>();

@Controller('spaces/:spaceId/templates')
@UseGuards(ThrottlerGuard)
export class TemplatesController {
  private readonly logger = new Logger(TemplatesController.name);

  constructor(private readonly templatesService: TemplatesService) {}

  // Enhanced request validation and analytics tracking
  private validateSpaceAccess(spaceId: string, headers: Record<string, any>): void {
    // Basic space access validation
    if (!spaceId || spaceId.length < 3) {
      throw new BadRequestException('Invalid space ID format');
    }

    // Check if user has access to this space (simplified version)
    const userId = headers['x-user-id'];
    if (!userId) {
      throw new UnauthorizedException('User authentication required');
    }
  }

  private trackRequest(endpoint: string, spaceId: string, userId?: string): void {
    try {
      const key = `${endpoint}:${spaceId}:${userId || 'anonymous'}`;
      const now = Date.now();
      const stats = requestStats.get(key) || { count: 0, lastReset: now };

      // Reset counter every hour
      if (now - stats.lastReset > 3600000) {
        stats.count = 1;
        stats.lastReset = now;
      } else {
        stats.count++;
      }

      requestStats.set(key, stats);

      // Log high usage patterns
      if (stats.count > 50) {
        this.logger.warn(`High usage detected: ${key} - ${stats.count} requests in last hour`);
      }
    } catch (error) {
      this.logger.error('Failed to track request:', error);
    }
  }

  private validateRequestSize(body: any): void {
    const jsonSize = JSON.stringify(body).length;
    const maxSize = 1024 * 1024; // 1MB limit

    if (jsonSize > maxSize) {
      throw new PayloadTooLargeException('Request payload exceeds maximum size limit');
    }
  }

  /**
   * Create a new coordination template
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit:RATE_LIMITS.CREATE.limit, ttl: RATE_LIMITS.CREATE.ttl } })
  async createTemplate(
    @Param('spaceId') spaceId: string,
    @Body() createDto: CreateTemplateDto,
    @Headers() headers: Record<string, string>,
    @Req() request: Request,
  ) {
    try {
      // Enhanced validation and tracking
      this.validateSpaceAccess(spaceId, headers);
      this.validateRequestSize(createDto);
      this.trackRequest('create', spaceId, headers['x-user-id']);

      // Check for duplicate template names
      const existing = await this.templatesService.findByNameInSpace(spaceId, createDto.name);
      if (existing) {
        throw new ConflictException(`Template with name "${createDto.name}" already exists in this space`);
      }

      const template = await this.templatesService.createTemplate(spaceId, createDto);

      this.logger.log(`Template created successfully: ${template.id} in space ${spaceId}`);

      return {
        success: true,
        data: template,
        message: 'Template created successfully',
      };
    } catch (error: any) {
      this.logger.error(`Failed to create template in space ${spaceId}:`, error);

      if (error instanceof ConflictException) {
        throw error;
      }

      throw new BadRequestException(
        error.message || 'Failed to create template. Please check your input and try again.'
      );
    }
  }

  /**
   * Get all templates for a space with caching
   */
  @Get()
  // @UseInterceptors(CacheInterceptor) // TODO: Configure cache module
  @Throttle({ default: { limit:RATE_LIMITS.DEFAULT.limit, ttl: RATE_LIMITS.DEFAULT.ttl } })
  async getTemplates(
    @Param('spaceId') spaceId: string,
    @Headers() headers: Record<string, string>,
    @Query('isActive') isActive?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('search') search?: string,
  ) {
    try {
      this.validateSpaceAccess(spaceId, headers);
      this.trackRequest('list', spaceId, headers['x-user-id']);

      // Enhanced query parameter validation
      const options = {
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        limit: Math.min(Math.max(parseInt(limit || '20', 10), 1), 100), // Cap at 100
        offset: Math.max(parseInt(offset || '0', 10), 0),
        sortBy: sortBy && ['name', 'createdAt', 'updatedAt', 'version'].includes(sortBy)
          ? sortBy : 'updatedAt',
        sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
        search: search?.trim().substring(0, 100), // Limit search query length
      };

      if (options.offset > 10000) {
        throw new BadRequestException('Offset too large. Please use pagination more efficiently.');
      }

      const startTime = Date.now();
      const result = await this.templatesService.getTemplatesBySpace(spaceId, options);
      const queryTime = Date.now() - startTime;

      // Log slow queries
      if (queryTime > 1000) {
        this.logger.warn(`Slow query detected: ${queryTime}ms for space ${spaceId}`);
      }

      return {
        success: true,
        data: result.templates,
        total: result.total,
        pagination: {
          limit: options.limit,
          offset: options.offset,
          hasMore: result.total > options.offset + options.limit,
          totalPages: Math.ceil(result.total / options.limit),
          currentPage: Math.floor(options.offset / options.limit) + 1,
        },
        queryTime: queryTime,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get templates for space ${spaceId}:`, error);
      throw new BadRequestException(error.message || 'Failed to retrieve templates');
    }
  }

  /**
   * Get a specific template by ID
   */
  @Get(':templateId')
  async getTemplate(
    @Param('spaceId') spaceId: string,
    @Param('templateId') templateId: string,
  ) {
    const template = await this.templatesService.getTemplateById(templateId);

    // Verify template belongs to this space
    if (template.spaceId !== spaceId) {
      throw new BadRequestException('Template does not belong to this space');
    }

    return {
      success: true,
      data: template,
    };
  }

  /**
   * Update a template
   */
  @Put(':templateId')
  async updateTemplate(
    @Param('spaceId') spaceId: string,
    @Param('templateId') templateId: string,
    @Body() updateDto: UpdateTemplateDto,
  ) {
    // Verify template belongs to this space
    const existing = await this.templatesService.getTemplateById(templateId);
    if (existing.spaceId !== spaceId) {
      throw new BadRequestException('Template does not belong to this space');
    }

    const template = await this.templatesService.updateTemplate(templateId, updateDto);
    return {
      success: true,
      data: template,
    };
  }

  /**
   * Delete (deactivate) a template
   */
  @Delete(':templateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTemplate(
    @Param('spaceId') spaceId: string,
    @Param('templateId') templateId: string,
  ) {
    // Verify template belongs to this space
    const existing = await this.templatesService.getTemplateById(templateId);
    if (existing.spaceId !== spaceId) {
      throw new BadRequestException('Template does not belong to this space');
    }

    await this.templatesService.deleteTemplate(templateId);
  }

  /**
   * Activate or deactivate a template
   */
  @Put(':templateId/status')
  async setTemplateStatus(
    @Param('spaceId') spaceId: string,
    @Param('templateId') templateId: string,
    @Body() body: { isActive: boolean },
  ) {
    // Verify template belongs to this space
    const existing = await this.templatesService.getTemplateById(templateId);
    if (existing.spaceId !== spaceId) {
      throw new BadRequestException('Template does not belong to this space');
    }

    const template = await this.templatesService.setTemplateActive(templateId, body.isActive);
    return {
      success: true,
      data: template,
    };
  }

  /**
   * Validate a template structure
   */
  @Post('validate')
  async validateTemplate(
    @Param('spaceId') spaceId: string,
    @Body() templateDto: CreateTemplateDto,
  ) {
    const result = await this.templatesService.validateTemplate(templateDto);
    return {
      success: result.valid,
      valid: result.valid,
      errors: result.errors,
    };
  }

  /**
   * Generate a preview of a template
   */
  @Get(':templateId/preview')
  async previewTemplate(
    @Param('spaceId') spaceId: string,
    @Param('templateId') templateId: string,
  ) {
    // Verify template belongs to this space
    const existing = await this.templatesService.getTemplateById(templateId);
    if (existing.spaceId !== spaceId) {
      throw new BadRequestException('Template does not belong to this space');
    }

    const preview = await this.templatesService.generateTemplatePreview(templateId);
    return {
      success: true,
      data: preview,
    };
  }

  /**
   * Clone an existing template
   */
  @Post(':templateId/clone')
  async cloneTemplate(
    @Param('spaceId') spaceId: string,
    @Param('templateId') templateId: string,
    @Body() body: { name: string; version?: string },
  ) {
    // Verify template belongs to this space
    const existing = await this.templatesService.getTemplateById(templateId);
    if (existing.spaceId !== spaceId) {
      throw new BadRequestException('Template does not belong to this space');
    }

    if (!body.name) {
      throw new BadRequestException('New template name is required');
    }

    const cloned = await this.templatesService.cloneTemplate(
      templateId,
      body.name,
      body.version
    );

    return {
      success: true,
      data: cloned,
    };
  }

  /**
   * Enhanced template compilation with strict rate limiting and validation
   */
  @Post('compile')
  @Throttle({ default: { limit:RATE_LIMITS.COMPILE.limit, ttl: RATE_LIMITS.COMPILE.ttl } }) // Strict rate limiting for AI calls
  async compileTemplate(
    @Param('spaceId') spaceId: string,
    @Body() body: { description: string; preview?: boolean; metadata?: any },
    @Headers() headers: Record<string, string>,
    @Req() request: Request,
  ) {
    const startTime = Date.now();
    const userId = headers['x-user-id'];

    try {
      // Enhanced validation and security checks
      this.validateSpaceAccess(spaceId, headers);
      this.validateRequestSize(body);
      this.trackRequest('compile', spaceId, userId);

      // Enhanced input validation
      const validation = compileTemplateSchema.safeParse(body);
      if (!validation.success) {
        this.logger.warn(`Invalid compilation request from ${userId} in space ${spaceId}:`, validation.error);
        throw new BadRequestException({
          message: 'Invalid request parameters',
          errors: validation.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code
          })),
        });
      }

      const { description, preview, metadata } = validation.data;

      // Additional content validation
      if (description.includes('<script>') || description.includes('javascript:')) {
        throw new BadRequestException('Description contains potentially malicious content');
      }

      // Log compilation attempt with metadata
      this.logger.log({
        message: 'Template compilation started',
        spaceId,
        userId,
        descriptionLength: description.length,
        preview: preview,
        requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      });

      // Check compilation quota (could be implemented based on user tier)
      const compilationCount = this.trackCompilationQuota(userId, spaceId);
      if (compilationCount > 100) { // Daily limit
        throw new TooManyRequestsException('Daily compilation quota exceeded');
      }

      // Compile template using AI service with enhanced error handling
      const result = await this.templatesService.compileFromDescription(spaceId, description);
      const processingTime = Date.now() - startTime;

      this.logger.log({
        message: `Template compilation ${result.valid ? 'succeeded' : 'failed'}`,
        spaceId,
        userId,
        processingTime,
        confidence: result.confidence,
        valid: result.valid,
      });

      if (result.valid && result.template) {
        // If preview is false, save the template to database
        if (!preview) {
          try {
            const savedTemplate = await this.templatesService.createFromCompilation(spaceId, result.template);
            this.logger.log(`Compiled template saved: ${savedTemplate.id} in space ${spaceId}`);

            return {
              success: true,
              valid: true,
              template: savedTemplate,
              saved: true,
              confidence: result.confidence,
              processingTime,
              metadata: {
                templateId: savedTemplate.id,
                version: savedTemplate.version,
                participantCount: (result.template as any).participants?.length || 0,
                stateCount: (result.template as any).states?.length || 0,
              },
            };
          } catch (saveError: any) {
            this.logger.error(`Failed to save compiled template: ${saveError?.message || saveError}`);
            // Return the compilation result even if save fails
            return {
              success: true,
              valid: true,
              template: result.template,
              preview: true,
              confidence: result.confidence,
              processingTime,
              warning: 'Template compiled successfully but could not be saved. Please try saving manually.',
            };
          }
        }

        // Return preview only
        return {
          success: true,
          valid: true,
          template: result.template,
          preview: true,
          confidence: result.confidence,
          processingTime,
          metadata: {
            participantCount: (result.template as any).participants?.length || 0,
            stateCount: (result.template as any).states?.length || 0,
            estimatedComplexity: this.calculateComplexity(result.template),
          },
        };
      } else {
        // Compilation failed - provide detailed feedback
        const errorDetails = {
          success: false,
          valid: false,
          errors: result.errors || ['Template compilation failed due to unclear description'],
          confidence: result.confidence || 0.1,
          processingTime,
          suggestions: this.generateCompilationSuggestions(description, result.errors),
        };

        this.logger.warn(`Template compilation failed for space ${spaceId}:`, errorDetails);
        return errorDetails;
      }
    } catch (error: any) {
      const processingTime = Date.now() - startTime;

      this.logger.error({
        message: 'Template compilation error',
        spaceId,
        userId,
        error: error.message,
        processingTime,
        stack: error.stack,
      });

      // Enhanced error classification and handling
      if (error instanceof TooManyRequestsException) {
        throw error;
      }

      if (error.message?.includes('AI service') || error.message?.includes('quota')) {
        throw new ServiceUnavailableException({
          message: 'AI compilation service is temporarily unavailable',
          retryAfter: 300, // 5 minutes
          code: 'AI_SERVICE_UNAVAILABLE',
        });
      }

      if (error.message?.includes('timeout')) {
        throw new ServiceUnavailableException({
          message: 'Template compilation timed out. Please try with a simpler description.',
          code: 'COMPILATION_TIMEOUT',
        });
      }

      throw new BadRequestException({
        message: 'Template compilation failed',
        error: error.message || 'Unknown compilation error',
        code: 'COMPILATION_FAILED',
        suggestions: [
          'Try providing more specific details about participants and workflow steps',
          'Ensure your description is between 10-2000 characters',
          'Avoid technical jargon and use clear, simple language',
        ],
      });
    }
  }

  // Helper methods for enhanced compilation handling
  private trackCompilationQuota(userId: string, spaceId: string): number {
    const key = `quota:${userId}:${spaceId}:${new Date().toDateString()}`;
    const current = requestStats.get(key)?.count || 0;
    requestStats.set(key, { count: current + 1, lastReset: Date.now() });
    return current + 1;
  }

  private calculateComplexity(template: any): number {
    const participantCount = template.participants?.length || 0;
    const stateCount = template.states?.length || 0;
    const dataFieldCount = template.dataCollection?.length || 0;

    return Math.min(Math.round(
      (stateCount * 0.3) +
      (participantCount * 0.4) +
      (dataFieldCount * 0.2) +
      (template.coordinationPattern ? 1 : 0)
    ), 10);
  }

  private generateCompilationSuggestions(description: string, errors?: string[]): string[] {
    const suggestions: string[] = [];

    if (description.length < 50) {
      suggestions.push('Provide more detail about the coordination process');
    }

    if (!description.toLowerCase().includes('participant') && !description.toLowerCase().includes('user')) {
      suggestions.push('Specify who will be participating in the coordination process');
    }

    if (errors?.some(e => e.includes('unclear'))) {
      suggestions.push('Break down the process into clear, sequential steps');
    }

    if (suggestions.length === 0) {
      suggestions.push(
        'Try describing the process as: "Help [participants] to [main goal] by [key steps]"',
        'Include information about what data needs to be collected',
        'Specify the desired outcome or end state'
      );
    }

    return suggestions;
  }

  /**
   * Conversational blueprint designer turn
   */
  @Post('designer/turn')
  @Throttle({ default: { limit: RATE_LIMITS.DEFAULT.limit, ttl: RATE_LIMITS.DEFAULT.ttl } })
  async designerTurn(
    @Param('spaceId') spaceId: string,
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    this.validateSpaceAccess(spaceId, headers);
    this.trackRequest('designer-turn', spaceId, headers['x-user-id']);

    const validation = designerTurnSchema.safeParse(body);
    if (!validation.success) {
      throw new BadRequestException({
        message: 'Invalid designer turn payload',
        errors: validation.error.errors.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      });
    }

    const { sessionId, ...payload } = validation.data;

    try {
      const response = await this.templatesService.designerTurn(spaceId, headers['x-user-id'], payload);
      return {
        success: true,
        data: response,
        sessionId,
      };
    } catch (error: any) {
      this.logger.error(`Designer turn failed for space ${spaceId}: ${error.message}`);
      const status = error?.status || error?.statusCode;
      if (status) {
        throw new HttpException(error.message || 'Designer turn failed', status);
      }
      throw new ServiceUnavailableException('Blueprint designer service is unavailable. Please try again shortly.');
    }
  }

  /**
   * List designer sessions for a space (optionally scoped to a template)
   */
  @Get('designer/sessions')
  async listDesignerSessions(
    @Param('spaceId') spaceId: string,
    @Headers() headers: Record<string, string>,
    @Query('templateId') templateId?: string,
  ) {
    this.validateSpaceAccess(spaceId, headers);
    const sessions = await this.templatesService.listDesignerSessions(spaceId, templateId);
    return {
      success: true,
      data: sessions,
    };
  }

  /**
   * Create a new designer session
   */
  @Post('designer/sessions')
  async createDesignerSession(
    @Param('spaceId') spaceId: string,
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    this.validateSpaceAccess(spaceId, headers);
    this.validateRequestSize(body);

    const validation = designerSessionCreateSchema.safeParse(body);
    if (!validation.success) {
      throw new BadRequestException({
        message: 'Invalid designer session payload',
        errors: validation.error.errors.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      });
    }

    const payload = validation.data;
    const session = await this.templatesService.createDesignerSession(spaceId, headers['x-user-id'], {
      templateId: payload.templateId,
      title: payload.title,
      status: payload.status,
      summary: payload.summary,
      ready: payload.ready,
      lastReply: payload.lastReply,
      notes: payload.notes ?? {},
      graph: payload.graph ?? {},
      history: payload.history ?? [],
      followUps: payload.followUps ?? [],
      metadata: payload.metadata,
    });

    return {
      success: true,
      data: session,
    };
  }

  /**
   * Get a designer session by ID
   */
  @Get('designer/sessions/:sessionId')
  async getDesignerSession(
    @Param('spaceId') spaceId: string,
    @Param('sessionId') sessionId: string,
    @Headers() headers: Record<string, string>,
  ) {
    this.validateSpaceAccess(spaceId, headers);
    const session = await this.templatesService.getDesignerSession(spaceId, sessionId);
    return {
      success: true,
      data: session,
    };
  }

  /**
   * Update an existing designer session
   */
  @Put('designer/sessions/:sessionId')
  async updateDesignerSession(
    @Param('spaceId') spaceId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    this.validateSpaceAccess(spaceId, headers);
    this.validateRequestSize(body);

    const validation = designerSessionUpdateSchema.safeParse(body);
    if (!validation.success) {
      throw new BadRequestException({
        message: 'Invalid designer session update payload',
        errors: validation.error.errors.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      });
    }

    const payload = validation.data;
    const session = await this.templatesService.updateDesignerSession(spaceId, sessionId, {
      title: payload.title,
      status: payload.status,
      summary: payload.summary,
      ready: payload.ready,
      lastReply: payload.lastReply,
      notes: payload.notes,
      graph: payload.graph,
      history: payload.history,
      followUps: payload.followUps,
      metadata: payload.metadata,
    });

    return {
      success: true,
      data: session,
    };
  }

  /**
   * Delete a designer session
   */
  @Delete('designer/sessions/:sessionId')
  async deleteDesignerSession(
    @Param('spaceId') spaceId: string,
    @Param('sessionId') sessionId: string,
    @Headers() headers: Record<string, string>,
  ) {
    this.validateSpaceAccess(spaceId, headers);
    await this.templatesService.deleteDesignerSession(spaceId, sessionId);
    return {
      success: true,
    };
  }

  /**
   * Enhanced save compiled template with validation
   */
  @Post('compile/save')
  @Throttle({ default: { limit:RATE_LIMITS.CREATE.limit, ttl: RATE_LIMITS.CREATE.ttl } })
  async saveCompiledTemplate(
    @Param('spaceId') spaceId: string,
    @Body() body: { compiledTemplate: any },
    @Headers() headers: Record<string, string>,
  ) {
    try {
      this.validateSpaceAccess(spaceId, headers);
      this.validateRequestSize(body);

      // Enhanced validation
      const validation = saveCompiledTemplateSchema.safeParse(body);
      if (!validation.success) {
        throw new BadRequestException({
          message: 'Invalid compiled template data',
          errors: validation.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      this.logger.log(`Saving compiled template preview for space ${spaceId}`);

      const savedTemplate = await this.templatesService.createFromCompilation(
        spaceId,
        validation.data.compiledTemplate
      );

      this.logger.log(`Compiled template saved successfully: ${savedTemplate.id}`);

      return {
        success: true,
        data: savedTemplate,
        message: 'Template saved successfully',
      };
    } catch (error: any) {
      this.logger.error(`Failed to save compiled template for space ${spaceId}:`, error);

      if (error.message?.includes('already exists')) {
        throw new ConflictException('A template with this name already exists');
      }

      throw new BadRequestException(`Failed to save compiled template: ${error.message}`);
    }
  }

  /**
   * Preview a compiled template (enhanced version that handles both saved and preview templates)
   */
  @Post('preview')
  async previewCompiledTemplate(
    @Param('spaceId') spaceId: string,
    @Body() body: { template: any },
  ) {
    try {
      if (!body.template) {
        throw new BadRequestException('Template data is required');
      }

      const preview = await this.templatesService.generatePreviewFromTemplateData(body.template);

      return {
        success: true,
        data: preview,
      };
    } catch (error: any) {
      console.error(`[Templates Controller] Failed to preview compiled template:`, error);
      throw new BadRequestException(`Failed to generate template preview: ${error.message}`);
    }
  }
}
