# Hören T1/T3/T4 — fixes 2026-07-10 (vocab forzado + Q3-B)

## Tarea 1 — Prompt + regen t1-009

- `plantillas-horen-b1/horen-teil1.md`: bloque VOCABULARIO SUGERIDO con PROHIBIDO + ejemplos Ontologie / Klimawandel / Konjunktiv / omitir.
- `scripts/lib/userVocabPrompt.mjs`: `VOCAB_OPTIONAL_REINFORCEMENT_HOREN` + `opts.horen`.
- `scripts/lib/examTemplatePrompt.mjs`: Hören usa preferencia omit-over-force; LONGITUD ya no dice «Integra PALABRAS OBJETIVO» como obligación.
- Archivado: `.rejected/horen-t1-gemini-009-vocab-forced-2026-07-10T11-22-49.json`
- Nuevo: `batches/generated/horen-t1-gemini-009.json` (regen Gesundheit) — **0** Ontologie/Konjunktiv/Klimawandel.

## Tarea 2 — topic_mismatch s4

**Por qué «no se detectó» en pipeline:** el detector **sí** marca `Wohnen` (tagScore=0; Radio en título → Medien). Q4 Hören está en **audit-only** (`hardBlock=false` en `generatePartGeminiLib`) → log, no rechazo.

- Extras `Gesundheit` en `HOREN_TOPIC_EXTRAS` (Stress, Belastung, …) para que el tag correcto no falle por baja señal.
- Test: `scripts/lib/__tests__/contentTopicCheck.horen-t1-009.test.mjs`
- Archivo nuevo ya trae `topicTag: Gesundheit` en los 5 segmentos.

## Tarea 3 — Gesellschaftstheorie

- Añadido a `german-noun-supplement.json` (compound split ya existe; suplemento evita FN si `theorie`/`gesellschaft` fallan el split).
- Fix caps en `.rejected/horen-t4-gemini-001.json` (2×; el archivo no está en pool activo).

## Tarea 4 — Q3-B

Diseño + fixtures: [`Q3B-SEMANTIC-COHERENCE-DESIGN-2026-07-10.md`](Q3B-SEMANTIC-COHERENCE-DESIGN-2026-07-10.md) — sin implementación en producción.
