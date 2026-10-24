import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import argon2 from 'argon2';
import pg from 'pg';
import { z } from 'zod';
import { registerOperations } from './operations.mjs';
import { registerScenarioOperations } from './scenarios.mjs';
import { registerIntelligencePersistence } from './intelligence-persistence.mjs';
import { createAuthGuard } from './auth-guard.mjs';
import { registerClientOperations } from './clients.mjs';
import { findLoginPrincipal } from './login-principal.mjs';
import { encryptMfaSecret, decryptMfaSecret } from './mfa-crypto.mjs';
import { generateTotpSecret, matchingTotpCounter } from './totp.mjs';
import { registerMfaRecoveryRoutes } from './mfa-recovery.mjs';
import { requiresMandatoryMfa } from './mfa-policy.mjs';

const { Pool } = pg;
const required = ['DATABASE_URL','AUTH_ACCESS_TOKEN_SECRET'];
for (const key of required) if (!process.env[key]) throw new Error('Missing required environment variable: '+key);
if (process.env.AUTH_ACCESS_TOKEN_SECRET.length < 32) throw new Error('AUTH_ACCESS_TOKEN_SECRET must be at least 32 characters.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: true }, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.authorization','req.headers.cookie','req.body.password','res.headers["set-cookie"]'] }, bodyLimit: 1024 * 1024, requestIdHeader: 'x-request-id', genReqId: () => crypto.randomUUID() });
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, { origin: (process.env.APP_ORIGIN || 'http://localhost:5173').split(',').map(x=>x.trim()), credentials: true });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(jwt, { secret: process.env.AUTH_ACCESS_TOKEN_SECRET, sign: { expiresIn: '10m', iss: 'asuransi-inteligen-os', aud: 'asuransi-api' }, verify: { allowedIss: 'asuransi-inteligen-os', allowedAud: 'asuransi-api' } });
app.addHook('onClose', async () => pool.end());
app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error, requestId: request.id }, 'request failed');
  const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
  reply.code(status).send({ error: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR', message: status === 500 ? 'Terjadi kesalahan internal.' : error.message, requestId: request.id });
});
const auth = createAuthGuard({ pool });
function permit(permission) { return async (request, reply) => { if (!request.user?.permissions?.includes(permission) && !request.user?.permissions?.includes('*')) return reply.code(403).send({error:'FORBIDDEN',message:'Anda tidak memiliki izin untuk tindakan ini.'}); }; }
app.get('/api/health', async (_request, reply) => {
  try {
    await pool.query('SELECT 1');
    return { status:'ok', service:'asuransi-inteligen-api', version:'0.1.0', database:'connected', time:new Date().toISOString() };
  } catch (error) {
    app.log.error({ err:error }, 'health database check failed');
    return reply.code(503).send({ status:'degraded', service:'asuransi-inteligen-api', database:'unavailable', time:new Date().toISOString() });
  }
});
app.post('/api/v1/auth/login', { config:{ rateLimit:{max:8,timeWindow:'1 minute'} } }, async (request, reply) => {
  const input=z.object({email:z.string().email().max(254),password:z.string().min(1).max(200)}).safeParse(request.body);
  if(!input.success) return reply.code(400).send({error:'INVALID_INPUT',message:'Email atau password tidak valid.'});
  const result=await findLoginPrincipal(pool,input.data.email);
  const user=result.rows.length===1?result.rows[0]:null;
  if(!user||user.status!=='active'||user.tenant_status!=='active'||!user.password_hash||!(await argon2.verify(user.password_hash,input.data.password).catch(()=>false))) {
    await pool.query("INSERT INTO asuransi.audit_logs(action,resource_type,request_id,outcome,metadata) VALUES('auth.login.failed','user',$1,'denied',$2)",[request.id,JSON.stringify({emailDomain:input.data.email.split('@')[1]||''})]);
    return reply.code(401).send({error:'INVALID_CREDENTIALS',message:'Email atau password salah.'});
  }
  if (requiresMandatoryMfa(user) && !user.mfa_enabled) {
    const enrollmentToken=app.jwt.sign({userId:user.id,tenantId:user.tenant_id,email:user.email,purpose:'mfa_enrollment_required'},{expiresIn:'10m'});
    await pool.query("INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,outcome) VALUES($1,$2,'auth.mfa.required_enrollment_issued','user',$2,$3,'pending')",[user.tenant_id,user.id,request.id]);
    return reply.code(202).send({mfaEnrollmentRequired:true,enrollmentToken,expiresIn:600});
  }
  if (user.mfa_enabled) {
    if (!user.mfa_secret_encrypted) {
      request.log.error({ userId:user.id }, 'MFA enabled but encrypted secret is missing');
      return reply.code(503).send({error:'MFA_CONFIGURATION_ERROR',message:'Konfigurasi MFA akun belum lengkap. Hubungi administrator.'});
    }
    const challengeToken=app.jwt.sign({userId:user.id,tenantId:user.tenant_id,email:user.email,purpose:'mfa_challenge'},{expiresIn:'3m'});
    await pool.query("INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,outcome) VALUES($1,$2,'auth.mfa.challenge_issued','user',$2,$3,'pending')",[user.tenant_id,user.id,request.id]);
    return reply.code(202).send({mfaRequired:true,challengeToken,expiresIn:180});
  }
  return issueAccessToken(user, request, reply);
});

