import { z } from 'zod';

const scenarioTypes = ['underwriting','pricing','claims','fraud_triage','portfolio_stress','renewal','regulatory_change','liquidity_stress'];
const scenarioInput = z.object({
  scenarioType: z.enum(scenarioTypes),
  title: z.string().trim().min(3).max(180),
  decisionQuestion: z.string().trim().min(8).max(4000),
  horizonDays: z.number().int().min(1).max(3650).default(365),
  assumptions: z.record(z.string(), z.unknown()).default({}),
  inputSnapshot: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(z.object({
    label: z.string().trim().min(1).max(250),
    sourceUrl: z.string().url().max(2000).optional(),
    verificationStatus: z.enum(['verified','unverified','pending_review']).default('pending_review'),
    effectiveDate: z.string().date().optional()
  })).max(100).default([])
});

function assessInputCompleteness(type, input) {
  const required = {
    underwriting: ['productId','coveragePeriod','exposureUnits','sumInsured','policyWordingVersion'],
    pricing: ['productId','exposurePeriod','earnedExposure','frequencyModelVersion','severityModelVersion','expenseBasis'],
    claims: ['policyId','lossDate','reportedPeril','policyWordingVersion','evidenceInventory','deductible','coverageLimit'],
    fraud_triage: ['approvedFeatures','comparisonCohort','dataWindow','featureVersion'],
    portfolio_stress: ['portfolioSnapshotDate','geographicExposure','sumInsured','hazardDatasetVersion','reinsuranceTermsVersion'],
    renewal: ['renewalCohort','earnedPremium','claimsExperienceWindow','expenseBasis'],
    regulatory_change: ['verifiedSourceId','instrumentVersion','effectiveDate','affectedProductIds'],
    liquidity_stress: ['cashFlowBaseline','claimsPaymentSchedule','reinsuranceRecoveryTerms']
  }[type];
  const missing = required.filter(key => input[key] === undefined || input[key] === null || input[key] === '');
  return { required, missing, readyForQuantitativeModel: missing.length === 0 };
}

export async function registerScenarioOperations(app, { pool, auth, permit }) {
  app.post('/api/v1/scenarios', { preHandler:[auth,permit('scenarios:create')] }, async (request, reply) => {
    const parsed = scenarioInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error:'INVALID_INPUT', details:parsed.error.flatten() });
    const data = parsed.data;
    const completeness = assessInputCompleteness(data.scenarioType, data.inputSnapshot);
    const result = await pool.query(
      `INSERT INTO asuransi.scenario_runs
       (tenant_id, created_by, scenario_type, title, decision_question, horizon_days, assumptions, input_snapshot, evidence, input_completeness, status, requires_human_approval)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',true)
       RETURNING id,scenario_type,title,decision_question,horizon_days,assumptions,input_snapshot,evidence,input_completeness,status,requires_human_approval,created_at`,
      [request.user.tenantId,request.user.userId,data.scenarioType,data.title,data.decisionQuestion,data.horizonDays,JSON.stringify(data.assumptions),JSON.stringify(data.inputSnapshot),JSON.stringify(data.evidence),JSON.stringify(completeness)]
    );
    return reply.code(201).send({ data:result.rows[0], notice:'Simulasi tersimpan sebagai draft. Tidak ada prediksi finansial yang dihitung oleh endpoint ini; mesin aktuaria tervalidasi dan persetujuan manusia tetap diperlukan.', completeness });
  });

  app.get('/api/v1/scenarios', { preHandler:[auth,permit('scenarios:read')] }, async request => {
    const q = z.object({ limit:z.coerce.number().int().min(1).max(100).default(25), offset:z.coerce.number().int().min(0).default(0), status:z.enum(['draft','in_review','approved','rejected','archived']).optional() }).parse(request.query);
    const result = await pool.query(
      'SELECT id,scenario_type,title,decision_question,horizon_days,input_completeness,status,requires_human_approval,created_at,updated_at FROM asuransi.scenario_runs WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC LIMIT $3 OFFSET $4',
      [request.user.tenantId,q.status||null,q.limit,q.offset]);
    return { data:result.rows, limit:q.limit, offset:q.offset };
  });

  app.get('/api/v1/scenarios/:id', { preHandler:[auth,permit('scenarios:read')] }, async (request, reply) => {
    const parsed = z.string().uuid().safeParse(request.params.id);
    if (!parsed.success) return reply.code(400).send({error:'INVALID_ID'});
    const result = await pool.query('SELECT * FROM asuransi.scenario_runs WHERE tenant_id=$1 AND id=$2',[request.user.tenantId,parsed.data]);
    if (!result.rowCount) return reply.code(404).send({error:'NOT_FOUND'});
    return {data:result.rows[0]};
  });
}
