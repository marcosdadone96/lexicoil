# germanCapsNormalize — implementación estable

**Versión:** `v3.7-attr-adj-before-noun-2026-07-11` (adj atributivo + sustantivo → decap; excl. Grünes Viertel)  
**Gate congelado:** `v6.1-B-G2` (`scripts/pos-caps-check.py` — no modificar)  
**Baseline métrica:** 193 archivos `batches/ready/lesen` · decap-only dry-run · **88 → 79 findings** · **0 findings nuevos**

## Contrato con poolReadyCheck (evitar “verified obsoleto”)

1. Cada archivo READY lleva `_germanCapsNormalizeVersion` (= `GERMAN_CAPS_NORMALIZE_VERSION`).
2. Gate 1 **siempre** corre `applyGermanCapsNormalize` de la versión en código (no confía en el estado histórico del JSON).
3. Si el stamp falta o ≠ versión actual → `caps_version_stale` (REPAIRABLE) → `applyPoolRepairs` re-aplica + restampa.
4. **Al añadir un guard:** bump `GERMAN_CAPS_NORMALIZE_VERSION` (p.ej. `v3.7-attr-adj-before-noun-2026-07-11`). Los READY antiguos dejan de ser READY hasta re-stamp — sin re-triage manual.

## Fase 1 — `etwas`/`nichts`/`alles` + adj. sustantivado (2026-07-11)

Allowlist canónica en `INDEF_PRONOUN_SUBST_ADJ_ALLOWLIST` (`capitalizeNouns.mjs`):
`Gutes`, `Neues`, `Mögliche`, `Besonderes`, `Sinnvolles`, `Kreatives`, `Produktives`, `Wichtiges`.

- Triggers: solo `etwas|nichts|alles` (no `viel`/`wenig`/`genug` — Fase 2).
- Nunca capitaliza un seguidor arbitrario; solo lemmas de la allowlist.
- Evidencia pool: ROTO `gutes`/`neues`/`mögliche`; formas OK capitalizadas en corpus.

## Rol en el pipeline

Capa **post-generación / pre-audit**, separada del gate POS:

1. `decapitalizeMidSentence` — baja mayúsculas erróneas (adj/adv/homógrafo/modal)
2. `capitalizeBatchNouns` — sube sustantivos conocidos (modo full, no decap-only); **v3.1:** no re-capitaliza lemmas en `ADJ_NEEDS_ARTICLE_GUARD` tras artículo
3. `normalizeBatchMcqOptionCapitalization` — MCQ (modo full)

En pre-audit de generación Lesen se usa **`decapOnly: true`** para no re-capitalizar sustantivos ya corregidos por el gate.

```javascript
import { applyGermanCapsNormalize, GERMAN_CAPS_NORMALIZE_VERSION } from './germanCapsNormalize.mjs';
```

## Problemas resueltos en v3.0-stable

### 1. Alter (sustantivo decapitalizado como adjetivo)

**Síntoma:** `zum Alter` → `zum alter` → finding `lexicon_nn`.  
**Causa:** `'alter'` estaba en `ADJ_NEEDS_ARTICLE_GUARD` (forma adjetival) pero también es el sustantivo *Alter*.  
**Fix:** eliminar `'alter'` del guard. No usar `!isKnownGermanNoun` global en la rama artículo+adj (rompe `Ganzen`, `Bessere`).

### 2. Sorgen (homógrafo S./V.)

**Síntoma:** `es gibt auch Sorgen` → `sorgen` → finding `lexicon_override_tag`.  
**Causa:** `decap_homograph` con trigger `auch`; `sorgen` en supplement pero **no cargado** en el léxico.  
**Fix:** cargar `scripts/lib/data/german-noun-supplement.json` en `buildLexicon()`. El guard `isKnownGermanNoun` en `shouldDecapitalizeMidSentenceToken` ya existía.

### 3. Kosten (objeto nominal tras modal)

**Síntoma:** `Man kann Kosten für Miete` → `kosten` → finding `modal_noun_object`.  
**Causa:** `isModalInfinitiveOvercapitalized` trataba `Kosten` como infinitivo tras `kann` sin mirar el complemento.  
**Fix:** si `isKnownGermanNoun(word)` y el siguiente token ∈ `MODAL_NOUN_OBJECT_PREPS` (`für`, `mit`, `an`, …) → **no decap**. Preserva `Wissen wollen` (siguiente token = modal, no prep).

