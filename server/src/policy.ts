import type { Prisma, Item, SpaceRole } from '@prisma/client';
import { prisma } from './db.js';
import { fail } from './errors.js';

export async function membership(spaceId: string, actorId: string, role?: SpaceRole) {
  const member = await prisma.membership.findUnique({ where: { spaceId_userId: { spaceId, userId: actorId } } });
  if (!member) fail(404, 'NOT_FOUND', 'Space not found.');
  if (role && member!.role !== role) fail(403, 'FORBIDDEN', 'This action requires a Space admin.');
  return member!;
}

export function visibleWhere(actorId: string, spaceId: string): Prisma.ItemWhereInput {
  return { spaceId, deletedAt: null, OR: [{ visibility: 'shared' }, { ownerId: actorId }] };
}

export async function visibleItem(itemId: string, actorId: string) {
  const item = await prisma.item.findFirst({ where: { id: itemId, deletedAt: null, OR: [{ ownerId: actorId }, { visibility: 'shared', space: { memberships: { some: { userId: actorId } } } }] } });
  if (!item) fail(404, 'NOT_FOUND', 'Item not found.');
  return item!;
}

export function keeper(item: Item, actorId: string) {
  if (item.ownerId !== actorId && item.custodianId !== actorId) fail(403, 'FORBIDDEN', 'Only the owner or custodian can do that.');
}

export function shared(item: Item) {
  if (item.visibility !== 'shared') fail(422, 'VALIDATION', 'Private items cannot be borrowed.');
}
