import type { Activity, BorrowRequest, Item, Membership, User, Prisma } from '@prisma/client';
import { prisma } from './db.js';

const states: Record<string, string> = { ReadyToReturn: 'Ready to return', LostOrDamaged: 'Lost or damaged' };
export const stateName = (state: string) => states[state] ?? state;
export const memberView = (m: Membership & { user: User }) => ({ id: m.userId, name: m.user.name, initials: m.user.name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join(''), role: m.role });
export const activityView = (a: Activity) => ({ id: a.id, at: a.at.toISOString(), actorId: a.actorId, kind: a.kind, ...(a.note ? { note: a.note } : {}), ...(a.before !== null ? { before: a.before, after: a.after } : {}) });
export const loanView = (x: BorrowRequest) => ({ id: x.id, borrowerId: x.borrowerId, state: stateName(x.state), requestedAt: x.requestedAt.toISOString(), ...(x.dueAt ? { dueAt: x.dueAt.toISOString() } : {}), ...(x.note ? { note: x.note } : {}) });
export async function itemView(item: Item, actorId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const [history, requests] = await Promise.all([
    db.activity.findMany({ where: { itemId: item.id }, orderBy: [{ at: 'desc' }, { id: 'desc' }], take: 100 }),
    db.borrowRequest.findMany({ where: { itemId: item.id }, orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], take: 100 }),
  ]);
  const active = requests.find(r => ['Reserved', 'Borrowed', 'ReadyToReturn'].includes(r.state));
  const ownPending = requests.find(r => r.state === 'Requested' && r.borrowerId === actorId);
  const keeperPending = requests.find(r => r.state === 'Requested' && [item.ownerId, item.custodianId].includes(actorId));
  const latest = requests[0]?.state === 'LostOrDamaged' && !item.damaged ? undefined : requests[0];
  const chosen = active ?? ownPending ?? keeperPending ?? latest;
  return { id: item.id, spaceId: item.spaceId, name: item.name, kind: item.kind, category: item.category, location: item.location,
    ownerId: item.ownerId, ...(item.custodianId ? { custodianId: item.custodianId } : {}), visibility: item.visibility, damaged: item.damaged,
    ...(item.quantity !== null ? { quantity: item.quantity } : {}), ...(item.unit ? { unit: item.unit } : {}),
    ...(item.lowThreshold !== null ? { lowThreshold: item.lowThreshold } : {}), ...(chosen ? { loan: loanView(chosen) } : {}),
    history: history.map(activityView) };
}
export async function sessionView(actorId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  const selected = user.selectedSpaceId && await db.membership.findUnique({ where: { spaceId_userId: { spaceId: user.selectedSpaceId, userId: actorId } } });
  const spaceId = selected ? user.selectedSpaceId : null;
  const members = spaceId ? await db.membership.findMany({ where: { spaceId }, include: { user: true }, orderBy: { joinedAt: 'asc' } }) : [];
  return { members: members.map(memberView), userId: actorId, spaceId, theme: user.theme, notifications: user.notifications, lowStockAlerts: user.lowStockAlerts };
}
