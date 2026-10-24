import { z } from 'zod';
import { encryptMfaSecret, decryptMfaSecret } from './mfa-crypto.mjs';
import { generateTotpSecret, matchingTotpCounter } from './totp.mjs';
import { findLoginPrincipal } from './login-principal.mjs';
import { requiresMandatoryMfa } from './mfa-policy.mjs';

async function getRequiredEnrollmentPrincipal(app, pool, reply, enrollmentToken) {
  let challenge;
  try { challenge = app.jwt.verify(enrollmentToken); } catch {
    reply.code(401).send({ error: 'MFA_ENROLLMENT_CHALLENGE_INVALID', message: 'Tantangan pendaftaran MFA tidak valid atau telah kedaluwarsa.' });
    return null;
  }
  if (challenge.purpose !== 'mfa_enrollment_required' || !challenge.userId || !challenge.tenantId || !challenge.email) {
    reply.code(401).send({ error: 'MFA_ENROLLMENT_CHALLENGE_INVALID', message: 'Tantangan pendaftaran MFA tidak valid.' });
    return null;
  }
  const result = await findLoginPrincipal(pool, challenge.email);
  const user = result.rows.length === 1 ? result.rows[0] : null;
  if (!user || user.id !== challenge.userId || user.tenant_id !== challenge.tenantId ||
      user.status !== 'active' || user.tenant_status !== 'active' ||
      !requiresMandatoryMfa(user) || user.mfa_enabled) {
    reply.code(401).send({ error: 'MFA_ENROLLMENT_CHALLENGE_INVALID', message: 'Tantangan pendaftaran MFA tidak valid.' });
    return null;
  }
  return user;
}

export async function registerRequiredMfaEnrollmentRoutes(app, { pool }) {
  app.post('/api/v1/auth/mfa/required/enroll/start', { config:{ rateLimit:{max:4,timeWindow:'1 minute'} } }, async (request, reply) => {
    const input = z.object({ enrollmentToken: z.string().min(20).max(4096) }).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error:'INVALID_INPUT', message:'Tantangan pendaftaran MFA tidak valid.' });
    const user = await getRequiredEnrollmentPrincipal(app, pool, reply, input.data.enrollmentToken);
    if (!user) return;
    const key = process.env.MFA_ENCRYPTION_KEY;
    if (!key) return reply.code(503).send({ error:'MFA_CONFIGURATION_ERROR', message:'Kunci enkripsi MFA belum dikonfigurasi.' });
    const secret = generateTotpSecret();
    const encrypted = encryptMfaSecret(secret, key);
    const staged = await pool.query("UPDATE asuransi.users SET mfa_pending_secret_encrypted=$3 WHERE id=$1 AND tenant_id=$2 AND status='active' AND mfa_enabled=false", [user.id, user.tenant_id, encrypted]);
    if (staged.rowCount !== 1) return reply.code(409).send({ error:'MFA_ENROLLMENT_CONFLICT', message:'Status akun berubah. Silakan login ulang.' });
    const issuer = 'INSURANCE INTELIGENT OS';
    const label = encodeURIComponent(issuer + ':' + user.email);
    const otpauthUrl = 'otpauth://totp/' + label + '?secret=' + secret + '&issuer=' + encodeURIComponent(issuer) + '&algorithm=SHA1&digits=6&period=30';
    await pool.query("INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,outcome) VALUES($1,$2,'auth.mfa.required_enrollment_started','user',$2,$3,'pending')", [user.tenant_id, user.id, request.id]);
    return { secret, otpauthUrl, issuer, account:user.email, algorithm:'SHA1', digits:6, periodSeconds:30, enrollmentTokenExpiresIn:600 };
  });

  app.post('/api/v1/auth/mfa/required/enroll/confirm', { config:{ rateLimit:{max:6,timeWindow:'1 minute'} } }, async (request, reply) => {
    const input = z.object({ enrollmentToken:z.string().min(20).max(4096), code:z.string().regex(/^\\d{6}$/) }).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error:'INVALID_INPUT', message:'Tantangan atau kode MFA tidak valid.' });
    const user = await getRequiredEnrollmentPrincipal(app, pool, reply, input.data.enrollmentToken);
    if (!user) return;
    const key = process.env.MFA_ENCRYPTION_KEY;
    if (!key) return reply.code(503).send({ error:'MFA_CONFIGURATION_ERROR', message:'Kunci enkripsi MFA belum dikonfigurasi.' });
    if (!user.mfa_pending_secret_encrypted) return reply.code(409).send({ error:'MFA_ENROLLMENT_NOT_STARTED', message:'Mulai pendaftaran MFA terlebih dahulu.' });
    let secret;
    try { secret = decryptMfaSecret(user.mfa_pending_secret_encrypted, key); } catch (error) {
      request.log.error({ err:error, userId:user.id }, 'required MFA enrollment secret decryption failed');
      return reply.code(503).send({ error:'MFA_CONFIGURATION_ERROR', message:'Data pendaftaran MFA tidak dapat dibaca.' });
    }
    const counter = matchingTotpCounter(secret, input.data.code);
    if (counter === null) return reply.code(401).send({ error:'MFA_CODE_INVALID', message:'Kode MFA salah atau kedaluwarsa.' });
    const encrypted = encryptMfaSecret(secret, key);
    const updated = await pool.query("UPDATE asuransi.users SET mfa_enabled=true,mfa_secret_encrypted=$3,mfa_pending_secret_encrypted=NULL,mfa_last_counter=$4,mfa_enrolled_at=now() WHERE id=$1 AND tenant_id=$2 AND status='active' AND mfa_enabled=false AND mfa_pending_secret_encrypted=$5", [user.id, user.tenant_id, encrypted, counter, user.mfa_pending_secret_encrypted]);
    if (updated.rowCount !== 1) return reply.code(409).send({ error:'MFA_ENROLLMENT_CONFLICT', message:'Status pendaftaran berubah. Mulai ulang pendaftaran MFA.' });
    await pool.query("INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,outcome) VALUES($1,$2,'auth.mfa.required_enrollment_completed','user',$2,$3,'success')", [user.tenant_id, user.id, request.id]);
    return { mfaEnabled:true, accessTokenIssued:false, message:'MFA administrator berhasil diaktifkan. Silakan login ulang dengan password dan kode autentikator.' };
  });
}
