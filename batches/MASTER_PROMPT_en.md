# MASTER PROMPT — Cambridge Exam Content Generator (EN)

> **Random mode:** `npm run random:batch -- --lang en --level B1`  
> Copy the printed block **before** `---INICIO---` and paste into Gemini.

```bash
npm run random:batch -- --lang en --level B1
npm run random:batch -- --lang en --level B2 --module use_of_english --teil 1
npm run random:batch -- --lang en --count 3 --level C1
```

For full Goethe (German) rules and JSON examples, see `GEMINI_MASTER_PROMPT_de_B1.md`.  
This file adapts that pipeline for **Cambridge B1/B2/C1**.

---INICIO---

## GENERATION PARAMETERS

Use exactly the values from the random script when `MODO = aleatorio`:

```
LANG   = en
LEVEL  = B1 | B2 | C1
EXAM   = cambridge
MODULE = use_of_english | reading | listening | writing
TEIL   = part number (or 1+2 for writing)
TOPIC  = [topic in English]
SLUG   = [kebab-case unique]
ID_PREFIX = en-b1   ← use en-b2 / en-c1 for other levels
```

**Critical:** `module` in every question must match Cambridge blueprint ids — **never** use `lesen` or `horen`.

| MODULE | Generates | passages | questions |
|--------|-----------|----------|-----------|
| `use_of_english` | Cloze / transformations / error correction | 1 text per Part (Parts 1–4) | MCQ / gap-fill per Part spec |
| `reading` | Long reading text + comprehension | 1–2 texts | MCQ / T-F / matching |
| `listening` | Transcripts + questions | 1–5 segments | MCQ / sentence completion / matching |
| `writing` | **Tasks only** | **`[]` empty** | **exactly 2** tasks (Part 1 + Part 2) |

### ID scheme (mandatory)

```
Passages:  en-b1-p-{module}-t{n}-{slug}     e.g. en-b1-p-use_of_english-t1-remote-work-cloze-01
Questions: en-b1-uoe-t1-{slug}-q{n}         (use_of_english — shorthand uoe in id)
           en-b1-r-t1-{slug}-q{n}           (reading)
           en-b1-h-t1-{slug}-s{n}-q{m}      (listening T1 segments)
           en-b1-h-t2-{slug}-q{n}           (listening T2+)
           en-b1-w-t1-{slug}-q1             (writing Part 1)
           en-b1-w-t2-{slug}-q1             (writing Part 2)
```

Each question must include: `"language":"en"`, `"level":"B1"`, `"examType":"cambridge"`, `"skills"` (reading/listening/writing), `"grammarTags":["g-en-b1-…"]`, `"topicTags"`.

Grammar tags (examples): `g-en-b1-clauses`, `g-en-b1-modals`, `g-en-b1-passive`, `g-en-b1-conditionals`, `g-en-b1-reported-speech`.

### Anti-patterns (auto-reject)

- `module: "lesen"` or `"horen"` in English batches
- Writing/listening batch with wrong module
- Writing with passages or MCQ reading questions
- Duplicate IDs or missing `passageId` when module requires it

### Output JSON shape

Same top-level as Goethe batches:

```json
{
  "passages": [ ... ],
  "questions": [ ... ]
}
```

After generation, save to `batches/merged/{filename from script}` and validate:

```bash
node scripts/validate-batch.mjs --lang en --level B1 --file batches/merged/<file>.json
```

See `library/blueprints/cambridge_B1.json` (and B2/C1) for exact question counts per Part.

---FIN---
