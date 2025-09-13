import { Controller, Get, Query, Req } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { Request } from 'express';

@Controller('ledger')
export class LedgerController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Req() req: Request, @Query('spaceId') spaceIdParam?: string) {
    const spaceId = req.spaceId || spaceIdParam!;
    return this.prisma.withSpaceTx(spaceId, (tx) => tx.ledgerEvent.findMany({ where: { spaceId }, orderBy: { ts: 'desc' }, take: 100 }));
  }
}

