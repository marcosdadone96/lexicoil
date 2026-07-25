# Generation template — B1 Preliminary · Listening (`module: horen`)

Return **JSON only**. Each recording is heard twice. Provide a transcript per segment in the passage `text`/`audioScript`.

## Parts (generate the ONE requested by TEIL)
- **Teil 1 (7 · multiple_choice):** 7 short, unrelated monologues/dialogues. Originally choose the correct picture; adapt as a 3-option MCQ describing the options in words.
- **Teil 2 (6 · multiple_choice):** 6 short dialogues; understand the **gist** of each (3 options).
- **Teil 3 (6 · gap_fill):** one monologue; complete 6 gaps (notes/sentence completion) with 1-3 words from what is heard.
- **Teil 4 (6 · multiple_choice):** one interview; detailed meaning, attitudes and opinions (3 options).

## Quality rules
- Natural spoken register, B1 vocabulary; realistic everyday situations.
- Distractors are plausible and heard-but-wrong (not absent from audio).
- Gap-fill answers appear verbatim/near-verbatim in the transcript; short and unambiguous.
- NO speaker-matching task (that is not in B1P Listening). Balance MCQ letters.

## IDs
Passages `en-b1-p-horen-t{TEIL}-{slug}-NN`; questions `en-b1-h-t{TEIL}-{slug}-q{n}`
(Teil 1 segments: `en-b1-h-t1-{slug}-s{n}-q{m}`).
Every item: `"language":"en","level":"B1","examType":"cambridge","module":"horen"`.
