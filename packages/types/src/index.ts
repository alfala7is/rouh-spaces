import { z } from "zod";

export const RoleEnum = z.enum(["seeker", "provider", "operator", "admin"]);
export type Role = z.infer<typeof RoleEnum>;

export const SpaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  template: z.string().optional().nullable(),
  configJson: z.record(z.any()).nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type Space = z.infer<typeof SpaceSchema>;

export const MemberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  spaceId: z.string().uuid(),
  role: RoleEnum,
  status: z.enum(["active", "invited", "suspended"]).default("active"),
});
export type Member = z.infer<typeof MemberSchema>;

export const SourceSchema = z.object({
  id: z.string().uuid(),
  spaceId: z.string().uuid(),
  type: z.enum(["api", "csv", "form", "manual"]),
  authJson: z.record(z.any()).nullable().optional(),
  status: z.enum(["ok", "error", "paused"]).default("ok"),
  lastSyncAt: z.string().datetime().nullable().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const ItemSchema = z.object({
  id: z.string().uuid(),
  spaceId: z.string().uuid(),
  type: z.string(),
  canonicalJson: z.record(z.any()),
  lastSeenAt: z.string().datetime().nullable().optional(),
  ttlAt: z.string().datetime().nullable().optional(),
});
export type Item = z.infer<typeof ItemSchema>;

export const ActionSchema = z.object({
  id: z.string().uuid(),
  spaceId: z.string().uuid(),
  userId: z.string().nullable().optional(),
  itemId: z.string().uuid().nullable().optional(),
  type: z.enum(["contact", "inquiry", "hold", "book", "intro"]),
  status: z.enum(["pending", "done", "refunded"]).default("pending"),
  createdAt: z.string().datetime(),
});
export type Action = z.infer<typeof ActionSchema>;

export const LeadSchema = z.object({
  id: z.string().uuid(),
  spaceId: z.string().uuid(),
  itemId: z.string().uuid(),
  providerId: z.string().uuid().nullable().optional(),
  seekerId: z.string().uuid().nullable().optional(),
  qualified: z.boolean().default(false),
  refunded: z.boolean().default(false),
  createdAt: z.string().datetime(),
});
export type Lead = z.infer<typeof LeadSchema>;

export const LedgerEventSchema = z.object({
  id: z.string().uuid(),
  ts: z.string().datetime(),
  actorId: z.string().nullable().optional(),
  spaceId: z.string().uuid(),
  entity: z.string(),
  eventType: z.string(),
  payloadJson: z.record(z.any()).nullable().optional(),
});
export type LedgerEvent = z.infer<typeof LedgerEventSchema>;

export const UpsertItemInput = z.object({
  spaceId: z.string().uuid(),
  type: z.string().default("listing"),
  canonicalJson: z.record(z.any()),
});

export type UpsertItemInput = z.infer<typeof UpsertItemInput>;

