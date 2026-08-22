# Aplicabilidad de gates CHK-1..25 al inglés (Etapa 0 — EN)

**Fecha:** 2026-07-08 · **Base:** `scripts/audit-pass-2.mjs` (2.436 líneas), `scripts/lib/normalizeBatch.mjs`, `capitalizeNouns.mjs`, `partGate.mjs` · **Autor:** Danilo

## Clasificación

### ✅ Aplican a inglés sin cambios (independientes del idioma)

| Check | Qué valida |
|---|---|
| CHK-1 | Tipos canónicos de pregunta |
| CHK-2 | `correct === correctAnswer` + valores válidos por tipo |
| CHK-3 / 3b | Conteo de ítems vs blueprint / Teile ausentes |
| CHK-4 | Balance de respuestas dentro de una parte |
| CHK-5 | Dedup global de pasajes |
| CHK-8 | Integridad básica |
| CHK-12 | Balance Richtig/Falsch (solo si en_B1 usa bloques V/F — con el blueprint corregido, no) |
| CHK-13 | MC usa las 3 letras, ninguna >55 % |
| CHK-15 | Word count de pasajes vs blueprint |
| CHK-19 | Runs de respuestas consecutivas |
| CHK-22 | Frankenstein cross-batch (múltiples passageIds) |
| CHK-23 | Integridad de claves segments vs questions |
| CHK-24 | Case canónico del valor correcto en MC |
| CHK-25 | Secuencia de claves idéntica entre partes |

### ⚠️ Necesitan variante para inglés

| Check | Problema | Variante propuesta |
|---|---|---|
| CHK-6 | Blacklist C1/C2 basada en léxico alemán | Lista en desde `library/vocab/en/C1-C2.json` |
| CHK-9 | "Beispiel ausente" — convención Goethe | Cambridge también usa ejemplo (ítem 0) en varias partes; redefinir por parte del blueprint corregido |
| CHK-10 | Regex de lenguaje absoluto 100 % alemana (`immer/nie/ausschließlich…`) | Lista en: `always/never/all/every/only/completely/absolutely/entirely…` |
| CHK-18 | Exige que la explanation esté **en alemán** (detecta umlauts/palabras función alemanas) | Invertir: detectar indicadores de inglés; mantener checks de longitud/circularidad |

### ✗ No aplican / mal dirigidos para Cambridge (atados a Teile de Goethe)

CHK-7 (Lesen T4 afirmativas), CHK-11 (Hören T4 clave↔hablante), CHK-16 (anti word-matching L1/H3), CHK-17 (Lesen T3 matching A–J), CHK-20 (Hören T1 estructura por segmento), CHK-21 (Lesen T4 conjunto de opiniones): validan **formatos de tarea Goethe** en posiciones de Teil que en Cambridge B1 corresponden a otras tareas. Desactivarlos para `lang=en` hasta escribir sus equivalentes Cambridge (p. ej. coherencia del gapped text de Reading P4, estructura de la entrevista de Listening P4).

## 🔴 Riesgos activos de corrupción (no son checks: son transformaciones sin guard de idioma)

1. **`normalizeBatch.mjs` ejecuta SIEMPRE el pipeline de capitalización alemana** (`decapitalizeBatchMidSentence` + `capitalizeBatchNouns`), sin comprobar `lang`. La lista de `capitalizeNouns.mjs` incluye préstamos ingleses que "deben ir en mayúscula en alemán" → **capitalizaría palabras comunes dentro de texto inglés** (corrupción silenciosa). **Fix necesario antes de Etapa 1:** guard `if (lang === 'de')` alrededor de ambos pasos.
2. **`TEIL_QUESTION_TYPE` en `normalizeBatch.mjs`** fuerza el mapa Goethe-B1-Lesen (T1 richtig_falsch, T3 matching, T4 ja_nein…) al normalizar slots. Para Cambridge B1 Reading, T1 es MCQ y T4 gapped text → forzaría tipos erróneos. **Fix:** derivar el mapa del blueprint del par (lang, level) en vez de constante.
3. **`partGate.mjs`** ya acepta `lang` (default `'de'`) → verificar que todos los call-sites del pipeline en pasen `lang: 'en'` explícitamente.

Ambos fixes tocan código compartido con el pipeline alemán → **coordinar con Marcos** y cubrir con tests de regresión (patrón existente en `scripts/lib/__tests__/`, hay `capitalizeNouns.test.mjs`).

## Otros hallazgos de Etapa 0

- **Vocabulario en:** `library/vocab/en/*` existe pero es delgado (A1 420 / A2 530 / B1 850 lemas; de_B1 solo tiene 1.200). El acumulado A1–B1 (1.800) supera el umbral `MIN_VOCAB_FOR_HARD_COVERAGE=800` de CefrGate → la cobertura dura SÍ se aplicará; listas delgadas pueden dar falsos fallos CEFR. Revisar/ampliar en Etapa 1 (candidato: Oxford 3000/5000, etiquetado por CEFR).
- **Frecuencia léxica:** NO es dependencia del validador (CefrGate usa `library/vocab/{lang}`); `de-frequency-tiers.mjs` solo alimenta `build-vocab-open.mjs`. Crear equivalente en solo si se regeneran vocabularios.
- **Dry-run `build-level.mjs --lang en --level B1 --target 1`:** el pipeline resuelve rutas y blueprint correctamente y enumera los 12 jobs por módulo; se detiene en `gemini-doctor` por falta de `GEMINI_API_KEY` (el valor en `.env` parece placeholder de 1 carácter). Sin escrituras en el repo.
- **`fill:pool --lang en`** falla limpio: `Missing curated dir: library/curated/en/B1` (esperado; se crea en Etapa 1).
- **Test Modellsatz Cambridge:** `test-cambridge-b1-modellsatz.mjs` existe y pasa, pero solo valida conteos → ver propuesta en `cambridge-b1-blueprint-verification.md`.


## Corrección aplicada (2026-07-09)

- **Riesgo #1 (capitalización alemana en texto inglés) — RESUELTO.** `normalizeBatch.mjs` ahora calcula `lang` (de `ctx.lang`/`base.language`, default `de`) y **salta** `decapitalizeBatchMidSentence` + `capitalizeBatchNouns` cuando `lang !== 'de'`. Alemán byte-idéntico (default sin `lang` sigue siendo `de`). Verificado: "i have a meeting with my team" queda intacto en EN; "meeting/team" → "Meeting/Team" en DE.
- **Riesgo #2 (TEIL_QUESTION_TYPE Goethe forzado) — MITIGADO.** `coerceGeneratedLesenPart` solo aplica el mapa Goethe-Lesen cuando `lang === 'de'`; para inglés no fuerza tipos (deja el generado/blueprint). El **mapa Cambridge por Teil** se construye en Etapa 1 (cuando haya generación EN real).
- **Riesgo #3 (partGate call-sites pasan `lang:'en'`) — PENDIENTE Etapa 1.** `partGate.validatePart` ya acepta `lang` (default `de`); falta verificar que el pipeline de generación EN lo pase explícitamente al cablearse en Etapa 1.

Test de regresión: `scripts/lib/__tests__/normalizeBatch.lang-guard.test.mjs` (EN/ES intactos, DE y default siguen capitalizando). Sin regresión en capitalizeNouns / part-gate / modellsatz (Goethe A1–C2, Cambridge B1).
