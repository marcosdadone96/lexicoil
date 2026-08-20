# Auditoría sistemática — género de sustantivos alemanes (der/die/das)

**Fecha:** 2026-08-09  
**Estado:** Diagnóstico — sin fixes implementados  
**Script:** `scripts/dev/audit-noun-gender-systematic.mjs`  
**Evidencia JSON:** `GENDER-AUDIT-SYSTEMATIC-2026-08-09.json`

---

## Metodología

### Sistema bajo prueba (determinístico, sin Gemini)

Pipeline de producción al guardar vocabulario:

1. `ArticleLexicon.lookupGender` / `applyToFlashcard` (`de-gender.json` + reglas compuestos/plural)
2. `ManualVocab.inferNounGender` (heurísticas de sufijo: `-ung→f`, `-chen→n`, `-er→m`, etc.)

Coincide con el save path **excepto** el fallback AI (`enrichGenderAiFallback` → Gemini).

### Fuente de verdad (externa al runtime)

| Fuente | Entradas | Notas |
|--------|----------|-------|
| `content/vocabulary/de/*/*.json` | 55 lemmas | Artículo explícito en campo `word` (`die Eltern`, …) — curado editorialmente |
| DWDS benchmark | 22 lemmas | `scripts/benchmark-gemini-gender-accuracy.mjs`, verificado 2026-07-13 |
| DWDS pool expansion | 30 lemmas | `scripts/expand-gender-lexicon-from-pool.mjs`, verificado 2026-07-13 |
| **Total deduplicado** | **104** | Intersección pool↔GT: 71 lemmas |

No se usó `de-gender.json` como verdad (es el lexicon del sistema — circular).

### Muestra grande

| Corpus | Volumen |
|--------|---------|
| Pool `vocabularyTags` (A2+B1+B2, 689 archivos) | **1 980–2 028** sustantivos candidatos únicos |
| User blobs (3 cuentas sync) | **80** filas `type=noun` |
| Lexicon `de-gender.json` | 1 002 entradas |

---

## Resultados — precisión vs fuente de verdad

| Subset | Verificables | Correctos | **Precisión** |
|--------|-------------|-----------|---------------|
| Pool tags ∩ GT | 71 | 60 | **84.5%** |
| DWDS benchmark | 22 | 19 | **86.4%** |
| Unión deduplicada | 82 | 69 | **84.1%** |
| User blobs ∩ GT | 4 | 4 | **100%** (muestra GT minúscula) |
| Archivo `de-gender.json` vs GT | 73 | 72 | **98.6%** |

**Limitación honesta:** solo **3.6%** de los sustantivos del pool (71/1980) tienen verdad de referencia externa. El 84% es sobre ese subconjunto verificable, no sobre los 1980 totales.

---

## Cobertura del pool (asignación determinística)

Sobre **2 028** lemmas únicos del pool:

| Resultado | Count | % |
|-----------|-------|---|
| Con artículo asignado (lexicon + heurística) | 1 337 | **65.9%** |
| Sin asignación (`null`) | 691 | **34.1%** |
| Clasificados ≠ noun por `inferPos` | 88 | 4.3% |

Desglose de asignaciones: **973** lexicon · **364** heurística de sufijo.

En user blobs: **69/80** con género (6 vía `genderSource: gemini`), **11** sin género.

---

## Lista completa de errores (13) — sistema vs GT

