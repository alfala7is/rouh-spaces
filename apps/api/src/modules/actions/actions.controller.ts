import { Body, Controller, Post, Get, Param, Query, Req, Put } from '@nestjs/common';
import { ActionsService } from './actions.service';
import { ActionExecutionService } from './execution.service';
import { Request } from 'express';

@Controller('actions')
export class ActionsController {
  constructor(
    private readonly actions: ActionsService,
    private readonly execution: ActionExecutionService,
  ) {}

  // Basic action creation
  @Post()
  async create(
    @Req() req: Request,
    @Body() body: {
      itemId?: string;
      type: 'contact' | 'inquiry' | 'hold' | 'book' | 'intro' | 'order' | 'schedule' | 'submit';
      parameters?: Record<string, any>;
    }
  ) {
    const spaceId = req.spaceId!;
    return this.actions.create(spaceId, req.userId, body);
  }

  @Get()
  async getActions(
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const spaceId = req.spaceId!;
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    return this.actions.getActionsBySpace(spaceId, parsedLimit, parsedOffset);
  }

  @Put(':id/cancel')
  async cancelAction(@Param('id') actionId: string, @Req() req: Request) {
    return this.actions.cancelAction(actionId, req.userId || 'unknown');
  }

  // Action status (latest execution + receipt + recent updates)
  @Get(':id/status')
  async getStatus(@Param('id') actionId: string) {
    return this.execution.getActionStatus(actionId);
  }
}
