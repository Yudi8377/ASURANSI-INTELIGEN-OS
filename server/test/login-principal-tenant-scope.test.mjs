import test from 'node:test';
import assert from 'node:assert/strict';
import { findLoginPrincipal } from '../src/login-principal.mjs';

test('login role permissions are joined only from the user tenant', async () => {
  let captured;
  const pool = { query: async (sql, values) => { captured = { sql, values }; return { rows: [], rowCount: 0 }; } };
  await findLoginPrincipal(pool, 'user@example.test');
  assert.match(captured.sql, /LEFT JOIN asuransi\.roles r ON r\.id=ur\.role_id AND r\.tenant_id=u\.tenant_id/);
  assert.match(captured.sql, /LEFT JOIN asuransi\.user_roles ur ON ur\.user_id=u\.id/);
  assert.deepEqual(captured.values, ['user@example.test']);
});

test('login principal query requires a database pool', async () => {
  assert.throws(() => findLoginPrincipal(null, 'user@example.test'), /requires a pool/);
});
