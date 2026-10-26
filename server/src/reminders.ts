import { prisma } from './db.js';
import { notifyUsers } from './notifications.js';

const localParts = (date: Date, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
  } catch { return { day: date.toISOString().slice(0, 10), hour: date.getUTCHours() }; }
};

const retryAt = (now: Date, attempts: number) => new Date(now.getTime() + Math.min(2 ** attempts * 60_000, 60 * 60_000));

export async function runReminders(now = new Date(), fetcher: typeof fetch = fetch) {
  await prisma.notificationDelivery.updateMany({ where: { state: 'sending', claimedAt: { lt: new Date(now.getTime() - 30 * 60_000) } }, data: { state: 'failed', nextAttemptAt: now } });
  const active = await prisma.borrowRequest.findMany({
    where: { state: { in: ['Borrowed', 'ReadyToReturn'] }, dueAt: { not: null, lte: new Date(now.getTime() + 48 * 60 * 60_000) }, item: { deletedAt: null, space: { archivedAt: null } } },
    include: { item: true },
  });
  for (const loan of active) {
    if (!loan.dueAt) continue;
    const overdue = loan.dueAt <= now;
    const recipients = overdue ? [loan.borrowerId, loan.item.ownerId, loan.item.custodianId] : [loan.borrowerId];
    for (const userId of [...new Set(recipients.filter((id): id is string => !!id))]) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
      if (!user) continue;
      const local = localParts(now, user.timeZone);
      if (local.hour < 9) continue;
      if (!overdue && localParts(loan.dueAt, user.timeZone).day !== localParts(new Date(now.getTime() + 24 * 60 * 60_000), user.timeZone).day) continue;
      await prisma.$transaction(tx => notifyUsers(tx, {
        userIds: [userId], spaceId: loan.item.spaceId, itemId: loan.itemId, requestId: loan.id,
        kind: overdue ? 'overdue' : 'due_soon', title: overdue ? 'Item overdue' : 'Return due tomorrow', body: loan.item.name,
        dedupeKey: `loan:${loan.id}:${overdue ? `overdue:${local.day}` : 'due-soon'}`,
      }));
    }
  }

  const lowStock = await prisma.$queryRaw<{ id: string; spaceId: string; ownerId: string; custodianId: string | null; name: string; quantity: number; unit: string | null; updatedAt: Date }[]>`
    SELECT i.id, i."spaceId", i."ownerId", i."custodianId", i.name, i.quantity, i.unit, i."updatedAt"
    FROM "Item" i JOIN "Space" s ON s.id = i."spaceId"
    WHERE i.kind = 'consumable' AND i.quantity <= i."lowThreshold" AND i."deletedAt" IS NULL AND s."archivedAt" IS NULL
  `;
  for (const item of lowStock) await prisma.$transaction(tx => notifyUsers(tx, {
    userIds: [item.ownerId, item.custodianId], spaceId: item.spaceId, itemId: item.id,
    kind: 'low_stock', title: 'Running low', body: `${item.name} has ${item.quantity} ${item.unit ?? 'units'} left.`,
    dedupeKey: `low-stock:${item.id}:${item.updatedAt.toISOString()}`,
  }));

  const pending = await prisma.notificationDelivery.findMany({
    where: { OR: [{ state: 'pending' }, { state: 'failed', attemptCount: { lt: 5 }, nextAttemptAt: { lte: now } }] },
    include: { notification: { include: { user: true, space: true } }, device: true },
    take: 100, orderBy: { id: 'asc' },
  });
  for (const delivery of pending) {
    const claimed = await prisma.notificationDelivery.updateMany({ where: { id: delivery.id, state: delivery.state }, data: { state: 'sending', claimedAt: now, attemptCount: { increment: 1 } } });
    if (!claimed.count) continue;
    const notification = delivery.notification;
    const stillMember = await prisma.membership.findUnique({ where: { spaceId_userId: { spaceId: notification.spaceId, userId: notification.userId } } });
    const pushOff = (notification.kind === 'low_stock' && !notification.user.lowStockAlerts) || (['due_soon', 'overdue', 'return_confirmed'].includes(notification.kind) && !notification.user.notifications);
    if (pushOff || notification.space.archivedAt || !stillMember || delivery.device.userId !== notification.userId || delivery.device.disabledAt) {
      await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { state: 'sent', sentAt: now } });
      continue;
    }
    try {
      const response = await fetcher('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: delivery.device.token, title: notification.title, body: notification.body, data: { notificationId: notification.id, itemId: notification.itemId, requestId: notification.requestId } }),
      });
      if (!response.ok) throw new Error(`Expo response ${response.status}`);
      const payload = await response.json() as { data?: { status: string; id?: string; details?: { error?: string } } };
      if (payload.data?.details?.error === 'DeviceNotRegistered') await prisma.deviceToken.update({ where: { id: delivery.deviceTokenId }, data: { disabledAt: now } });
      if (payload.data?.status !== 'ok' || !payload.data.id) throw new Error(payload.data?.details?.error ?? 'Expo rejected push');
      await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { state: 'sent', sentAt: now, expoTicketId: payload.data.id } });
    } catch (error) {
      console.error('Push delivery failed', delivery.id, error);
      await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { state: 'failed', nextAttemptAt: retryAt(now, delivery.attemptCount + 1) } });
    }
  }
  const sent = await prisma.notificationDelivery.findMany({ where: { state: 'sent', expoTicketId: { not: null }, receiptCheckedAt: null, sentAt: { lte: new Date(now.getTime() - 15 * 60_000) } }, take: 100 });
  if (sent.length) {
    try {
      const response = await fetcher('https://exp.host/--/api/v2/push/getReceipts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: sent.map(row => row.expoTicketId) }) });
      if (!response.ok) throw new Error(`Expo receipt response ${response.status}`);
      const payload = await response.json() as { data?: Record<string, { status: string; details?: { error?: string } }> };
      for (const delivery of sent) {
        const receipt = payload.data?.[delivery.expoTicketId!];
        if (!receipt) continue;
        if (receipt.details?.error === 'DeviceNotRegistered') await prisma.deviceToken.update({ where: { id: delivery.deviceTokenId }, data: { disabledAt: now } });
        await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: receipt.status === 'ok' ? { receiptCheckedAt: now } : { receiptCheckedAt: now, state: 'failed', nextAttemptAt: retryAt(now, delivery.attemptCount) } });
      }
    } catch (error) { console.error('Push receipt check failed', error); }
  }
}

if (process.argv[1]?.endsWith('/reminders.ts') || process.argv[1]?.endsWith('/reminders.js')) {
  void runReminders().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
