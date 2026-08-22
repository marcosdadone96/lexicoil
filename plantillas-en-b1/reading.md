# Generation template — B1 Preliminary · Reading (`module: lesen`)

Paste into Gemini/Claude. Return **JSON only** (`{ "passages": [...], "questions": [...] }`).
You are a Cambridge B1 Preliminary item writer. Everyday B1 topics, natural British English.

## Parts (generate the ONE requested by TEIL)
- **Teil 1 (5 · multiple_choice):** 5 independent short real-world texts (notice, sign, email,
  text message, note). One 3-option question per text — the *main message*. Each "passage" is one short text (10-60 words).
- **Teil 2 (5 · matching):** 8 short descriptive texts + 5 people profiles; match each person to the best text. 3 texts unused.
- **Teil 3 (5 · multiple_choice):** 1 long text (350-500 words), 4 options each. Test detail, gist, inference, global meaning, writer's attitude/opinion.
- **Teil 4 (5 · matching / gapped_text):** 1 long text with 5 gaps where sentences were removed; choose from 8 sentences (3 extra). Tests text cohesion/structure.
- **Teil 5 (6 · multiple_choice):** 1 short text (120-180 words) with 6 gaps; 4 vocabulary options each (multiple-choice cloze).
- **Teil 6 (6 · gap_fill/open_cloze):** 1 short text (120-180 words) with 6 gaps; **one word** per gap, no options (grammar/function words).

## Quality rules (auto-reject if failed)
- CEFR B1 vocabulary coverage (use the B1 wordlist; avoid rare/C1 words). See `library/vocab/en/B1.json`.
- No moralising/register drift ("Experts say", "It is important to…").
- **Anti word-matching** (Teil 1-4): options/keys paraphrase the text; don't lift 3+ content words verbatim.
- Balance MCQ letters; no letter > ~55%; correct answer is a lowercase letter.
- NO word_formation / key_word_transformation / True-False (those are B2 First or not B1P).

## IDs
Passages `en-b1-p-lesen-t{TEIL}-{slug}-NN`; questions `en-b1-r-t{TEIL}-{slug}-q{n}`.
Every item: `"language":"en","level":"B1","examType":"cambridge","module":"lesen"`.
