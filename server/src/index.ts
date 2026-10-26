import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { runReminders } from './reminders.js';

const server = createApp().listen(config.PORT, () => console.log(`Hestia API listening on ${config.PORT}`));
let runningReminders = false;
const runScheduledReminders = async () => {
  if (runningReminders) return;
  runningReminders = true;
  try { await runReminders(); } catch (error) { console.error('Reminder worker failed', error); } finally { runningReminders = false; }
};
const reminderTimer = setInterval(() => { void runScheduledReminders(); }, 60_000);
void runScheduledReminders();
process.on('SIGTERM', () => { clearInterval(reminderTimer); server.close(); void prisma.$disconnect(); });
