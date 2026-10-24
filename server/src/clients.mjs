import { z } from 'zod';

const clientSchema = z.object({
  client_type:z.enum(['individual','company']),
  full_name:z.string().trim().min(2).max(200),
  legal_name:z.string().max(200).optional().nullable(),
  email:z.string().email().max(254).optional().nullable(),
  phone:z.string().max(40).optional().nullable(),
  status:z.enum(['prospect','active','inactive','needs_follow_up','pending_verification']),
  owner_user_id:z.string().uuid().optional().nullable(),
  notes:z.string().max(4000).optional().nullable(),
  consent_status:z.enum(['pending','granted','withdrawn'])
});

const clientCreateSchema = clientSchema.extend({
  client_type:z.enum(['individual','company']).default('individual'),
  status:z.enum(['prospect','active','inactive','needs_follow_up','pending_verification']).default('prospect'),
  consent_status:z.enum(['pending','granted','withdrawn']).default('pending')
});

async function audit(client, request, actor, action, resource, resourceId, metadata={}) {
  await client.query(
    'INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,ip_hash,user_agent,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [actor.tenantId,actor.userId,action,resource,String(resourceId||''),request.id,null,request.headers['user-agent']||null,JSON.stringify(metadata)]
  );
}

async function ownerBelongsToTenant(pool, ownerUserId, tenantId) {
  if (!ownerUserId) return true;
  const result = await pool.query('SELECT 1 FROM asuransi.users WHERE id=$1 AND tenant_id=$2 AND status <> $3 LIMIT 1',[ownerUserId,tenantId,'disabled']);
  return result.rowCount === 1;
}

export async function registerClientOperations(app, { pool, auth, permit }) {
  app.get('/api/v1/clients',{preHandler:[auth,permit('clients:read')]},async request=>{
    const q=z.object({search:z.string().max(150).optional(),limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)}).parse(request.query);
    const search=q.search?('%'+q.search.replace(/[\\%_]/g,'\\$&')+'%'):null;
    const result=await pool.query('SELECT id,client_code,client_type,full_name,legal_name,email,phone,status,consent_status,owner_user_id,created_at,updated_at FROM asuransi.clients WHERE tenant_id=$1 AND deleted_at IS NULL AND ($2::text IS NULL OR full_name ILIKE $2 OR client_code ILIKE $2) ORDER BY created_at DESC LIMIT $3 OFFSET $4',[request.user.tenantId,search,q.limit,q.offset]);
    return {data:result.rows,limit:q.limit,offset:q.offset};
  });
  app.post('/api/v1/clients',{preHandler:[auth,permit('clients:create')]},async(request,reply)=>{
    const parsed=clientCreateSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT',details:parsed.error.flatten()});
    if(parsed.data.owner_user_id&&!(await ownerBelongsToTenant(pool,parsed.data.owner_user_id,request.user.tenantId)) )return reply.code(400).send({error:'INVALID_OWNER_USER',message:'Pemilik data harus merupakan pengguna dalam organisasi yang sama.'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const code='NAS-'+Date.now().toString(36).toUpperCase(),d=parsed.data;
      const r=await client.query('INSERT INTO asuransi.clients(tenant_id,client_code,client_type,full_name,legal_name,email,phone,status,consent_status,owner_user_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,client_code,client_type,full_name,legal_name,email,phone,status,consent_status,owner_user_id,created_at,updated_at',[request.user.tenantId,code,d.client_type,d.full_name,d.legal_name||null,d.email||null,d.phone||null,d.status,d.consent_status,d.owner_user_id||null,d.notes||null]);
      await audit(client,request,{tenantId:request.user.tenantId,userId:request.user.userId},'client.create','client',r.rows[0].id);
      await client.query('COMMIT');
      return reply.code(201).send({data:r.rows[0]});
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  app.put('/api/v1/clients/:id',{preHandler:[auth,permit('clients:update')]},async(request,reply)=>{
    const id=z.string().uuid().safeParse(request.params.id),parsed=clientSchema.partial().safeParse(request.body);
    if(!id.success||!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const allowed=parsed.data;
    if(!Object.keys(allowed).length)return reply.code(400).send({error:'EMPTY_UPDATE'});
    if(Object.hasOwn(allowed,'owner_user_id')&&allowed.owner_user_id&&!(await ownerBelongsToTenant(pool,allowed.owner_user_id,request.user.tenantId)))return reply.code(400).send({error:'INVALID_OWNER_USER',message:'Pemilik data harus merupakan pengguna dalam organisasi yang sama.'});
    const map={client_type:'client_type',full_name:'full_name',legal_name:'legal_name',email:'email',phone:'phone',status:'status',owner_user_id:'owner_user_id',notes:'notes',consent_status:'consent_status'};
    const sets=[],values=[request.user.tenantId,id.data];
    for(const [k,v] of Object.entries(allowed)){sets.push(map[k]+'=$'+(values.length+1));values.push(v??null);}
    sets.push('updated_at=now()');
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const r=await client.query('UPDATE asuransi.clients SET '+sets.join(',')+' WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id,client_code,client_type,full_name,legal_name,email,phone,status,consent_status,owner_user_id,updated_at',values);
      if(!r.rowCount){await client.query('ROLLBACK');return reply.code(404).send({error:'NOT_FOUND'});}
      await audit(client,request,{tenantId:request.user.tenantId,userId:request.user.userId},'client.update','client',id.data,{fields:Object.keys(allowed)});
      await client.query('COMMIT');
      return {data:r.rows[0]};
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  app.delete('/api/v1/clients/:id',{preHandler:[auth,permit('clients:delete')]},async(request,reply)=>{
    const id=z.string().uuid().safeParse(request.params.id);
    if(!id.success)return reply.code(400).send({error:'INVALID_ID'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const r=await client.query('UPDATE asuransi.clients SET deleted_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id',[request.user.tenantId,id.data]);
      if(!r.rowCount){await client.query('ROLLBACK');return reply.code(404).send({error:'NOT_FOUND'});}
      await audit(client,request,{tenantId:request.user.tenantId,userId:request.user.userId},'client.soft_delete','client',id.data);
      await client.query('COMMIT');
      return reply.code(204).send();
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
}
