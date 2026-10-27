import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';
import { prisma } from './db.js';
import { fail } from './errors.js';
import { z } from 'zod';

declare global { namespace Express { interface Request { actorId: string } } }

const issuer = `${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { timeoutDuration: 12000 });
const ensuredUsers = new Map<string, number>();
const ensuringUsers = new Map<string, Promise<void>>();
const ensureTtlMs = 5 * 60_000;

async function ensureUser(actor: { id: string; name?: string }) {
  if ((ensuredUsers.get(actor.id) ?? 0) > Date.now()) return;
  let pending = ensuringUsers.get(actor.id);
  if (!pending) {
    pending = prisma.user.upsert({
      where: { id: actor.id },
      create: { id: actor.id, ...(actor.name ? { name: actor.name } : {}) },
      update: {},
    }).then(() => { ensuredUsers.set(actor.id, Date.now() + ensureTtlMs); })
      .finally(() => { ensuringUsers.delete(actor.id); });
    ensuringUsers.set(actor.id, pending);
  }
  await pending;
}

export async function verifyAccessToken(token: string): Promise<{ id: string; name?: string }> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: 'authenticated',
      algorithms: ['RS256', 'ES256'],
      clockTolerance: 5,
    });
    if (payload.role !== 'authenticated' || typeof payload.sub !== 'string') throw new Error('Invalid role or subject');
    const metadata = payload.user_metadata;
    const displayName = metadata && typeof metadata === 'object' && 'display_name' in metadata ? metadata.display_name : undefined;
    const name = z.string().trim().min(1).max(100).safeParse(displayName);
    return { id: z.uuid().parse(payload.sub), ...(name.success ? { name: name.data } : {}) };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_JWKS_TIMEOUT') {
      return fail(503, 'AUTH_SERVICE_UNAVAILABLE', 'Sign-in verification is temporarily unavailable. Try again shortly.');
    }
    return fail(401, 'AUTH_REQUIRED', 'Sign in is required.');
  }
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const match = /^Bearer (\S+)$/.exec(req.header('Authorization') ?? '');
    const token = match?.[1];
    if (!token) fail(401, 'AUTH_REQUIRED', 'Sign in is required.');
    const actor = await verifyAccessToken(token!);
    req.actorId = actor.id;
    await ensureUser(actor);
    next();
  } catch (error) { next(error); }
};
