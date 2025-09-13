import { Body, Controller, Post, Req } from '@nestjs/common';
import { ActionsService } from './actions.service';
import { Request } from 'express';

@Controller('actions')
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Post()
  async post(@Req() req: Request, @Body() body: { itemId?: string; type: 'contact' | 'inquiry' | 'hold' | 'book' | 'intro' }) {
    const spaceId = req.spaceId!;
    return this.actions.create(spaceId, req.userId, body);
  }
}

