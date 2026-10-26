import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { idParams, uuid } from '../contract.js';
import { fail } from '../errors.js';
import { mutation } from '../idempotency.js';
import { keeper, visibleItem } from '../policy.js';
import { itemView } from '../serialize.js';
import { storage } from '../storage.js';

export const photos = Router();
const uploadParams = idParams.extend({ uploadId: uuid });
const allowed = ['image/jpeg', 'image/png', 'image/webp'] as const;
function matchesMagic(bytes: Uint8Array, mime: string) {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
}

photos.post('/items/:itemId/photo-uploads', mutation<{ path: string; token: string }>(async (tx, req, prepared) => {
  const { itemId } = idParams.parse(req.params);
  const { mime, size } = z.object({ mime: z.enum(allowed), size: z.number().int().min(1).max(5_000_000) }).strict().parse(req.body);
  const item = await tx.item.findUnique({ where: { id: itemId } });
  if (!item || item.deletedAt) fail(404, 'NOT_FOUND', 'Item not found.');
  if (!await tx.membership.findUnique({ where: { spaceId_userId: { spaceId: item!.spaceId, userId: req.actorId } } })) fail(404, 'NOT_FOUND', 'Item not found.');
  if (item!.visibility === 'private' && item!.ownerId !== req.actorId) fail(404, 'NOT_FOUND', 'Item not found.');
  keeper(item!, req.actorId);
  const upload = await tx.photoUpload.create({ data: { itemId, actorId: req.actorId, path: prepared.path, mime, expiresAt: new Date(Date.now() + 2 * 3600000) } });
  return { status: 201, body: { id: upload.id, path: prepared.path, token: prepared.token, expiresAt: upload.expiresAt.toISOString(), maxBytes: 5_000_000 } };
}, 10000, async req => {
  const { itemId } = idParams.parse(req.params);
  const { mime } = z.object({ mime: z.enum(allowed), size: z.number().int().min(1).max(5_000_000) }).strict().parse(req.body);
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item || item.deletedAt) fail(404, 'NOT_FOUND', 'Item not found.');
  if (!await prisma.membership.findUnique({ where: { spaceId_userId: { spaceId: item!.spaceId, userId: req.actorId } } })) fail(404, 'NOT_FOUND', 'Item not found.');
  if (item!.visibility === 'private' && item!.ownerId !== req.actorId) fail(404, 'NOT_FOUND', 'Item not found.');
  keeper(item!, req.actorId);
  const extension = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
  const path = `${itemId}/${randomUUID()}.${extension}`;
  const signed = await storage.createSignedUploadUrl(path);
  if (signed.error || !signed.data) fail(503, 'TEMPORARY', 'Could not prepare photo upload.');
  return { path, token: signed.data!.token };
}));
photos.post('/items/:itemId/photo-uploads/:uploadId/complete', mutation<{ path: string }>(async (tx, req, prepared) => {
  const { itemId, uploadId } = uploadParams.parse(req.params); z.object({}).strict().parse(req.body);
  const item = await tx.item.findUnique({ where: { id: itemId } });
  if (!item || item.deletedAt) fail(404, 'NOT_FOUND', 'Item not found.');
  if (!await tx.membership.findUnique({ where: { spaceId_userId: { spaceId: item!.spaceId, userId: req.actorId } } })) fail(404, 'NOT_FOUND', 'Item not found.');
  if (item!.visibility === 'private' && item!.ownerId !== req.actorId) fail(404, 'NOT_FOUND', 'Item not found.');
  keeper(item!, req.actorId);
  const upload = await tx.photoUpload.findFirst({ where: { id: uploadId, itemId, actorId: req.actorId, completedAt: null } });
  if (!upload || upload.expiresAt < new Date()) fail(404, 'NOT_FOUND', 'Upload not found.');
  if (prepared.path !== upload!.path) fail(409, 'CONFLICT', 'Photo upload changed. Try again.');
  const updated = await tx.item.update({ where: { id: itemId }, data: { photoPath: prepared.path } });
  await tx.photoUpload.update({ where: { id: uploadId }, data: { completedAt: new Date() } });
  await tx.activity.create({ data: { itemId, actorId: req.actorId, kind: 'Changed photo' } });
  return { status: 200, body: await itemView(updated, req.actorId, tx) };
}, 10000, async req => {
  const { itemId, uploadId } = uploadParams.parse(req.params); z.object({}).strict().parse(req.body);
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item || item.deletedAt) fail(404, 'NOT_FOUND', 'Item not found.');
  if (!await prisma.membership.findUnique({ where: { spaceId_userId: { spaceId: item!.spaceId, userId: req.actorId } } })) fail(404, 'NOT_FOUND', 'Item not found.');
  if (item!.visibility === 'private' && item!.ownerId !== req.actorId) fail(404, 'NOT_FOUND', 'Item not found.');
  keeper(item!, req.actorId);
  const upload = await prisma.photoUpload.findFirst({ where: { id: uploadId, itemId, actorId: req.actorId, completedAt: null } });
  if (!upload || upload.expiresAt < new Date()) fail(404, 'NOT_FOUND', 'Upload not found.');
  const info = await storage.info(upload!.path);
  if (info.error || !info.data || typeof info.data.size !== 'number' || info.data.size > 5_000_000 || info.data.contentType !== upload!.mime) fail(422, 'VALIDATION', 'Photo type or size is invalid.');
  const downloaded = await storage.download(upload!.path);
  if (downloaded.error || !downloaded.data || !matchesMagic(new Uint8Array(await downloaded.data.arrayBuffer()), upload!.mime)) fail(422, 'VALIDATION', 'Photo content is invalid.');
  return { path: upload!.path };
}));
photos.get('/items/:itemId/photo', async (req, res) => {
  const { itemId } = idParams.parse(req.params);
  const item = await visibleItem(itemId, req.actorId);
  if (!item.photoPath) fail(404, 'NOT_FOUND', 'Photo not found.');
  const signed = await storage.createSignedUrl(item.photoPath!, 60);
  const data = signed.data;
  if (signed.error || !data) fail(503, 'TEMPORARY', 'Photo unavailable.');
  res.json({ url: data!.signedUrl, expiresIn: 60 });
});
