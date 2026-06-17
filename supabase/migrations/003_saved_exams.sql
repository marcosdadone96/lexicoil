-- Saved exams (full JSON per entry) + client tombstone deletes via sync.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS lc_user_saved_exams (
  user_id    UUID NOT NULL,
  saved_id   TEXT NOT NULL,
  lang       TEXT,
  level      TEXT,
  topic      TEXT,
  mode       TEXT,
  status     TEXT,
  source     TEXT,
  goal_id    TEXT,
  exam_data  JSONB NOT NULL,
  saved_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, saved_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_exams_user ON lc_user_saved_exams(user_id);

ALTER TABLE lc_user_saved_exams ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lc_user_saved_exams'
      AND policyname = 'saved_exams_no_client'
  ) THEN
    CREATE POLICY "saved_exams_no_client" ON lc_user_saved_exams USING (false);
  END IF;
END $$;