async function issueAccessToken(user, request, reply) {
  const token=app.jwt.sign({userId:user.id,tenantId:user.tenant_id,email:user.email,permissions:user.permissions});
  await pool.query('UPDATE asuransi.users SET last_login_at=now() WHERE id=$1',[user.id]);
  await pool.query('INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id) VALUES($1,$2,$3,$4,$5,$6)',[user.tenant_id,user.id,'auth.login','user',user.id,request.id]);
  return {accessToken:token,tokenType:'Bearer',expiresIn:600,user:{id:user.id,email:user.email,fullName:user.full_name,tenantId:user.tenant_id,permissions:user.permissions}};
}

app.post('/api/v1/auth/mfa/verify', { config:{ rateLimit:{max:8,timeWindow:'1 minute'} } }, async (request, reply) => {
  const input=z.object({challengeToken:z.string().min(20).max(4096),code:z.string().regex(/^\d{6}$/)}).safeParse(request.body);
  if(!input.success) return reply.code(400).send({error:'INVALID_INPUT',message:'Kode MFA tidak valid.'});
  let challenge;
  try { challenge=app.jwt.verify(input.data.challengeToken); } catch { return reply.code(401).send({error:'MFA_CHALLENGE_INVALID',message:'Tantangan MFA tidak valid atau telah kedaluwarsa.'}); }
  if(challenge.purpose!=='mfa_challenge'||!challenge.userId||!challenge.tenantId||!challenge.email) return reply.code(401).send({error:'MFA_CHALLENGE_INVALID',message:'Tantangan MFA tidak valid.'});
  const result=await findLoginPrincipal(pool,challenge.email);
  const user=result.rows.length===1?result.rows[0]:null;
  if(!user||user.id!==challenge.userId||user.tenant_id!==challenge.tenantId||user.status!=='active'||user.tenant_status!=='active'||!user.mfa_enabled||!user.mfa_secret_encrypted) {
    return reply.code(401).send({error:'MFA_CHALLENGE_INVALID',message:'Tantangan MFA tidak valid.'});
  }
  let secret;
  try { secret=decryptMfaSecret(user.mfa_secret_encrypted); } catch (error) {
    request.log.error({err:error,userId:user.id},'MFA secret decryption failed');
    return reply.code(503).send({error:'MFA_CONFIGURATION_ERROR',message:'Konfigurasi MFA tidak tersedia.'});
  }
  const previousCounter=user.mfa_last_counter===null? -1 : Number(user.mfa_last_counter);
  const counter=matchingTotpCounter(secret,input.data.code,{afterCounter:previousCounter});
  if(counter===null) {
    await pool.query("INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,outcome) VALUES($1,$2,'auth.mfa.challenge_failed','user',$2,$3,'denied')",[user.tenant_id,user.id,request.id]);
    return reply.code(401).send({error:'MFA_CODE_INVALID',message:'Kode MFA salah, kedaluwarsa, atau sudah digunakan.'});
  }
  const updated=await pool.query('UPDATE asuransi.users SET mfa_last_counter=$3 WHERE id=$1 AND tenant_id=$2 AND mfa_last_counter IS NOT DISTINCT FROM $4 AND mfa_enabled=true',[user.id,user.tenant_id,counter,user.mfa_last_counter]);
  if(updated.rowCount!==1) return reply.code(401).send({error:'MFA_CODE_REPLAYED',message:'Kode MFA sudah digunakan. Masukkan kode terbaru.'});
  await pool.query("INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,outcome) VALUES($1,$2,'auth.mfa.challenge_succeeded','user',$2,$3,'success')",[user.tenant_id,user.id,request.id]);
  return issueAccessToken(user,request,reply);
});

