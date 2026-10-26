import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { empty, pageQuery, uuid } from '../contract.js';
import { fail } from '../errors.js';
import { membership } from '../policy.js';
import { mutation } from '../idempotency.js';
import { memberView, sessionView, userMemberView } from '../serialize.js';
import { INVITE_EXPIRY_HOURS, inviteHash, issueInviteCode } from '../invites.js';

export const spaces = Router();
const params = z.object({ spaceId: uuid });
const memberParams = params.extend({ memberId: uuid });
const inviteParams = params.extend({ inviteId: uuid });
const unlimitedInviteUses = 2_147_483_647;

spaces.get('/session', async (req, res) => res.json(await sessionView(req.actorId)));
spaces.patch('/profile', mutation(async (tx, req) => {
  const data = z.object({ name: z.string().trim().min(1).max(100), timeZone: z.string().max(80).default('UTC') }).strict().parse(req.body);
  try { new Intl.DateTimeFormat('en', { timeZone: data.timeZone }); } catch { fail(422, 'VALIDATION', 'Invalid time zone.'); }
  const user = await tx.user.update({ where: { id: req.actorId }, data });
  return { status: 200, body: { id: user.id, name: user.name, timeZone: user.timeZone } };
}));
spaces.patch('/session', mutation(async (tx, req) => {
  const data = z.object({ spaceId: uuid.nullable().optional(), theme: z.enum(['system', 'light', 'dark']).optional(), notifications: z.boolean().optional(), lowStockAlerts: z.boolean().optional(), timeZone: z.string().max(80).optional() }).strict().parse(req.body);
  if (data.timeZone) { try { new Intl.DateTimeFormat('en', { timeZone: data.timeZone }); } catch { fail(422, 'VALIDATION', 'Invalid time zone.'); } }
  if (data.spaceId) {
    const member = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId: data.spaceId, userId: req.actorId } } });
    if (!member) fail(404, 'NOT_FOUND', 'Space not found.');
  }
  const { spaceId, ...settings } = data;
  await tx.user.update({ where: { id: req.actorId }, data: { ...settings, ...(spaceId !== undefined ? { selectedSpaceId: spaceId } : {}) } });
  return { status: 200, body: await sessionView(req.actorId, tx) };
}));
spaces.get('/spaces', async (req, res) => {
  const { cursor, limit } = pageQuery.parse(req.query);
  const rows = await prisma.membership.findMany({ where: { userId: req.actorId }, include: { space: true }, orderBy: { spaceId: 'asc' }, take: limit + 1, ...(cursor ? { cursor: { spaceId_userId: { spaceId: uuid.parse(cursor), userId: req.actorId } }, skip: 1 } : {}) });
  res.json({ data: rows.slice(0, limit).map(x => ({ id: x.spaceId, name: x.space.name, kind: x.space.kind, role: x.role })), nextCursor: rows.length > limit ? rows[limit - 1]?.spaceId : null });
});
spaces.post('/spaces', mutation(async (tx, req) => {
  const { name, kind } = z.object({ name: z.string().trim().min(1).max(100), kind: z.enum(['household', 'dorm', 'student_org', 'small_office']).default('household') }).strict().parse(req.body);
  const space = await tx.space.create({ data: { name, kind, memberships: { create: { userId: req.actorId, role: 'admin' } } } });
  const user = await tx.user.update({ where: { id: req.actorId }, data: { selectedSpaceId: space.id } });
  const code = issueInviteCode();
  const invite = await tx.invite.create({ data: { spaceId: space.id, tokenHash: inviteHash(code), expiresAt: new Date(Date.now() + INVITE_EXPIRY_HOURS * 3600000), maxUses: unlimitedInviteUses, createdById: req.actorId } });
  await tx.audit.create({ data: { spaceId: space.id, actorId: req.actorId, action: 'invite.created', subjectId: invite.id } });
  return { status: 201, body: { members: [userMemberView(user, 'admin')], userId: user.id, spaceId: space.id, theme: user.theme, notifications: user.notifications, lowStockAlerts: user.lowStockAlerts, invite: { id: invite.id, code, expiresAt: invite.expiresAt.toISOString() } } };
}));
spaces.get('/spaces/:spaceId', async (req, res) => {
  const { spaceId } = params.parse(req.params);
  await membership(spaceId, req.actorId);
  const [space, members] = await Promise.all([prisma.space.findUniqueOrThrow({ where: { id: spaceId } }), prisma.membership.findMany({ where: { spaceId } })]);
  res.json({ id: space.id, name: space.name, kind: space.kind, code: '', memberIds: members.map(m => m.userId), adminIds: members.filter(m => m.role === 'admin').map(m => m.userId) });
});
spaces.delete('/spaces/:spaceId', mutation(async (tx, req) => {
  const { spaceId } = params.parse(req.params);
  const { confirmName } = z.object({ confirmName: z.string() }).strict().parse(req.body);
  await tx.$queryRaw`SELECT id FROM "Space" WHERE id = ${spaceId}::uuid FOR UPDATE`;
  const space = await tx.space.findUnique({ where: { id: spaceId } });
  if (!space || space.archivedAt) return fail(404, 'NOT_FOUND', 'Space not found.');
  const actor = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId, userId: req.actorId } } });
  if (!actor || actor.role !== 'admin') fail(403, 'FORBIDDEN', 'Only a Space admin can archive it.');
  if (confirmName !== space.name) fail(422, 'VALIDATION', 'Type the Space name exactly to archive it.');

  await tx.space.update({ where: { id: spaceId }, data: { archivedAt: new Date() } });
  await tx.invite.updateMany({ where: { spaceId, revokedAt: null }, data: { revokedAt: new Date() } });
  await tx.$queryRaw`SELECT set_config('hestia.deleting_space', ${spaceId}, true)`;
  await tx.$executeRaw`UPDATE "User" AS u SET "selectedSpaceId" = (SELECT m."spaceId" FROM "Membership" AS m JOIN "Space" s ON s.id = m."spaceId" WHERE m."userId" = u.id AND m."spaceId" <> ${spaceId}::uuid AND s."archivedAt" IS NULL ORDER BY m."joinedAt" ASC LIMIT 1) WHERE u."selectedSpaceId" = ${spaceId}::uuid`;
  await tx.membership.deleteMany({ where: { spaceId } });
  await tx.audit.create({ data: { spaceId, actorId: req.actorId, action: 'space.archived', subjectId: spaceId } });
  return { status: 200, body: await sessionView(req.actorId, tx) };
}, 30000));
spaces.get('/spaces/:spaceId/members', async (req, res) => {
  const { spaceId } = params.parse(req.params); await membership(spaceId, req.actorId);
  const { cursor, limit } = pageQuery.parse(req.query);
  const rows = await prisma.membership.findMany({ where: { spaceId }, include: { user: true }, orderBy: { userId: 'asc' }, take: limit + 1, ...(cursor ? { cursor: { spaceId_userId: { spaceId, userId: uuid.parse(cursor) } }, skip: 1 } : {}) });
  res.json({ data: rows.slice(0, limit).map(memberView), nextCursor: rows.length > limit ? rows[limit - 1]?.userId : null });
});
spaces.post('/spaces/:spaceId/invites', mutation(async (tx, req) => {
  const { spaceId } = params.parse(req.params);
  empty.parse(req.body);
  const m = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId, userId: req.actorId } } });
  if (!m || m.role !== 'admin') fail(403, 'FORBIDDEN', 'This action requires a Space admin.');
  const code = issueInviteCode();
  const invite = await tx.invite.create({ data: { spaceId, tokenHash: inviteHash(code), expiresAt: new Date(Date.now() + INVITE_EXPIRY_HOURS * 3600000), maxUses: unlimitedInviteUses, createdById: req.actorId } });
  await tx.audit.create({ data: { spaceId, actorId: req.actorId, action: 'invite.created', subjectId: invite.id } });
  return { status: 201, body: { id: invite.id, code, expiresAt: invite.expiresAt.toISOString() } };
}));
spaces.get('/spaces/:spaceId/invites', async (req, res) => {
  const { spaceId } = params.parse(req.params); await membership(spaceId, req.actorId, 'admin');
  const rows = await prisma.invite.findMany({ where: { spaceId }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ data: rows.map(i => ({ id: i.id, createdAt: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString(), maxUses: i.maxUses, uses: i.uses, revokedAt: i.revokedAt?.toISOString() ?? null })), nextCursor: null });
});
spaces.post('/spaces/:spaceId/invites/:inviteId/revoke', mutation(async (tx, req) => {
  const { spaceId, inviteId } = inviteParams.parse(req.params); empty.parse(req.body);
  const m = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId, userId: req.actorId } } });
  if (!m || m.role !== 'admin') fail(403, 'FORBIDDEN', 'This action requires a Space admin.');
  const result = await tx.invite.updateMany({ where: { id: inviteId, spaceId }, data: { revokedAt: new Date() } });
  if (!result.count) fail(404, 'NOT_FOUND', 'Invite not found.');
  await tx.audit.create({ data: { spaceId, actorId: req.actorId, action: 'invite.revoked', subjectId: inviteId } });
  const invite = await tx.invite.findUniqueOrThrow({ where: { id: inviteId } });
  return { status: 200, body: { id: invite.id, revokedAt: invite.revokedAt!.toISOString() } };
}));
spaces.post('/spaces/join', mutation(async (tx, req) => {
  const { code } = z.object({ code: z.string().min(8).max(100) }).strict().parse(req.body);
  const hash = inviteHash(code);
  const rows = await tx.$queryRaw<{ id: string; spaceId: string; expiresAt: Date; maxUses: number; uses: number; revokedAt: Date | null }[]>`SELECT id, "spaceId", "expiresAt", "maxUses", uses, "revokedAt" FROM "Invite" WHERE "tokenHash" = ${hash} FOR UPDATE`;
  const invite = rows[0];
  if (!invite) fail(404, 'NOT_FOUND', 'Invite not found.');
  if (invite!.expiresAt <= new Date() || invite!.uses >= invite!.maxUses) fail(410, 'INVITE_EXPIRED', 'This code has expired.');
  if (invite!.revokedAt) fail(410, 'INVITE_REVOKED', 'This code is no longer active.');
  if (await tx.space.findFirst({ where: { id: invite!.spaceId, archivedAt: { not: null } } })) fail(410, 'INVITE_REVOKED', 'This Space is no longer active.');
  const existing = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId: invite!.spaceId, userId: req.actorId } } });
  if (!existing) {
    await tx.membership.create({ data: { spaceId: invite!.spaceId, userId: req.actorId } });
    await tx.invite.update({ where: { id: invite!.id }, data: { uses: { increment: 1 } } });
    await tx.audit.create({ data: { spaceId: invite!.spaceId, actorId: req.actorId, action: 'member.joined', subjectId: req.actorId } });
  }
  await tx.user.update({ where: { id: req.actorId }, data: { selectedSpaceId: invite!.spaceId } });
  return { status: 200, body: await sessionView(req.actorId, tx) };
}));
spaces.post('/spaces/join/preview', async (req, res) => {
  const { code } = z.object({ code: z.string().trim().min(8).max(100) }).strict().parse(req.body);
  const invite = await prisma.invite.findUnique({ where: { tokenHash: inviteHash(code) }, include: { space: { include: { _count: { select: { memberships: true } } } } } });
  if (!invite) return fail(404, 'NOT_FOUND', 'Invite not found.');
  if (invite.expiresAt <= new Date() || invite.uses >= invite.maxUses) return fail(410, 'INVITE_EXPIRED', 'This code has expired.');
  if (invite.revokedAt) return fail(410, 'INVITE_REVOKED', 'This code is no longer active.');
  if (invite.space.archivedAt) return fail(410, 'INVITE_REVOKED', 'This Space is no longer active.');
  const creator = await prisma.user.findUnique({ where: { id: invite.createdById }, select: { name: true } });
  res.json({ id: invite.space.id, name: invite.space.name, kind: invite.space.kind, memberCount: invite.space._count.memberships, invitedBy: creator?.name ?? 'a Space admin' });
});
spaces.patch('/spaces/:spaceId/members/:memberId', mutation(async (tx, req) => {
  const { spaceId, memberId } = memberParams.parse(req.params);
  const { role } = z.object({ role: z.enum(['admin', 'member']) }).strict().parse(req.body);
  const m = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId, userId: req.actorId } } });
  if (!m || m.role !== 'admin') fail(403, 'FORBIDDEN', 'This action requires a Space admin.');
  const target = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId, userId: memberId } }, include: { user: true } });
  if (!target) fail(404, 'NOT_FOUND', 'Member not found.');
  if (target!.role === 'admin' && role === 'member' && await tx.membership.count({ where: { spaceId, role: 'admin' } }) === 1) fail(409, 'CONFLICT', 'Transfer admin access first.');
  const updated = await tx.membership.update({ where: { spaceId_userId: { spaceId, userId: memberId } }, data: { role }, include: { user: true } });
  await tx.audit.create({ data: { spaceId, actorId: req.actorId, action: 'member.role_changed', subjectId: memberId, metadata: { role } } });
  return { status: 200, body: memberView(updated) };
}));
spaces.delete('/spaces/:spaceId/members/:memberId', mutation(async (tx, req) => {
  const { spaceId, memberId } = memberParams.parse(req.params); empty.parse(req.body ?? {});
  const actor = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId, userId: req.actorId } } });
  if (!actor || actor.role !== 'admin') fail(403, 'FORBIDDEN', 'This action requires a Space admin.');
  if (memberId === req.actorId) fail(422, 'VALIDATION', 'Use the leave action.');
  const target = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId, userId: memberId } } });
  if (!target) fail(404, 'NOT_FOUND', 'Member not found.');
  const activeLoan = await tx.borrowRequest.count({ where: { item: { spaceId }, borrowerId: memberId, state: { in: ['Reserved', 'Borrowed', 'ReadyToReturn'] } } });
  const owned = await tx.item.count({ where: { spaceId, ownerId: memberId, deletedAt: null } });
  if (activeLoan || owned) fail(409, 'CONFLICT', 'Resolve loans and transfer or archive owned items first.');
  const pending = await tx.borrowRequest.findMany({ where: { borrowerId: memberId, item: { spaceId }, state: 'Requested' } });
  await tx.borrowRequest.updateMany({ where: { borrowerId: memberId, item: { spaceId }, state: 'Requested' }, data: { state: 'Cancelled', closedAt: new Date() } });
  for (const request of pending) await tx.activity.create({ data: { itemId: request.itemId, actorId: req.actorId, kind: 'Cancelled', note: 'Member removed.' } });
  const custodial = await tx.item.findMany({ where: { spaceId, custodianId: memberId } });
  await tx.item.updateMany({ where: { spaceId, custodianId: memberId }, data: { custodianId: null } });
  for (const item of custodial) await tx.activity.create({ data: { itemId: item.id, actorId: req.actorId, kind: 'Cleared custodian', note: 'Member removed.' } });
  await tx.membership.delete({ where: { spaceId_userId: { spaceId, userId: memberId } } });
  await tx.user.updateMany({ where: { id: memberId, selectedSpaceId: spaceId }, data: { selectedSpaceId: null } });
  await tx.audit.create({ data: { spaceId, actorId: req.actorId, action: 'member.removed', subjectId: memberId } });
  return { status: 200, body: await sessionView(req.actorId, tx) };
}));
spaces.post('/spaces/:spaceId/leave', mutation(async (tx, req) => {
  const { spaceId } = params.parse(req.params); empty.parse(req.body);
  const m = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId, userId: req.actorId } } });
  if (!m) fail(404, 'NOT_FOUND', 'Space not found.');
  if (await tx.item.count({ where: { spaceId, ownerId: req.actorId, deletedAt: null } })) fail(409, 'CONFLICT', 'Transfer or archive your items first.');
  if (await tx.borrowRequest.count({ where: { borrowerId: req.actorId, item: { spaceId }, state: { in: ['Reserved', 'Borrowed', 'ReadyToReturn'] } } })) fail(409, 'CONFLICT', 'Resolve your loan first.');
  if (m!.role === 'admin' && await tx.membership.count({ where: { spaceId, role: 'admin' } }) === 1) fail(409, 'CONFLICT', 'Assign another admin first.');
  const pending = await tx.borrowRequest.findMany({ where: { borrowerId: req.actorId, item: { spaceId }, state: 'Requested' } });
  await tx.borrowRequest.updateMany({ where: { borrowerId: req.actorId, item: { spaceId }, state: 'Requested' }, data: { state: 'Cancelled', closedAt: new Date() } });
  for (const request of pending) await tx.activity.create({ data: { itemId: request.itemId, actorId: req.actorId, kind: 'Cancelled', note: 'Borrower left Space.' } });
  const custodial = await tx.item.findMany({ where: { spaceId, custodianId: req.actorId } });
  await tx.item.updateMany({ where: { spaceId, custodianId: req.actorId }, data: { custodianId: null } });
  for (const item of custodial) await tx.activity.create({ data: { itemId: item.id, actorId: req.actorId, kind: 'Cleared custodian', note: 'Custodian left Space.' } });
  await tx.membership.delete({ where: { spaceId_userId: { spaceId, userId: req.actorId } } });
  await tx.user.updateMany({ where: { id: req.actorId, selectedSpaceId: spaceId }, data: { selectedSpaceId: null } });
  await tx.audit.create({ data: { spaceId, actorId: req.actorId, action: 'member.left', subjectId: req.actorId } });
  return { status: 200, body: await sessionView(req.actorId, tx) };
}));
