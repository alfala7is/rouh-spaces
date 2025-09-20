import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class NormalizeDedupeService {
  async upsertItem(tx: PrismaClient, data: { spaceId: string; type: string; canonicalJson: Prisma.InputJsonValue }) {
    const now = new Date();
    const json = data.canonicalJson as any;
    const phone = json?.phone || json?.contact_phone;
    const title = (json?.title || '').toString().trim().toLowerCase();

    let existing = null as any;
    if (phone) {
      existing = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "Item" WHERE "spaceId"=$1 AND type=$2 AND "canonicalJson"->>'phone' = $3 LIMIT 1`,
        data.spaceId,
        data.type,
        String(phone),
      );
      existing = existing?.[0] ?? null;
    }
    if (!existing && title) {
      const res = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "Item" WHERE "spaceId"=$1 AND type=$2 AND lower("canonicalJson"->>'title') = $3 LIMIT 1`,
        data.spaceId,
        data.type,
        title,
      );
      existing = res?.[0] ?? null;
    }

    const ttlAt = json?.ttl_days ? new Date(now.getTime() + Number(json.ttl_days) * 86400000) : null;

    if (existing) {
      const merged = this.mergeCanonical((existing.canonicalJson as any) ?? (existing.canonical_json as any), json);
      return tx.item.update({
        where: { id: existing.id },
        data: {
          canonicalJson: merged,
          lastSeenAt: now,
          ttlAt,
        },
      });
    }
    return tx.item.create({
      data: {
        spaceId: data.spaceId,
        type: data.type,
        canonicalJson: json,
        lastSeenAt: now,
        ttlAt,
      },
    });
  }

  mergeCanonical(existing: any, incoming: any) {
    const out: any = { ...existing };
    for (const [key, val] of Object.entries(incoming)) {
      const prev = existing?.[key];
      // Field-level provenance structure
      if (val && typeof val === 'object' && 'value' in (val as any)) {
        out[key] = { ...(prev || {}), ...val, last_seen: new Date().toISOString() };
      } else {
        out[key] = val;
      }
    }
    return out;
  }
}
