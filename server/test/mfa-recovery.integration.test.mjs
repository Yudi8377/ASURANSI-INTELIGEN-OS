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
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM asuransi.users u JOIN asuransi.tenants')) {
        if (params[1] !== 'user-1' || params[2] !== 'tenant-1' || params[0] !== 'member@example.test') return { rows: [], rowCount: 0 };
        return { rows: [{
          id: 'user-1', tenant_id: 'tenant-1', email: 'member@example.test',
          full_name: 'Test Member', status: userStatus, mfa_enabled: mfaEnabled,
          permissions: ['client:read'], tenant_status: tenantStatus,
        }], rowCount: 1 };
      }
      if (sql.includes('SELECT id,code_hash FROM asuransi.user_mfa_recovery_codes')) {
        assert.deepEqual(params, ['tenant-1', 'user-1'], 'recovery lookup must be tenant and user scoped');
        return { rows: used ? [] : [{ id: 'recovery-1', code_hash: codeHash }], rowCount: used ? 0 : 1 };
      }
      if (sql.includes('UPDATE asuransi.user_mfa_recovery_codes SET used_at')) {
        assert.deepEqual(params.slice(1, 3), ['tenant-1', 'user-1'], 'recovery consume must be tenant and user scoped');
        if (used) return { rows: [], rowCount: 0 };
        used = true;
        return { rows: [{ id: 'recovery-1' }], rowCount: 1 };
      }
      if (sql.includes('UPDATE asuransi.users SET last_login_at')) return { rows: [], rowCount: 1 };
      if (sql.includes('INSERT INTO asuransi.audit_logs')) return { rows: [], rowCount: 1 };
      throw new Error('Unexpected SQL in test: ' + sql);
    },
    async connect() {
      return {
        query: (sql, params = []) => pool.query(sql, params),
        release() {},
      };
    },
  };
  const app = Fastify({ logger: false });
  app.decorate('jwt', {
    verify(token) {
      if (token !== 'valid-challenge-token') throw new Error('invalid token');
      return challengePayload;
    },
    sign() { return 'signed-access-token'; },
  });
  await registerMfaRecoveryRoutes(app, { pool, auth: async (_request, reply) => reply.code(401).send({ error: 'UNAUTHORIZED' }) });
  return { app, code, queries };
}

test('recovery verification consumes a valid code and issues an access token', async (t) => {
  const { app, code, queries } = await makeApp();
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/recovery/verify', payload: { challengeToken: 'valid-challenge-token', code } });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().accessToken, 'signed-access-token');
  assert.equal(response.json().tokenType, 'Bearer');
  assert.equal(queries.filter((q) => q.sql.includes('UPDATE asuransi.user_mfa_recovery_codes SET used_at')).length, 1);
});

test('concurrent attempts to consume the same recovery code allow only one success', async (t) => {
  const { app, code } = await makeApp();
  t.after(() => app.close());
  const payload = { challengeToken: 'valid-challenge-token', code };
  const responses = await Promise.all([
    app.inject({ method: 'POST', url: '/api/v1/auth/mfa/recovery/verify', payload }),
    app.inject({ method: 'POST', url: '/api/v1/auth/mfa/recovery/verify', payload }),
  ]);
  assert.equal(responses.filter((r) => r.statusCode === 200).length, 1);
  assert.equal(responses.filter((r) => r.statusCode === 401).length, 1);
});

test('a recovery code cannot be used a second time', async (t) => {
  const { app, code } = await makeApp();
  t.after(() => app.close());
  const payload = { challengeToken: 'valid-challenge-token', code };
  const first = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/recovery/verify', payload });
  const second = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/recovery/verify', payload });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(second.statusCode, 401, second.body);
});

test('recovery verification rejects inactive users, inactive tenants, and disabled MFA', async (t) => {
  for (const options of [{ userStatus: 'disabled' }, { tenantStatus: 'suspended' }, { mfaEnabled: false }]) {
    const { app, code } = await makeApp(options);
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/recovery/verify', payload: { challengeToken: 'valid-challenge-token', code } });
    assert.equal(response.statusCode, 401, JSON.stringify(options) + ': ' + response.body);
    assert.equal(response.json().error, 'MFA_CHALLENGE_INVALID');
    await app.close();
  }
});

test('recovery verification rejects a challenge with a different tenant identity', async (t) => {
  const { app, code, queries } = await makeApp({ challengePayload: { ...challenge, tenantId: 'tenant-other' } });
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/recovery/verify', payload: { challengeToken: 'valid-challenge-token', code } });
  assert.equal(response.statusCode, 401, response.body);
  assert.equal(response.json().error, 'MFA_CHALLENGE_INVALID');
  assert.equal(queries.some((q) => q.sql.includes('SELECT id,code_hash FROM asuransi.user_mfa_recovery_codes')), false);
});

test('recovery verification rejects an invalid challenge token', async (t) => {
  const { app, code } = await makeApp();
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/recovery/verify', payload: { challengeToken: 'not-a-valid-challenge-token', code } });
  assert.equal(response.statusCode, 401, response.body);
  assert.equal(response.json().error, 'MFA_CHALLENGE_INVALID');
});
