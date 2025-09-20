import { Injectable } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';

interface EmbedRequest {
  space_id: string;
  text: string;
  item_id?: string;
}

interface SpaceContext {
  space: {
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
  };
  profile?: {
    businessName: string;
    bio?: string;
    phone?: string;
    email?: string;
    hours?: any;
    services?: string[];
  };
  items: Array<{
    type: string;
    name?: string;
    description?: string;
    services?: string[];
    price?: number;
  }>;
  availableActions: string[];
  rules?: Array<{
    category: string;
    description?: string;
    conditions: any;
    responses: any;
  }>;
  trainingExamples?: Array<Array<{
    role: 'user' | 'assistant';
    content: string;
    sequence: number;
  }>>;
}

interface RAGQueryRequest {
  space_id: string;
  query: string;
  k?: number;
  context?: SpaceContext;
}

interface RAGResponse {
  answer: string;
  citations: Array<{
    embedding_id: string;
    item_id: string | null;
  }>;
}

@Injectable()
export class AiService {
  private readonly aiServiceUrl: string;

  constructor() {
    this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  }

  async createEmbedding(request: EmbedRequest): Promise<{ ok: boolean }> {
    try {
      const response = await axios.post(`${this.aiServiceUrl}/embed`, request);
      return response.data;
    } catch (error) {
      console.error('Failed to create embedding:', error);
      throw new Error('Failed to create embedding');
    }
  }

  async queryRAG(request: RAGQueryRequest): Promise<RAGResponse> {
    try {
      const response = await axios.post(`${this.aiServiceUrl}/rag/query`, request);
      return response.data;
    } catch (error) {
      console.error('Failed to query RAG:', error);
      throw new Error('Failed to query RAG');
    }
  }

  async uploadDocument(spaceId: string, file: any): Promise<{
    ok: boolean;
    filename: string;
    extracted_text_length: number;
    message: string;
  }> {
    try {
      const formData = new FormData();

      // Append the file buffer with proper options
      formData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      const response = await axios.post(
        `${this.aiServiceUrl}/documents/process?space_id=${spaceId}`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Failed to upload document:', error);
      if ((error as any).response?.data?.detail) {
        throw new Error((error as any).response.data.detail);
      }
      throw new Error('Failed to upload document');
    }
  }

  async callAI(endpoint: string, data: any): Promise<any> {
    try {
      const response = await axios.post(endpoint, data);
      return response.data;
    } catch (error) {
      console.error(`Failed to call AI endpoint ${endpoint}:`, error);
      if ((error as any).response?.data?.detail) {
        throw new Error((error as any).response.data.detail);
      }
      throw new Error(`Failed to call AI service: ${endpoint}`);
    }
  }

  async analyzeTrainingConversation(request: {
    space_id: string;
    conversation: Array<{ role: string; content: string; timestamp: string }>;
    space_context: SpaceContext;
  }): Promise<{
    analysis: {
      correction_detected: boolean;
      error_type: string;
      scenario_category: string;
      incorrect_pattern: string;
      correct_pattern: string;
      general_principle: string;
      similar_queries: string[];
      response_template: string;
      confidence: number;
    };
    conversation_length: number;
    space_id: string;
  }> {
    try {
      const response = await axios.post(`${this.aiServiceUrl}/analyze-training`, request);
      return response.data;
    } catch (error) {
      console.error('Failed to analyze training conversation:', error);
      if ((error as any).response?.data?.detail) {
        throw new Error((error as any).response.data.detail);
      }
      throw new Error('Failed to analyze training conversation');
    }
  }
}