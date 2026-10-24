-- MFA enrollment state and replay prevention for TOTP.
ALTER TABLE asuransi.users
  ADD COLUMN IF NOT EXISTS mfa_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS mfa_pending_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS mfa_last_counter bigint,
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at timestamptz;
