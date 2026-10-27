import { createApp } from './app.js';
import { PrismaClient } from '@prisma/client';
import { config } from './config.js';
import { prisma } from './db.js';
import { runReminders } from './reminders.js';

const server = createApp().listen(config.PORT, () => console.log(`Hestia API listening on ${config.PORT}`));
const reminderUrl = new URL(config.DATABASE_URL);
reminderUrl.searchParams.set('connection_limit', '1');
reminderUrl.searchParams.set('connect_timeout', '5');
reminderUrl.searchParams.set('pool_timeout', '8');
const reminderPrisma = new PrismaClient({ datasources: { db: { url: reminderUrl.toString() } } });
let runningReminders = false;
let reminderFailures = 0;
let retryAfter = 0;
const runScheduledReminders = async () => {
  if (runningReminders || Date.now() < retryAfter) return;
  runningReminders = true;
  try {
    await runReminders(new Date(), fetch, reminderPrisma);
    reminderFailures = 0;
    retryAfter = 0;
  } catch (error) {
    reminderFailures += 1;
    const retryMs = Math.min(2 ** Math.min(reminderFailures - 1, 4) * 60_000, 15 * 60_000);
    retryAfter = Date.now() + retryMs;
    console.error('Reminder worker unavailable', { at: new Date().toISOString(), code: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : error instanceof Error ? error.name : 'UNKNOWN', retryInSeconds: retryMs / 1000 });
  } finally { runningReminders = false; }
};
const reminderTimer = setInterval(() => { void runScheduledReminders(); }, 60_000);
void runScheduledReminders();
process.on('SIGTERM', () => { clearInterval(reminderTimer); server.close(); void Promise.allSettled([prisma.$disconnect(), reminderPrisma.$disconnect()]); });
