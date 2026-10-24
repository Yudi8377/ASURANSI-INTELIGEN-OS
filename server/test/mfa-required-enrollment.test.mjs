import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { generateTotp } from '../src/totp.mjs';
import { registerRequiredMfaEnrollmentRoutes } from '../src/mfa-required-enrollment.mjs';

const enrollmentToken = 'valid-required-enrollment-token';
const testKey = 'a'.repeat(64);
const challenge = {
  purpose: 'mfa_enrollment_required',
  userId: 'admin-1',
  tenantId: 'tenant-1',
  email: 'admin@example.test',
};

async function setup({ validChallenge = true } = {}) {
  const state = {
    id: challenge.userId,
    tenant_id: challenge.tenantId,
    email: challenge.email,
    full_name: 'Test Administrator',
    status: 'active',
    tenant_status: 'active',
    mfa_enabled: false,
    mfa_secret_encrypted: null,
    mfa_pending_secret_encrypted: null,
    mfa_last_counter: null,
    permissions: ['*'],
  };
  const audits = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM asuransi.users u')) return { rows: [{ ...state }], rowCount: 1 };
      if (sql.includes('UPDATE asuransi.users SET mfa_pending_secret_encrypted=')) {
        if (state.status !== 'active' || state.mfa_enabled !== false) return { rows: [], rowCount: 0 };
        state.mfa_pending_secret_encrypted = params[2];
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('UPDATE asuransi.users SET mfa_enabled=true')) {
        if (state.mfa_enabled || state.mfa_pending_secret_encrypted !== params[4]) return { rows: [], rowCount: 0 };
        state.mfa_enabled = true;
        state.mfa_secret_encrypted = params[2];
        state.mfa_pending_secret_encrypted = null;
        state.mfa_last_counter = params[3];
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO asuransi.audit_logs')) { audits.push({ sql, params }); return { rows: [], rowCount: 1 }; }
      throw new Error('Unexpected SQL: ' + sql);
    },
  };
  const app = Fastify({ logger: false });
  app.decorate('jwt', { verify(token) {
    if (token !== enrollmentToken || !validChallenge) throw new Error('invalid token');
    return challenge;
  } });
  await registerRequiredMfaEnrollmentRoutes(app, { pool });
  return { app, state, audits };
}

test('privileged enrollment requires the short-lived challenge and does not issue an access token', async (t) => {
  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = testKey;
  const { app, state, audits } = await setup();
  t.after(async () => { await app.close(); if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = previousKey; });

  const start = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/required/enroll/start', payload: { enrollmentToken } });
  assert.equal(start.statusCode, 200, start.body);
  const setupData = start.json();
  assert.match(setupData.secret, /^[A-Z2-7]+$/);
  assert.match(setupData.otpauthUrl, /^otpauth:\/\/totp\//);
  assert.ok(state.mfa_pending_secret_encrypted);
  assert.equal(state.mfa_enabled, false);

  const confirm = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/mfa/required/enroll/confirm',
    payload: { enrollmentToken, code: generateTotp(setupData.secret) },
  });
  assert.equal(confirm.statusCode, 200, confirm.body);
  assert.equal(confirm.json().mfaEnabled, true);
  assert.equal(confirm.json().accessTokenIssued, false);
  assert.equal(state.mfa_enabled, true);
  assert.equal(state.mfa_pending_secret_encrypted, null);
  assert.ok(state.mfa_secret_encrypted);
  assert.equal(audits.length, 2);
});

test('invalid enrollment challenge cannot start MFA enrollment', async (t) => {
  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = testKey;
  const { app, state } = await setup({ validChallenge: false });
  t.after(async () => { await app.close(); if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = previousKey; });

  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/required/enroll/start', payload: { enrollmentToken } });
  assert.equal(response.statusCode, 401, response.body);
  assert.equal(state.mfa_pending_secret_encrypted, null);
});
