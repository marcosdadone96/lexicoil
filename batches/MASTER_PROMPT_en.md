# MASTER PROMPT — Cambridge B1 Preliminary Content Generator (EN)

> **Random mode:** `npm run random:batch -- --lang en --level B1`
> Copy the printed block **before** `---INICIO---` and paste into Gemini/Claude.
> Return **JSON only**.

```bash
npm run random:batch -- --lang en --level B1
npm run random:batch -- --lang en --level B1 --module lesen --teil 3
npm run random:batch -- --lang en --count 3 --level B1
```

For full Goethe (German) rules and JSON examples, see `GEMINI_MASTER_PROMPT_de_B1.md`.
This file adapts that pipeline for **Cambridge B1 Preliminary** (verified vs cambridgeenglish.org exam-format, 2026-07-09).

> **B1 Preliminary has NO Use of English module.** Word formation, key word transformation,
> essays and reviews are **B2 First**, not B1P — never generate them here.

---INICIO---

## GENERATION PARAMETERS

Use exactly the values from the random script when `MODO = aleatorio`:

```
LANG   = en
LEVEL  = B1
EXAM   = cambridge
MODULE = lesen | horen | schreiben | sprechen   ← internal engine ids (see note)
TEIL   = part number (Reading 1-6, Listening 1-4, Writing 1-2, Speaking 1-4)
TOPIC  = [everyday B1 topic in English]
SLUG   = [kebab-case unique]
ID_PREFIX = en-b1
```

**Module ids — critical.** The engine, blueprint (`cambridge_B1.json`), question bank and
validator all use the internal ids **`lesen` (Reading), `horen` (Listening),
`schreiben` (Writing), `sprechen` (Speaking)** — the same convention as German. Set
`"module"` to one of these in every passage and question. (`reading`/`listening` are display
aliases only; do not store them.)

## MODULE FORMATS — B1 Preliminary (official)

### `lesen` — Reading (45 min · 6 parts · 32 questions)

| Teil | Task | Questions | type | passages |
|------|------|-----------|------|----------|
| 1 | Read 5 short real-world notices/messages, choose the main message (3 options) | 5 | `multiple_choice` | 5 short texts |
| 2 | Match 5 descriptions of people to 8 short texts | 5 | `matching` | 8 short texts |
| 3 | Long text: detail, gist, inference, global meaning, writer's attitude/opinion (4 options) | 5 | `multiple_choice` | 1 long text |
| 4 | Gapped text: 5 sentences removed, choose from 8 (3 extra) | 5 | `matching` | 1 long text |
| 5 | Multiple-choice cloze: choose the correct vocabulary item (4 options) | 6 | `multiple_choice` | 1 short text |
| 6 | Open cloze: one word per gap (no options) | 6 | `gap_fill` / `open_cloze` | 1 short text |

### `horen` — Listening (30 min · 4 parts · 25 questions · each recording played twice)

| Teil | Task | Questions | type |
|------|------|-----------|------|
| 1 | 7 short monologues/dialogues, choose the correct option (originally picture-based; adapt as 3-option MCQ) | 7 | `multiple_choice` |
| 2 | 6 short dialogues, understand the gist (3 options) | 6 | `multiple_choice` |
| 3 | Monologue: complete 6 gaps (note/sentence completion) | 6 | `gap_fill` |
| 4 | Interview: detailed meaning, attitudes and opinions (3 options) | 6 | `multiple_choice` |

### `schreiben` — Writing (45 min · 2 tasks · `passages: []`)

| Teil | Task | mandatory | words |
|------|------|-----------|-------|
| 1 | **Email** — answer the email and notes provided | yes | about 100 (100-120) |
| 2 | Choice of **article** OR **story** | no (one of two) | about 100 (100-120) |

Writing batches: `passages` is **`[]`**; produce **exactly 2** task prompts. `taskTypes`:
Part 1 `["email"]`, Part 2 `["article","story"]`.

### `sprechen` — Speaking (10-12 min per pair · 4 parts)

| Teil | Task | taskTypes |
|------|------|-----------|
| 1 | Interview — factual/personal questions (2 min) | `["interview"]` |
| 2 | Extended turn — describe one colour photograph (3 min) | `["photo_description"]` |
| 3 | Discussion — make/respond to suggestions, negotiate agreement (4 min) | `["collaborative_task"]` |
| 4 | General conversation — likes, dislikes, experiences, opinions (3 min) | `["general_conversation"]` |

### ID scheme (mandatory)

```
Passages:  en-b1-p-{module}-t{n}-{slug}   e.g. en-b1-p-lesen-t3-city-parks-01
Questions: en-b1-r-t{n}-{slug}-q{m}       (lesen / Reading)
           en-b1-h-t1-{slug}-s{n}-q{m}    (horen / Listening T1 segments)
           en-b1-h-t{n}-{slug}-q{m}       (horen T2+)
           en-b1-w-t{n}-{slug}-q1         (schreiben / Writing)
           en-b1-s-t{n}-{slug}-q1         (sprechen / Speaking)
```

Each question must include: `"language":"en"`, `"level":"B1"`, `"examType":"cambridge"`,
`"module"` (lesen/horen/schreiben/sprechen), `"skills"`, `"grammarTags":["g-en-b1-…"]`, `"topicTags"`.

Grammar tags (examples): `g-en-b1-modals`, `g-en-b1-passive`, `g-en-b1-conditionals`,
`g-en-b1-reported-speech`, `g-en-b1-comparatives`, `g-en-b1-present-perfect`.

### Multiple-choice answer convention

MCQ `correct` is a **lowercase letter** (`a`/`b`/`c`, or `a`-`d` for Reading Part 5). Options
carry their letter prefix (`a) …`). Balance letters across a Part; no letter > ~55%.

### Anti-patterns (auto-reject)

- Any `use_of_english`, `word_formation`, `key_word_transformation`, `essay` or `review` — those are **B2 First**, not B1 Preliminary.
- `richtig_falsch` / True-False items — B1P Listening Part 4 is **MCQ**, not T/F.
- `module` stored as `reading`/`listening`/`writing`/`speaking` — use `lesen`/`horen`/`schreiben`/`sprechen`.
- Writing batch with passages, or Reading MCQ items inside a Writing batch.
- Duplicate ids, or missing `passageId` when the module requires it (lesen/horen).

### Output JSON shape

```json
{ "passages": [ ... ], "questions": [ ... ] }
```

After generation, save to `batches/merged/{filename from script}` and validate:

```bash
node scripts/validate-batch.mjs --lang en --level B1 --file batches/merged/<file>.json
```

See `library/blueprints/cambridge_B1.json` for the authoritative counts, `slotType`,
`taskFormat` and `questionTypes` per Part.

---FIN---
