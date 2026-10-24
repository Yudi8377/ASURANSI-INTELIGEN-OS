import test from 'node:test';
import assert from 'node:assert/strict';
import { registerClientOperations } from '../src/clients.mjs';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER = '33333333-3333-4333-8333-333333333333';
const principal = { tenantId: TENANT_A, userId: USER_A, permissions: ['*'] };

function makeHarness({ poolQuery, transactionQuery } = {}) {
  const routes = new Map();
  const calls = [];
  const app = {
    get: (path, options, handler) => routes.set('GET ' + path, handler),
    post: (path, options, handler) => routes.set('POST ' + path, handler),
    put: (path, options, handler) => routes.set('PUT ' + path, handler),
    delete: (path, options, handler) => routes.set('DELETE ' + path, handler)
  };
  const tx = {
    query: async (sql, values = []) => {
      calls.push({ sql, values });
      if (transactionQuery) return transactionQuery(sql, values);
      return { rowCount: 1, rows: [{ id: CLIENT_ID, client_code: 'NAS-TEST', full_name: 'Nasabah Uji' }] };
    },
    release: () => {}
  };
  const pool = {
    query: async (sql, values = []) => {
      calls.push({ sql, values });
      if (poolQuery) return poolQuery(sql, values);
      return { rowCount: 1, rows: [{ id: OTHER_USER }] };
    },
    connect: async () => tx
  };
  const noop = async () => {};
  return { routes, calls, register: () => registerClientOperations(app, { pool, auth: noop, permit: () => noop }) };
}
function makeReply() {
  return { status: 200, body: undefined, code(n) { this.status = n; return this; }, send(body) { this.body = body; return this; } };
}
function request(overrides = {}) {
  return { user: principal, id: 'req-test', headers: { 'user-agent': 'test' }, query: {}, params: { id: CLIENT_ID }, body: { full_name: 'Nasabah Uji' }, ...overrides };
}

test('client list scopes results to the authenticated tenant', async () => {
  const h = makeHarness(); await h.register();
  await h.routes.get('GET /api/v1/clients')(request());
  assert.match(h.calls[0].sql, /WHERE tenant_id=\$1 AND deleted_at IS NULL/);
  assert.equal(h.calls[0].values[0], TENANT_A);
});

test('client create uses authenticated tenant even when body supplies another tenant_id', async () => {
  const h = makeHarness(); await h.register(); const reply = makeReply();
  await h.routes.get('POST /api/v1/clients')(request({ body: { full_name: 'Nasabah Uji', tenant_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } }), reply);
  const insert = h.calls.find(c => c.sql.includes('INSERT INTO asuransi.clients'));
  assert.ok(insert);
  assert.equal(insert.values[0], TENANT_A);
  assert.equal(reply.status, 201);
});

test('client create rejects an owner outside the authenticated tenant', async () => {
  const h = makeHarness({ poolQuery: async () => ({ rowCount: 0, rows: [] }) }); await h.register(); const reply = makeReply();
  await h.routes.get('POST /api/v1/clients')(request({ body: { full_name: 'Nasabah Uji', owner_user_id: OTHER_USER } }), reply);
  assert.equal(reply.status, 400);
  assert.equal(reply.body.error, 'INVALID_OWNER_USER');
  assert.equal(h.calls.length, 1);
});

test('client update returns 404 and does not cross tenant boundary', async () => {
  const h = makeHarness({ transactionQuery: async sql => sql.startsWith('UPDATE asuransi.clients') ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [] } });
  await h.register(); const reply = makeReply();
  await h.routes.get('PUT /api/v1/clients/:id')(request(), reply);
  const update = h.calls.find(c => c.sql.startsWith('UPDATE asuransi.clients'));
  assert.match(update.sql, /WHERE tenant_id=\$1 AND id=\$2 AND deleted_at IS NULL/);
  assert.deepEqual(update.values.slice(0, 2), [TENANT_A, CLIENT_ID]);
  assert.equal(reply.status, 404);
});

test('client delete returns 404 and cannot soft-delete another tenant client', async () => {
  const h = makeHarness({ transactionQuery: async sql => sql.startsWith('UPDATE asuransi.clients') ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [] } });
  await h.register(); const reply = makeReply();
  await h.routes.get('DELETE /api/v1/clients/:id')(request(), reply);
  const update = h.calls.find(c => c.sql.startsWith('UPDATE asuransi.clients'));
  assert.match(update.sql, /WHERE tenant_id=\$1 AND id=\$2 AND deleted_at IS NULL/);
  assert.deepEqual(update.values, [TENANT_A, CLIENT_ID]);
  assert.equal(reply.status, 404);
});


test('partial client update changes only explicitly supplied fields', async () => {
  const h = makeHarness({ transactionQuery: async (sql, values) => sql.startsWith('UPDATE asuransi.clients') ? { rowCount: 1, rows: [{ id: CLIENT_ID, full_name: 'Nama Baru' }] } : { rowCount: 1, rows: [] } });
  await h.register(); const reply = makeReply();
  await h.routes.get('PUT /api/v1/clients/:id')(request({ body: { full_name: 'Nama Baru' } }), reply);
  const update = h.calls.find(c => c.sql.startsWith('UPDATE asuransi.clients'));
  assert.match(update.sql, /SET full_name=\\$3,updated_at=now\(\)/);
  assert.deepEqual(update.values, [TENANT_A, CLIENT_ID, 'Nama Baru']);
});
