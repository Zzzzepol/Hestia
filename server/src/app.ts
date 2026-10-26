import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from './auth.js';
import { config } from './config.js';
import { errorHandler } from './errors.js';
import { prisma } from './db.js';
import { spaces } from './routes/spaces.js';
import { items } from './routes/items.js';
import { borrowing } from './routes/borrowing.js';
import { photos } from './routes/photos.js';
import { reminders } from './routes/reminders.js';
import { z } from 'zod';

export function createApp(auth: RequestHandler = authenticate) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use(helmet());
  const origins = config.CORS_ORIGINS.split(',').map(s => s.trim());
  app.use(cors({ origin: (origin, callback) => callback(null, !origin || origins.includes(origin)), methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'] }));
  app.use('/v1', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { code: 'RATE_LIMITED', message: 'Too many requests.' } }));
  app.use('/v1/spaces/join', rateLimit({ windowMs: 60000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { code: 'RATE_LIMITED', message: 'Too many invite attempts.' } }));
  app.use('/v1', (req, res, next) => {
    const started = performance.now();
    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      const durationMs = Math.round(performance.now() - started);
      if (durationMs < 2000 && res.statusCode < 500) return;
      // Route patterns avoid logging user IDs, query strings, or request bodies.
      console.warn('API request', { method: req.method, route: req.route?.path ?? '/v1/*', status: res.statusCode, durationMs, disconnected: !res.writableEnded });
    };
    res.once('finish', report);
    res.once('close', report);
    next();
  });
  app.use('/v1', auth);
  app.use(express.json({ limit: '64kb' }));
  app.use('/v1', (req, _res, next) => {
    try {
      const listRoute = req.method === 'GET' && (/^\/spaces(?:\/[^/]+\/members|\/[^/]+\/items)?$/.test(req.path) || /^\/items\/[^/]+\/history$/.test(req.path) || ['/requests', '/reminders'].includes(req.path));
      if (!listRoute) z.object({}).strict().parse(req.query);
      if (req.method === 'GET') z.object({}).strict().parse(req.body ?? {});
      next();
    } catch (error) { next(error); }
  });
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/ready', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, database: 'connected' });
  });
  app.use('/v1', spaces, items, borrowing, photos, reminders);
  app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Not found.' }));
  app.use(errorHandler);
  return app;
}
