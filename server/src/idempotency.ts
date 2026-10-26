import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './db.js';
import { fail } from './errors.js';

export type Tx = Prisma.TransactionClient;
type Result = { status: number; body: unknown; afterCommit?: () => Promise<void> };
export type Mutation = (tx: Tx, req: Request) => Promise<Result>;

export function mutation(fn: Mutation, timeoutMs = 10000) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body ??= {};
      const key = req.header('Idempotency-Key');
      if (!key || key.length > 128 || !/^[\w-]+$/.test(key)) fail(422, 'VALIDATION', 'A valid Idempotency-Key is required.');
      const hash = createHash('sha256').update(JSON.stringify([req.method, req.path, req.body, req.actorId])).digest('hex');
      const result = await prisma.$transaction(async tx => {
        await tx.$executeRaw`INSERT INTO "MutationReceipt" ("actorId", "key", "hash", "response", "status", "createdAt") VALUES (${req.actorId}::uuid, ${key!}, ${hash}, '{}'::jsonb, 0, now()) ON CONFLICT DO NOTHING`;
        const receipt = await tx.mutationReceipt.findUniqueOrThrow({ where: { actorId_key: { actorId: req.actorId, key: key! } } });
        if (receipt.hash !== hash) fail(409, 'IDEMPOTENCY_REUSED', 'Use a new key for a different mutation.');
        if (receipt.status !== 0) return { status: receipt.status, body: receipt.response };
        const output = await fn(tx, req);
        await tx.mutationReceipt.update({ where: { actorId_key: { actorId: req.actorId, key: key! } }, data: { response: output.body as Prisma.InputJsonValue, status: output.status } });
        return output;
      }, { timeout: timeoutMs });
      if (result.afterCommit) {
        try { await result.afterCommit(); }
        catch (error) { console.error('Post-commit cleanup failed:', error); }
      }
      res.status(result.status).json(result.body);
    } catch (error) { next(error); }
  };
}

export async function lockItem(tx: Tx, id: string) { await tx.$queryRaw`SELECT id FROM "Item" WHERE id = ${id}::uuid FOR UPDATE`; }
