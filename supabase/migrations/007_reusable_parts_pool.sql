-- ═══════════════════════════════════════════════════════════════════════════
-- LexiCoil · Migration 007 — Reusable exam parts pool (Postgres / future runtime)
-- NOT active in production yet — exam-part.js still reads Netlify Blobs.
-- Load via: node scripts/load-bank-to-postgres.mjs --lang de --level B1
-- ═══════════════════════════════════════════════════════════════════════════

-- Full reusable Teil payloads (passage + questions + segments, etc.)
CREATE TABLE IF NOT EXISTS parts (
  id              TEXT PRIMARY KEY,
  lang            TEXT NOT NULL,
  level           TEXT NOT NULL,
  module          TEXT NOT NULL,
  teil            INT,
  payload         JSONB NOT NULL,
  vocab           TEXT[] DEFAULT '{}',
  schema_version  INT DEFAULT 1,
  quality_ok      BOOLEAN DEFAULT FALSE,
  source          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parts_lang_level_module_teil
  ON parts (lang, level, module, teil);

CREATE INDEX IF NOT EXISTS idx_parts_module_teil
  ON parts (module, teil);

COMMENT ON TABLE parts IS
  'Reusable exam Teile pool (future Postgres backend). payload = full part JSON.';

-- Inverted index: lemma → part (vocab-based selection)
CREATE TABLE IF NOT EXISTS part_lemmas (
  part_id  TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  lemma    TEXT NOT NULL,
  PRIMARY KEY (part_id, lemma)
);

CREATE INDEX IF NOT EXISTS idx_part_lemmas_lemma ON part_lemmas (lemma);

COMMENT ON TABLE part_lemmas IS
  'Denormalized lemmas per part for fast vocab overlap queries.';

-- Per-user dedup: parts already served in an exam
CREATE TABLE IF NOT EXISTS seen_parts (
  user_id   UUID NOT NULL,
  part_id   TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  seen_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, part_id)
);

CREATE INDEX IF NOT EXISTS idx_seen_parts_user_id ON seen_parts (user_id);
CREATE INDEX IF NOT EXISTS idx_seen_parts_part_id ON seen_parts (part_id);

COMMENT ON TABLE seen_parts IS
  'Tracks parts already shown to a user (exam assembly dedup).';
