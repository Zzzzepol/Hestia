import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { empty, pageQuery, uuid } from '../contract.js';
import { fail } from '../errors.js';
import { mutation } from '../idempotency.js';

export const reminders = Router();
reminders.put('/devices/:tokenId', mutation(async (tx, req) => {
  const { tokenId } = z.object({ tokenId: uuid }).parse(req.params);
  const { token, platform } = z.object({ token: z.string().regex(/^Expo(nent)?PushToken\[[^\]]+\]$/).max(250), platform: z.enum(['ios', 'android']) }).strict().parse(req.body);
  const byId = await tx.deviceToken.findUnique({ where: { id: tokenId } });
  if (byId && byId.userId !== req.actorId) fail(404, 'NOT_FOUND', 'Device not found.');
  const existing = await tx.deviceToken.findUnique({ where: { token } });
  if (existing && existing.userId !== req.actorId) fail(409, 'CONFLICT', 'Token belongs to another user.');
  const device = await tx.deviceToken.upsert({ where: { id: tokenId }, create: { id: tokenId, userId: req.actorId, token, platform }, update: { token, platform, disabledAt: null } });
  return { status: 200, body: { id: device.id, platform: device.platform, enabled: !device.disabledAt } };
}));
reminders.delete('/devices/:tokenId', mutation(async (tx, req) => {
  const { tokenId } = z.object({ tokenId: uuid }).parse(req.params); empty.parse(req.body ?? {});
  const device = await tx.deviceToken.findFirst({ where: { id: tokenId, userId: req.actorId } });
  if (!device) fail(404, 'NOT_FOUND', 'Device not found.');
  const updated = await tx.deviceToken.update({ where: { id: tokenId }, data: { disabledAt: new Date() } });
  return { status: 200, body: { id: updated.id, platform: updated.platform, enabled: false } };
}));
reminders.get('/reminders', async (req, res) => {
  const { cursor, limit } = pageQuery.parse(req.query);
  const rows = await prisma.borrowRequest.findMany({ where: { borrowerId: req.actorId, state: { in: ['Borrowed', 'ReadyToReturn'] }, dueAt: { not: null }, item: { visibility: 'shared', deletedAt: null, space: { memberships: { some: { userId: req.actorId } } } } }, include: { item: true }, orderBy: { id: 'asc' }, take: limit + 1, ...(cursor ? { cursor: { id: uuid.parse(cursor) }, skip: 1 } : {}) });
  res.json({ data: rows.slice(0, limit).map(r => ({ requestId: r.id, itemId: r.itemId, itemName: r.item.name, dueAt: r.dueAt!.toISOString(), status: r.dueAt! < new Date() ? 'overdue' : 'upcoming' })), nextCursor: rows.length > limit ? rows[limit - 1]?.id : null });
});
