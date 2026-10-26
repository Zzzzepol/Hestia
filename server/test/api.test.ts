import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { RequestHandler } from 'express';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/hestia_test';
process.env.DIRECT_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/hestia_test';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_value_never_use_in_production';
process.env.CORS_ORIGINS = 'http://localhost:19006';

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/db.js');
const testAuth: RequestHandler = (req, _res, next) => { req.actorId = req.header('X-Test-Actor') ?? ''; next(); };
const app = createApp(testAuth);
const as = (id: string) => ({ 'X-Test-Actor': id });
const idem = () => ({ 'Idempotency-Key': randomUUID() });

describe('HTTP surface', () => {
  it('has a public health endpoint', async () => { await request(app).get('/health').expect(200, { ok: true }); });
  it('rejects missing bearer token', async () => { const real = createApp(); await request(real).get('/v1/session').expect(401).expect(r => expect(r.body.code).toBe('AUTH_REQUIRED')); });
  it('returns a typed validation error for malformed JSON', async () => {
    await request(app).post('/v1/spaces').set(as(randomUUID())).set(idem()).set('Content-Type', 'application/json').send('{bad').expect(400).expect(r => expect(r.body.code).toBe('VALIDATION'));
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL integration', () => {
  let admin: string, borrowerA: string, borrowerB: string, outsider: string, spaceId: string;
  beforeAll(async () => {
    [admin, borrowerA, borrowerB, outsider] = Array.from({ length: 4 }, () => randomUUID());
    await prisma.user.createMany({ data: [admin, borrowerA, borrowerB, outsider].map(id => ({ id, name: id })) });
    const space = await prisma.space.create({ data: { name: 'Integration test' } });
    spaceId = space.id;
    await prisma.membership.createMany({ data: [admin, borrowerA, borrowerB].map(userId => ({ spaceId, userId, role: userId === admin ? 'admin' : 'member' })) });
  });

  it('allows one of two simultaneous approvals and rejects competing pending requests', async () => {
    const item = await prisma.item.create({ data: { spaceId, ownerId: admin, name: 'Drill', kind: 'returnable', category: 'Tools', location: 'Shed', visibility: 'shared' } });
    const [a, b] = await Promise.all([borrowerA, borrowerB].map(borrowerId => request(app).post(`/v1/items/${item.id}/requests`).set(as(borrowerId)).set(idem()).send({}).expect(201)));
    const requests = [a.body.loan.id, b.body.loan.id];
    const approvals = await Promise.all(requests.map(id => request(app).post(`/v1/requests/${id}/approve`).set(as(admin)).set(idem()).send({})));
    expect(approvals.map(x => x.status).sort()).toEqual([200, 409]);
    const rows = await prisma.borrowRequest.findMany({ where: { itemId: item.id } });
    expect(rows.filter(x => x.state === 'Reserved')).toHaveLength(1);
    expect(rows.filter(x => x.state === 'Rejected')).toHaveLength(1);
  });

  it('never spends the last unit twice and logs exact balances', async () => {
    const item = await prisma.item.create({ data: { spaceId, ownerId: admin, name: 'Soap', kind: 'consumable', category: 'Cleaning', location: 'Sink', visibility: 'shared', quantity: 1, unit: 'unit', lowThreshold: 0 } });
    const results = await Promise.all([borrowerA, borrowerB].map(actor => request(app).post(`/v1/items/${item.id}/use`).set(as(actor)).set(idem()).send({ amount: 1 })));
    expect(results.map(x => x.status).sort()).toEqual([200, 409]);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).quantity).toBe(0);
    const logs = await prisma.activity.findMany({ where: { itemId: item.id, kind: 'Used' } });
    expect(logs).toHaveLength(1);
    expect([logs[0]?.before, logs[0]?.after]).toEqual([1, 0]);
  });

  it('hides private items and prevents a non-keeper approval', async () => {
    const privateItem = await prisma.item.create({ data: { spaceId, ownerId: admin, name: 'Passport', kind: 'returnable', category: 'Personal', location: 'Drawer', visibility: 'private' } });
    await request(app).get(`/v1/items/${privateItem.id}`).set(as(borrowerA)).expect(404);
    await request(app).get(`/v1/items/${privateItem.id}`).set(as(outsider)).expect(404);
    const anotherPrivate = await prisma.item.create({ data: { spaceId, ownerId: borrowerA, name: 'Diary', kind: 'returnable', category: 'Personal', location: 'Room', visibility: 'private' } });
    await request(app).get(`/v1/items/${anotherPrivate.id}`).set(as(admin)).expect(404);
    const shared = await prisma.item.create({ data: { spaceId, ownerId: admin, name: 'Camera', kind: 'returnable', category: 'Electronics', location: 'Shelf', visibility: 'shared' } });
    const requested = await request(app).post(`/v1/items/${shared.id}/requests`).set(as(borrowerA)).set(idem()).send({}).expect(201);
    await request(app).post(`/v1/requests/${requested.body.loan.id}/approve`).set(as(borrowerB)).set(idem()).send({}).expect(404);
    await request(app).post(`/v1/requests/${requested.body.loan.id}/approve`).set(as(borrowerA)).set(idem()).send({}).expect(403);
    await request(app).post(`/v1/requests/${requested.body.loan.id}/handover`).set(as(admin)).set(idem()).send({}).expect(409);
  });

  it('replays one idempotent mutation and rejects key reuse with different input', async () => {
    const key = randomUUID();
    const first = await request(app).post('/v1/spaces').set(as(admin)).set('Idempotency-Key', key).send({ name: 'Retry space' }).expect(201);
    const retry = await request(app).post('/v1/spaces').set(as(admin)).set('Idempotency-Key', key).send({ name: 'Retry space' }).expect(201);
    expect(retry.body.spaceId).toBe(first.body.spaceId);
    await request(app).post('/v1/spaces').set(as(admin)).set('Idempotency-Key', key).send({ name: 'Changed input' }).expect(409).expect(r => expect(r.body.code).toBe('IDEMPOTENCY_REUSED'));
  });

  it('previews and joins another Space, then lets only its admin delete it', async () => {
    const created = await request(app).post('/v1/spaces').set(as(admin)).set(idem()).send({ name: 'Temporary household', kind: 'household' }).expect(201);
    const temporaryId = created.body.spaceId as string;
    const code = created.body.invite.code as string;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const preview = await request(app).post('/v1/spaces/join/preview').set(as(borrowerA)).set(idem()).send({ code }).expect(200);
    expect(preview.body).toMatchObject({ id: temporaryId, name: 'Temporary household', kind: 'household', memberCount: 1 });
    await request(app).post('/v1/spaces/join').set(as(borrowerA)).set(idem()).send({ code }).expect(200);
    const list = await request(app).get('/v1/spaces').set(as(borrowerA)).expect(200);
    expect(list.body.data.map((space: { id: string }) => space.id)).toContain(spaceId);
    expect(list.body.data.map((space: { id: string }) => space.id)).toContain(temporaryId);
    const item = await prisma.item.create({ data: { spaceId: temporaryId, ownerId: admin, name: 'Test lamp', kind: 'returnable', category: 'Tools', location: 'Shelf', visibility: 'shared' } });
    await prisma.activity.create({ data: { itemId: item.id, actorId: admin, kind: 'Created' } });
    await request(app).delete(`/v1/spaces/${temporaryId}`).set(as(borrowerA)).set(idem()).send({ confirmName: 'Temporary household' }).expect(403);
    await request(app).delete(`/v1/spaces/${temporaryId}`).set(as(admin)).set(idem()).send({ confirmName: 'Wrong name' }).expect(422);
    const removed = await request(app).delete(`/v1/spaces/${temporaryId}`).set(as(admin)).set(idem()).send({ confirmName: 'Temporary household' }).expect(200);
    expect(removed.body.spaceId).toBe(spaceId);
    expect((await prisma.space.findUniqueOrThrow({ where: { id: temporaryId } })).archivedAt).not.toBeNull();
    expect(await prisma.item.findUnique({ where: { id: item.id } })).not.toBeNull();
    expect(await prisma.activity.count({ where: { itemId: item.id } })).toBe(1);
    await request(app).get(`/v1/items/${item.id}`).set(as(admin)).expect(404);
    await request(app).post('/v1/spaces/join/preview').set(as(outsider)).set(idem()).send({ code }).expect(410);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: borrowerA } })).selectedSpaceId).toBe(spaceId);
  });
});
