import { Body, Controller, Delete, Get, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SpacesService } from './spaces.service';

interface CreateSpaceDto {
  name: string;
  description?: string;
  templateId?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
  providerProfile?: {
    businessName: string;
    contactName?: string;
    email?: string;
    phone?: string;
    website?: string;
    bio?: string;
  };
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

@Controller('spaces')
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Post()
  async create(@Body() body: { name: string }) {
    const name = body?.name?.trim() || 'Untitled Space';
    return this.spaces.create(name);
  }

  @Post('create-full')
  async createFull(@Body() createSpaceDto: CreateSpaceDto) {
    return this.spaces.createWithProfile(createSpaceDto);
  }

  @Get('templates')
  async getTemplates() {
    return this.spaces.getTemplates();
  }

  @Get('explore')
  async explorePublic(@Query() params: { category?: string; search?: string; limit?: string; offset?: string }) {
    return this.spaces.explorePublic({
      category: params.category,
      search: params.search,
      limit: parseInt(params.limit || '20'),
      offset: parseInt(params.offset || '0'),
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.spaces.get(id);
  }

  @Get(':id/profile')
  async getProfile(@Param('id') id: string) {
    return this.spaces.getProfile(id);
  }

  @Get(':id/context')
  async getContext(@Param('id') id: string) {
    return this.spaces.getSpaceContext(id);
  }

  @Put(':id/rules')
  async updateRules(@Param('id') id: string, @Body() rules: SpaceRuleDto[]) {
    return this.spaces.updateRules(id, rules);
  }

  @Get(':id/analytics')
  async getAnalytics(@Param('id') id: string) {
    return this.spaces.getAnalytics(id);
  }

  @Post(':id/training/start')
  async startTraining(@Param('id') id: string) {
    console.log('Starting training session for space:', id);
    return this.spaces.startTrainingSession(id);
  }

  @Post(':id/training/message')
  async addTrainingMessage(
    @Param('id') id: string,
    @Body() body: { sessionId: string; role: 'user' | 'assistant'; content: string; sequence: number }
  ) {
    return this.spaces.addTrainingMessage(id, body);
  }

  @Get(':id/training/conversations')
  async getTrainingConversations(@Param('id') id: string) {
    return this.spaces.getTrainingConversations(id);
  }

  @Get(':id/training/system-prompt')
  async getTrainingSystemPrompt(@Param('id') id: string) {
    return this.spaces.getTrainingSystemPrompt(id);
  }

  @Get(':id/knowledge')
  async listKnowledge(@Param('id') id: string) {
    return this.spaces.listKnowledgeEntries(id);
  }

  @Post(':id/knowledge')
  async createKnowledge(@Param('id') id: string, @Body() body: CreateKnowledgeDto) {
    return this.spaces.createKnowledgeEntry(id, body);
  }

  @Put(':id/knowledge/:knowledgeId')
  async updateKnowledge(
    @Param('id') id: string,
    @Param('knowledgeId') knowledgeId: string,
    @Body() body: Partial<CreateKnowledgeDto>
  ) {
    return this.spaces.updateKnowledgeEntry(id, knowledgeId, body);
  }

  @Delete(':id/knowledge/:knowledgeId')
  async deleteKnowledge(@Param('id') id: string, @Param('knowledgeId') knowledgeId: string) {
    return this.spaces.deleteKnowledgeEntry(id, knowledgeId);
  }

  @Post(':id/knowledge/train')
  async trainKnowledge(@Param('id') id: string, @Body() body: { apply?: boolean }) {
    return this.spaces.compileKnowledgePrompt(id, body?.apply ?? false);
  }

  @Delete(':id/training/session/:sessionId')
  async deleteTrainingSession(@Param('id') id: string, @Param('sessionId') sessionId: string) {
    return this.spaces.deleteTrainingSession(id, sessionId);
  }

  @Post(':id/training/analyze')
  async analyzeTrainingConversation(
    @Param('id') id: string,
    @Body() body: { conversation: Array<{ role: string; content: string; timestamp: string }>; sessionId?: string }
  ) {
    return this.spaces.analyzeTrainingConversation(id, body);
  }

  @Get(':id/training/verify')
  async verifyTraining(@Param('id') id: string) {
    return this.spaces.verifyTraining(id);
  }

  @Post(':id/training/conversation')
  async trainingConversation(
    @Param('id') id: string,
    @Body() body: { message: string; conversationHistory: any[]; spaceContext?: any }
  ) {
    return this.spaces.trainingConversation(id, body);
  }

  @Post(':id/training/generate-prompt')
  async generateSystemPrompt(
    @Param('id') id: string,
    @Body() body: { conversationHistory: any[] }
  ) {
    return this.spaces.generateSystemPrompt(id, body.conversationHistory);
  }

  @Put(':id/system-prompt')
  async updateSystemPrompt(
    @Param('id') id: string,
    @Body() body: { systemPrompt: string }
  ) {
    return this.spaces.updateSystemPrompt(id, body.systemPrompt);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(@Param('id') spaceId: string, @UploadedFile() file: any) {
    console.log('Document upload route called for space:', spaceId);
    return this.spaces.uploadDocument(spaceId, file);
  }
}
