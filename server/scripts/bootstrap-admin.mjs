import 'dotenv/config';
import pg from 'pg';
import argon2 from 'argon2';

const { Pool } = pg;
const required=['DATABASE_URL','ADMIN_EMAIL','ADMIN_NAME','ADMIN_PASSWORD','TENANT_CODE','TENANT_NAME'];
for(const key of required) if(!process.env[key]) throw new Error('Missing environment variable: '+key);
if(process.env.ADMIN_PASSWORD.length<15) throw new Error('ADMIN_PASSWORD must be at least 15 characters.');
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_EMAIL)) throw new Error('ADMIN_EMAIL is invalid.');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},max:1});
const permissions=['*'];
const passwordHash=await argon2.hash(process.env.ADMIN_PASSWORD,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
const client=await pool.connect();
try{
 await client.query('BEGIN');
 let tenant=await client.query('SELECT id FROM asuransi.tenants WHERE code=$1',[process.env.TENANT_CODE]);
 if(!tenant.rowCount) tenant=await client.query('INSERT INTO asuransi.tenants(code,name,status) VALUES($1,$2,$3) RETURNING id',[process.env.TENANT_CODE,process.env.TENANT_NAME,'active']);
 const tenantId=tenant.rows[0].id;
 const exists=await client.query('SELECT id FROM asuransi.users WHERE tenant_id=$1 AND lower(email)=lower($2)',[tenantId,process.env.ADMIN_EMAIL]);
 if(exists.rowCount) throw new Error('User already exists for this tenant; refusing to reset or overwrite credentials.');
 let role=await client.query('SELECT id FROM asuransi.roles WHERE tenant_id=$1 AND code=$2',[tenantId,'system-admin']);
 if(!role.rowCount) role=await client.query('INSERT INTO asuransi.roles(tenant_id,code,name,permissions) VALUES($1,$2,$3,$4::jsonb) RETURNING id',[tenantId,'system-admin','System Administrator',JSON.stringify(permissions)]);
 const user=await client.query('INSERT INTO asuransi.users(tenant_id,email,full_name,password_hash,status,mfa_enabled) VALUES($1,lower($2),$3,$4,$5,false) RETURNING id',[tenantId,process.env.ADMIN_EMAIL,process.env.ADMIN_NAME,passwordHash,'active']);
 await client.query('INSERT INTO asuransi.user_roles(user_id,role_id) VALUES($1,$2)',[user.rows[0].id,role.rows[0].id]);
 await client.query('INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[tenantId,user.rows[0].id,'bootstrap.admin.created','user',user.rows[0].id,JSON.stringify({role:'system-admin',method:'one-time-script'})]);
 await client.query('COMMIT');
 process.stdout.write('Bootstrap admin created. Remove ADMIN_PASSWORD from the environment immediately. The privileged account must complete MFA enrollment before receiving a normal access token; keep the API private until MFA_ENCRYPTION_KEY and all production controls are configured and validated.\n');
}catch(error){await client.query('ROLLBACK');throw error}finally{client.release();await pool.end()}
