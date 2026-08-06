# Whitelist banco B1 — filtro invertido (2026-07-10)

## Cambio

`filterPromptTargetWords` / `sanitizePromptTargetWords`:

1. **Whitelist:** el lema debe existir en `library/vocab/de/B1.json`
2. **Blacklist** C1/C2 (`BLACKLIST`) + B2+ en preguntas (`B2_QUESTION_BLACKLIST`) como 2ª barrera
3. Relleno desde pool seguro ∩ banco B1

## Origen de `morphologie` / `hegemonie`

**No** entraron “desde fuera” del banco. Cadena:

```186:197:scripts/vocab-coverage-report.mjs
  // Escribe la lista de lemas flojos (objetivo de generación).
  ...
  weakLemmas: weakClean.map((w) => w.lemma),
```

`weak-de_B1.json` se puebla **solo** con lemas de `loadLemmaSet()` → `library/vocab/de/B1.json`.

Esos lemas C1/C2 estaban **dentro** de B1.json por bug en `build-vocab-open.mjs`:

```32:50:scripts/build-vocab-open.mjs
// ANTES: readLegacyPool mezclaba A1…C2 como filler alfabético
// → el slice B1 absorbía morphologie (C2), hegemonie (C1), etc.
```

`morphologie` ∈ `knowledge/cefr/vocab/de/C2.json`, `hegemonie` ∈ `C1.json`.

## Correcciones de origen

| Pieza | Fix |
|-------|-----|
| `build-vocab-open.mjs` | `readLegacyPool(lang, maxLevel)`; filler ≤B1 separado de C1/C2 |
| `clean-vocab-b1-bank.mjs` | Quitó 57 c1_c2_only + 7 blacklist + 504 duplicados → **632** lemas únicos |
| `_overrides.json` | 62 excludes para no reimportar |
| `weak-de_B1.json` | Regenerado: **479** flojos (todos ∈ banco limpio) |

## Conteos

| Métrica | Valor |
|---------|-------|
| Banco B1 tras clean | 632 |
| Weak actuales | 479 |
| Weak fuera de B1 (post-clean) | **0** |
| Eliminados del banco (c1_c2_only) | 57 |
| Eliminados (blacklist) | 7 |

No hace falta “limpiar el weak pool aparte”: al limpiar el banco y regenerar coverage, el weak queda alineado. El filtro whitelist evita recaídas si el banco se recontamina.

## Dry-run

5×8 palabras sprechen + 5×8 lesen: **0** fuera de banco.

## Live gen

`generate-part-gemini.mjs --module sprechen --count 1` → **fetch failed** (red). Reintentar cuando haya conectividad.
