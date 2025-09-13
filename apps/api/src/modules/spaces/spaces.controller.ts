import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { SpacesService } from './spaces.service';
import { Request } from 'express';

@Controller('spaces')
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Post()
  async create(@Body() body: { name: string; ownerId?: string }) {
    const { name, ownerId } = body;
    return this.spaces.create(name, ownerId);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: Request) {
    const spaceId = req.spaceId || id;
    return this.spaces.findOne(spaceId);
  }
}

