import { Router } from 'express';
import { z } from 'zod';
import { type BorrowState, type Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { empty, idParams, noteBody, pageQuery, uuid } from '../contract.js';
import { fail } from '../errors.js';
import { lockItem, mutation, type Tx } from '../idempotency.js';
import { keeper, visibleItem } from '../policy.js';
import { itemView, loanView } from '../serialize.js';

export const borrowing = Router();
const requestParams = z.object({ requestId: uuid });

async function loadRequest(tx: Tx, requestId: string, actorId: string) {
  const first = await tx.borrowRequest.findUnique({ where: { id: requestId } });
  if (!first) fail(404, 'NOT_FOUND', 'Request not found.');
  await lockItem(tx, first!.itemId);
  const request = await tx.borrowRequest.findUniqueOrThrow({ where: { id: requestId } });
  const item = await tx.item.findUniqueOrThrow({ where: { id: request.itemId } });
  const member = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId: item.spaceId, userId: actorId } } });
  if (!member || item.deletedAt || item.visibility !== 'shared') fail(404, 'NOT_FOUND', 'Request not found.');
  if (![request.borrowerId, item.ownerId, item.custodianId].includes(actorId)) fail(404, 'NOT_FOUND', 'Request not found.');
  return { request, item };
}

borrowing.get('/requests', async (req, res) => {
  const { cursor, limit, direction, itemId, status } = pageQuery.extend({ direction: z.enum(['incoming', 'outgoing']).optional(), itemId: uuid.optional(), status: z.enum(['Requested', 'Reserved', 'Borrowed', 'Ready to return', 'Returned', 'Rejected', 'Cancelled', 'Lost or damaged']).optional() }).parse(req.query);
  const scope = { item: { visibility: 'shared' as const, deletedAt: null, space: { memberships: { some: { userId: req.actorId } } } } };
  const who = direction === 'outgoing' ? { borrowerId: req.actorId } : direction === 'incoming' ? { item: { OR: [{ ownerId: req.actorId }, { custodianId: req.actorId }] } } : { OR: [{ borrowerId: req.actorId }, { item: { OR: [{ ownerId: req.actorId }, { custodianId: req.actorId }] } }] };
  const state: BorrowState | undefined = status === 'Ready to return' ? 'ReadyToReturn' : status === 'Lost or damaged' ? 'LostOrDamaged' : status;
  const where: Prisma.BorrowRequestWhereInput = { AND: [scope, who, ...(itemId ? [{ itemId }] : []), ...(state ? [{ state }] : [])] };
  const rows = await prisma.borrowRequest.findMany({ where, include: { item: true }, orderBy: { id: 'asc' }, take: limit + 1, ...(cursor ? { cursor: { id: uuid.parse(cursor) }, skip: 1 } : {}) });
  const data = rows.slice(0, limit).filter(r => r.item.visibility === 'shared' && !r.item.deletedAt).map(r => ({ ...loanView(r), itemId: r.itemId, itemName: r.item.name }));
  res.json({ data, nextCursor: rows.length > limit ? rows[limit - 1]?.id : null });
});
borrowing.post('/items/:itemId/requests', mutation(async (tx, req) => {
  const { itemId } = idParams.parse(req.params);
  const { dueAt } = z.object({ dueAt: z.iso.datetime().optional() }).strict().parse(req.body);
  await lockItem(tx, itemId);
  const item = await tx.item.findUnique({ where: { id: itemId } });
  if (!item || item.deletedAt || item.visibility !== 'shared') fail(404, 'NOT_FOUND', 'Item not found.');
  if (!await tx.membership.findUnique({ where: { spaceId_userId: { spaceId: item!.spaceId, userId: req.actorId } } })) fail(404, 'NOT_FOUND', 'Item not found.');
  if (item!.kind !== 'returnable' || item!.damaged) fail(422, 'VALIDATION', 'This item cannot be requested.');
  if (item!.ownerId === req.actorId || item!.custodianId === req.actorId) fail(422, 'VALIDATION', 'Keepers cannot borrow their own item.');
  if (await tx.borrowRequest.count({ where: { itemId, state: { in: ['Reserved', 'Borrowed', 'ReadyToReturn'] } } })) fail(409, 'CONFLICT', 'This item is unavailable.');
  if (await tx.borrowRequest.count({ where: { itemId, borrowerId: req.actorId, state: 'Requested' } })) fail(409, 'CONFLICT', 'You already requested this item.');
  const planned = dueAt ? new Date(dueAt) : undefined;
  if (planned && planned <= new Date()) fail(422, 'VALIDATION', 'Due date must be in the future.');
  const request = await tx.borrowRequest.create({ data: { itemId, borrowerId: req.actorId, dueAt: planned } });
  await tx.activity.create({ data: { itemId, actorId: req.actorId, kind: 'Requested' } });
  return { status: 201, body: await itemView(item!, req.actorId, tx) };
}));

