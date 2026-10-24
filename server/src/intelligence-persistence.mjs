import { z } from 'zod';
import { runIntelligenceResearch } from './intelligence-orchestrator.mjs';

const toRow = f => ({
  title:f.title, url:f.url, summary:f.summary, published_at:f.publishedAt,
  source_id:f.sourceId, source_title:f.sourceTitle, source_url:f.sourceUrl,
  publisher:f.publisher, attribution:f.attribution, provider_record_id:f.providerRecordId,
  agent_id:f.agentId, retrieved_at:f.retrievedAt, verification_status:f.verificationStatus,
  confidence:f.confidence, event_type:f.eventType, location:f.location,
  latitude:Number.isFinite(f.latitude) && f.latitude >= -90 && f.latitude <= 90 ? f.latitude : null,
  longitude:Number.isFinite(f.longitude) && f.longitude >= -180 && f.longitude <= 180 ? f.longitude : null,
  magnitude:f.magnitude, event_date_label:f.eventDateLabel, event_time_label:f.eventTimeLabel, payload:f
});

export async function registerIntelligencePersistence(app, {pool,auth,permit,researchRunner=runIntelligenceResearch}) {
  app.post('/api/v1/intelligence/research/run', {preHandler:[auth,permit('intelligence:research')]}, async (request,reply) => {
    let result;
    try { result = await researchRunner(); }
    catch (error) {
      request.log.error({err:error,requestId:request.id},'intelligence research failed');
      return reply.code(503).send({error:'INTELLIGENCE_UNAVAILABLE',message:'Konfigurasi sumber belum valid atau layanan belum tersedia.',requestId:request.id});
    }
    const status = result.summary.configuredSources > 0 && result.summary.successfulSources === 0 ? 'failed'
      : result.summary.failedSources > 0 ? 'partial' : 'completed';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        'INSERT INTO asuransi.intelligence_research_runs(tenant_id,created_by,mode,generated_at,summary,source_results,status) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) RETURNING id',
        [request.user.tenantId,request.user.userId,result.mode,result.generatedAt,JSON.stringify(result.summary),JSON.stringify(result.sources),status]);
      const runId = inserted.rows[0].id;
      if (result.findings.length) {
        await client.query(
          `INSERT INTO asuransi.intelligence_findings
           (tenant_id,research_run_id,title,url,summary,published_at,source_id,source_title,source_url,publisher,attribution,provider_record_id,agent_id,retrieved_at,verification_status,confidence,event_type,location,latitude,longitude,magnitude,event_date_label,event_time_label,payload)
           SELECT $1,$2,x.title,x.url,x.summary,NULLIF(x.published_at,'')::timestamptz,x.source_id,x.source_title,x.source_url,x.publisher,x.attribution,x.provider_record_id,x.agent_id,x.retrieved_at::timestamptz,x.verification_status,x.confidence,x.event_type,x.location,x.latitude,x.longitude,x.magnitude,x.event_date_label,x.event_time_label,x.payload
           FROM jsonb_to_recordset($3::jsonb) AS x(title text,url text,summary text,published_at text,source_id text,source_title text,source_url text,publisher text,attribution text,provider_record_id text,agent_id text,retrieved_at text,verification_status text,confidence text,event_type text,location text,latitude double precision,longitude double precision,magnitude double precision,event_date_label text,event_time_label text,payload jsonb)`,
          [request.user.tenantId,runId,JSON.stringify(result.findings.map(toRow))]);
      }
      await client.query(
        'INSERT INTO asuransi.audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
        [request.user.tenantId,request.user.userId,'intelligence.research','intelligence_research_run',runId,request.id,status,JSON.stringify({configuredSources:result.summary.configuredSources,successfulSources:result.summary.successfulSources,persistedFindings:result.findings.length})]);
      await client.query('COMMIT');
      return reply.code(201).send({data:{...result,runId,persistedFindings:result.findings.length,persistenceStatus:'saved'},notice:'Temuan tersimpan per tenant tetapi tetap unverified; bukan keputusan asuransi otomatis.'});
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error({err:error,requestId:request.id},'intelligence research persistence failed');
      return reply.code(503).send({error:'INTELLIGENCE_PERSISTENCE_UNAVAILABLE',message:'Penyimpanan hasil tidak berhasil; hasil tidak dinyatakan tersimpan.',requestId:request.id});
    } finally { client.release(); }
  });

  app.get('/api/v1/intelligence/research/runs', {preHandler:[auth,permit('intelligence:read')]}, async request => {
    const q=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0),status:z.enum(['completed','partial','failed']).optional()}).parse(request.query);
    const result=await pool.query('SELECT id,mode,generated_at,summary,status,created_at FROM asuransi.intelligence_research_runs WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC LIMIT $3 OFFSET $4',[request.user.tenantId,q.status||null,q.limit,q.offset]);
    return {data:result.rows,limit:q.limit,offset:q.offset};
  });

  app.get('/api/v1/intelligence/findings', {preHandler:[auth,permit('intelligence:read')]}, async request => {
    const q=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0),status:z.enum(['unverified','pending_review','verified','rejected']).optional(),runId:z.string().uuid().optional()}).parse(request.query);
    const result=await pool.query('SELECT id,research_run_id,title,url,summary,published_at,source_id,source_title,source_url,publisher,attribution,provider_record_id,agent_id,retrieved_at,verification_status,confidence,event_type,location,latitude,longitude,magnitude,event_date_label,event_time_label,created_at FROM asuransi.intelligence_findings WHERE tenant_id=$1 AND ($2::text IS NULL OR verification_status=$2) AND ($3::uuid IS NULL OR research_run_id=$3) ORDER BY created_at DESC LIMIT $4 OFFSET $5',[request.user.tenantId,q.status||null,q.runId||null,q.limit,q.offset]);
    return {data:result.rows,limit:q.limit,offset:q.offset};
  });
}
