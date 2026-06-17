-- ═══════════════════════════════════════════════════════════════════════════
-- LexiCoil · Supabase Migration 001 — Initial Schema
-- Run once in the Supabase SQL editor (or via CLI: supabase db push)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Content tables (shared / global) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lc_passages (
  id          TEXT PRIMARY KEY,
  lang        TEXT NOT NULL CHECK (lang IN ('de','en','es')),
  level       TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
  module      TEXT NOT NULL,
  title       TEXT,
  body        TEXT NOT NULL,
  vocab       TEXT[]    DEFAULT '{}',
  topic_tags  TEXT[]    DEFAULT '{}',
  word_count  INT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passages_lang_level ON lc_passages(lang, level);
CREATE INDEX IF NOT EXISTS idx_passages_module ON lc_passages(module);

CREATE TABLE IF NOT EXISTS lc_questions (
  id               TEXT PRIMARY KEY,
  lang             TEXT NOT NULL CHECK (lang IN ('de','en','es')),
  level            TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
  module           TEXT NOT NULL,
  teil             INT,
  type             TEXT NOT NULL,
  question         TEXT,
  correct          TEXT,
  explanation      TEXT,
  passage_id       TEXT REFERENCES lc_passages(id) ON DELETE SET NULL,
  options          JSONB     DEFAULT '[]',
  grammar_tags     TEXT[]    DEFAULT '{}',
  topic_tags       TEXT[]    DEFAULT '{}',
  vocabulary_tags  TEXT[]    DEFAULT '{}',
  difficulty       INT       DEFAULT 5,
  skills           TEXT[]    DEFAULT '{}',
  exam_type        TEXT,
  use_count        INT       DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_lang_level ON lc_questions(lang, level);
CREATE INDEX IF NOT EXISTS idx_questions_module_teil ON lc_questions(module, teil);
CREATE INDEX IF NOT EXISTS idx_questions_passage ON lc_questions(passage_id);

-- ── User profiles ────────────────────────────────────────────────────────────
-- id: Supabase auth UUID (for OAuth users) OR sha256-derived UUID (for custom-auth users).
-- Both are stable per email. See emailToUserId() in netlify/functions/lib/authLib.js.

CREATE TABLE IF NOT EXISTS lc_user_profiles (
  id                  UUID PRIMARY KEY,
  email               TEXT UNIQUE NOT NULL,
  plan                TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('guest','free','pro')),
  plan_activated_at   TIMESTAMPTZ,
  stripe_customer_id  TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── BurnedRegistry — per-user lifetime content dedup ────────────────────────

CREATE TABLE IF NOT EXISTS lc_user_burned (
  user_id     UUID  NOT NULL,
  content_id  TEXT  NOT NULL,   -- question id or passage hash
  burned_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_burned_user ON lc_user_burned(user_id);

-- ── Flashcards / vocabulary deck ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lc_user_flashcards (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID  NOT NULL,
  lang            TEXT  NOT NULL,
  level           TEXT  NOT NULL,
  word            TEXT  NOT NULL,
  translation     TEXT,
  context         TEXT,
  word_type       TEXT,   -- noun, verb, adjective, phrase, …
  grammar_tags    TEXT[]  DEFAULT '{}',
  source_exam_id  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, lang, word)
);

CREATE INDEX IF NOT EXISTS idx_flashcards_user_lang ON lc_user_flashcards(user_id, lang);

-- ── Exam history ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lc_user_history (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID  NOT NULL,
  lang             TEXT  NOT NULL,
  level            TEXT  NOT NULL,
  exam_source      TEXT,   -- 'ai' | 'library' | 'pool' | 'personal'
  score            FLOAT,
  total_questions  INT,
  correct_answers  INT,
  completed_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_user ON lc_user_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_user_lang ON lc_user_history(user_id, lang, level);

-- ── User preferences ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lc_user_preferences (
  user_id           UUID PRIMARY KEY,
  translation_langs TEXT[]  DEFAULT ARRAY['en'],  -- languages to show translations in
  tts_voices        JSONB   DEFAULT '{}',          -- {de: 'voice_name', es: '…'}
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Quota ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lc_user_quota (
  user_id     UUID  NOT NULL,
  month       TEXT  NOT NULL,   -- 'YYYY-MM'
  used        INT   DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, month)
);

-- ── Pool exams (shared curated exams) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lc_pool_exams (
  id              TEXT PRIMARY KEY,
  lang            TEXT    NOT NULL,
  level           TEXT    NOT NULL,
  topic           TEXT,
  exam_data       JSONB   NOT NULL,
  source          TEXT    DEFAULT 'ai',   -- 'ai' | 'seed' | 'library'
  coverage_ratio  FLOAT,
  is_valid        BOOLEAN DEFAULT TRUE,
  contributor_id  UUID,                   -- user who contributed (nullable for seeds)
  served_count    INT     DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pool_lang_level ON lc_pool_exams(lang, level) WHERE is_valid = TRUE;

-- ── Admin roles ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lc_admin_roles (
  user_id    UUID  PRIMARY KEY,
  email      TEXT  UNIQUE NOT NULL,
  role       TEXT  DEFAULT 'admin' CHECK (role IN ('admin','superadmin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Content tables: public read (anyone can read questions/passages)
ALTER TABLE lc_passages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_pool_exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passages_public_read"   ON lc_passages   FOR SELECT USING (true);
CREATE POLICY "questions_public_read"  ON lc_questions  FOR SELECT USING (true);
CREATE POLICY "pool_public_read"       ON lc_pool_exams FOR SELECT USING (is_valid = true);

-- User tables: accessed exclusively via service role key from Netlify Functions.
-- Client-side access is blocked — all mutations go through the backend API.
ALTER TABLE lc_user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_user_burned      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_user_flashcards  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_user_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_user_quota       ENABLE ROW LEVEL SECURITY;

-- Block all direct client access; service role bypasses RLS automatically.
CREATE POLICY "profiles_no_client"     ON lc_user_profiles    USING (false);
CREATE POLICY "burned_no_client"       ON lc_user_burned      USING (false);
CREATE POLICY "flashcards_no_client"   ON lc_user_flashcards  USING (false);
CREATE POLICY "history_no_client"      ON lc_user_history     USING (false);
CREATE POLICY "preferences_no_client"  ON lc_user_preferences USING (false);
CREATE POLICY "quota_no_client"        ON lc_user_quota       USING (false);

-- Admin table: only service role can touch it.
ALTER TABLE lc_admin_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_no_client_access" ON lc_admin_roles USING (false);

-- ── Trigger: auto-update updated_at ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION lc_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON lc_user_profiles
  FOR EACH ROW EXECUTE FUNCTION lc_set_updated_at();

CREATE TRIGGER trg_preferences_updated_at
  BEFORE UPDATE ON lc_user_preferences
  FOR EACH ROW EXECUTE FUNCTION lc_set_updated_at();
