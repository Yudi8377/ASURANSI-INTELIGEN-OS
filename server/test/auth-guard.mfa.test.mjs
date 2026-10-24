import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthGuard } from '../src/auth-guard.mjs';

function replyRecorder() {
  return {
    statusCode: 200,
    payload: null,
    code(status) { this.statusCode = status; return this; },
    send(payload) { this.payload = payload; return this; }
  };
}

function makeRequest(claims) {
  return {
    user: undefined,
    async jwtVerify() { this.user = claims; }
  };
}

test('MFA challenge token is rejected by protected-route guard before database access', async () => {
  for (const permissions of [undefined, [], ['*'], ['clients:read']]) {
    let queries = 0;
    const auth = createAuthGuard({ pool: { async query() { queries += 1; throw new Error('must not query'); } } });
    const request = makeRequest({
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'member@example.test',
      purpose: 'mfa_challenge',
      ...(permissions === undefined ? {} : { permissions })
    });
    const reply = replyRecorder();

    await auth(request, reply);

    assert.equal(reply.statusCode, 401, 'challenge must not authorize protected access');
    assert.equal(reply.payload.error, 'UNAUTHORIZED');
    assert.equal(queries, 0, 'challenge must be rejected before principal lookup');
  }
});

test('normal access token checks current user and tenant state', async () => {
  let queries = 0;
  const auth = createAuthGuard({
    pool: {
      async query() {
        queries += 1;
        return { rowCount: 1, rows: [{ user_status: 'active', tenant_status: 'active' }] };
      }
    }
  });
  const request = makeRequest({
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: 'member@example.test',
    permissions: ['clients:read']
  });
  const reply = replyRecorder();

  await auth(request, reply);

  assert.equal(reply.statusCode, 200);
  assert.equal(queries, 1);
});

test('inactive tenant cannot use an otherwise valid access token', async () => {
  const auth = createAuthGuard({
    pool: {
      async query() {
        return { rowCount: 1, rows: [{ user_status: 'active', tenant_status: 'suspended' }] };
      }
    }
  });
  const request = makeRequest({
    userId: 'user-1',
    tenantId: 'tenant-1',
    permissions: ['clients:read']
  });
  const reply = replyRecorder();

  await auth(request, reply);

  assert.equal(reply.statusCode, 403);
  assert.equal(reply.payload.error, 'TENANT_SUSPENDED');
});

test('privileged MFA enrollment challenge cannot authorize protected routes even with wildcard claims', async () => {
  let queries = 0;
  const auth = createAuthGuard({ pool: { async query() { queries += 1; return { rowCount: 1, rows: [{ user_status: 'active', tenant_status: 'active' }] }; } } });
  const request = makeRequest({
    userId: 'admin-1',
    tenantId: 'tenant-1',
    email: 'admin@example.test',
    purpose: 'mfa_enrollment_required',
    permissions: ['*']
  });
  const reply = replyRecorder();

  await auth(request, reply);

  assert.equal(reply.statusCode, 401);
  assert.equal(reply.payload.error, 'UNAUTHORIZED');
  assert.equal(queries, 0);
});
