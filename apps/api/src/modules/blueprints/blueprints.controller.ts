import { Body, Controller, Param, Post, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { BlueprintsService } from './blueprints.service';

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  templateId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  includeSuggestions: z.boolean().optional(),
  systemPrompt: z.string().max(4000).optional(),
});

@Controller('spaces/:spaceId/blueprints')
export class BlueprintsController {
  constructor(private readonly blueprints: BlueprintsService) {}

  @Post('chat')
  async chat(@Param('spaceId') spaceId: string, @Body() body: unknown) {
    let payload: z.infer<typeof chatSchema>;
    try {
      payload = chatSchema.parse(body);
    } catch (error: any) {
      throw new BadRequestException(error?.issues?.[0]?.message || 'Invalid chat request');
    }

    return this.blueprints.chat(spaceId, payload);
  }
}
