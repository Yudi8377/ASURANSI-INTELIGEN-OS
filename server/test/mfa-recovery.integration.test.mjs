import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import argon2 from 'argon2';
import { registerMfaRecoveryRoutes } from '../src/mfa-recovery.mjs';

const challenge = {
  purpose: 'mfa_challenge',
  userId: 'user-1',
  tenantId: 'tenant-1',
  email: 'member@example.test',
};

async function makeApp({ challengePayload = challenge, tenantStatus = 'active', userStatus = 'active', mfaEnabled = true } = {}) {
  const code = 'ABCDEF-123456-7890AB';
  const codeHash = await argon2.hash(code, { type: argon2.argon2id });
  let used = false;
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('FROM asuransi.users u JOIN asuransi.tenants')) {
        if (params[1] !== 'user-1' || params[2] !== 'tenant-1') return { rows: [], rowCount: 0 };
        return {
          rows: [{
            id: 'user-1',
            tenant_id: 'tenant-1',
            email: 'member@example.test',
            full_name: 'Test Member',
            status: userStatus,
            mfa_enabled: mfaEnabled,
            permissions: ['client:read'],
            tenant_status: tenantStatus,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('SELECT id,code_hash FROM asuransi.user_mfa_recovery_codes')) {
        return { rows: used ? [] : [{ id: 'recovery-1', code_hash: codeHash }], rowCount: used ? 0 : 1 };
      }
      if (sql.includes('UPDATE asuransi.user_mfa_recovery_codes SET used_at')) {
        if (used) return { rows: [], rowCount: 0 };
        used = true;
        return { rows: [{ id: 'recovery-1' }], rowCount: 1 };
      }
      if (sql.includes('UPDATE asuransi.users SET last_login_at')) return { rows: [], rowCount: 1 };
      if (sql.includes('INSERT INTO asuransi.audit_logs')) return { rows: [], rowCount: 1 };
      throw new Error('Unexpected SQL in test: ' + sql);
    },
  };
  const app = Fastify({ logger: false });
  app.decorate('jwt', {
    verify(token) {
      if (token !== 'valid-challenge-token') throw new Error('invalid token');
      return challengePayload;
    },
    sign(payload) { return 'signed-access-token'; },
  });
  await registerMfaRecoveryRoutes(app, { pool, auth: async (_request, reply) => reply.code(401).send({ error: 'UNAUTHORIZED' }) });
  return { app, code, queries };
}

test('recovery verification consumes a valid code and issues an access token', async (t) => {
  const { app, code, queries } = await makeApp();
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/mfa/recovery/verify',
    payload: { challengeToken: 'valid-challenge-token', code },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().accessToken, 'signed-access-token');
  assert.equal(response.json().tokenType, 'Bearer');
  assert.equal(queries.filter((q) => q.sql.includes('UPDATE asuransi.user_mfa_recovery_codes SET used_at')).length, 1);
});

test('a recovery code cannot be used a second time', async (t) => {
  const { app, code } = await makeApp();
  t.after(() => app.close());
  const payload = { challengeToken: 'valid-challenge-token', code };
  const first = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/recovery/verify', payload });
  const second = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/recovery/verify', payload });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(second.statusCode, 401, second.body);
  assert.equal(second.json().error, 'MFA_RECOVERY_INVALID');
});

test('recovery verification rejects a challenge for an inactive tenant', async (t) => {
  const { app, code } = await makeApp({ tenantStatus: 'suspended' });
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/mfa/recovery/verify',
    payload: { challengeToken: 'valid-challenge-token', code },
  });
  assert.equal(response.statusCode, 401, response.body);
  assert.equal(response.json().error, 'MFA_CHALLENGE_INVALID');
});

test('recovery verification rejects an invalid challenge token', async (t) => {
  const { app, code } = await makeApp();
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/mfa/recovery/verify',
    payload: { challengeToken: 'not-a-valid-challenge-token', code },
  });
  assert.equal(response.statusCode, 401, response.body);
  assert.equal(response.json().error, 'MFA_CHALLENGE_INVALID');
});
