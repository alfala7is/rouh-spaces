import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { SourcesService } from './sources.service';

@Controller('sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Post()
  async register(@Req() req: Request, @Body() body: { type: 'api' | 'csv' | 'form' | 'manual'; authJson?: any }) {
    const spaceId = req.spaceId!;
    return this.sources.register(spaceId, body.type, body.authJson);
  }

  @Post(':id/sync')
  async sync(@Req() req: Request, @Param('id') id: string, @Body() body: { rows?: any[] }) {
    const spaceId = req.spaceId!;
    const rows = body.rows || [];
    return this.sources.scheduleCsvSync(spaceId, id, rows);
  }
}

