import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthGuard } from '../src/auth-guard.mjs';

const claims = { userId: 'user-a', tenantId: 'tenant-a', permissions: ['clients:read'] };

function setup({ userStatus = 'active', tenantStatus = 'active', rowCount = 1, jwtError = null, user = claims, dbError = null } = {}) {
  const calls = [];
  const pool = { async query(sql, params) {
    calls.push({ sql, params });
    if (dbError) throw dbError;
    return { rowCount, rows: rowCount ? [{ user_status: userStatus, tenant_status: tenantStatus }] : [] };
  }};
  const sent = { statusCode: null, body: null };
  const reply = { code(status) { sent.statusCode = status; return this; }, send(body) { sent.body = body; return this; } };
  const request = { user, async jwtVerify() { if (jwtError) throw jwtError; } };
  return { guard: createAuthGuard({ pool }), request, reply, calls, sent };
}

test('allows active user and tenant, with lookup scoped to user and tenant IDs', async () => {
  const c = setup();
  assert.equal(await c.guard(c.request, c.reply), undefined);
  assert.equal(c.sent.statusCode, null);
  assert.equal(c.calls.length, 1);
  assert.match(c.calls[0].sql, /u\.id=\$1 AND u\.tenant_id=\$2/);
  assert.deepEqual(c.calls[0].params, ['user-a', 'tenant-a']);
});

test('rejects failed JWT verification before database lookup', async () => {
  const c = setup({ jwtError: new Error('invalid token') });
  await c.guard(c.request, c.reply);
  assert.equal(c.sent.statusCode, 401);
  assert.equal(c.sent.body.error, 'UNAUTHORIZED');
  assert.equal(c.calls.length, 0);
});

test('rejects missing identity claims', async () => {
  const c = setup({ user: { userId: 'user-a', tenantId: 'tenant-a' } });
  await c.guard(c.request, c.reply);
  assert.equal(c.sent.statusCode, 401);
  assert.equal(c.calls.length, 0);
});

test('rejects absent principal rows', async () => {
  const c = setup({ rowCount: 0 });
  await c.guard(c.request, c.reply);
  assert.equal(c.sent.statusCode, 401);
  assert.deepEqual(c.calls[0].params, ['user-a', 'tenant-a']);
});

test('rejects non-active user statuses', async (t) => {
  for (const userStatus of ['disabled', 'locked', 'archived', 'pending']) {
    await t.test(userStatus, async () => {
      const c = setup({ userStatus });
      await c.guard(c.request, c.reply);
      assert.equal(c.sent.statusCode, 401);
    });
  }
});

test('rejects non-active tenant statuses', async (t) => {
  for (const tenantStatus of ['suspended', 'archived', 'disabled']) {
    await t.test(tenantStatus, async () => {
      const c = setup({ tenantStatus });
      await c.guard(c.request, c.reply);
      assert.equal(c.sent.statusCode, 403);
      assert.equal(c.sent.body.error, 'TENANT_SUSPENDED');
    });
  }
});

test('propagates database failures instead of allowing the request', async () => {
  const c = setup({ dbError: new Error('database unavailable') });
  await assert.rejects(c.guard(c.request, c.reply), /database unavailable/);
  assert.equal(c.sent.statusCode, null);
});