| Palabra | Asignado | Correcto | Fuente GT | Causa |
|---------|----------|----------|-----------|-------|
| Supermarkt | — | **der** | content-vocab A2 | No en lexicon; sufijos no disparan |
| Schwimmbad | — | **das** | content-vocab A2 | Compuesto `-bad`; no en lexicon |
| Krankenkasse | — | **die** | content-vocab B1 | Compuesto `-kasse`; no en lexicon |
| Nachbarschaft | — | **die** | DWDS + content-vocab | **En lexicon (f) pero `inferPos`→adjective** (bug `haft`⊂`schaft`) |
| Nachricht | — | **die** | content-vocab B1 | No en lexicon |
| Smartphone | — | **das** | DWDS benchmark | Loanword; no en lexicon |
| Unterkunft | — | **die** | content-vocab B1 | `-kunft` no cubierto por heurística |
| Ehrenamt | — | **das** | content-vocab B1 | `-amt` no en lexicon |
| Haustür | — | **die** | DWDS benchmark | Compuesto; `tür` en lexicon pero compound lookup falla con casing |
| E-Mail | — | **die** | DWDS benchmark | Hyphenated; no en lexicon |
| Nachbarn | **der** | **die** | content-vocab A2 | Plural tratado como singular `-er→m` |
| Integration | **das** | **die** | content-vocab B1 | Lexicon `integration:n` incorrecto + `-ion→f` no aplicada vía lexicon |
| Balkon | **das** | **der** | content-vocab A2 | Heurística `-on→n` (diminutivo/loan) falso positivo |

---

## Errores sistemáticos (causa raíz)

### 1. Gap de cobertura del lexicon (≈77% de errores verificados)

**10/13** errores = asignación `null`. El sustantivo no está en `de-gender.json` y ninguna heurística de sufijo aplica.

Patrones afectados:

- Compuestos frecuentes en exámenes: `-bad`, `-kasse`, `-kunft`, `-amt`, `-markt`
- Loanwords: `Smartphone`, `E-Mail`
- `-schaft`/`-tion` en lexicon pero **bloqueados** por POS (ver #3)

`scan-pool-gender-gaps.mjs` (2026-07-13) ya documentó cientos de gaps; la expansión DWDS añadió 30, insuficiente para 1980 lemmas.

### 2. Heurísticas de sufijo incorrectas

| Regla | Ejemplo | Error |
|-------|---------|-------|
| `-on→n` en `inferNounGender` | Balkon | das en vez de der |
| `-er→m` sin check plural | Nachbarn | der en vez de die (plural) |
| Lexicon entry wrong | integration→n | das en vez of die (-ion es femenino) |

### 3. POS misclassification bloquea lexicon

`inferPos` línea 216: patrón adjectival `…haft` matchea **dentro de** `-schaft`:

```
Nachbarschaft → match /haft/ → adjective → applyToFlashcard skipped
```

Aunque `lookupGender('Nachbarschaft')` devuelve `f` correctamente, el género nunca se aplica.

**Mismo patrón potencial:** cualquier sustantivo en `-schaft` capitalizado.

### 4. Contaminación del lexicon (`build-de-gender-lexicon.mjs`)

Entradas no-sustantivo en `de-gender.json` por heurística `-e→f`, `-er→m` sobre function words:

`alle`, `ohne`, `aber`, `bei`, `von`, `wie`, `dich`, `sich`, … (13+ documentados en JSON)

Esto alimenta el pipeline de género **y** el incidente §2b (`alle→f` en verb decks).

### 5. AI fallback (fuera de este scan determinístico)

6/69 user nouns con género usaron Gemini. En producción, el 34% sin asignación determinística **puede** resolverse vía AI — no medido aquí contra DWDS.

---

## Conclusión

| Métrica | Valor |
|---------|-------|
| Precisión verificable (82 lemmas, GT externa) | **~84%** |
| Cobertura determinística pool | **~66%** con artículo · **~34%** null |
| Errores sistemáticos | Lexicon gaps + sufijos `-on`/plural + POS `haft⊂schaft` + lexicon pollution |

**Prioridad diagnóstica para fixes futuros (no implementados):**

1. Fix `inferPos` — no matchear `haft` dentro de `-schaft`
2. Expandir lexicon desde pool gaps (DWDS batch, patrón existente)
3. Reglas compuestos: `-bad→das`, `-kasse→die`, `-markt→der`, `-amt→das`
4. Plural detection antes de `-er→m`
5. Limpiar function words de `de-gender.json`

---

## Comandos reproducibles

```bash
node scripts/dev/audit-noun-gender-systematic.mjs
node scripts/dev/audit-noun-gender-systematic.mjs --include-users
node scripts/scan-pool-gender-gaps.mjs
```
