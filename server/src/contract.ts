import { z } from 'zod';

export const uuid = z.uuid();
export const name = z.string().trim().min(1).max(120);
export const itemInput = z.object({
  name,
  kind: z.enum(['consumable', 'returnable']),
  category: z.string().trim().min(1).max(80),
  location: z.string().trim().min(1).max(120),
  visibility: z.enum(['shared', 'private']),
  quantity: z.number().int().nonnegative().max(2_147_483_647).optional(),
  unit: z.string().trim().min(1).max(32).optional(),
  lowThreshold: z.number().int().nonnegative().max(2_147_483_647).optional(),
  custodianId: uuid.optional(),
  photoUri: z.string().url().optional(),
}).strict().superRefine((x, ctx) => {
  if (x.kind === 'consumable' && x.quantity === undefined) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantity is required.' });
  if (x.kind === 'returnable' && (x.quantity !== undefined || x.lowThreshold !== undefined || x.unit !== undefined)) ctx.addIssue({ code: 'custom', path: ['kind'], message: 'Returnables cannot have stock fields.' });
});
export const pageQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }).strict();
export const itemQuery = pageQuery.extend({
  q: z.string().max(120).optional(), category: z.string().max(80).optional(), location: z.string().max(120).optional(),
  kind: z.enum(['consumable', 'returnable']).optional(), visibility: z.enum(['shared', 'private']).optional(),
  ownerId: uuid.optional(), status: z.string().max(40).optional(), lowStock: z.enum(['true', 'false']).optional(),
  availability: z.enum(['available', 'unavailable']).optional(),
});
export const amountBody = z.object({ amount: z.number().int().positive().max(2_147_483_647) }).strict();
export const noteBody = z.object({ note: z.string().trim().min(1).max(2000) }).strict();
export const empty = z.object({}).strict();
export const idParams = z.object({ itemId: uuid });

export type ErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'IDEMPOTENCY_REUSED' | 'RATE_LIMITED' | 'TEMPORARY';
