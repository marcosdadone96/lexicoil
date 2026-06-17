-- Fix history upsert: PostgREST onConflict needs a UNIQUE constraint, not a partial index.
-- Idempotent: safe to re-run.

DROP INDEX IF EXISTS idx_history_user_entrykey;

-- Remove duplicate (user_id, entry_key) rows before adding constraint (keep latest).
DELETE FROM lc_user_history a
USING lc_user_history b
WHERE a.user_id = b.user_id
  AND a.entry_key IS NOT NULL
  AND a.entry_key = b.entry_key
  AND a.completed_at < b.completed_at;

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
