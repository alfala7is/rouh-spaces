import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ItemsService } from './items.service';
import { Request } from 'express';

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Post('upsert')
  async upsert(@Req() req: Request, @Body() body: { type?: string; canonicalJson: any }) {
    const spaceId = req.spaceId!;
    const type = body.type || 'listing';
    return this.items.upsert(spaceId, type, body.canonicalJson);
  }

  @Get('search')
  async search(@Req() req: Request, @Query('query') query = '', @Query('limit') limit = '20', @Query('offset') offset = '0') {
    const spaceId = req.spaceId!;
    return this.items.search(spaceId, query, Number(limit), Number(offset));
  }
}

