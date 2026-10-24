-- One-time recovery codes for MFA. Store only Argon2 hashes; plaintext is returned once.
CREATE TABLE IF NOT EXISTS asuransi.user_mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asuransi.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES asuransi.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  CONSTRAINT user_mfa_recovery_codes_hash_unique UNIQUE (user_id, code_hash)
);
CREATE INDEX IF NOT EXISTS user_mfa_recovery_codes_available_idx
  ON asuransi.user_mfa_recovery_codes (tenant_id, user_id, created_at)
  WHERE used_at IS NULL;
