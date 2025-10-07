import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AiService } from '../ai/ai.service';

interface CreateSpaceDto {
  name: string;
  description?: string;
  templateId?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
  phone?: string;
  hours?: string;
}

interface SpaceRuleDto {
  name: string;
  description?: string;
  category: string;
  conditions: any;
  responses: any;
  priority?: number;
}

interface CreateKnowledgeDto {
  type: 'fact' | 'behavior' | 'workflow';
  title?: string;
  canonicalText: string;
  sourceMessageId?: string;
  metadata?: any;
  tags?: string[];
}

@Injectable()
export class SpacesService {
  private readonly logger = new Logger(SpacesService.name);

  constructor(private prisma: PrismaService, private aiService: AiService) {}

  async create(name: string) {
    return this.prisma.space.create({ data: { name } });
  }

  async createWithProfile(data: CreateSpaceDto) {
    return this.prisma.$transaction(async (tx) => {
      const space = await tx.space.create({
        data: {
          name: data.name,
          description: data.description,
          templateId: data.templateId === 'custom' ? null : data.templateId,
          category: data.category,
          tags: data.tags || [],
          isPublic: data.isPublic || false,
        },
      });

      // Create a basic provider profile with space name as business name
      await tx.providerProfile.create({
        data: {
          spaceId: space.id,
          businessName: data.name,
          phone: data.phone,
          hours: data.hours,
        },
      });

      return tx.space.findUnique({
        where: { id: space.id },
        include: {
          profile: true,
          spaceTemplate: true,
        },
      });
    });
  }

