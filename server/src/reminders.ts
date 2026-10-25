import { prisma } from './db.js';

const localParts = (date: Date, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
  } catch { return { day: date.toISOString().slice(0, 10), hour: date.getUTCHours() }; }
};

export async function runReminders(now = new Date(), fetcher: typeof fetch = fetch) {
  await prisma.reminder.updateMany({ where: { state: 'sending', claimedAt: { lt: new Date(now.getTime() - 30 * 60000) } }, data: { state: 'failed' } });
  const active = await prisma.borrowRequest.findMany({ where: { state: { in: ['Borrowed', 'ReadyToReturn'] }, dueAt: { not: null, lte: new Date(now.getTime() + 86400000) } }, include: { item: true, borrower: true } });
  for (const r of active) {
    if (!r.dueAt || !r.borrower.notifications) continue;
    const overdue = r.dueAt <= now;
    const local = localParts(now, r.borrower.timeZone);
    if (overdue && local.hour < 9) continue;
    const kind = overdue ? 'overdue' : 'upcoming';
    const tokens = await prisma.deviceToken.findMany({ where: { userId: r.borrowerId, disabledAt: null } });
    for (const token of tokens) {
      const dedupeKey = `${r.id}:${kind}:${overdue ? local.day : 'once'}:${token.id}`;
      await prisma.reminder.upsert({ where: { dedupeKey }, create: { userId: r.borrowerId, requestId: r.id, deviceTokenId: token.id, kind, scheduledFor: now, dedupeKey }, update: {} });
    }
  }
  const pending = await prisma.reminder.findMany({ where: { state: 'pending' }, include: { user: true, device: true, request: { include: { item: true } } }, take: 100, orderBy: { scheduledFor: 'asc' } });
  for (const r of pending) {
    const claimed = await prisma.reminder.updateMany({ where: { id: r.id, state: 'pending' }, data: { state: 'sending', claimedAt: now } });
    if (!claimed.count) continue;
    if (!r.user.notifications || !['Borrowed', 'ReadyToReturn'].includes(r.request.state)) {
      await prisma.reminder.update({ where: { id: r.id }, data: { state: 'sent', sentAt: now } });
      continue;
    }
    if (r.device.disabledAt) { await prisma.reminder.update({ where: { id: r.id }, data: { state: 'sent', sentAt: now } }); continue; }
    try {
      const response = await fetcher('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: r.device.token, title: r.kind === 'overdue' ? 'Item overdue' : 'Return due soon', body: r.request.item.name, data: { itemId: r.request.itemId, requestId: r.requestId } }) });
      if (!response.ok) throw new Error(`Expo response ${response.status}`);
      const payload = await response.json() as { data?: { status: string; id?: string; details?: { error?: string } } };
      const ticket = payload.data;
      if (ticket?.details?.error === 'DeviceNotRegistered') await prisma.deviceToken.update({ where: { id: r.deviceTokenId }, data: { disabledAt: now } });
      if (ticket?.status !== 'ok' || !ticket.id) throw new Error('Expo rejected push');
      await prisma.reminder.update({ where: { id: r.id }, data: { state: 'sent', sentAt: now, expoTicketId: ticket.id } });
    } catch (error) {
      console.error('Reminder delivery failed', r.id, error);
      await prisma.reminder.update({ where: { id: r.id }, data: { state: 'failed' } });
    }
  }
  const sent = await prisma.reminder.findMany({ where: { state: 'sent', expoTicketId: { not: null }, receiptCheckedAt: null, sentAt: { lte: new Date(now.getTime() - 15 * 60000) } }, take: 100 });
  if (sent.length) {
    try {
      const response = await fetcher('https://exp.host/--/api/v2/push/getReceipts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: sent.map(r => r.expoTicketId) }) });
      if (!response.ok) throw new Error(`Expo receipt response ${response.status}`);
      const payload = await response.json() as { data?: Record<string, { status: string; details?: { error?: string } }> };
      for (const r of sent) {
        const receipt = payload.data?.[r.expoTicketId!];
        if (!receipt) continue;
        if (receipt.details?.error === 'DeviceNotRegistered') await prisma.deviceToken.update({ where: { id: r.deviceTokenId }, data: { disabledAt: now } });
        await prisma.reminder.update({ where: { id: r.id }, data: { receiptCheckedAt: now, state: receipt.status === 'ok' ? 'sent' : 'failed' } });
      }
    } catch (error) { console.error('Receipt check failed', error); }
  }
}

if (process.argv[1]?.endsWith('/reminders.ts') || process.argv[1]?.endsWith('/reminders.js')) {
  void runReminders().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
