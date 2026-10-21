import { z } from 'zod';

export async function registerOperations(app, { pool, auth, permit }) {
  app.get('/api/v1/policies', { preHandler:[auth,permit('policies:read')] }, async request => {
    const q=z.object({search:z.string().max(150).optional(),limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)}).parse(request.query);
    const term=q.search ? '%'+q.search+'%' : null;
    const result=await pool.query(
      'SELECT p.id,p.policy_no,p.status,p.start_date,p.end_date,p.premium,p.sum_insured,p.currency,c.full_name AS client_name,pr.name AS product_name FROM asuransi.policies p JOIN asuransi.clients c ON c.id=p.client_id AND c.tenant_id=p.tenant_id LEFT JOIN asuransi.products pr ON pr.id=p.product_id WHERE p.tenant_id=$1 AND p.deleted_at IS NULL AND ($2::text IS NULL OR p.policy_no ILIKE $2 OR c.full_name ILIKE $2) ORDER BY p.created_at DESC LIMIT $3 OFFSET $4',
      [request.user.tenantId,term,q.limit,q.offset]);
    return {data:result.rows,limit:q.limit,offset:q.offset};
  });

  app.get('/api/v1/claims', { preHandler:[auth,permit('claims:read')] }, async request => {
    const q=z.object({status:z.string().max(50).optional(),limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)}).parse(request.query);
    const result=await pool.query(
      'SELECT cl.id,cl.claim_no,cl.claim_type,cl.description,cl.claimed_amount,cl.approved_amount,cl.currency,cl.status,cl.reported_at,cl.human_review_required,cl.risk_flags,p.policy_no,c.full_name AS claimant_name FROM asuransi.claims cl JOIN asuransi.policies p ON p.id=cl.policy_id AND p.tenant_id=cl.tenant_id JOIN asuransi.clients c ON c.id=cl.claimant_client_id AND c.tenant_id=cl.tenant_id WHERE cl.tenant_id=$1 AND cl.deleted_at IS NULL AND ($2::text IS NULL OR cl.status=$2) ORDER BY cl.reported_at DESC LIMIT $3 OFFSET $4',
      [request.user.tenantId,q.status||null,q.limit,q.offset]);
    return {data:result.rows,limit:q.limit,offset:q.offset};
  });

  app.post('/api/v1/ai/tasks', { preHandler:[auth,permit('ai:task:create')] }, async (request,reply) => {
    const parsed=z.object({taskType:z.enum(['policy_summary','claim_triage','compliance_check','crm_followup_draft','accounting_draft','tax_checklist','hr_summary','security_review','knowledge_research']),input:z.record(z.string(),z.unknown()).default({})}).safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT',details:parsed.error.flatten()});
    const result=await pool.query(
      'INSERT INTO asuransi.ai_tasks(tenant_id,created_by,task_type,input,status,requires_human_approval) VALUES($1,$2,$3,$4,$5,true) RETURNING id,task_type,status,requires_human_approval,created_at',
      [request.user.tenantId,request.user.userId,parsed.data.taskType,JSON.stringify(parsed.data.input),'queued']);
    return reply.code(202).send({data:result.rows[0],message:'Tugas dicatat. Eksekusi agent dan persetujuan belum diaktifkan oleh endpoint ini.'});
  });

  app.get('/api/v1/knowledge/sources', { preHandler:[auth,permit('knowledge:read')] }, async request => {
    const result=await pool.query(
      'SELECT source_key,title,publisher,source_url,jurisdiction,source_type,published_at,checked_at,version_label,content_sha256,status,created_at,updated_at FROM asuransi.knowledge_sources ORDER BY jurisdiction, publisher, title LIMIT 250');
    return {data:result.rows};
  });
}