type Action = 'approve' | 'reject' | 'cancel' | 'handover' | 'ready' | 'return' | 'lost-or-damaged';
const transitions: Record<Action, { from: string[]; to: 'Reserved' | 'Rejected' | 'Cancelled' | 'Borrowed' | 'ReadyToReturn' | 'Returned' | 'LostOrDamaged'; actor: 'keeper' | 'borrower' }> = {
  approve: { from: ['Requested'], to: 'Reserved', actor: 'keeper' },
  reject: { from: ['Requested'], to: 'Rejected', actor: 'keeper' },
  cancel: { from: ['Requested'], to: 'Cancelled', actor: 'borrower' },
  handover: { from: ['Reserved'], to: 'Borrowed', actor: 'keeper' },
  ready: { from: ['Borrowed'], to: 'ReadyToReturn', actor: 'borrower' },
  return: { from: ['ReadyToReturn'], to: 'Returned', actor: 'keeper' },
  'lost-or-damaged': { from: ['Borrowed', 'ReadyToReturn'], to: 'LostOrDamaged', actor: 'keeper' },
};
for (const [action, rule] of Object.entries(transitions) as [Action, typeof transitions[Action]][]) {
  borrowing.post(`/requests/:requestId/${action}`, mutation(async (tx, req) => {
    const { requestId } = requestParams.parse(req.params);
    const { note } = action === 'lost-or-damaged' ? noteBody.parse(req.body) : (empty.parse(req.body), { note: undefined });
    const { request, item } = await loadRequest(tx, requestId, req.actorId);
    if (rule.actor === 'keeper') keeper(item, req.actorId);
    else if (request.borrowerId !== req.actorId) fail(403, 'FORBIDDEN', 'Only the borrower can do that.');
    if (rule.actor === 'keeper' && request.borrowerId === req.actorId) fail(403, 'FORBIDDEN', 'You cannot approve your own request.');
    if (!rule.from.includes(request.state)) fail(409, 'CONFLICT', 'This request has changed. Refresh and try again.');
    if (action === 'approve' && (item.damaged || await tx.borrowRequest.count({ where: { itemId: item.id, id: { not: requestId }, state: { in: ['Reserved', 'Borrowed', 'ReadyToReturn'] } } }))) fail(409, 'CONFLICT', 'This item is unavailable.');
    const dueAt = action === 'handover' ? (request.dueAt && request.dueAt > new Date() ? request.dueAt : new Date(Date.now() + 7 * 86400000)) : request.dueAt;
    await tx.borrowRequest.update({ where: { id: requestId }, data: { state: rule.to, dueAt, ...(note ? { note } : {}), ...(['Returned', 'Rejected', 'Cancelled', 'LostOrDamaged'].includes(rule.to) ? { closedAt: new Date() } : {}) } });
    if (action === 'approve') {
      const others = await tx.borrowRequest.findMany({ where: { itemId: item.id, id: { not: requestId }, state: 'Requested' } });
      await tx.borrowRequest.updateMany({ where: { itemId: item.id, id: { not: requestId }, state: 'Requested' }, data: { state: 'Rejected', note: 'Item reserved by another borrower.', closedAt: new Date() } });
      for (const other of others) await tx.activity.create({ data: { itemId: item.id, actorId: req.actorId, kind: 'Rejected', note: `Competing request ${other.id} closed.` } });
      await tx.audit.create({ data: { spaceId: item.spaceId, actorId: req.actorId, action: 'request.approved', subjectId: requestId } });
    }
    if (action === 'lost-or-damaged') await tx.item.update({ where: { id: item.id }, data: { damaged: true } });
    await tx.activity.create({ data: { itemId: item.id, actorId: req.actorId, kind: action === 'lost-or-damaged' ? 'Lost or damaged' : rule.to === 'ReadyToReturn' ? 'Ready to return' : rule.to, ...(note ? { note } : {}) } });
    return { status: 200, body: await itemView(item, req.actorId, tx) };
  }));
}
borrowing.post('/items/:itemId/restore', mutation(async (tx, req) => {
  const { itemId } = idParams.parse(req.params); const { note } = noteBody.parse(req.body);
  await lockItem(tx, itemId);
  const item = await tx.item.findUnique({ where: { id: itemId } });
  if (!item || item.deletedAt) fail(404, 'NOT_FOUND', 'Item not found.');
  keeper(item!, req.actorId);
  if (!item!.damaged) fail(409, 'CONFLICT', 'Item is not marked lost or damaged.');
  if (!await tx.membership.findUnique({ where: { spaceId_userId: { spaceId: item!.spaceId, userId: req.actorId } } })) fail(404, 'NOT_FOUND', 'Item not found.');
  const updated = await tx.item.update({ where: { id: itemId }, data: { damaged: false } });
  await tx.activity.create({ data: { itemId, actorId: req.actorId, kind: 'Restored availability', note } });
  return { status: 200, body: await itemView(updated, req.actorId, tx) };
}));
borrowing.post('/items/:itemId/report-issue', mutation(async (tx, req) => {
  const { itemId } = idParams.parse(req.params); const { note } = noteBody.parse(req.body);
  await lockItem(tx, itemId);
  const item = await tx.item.findUnique({ where: { id: itemId } });
  if (!item || item.deletedAt) fail(404, 'NOT_FOUND', 'Item not found.');
  if (!await tx.membership.findUnique({ where: { spaceId_userId: { spaceId: item!.spaceId, userId: req.actorId } } })) fail(404, 'NOT_FOUND', 'Item not found.');
  if (item!.visibility === 'private' && item!.ownerId !== req.actorId) fail(404, 'NOT_FOUND', 'Item not found.');
  keeper(item!, req.actorId);
  if (item!.kind !== 'returnable' || item!.damaged) fail(409, 'CONFLICT', 'This item is already unavailable.');
  if (await tx.borrowRequest.count({ where: { itemId, state: { in: ['Reserved', 'Borrowed', 'ReadyToReturn'] } } })) fail(409, 'CONFLICT', 'Report the active loan instead.');
  const pending = await tx.borrowRequest.findMany({ where: { itemId, state: 'Requested' } });
  await tx.borrowRequest.updateMany({ where: { itemId, state: 'Requested' }, data: { state: 'Rejected', note: 'Item reported lost or damaged.', closedAt: new Date() } });
  for (const request of pending) await tx.activity.create({ data: { itemId, actorId: req.actorId, kind: 'Rejected', note: `Request ${request.id} closed because item is unavailable.` } });
  const updated = await tx.item.update({ where: { id: itemId }, data: { damaged: true } });
  await tx.activity.create({ data: { itemId, actorId: req.actorId, kind: 'Lost or damaged', note } });
  return { status: 200, body: await itemView(updated, req.actorId, tx) };
}));
