# Exam Tagging Extension — Technical Specification

**Project:** LexiCoil (`lexiloop`)  
**Date:** June 2026  
**Status:** Design only — no code changes  
**Goal:** Define exactly where `grammarTags`, `topicTags`, and `difficulty` must be added in the current exam JSON format so that **all existing exams remain valid** without modification.

---

## 1. Executive summary

LexiCoil exams are **monolithic JSON documents**, not normalized question rows. Questions live nested inside module parts (`lesenParts`, `horenParts`, etc.). There is **no separate questions table**.

To add grammar/topic/difficulty metadata without breaking compatibility:

| Rule | Requirement |
|------|-------------|
| **Optional only** | All three fields are optional everywhere. Absence = valid exam (today's behavior). |
| **Additive only** | Never rename or repurpose existing keys (`topic`, `level`, `type`, `correct`, …). |
| **Validator-safe** | `ExamValidator` ignores unknown keys; it only checks answer keys and renderable content. |
| **Normalize-safe** | Normalizers (`normalizeExam`, `normalizeSpanishExam`) must pass unknown keys through (spread/copy), not strip them. |
| **ID-based grammar** | `grammarTags` reference `knowledge/languages/{lang}.json` → `grammar[level][].id`, not free text. |
| **Taxonomy-based topics** | `topicTags` reference controlled vocabulary (domains/topics), distinct from human `topic` string. |

**Primary placement:** scorable **question-level** objects (`questions[]`, `items[]`, `segments[]` with options, `noteFields[]`, `gapfill.sentences[]`).  
**Secondary placement:** part-level and exam-level defaults for inheritance/fallback.

---

## 2. Current exam formats (all must keep working)

The codebase supports **five coexisting shapes**. Tagging must work across all of them.

### 2.1 Canonical production format (`goetheFormat: true`)

Used by: AI generation, pool, library (`data/exams/de_*.json`), saved exams (`lc_saved`).

```text
exam
├── topic, level, lang, goetheFormat
├── official?, modules?, vocabWords? (personal only)
├── lesenParts[]
│   └── part { teil, instruction, text?, items[], questions[], ads?, segments? }
├── horenParts[]
│   └── part { teil, segments[], questions[], noteFields[], transcript? }
├── schreibenParts[]
│   └── part { aufgabe, task, fieldId, minWords?, modelAnswer? }
└── sprechenParts[]
    └── part { teil, situation, points[], fieldId, modelAnswer? }
```

**Scorable entities** (where `ExamValidator._walk` and `submitExam` score):

| Path | Object shape | Scoring key prefix |
|------|--------------|-------------------|
| `lesenParts[i].items[j]` | `{ id, question, options, correct }` | `lesen_{pi}_{id}` |
| `lesenParts[i].questions[j]` | `{ id, type, question, options, correct }` | `lesen_{pi}_{id}` |
| `horenParts[i].questions[j]` | same | `horen_{pi}_{id}` |
| `horenParts[i].segments[j]` | `{ id, question, options, correct }` | `horen_{pi}_{si}_{id}` |
| `horenParts[i].noteFields[j]` | `{ id, label, answer }` | DOM `note_{id}` |

Non-scorable: `schreibenParts`, `sprechenParts` (rubric/AI graded), passage `text`, `ads`, raw `transcript`.

### 2.2 Pre-normalize Cambridge / DELE chunk format

Used by: AI chunks before `normalizeCambridgeExam` / `normalizeSpanishExam`.

```text
exam
├── readingParts[] / listeningParts[] / writingParts[] / speakingParts[]
│   └── part { part, instruction, text?, questions[], segments[] }
```

After normalization → merged into `lesenParts` / `horenParts` / etc.  
**Tags on chunk objects must survive mapping** (see §5.3).

### 2.3 Demo simplified format (`data/demo/*.json`)

```text
exam
├── id, lang, level, topic, certificate, board
├── reading   { passage, markWord, question, options[] }
├── listening { transcript, question, options[] }
├── writing   { task, note? }
└── speaking  { task, prepNote? }
```

Demo validator (`scripts/validate-demo-content.mjs`) checks options only.  
Tags are **optional** and must not be added to required-field checks until a deliberate demo v2 pass.

### 2.4 Legacy flat format (still renderable)

```text
exam
├── lesen { text, questions[] }
├── horen { questions[] }
├── gapfill { sentences[] }
├── schreiben { task }
└── sprechen { points[] }
```

Still handled by `isExamRenderable`, `buildCorrection`, and `ExamValidator._walk`.

### 2.5 Pool wrapper (not inside exam JSON)

```text
blob entry
├── lang, level, topic          ← pool metadata (human topic)
└── exam { ...full exam... }    ← tagging goes inside exam, not entry root
```

Pool `topic` at entry level is **not** `topicTags`. Do not conflate them.

---

## 3. Relationship with existing fields

| Existing field | Meaning today | Relation to new fields |
|----------------|---------------|------------------------|
| `exam.topic` | Human-readable exam theme ("Umwelt und Nachhaltigkeit") | **Keep.** `topicTags` are normalized taxonomy slugs/IDs, not a replacement. |
| `exam.level` | CEFR level (A1–C2) | **Keep.** Exam-wide difficulty baseline; per-question `difficulty` refines within level. |
| `exam.lang` | Content language (`de` / `en` / `es`) | Used to resolve grammar ID namespace. |
| `question.type` | Task type (`multiple`, `richtig_falsch`, `match`, …) | **Unchanged.** Orthogonal to `grammarTags`. |
| `question.id` | Stable answer key in `S.answers` | **Unchanged.** Tags must not alter id scheme. |

**Naming collision avoidance:** do **not** use keys `topic`, `grammar`, `tags`, or `level` for new arrays. Use exactly:

- `grammarTags` (string[])
- `topicTags` (string[])
- `difficulty` (number | string — see §4.3)

---

## 4. Field definitions

### 4.1 `grammarTags`

**Type:** `string[]` (may be empty or omitted)

**Values:** IDs from canonical knowledge, e.g.:

```json
"g-de-b1-nebensatz"
"g-de-b1-passiv"
"en-b2-conditionals"
"es-b1-subjuntivo"
```

**Source of truth:** `knowledge/languages/{german|english|spanish}.json` → `grammar[CEFR][]`.id

**Rules:**

- Prefer **one primary** grammar tag per scorable question; multiple allowed for compound items.
- Never store grammar prose here (descriptions stay in knowledge JSON).
- Validator: **no validation** in phase 1 (optional soft check in scripts later).

### 4.2 `topicTags`

**Type:** `string[]` (may be empty or omitted)

**Values:** Controlled taxonomy slugs. Recommended sources:

| Source | Path | Example |
|--------|------|---------|
| Vocabulary domains | `knowledge/languages/*.json` → `vocabularyDomains[level][]` | `"Umwelt"`, `"Arbeit"` |
| Topic lists | `knowledge/languages/*.json` → `topics[level][]` | slugified: `"umwelt-nachhaltigkeit"` |
| Custom registry (future) | `knowledge/taxonomy/topics.json` | `"environment.sustainability"` |

**Rules:**

- Distinct from `exam.topic` (display/generation string).
- Exam-level `topicTags` = union/default for whole exam.
- Question-level `topicTags` = fine-grained content classification for analytics.

### 4.3 `difficulty`

**Type (recommended):** integer `1`–`5` within CEFR level

| Value | Meaning |
|-------|---------|
| 1 | Easiest items for this CEFR level |
| 3 | Typical / anchor |
| 5 | Hardest items for this CEFR level |

**Alternative (allowed):** string enum `"easy" | "medium" | "hard"` — but pick **one** convention per pipeline and document in generator prompts.

**Rules:**

- `exam.difficulty` = optional default for all scorable items in that exam.
- `part.difficulty` = optional default for all questions in that part.
- `question.difficulty` = overrides part/exam default.
- **Never replace** `exam.level` (CEFR). Difficulty is intra-level granularity only.

---

## 5. Exact placement map

### 5.1 Exam root (all formats that support it)

**File paths affected:** every full exam object in pool, library, AI output, `lc_saved`.

```json
{
  "topic": "Umwelt und Nachhaltigkeit",
  "level": "B1",
  "lang": "de",
  "goetheFormat": true,

  "topicTags": ["umwelt", "nachhaltigkeit"],
  "grammarTags": [],
  "difficulty": 3,

  "lesenParts": [ "..." ]
}
```

| Field | Required | Purpose |
|-------|----------|---------|
| `topicTags` | No | Exam-wide thematic classification |
| `grammarTags` | No | Rare at exam level; only if entire exam targets one structure |
| `difficulty` | No | Default intra-level difficulty for unscored items / fallback |

**Compatibility:** existing exams omit these keys → no change in behavior.

---

### 5.2 Module part level (canonical format)

Apply to each object in: `lesenParts[]`, `horenParts[]`, `schreibenParts[]`, `sprechenParts[]`  
(and pre-normalize `readingParts[]`, `listeningParts[]`, etc.)

```json
{
  "teil": 2,
  "instruction": "Lesen Sie den Text…",
  "topicTags": ["technologie"],
  "grammarTags": ["g-de-b1-relativ"],
  "difficulty": 3,
  "text": "...",
  "questions": [ "..." ]
}
```

| Module | Tags recommended | Notes |
|--------|------------------|-------|
| `lesenParts` / `readingParts` | `topicTags`, optional `grammarTags` | Grammar often per-question, not per passage |
| `horenParts` / `listeningParts` | `topicTags` | Listening grammar tags usually on segments |
| `schreibenParts` / `writingParts` | `topicTags`, `grammarTags` | Task-level grammar (e.g. formal email) |
| `sprechenParts` / `speakingParts` | `topicTags` | Situation topic, not MCQ grammar |

Part-level tags act as **defaults**: if a child question omits tags, analytics may inherit from parent part, then exam root.

---

### 5.3 Scorable question level (primary — highest priority)

This is the **mandatory target** for per-question analytics. Add tags to every object that `ExamValidator` scores.

#### A) `lesenParts[i].questions[j]` and `readingParts[i].questions[j]`

```json
{
  "id": "l7",
  "type": "multiple",
  "question": "Was bedeutet …?",
  "options": ["a) …", "b) …", "c) …"],
  "correct": "b",
  "grammarTags": ["g-de-b1-nebensatz"],
  "topicTags": ["umwelt"],
  "difficulty": 4
}
```

#### B) `lesenParts[i].items[j]` (signs, short texts, matching rows)

```json
{
  "id": "s3",
  "question": "Welches Schild passt?",
  "options": ["a) …", "b) …"],
  "correct": "a",
  "grammarTags": ["g-de-b1-articles"],
  "topicTags": ["reisen"],
  "difficulty": 2
}
```

#### C) `horenParts[i].segments[j]` (when segment has `options` + `correct`)

```json
{
  "id": "h2",
  "label": "Aufnahme 2",
  "transcript": "…",
  "question": "Was ist das Thema?",
  "options": ["a) …", "b) …"],
  "correct": "b",
  "grammarTags": [],
  "topicTags": ["medien"],
  "difficulty": 3
}
```

#### D) `horenParts[i].questions[j]` (flat question list per part)

Same shape as (A).

#### E) `horenParts[i].noteFields[j]` (gap-style listening notes)

```json
{
  "id": "n1",
  "label": "Uhrzeit",
  "answer": "14:30",
  "grammarTags": ["g-de-b1-numbers"],
  "topicTags": ["alltag"],
  "difficulty": 1
}
```

#### F) Legacy `lesen.questions[]`, `horen.questions[]`, `reading.questions[]`, `listening.questions[]`

Same optional trio on each question object.

#### G) Legacy `gapfill.sentences[]`

```json
{
  "id": "g1",
  "text": "Er [BLANK] nach Hause.",
  "answer": "geht",
  "grammarTags": ["g-de-a1-present"],
  "topicTags": ["familie"],
  "difficulty": 2
}
```

---

### 5.4 Demo format (`data/demo/*.json`)

Demo uses **flat skill objects**, not `*Parts` arrays. Placement:

```json
{
  "id": "de_A1",
  "topic": "Familie und Alltag",
  "topicTags": ["familie", "alltag"],
  "difficulty": 1,

  "reading": {
    "sectionLabel": "Lesen",
    "passage": "…",
    "question": "Wo wohnt Anna?",
    "grammarTags": ["g-de-a1-present"],
    "topicTags": ["wohnen"],
    "difficulty": 1,
    "options": [ "..." ]
  },

  "listening": {
    "transcript": "…",
    "question": "…",
    "grammarTags": [],
    "topicTags": ["einkaufen"],
    "difficulty": 1,
    "options": [ "..." ]
  },

  "writing": {
    "task": "…",
    "topicTags": ["familie"],
    "grammarTags": ["g-de-a1-word-order"]
  },

  "speaking": {
    "task": "…",
    "topicTags": ["familie"]
  }
}
```

`validate-demo-content.mjs` must **not** require these fields (backward compatible).

---

### 5.5 Normalization pass-through requirements

When implementing tags, these functions must **preserve** unknown keys on copy:

| Function | File | Must preserve tags on |
|----------|------|------------------------|
| `normalizeSpanishExam` | `js/examSpanishNormalize.js` | `questions`, `segments`, `items` inside mapped parts |
| `normalizeCambridgeExam` | `index.html` | `readingParts` → `lesenParts` mapping |
| `sanitizeGoetheParts` | `index.html` | all part children |
| `normalizeGoetheQuestion` | `index.html` | question objects (do not strip extra keys) |
| `mergeExamParts` | `scripts/lib/examJsonUtils.mjs` | arrays merged by concatenation — tags stay on each element |

**Current behavior:** spread/copy of question objects already preserves extra keys unless explicitly deleted. **Do not add** destructuring that omits `grammarTags` / `topicTags` / `difficulty`.

---

### 5.6 Chunk merge inheritance (`mergeExamParts`)

AI generates one chunk per module part. Recommended merge policy:

```text
Per chunk JSON:
  { "lang", "level", "lesenParts": [ { part with questions tagged } ] }

After mergeExamParts:
  exam.topic        ← from last chunk or spec topic (unchanged)
  exam.topicTags    ← union of all chunk topicTags (if present)
  exam.grammarTags  ← union of chunk grammarTags (if present)
  exam.difficulty   ← first defined chunk difficulty, else omit
  part.*Tags        ← stay on each part object
  question.*Tags    ← stay on each question (primary source of truth)
```

`mergeExamParts` today only overwrites `topic`, `level`, `lang` at root. **Do not change** that logic without adding explicit union for `topicTags` only at root.

---

## 6. Components that must remain compatible (no breaking changes)

| Component | File | Required behavior with new fields |
|-----------|------|-----------------------------------|
| `ExamValidator.validate` | `js/engine/validation/ExamValidator.js` | Ignore unknown keys; no new required fields |
| `isExamRenderable` | `index.html` | Unaffected (checks content presence, not tags) |
| `buildCorrection` | `index.html` | May **copy** tags into correction items later; must not break if absent |
| `submitExam` | `index.html` | Scoring unchanged; tags optional in history |
| `exam-pool.js` GET/POST | `netlify/functions/exam-pool.js` | Pool stores full exam blob; extra keys allowed |
| `validate-demo-content.mjs` | `scripts/` | Old demos without tags still pass |
| `test-acceptance.mjs` | `scripts/` | Mock fixtures without tags still pass |
| `lc_saved` / `lc_hist` | localStorage | Old saved exams without tags still load |

---

## 7. History and analytics (future consumption, not storage in exam JSON)

Today `lc_hist` entries store:

```json
{
  "topic": "Umwelt und Nachhaltigkeit",
  "score": 72,
  "moduleScores": { "lesen": 80, "horen": 65 },
  "correction": { "parts": [ { "items": [ { "ok", "q", "yours", "correct" } ] } ] }
}
```

**Recommended future extension** (separate from exam JSON — on history entry at submit time):

```json
{
  "tagStats": {
    "grammarTags": { "g-de-b1-nebensatz": { "correct": 1, "total": 2 } },
    "topicTags": { "umwelt": { "correct": 3, "total": 4 } }
  }
}
```

Computed in `submitExam()` from live `S.examData` + `S.answers` — **not** required for exam format compatibility.

This replaces the current weak-area heuristic (`getWeakAreasForGoal` uses exam **topic** scores, not grammar).

---

## 8. Generator prompt contract (when tags are produced by AI)

Tags should be requested in **chunk JSON** at question level inside the existing `expectKey` arrays. Example prompt addition (future `ModuleInstructions` / `PromptBuilder` only):

```text
For each scorable question, optionally include:
  "grammarTags": ["<id from knowledge grammar>"],
  "topicTags": ["<slug>"],
  "difficulty": 1-5
Omit keys if uncertain — never guess grammar IDs.
```

Chunk root may include:

```json
{
  "lang": "de",
  "level": "B1",
  "topicTags": ["umwelt"],
  "lesenParts": [ { "teil": 1, "questions": [ { "id": "l1", "grammarTags": ["..."], ... } ] } ]
}
```

**Phase 1:** generator may omit all tags → exams identical to today.

---

## 9. Complete placement checklist

Use this table when implementing or reviewing exam JSON.

| Location | `grammarTags` | `topicTags` | `difficulty` | Priority |
|----------|---------------|-------------|--------------|----------|
| `exam` root | Optional | Optional | Optional default | Low |
| `*Parts[i]` (module part) | Optional | Optional | Optional default | Medium |
| `*Parts[i].questions[j]` | **Primary** | **Primary** | **Primary** | **High** |
| `*Parts[i].items[j]` | **Primary** | **Primary** | **Primary** | **High** |
| `*Parts[i].segments[j]` (scorable) | **Primary** | **Primary** | **Primary** | **High** |
| `*Parts[i].noteFields[j]` | Optional | Optional | Optional | Medium |
| `schreibenParts[i]` | Optional | Optional | Optional | Medium |
| `sprechenParts[i]` | Optional | Optional | Optional | Low |
| `lesen.questions[j]` (legacy) | **Primary** | **Primary** | **Primary** | High |
| `gapfill.sentences[j]` | **Primary** | **Primary** | **Primary** | High |
| Demo `reading` / `listening` | Optional | Optional | Optional | Medium |
| Demo `writing` / `speaking` | Optional | Optional | — | Low |
| Pool entry root (`topic`) | **No** — use `exam.*` | **No** | **No** | — |

---

## 10. Worked example (minimal diff on real structure)

**Before** (excerpt from `data/exams/de_B1.json` — valid today):

```json
{
  "id": "l7",
  "type": "multiple",
  "question": "Was ist laut Text ein Vorteil von Stadtgärten?",
  "options": ["a) …", "b) …", "c) …"],
  "correct": "b"
}
```

**After** (backward compatible — old clients ignore new keys):

```json
{
  "id": "l7",
  "type": "multiple",
  "question": "Was ist laut Text ein Vorteil von Stadtgärten?",
  "options": ["a) …", "b) …", "c) …"],
  "correct": "b",
  "grammarTags": ["g-de-b1-nebensatz"],
  "topicTags": ["umwelt", "stadt"],
  "difficulty": 3
}
```

---

## 11. Implementation order (recommended, no breaking steps)

1. **Document** (this file) — no runtime changes.
2. **Pass-through audit** — verify normalizers and `mergeExamParts` do not strip extra keys.
3. **Optional validator script** — `scripts/validate-exam-tags.mjs` warns on invalid grammar IDs; never blocks pool/UI.
4. **PromptBuilder** — ask AI for tags on new exams only.
5. **Analytics** — `submitExam` aggregates `tagStats` into `lc_hist` (new optional field).
6. **Coach** — `getWeakAreasForGoal` may use `grammarTags` when present, fallback to `topic` when absent.
7. **Demo backfill** — optional second pass on `data/demo/*.json`.

---

## 12. Explicit non-goals

- No new database tables for questions.
- No required tags on existing `data/exams/de_*.json` until backfill.
- No change to `exam.topic` semantics.
- No change to `ExamValidator` required-field logic.
- No grammar detection inference from question text in this phase.
- No modification to `knowledge/providers/*.json` (structure/timing only).

---

## 13. Summary diagram

```text
                    ┌─────────────────────────────────────┐
                    │  exam (root)                        │
                    │  topic, level, lang  [existing]    │
                    │  topicTags?, grammarTags?,         │
                    │  difficulty?  [NEW — all optional] │
                    └──────────────┬──────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
   lesenParts[i]            horenParts[i]           schreibenParts[i]
   topicTags?               topicTags?              topicTags?
   grammarTags?             grammarTags?            grammarTags?
   difficulty?              difficulty?             difficulty?
          │                        │
          ▼                        ▼
   questions[j]              segments[j]
   items[j]        ◄── PRIMARY TARGET ──►  questions[j]
   grammarTags?              grammarTags?
   topicTags?                topicTags?
   difficulty?               difficulty?
```

**Golden rule:** if a JSON object has a `correct` or `answer` field used for scoring, it **may** carry `grammarTags`, `topicTags`, and `difficulty`. If it does not, tags are optional and inherited from parent part or exam root.

---

*End of specification. No code was modified to produce this document.*
