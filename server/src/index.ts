import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';

const server = createApp().listen(config.PORT, () => console.log(`Hestia API listening on ${config.PORT}`));
process.on('SIGTERM', () => { server.close(); void prisma.$disconnect(); });
