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
  const existing = await tx.deviceToken.findUnique({ where: { token } });
  if (existing && existing.userId !== req.actorId) {
    const moved = await tx.deviceToken.update({ where: { id: existing.id }, data: { userId: req.actorId, platform, disabledAt: null } });
    return { status: 200, body: { id: moved.id, platform: moved.platform, enabled: true } };
  }
  const byId = await tx.deviceToken.findUnique({ where: { id: tokenId } });
  if (byId && byId.userId !== req.actorId) fail(404, 'NOT_FOUND', 'Device not found.');
  if (existing && existing.id !== tokenId) {
    const reenabled = await tx.deviceToken.update({ where: { id: existing.id }, data: { platform, disabledAt: null } });
    return { status: 200, body: { id: reenabled.id, platform: reenabled.platform, enabled: true } };
  }
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

reminders.get('/notifications', async (req, res) => {
  const { cursor, limit, spaceId } = pageQuery.extend({ spaceId: uuid.optional() }).parse(req.query);
  const rows = await prisma.appNotification.findMany({
    where: { userId: req.actorId, space: { archivedAt: null, memberships: { some: { userId: req.actorId } } }, ...(spaceId ? { spaceId } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
    ...(cursor ? { cursor: { id: uuid.parse(cursor) }, skip: 1 } : {}),
  });
  res.json({ data: rows.slice(0, limit).map(row => ({ id: row.id, kind: row.kind, title: row.title, body: row.body, itemId: row.itemId, requestId: row.requestId, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null })), nextCursor: rows.length > limit ? rows[limit - 1]?.id : null });
});

reminders.post('/notifications/:notificationId/read', mutation(async (tx, req) => {
  const { notificationId } = z.object({ notificationId: uuid }).parse(req.params); empty.parse(req.body ?? {});
  const row = await tx.appNotification.findFirst({ where: { id: notificationId, userId: req.actorId, space: { archivedAt: null, memberships: { some: { userId: req.actorId } } } } });
  if (!row) fail(404, 'NOT_FOUND', 'Notification not found.');
  await tx.appNotification.update({ where: { id: notificationId }, data: { readAt: row!.readAt ?? new Date() } });
  return { status: 200, body: { id: notificationId, read: true } };
}));
