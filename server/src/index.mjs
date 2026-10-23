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
const clientSchema = z.object({ client_type:z.enum(['individual','company']).default('individual'), full_name:z.string().trim().min(2).max(200), legal_name:z.string().max(200).optional().nullable(), email:z.string().email().max(254).optional().nullable(), phone:z.string().max(40).optional().nullable(), status:z.enum(['prospect','active','inactive','needs_follow_up','pending_verification']).default('prospect'), owner_user_id:z.string().uuid().optional().nullable(), notes:z.string().max(4000).optional().nullable(), consent_status:z.enum(['pending','granted','withdrawn']).default('pending') });
async function audit(client, request, actor, action, resource, resourceId, metadata={}) {
  await client.query('INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,ip_hash,user_agent,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[actor.tenantId,actor.userId,action,resource,String(resourceId||''),request.id,null,request.headers['user-agent']||null,JSON.stringify(metadata)]);
}
async function auth(request, reply) {
  try {
    await request.jwtVerify();
    if (!request.user?.userId || !request.user?.tenantId || !Array.isArray(request.user?.permissions)) throw new Error('Invalid token claims');
  } catch { return reply.code(401).send({error:'UNAUTHORIZED',message:'Sesi tidak valid atau telah kedaluwarsa.'}); }
}
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
  const result=await pool.query(`SELECT u.id,u.tenant_id,u.email,u.full_name,u.password_hash,u.status,COALESCE(jsonb_agg(DISTINCT perm.value) FILTER (WHERE perm.value IS NOT NULL),'[]'::jsonb) AS permissions
    FROM asuransi.users u LEFT JOIN asuransi.user_roles ur ON ur.user_id=u.id LEFT JOIN asuransi.roles r ON r.id=ur.role_id LEFT JOIN LATERAL jsonb_array_elements_text(r.permissions) perm(value) ON true
    WHERE lower(u.email)=lower($1) GROUP BY u.id LIMIT 2`,[input.data.email]);
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
app.get('/api/v1/clients',{preHandler:[auth,permit('clients:read')]},async request=>{
 const q=z.object({search:z.string().max(150).optional(),limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)}).parse(request.query);
 const search=q.search?('%'+q.search.replace(/[\\%_]/g,'\\$&')+'%'):null;
 const result=await pool.query(`SELECT id,client_code,client_type,full_name,legal_name,email,phone,status,consent_status,owner_user_id,created_at,updated_at FROM asuransi.clients WHERE tenant_id=$1 AND deleted_at IS NULL AND ($2::text IS NULL OR full_name ILIKE $2 OR client_code ILIKE $2) ORDER BY created_at DESC LIMIT $3 OFFSET $4`,[request.user.tenantId,search,q.limit,q.offset]);
 return {data:result.rows,limit:q.limit,offset:q.offset};
});
app.post('/api/v1/clients',{preHandler:[auth,permit('clients:create')]},async(request,reply)=>{
 const parsed=clientSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT',details:parsed.error.flatten()});
 const client=await pool.connect();
 try{await client.query('BEGIN');const code='NAS-'+Date.now().toString(36).toUpperCase();const d=parsed.data;
 const r=await client.query(`INSERT INTO asuransi.clients(tenant_id,client_code,client_type,full_name,legal_name,email,phone,status,consent_status,owner_user_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,client_code,client_type,full_name,legal_name,email,phone,status,consent_status,owner_user_id,created_at,updated_at`,[request.user.tenantId,code,d.client_type,d.full_name,d.legal_name||null,d.email||null,d.phone||null,d.status,d.consent_status,d.owner_user_id||null,d.notes||null]);
 await audit(client,request,{tenantId:request.user.tenantId,userId:request.user.userId},'client.create','client',r.rows[0].id);await client.query('COMMIT');return reply.code(201).send({data:r.rows[0]});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});
app.put('/api/v1/clients/:id',{preHandler:[auth,permit('clients:update')]},async(request,reply)=>{
 const id=z.string().uuid().safeParse(request.params.id),parsed=clientSchema.partial().safeParse(request.body);if(!id.success||!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
 const allowed=parsed.data;if(!Object.keys(allowed).length)return reply.code(400).send({error:'EMPTY_UPDATE'});
 const map={client_type:'client_type',full_name:'full_name',legal_name:'legal_name',email:'email',phone:'phone',status:'status',owner_user_id:'owner_user_id',notes:'notes',consent_status:'consent_status'};
 const sets=[],values=[request.user.tenantId,id.data];for(const [k,v] of Object.entries(allowed)){sets.push(map[k]+'=$'+(values.length+1));values.push(v??null)}sets.push('updated_at=now()');
 const client=await pool.connect();try{await client.query('BEGIN');const r=await client.query(`UPDATE asuransi.clients SET ${sets.join(',')} WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id,client_code,client_type,full_name,legal_name,email,phone,status,consent_status,owner_user_id,updated_at`,values);if(!r.rowCount){await client.query('ROLLBACK');return reply.code(404).send({error:'NOT_FOUND'})}await audit(client,request,{tenantId:request.user.tenantId,userId:request.user.userId},'client.update','client',id.data,{fields:Object.keys(allowed)});await client.query('COMMIT');return {data:r.rows[0]}}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});
app.delete('/api/v1/clients/:id',{preHandler:[auth,permit('clients:delete')]},async(request,reply)=>{
 const id=z.string().uuid().safeParse(request.params.id);if(!id.success)return reply.code(400).send({error:'INVALID_ID'});
 const client=await pool.connect();try{await client.query('BEGIN');const r=await client.query('UPDATE asuransi.clients SET deleted_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id',[request.user.tenantId,id.data]);if(!r.rowCount){await client.query('ROLLBACK');return reply.code(404).send({error:'NOT_FOUND'})}await audit(client,request,{tenantId:request.user.tenantId,userId:request.user.userId},'client.soft_delete','client',id.data);await client.query('COMMIT');return reply.code(204).send()}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});
await registerOperations(app, { pool, auth, permit });
await registerScenarioOperations(app, { pool, auth, permit });
app.setNotFoundHandler((request,reply)=>reply.code(404).send({error:'NOT_FOUND',requestId:request.id}));
export { app };

// Neon Functions invokes the app through Fastify.inject; standalone hosts keep the normal listener.
if (process.env.NEON_FUNCTION_RUNTIME !== '1') {
  const port=Number(process.env.API_PORT||8080);
  await app.listen({port,host:process.env.API_HOST||'0.0.0.0'});
}
