-- AI exam generation audit log (server + client inserts; admin-only reads)

CREATE TABLE IF NOT EXISTS lc_ai_generations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID,
  email           TEXT,
  lang            TEXT,
  level           TEXT,
  source          TEXT,
  topic           TEXT,
  vocab_words     TEXT[] DEFAULT '{}',
  coverage        FLOAT,
  valid           BOOLEAN,
  model           TEXT,
  input_tokens    INT,
  output_tokens   INT,
  exam_data       JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_gen_email ON lc_ai_generations(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_gen_lang_level ON lc_ai_generations(lang, level, created_at DESC);

ALTER TABLE lc_ai_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_gen_no_client" ON lc_ai_generations USING (false);
