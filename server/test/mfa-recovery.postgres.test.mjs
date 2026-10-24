import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import argon2 from 'argon2';
import pg from 'pg';
import { registerMfaRecoveryRoutes } from '../src/mfa-recovery.mjs';

const { Pool } = pg;
const databaseUrl = process.env.PG_TEST_URL;
const userId = '10000000-0000-4000-8000-000000000001';
const tenantId = '20000000-0000-4000-8000-000000000001';
const code = 'ABCDEF-123456-7890AB';
const challenge = { purpose: 'mfa_challenge', userId, tenantId, email: 'mfa-postgres@example.test' };

test('PostgreSQL atomically allows only one concurrent recovery-code redemption', { skip: !databaseUrl }, async (t) => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8 });
  const app = Fastify({ logger: false });
  t.after(async () => { await app.close(); await pool.end(); });

  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS asuransi;
    CREATE TABLE IF NOT EXISTS asuransi.tenants (
      id uuid PRIMARY KEY, status text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS asuransi.users (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES asuransi.tenants(id),
      email text NOT NULL, full_name text NOT NULL, status text NOT NULL,
      mfa_enabled boolean NOT NULL DEFAULT false, last_login_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS asuransi.roles (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES asuransi.tenants(id),
      permissions jsonb NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE TABLE IF NOT EXISTS asuransi.user_roles (
      user_id uuid NOT NULL REFERENCES asuransi.users(id),
      role_id uuid NOT NULL REFERENCES asuransi.roles(id)
    );
    CREATE TABLE IF NOT EXISTS asuransi.audit_logs (
      id bigserial PRIMARY KEY, tenant_id uuid, actor_user_id uuid, action text NOT NULL,
      resource_type text, resource_id uuid, request_id text, outcome text
    );
    CREATE TABLE IF NOT EXISTS asuransi.user_mfa_recovery_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES asuransi.tenants(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES asuransi.users(id) ON DELETE CASCADE,
      code_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), used_at timestamptz,
      CONSTRAINT user_mfa_recovery_codes_hash_unique UNIQUE (user_id, code_hash)
    );
  `);

  // The workflow uses a fresh, disposable PostgreSQL service database.
  await pool.query('TRUNCATE asuransi.user_mfa_recovery_codes, asuransi.user_roles, asuransi.roles, asuransi.audit_logs, asuransi.users, asuransi.tenants RESTART IDENTITY CASCADE');
  await pool.query('INSERT INTO asuransi.tenants(id,status) VALUES ($1,\'active\')', [tenantId]);
  await pool.query('INSERT INTO asuransi.users(id,tenant_id,email,full_name,status,mfa_enabled) VALUES ($1,$2,$3,$4,\'active\',true)', [userId, tenantId, challenge.email, 'Postgres MFA Test']);
  const codeHash = await argon2.hash(code, { type: argon2.argon2id });
  await pool.query('INSERT INTO asuransi.user_mfa_recovery_codes(tenant_id,user_id,code_hash) VALUES ($1,$2,$3)', [tenantId, userId, codeHash]);

  app.decorate('jwt', {
    verify(token) {
      if (token !== 'valid-postgres-challenge') throw new Error('invalid challenge');
      return challenge;
    },
    sign() { return 'postgres-test-access-token'; },
  });
  await registerMfaRecoveryRoutes(app, { pool, auth: async (_request, reply) => reply.code(401).send({ error: 'UNAUTHORIZED' }) });

  const payload = { challengeToken: 'valid-postgres-challenge', code };
  const responses = await Promise.all([
    app.inject({ method: 'POST', url: '/api/v1/auth/mfa/recovery/verify', payload }),
    app.inject({ method: 'POST', url: '/api/v1/auth/mfa/recovery/verify', payload }),
  ]);

  assert.equal(responses.filter((response) => response.statusCode === 200).length, 1, responses.map((r) => r.body).join('\n'));
  assert.equal(responses.filter((response) => response.statusCode === 401).length, 1, responses.map((r) => r.body).join('\n'));
  const persisted = await pool.query('SELECT used_at FROM asuransi.user_mfa_recovery_codes WHERE tenant_id=$1 AND user_id=$2', [tenantId, userId]);
  assert.equal(persisted.rowCount, 1);
  assert.ok(persisted.rows[0].used_at, 'the recovery code must be marked used in PostgreSQL');
});
