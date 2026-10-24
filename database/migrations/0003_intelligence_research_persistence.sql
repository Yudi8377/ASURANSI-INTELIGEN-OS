-- Persisted, tenant-scoped intelligence research runs and findings.
-- Findings are unverified by default; persistence does not imply source verification.
CREATE TABLE IF NOT EXISTS asuransi.intelligence_research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asuransi.tenants(id),
  created_by uuid NOT NULL REFERENCES asuransi.users(id),
  mode text NOT NULL,
  generated_at timestamptz NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','partial','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intelligence_research_runs_tenant_created_idx
  ON asuransi.intelligence_research_runs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS asuransi.intelligence_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asuransi.tenants(id),
  research_run_id uuid NOT NULL REFERENCES asuransi.intelligence_research_runs(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  url text,
  summary text NOT NULL DEFAULT '',
  published_at timestamptz,
  source_id text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  publisher text NOT NULL,
  attribution text NOT NULL DEFAULT '',
  provider_record_id text,
  agent_id text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','pending_review','verified','rejected')),
  confidence text NOT NULL DEFAULT 'not_assessed',
  event_type text,
  location text,
  latitude double precision,
  longitude double precision,
  magnitude double precision,
  event_date_label text,
  event_time_label text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE INDEX IF NOT EXISTS intelligence_findings_tenant_created_idx
  ON asuransi.intelligence_findings(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_findings_run_idx
  ON asuransi.intelligence_findings(tenant_id, research_run_id);
CREATE INDEX IF NOT EXISTS intelligence_findings_tenant_status_idx
  ON asuransi.intelligence_findings(tenant_id, verification_status, created_at DESC);
