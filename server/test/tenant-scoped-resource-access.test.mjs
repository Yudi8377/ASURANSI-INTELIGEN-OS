import test from 'node:test';
import assert from 'node:assert/strict';
import { registerOperations } from '../src/operations.mjs';
import { registerScenarioOperations } from '../src/scenarios.mjs';

function makeApp() {
  const routes = new Map();
  return {
    routes,
    get(path, options, handler) { routes.set('GET ' + path, handler); },
    post(path, options, handler) { routes.set('POST ' + path, handler); }
  };
}

function makeReply() {
  return {
    statusCode: 200,
    body: undefined,
    code(status) { this.statusCode = status; return this; },
    send(body) { this.body = body; return this; }
  };
}

function makePool({ rows = [], rowCount = rows.length } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows, rowCount };
    }
  };
}

const auth = async () => {};
const permit = () => async () => {};
const tenantA = { user: { userId: 'user-a', tenantId: 'tenant-a', permissions: ['*'] }, query: {} };
const foreignResourceId = '00000000-0000-4000-8000-000000000099';

test('policy list is scoped to the requesting tenant', async () => {
  const app = makeApp();
  const pool = makePool();
  await registerOperations(app, { pool, auth, permit });
  await app.routes.get('GET /api/v1/policies')(tenantA, makeReply());
  assert.match(pool.calls[0].sql, /WHERE p\.tenant_id=\$1/);
  assert.equal(pool.calls[0].params[0], 'tenant-a');
});

test('claim list is scoped to the requesting tenant and tenant-matched joins', async () => {
  const app = makeApp();
  const pool = makePool();
  await registerOperations(app, { pool, auth, permit });
  await app.routes.get('GET /api/v1/claims')(tenantA, makeReply());
  assert.match(pool.calls[0].sql, /WHERE cl\.tenant_id=\$1/);
  assert.match(pool.calls[0].sql, /p\.tenant_id=cl\.tenant_id/);
  assert.match(pool.calls[0].sql, /c\.tenant_id=cl\.tenant_id/);
  assert.equal(pool.calls[0].params[0], 'tenant-a');
});

test('scenario list binds tenant from authenticated claims, not request query', async () => {
  const app = makeApp();
  const pool = makePool();
  await registerScenarioOperations(app, { pool, auth, permit });
  await app.routes.get('GET /api/v1/scenarios')({ ...tenantA, query: { tenantId: 'tenant-b' } }, makeReply());
  assert.match(pool.calls[0].sql, /WHERE tenant_id=\$1/);
  assert.equal(pool.calls[0].params[0], 'tenant-a');
  assert.ok(!pool.calls[0].params.includes('tenant-b'));
});

test('scenario detail returns not found for an ID not visible in the authenticated tenant', async () => {
  const app = makeApp();
  const pool = makePool({ rows: [], rowCount: 0 });
  await registerScenarioOperations(app, { pool, auth, permit });
  const reply = makeReply();
  await app.routes.get('GET /api/v1/scenarios/:id')({ ...tenantA, params: { id: foreignResourceId } }, reply);
  assert.equal(reply.statusCode, 404);
  assert.equal(reply.body.error, 'NOT_FOUND');
  assert.match(pool.calls[0].sql, /WHERE tenant_id=\$1 AND id=\$2/);
  assert.deepEqual(pool.calls[0].params, ['tenant-a', foreignResourceId]);
});

test('running a scenario cannot select a resource belonging to another tenant', async () => {
  const app = makeApp();
  const pool = makePool({ rows: [], rowCount: 0 });
  await registerScenarioOperations(app, { pool, auth, permit });
  const reply = makeReply();
  await app.routes.get('POST /api/v1/scenarios/:id/run')({ ...tenantA, params: { id: foreignResourceId } }, reply);
  assert.equal(reply.statusCode, 404);
  assert.equal(reply.body.error, 'NOT_FOUND');
  assert.match(pool.calls[0].sql, /WHERE tenant_id=\$1 AND id=\$2/);
  assert.deepEqual(pool.calls[0].params, ['tenant-a', foreignResourceId]);
});
