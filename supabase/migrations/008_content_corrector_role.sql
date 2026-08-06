-- LexiCoil · content_corrector role + append-only correction audit log

-- Extend admin roles
ALTER TABLE lc_admin_roles DROP CONSTRAINT IF EXISTS lc_admin_roles_role_check;
ALTER TABLE lc_admin_roles
  ADD CONSTRAINT lc_admin_roles_role_check
  CHECK (role IN ('admin', 'superadmin', 'content_corrector'));

-- Append-only audit trail (complements Blobs history[] on each correction)
CREATE TABLE IF NOT EXISTS lc_content_correction_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_id TEXT NOT NULL,
  actor_email   TEXT NOT NULL,
  actor_role    TEXT NOT NULL,
  action        TEXT NOT NULL,
  detail        JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cc_audit_correction ON lc_content_correction_audit(correction_id);
CREATE INDEX IF NOT EXISTS idx_cc_audit_created ON lc_content_correction_audit(created_at DESC);

ALTER TABLE lc_content_correction_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc_audit_no_client" ON lc_content_correction_audit USING (false);