  async getTemplates() {
    return this.prisma.spaceTemplate.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        domain: true,
        description: true,
        schemaJson: true,
        configJson: true,
      },
    });
  }

  async explorePublic(params: { category?: string; search?: string; limit: number; offset: number }) {
    const where: any = {
      isPublic: true,
      isActive: true,
    };

    if (params.category) {
      where.category = params.category;
    }

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { profile: { businessName: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    const [spaces, total] = await Promise.all([
      this.prisma.space.findMany({
        where,
        include: {
          profile: {
            select: {
              businessName: true,
              bio: true,
              rating: true,
              reviewCount: true,
              responseTime: true,
            },
          },
          _count: {
            select: {
              actions: true,
            },
          },
        },
        take: params.limit,
        skip: params.offset,
        orderBy: [
          { verified: 'desc' },
          { profile: { rating: 'desc' } },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.space.count({ where }),
    ]);

    return { spaces, total, hasMore: params.offset + params.limit < total };
  }

  async get(id: string) {
    return this.prisma.withSpaceTx(id, (tx) =>
      tx.space.findUnique({
        where: { id },
        include: {
          profile: true,
          spaceTemplate: true,
          rules: true,
          _count: {
            select: {
              actions: true,
              members: true,
            },
          },
        },
      })
    );
  }

  async getProfile(id: string) {
    const space = await this.prisma.withSpaceTx(id, (tx) =>
      tx.space.findUnique({
        where: { id, isPublic: true },
        include: {
          profile: true,
          spaceTemplate: true,
          rules: {
            where: { category: 'faq', isActive: true },
            select: {
              name: true,
              responses: true,
            },
          },
          _count: {
            select: {
              actions: true,
            },
          },
        },
      })
    );

    if (!space) {
      throw new Error('Space not found or not public');
    }

    return space;
  }

  async getSpaceContext(spaceId: string) {
    // Don't use withSpaceTx here - it creates a circular dependency
    // Query the space directly without RLS context
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      include: {
        profile: true,
        items: {
          take: 20,
        },
        rules: {
          where: { isActive: true },
        },
      },
    }) as any;

    if (!space) {
      throw new Error(`Space not found: ${spaceId}`);
    }

    // Build context for AI system prompt
    return {
      space: {
        id: space.id,
        name: space.name,
        description: space.description,
        category: space.category,
        isPublic: space.isPublic,
      },
      profile: space.profile ? {
        businessName: space.profile.businessName,
        bio: space.profile.bio,
        phone: space.profile.phone,
        email: space.profile.email,
        hours: space.profile.hours,
      } : null,
      items: space.items?.map((item: any) => ({
        type: item.type,
        name: item.name,
        description: item.description,
        services: item.services,
        price: item.price,
      })) || [],
      rules: space.rules?.map((rule: any) => ({
        category: rule.category,
        description: rule.description,
        conditions: rule.conditions,
        responses: rule.responses,
      })),
      availableActions: ['menu_inquiry', 'reservation', 'hours', 'contact'], // Default available actions
    };
  }

  async updateRules(spaceId: string, rules: SpaceRuleDto[] | { rules: SpaceRuleDto[] }) {
    const normalizedRules: SpaceRuleDto[] = Array.isArray(rules)
      ? rules
      : Array.isArray(rules?.rules)
        ? rules.rules
        : [];

    return this.prisma.withSpaceTx(spaceId, async (tx) => {
      // Delete existing rules
      await tx.spaceRule.deleteMany({
        where: { spaceId },
      });

      // Create new rules
      const createdRules = await Promise.all(
        normalizedRules.map((rule) =>
          tx.spaceRule.create({
            data: {
              spaceId,
              name: rule.name,
              description: rule.description,
              category: rule.category,
              conditions: rule.conditions,
              responses: rule.responses,
              priority: rule.priority || 100,
            },
          })
        )
      );

      return createdRules;
    });
  }

  async getAnalytics(spaceId: string) {
    const [recentAnalytics, totalActions, avgRating] = await this.prisma.withSpaceTx(spaceId, async (tx) => {
      const analyticsPromise = tx.spaceAnalytics.findMany({
        where: { spaceId },
        orderBy: { date: 'desc' },
        take: 30,
      });
      const actionsPromise = tx.action.count({
        where: { spaceId },
      });
      const ratingPromise = tx.spaceReview.aggregate({
        where: { spaceId },
        _avg: { rating: true },
        _count: true,
      });

      return Promise.all([analyticsPromise, actionsPromise, ratingPromise]);
    });

    return {
      recentAnalytics,
      totalActions,
      avgRating: avgRating._avg.rating,
      reviewCount: avgRating._count,
    };
  }

  private async buildSpaceContext(spaceId: string, tx = this.prisma) {
    // Fetch complete space data with all relations
    const space = await tx.space.findUnique({
      where: { id: spaceId },
      include: {
        profile: true,
        spaceTemplate: true,
        items: {
          take: 50,
          orderBy: { lastSeenAt: 'desc' },
        },
        rules: {
          where: { isActive: true },
          orderBy: { priority: 'asc' },
        },
        trainingConversations: {
          where: { isActive: true },
          orderBy: [
            { createdAt: 'desc' }, // Prioritize recent training data
            { sessionId: 'asc' },
            { sequence: 'asc' },
          ],
          take: 50, // Increased limit to capture more training context
        },
        knowledgeEntries: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!space) {
      throw new Error('Space not found');
    }

    // Extract services from items
    const services = new Set<string>();
    const items = space.items.map(item => {
      const canonical = item.canonicalJson as any;

      // Extract services if available
      if (canonical.services && Array.isArray(canonical.services)) {
        canonical.services.forEach((service: string) => services.add(service));
      }
      if (canonical.specialties && Array.isArray(canonical.specialties)) {
        canonical.specialties.forEach((specialty: string) => services.add(specialty));
      }

      return {
        type: item.type,
        name: canonical.name,
        description: canonical.description || canonical.bio,
        services: canonical.services || canonical.specialties,
        price: canonical.price,
      };
    });

    // Determine available actions
    const availableActions = this.getAvailableActions(space.category || undefined, space.spaceTemplate?.domain);

    // Group training conversations by session for few-shot examples
    const trainingExamples = groupTrainingConversations(space.trainingConversations);

    const knowledge = {
      facts: [] as any[],
      behaviors: [] as any[],
      workflows: [] as any[],
    };

    if (Array.isArray((space as any).knowledgeEntries)) {
      (space as any).knowledgeEntries.forEach((entry: any) => {
        const normalized = {
          id: entry.id,
          title: entry.title,
          text: entry.canonicalText,
          tags: entry.tags || [],
          metadata: entry.metadata || null,
          createdAt: entry.createdAt,
        };

        if (entry.type === 'fact') {
          knowledge.facts.push(normalized);
        } else if (entry.type === 'behavior') {
          knowledge.behaviors.push(normalized);
        } else if (entry.type === 'workflow') {
          knowledge.workflows.push(normalized);
        }
      });
    }

    return {
      space: {
        name: space.name,
        description: space.description || undefined,
        category: space.category || undefined,
        tags: space.tags,
      },
      profile: space.profile ? {
        businessName: space.profile.businessName,
        bio: space.profile.bio || undefined,
        phone: space.profile.phone || undefined,
        email: space.profile.email || undefined,
        hours: space.profile.hours || undefined,
        services: Array.from(services),
      } : undefined,
      items,
      availableActions,
      rules: space.rules.map((rule: any) => ({
        category: rule.category,
        description: rule.description || undefined,
        conditions: rule.conditions,
        responses: rule.responses,
      })),
      knowledge,
      // Remove sessionId from training examples for AI service compatibility
      trainingExamples: trainingExamples.map(session =>
        session.map(msg => ({
          role: msg.role,
          content: msg.content,
          sequence: msg.sequence
        }))
      ),
    };
  }

  private getAvailableActions(category?: string, domain?: string): string[] {
    // Default actions available to all spaces
    const baseActions = ['contact', 'inquiry'];

    // Add category/domain-specific actions
    const categoryActions: Record<string, string[]> = {
      'restaurant': ['order'],
      'cafe': ['order'],
      'food': ['order'],
      'school': ['schedule', 'inquiry'],
      'education': ['schedule', 'inquiry'],
      'automotive': ['book', 'inquiry'],
      'car': ['book', 'inquiry'],
      'dealership': ['book', 'inquiry'],
      'medical': ['book', 'schedule'],
      'healthcare': ['book', 'schedule'],
      'expert': ['book', 'schedule'],
      'consultant': ['book', 'schedule'],
      'service': ['book', 'schedule'],
    };

    const domainActions: Record<string, string[]> = {
      'shop': ['order'],
      'travel': ['book'],
      'expert': ['book', 'schedule'],
    };

    let actions = [...baseActions];

    if (category && categoryActions[category.toLowerCase()]) {
      actions.push(...categoryActions[category.toLowerCase()]);
    }

    if (domain && domainActions[domain.toLowerCase()]) {
      actions.push(...domainActions[domain.toLowerCase()]);
    }

    return [...new Set(actions)];
  }

  async startTrainingSession(spaceId: string) {
    const sessionId = `training_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return { sessionId };
  }

  async addTrainingMessage(spaceId: string, data: { sessionId: string; role: 'user' | 'assistant'; content: string; sequence: number }) {
    const message = await this.prisma.withSpaceTx(spaceId, (tx) =>
      tx.spaceTrainingConversation.create({
        data: {
          spaceId,
          sessionId: data.sessionId,
          role: data.role,
          content: data.content,
          sequence: data.sequence,
        },
      })
    );

    // Create embedding for this training message asynchronously
    // This allows RAG to find relevant training data
    try {
      await this.aiService.createEmbedding({
        space_id: spaceId,
        text: `${data.role}: ${data.content}`,
        // Don't set item_id for training messages - it causes foreign key constraint errors
      });
      this.logger.debug(`Created embedding for training message ${data.sessionId}_${data.sequence}`);
    } catch (error) {
      // Log error but don't fail the training message creation
      this.logger.warn(`Failed to create embedding for training message: ${error}`);
    }

    return message;
  }

  async getTrainingConversations(spaceId: string) {
    const conversations = await this.prisma.withSpaceTx(spaceId, (tx) =>
      tx.spaceTrainingConversation.findMany({
        where: {
          spaceId,
          isActive: true,
        },
        orderBy: [
          { sessionId: 'asc' },
          { sequence: 'asc' },
        ],
      })
    );

    // Group by session
    const grouped = conversations.reduce((acc: any, conv: any) => {
      if (!acc[conv.sessionId]) {
        acc[conv.sessionId] = [];
      }
      acc[conv.sessionId].push(conv);
      return acc;
    }, {} as Record<string, typeof conversations>);

    return Object.entries(grouped).map(([sessionId, messages]) => ({
      sessionId,
      messages,
    }));
  }

  async getTrainingSystemPrompt(spaceId: string) {
    const space = await this.prisma.withSpaceTx(spaceId, (tx) =>
      tx.space.findUnique({
        where: { id: spaceId },
        select: {
          metadata: true,
        },
      })
    );

    return {
      systemPrompt: space?.metadata?.systemPrompt || '',
      updatedAt: space?.metadata?.updatedAt || null,
    };
  }

  async listKnowledgeEntries(spaceId: string) {
    return this.prisma.withSpaceTx(spaceId, (tx) =>
      tx.spaceKnowledge.findMany({
        where: { spaceId },
        orderBy: { createdAt: 'desc' },
      })
    );
  }

  async createKnowledgeEntry(spaceId: string, body: CreateKnowledgeDto) {
    const canonicalText = (body.canonicalText || '').trim();
    if (!canonicalText) {
      throw new Error('canonicalText is required');
    }

    const title = (body.title || '').trim() || canonicalText.split(/[.!?\n]/)[0].slice(0, 80) || 'Untitled knowledge';

    return this.prisma.withSpaceTx(spaceId, (tx) =>
      tx.spaceKnowledge.create({
        data: {
          spaceId,
          type: body.type,
          title,
          canonicalText,
          sourceMessageId: body.sourceMessageId,
          metadata: body.metadata ?? undefined,
          tags: body.tags ?? [],
        },
      })
    );
  }

  async updateKnowledgeEntry(spaceId: string, knowledgeId: string, body: Partial<CreateKnowledgeDto>) {
    return this.prisma.withSpaceTx(spaceId, (tx) =>
      tx.spaceKnowledge.update({
        where: { id: knowledgeId },
        data: {
          type: body.type ?? undefined,
          title: body.title?.trim() ?? undefined,
          canonicalText: body.canonicalText?.trim() ?? undefined,
          sourceMessageId: body.sourceMessageId ?? undefined,
          metadata: body.metadata ?? undefined,
          tags: body.tags ?? undefined,
        },
      })
    );
  }

  async deleteKnowledgeEntry(spaceId: string, knowledgeId: string) {
    await this.prisma.withSpaceTx(spaceId, (tx) =>
      tx.spaceKnowledge.delete({
        where: { id: knowledgeId },
      })
    );

    return { success: true };
  }

  async compileKnowledgePrompt(spaceId: string, apply = false) {
    const spaceContext = await this.buildSpaceContext(spaceId);

    let prompt: string | undefined;

    try {
      const response = await this.aiService.callAI('http://localhost:8000/prompt/compile', {
        space_context: spaceContext,
      });

      prompt = response?.system_prompt || response?.systemPrompt;
    } catch (error) {
      this.logger.warn('Falling back to local prompt builder after remote compile failure', error as Error);
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      prompt = this.buildPromptFromContext(spaceContext);
    }

    if (!prompt || !prompt.trim()) {
      throw new Error('Failed to compile system prompt from knowledge');
    }

    if (apply) {
      await this.updateSystemPrompt(spaceId, prompt);
    }

    return { systemPrompt: prompt, applied: Boolean(apply) };
  }

  async deleteTrainingSession(spaceId: string, sessionId: string) {
    await this.prisma.withSpaceTx(spaceId, (tx) =>
      tx.spaceTrainingConversation.updateMany({
        where: {
          spaceId,
          sessionId,
        },
        data: {
          isActive: false,
        },
      })
    );

    return { success: true };
  }

  async trainingConversation(spaceId: string, data: { message: string; conversationHistory: any[]; spaceContext?: any }) {
    try {
      // Use passed space context or build new one
      const spaceContext = data.spaceContext || await this.buildSpaceContext(spaceId);

      // Call AI service for training conversation
      const response = await this.aiService.callAI('http://localhost:8000/training/conversation', {
        space_id: spaceId,
        message: data.message,
        conversation_history: data.conversationHistory || [],
        space_context: spaceContext,
      });

      return response;
    } catch (error: any) {
      console.error('Training conversation error:', error);
      console.error('Error response:', error?.response?.data);

      // Pass through detailed error message if available
      const errorMessage = error?.response?.data?.detail ||
                          error?.message ||
                          'Failed to process training conversation';

      throw new Error(errorMessage);
    }
  }

  async generateSystemPrompt(spaceId: string, conversationHistory: any[]) {
    try {
      // Get space context
      const spaceContext = await this.buildSpaceContext(spaceId);

      // Call AI service to generate system prompt
      const response = await this.aiService.callAI('http://localhost:8000/training/generate-prompt', {
        space_id: spaceId,
        conversation_history: conversationHistory,
        space_context: spaceContext,
      });

      return response;
    } catch (error: any) {
      console.error('Generate system prompt error:', error);
      console.error('Error details:', error?.response?.data);

      const errorMessage = error?.response?.data?.detail ||
                          error?.message ||
                          'Failed to generate system prompt';

      throw new Error(errorMessage);
    }
  }

  async updateSystemPrompt(spaceId: string, systemPrompt: string) {
    return this.prisma.withSpaceTx(spaceId, async (tx) => {
      // Store system prompt in space metadata
      const updated = await tx.space.update({
        where: { id: spaceId },
        data: {
          metadata: {
            systemPrompt,
            updatedAt: new Date().toISOString(),
          },
        },
      });

      return { success: true, systemPrompt };
    });
  }

  async uploadDocument(spaceId: string, file: any) {
    const uploadResult = await this.aiService.uploadDocument(spaceId, file);

    const { knowledgeSuggestions, ownerSummary } = this.buildDocumentKnowledgeSuggestions(uploadResult);

    return {
      ...uploadResult,
      knowledgeSuggestions,
      ownerSummary,
    };
  }

  async analyzeTrainingConversation(spaceId: string, body: { conversation: Array<{ role: string; content: string; timestamp: string }>; sessionId?: string }) {
    this.logger.debug(`Analyzing training conversation for space ${spaceId}`);

    if (!body.conversation || !Array.isArray(body.conversation) || body.conversation.length === 0) {
      throw new Error('Invalid conversation data: conversation array is required and must not be empty');
    }

    const sanitizedMessages = body.conversation.filter((msg) =>
      msg && typeof msg.role === 'string' && typeof msg.content === 'string' && msg.content.trim().length > 0
    );

    if (sanitizedMessages.length === 0) {
      this.logger.warn('No valid messages found in training conversation payload');
      throw new Error('Invalid conversation data: all messages must have role and non-empty content');
    }

    const ownerGuidance = sanitizedMessages
      .filter((msg) => msg.role === 'user')
      .pop()?.content?.trim() ?? '';

    let spaceContext: any = null;
    try {
      this.logger.debug('Building space context for training analysis');
      spaceContext = await this.prisma.withSpaceTx(spaceId, async (tx) => this.buildSpaceContext(spaceId, tx));
    } catch (contextError) {
      this.logger.error('Failed to build space context for training analysis', contextError);
      throw new Error('Unable to load space context for training analysis');
    }

    let analysisResult: any = null;
    try {
      this.logger.debug(`Calling AI service to analyze conversation with ${sanitizedMessages.length} messages`);
      analysisResult = await this.aiService.analyzeTrainingConversation({
        space_id: spaceId,
        conversation: sanitizedMessages,
        space_context: spaceContext,
      });
    } catch (error) {
      this.logger.error('AI analysis failed, falling back to heuristic extraction', {
        error: error instanceof Error ? error.message : String(error),
        spaceId,
      });
    }

    let analysis = analysisResult?.analysis;
    let conversationLength = analysisResult?.conversation_length ?? sanitizedMessages.length;
    let fallbackApplied = false;

    const heuristicAnalysis = this.buildHeuristicTrainingInsight(sanitizedMessages);
    if ((!analysis || !analysis.correction_detected || !analysis.general_principle?.trim()) && heuristicAnalysis) {
      fallbackApplied = true;
      analysis = {
        ...analysis,
        correction_detected: true,
        knowledge_type: analysis?.knowledge_type || heuristicAnalysis.knowledge_type,
        knowledge_title: analysis?.knowledge_title || heuristicAnalysis.knowledge_title,
        error_type: analysis?.error_type || heuristicAnalysis.error_type,
        scenario_category: analysis?.scenario_category || heuristicAnalysis.scenario_category,
        incorrect_pattern: analysis?.incorrect_pattern || heuristicAnalysis.incorrect_pattern,
        correct_pattern: analysis?.correct_pattern || heuristicAnalysis.correct_pattern,
        general_principle: heuristicAnalysis.general_principle,
        similar_queries: Array.isArray(analysis?.similar_queries) && analysis?.similar_queries.length > 0
          ? analysis.similar_queries
          : heuristicAnalysis.similar_queries,
        response_template: analysis?.response_template || heuristicAnalysis.response_template,
        confidence: Math.max(
          typeof analysis?.confidence === 'number' ? analysis.confidence : 0,
          heuristicAnalysis.confidence,
        ),
      };
    }

    if (analysis) {
      analysis = this.refineAnalysisOutput(
        analysis,
        ownerGuidance,
        heuristicAnalysis?.scenario_category,
        heuristicAnalysis?.knowledge_type,
      );
    }

    if (!analysis || !analysis.correction_detected || !analysis.general_principle?.trim()) {
      this.logger.debug('Training analysis produced no actionable correction');
      return {
        success: false,
        analysis: {
          correction_detected: false,
          knowledge_type: analysis?.knowledge_type,
          knowledge_title: analysis?.knowledge_title,
          general_principle: '',
          incorrect_pattern: analysis?.incorrect_pattern,
          correct_pattern: analysis?.correct_pattern,
          similar_queries: Array.isArray(analysis?.similar_queries) ? analysis.similar_queries : [],
          response_template: analysis?.response_template,
          scenario_category: analysis?.scenario_category,
          error_type: analysis?.error_type,
          confidence: typeof analysis?.confidence === 'number' ? analysis.confidence : 0,
        },
        saved: false,
        conversationLength,
        fallbackApplied,
      };
    }

    const confidence = typeof analysis.confidence === 'number' ? analysis.confidence : 0;
    const shouldPersistPattern = confidence > 0.3;
    let saved = false;

    if (shouldPersistPattern) {
      const sessionId = body.sessionId || `analyzed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      try {
        await this.prisma.withSpaceTx(spaceId, async (tx) => {
          await tx.spaceTrainingConversation.create({
            data: {
              spaceId,
              sessionId,
              role: 'system',
              content: analysis.general_principle,
              sequence: 1,
            },
          });
        });
        saved = true;
      } catch (persistError) {
        this.logger.warn('Failed to persist heuristic training insight', persistError);
      }
    } else {
      this.logger.debug(`Training analysis not persisted (confidence: ${confidence})`);
    }

    try {
      const conversationText = sanitizedMessages.map((msg) => `${msg.role}: ${msg.content}`).join('\n');
      await this.aiService.createEmbedding({
        space_id: spaceId,
        text: conversationText,
      });
      this.logger.debug('Created embedding for analyzed conversation');
    } catch (embedError) {
      this.logger.warn('Failed to create embedding for conversation:', embedError);
    }

    if (fallbackApplied) {
      this.logger.log('Training analysis used heuristic fallback extraction');
    }

    return {
      success: true,
      analysis,
      saved,
      conversationLength,
      fallbackApplied,
    };
  }

  private buildHeuristicTrainingInsight(conversation: Array<{ role: string; content: string }>) {
    if (!Array.isArray(conversation) || conversation.length === 0) {
      return null;
    }

    const latestUserMessage = [...conversation]
      .reverse()
      .find((msg) => msg.role === 'user' && typeof msg.content === 'string' && msg.content.trim().length > 0);

    if (!latestUserMessage) {
      return null;
    }

    const latestAssistantMessage = [...conversation]
      .reverse()
      .find((msg) => msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.trim().length > 0);

    const ownerText = latestUserMessage.content.trim();
    if (!ownerText || ownerText.length < 6 || ownerText.endsWith('?')) {
      return null;
    }

    if (latestAssistantMessage && latestAssistantMessage.content.toLowerCase().includes(ownerText.toLowerCase())) {
      return null;
    }

    const normalized = ownerText.replace(/\s+/g, ' ').trim();
    const wordCount = normalized.split(' ').length;
    if (wordCount < 3) {
      return null;
    }

    const knowledgeType = this.detectKnowledgeType(normalized);
    const scenarioCategory = this.guessScenarioCategory(normalized);
    const knowledgeTitle = this.buildKnowledgeTitle(normalized, scenarioCategory);
    const generalPrinciple = this.formatGeneralPrinciple(normalized, knowledgeType, scenarioCategory);
    const responseTemplate = this.buildResponseTemplate(normalized, scenarioCategory, generalPrinciple);
    const incorrectPattern = this.describeIncorrectPattern(scenarioCategory);

    return {
      correction_detected: true,
      knowledge_type: knowledgeType,
      knowledge_title: knowledgeTitle,
      error_type: 'missing_information',
      scenario_category: scenarioCategory,
      incorrect_pattern: incorrectPattern,
      correct_pattern: generalPrinciple,
      general_principle: generalPrinciple,
      similar_queries: this.generateSimilarQueries(scenarioCategory),
      response_template: responseTemplate,
      confidence: 0.65,
    };
  }

  private detectKnowledgeType(text: string): 'fact' | 'behavior' | 'workflow' {
    const lower = text.toLowerCase();

    if (/(step\s+\d|first|next|then|after that|workflow|process|procedure)/.test(lower)) {
      return 'workflow';
    }

    if (/(always|never|should|must|tone|friendly|polite|greet|apologize|avoid)/.test(lower)) {
      return 'behavior';
    }

    return 'fact';
  }

  private buildKnowledgeTitle(text: string, category: string): string {
    const templates: Record<string, string> = {
      hours: 'Business hours',
      pricing: 'Pricing details',
      booking: 'Booking policy',
      contact: 'Contact information',
      menu: 'Menu highlight',
      services: 'Service offering',
      delivery: 'Delivery details',
    };

    if (templates[category]) {
      return templates[category];
    }

    return text.split(/[.!?]/)[0]?.slice(0, 60)?.trim() || 'Owner guidance';
  }

  private describeIncorrectPattern(category: string): string {
    const descriptions: Record<string, string> = {
      hours: 'Assistant did not know the correct opening hours.',
      pricing: 'Assistant gave incomplete pricing information.',
      booking: 'Assistant was unsure how to handle booking requests.',
      contact: 'Assistant could not provide the right contact info.',
      menu: 'Assistant missed the latest menu details.',
      services: 'Assistant omitted the services the business offers.',
      delivery: 'Assistant did not cover delivery availability.',
    };

    return descriptions[category] || 'Assistant has not incorporated this instruction yet.';
  }

  private refineAnalysisOutput(
    analysis: any,
    ownerText: string,
    fallbackCategory?: string,
    fallbackType?: 'fact' | 'behavior' | 'workflow',
  ) {
    if (!analysis) return analysis;

    const owner = (ownerText || '').trim();
    const category = analysis.scenario_category || fallbackCategory || this.guessScenarioCategory(owner);
    const knowledgeType: 'fact' | 'behavior' | 'workflow' =
      analysis.knowledge_type === 'fact' || analysis.knowledge_type === 'behavior' || analysis.knowledge_type === 'workflow'
        ? analysis.knowledge_type
        : fallbackType || this.detectKnowledgeType(owner);

    const normalizedInstruction = this.normalizeDirectiveSource(owner, category, knowledgeType);

    const needsRewrite = !analysis.general_principle ||
      this.isEchoOfOwner(analysis.general_principle, owner) ||
      analysis.general_principle.trim().length < 25;

    const finalPrinciple = needsRewrite
      ? this.formatGeneralPrinciple(normalizedInstruction || owner, knowledgeType, category)
      : analysis.general_principle.trim();

    const incorrectPattern = analysis.incorrect_pattern && !this.isGenericPlaceholder(analysis.incorrect_pattern)
      ? analysis.incorrect_pattern
      : this.describeIncorrectPattern(category);

    const responseTemplate = analysis.response_template && analysis.response_template.trim().length >= 20
      ? analysis.response_template
      : this.buildResponseTemplate(owner, category, finalPrinciple);

    const title = analysis.knowledge_title && analysis.knowledge_title.trim().length > 0
      ? analysis.knowledge_title
      : this.buildKnowledgeTitle(normalizedInstruction || owner || finalPrinciple, category);

    return {
      ...analysis,
      knowledge_type: knowledgeType,
      scenario_category: category,
      knowledge_title: title,
      general_principle: finalPrinciple,
      correct_pattern: finalPrinciple,
      incorrect_pattern: incorrectPattern,
      response_template: responseTemplate,
      confidence: typeof analysis.confidence === 'number' ? analysis.confidence : 0.65,
    };
  }

  private formatGeneralPrinciple(text: string, type: 'fact' | 'behavior' | 'workflow', category: string): string {
    const content = text.trim();
    const hasDetails = this.hasConcreteDetails(content);

    const categoryLabels: Record<string, string> = {
      hours: 'our hours',
      pricing: 'our pricing',
      booking: 'booking steps',
      contact: 'how to contact us',
      menu: 'our menu',
      services: 'our services',
      delivery: 'delivery options',
    };

    if (hasDetails && categoryLabels[category]) {
      return `When customers ask about ${categoryLabels[category]}, respond with: ${content}`;
    }

    if (hasDetails) {
      return `When customers ask, reply with: ${content}`;
    }

    const genericByCategory: Record<string, string> = {
      hours: 'Always give the exact opening and closing hours from the latest schedule.',
      pricing: 'Always share current pricing and fees before offering recommendations.',
      booking: 'Always explain how to book, including available channels and confirmation steps.',
      contact: 'Always provide the correct phone number, email, and any other contact options.',
      menu: 'Always answer menu questions by listing the items, prices, and specials from the latest menu.',
      services: 'Always outline the services we offer and suggest the best fit for the customer.',
      delivery: 'Always clarify delivery availability, areas, timing, and any associated fees.',
    };

    if (genericByCategory[category]) {
      return genericByCategory[category];
    }

    if (type === 'behavior') {
      return `Always ${content.replace(/^we\s+/i, '').replace(/^to\s+/i, '')}`;
    }

    if (type === 'workflow') {
      return `Follow this workflow every time: ${content}`;
    }

    return `Always share this fact accurately: ${content}`;
  }

  private buildResponseTemplate(ownerText: string, category: string, principle: string): string {
    const trimmed = (ownerText || '').trim();
    if (this.hasConcreteDetails(trimmed)) {
      return `Here are the details:
${trimmed}`;
    }

    const friendlyFallback: Record<string, string> = {
      hours: 'We’re open according to the latest schedule I have on file — let me share the exact times.',
      pricing: 'Let me walk you through our current pricing so you know what to expect.',
      booking: 'Here’s how to book with us — I can guide you through each step.',
      contact: 'Here’s the best way to reach us anytime you need assistance.',
      menu: 'Let me share our current menu and help you pick the perfect item.',
      services: 'Here’s an overview of what we offer — tell me what you’re looking for.',
      delivery: 'Here’s how our delivery works so you can plan your order.',
    };

    if (friendlyFallback[category]) {
      return friendlyFallback[category];
    }

    return principle;
  }

  private normalizeDirectiveSource(
    ownerText: string,
    category: string,
    knowledgeType: 'fact' | 'behavior' | 'workflow',
  ): string {
    const cleaned = ownerText.trim();
    if (!cleaned) {
      return cleaned;
    }

    const shortDirective = cleaned.split(' ').length <= 4 && !cleaned.includes(':') && !cleaned.includes('\n');

    if (/^memorize\b/i.test(cleaned)) {
      if (category === 'menu') {
        return 'answer menu questions using the uploaded items, prices, and specials';
      }
      return cleaned.replace(/^memorize\b/i, 'remember');
    }

    if (/^learn\b/i.test(cleaned)) {
      return cleaned.replace(/^learn\b/i, 'remember');
    }

    if (/^remember\b/i.test(cleaned)) {
      return cleaned;
    }

    if (shortDirective) {
      const categoryExpansion: Record<string, string> = {
        menu: 'answer menu questions with the latest items, prices, and specials',
        hours: 'give the precise business hours we operate',
        pricing: 'quote the current pricing and fees accurately',
        booking: 'walk the customer through booking with us',
        contact: 'offer the best phone, email, and other contact options',
        services: 'outline the services we provide and guide the customer to the right one',
        delivery: 'explain delivery availability, timing, and fees',
      };

      if (categoryExpansion[category]) {
        return categoryExpansion[category];
      }

      if (knowledgeType === 'behavior') {
        return `respond in line with this guidance: ${cleaned}`;
      }

      return cleaned;
    }

    return cleaned;
  }

  private hasConcreteDetails(text: string): boolean {
    if (!text) return false;
    return /[:\n]/.test(text) || /\d/.test(text) || text.split(' ').length > 10;
  }

  private isEchoOfOwner(candidate: string, ownerText: string): boolean {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const a = normalize(candidate || '');
    const b = normalize(ownerText || '');
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  private isGenericPlaceholder(text: string): boolean {
    if (!text) return true;
    const normalized = text.toLowerCase();
    return normalized.includes('has not incorporated this instruction yet');
  }

  private buildDocumentKnowledgeSuggestions(uploadResult: any) {
    const suggestions: Array<{ type: 'fact' | 'behavior' | 'workflow'; title: string; canonicalText: string; tags?: string[] }> = [];
    const bulletPoints: string[] = [];

    if (!uploadResult) {
      return { knowledgeSuggestions: suggestions, ownerSummary: '' };
    }

    const docType = (uploadResult.document_type || '').toString();
    const entities = uploadResult.key_entities || {};
    const filename = uploadResult.filename || 'uploaded document';

    const tagBase = docType ? [docType] : [];

    const cleanedItems: string[] = Array.isArray(entities.items)
      ? (entities.items as string[])
          .map((item) => item?.trim())
          .filter((item) => item && item.length > 2)
      : [];

    const priceRange = entities.price_range || {};
    const minPrice = typeof priceRange.min === 'string' ? priceRange.min.trim() : undefined;
    const maxPrice = typeof priceRange.max === 'string' ? priceRange.max.trim() : undefined;

    if (docType.includes('menu')) {
      if (cleanedItems.length > 0) {
        const topItems = cleanedItems.slice(0, 6);
        const bulletList = topItems.map((item) => `• ${item}`).join('\n');
        suggestions.push({
          type: 'fact',
          title: 'Menu highlights',
          canonicalText: `Feature these menu favorites:\n${bulletList}`,
          tags: [...tagBase, 'menu', 'document-upload'],
        });
        bulletPoints.push(`Menu highlights include ${topItems.join(', ')}.`);
      }

      if (minPrice || maxPrice) {
        suggestions.push({
          type: 'fact',
          title: 'Menu price range',
          canonicalText: `Prices start around ${minPrice || 'the lowest listed value'} and go up to ${maxPrice || 'the highest listed value'}. Mention this range when guests ask about cost.`,
          tags: [...tagBase, 'pricing', 'document-upload'],
        });
        bulletPoints.push(
          `Price range: ${minPrice ?? 'lowest listed'} to ${maxPrice ?? 'highest listed'}.`,
        );
      }

      if (cleanedItems.length > 0 || minPrice || maxPrice) {
        suggestions.push({
          type: 'behavior',
          title: 'Answering menu questions',
          canonicalText:
            'When customers ask about the menu, surface the best sellers, share current prices, and invite them to tell you what flavours or dietary needs they have so you can recommend something specific.',
          tags: [...tagBase, 'menu', 'behavior'],
        });
        bulletPoints.push('Always offer to recommend drinks or dishes when the menu comes up.');
      }
    }

    if (docType === 'price_list' && Array.isArray(entities.prices) && entities.prices.length > 0) {
      const prices = (entities.prices as string[]).slice(0, 6).join(', ');
      suggestions.push({
        type: 'fact',
        title: 'Key price points',
        canonicalText: `Key price points to quote: ${prices}. Use these figures to set expectations before describing options.`,
        tags: [...tagBase, 'pricing', 'document-upload'],
      });
      bulletPoints.push(`Important price references: ${prices}.`);
    }

    if (suggestions.length === 0 && uploadResult.extracted_preview) {
      const preview = uploadResult.extracted_preview.toString().replace(/\s+/g, ' ').trim();
      const truncated = preview.length > 220 ? `${preview.slice(0, 220)}…` : preview;
      if (truncated) {
        suggestions.push({
          type: 'fact',
          title: 'Document summary',
          canonicalText: truncated,
          tags: ['document-upload'],
        });
        bulletPoints.push(`Captured summary: ${truncated}`);
      }
    }

    const ownerSummary = bulletPoints.length > 0
      ? `I just uploaded ${filename}. Key details to remember:\n- ${bulletPoints.join('\n- ')}`
      : `I just uploaded ${filename}. Please review it and capture any important business facts.`;

    return {
      knowledgeSuggestions: suggestions,
      ownerSummary,
    };
  }

  private guessScenarioCategory(text: string): 'delivery' | 'hours' | 'pricing' | 'booking' | 'contact' | 'menu' | 'services' | 'other' {
    const lower = text.toLowerCase();

    if (/(deliver|delivery|ship)/.test(lower)) return 'delivery';
    if (/(hour|open|close|weekend|weekday|time)/.test(lower)) return 'hours';
    if (/(price|pricing|cost|fee|charge|rate)/.test(lower)) return 'pricing';
    if (/(book|booking|appointment|reserve|reservation|schedule)/.test(lower)) return 'booking';
    if (/(call|phone|email|contact|reach)/.test(lower)) return 'contact';
    if (/(menu|drink|coffee|dish|meal|food|item)/.test(lower)) return 'menu';
    if (/(service|offer|provide|package|program)/.test(lower)) return 'services';
    return 'other';
  }

  private buildPromptFromContext(context: any): string {
    if (!context || !context.space) {
      return 'You are a helpful AI assistant. Answer politely and accurately.';
    }

    const { space, profile, knowledge, availableActions } = context;
    const businessName = profile?.businessName || space.name || 'the business';
    const sections: string[] = [];

    sections.push(`# ${businessName} – Customer Assistant`);

    const overview: string[] = [];
    if (profile?.bio) {
      overview.push(profile.bio.trim());
    }
    if (space.description && space.description !== profile?.bio) {
      overview.push(space.description.trim());
    }
    if (overview.length) {
      sections.push('\n## Business Overview');
      sections.push(overview.join('\n'));
    }

    const offerings: string[] = [];
    if (Array.isArray(context.items)) {
      context.items.slice(0, 12).forEach((item: any) => {
        if (!item) return;
        const parts: string[] = [];
        if (item.name) parts.push(item.name);
        if (item.price) parts.push(`$${item.price}`);
        if (item.description) parts.push(item.description);
        if (parts.length) {
          offerings.push(`- ${parts.join(' – ')}`);
        }
      });
    }

    if (profile?.services?.length) {
      profile.services.slice(0, 12).forEach((svc: string) => {
        if (svc) offerings.push(`- ${svc}`);
      });
    }

    if (offerings.length) {
      sections.push('\n## Offerings');
      sections.push(offerings.join('\n'));
    }

    const contact: string[] = [];
    if (profile?.phone) contact.push(`Phone: ${profile.phone}`);
    if (profile?.email) contact.push(`Email: ${profile.email}`);
    if (profile?.hours) contact.push(`Hours: ${profile.hours}`);
    if (contact.length) {
      sections.push('\n## Contact & Availability');
      sections.push(contact.join(' • '));
    }

    const behaviorRules: string[] = [];
    behaviorRules.push(`Stay friendly, informed, and concise as a representative of ${businessName}.`);
    behaviorRules.push('Use captured knowledge to answer accurately and avoid guessing.');
    if (availableActions?.length) {
      behaviorRules.push(
        `Offer to ${availableActions.map((action: string) => action.replace(/_/g, ' ')).join(', ')} when it helps the customer.`
      );
    }

    if (knowledge?.behaviors?.length) {
      knowledge.behaviors.slice(0, 15).forEach((entry: any) => {
        if (entry?.text) behaviorRules.push(entry.text.trim());
      });
    }

    if (behaviorRules.length) {
      sections.push('\n## Tone & Behaviors');
      sections.push(behaviorRules.map((rule) => `- ${rule}`).join('\n'));
    }

    if (knowledge?.facts?.length) {
      sections.push('\n## Essential Facts');
      sections.push(
        knowledge.facts
          .slice(0, 20)
          .map((fact: any) => (fact?.text ? `- ${fact.text.trim()}` : ''))
          .filter(Boolean)
          .join('\n')
      );
    }

    if (knowledge?.workflows?.length) {
      sections.push('\n## Workflows & Processes');
      sections.push(
        knowledge.workflows
          .slice(0, 10)
          .map((workflow: any) => {
            if (!workflow?.text) return '';
            const title = workflow.title ? `${workflow.title}: ` : '';
            return `- ${title}${workflow.text.trim()}`;
          })
          .filter(Boolean)
          .join('\n')
      );
    }

    sections.push(
      '\nAlways verify details with customers, recommend next steps, and never fabricate information. If unsure, acknowledge it and offer to follow up or connect them with a human.'
    );

    return sections.join('\n');
  }

  private generateSimilarQueries(category: string): string[] {
    switch (category) {
      case 'hours':
        return ['What are your hours?', 'When do you open?', 'Are you open on weekends?'];
      case 'pricing':
        return ['How much does it cost?', 'Do you have a price list?', 'What are your rates?'];
      case 'booking':
        return ['Can I book an appointment?', 'How do I schedule?', 'Do you take reservations?'];
      case 'contact':
        return ['How can I contact you?', 'What is your phone number?', 'Do you have an email address?'];
      case 'menu':
        return ['What is on the menu?', 'Do you have vegan options?', 'What drinks do you serve?'];
      case 'services':
        return ['What services do you offer?', 'Do you provide consultations?', 'Can you help with this service?'];
      case 'delivery':
        return ['Do you deliver?', 'What are your delivery areas?', 'Is there a delivery fee?'];
      default:
        return ['Can you tell me more?', 'What should I know?', 'How does that work?'];
    }
  }

  async verifyTraining(spaceId: string) {
    this.logger.debug(`Verifying training effectiveness for space ${spaceId}`);

    try {
      // Get training statistics
      const trainingStats = await this.prisma.spaceTrainingConversation.groupBy({
        by: ['role'],
        where: { spaceId, isActive: true },
        _count: { id: true },
      });

      // Get session count
      const sessionCount = await this.prisma.spaceTrainingConversation.findMany({
        where: { spaceId, isActive: true },
        select: { sessionId: true },
        distinct: ['sessionId'],
      });

      // Get space context to see if training is being applied
      const spaceContext = await this.prisma.withSpaceTx(spaceId, async (tx) => {
        return await this.buildSpaceContext(spaceId, tx);
      });

      // Test if training examples are included
      const hasTrainingExamples = spaceContext.trainingExamples && spaceContext.trainingExamples.length > 0;

      return {
        success: true,
        training_stats: {
          total_conversations: trainingStats.reduce((sum, stat) => sum + stat._count.id, 0),
          by_role: trainingStats.reduce((acc, stat) => {
            acc[stat.role] = stat._count.id;
            return acc;
          }, {} as Record<string, number>),
          session_count: sessionCount.length,
        },
        training_applied: hasTrainingExamples,
        training_examples_count: spaceContext.trainingExamples?.length || 0,
        message: hasTrainingExamples
          ? `Training is active with ${spaceContext.trainingExamples.length} example sessions`
          : 'No training examples found or training not being applied'
      };
    } catch (error) {
      this.logger.error('Failed to verify training:', {
        error: error instanceof Error ? error.message : String(error),
        spaceId
      });
      throw new Error(`Training verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export interface TrainingConversationMessage {
  sessionId: string;
  role: string;
  content: string;
  sequence: number;
}

export type TrainingConversationSession = TrainingConversationMessage[];

export function groupTrainingConversations(conversations: any[]): TrainingConversationSession[] {
  if (!Array.isArray(conversations) || conversations.length === 0) {
    return [];
  }

  const grouped = conversations.reduce<Record<string, TrainingConversationSession>>((acc, conv) => {
    // Validate conversation structure
    if (!conv || typeof conv.sessionId !== 'string' || !conv.role || !conv.content) {
      console.warn('Invalid training conversation:', conv);
      return acc;
    }

    if (!acc[conv.sessionId]) {
      acc[conv.sessionId] = [];
    }

    const message: TrainingConversationMessage = {
      sessionId: conv.sessionId,
      role: conv.role,
      content: conv.content,
      sequence: typeof conv.sequence === 'number' ? conv.sequence : 0,
    };

    acc[conv.sessionId].push(message);
    return acc;
  }, {} as Record<string, TrainingConversationSession>);

  // Sort messages within each session by sequence
  const sessions = Object.values(grouped) as TrainingConversationSession[];

  sessions.forEach((session: TrainingConversationSession) => {
    session.sort(
      (a: TrainingConversationMessage, b: TrainingConversationMessage) => a.sequence - b.sequence,
    );
  });

  // Return conversation sessions:
  // 1. Complete sessions with both user and assistant messages (includes new instruction format)
  // 2. System instruction sessions (single system messages - backward compatibility)
  const validSessions: TrainingConversationSession[] = sessions.filter((session: TrainingConversationSession) => {
    const hasUserAndAssistant = session.some((msg) => msg.role === 'user') &&
      session.some((msg) => msg.role === 'assistant');
    const isSystemInstruction = session.length === 1 && session[0]?.role === 'system';
    return hasUserAndAssistant || isSystemInstruction;
  });

  // Identify instruction sessions (from new format) vs Q&A sessions
  const instructionSessions: TrainingConversationSession[] = validSessions.filter((session: TrainingConversationSession) => {
    // New format: sessions with sessionId starting with 'instruction_'
    if (session.length >= 2 && session[0]?.sessionId?.startsWith('instruction_')) {
      return true;
    }
    // Old format: single system messages
    return session.length === 1 && session[0]?.role === 'system';
  });

  const qaSessions: TrainingConversationSession[] = validSessions.filter((session: TrainingConversationSession) => {
    // Q&A sessions have sessionId starting with 'qa_' or 'manual_'
    return session.length >= 2 && (
      session[0]?.sessionId?.startsWith('qa_') ||
      session[0]?.sessionId?.startsWith('manual_')
    );
  });

  const otherSessions: TrainingConversationSession[] = validSessions.filter((session: TrainingConversationSession) => {
    const isInstruction = (session.length >= 2 && session[0]?.sessionId?.startsWith('instruction_')) ||
                         (session.length === 1 && session[0]?.role === 'system');
    const isQA = session.length >= 2 && (
      session[0]?.sessionId?.startsWith('qa_') ||
      session[0]?.sessionId?.startsWith('manual_')
    );
    return !isInstruction && !isQA;
  });

  // Prioritize: instruction sessions first, then Q&A, then other conversations
  return [...instructionSessions, ...qaSessions.slice(0, 15), ...otherSessions.slice(0, 10)];
}
