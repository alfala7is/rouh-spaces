import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { NormalizeDedupeService } from './normalize-dedupe.service';

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService, private norm: NormalizeDedupeService) {}

  async upsert(spaceId: string, type: string, canonicalJson: any) {
    return this.prisma.withSpaceTx(spaceId, (tx) => this.norm.upsertItem(tx, { spaceId, type, canonicalJson }));
  }

  async search(spaceId: string, query: string, limit = 20, offset = 0) {
    return this.prisma.withSpaceTx(spaceId, async (tx) => {
      const q = `%${query}%`;
      const rows = (await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "Item" WHERE "spaceId" = $1 AND "canonicalJson"::text ILIKE $2 ORDER BY "lastSeenAt" DESC NULLS LAST LIMIT $3 OFFSET $4`,
        spaceId,
        q,
        Number(limit),
        Number(offset),
      )) as any[];
      return rows;
    });
  }
}