### 4. Carga del noun supplement

`german-noun-supplement.json` lista sustantivos de examen no presentes en de-gender/CEFR (incl. `sorgen`, `fragen`, `mittel`, …). Se fusionan en `buildLexicon()` tras content vocab.

### 5. Guard modal + preposición de objeto

Exportado como `MODAL_NOUN_OBJECT_PREPS` en `capitalizeNouns.mjs`. Solo afecta la rama modal-infinitivo en `decapitalizeMidSentence`; **no** modifica `fixZuInfinitiveCapitals` ni `decap_heuristic_adj_adv`.

### 6. Phase 1: decap↔cap revert (v3.1-stable)

**Síntoma:** `ein Wichtiger Schritt` → decap OK → cap revierte a `Wichtiger`.  
**Causa:** `shouldCapitalizeLowerNoun` re-mayusculaba lemmas en lexicon tras artículo cuando el sustantivo siguiente no estaba en lexicon.  
**Fix:** early return `false` si `SUBSTANTIVISING_ARTICLES` + `ADJ_NEEDS_ARTICLE_GUARD` (espejo de decap).

## Qué no tocar sin evidencia

- `decap_heuristic_adj_adv` — elimina `Junge`, `Spät`, `Morgens`, etc.
- `fixZuInfinitiveCapitals` — `zu Spät`, `zu Besuchen`
- `pos-caps-check.py` / gate v6.1-B-G2
- Nuevas heurísticas sin falsos positivos medidos en holdout

## Tests y corpus

```bash
node scripts/lib/__tests__/germanCapsNormalize.iter3.test.mjs
node scripts/lib/__tests__/capitalizeNouns.test.mjs
npm run test:german-caps-normalize
```

Corpus permanente: `scripts/lib/__tests__/germanCapsNormalize.corpus.json`  
Casos del gate (no regresión): `scripts/lib/__tests__/germanCapsGate.groundtruth.json`

## Validación de referencia

| Artefacto | Descripción |
|---|---|
| `batches/ready/G2-DECAP-ONLY-ITERATION3-RESULTS.md` | Informe baseline v3 |
| `batches/ready/G2-DECAP-ONLY-ITERATION3-RESULTS.json` | Dry-run 193 archivos |
| `batches/ready/G2-DECAP-ONLY-ITERATION2-ANALYSIS.md` | Análisis evidencia previo |

## Protocolo de aceptación (fases arquitectónicas M1–M4)

**Documento canónico:** `batches/ready/PHASE-ACCEPTANCE-PROTOCOL.md`

Una fase solo se integra si cumple **simultáneamente**:

| Criterio | Umbral |
|---|---|
| `addedFindings` | **== 0** en G2, generated y producción-15 |
| Findings gate | `afterFindings ≤ beforeFindings` en cada corpus |
| Tests | `npm run test:german-caps-normalize` — 100 % pass |
| `capFixed` | ≥ baseline fase anterior (no regresión de sustantivación) |
| Dry-run | Completo en los **tres** corpus |

**Un solo `addedFinding` nuevo → fase rechazada, vuelta a diseño.** No mergear ni etiquetar `-stable`.

Roadmap M1–M4: `batches/ready/ARCH-STABILIZATION-M1-M4-DESIGN.md`

## Dry-run de regresión (referencia baseline)

```powershell
$env:NODE_OPTIONS="--use-system-ca"
npm run test:german-caps-normalize
node scripts/repair-german-caps-normalize.mjs --dir batches/ready/lesen --dry-run --out batches/ready/PHASEn-G2-DRYRUN.json
node scripts/repair-german-caps-normalize.mjs --dir batches/generated --dry-run --out batches/ready/PHASEn-GENERATED-DRYRUN.json
node scripts/repair-german-caps-normalize.mjs --files <lista 15 producción> --dry-run --out batches/ready/PHASEn-PRODUCTION-15-DRYRUN.json
```

Lista producción-15: `batches/ready/V3-PRODUCTION-15-GENERATED.json` (actualizar por fase si cambia el criterio de selección).
