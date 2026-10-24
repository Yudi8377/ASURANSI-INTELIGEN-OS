import { randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { decryptMfaSecret } from './mfa-crypto.mjs';
import { matchingTotpCounter } from './totp.mjs';

function generateRecoveryCode() {
  const raw = randomBytes(9).toString('hex').toUpperCase();
  return raw.match(/.{1,6}/g).join('-');
}

export async function registerMfaRecoveryRoutes(app, { pool, auth }) {
  app.post('/api/v1/auth/mfa/recovery/verify', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = z.object({ challengeToken: z.string().min(20).max(4096), code: z.string().regex(/^[A-F0-9]{6}(?:-[A-F0-9]{6})$/i) }).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Kode pemulihan tidak valid.' });
    let challenge;
    try { challenge = app.jwt.verify(input.data.challengeToken); } catch { return reply.code(401).send({ error: 'MFA_CHALLENGE_INVALID', message: 'Tantangan MFA tidak valid atau telah kedaluwarsa.' }); }
    if (challenge.purpose !== 'mfa_challenge' || !challenge.userId || !challenge.tenantId || !challenge.email) return reply.code(401).send({ error: 'MFA_CHALLENGE_INVALID', message: 'Tantangan MFA tidak valid.' });
    const result = await pool.query(`SELECT u.id,u.tenant_id,u.email,u.full_name,u.status,u.mfa_enabled,
      COALESCE(jsonb_agg(DISTINCT perm.value) FILTER (WHERE perm.value IS NOT NULL),'[]'::jsonb) AS permissions,
      t.status AS tenant_status
      FROM asuransi.users u JOIN asuransi.tenants t ON t.id=u.tenant_id
      LEFT JOIN asuransi.user_roles ur ON ur.user_id=u.id
      LEFT JOIN asuransi.roles r ON r.id=ur.role_id AND r.tenant_id=u.tenant_id
      LEFT JOIN LATERAL jsonb_array_elements_text(r.permissions) perm(value) ON true
      WHERE lower(u.email)=lower($1) AND u.id=$2 AND u.tenant_id=$3
      GROUP BY u.id,t.status LIMIT 1`, [challenge.email, challenge.userId, challenge.tenantId]);
    const user = result.rows[0];
    if (!user || user.status !== 'active' || user.tenant_status !== 'active' || !user.mfa_enabled) return reply.code(401).send({ error: 'MFA_CHALLENGE_INVALID', message: 'Tantangan MFA tidak valid.' });
    const candidate = input.data.code.toUpperCase();
    const codes = await pool.query('SELECT id,code_hash FROM asuransi.user_mfa_recovery_codes WHERE tenant_id=$1 AND user_id=$2 AND used_at IS NULL', [user.tenant_id, user.id]);
    let matched = null;
    for (const row of codes.rows) {
      if (await argon2.verify(row.code_hash, candidate).catch(() => false)) { matched = row; break; }
    }
    if (!matched) {
      await pool.query("INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,outcome) VALUES($1,$2,'auth.mfa.recovery_failed','user',$2,$3,'denied')", [user.tenant_id, user.id, request.id]);
      return reply.code(401).send({ error: 'MFA_RECOVERY_INVALID', message: 'Kode pemulihan salah atau sudah digunakan.' });
    }
    const consumed = await pool.query('UPDATE asuransi.user_mfa_recovery_codes SET used_at=now() WHERE id=$1 AND tenant_id=$2 AND user_id=$3 AND used_at IS NULL RETURNING id', [matched.id, user.tenant_id, user.id]);
    if (consumed.rowCount !== 1) return reply.code(401).send({ error: 'MFA_RECOVERY_USED', message: 'Kode pemulihan sudah digunakan.' });
    await pool.query('UPDATE asuransi.users SET last_login_at=now() WHERE id=$1 AND tenant_id=$2', [user.id, user.tenant_id]);
    await pool.query("INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,outcome) VALUES($1,$2,'auth.mfa.recovery_used','user',$2,$3,'success')", [user.tenant_id, user.id, request.id]);
    const accessToken = app.jwt.sign({ userId: user.id, tenantId: user.tenant_id, email: user.email, permissions: user.permissions });
    return { accessToken, tokenType: 'Bearer', expiresIn: 600, recoveryCodeRemaining: Math.max(0, codes.rows.length - 1), user: { id: user.id, email: user.email, fullName: user.full_name, tenantId: user.tenant_id, permissions: user.permissions } };
  });

  app.post('/api/v1/auth/mfa/recovery/rotate', { preHandler: [auth], config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = z.object({ code: z.string().regex(/^\\d{6}$/) }).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Kode autentikator harus enam digit.' });
    const result = await pool.query("SELECT id,email,mfa_secret_encrypted,mfa_last_counter FROM asuransi.users WHERE id=$1 AND tenant_id=$2 AND status='active' AND mfa_enabled=true", [request.user.userId, request.user.tenantId]);
    const user = result.rows[0];
    if (!user || !user.mfa_secret_encrypted) return reply.code(409).send({ error: 'MFA_NOT_ENABLED', message: 'MFA harus aktif sebelum membuat kode pemulihan.' });
    let secret;
    try { secret = decryptMfaSecret(user.mfa_secret_encrypted); } catch { return reply.code(503).send({ error: 'MFA_CONFIGURATION_ERROR', message: 'Konfigurasi MFA tidak tersedia.' }); }
    const previous = user.mfa_last_counter === null ? -1 : Number(user.mfa_last_counter);
    const counter = matchingTotpCounter(secret, input.data.code, { afterCounter: previous });
    if (counter === null) {
      await pool.query("INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,outcome) VALUES($1,$2,'auth.mfa.recovery_rotation_failed','user',$2,$3,'denied')", [request.user.tenantId, user.id, request.id]);
      return reply.code(401).send({ error: 'MFA_CODE_INVALID', message: 'Kode autentikator salah, kedaluwarsa, atau sudah digunakan.' });
    }
    const updated = await pool.query('UPDATE asuransi.users SET mfa_last_counter=$3 WHERE id=$1 AND tenant_id=$2 AND mfa_last_counter IS NOT DISTINCT FROM $4 AND mfa_enabled=true', [user.id, request.user.tenantId, counter, user.mfa_last_counter]);
    if (updated.rowCount !== 1) return reply.code(401).send({ error: 'MFA_CODE_REPLAYED', message: 'Kode autentikator sudah digunakan.' });
    const plainCodes = Array.from({ length: 10 }, generateRecoveryCode);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM asuransi.user_mfa_recovery_codes WHERE tenant_id=$1 AND user_id=$2', [request.user.tenantId, user.id]);
      for (const code of plainCodes) {
        const hash = await argon2.hash(code, { type: argon2.argon2id });
        await client.query('INSERT INTO asuransi.user_mfa_recovery_codes(tenant_id,user_id,code_hash) VALUES($1,$2,$3)', [request.user.tenantId, user.id, hash]);
      }
      await client.query('INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,outcome) VALUES($1,$2,\'auth.mfa.recovery_codes_rotated\',\'user\',$2,$3,\'success\')', [request.user.tenantId, user.id, request.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error({ err: error, userId: user.id }, 'MFA recovery code rotation failed');
      return reply.code(500).send({ error: 'MFA_RECOVERY_ROTATION_FAILED', message: 'Kode pemulihan tidak dapat diperbarui.' });
    } finally { client.release(); }
    return { codes: plainCodes, count: plainCodes.length, message: 'Simpan kode pemulihan ini sekarang. Kode hanya ditampilkan sekali dan kode lama sudah dicabut.' };
  });
}
