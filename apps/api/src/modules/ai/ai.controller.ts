import { Body, Controller, Post, Req, BadRequestException, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { AiService } from './ai.service';
import { Request } from 'express';
import { z } from 'zod';

const compileTemplateSchema = z.object({
  description: z.string().min(10).max(2000),
});

interface CompileTemplateRequest {
  description: string;
}

interface CompileTemplateResponse {
  valid: boolean;
  template?: any;
  errors?: string[];
  rawOutput?: string;
  confidence?: number;
}

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('compile-template')
  async compileTemplate(
    @Req() req: Request,
    @Body() body: CompileTemplateRequest
  ): Promise<CompileTemplateResponse> {
    // Get spaceId from middleware, headers, or throw error if not available
    const spaceId = req.spaceId || req.headers['x-space-id'] as string;
    if (!spaceId) {
      throw new BadRequestException('Space ID is required. Provide it via x-space-id header or route parameter.');
    }

    // Validate input
    try {
      compileTemplateSchema.parse(body);
    } catch (error) {
      throw new BadRequestException('Invalid request: Description must be between 10-2000 characters');
    }

    try {
      console.log(`[AI Controller] Compiling template for space ${spaceId} with description: ${body.description.substring(0, 100)}...`);

      const result = await this.aiService.compileTemplate(body.description, spaceId);

      console.log(`[AI Controller] Template compilation ${result.valid ? 'successful' : 'failed'} for space ${spaceId}`);

      if (result.valid) {
        return {
          valid: true,
          template: result.template,
          confidence: result.confidence || 0.8,
          rawOutput: result.rawOutput
        };
      } else {
        return {
          valid: false,
          errors: result.errors || ['Template compilation failed'],
          confidence: result.confidence || 0.2,
          rawOutput: result.rawOutput
        };
      }
    } catch (error: any) {
      console.error(`[AI Controller] Template compilation error for space ${spaceId}:`, error);

      if (error.message?.includes('quota exceeded')) {
        throw new ServiceUnavailableException('OpenAI API quota exceeded. Please try again later.');
      }

      if (error.message?.includes('not available') || error.message?.includes('disabled')) {
        throw new ServiceUnavailableException('Template compilation service is currently unavailable.');
      }

      throw new InternalServerErrorException(`Template compilation failed: ${error.message || 'Unknown error'}`);
    }
  }
}