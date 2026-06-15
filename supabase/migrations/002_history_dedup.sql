-- Dedup exam history rows per user (sync upsert by stable client entry id).
-- Idempotent: safe to re-run.
-- Note: PostgREST upsert needs UNIQUE constraint (see 004 if only partial index was applied).

ALTER TABLE lc_user_history ADD COLUMN IF NOT EXISTS entry_key TEXT;

DROP INDEX IF EXISTS idx_history_user_entrykey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lc_user_history_user_entry_key'
  ) THEN
    ALTER TABLE lc_user_history
      ADD CONSTRAINT lc_user_history_user_entry_key UNIQUE (user_id, entry_key);
  END IF;
END $$;
