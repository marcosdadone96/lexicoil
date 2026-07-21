# MIGRATION REPORT — 13_COVERAGE_LISTENING_LEARNING

**Status:** Complete  
**Date:** 2026-06-12  
**Scope:** Full level coverage, task fidelity, weakness/mastery, listening (5 sub-tasks)

---

## 13a — Cobertura A1/A2/C2

### Qué cambió
- **`scripts/seed-coverage-levels.mjs`** — generates validated starter banks for all 18 lang×level pairs (`de`/`en`/`es` × A1–C2). Preserves richer original banks (B1/B2/C1) via skip/repair logic.
- **12 new question banks** under `library/{lang}/{level}/questions.json` for previously missing levels.
- **12 new blueprint files** via `scripts/seed-blueprints-coverage.mjs`.
- **`js/library/libraryCatalog.js`** — canonical catalog; `selectableLevels()` drives UI.
- **`LibraryLoader.js`**, **`blueprintResolver.js`**, **`ExamBlueprint.js`** — full 18-pair index.
- **UI sync:** `dashboardUi.js` goal wizard + `examConfig.js` profile level grid show only library-backed levels; tile labels show actual range (e.g. `A1–C2 · official format`).
- **`scripts/validate-library.mjs`** — validates all 18 pairs.

### Decisiones
- Starter banks are minimal (7–8 questions) — enough for CefrGate smoke + assembly; Strategy B curation can enrich later.
- Original `seed-library.mjs` banks kept for B1/B2/C1 where richer content existed.

### Tests
- `node scripts/validate-library.mjs` — 18/18 OK
- `scripts/test-coverage-listening-learning.mjs` — bank + blueprint existence

---

## 13b — Fidelidad de tareas

### Qué cambió
- **Goethe blueprints** (`goethe_B1.json`, `goethe_B2.json`, all levels) — **3 Schreiben + 3 Sprechen** parts (2 each for A1/A2).
- **DELE blueprints** — added `sprechen` module + multi-part schreiben/sprechen.
- **Cambridge blueprints** — retain official slot types: open cloze, word formation, sentence transformation, speaker matching (`dialogue_speakers`).
- **`js/engine/validation/blueprintFidelity.js`** — `checkBlueprintFidelity()` enforces module/part counts.
- **`ExamBlueprint.js`** — `buildSprechenPart()`, stub schreiben/sprechen when bank has no writing/speaking questions.
- **`ExamBuilder.js`** — emits `sprechenParts`; default skills include `sprechen`.
- Coverage banks include **`gap_fill`**, **`matching`**, **`grammatik`** items for Cambridge/Goethe task types.

### Decisiones
- Writing/speaking parts use blueprint instructions as stubs when bank lacks dedicated questions (official tasks are open-ended).
- Cambridge writing module id remains `writing` in blueprint JSON; assembler maps via existing routes.

### Tests
- `checkBlueprintFidelity` on goethe_B1/B2, cambridge_B2, dele_B2 — pass

---

## 13c — Weakness / Mastery tracking

### Qué cambió
- **`AnalyticsStore.js`** extended:
  - Per-tag **streak**, **mastery levels** (`weak` / `developing` / `solid`)
  - **Module-level** stats (`getWeakModules`)
  - **Topic tag** weakness (`getWeakTopicTags`)
  - **`getMasterySummary()`** for coach/dashboard
  - Scores listening segments via `horenParts.segments`
- Persistence remains **localStorage** (`lc_mastery`). Durable cross-device analytics deferred to phase 09 Postgres migration.

### Decisiones
- Weak threshold: &lt;70% accuracy after ≥2 attempts (unchanged).
- Topic tags tracked separately from grammar tags.

### Tests
- API surface verified in `test-coverage-listening-learning.mjs`

---

## 13d — Exámenes personalizados por debilidad

### Qué cambió
- **`js/library/TaggingGate.js`** — validates `grammarTags`/`topicTags` format before weakness assembly; `gateBank()` requires ≥4 trusted questions.
- **`WeaknessEngine.js`** — runs TaggingGate; combines grammar + topic weak tags; passes `topicTags` to `ExamBuilder`.
- **`ExamBuilder.js`** — weakness filter activates when grammar **or** topic tags present.

### Decisiones
- Tagging gate blocks weakness exams on untagged bank items (fail loud, not silent fallback).
- AI generation still available via existing cascade when library path fails (Strategy B unchanged).

### Tests
- TaggingGate on sample de A1 bank — pass
- WeaknessEngine references TaggingGate — verified

---

## 13e — Listening multivoz

### Qué cambió
- **`js/bootstrap/listeningScript.js`** — parses `Speaker: line` transcripts into segments; assigns per-speaker TTS voices.
- **`js/bootstrap/audio.js`** — `playMultiVoiceSegments()` sequential multi-voice playback (cached TTS → Web Speech fallback).
- **`examRunner.js`** — `playListeningPassage()` uses multi-voice path when `ListeningScript.isMultiVoice(text)`.
- Bank listening passages use **dialogue-format** transcripts (Moderator/Guest lines).

### Decisiones
- Multi-voice uses distinct neural voice IDs per speaker; falls back to browser TTS per segment if cache miss.
- Pro-gated live TTS generation unchanged; multi-voice benefits from existing cache hits.

### Tests
- `ListeningScript.parseSegments` — 3 segments from sample dialogue
- Voice assignment + examRunner wiring — verified

---

## Resultados de tests

```bash
node scripts/validate-library.mjs          # 18/18 banks
node scripts/test-coverage-listening-learning.mjs  # all sub-tasks
node scripts/test-blueprint.mjs            # assembly (existing)
```

Wired into `npm run test:engine`.

## Verificación manual

- [ ] Goal wizard shows A1–C2 for each language; only library-backed levels selectable
- [ ] Generate exam at de A1 — assembles from bank (no empty-level toast)
- [ ] Complete exam — weak grammar tags appear in coach after 2+ attempts
- [ ] Weakness exam targets tagged areas
- [ ] Listening play on dialogue transcript — hear alternating voices (or distinct speech segments)

## Riesgos / deuda

- Starter banks are **thin** vs official exam volume — pool curation (phase 07) still needed for production quality.
- CEFR vocab lists partial → CefrGate may skip hard coverage on some passages.
- Analytics localStorage-only until phase 09 DB.
- Multi-voice TTS quality depends on provider/cache; no recorded human audio.

## Feature flags tocados

- None (Strategy B / CefrGate flags unchanged)
