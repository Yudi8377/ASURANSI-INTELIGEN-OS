-- Tenant-scoped scenario drafts and traceable decision-support metadata.
CREATE TABLE IF NOT EXISTS asuransi.scenario_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asuransi.tenants(id),
  created_by uuid NOT NULL REFERENCES asuransi.users(id),
  scenario_type text NOT NULL CHECK (scenario_type IN ('underwriting','pricing','claims','fraud_triage','portfolio_stress','renewal','regulatory_change','liquidity_stress')),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 180),
  decision_question text NOT NULL CHECK (length(decision_question) BETWEEN 8 AND 4000),
  horizon_days integer NOT NULL CHECK (horizon_days BETWEEN 1 AND 3650),
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_completeness jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','rejected','archived')),
  requires_human_approval boolean NOT NULL DEFAULT true,
  approved_by uuid REFERENCES asuransi.users(id),
  approved_at timestamptz,
  outcome_summary jsonb,
  model_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  knowledge_pack_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status <> 'approved') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS scenario_runs_tenant_created_idx ON asuransi.scenario_runs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scenario_runs_tenant_status_idx ON asuransi.scenario_runs(tenant_id, status);