app.post('/api/v1/auth/mfa/enroll/start',{preHandler:[auth],config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(request,reply)=>{
  const key=process.env.MFA_ENCRYPTION_KEY;
  if(!key) return reply.code(503).send({error:'MFA_CONFIGURATION_ERROR',message:'Kunci enkripsi MFA belum dikonfigurasi.'});
  const result=await pool.query('SELECT id,email,mfa_enabled FROM asuransi.users WHERE id=$1 AND tenant_id=$2 AND status=\'active\'',[request.user.userId,request.user.tenantId]);
  const user=result.rows[0];
  if(!user) return reply.code(401).send({error:'UNAUTHORIZED',message:'Akun tidak aktif.'});
  if(user.mfa_enabled) return reply.code(409).send({error:'MFA_ALREADY_ENABLED',message:'MFA sudah aktif pada akun ini.'});
  const secret=generateTotpSecret();
  const encrypted=encryptMfaSecret(secret,key);
  await pool.query('UPDATE asuransi.users SET mfa_pending_secret_encrypted=$3 WHERE id=$1 AND tenant_id=$2',[user.id,request.user.tenantId,encrypted]);
  const issuer='INSURANCE INTELIGENT OS';
  const label=encodeURIComponent(issuer+':'+user.email);
  const otpauthUrl='otpauth://totp/'+label+'?secret='+secret+'&issuer='+encodeURIComponent(issuer)+'&algorithm=SHA1&digits=6&period=30';
  await pool.query("INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,outcome) VALUES($1,$2,'auth.mfa.enrollment_started','user',$2,$3,'pending')",[request.user.tenantId,user.id,request.id]);
  return {secret,otpauthUrl,issuer,account:user.email,algorithm:'SHA1',digits:6,periodSeconds:30};
});

app.post('/api/v1/auth/mfa/enroll/confirm',{preHandler:[auth],config:{rateLimit:{max:8,timeWindow:'1 minute'}}},async(request,reply)=>{
  const input=z.object({code:z.string().regex(/^\d{6}$/)}).safeParse(request.body);
  if(!input.success) return reply.code(400).send({error:'INVALID_INPUT',message:'Kode MFA harus terdiri dari enam digit.'});
  const key=process.env.MFA_ENCRYPTION_KEY;
  if(!key) return reply.code(503).send({error:'MFA_CONFIGURATION_ERROR',message:'Kunci enkripsi MFA belum dikonfigurasi.'});
  const result=await pool.query('SELECT id,email,mfa_enabled,mfa_pending_secret_encrypted FROM asuransi.users WHERE id=$1 AND tenant_id=$2 AND status=\'active\'',[request.user.userId,request.user.tenantId]);
  const user=result.rows[0];
  if(!user) return reply.code(401).send({error:'UNAUTHORIZED',message:'Akun tidak aktif.'});
  if(user.mfa_enabled) return reply.code(409).send({error:'MFA_ALREADY_ENABLED',message:'MFA sudah aktif pada akun ini.'});
  if(!user.mfa_pending_secret_encrypted) return reply.code(409).send({error:'MFA_ENROLLMENT_NOT_STARTED',message:'Mulai pendaftaran MFA terlebih dahulu.'});
  let secret;
  try { secret=decryptMfaSecret(user.mfa_pending_secret_encrypted,key); } catch (error) {
    request.log.error({err:error,userId:user.id},'pending MFA secret decryption failed');
    return reply.code(503).send({error:'MFA_CONFIGURATION_ERROR',message:'Data pendaftaran MFA tidak dapat dibaca.'});
  }
  const counter=matchingTotpCounter(secret,input.data.code);
  if(counter===null) return reply.code(401).send({error:'MFA_CODE_INVALID',message:'Kode MFA salah atau kedaluwarsa.'});
  const encrypted=encryptMfaSecret(secret,key);
  const updated=await pool.query('UPDATE asuransi.users SET mfa_enabled=true,mfa_secret_encrypted=$3,mfa_pending_secret_encrypted=NULL,mfa_last_counter=$4,mfa_enrolled_at=now() WHERE id=$1 AND tenant_id=$2 AND mfa_enabled=false AND mfa_pending_secret_encrypted=$5',[user.id,request.user.tenantId,encrypted,counter,user.mfa_pending_secret_encrypted]);
  if(updated.rowCount!==1) return reply.code(409).send({error:'MFA_ENROLLMENT_CONFLICT',message:'Status pendaftaran berubah. Mulai ulang pendaftaran MFA.'});
  await pool.query("INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,outcome) VALUES($1,$2,'auth.mfa.enrollment_completed','user',$2,$3,'success')",[request.user.tenantId,user.id,request.id]);
  return {mfaEnabled:true, message:'MFA berhasil diaktifkan. Login berikutnya akan meminta kode autentikator.'};
});
// Privileged accounts cannot receive a normal access token until they complete MFA enrollment.
async function getRequiredEnrollmentPrincipal(request, reply, enrollmentToken) {
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

app.post('/api/v1/auth/mfa/required/enroll/start', { config:{ rateLimit:{max:4,timeWindow:'1 minute'} } }, async (request, reply) => {
  const input = z.object({ enrollmentToken: z.string().min(20).max(4096) }).safeParse(request.body);
  if (!input.success) return reply.code(400).send({ error:'INVALID_INPUT', message:'Tantangan pendaftaran MFA tidak valid.' });
  const user = await getRequiredEnrollmentPrincipal(request, reply, input.data.enrollmentToken);
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
  const user = await getRequiredEnrollmentPrincipal(request, reply, input.data.enrollmentToken);
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

app.get('/api/v1/me',{preHandler:[auth]},async request=>({user:{userId:request.user.userId,tenantId:request.user.tenantId,email:request.user.email,permissions:request.user.permissions}}));
await registerClientOperations(app, { pool, auth, permit });
await registerOperations(app, { pool, auth, permit });
await registerIntelligencePersistence(app, { pool, auth, permit });
await registerScenarioOperations(app, { pool, auth, permit });
await registerMfaRecoveryRoutes(app, { pool, auth });
app.setNotFoundHandler((request,reply)=>reply.code(404).send({error:'NOT_FOUND',requestId:request.id}));
export { app };

// Neon Functions invokes the app through Fastify.inject; standalone hosts keep the normal listener.
if (process.env.NEON_FUNCTION_RUNTIME !== '1') {
  const port=Number(process.env.API_PORT||8080);
  await app.listen({port,host:process.env.API_HOST||'0.0.0.0'});
}
