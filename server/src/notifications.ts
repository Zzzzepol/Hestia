import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;
type Event = {
  userIds: (string | null | undefined)[];
  spaceId: string;
  itemId?: string;
  requestId?: string;
  kind: 'request' | 'low_stock' | 'return_confirmed' | 'due_soon' | 'overdue';
  title: string;
  body: string;
  dedupeKey: string;
};

export async function notifyUsers(tx: Tx, event: Event) {
  const recipients = [...new Set(event.userIds.filter((id): id is string => !!id))];
  for (const userId of recipients) {
    const member = await tx.membership.findUnique({ where: { spaceId_userId: { spaceId: event.spaceId, userId } } });
    if (!member) continue;
    if (event.kind === 'low_stock') {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { lowStockAlerts: true } });
      if (!user?.lowStockAlerts) continue;
    }
    const notification = await tx.appNotification.upsert({
      where: { dedupeKey: `${event.dedupeKey}:${userId}` },
      create: { userId, spaceId: event.spaceId, itemId: event.itemId, requestId: event.requestId, kind: event.kind, title: event.title, body: event.body, dedupeKey: `${event.dedupeKey}:${userId}` },
      update: {},
    });
    const user = await tx.user.findUnique({ where: { id: userId }, select: { notifications: true, lowStockAlerts: true } });
    if (!user || (event.kind === 'low_stock' && !user.lowStockAlerts) || (['due_soon', 'overdue', 'return_confirmed'].includes(event.kind) && !user.notifications)) continue;
    const devices = await tx.deviceToken.findMany({ where: { userId, disabledAt: null } });
    for (const device of devices) await tx.notificationDelivery.upsert({ where: { notificationId_deviceTokenId: { notificationId: notification.id, deviceTokenId: device.id } }, create: { notificationId: notification.id, deviceTokenId: device.id }, update: {} });
  }
}
