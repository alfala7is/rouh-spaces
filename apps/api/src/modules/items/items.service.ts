import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { NormalizeDedupeService } from './normalize-dedupe.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService, private norm: NormalizeDedupeService, private aiService: AiService) {}

  async upsert(spaceId: string, type: string, canonicalJson: any) {
    const item = await this.prisma.withSpaceTx(spaceId, (tx) => this.norm.upsertItem(tx, { spaceId, type, canonicalJson }));

    // Create embedding for the item
    try {
      const embeddingText = this.createEmbeddingText(canonicalJson);
      await this.aiService.createEmbedding({
        space_id: spaceId,
        item_id: item.id,
        text: embeddingText,
      });
    } catch (error) {
      console.error('Failed to create embedding for item:', error);
      // Don't fail the item creation if embedding fails
    }

    return item;
  }

  private createEmbeddingText(canonicalJson: any): string {
    // Extract meaningful text from the item for embedding
    const parts = [];

    if (canonicalJson.name) parts.push(`Name: ${canonicalJson.name}`);
    if (canonicalJson.description) parts.push(`Description: ${canonicalJson.description}`);
    if (canonicalJson.bio) parts.push(`Bio: ${canonicalJson.bio}`);
    if (canonicalJson.type) parts.push(`Type: ${canonicalJson.type}`);
    if (canonicalJson.email) parts.push(`Email: ${canonicalJson.email}`);
    if (canonicalJson.phone) parts.push(`Phone: ${canonicalJson.phone}`);
    if (canonicalJson.website) parts.push(`Website: ${canonicalJson.website}`);
    if (canonicalJson.address) parts.push(`Address: ${canonicalJson.address}`);
    if (canonicalJson.hours) parts.push(`Hours: ${JSON.stringify(canonicalJson.hours)}`);
    if (canonicalJson.services && Array.isArray(canonicalJson.services)) {
      parts.push(`Services: ${canonicalJson.services.join(', ')}`);
    }
    if (canonicalJson.specialties && Array.isArray(canonicalJson.specialties)) {
      parts.push(`Specialties: ${canonicalJson.specialties.join(', ')}`);
    }

    return parts.join('\n');
  }

  async search(spaceId: string, query: string, limit = 20, offset = 0) {
    return this.prisma.withSpaceTx(spaceId, async (tx) => {
      const q = `%${query}%`;
      const rows = (await tx.$queryRawUnsafe(
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
