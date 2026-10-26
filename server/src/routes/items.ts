import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type Item } from '@prisma/client';
import { prisma } from '../db.js';
import { amountBody, empty, idParams, itemInput, itemQuery, pageQuery, uuid } from '../contract.js';
import { fail } from '../errors.js';
import { lockItem, mutation, type Tx } from '../idempotency.js';
import { keeper, membership, visibleItem, visibleWhere } from '../policy.js';
import { activityView, itemView, itemViewFromRelations } from '../serialize.js';
import { notifyUsers } from '../notifications.js';

export const items = Router();
const spaceParams = z.object({ spaceId: uuid });
const activityParams = idParams.extend({ activityId: uuid });

async function itemForWrite(tx: Tx, id: string, actorId: string) {
  await lockItem(tx, id);
  const item = await tx.item.findUnique({ where: { id } });
  if (!item || item.deletedAt) fail(404, 'NOT_FOUND', 'Item not found.');
  const m = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId: item!.spaceId, userId: actorId } } });
  if (!m || item!.visibility === 'private' && item!.ownerId !== actorId) fail(404, 'NOT_FOUND', 'Item not found.');
  return { item: item!, member: m! };
}

items.get('/spaces/:spaceId/items', async (req, res) => {
  const { spaceId } = spaceParams.parse(req.params); await membership(spaceId, req.actorId);
  const q = itemQuery.parse(req.query);
  const filters: Prisma.ItemWhereInput[] = [];
  if (q.q) filters.push({ OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { category: { contains: q.q, mode: 'insensitive' } }, { location: { contains: q.q, mode: 'insensitive' } }] });
  if (q.availability === 'unavailable') filters.push({ OR: [{ damaged: true }, { requests: { some: { state: { in: ['Reserved', 'Borrowed', 'ReadyToReturn'] } } } }] });
  const status = q.status ? z.enum(['Available', 'Requested', 'Reserved', 'Borrowed', 'Ready to return', 'Lost or damaged']).parse(q.status) : undefined;
  if (status === 'Available') filters.push({ kind: 'returnable', damaged: false, requests: { none: { state: { in: ['Requested', 'Reserved', 'Borrowed', 'ReadyToReturn'] } } } });
  else if (status === 'Requested') filters.push({ kind: 'returnable', damaged: false, requests: { some: { state: 'Requested' } }, NOT: { requests: { some: { state: { in: ['Reserved', 'Borrowed', 'ReadyToReturn'] } } } } });
  else if (status === 'Lost or damaged') filters.push({ kind: 'returnable', damaged: true });
  else if (status) filters.push({ kind: 'returnable', requests: { some: { state: status === 'Ready to return' ? 'ReadyToReturn' : status } } });
  const where: Prisma.ItemWhereInput = { AND: [visibleWhere(req.actorId, spaceId), ...filters],
    ...(q.category ? { category: q.category } : {}), ...(q.location ? { location: q.location } : {}),
    ...(q.kind ? { kind: q.kind } : {}), ...(q.visibility ? { visibility: q.visibility } : {}),
    ...(q.ownerId ? { ownerId: q.ownerId } : {}),
    ...(q.lowStock === 'true' ? { kind: 'consumable', quantity: { lte: prisma.item.fields.lowThreshold } } : {}),
    ...(q.lowStock === 'false' ? { NOT: { kind: 'consumable', quantity: { lte: prisma.item.fields.lowThreshold } } } : {}),
    ...(q.availability === 'available' ? { kind: 'returnable', damaged: false, requests: { none: { state: { in: ['Reserved', 'Borrowed', 'ReadyToReturn'] } } } } : {}),
    ...(q.availability === 'unavailable' ? { kind: 'returnable' } : {}),
  };
  const rows = await prisma.item.findMany({
    where, orderBy: { id: 'asc' }, take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: uuid.parse(q.cursor) }, skip: 1 } : {}),
    include: {
      history: { orderBy: [{ at: 'desc' }, { id: 'desc' }], take: 100 },
      requests: { orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], take: 100 },
    },
  });
  res.json({ data: rows.slice(0, q.limit).map(x => itemViewFromRelations(x, req.actorId, x.history, x.requests)), nextCursor: rows.length > q.limit ? rows[q.limit - 1]?.id : null });
});
items.get('/items/:itemId', async (req, res) => {
  const { itemId } = idParams.parse(req.params);
  res.json(await itemView(await visibleItem(itemId, req.actorId), req.actorId));
});
items.post('/spaces/:spaceId/items', mutation(async (tx, req) => {
  const { spaceId } = spaceParams.parse(req.params);
  const input = itemInput.parse(req.body);
  const m = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId, userId: req.actorId } } });
  if (!m) fail(404, 'NOT_FOUND', 'Space not found.');
  if (input.photoUri) fail(422, 'VALIDATION', 'Upload a photo through the photo endpoint.');
  if (input.custodianId && m!.role !== 'admin') fail(403, 'FORBIDDEN', 'Only an admin can assign custodians.');
  if (input.custodianId && !await tx.membership.findUnique({ where: { spaceId_userId: { spaceId, userId: input.custodianId } } })) fail(422, 'VALIDATION', 'Choose a Space member.');
  if (input.visibility === 'private' && input.custodianId) fail(422, 'VALIDATION', 'Private items cannot have a custodian.');
  const item = await tx.item.create({ data: { spaceId, ownerId: req.actorId, name: input.name, kind: input.kind, category: input.category, location: input.location, visibility: input.visibility, quantity: input.kind === 'consumable' ? input.quantity! : null, unit: input.kind === 'consumable' ? input.unit ?? 'units' : null, lowThreshold: input.kind === 'consumable' ? input.lowThreshold ?? 0 : null, custodianId: input.custodianId } });
  await tx.activity.create({ data: { itemId: item.id, actorId: req.actorId, kind: 'Added item', ...(item.quantity !== null ? { before: 0, after: item.quantity } : {}) } });
  return { status: 201, body: await itemView(item, req.actorId, tx) };
}));
items.put('/items/:itemId', mutation(async (tx, req) => {
  const { itemId } = idParams.parse(req.params); const input = itemInput.parse(req.body);
  const { item, member } = await itemForWrite(tx, itemId, req.actorId);
  if (![item.ownerId, item.custodianId].includes(req.actorId) && member.role !== 'admin') fail(403, 'FORBIDDEN', 'Only an owner, custodian, or admin can edit.');
  if (input.kind !== item.kind || input.quantity !== (item.quantity ?? undefined)) fail(422, 'VALIDATION', 'Kind and quantity cannot be edited here.');
  if (input.photoUri) fail(422, 'VALIDATION', 'Upload a photo through the photo endpoint.');
  if (input.custodianId !== (item.custodianId ?? undefined) && member.role !== 'admin') fail(403, 'FORBIDDEN', 'Only an admin can assign custodians.');
  if (input.custodianId && !await tx.membership.findUnique({ where: { spaceId_userId: { spaceId: item.spaceId, userId: input.custodianId } } })) fail(422, 'VALIDATION', 'Choose a Space member.');
  if (input.custodianId && await tx.borrowRequest.count({ where: { itemId, borrowerId: input.custodianId, state: { in: ['Requested', 'Reserved', 'Borrowed', 'ReadyToReturn'] } } })) fail(409, 'CONFLICT', 'An active borrower cannot become custodian.');
  if (input.visibility === 'private' && (input.custodianId || await tx.borrowRequest.count({ where: { itemId, state: { in: ['Requested', 'Reserved', 'Borrowed', 'ReadyToReturn'] } } }))) fail(409, 'CONFLICT', 'Resolve requests and remove custodian before making this private.');
  const updated = await tx.item.update({ where: { id: itemId }, data: { name: input.name, category: input.category, location: input.location, visibility: input.visibility, unit: input.kind === 'consumable' ? input.unit ?? 'units' : null, lowThreshold: input.kind === 'consumable' ? input.lowThreshold ?? 0 : null, custodianId: input.custodianId ?? null } });
  await tx.activity.create({ data: { itemId, actorId: req.actorId, kind: 'Edited item' } });
  if (item.custodianId !== updated.custodianId) await tx.audit.create({ data: { spaceId: item.spaceId, actorId: req.actorId, action: 'item.custodian_changed', subjectId: itemId, metadata: { custodianId: updated.custodianId } } });
  return { status: 200, body: await itemView(updated, req.actorId, tx) };
}));
items.patch('/items/:itemId/custodian', mutation(async (tx, req) => {
  const { itemId } = idParams.parse(req.params); const { memberId } = z.object({ memberId: uuid.nullable() }).strict().parse(req.body);
  const { item, member } = await itemForWrite(tx, itemId, req.actorId);
  if (member.role !== 'admin') fail(403, 'FORBIDDEN', 'Only an admin can assign custodians.');
  if (item.visibility === 'private') fail(422, 'VALIDATION', 'Private items cannot have a custodian.');
  if (memberId && !await tx.membership.findUnique({ where: { spaceId_userId: { spaceId: item.spaceId, userId: memberId } } })) fail(422, 'VALIDATION', 'Choose a Space member.');
  if (memberId && await tx.borrowRequest.count({ where: { itemId, borrowerId: memberId, state: { in: ['Requested', 'Reserved', 'Borrowed', 'ReadyToReturn'] } } })) fail(409, 'CONFLICT', 'An active borrower cannot become custodian.');
  const updated = await tx.item.update({ where: { id: itemId }, data: { custodianId: memberId } });
  await tx.activity.create({ data: { itemId, actorId: req.actorId, kind: memberId ? 'Assigned custodian' : 'Cleared custodian' } });
  await tx.audit.create({ data: { spaceId: item.spaceId, actorId: req.actorId, action: 'item.custodian_changed', subjectId: itemId, metadata: { custodianId: memberId } } });
  return { status: 200, body: await itemView(updated, req.actorId, tx) };
}));
items.patch('/items/:itemId/owner', mutation(async (tx, req) => {
  const { itemId } = idParams.parse(req.params); const { memberId } = z.object({ memberId: uuid }).strict().parse(req.body);
  const { item, member } = await itemForWrite(tx, itemId, req.actorId);
  if (member.role !== 'admin' || item.visibility === 'private') fail(403, 'FORBIDDEN', 'Only an admin can transfer shared items.');
  if (!await tx.membership.findUnique({ where: { spaceId_userId: { spaceId: item.spaceId, userId: memberId } } })) fail(422, 'VALIDATION', 'Choose a Space member.');
  if (await tx.borrowRequest.count({ where: { itemId, borrowerId: memberId, state: { in: ['Requested', 'Reserved', 'Borrowed', 'ReadyToReturn'] } } })) fail(409, 'CONFLICT', 'An active borrower cannot become owner.');
  const updated = await tx.item.update({ where: { id: itemId }, data: { ownerId: memberId } });
  await tx.activity.create({ data: { itemId, actorId: req.actorId, kind: 'Ownership transferred', note: `New owner: ${memberId}` } });
  await tx.audit.create({ data: { spaceId: item.spaceId, actorId: req.actorId, action: 'item.owner_changed', subjectId: itemId, metadata: { ownerId: memberId } } });
  return { status: 200, body: await itemView(updated, req.actorId, tx) };
}));
items.delete('/items/:itemId', mutation(async (tx, req) => {
  const { itemId } = idParams.parse(req.params); empty.parse(req.body ?? {});
  const { item, member } = await itemForWrite(tx, itemId, req.actorId);
  if (item.ownerId !== req.actorId && member.role !== 'admin') fail(403, 'FORBIDDEN', 'Only the owner or admin can archive an item.');
  if (await tx.borrowRequest.count({ where: { itemId, state: { in: ['Requested', 'Reserved', 'Borrowed', 'ReadyToReturn'] } } })) fail(409, 'CONFLICT', 'Resolve requests before archiving.');
  await tx.activity.create({ data: { itemId, actorId: req.actorId, kind: 'Archived item' } });
  const updated = await tx.item.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
  return { status: 200, body: { id: updated.id, deletedAt: updated.deletedAt!.toISOString() } };
}));
items.get('/items/:itemId/history', async (req, res) => {
  const { itemId } = idParams.parse(req.params); await visibleItem(itemId, req.actorId);
  const { cursor, limit } = pageQuery.parse(req.query);
  const rows = await prisma.activity.findMany({ where: { itemId }, orderBy: [{ at: 'desc' }, { id: 'desc' }], take: limit + 1, ...(cursor ? { cursor: { id: uuid.parse(cursor) }, skip: 1 } : {}) });
  res.json({ data: rows.slice(0, limit).map(activityView), nextCursor: rows.length > limit ? rows[limit - 1]?.id : null });
});
async function quantityChange(tx: Tx, item: Item, actorId: string, delta: number, kind: string) {
  if (item.kind !== 'consumable') fail(422, 'VALIDATION', 'This item has no stock.');
  const before = item.quantity ?? 0;
  const after = before + delta;
  if (!Number.isSafeInteger(after) || after < 0 || after > 2_147_483_647) fail(409, 'CONFLICT', 'Stock changed or exceeds the supported limit. Refresh and try again.');
  await tx.$queryRaw`SELECT set_config('hestia.actor_id', ${actorId}, true)`;
  await tx.$queryRaw`SELECT set_config('hestia.stock_kind', ${kind}, true)`;
  const updated = await tx.item.update({ where: { id: item.id }, data: { quantity: after } });
  if (before > (item.lowThreshold ?? 0) && after <= (item.lowThreshold ?? 0)) await notifyUsers(tx, { userIds: [item.ownerId, item.custodianId], spaceId: item.spaceId, itemId: item.id, kind: 'low_stock', title: 'Running low', body: `${item.name} has ${after} ${item.unit ?? 'units'} left.`, dedupeKey: `low-stock:${item.id}:${updated.updatedAt.toISOString()}` });
  return itemView(updated, actorId, tx);
}
for (const [path, sign, kind] of [['use', -1, 'Used'], ['restock', 1, 'Restocked']] as const) {
  items.post(`/items/:itemId/${path}`, mutation(async (tx, req) => {
    const { itemId } = idParams.parse(req.params); const { amount } = amountBody.parse(req.body);
    const { item } = await itemForWrite(tx, itemId, req.actorId);
    return { status: 200, body: await quantityChange(tx, item, req.actorId, sign * amount, kind) };
  }));
}
items.post('/items/:itemId/quantity-undo', mutation(async (tx, req) => {
  const { itemId } = idParams.parse(req.params); const { activityId } = z.object({ activityId: uuid }).strict().parse(req.body);
  const { item } = await itemForWrite(tx, itemId, req.actorId);
  const activity = await tx.activity.findFirst({ where: { id: activityId, itemId } });
  if (!activity || !['Used', 'Restocked', 'Undid quantity change'].includes(activity.kind) || activity.actorId !== req.actorId || activity.before === null || activity.after === null || activity.before === activity.after || item.quantity !== activity.after) fail(409, 'CONFLICT', 'This change can no longer be undone.');
  const later = await tx.activity.count({ where: { itemId, at: { gt: activity!.at }, before: { not: null } } });
  if (later) fail(409, 'CONFLICT', 'This change can no longer be undone.');
  return { status: 200, body: await quantityChange(tx, item, req.actorId, activity!.before! - activity!.after!, 'Undid quantity change') };
}));
