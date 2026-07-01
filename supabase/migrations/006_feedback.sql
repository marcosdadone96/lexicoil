-- In-app user feedback (insert via Netlify function + service role only)

CREATE TABLE IF NOT EXISTS feedback (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_id     TEXT,
  email       TEXT,
  message     TEXT NOT NULL,
  page        TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Block all client access (anon + authenticated). Service role bypasses RLS.
CREATE POLICY feedback_no_client ON feedback
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE feedback IS 'User suggestions from in-app feedback form; server inserts only.';
