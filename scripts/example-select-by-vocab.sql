-- ═══════════════════════════════════════════════════════════════════════════
-- LexiCoil · Example query — select reusable part by user vocabulary
-- DOCUMENTATION ONLY — not wired to exam-part.js (runtime still uses Blobs).
--
-- Goal: given slot (lang, level, module, teil), user lemma list, and user_id,
-- return parts ranked by how many requested lemmas they cover, excluding seen.
-- ═══════════════════════════════════════════════════════════════════════════

-- Parameters (bind from application / Supabase RPC):
--   :p_lang      text     e.g. 'de'
--   :p_level     text     e.g. 'B1'
--   :p_module    text     e.g. 'lesen'
--   :p_teil      int      e.g. 3
--   :p_user_id   uuid     authenticated user
--   :p_lemmas    text[]   e.g. ARRAY['gebühr','frist','ausleihen']

WITH want AS (
  SELECT DISTINCT lower(trim(lemma)) AS lemma
  FROM unnest(:p_lemmas::text[]) AS lemma
  WHERE trim(lemma) <> ''
),
eligible AS (
  SELECT p.id,
         p.payload,
         p.vocab,
         p.source,
         p.created_at
  FROM parts p
  WHERE p.lang = :p_lang
    AND p.level = :p_level
    AND p.module = :p_module
    AND p.teil = :p_teil
    AND p.quality_ok = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM seen_parts sp
      WHERE sp.user_id = :p_user_id
        AND sp.part_id = p.id
    )
),
scored AS (
  SELECT e.*,
         COUNT(pl.lemma)::int AS covered_count
  FROM eligible e
  LEFT JOIN part_lemmas pl
    ON pl.part_id = e.id
   AND pl.lemma IN (SELECT lemma FROM want)
  GROUP BY e.id, e.payload, e.vocab, e.source, e.created_at
)
SELECT id,
       payload,
       vocab,
       covered_count,
       cardinality(vocab) AS vocab_size,
       source,
       created_at
FROM scored
ORDER BY covered_count DESC,
         created_at ASC
LIMIT 10;

-- ── Record that a part was served (call after picking one row) ───────────────
-- INSERT INTO seen_parts (user_id, part_id)
-- VALUES (:p_user_id, :picked_part_id)
-- ON CONFLICT (user_id, part_id) DO UPDATE SET seen_at = NOW();
