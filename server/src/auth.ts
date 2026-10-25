import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';
import { prisma } from './db.js';
import { fail } from './errors.js';
import { z } from 'zod';

declare global { namespace Express { interface Request { actorId: string } } }

const issuer = `${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

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
  } catch { return fail(401, 'AUTH_REQUIRED', 'Sign in is required.'); }
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const match = /^Bearer (\S+)$/.exec(req.header('Authorization') ?? '');
    const token = match?.[1];
    if (!token) fail(401, 'AUTH_REQUIRED', 'Sign in is required.');
    const actor = await verifyAccessToken(token!);
    req.actorId = actor.id;
    await prisma.user.upsert({ where: { id: actor.id }, create: { id: actor.id, ...(actor.name ? { name: actor.name } : {}) }, update: {} });
    next();
  } catch (error) { next(error); }
};
