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
import { createAuthGuard } from './auth-guard.mjs';
import { registerClientOperations } from './clients.mjs';
import { findLoginPrincipal } from './login-principal.mjs';

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
  if(!user||user.status!=='active'||!user.password_hash||!(await argon2.verify(user.password_hash,input.data.password).catch(()=>false))) {
    await pool.query("INSERT INTO asuransi.audit_logs(action,resource_type,request_id,outcome,metadata) VALUES('auth.login.failed','user',$1,'denied',$2)",[request.id,JSON.stringify({emailDomain:input.data.email.split('@')[1]||''})]);
    return reply.code(401).send({error:'INVALID_CREDENTIALS',message:'Email atau password salah.'});
  }
  const token=app.jwt.sign({userId:user.id,tenantId:user.tenant_id,email:user.email,permissions:user.permissions});
  await pool.query('UPDATE asuransi.users SET last_login_at=now() WHERE id=$1',[user.id]);
  await pool.query('INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id) VALUES($1,$2,$3,$4,$5,$6)',[user.tenant_id,user.id,'auth.login','user',user.id,request.id]);
  return {accessToken:token,tokenType:'Bearer',expiresIn:600,user:{id:user.id,email:user.email,fullName:user.full_name,tenantId:user.tenant_id,permissions:user.permissions}};
});
app.get('/api/v1/me',{preHandler:[auth]},async request=>({user:{userId:request.user.userId,tenantId:request.user.tenantId,email:request.user.email,permissions:request.user.permissions}}));
await registerClientOperations(app, { pool, auth, permit });
await registerOperations(app, { pool, auth, permit });
await registerScenarioOperations(app, { pool, auth, permit });
app.setNotFoundHandler((request,reply)=>reply.code(404).send({error:'NOT_FOUND',requestId:request.id}));
export { app };

// Neon Functions invokes the app through Fastify.inject; standalone hosts keep the normal listener.
if (process.env.NEON_FUNCTION_RUNTIME !== '1') {
  const port=Number(process.env.API_PORT||8080);
  await app.listen({port,host:process.env.API_HOST||'0.0.0.0'});
}
