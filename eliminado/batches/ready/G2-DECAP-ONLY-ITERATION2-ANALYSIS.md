# G2 decap-only — iteración 2 (análisis basado en evidencia)

**Fuente:** `batches/ready/G2-DECAP-ONLY-IMPACT.json`  
**Gate:** v6.1-B-G2 (congelado, sin tocar)  
**Pool:** 193 archivos · decap-only dry-run  
**Balance global:** 88 → 85 findings (−3) · 11 eliminados · 8 añadidos  

---

## 1. Resumen ejecutivo

De los **8 findings “nuevos”**, **6 son regresiones reales** causadas por decap erróneo sobre sustantivos. **2 son artefactos de diff** (el finding persistía; solo cambió el string de contexto tras otra decap correcta en la misma frase).

| Tipo | Casos | Findings |
|---|---:|---:|
| Regresión real (decap incorrecta) | Alter×3, Sorgen×2, Kosten×1 | 6 |
| Artefacto diff (swap) | Interesse×1, Arbeiten×1 | 2 |

Un patch mínimo de **3 restricciones agrupadas** puede eliminar las 6 regresiones reales **sin perder ninguno de los 9 fixes reales** (11 eliminados − 2 swaps). Proyección: **88 → 79 findings (−9 neto)**.

---

## 2. Tabla por finding nuevo

| archivo | texto original (fragmento) | texto modificado | regla aplicada | finding nuevo | causa | propuesta mínima |
|---|---|---|---|---|---|---|
| `lesen-t2-gemini-072.json` | `…besonders **Junge** Menschen **Interesse** an…` | `…besonders **junge** Menschen **Interesse** an…` | `decap_heuristic_adj_adv` (`Junge→junge`) | `Interesse` / `verb_census_no_finite` | **otro** — la decap de `Junge` es correcta; el finding sobre `Interesse` ya existía y reaparece porque el diff compara `(word, reason, field)` sin contexto. Δ archivo = 0. | Ninguna en decap. Mejorar métrica de diff o corregir `Interesse` en generación/gate aparte. |
| `lesen-t2-gemini-076.json` (×2) | `…gibt es auch **Sorgen**…` | `…gibt es auch **sorgen**…` | `decap_homograph` | `sorgen` / `lexicon_override_tag` (×2) | **homógrafo** — `Sorgen` (S.) decapitalizado como infinitivo `sorgen` (V.). `auch ∈ DECAP_TRIGGER_PREV`. `sorgen` está en `german-noun-supplement.json` pero **no se carga** en `buildLexicon()`. | Cargar supplement en `germanNounLexicon.mjs` **o** añadir `sorgen` al léxico. El guard `isKnownGermanNoun` en `shouldDecapitalizeMidSentenceToken` ya existe; solo falta el dato. |
| `lesen-t2-gemini-079.json` | `…Inhalte zum **Alter** der Kinder…` | `…Inhalte zum **alter** der Kinder…` | `decap_adj_after_article` | `alter` / `lexicon_nn` | **sustantivo mal detectado** — `Alter` (S.) tras `zum`; la rama artículo+adj dispara porque `'alter'` ∈ `ADJ_NEEDS_ARTICLE_GUARD` (forma adjetival). No consulta `isKnownGermanNoun`. | Quitar `'alter'` de `ADJ_NEEDS_ARTICLE_GUARD` (homógrafo adj/S. documentado). **No** usar `!isKnownGermanNoun` global en esta rama: rompería `Ganzen→ganzen` y `Bessere→bessere` (ambos son known nouns pero adj mal capitalizados). |
| `lesen-t2-gemini-086.json` | `Man kann **Kosten** für Miete…` | `Man kann **kosten** für Miete…` | `decap_modal_infinitive` | `kosten` / `modal_noun_object` | **homógrafo** — `Kosten` (S. pl.) tras modal; `isModalInfinitiveOvercapitalized` solo mira `HOMOGRAPH_RISK` + modal, **sin** `isKnownGermanNoun` (a diferencia de `fixModalInfinitiveCapitals`). | En `isModalInfinitiveOvercapitalized`: si `isKnownGermanNoun(word)` **y** `nextWord ∈ {für, mit, an, von, …}` → no decap. Preserva `Wissen wollen→wissen` (next = modal, no prep). |
| `lesen-t5-gemini-046.json` (×2) | `…diesem **Alter**…` / `…vom **Alter**…` | `…diesem **alter**…` / `…vom **alter**…` | `decap_adj_after_article` | `alter` / `lexicon_nn` (×2) | **sustantivo mal detectado** — mismo patrón que t2-079. | Igual: quitar `'alter'` de `ADJ_NEEDS_ARTICLE_GUARD`. |
| `lesen-t5-gemini-061.json` | `…den **Ganzen** Tag kostenlos **Arbeiten**…` → `…den **ganzen** Tag…` | (solo cambia `Ganzen`; `Arbeiten` intacto) | `decap_adj_after_article` (`Ganzen→ganzen`) | `Arbeiten` / `modal_final_infinitive` | **otro** — swap de diff; `Arbeiten` seguía capitalizado antes y después. La decap de `Ganzen` es correcta y elimina `adj_before_noun`. | Ninguna en decap para este finding. |

---

## 3. Clasificación por motivo

| Motivo | n | findings |
|---|---:|---|
| homógrafo | 3 | Sorgen×2, Kosten×1 |
| sustantivo mal detectado | 3 | alter×3 |
| otro (artefacto diff) | 2 | Interesse×1, Arbeiten×1 |
| heurística demasiado amplia | 0 | — |
| contexto insuficiente | 0 | — (el contexto **sí** discrimina; falta wired-up) |

---

## 4. Patrones comunes y restricciones unificadas

### Patrón A — Sustantivo homógrafo con forma en `ADJ_NEEDS_ARTICLE_GUARD` (Alter)

**Casos:** t2-079, t5-046 (3 findings)  
**Regla:** `decap_adj_after_article`  
**Restricción única:** eliminar `'alter'` de `ADJ_NEEDS_ARTICLE_GUARD`.

Evita excepción por archivo. No bloquear por `isKnownGermanNoun` en toda la rama artículo+adj (regresión verificada en `Ganzen`, `Bessere`).

### Patrón B — Homógrafo S./V. con trigger léxico pero sustantivo no cargado (Sorgen)

**Casos:** t2-076 (2 findings)  
**Regla:** `decap_homograph`  
**Restricción única:** cargar `scripts/lib/data/german-noun-supplement.json` en `buildLexicon()`.

El código ya tiene `if (isKnownGermanNoun(token)) return null` en `shouldDecapitalizeMidSentenceToken`; el bug es de **datos**, no de lógica.

### Patrón C — Objeto nominal tras modal (Kosten für …)

**Casos:** t2-086 (1 finding)  
**Regla:** `decap_modal_infinitive` / `isModalInfinitiveOvercapitalized`  
**Restricción única:** no decap si `isKnownGermanNoun(word) && nextWord es preposición de complemento` (`für`, `mit`, `an`, `von`, `über`, `bei`, `gegen`, `ohne`, `um`, `durch`).

**No** usar `isKnownGermanNoun` a secas en la regla modal: bloquearía decaps correctos de `Wissen wollen` / `möchte wissen` (4 cambios modal en el informe, 0 eliminaciones pero texto más correcto).

### Patrón D — Swaps de diff (Interesse, Arbeiten)

No requieren cambio en decap. Son ruido metodológico del comparador `(word, reason, field)`.

---

## 5. Validación offline (sin tocar producción)

Probado con mutación local (no commit):

| Patch | Caso | Resultado |
|---|---|---|
| A: quitar `alter` de guard | `zum Alter der Kinder` | no decap ✓ |
| A + B: supplement cargado | `gibt es auch Sorgen` | no decap ✓ |
| A + B | `den Ganzen Tag`, `Bessere Fahrradwege`, `Junge Menschen`, `zu Spät` | decap conservada ✓ |
| C: modal + knownNoun + next=prep | `Man kann Kosten für Miete` | no decap ✓ |
| C | `…Wissen wollen` | decap conservada ✓ |

---

## 6. Qué modificar / qué no tocar

### Conviene modificar

| Archivo | Cambio |
|---|---|
| `scripts/lib/capitalizeNouns.mjs` | Quitar `'alter'` de `ADJ_NEEDS_ARTICLE_GUARD`; añadir guard prep+knownNoun en `isModalInfinitiveOvercapitalized` |
| `scripts/lib/germanNounLexicon.mjs` | Cargar `german-noun-supplement.json` en `buildLexicon()` |

### No tocar

| Componente | Motivo |
|---|---|
| `scripts/pos-caps-check.py` / gate v6.1-B-G2 | Congelado por diseño |
| `decap_heuristic_adj_adv` | 13 findings eliminados; 4 posibles problemas son swaps o no regresiones netas |
| `decap_adj_after_article` (salvo quitar `alter`) | 4 findings eliminados (`Ganzen`, `Bessere`, …) |
| `fixZuInfinitiveCapitals` / `zu_adv` | Elimina `Spät×2` sin regresiones en este informe |
| `decap_other` | Sin regresiones atribuidas |

### Mejora esperada

- Findings: **85 → 79** (−6 regresiones reales; −9 vs baseline 88)
- Reason codes: desaparecen los +3 `lexicon_nn`, +2 `lexicon_override_tag`, +1 `modal_noun_object` inducidos
- Texto: deja de introducir errores ortográficos reales en `Alter`, `Sorgen`, `Kosten`

### Riesgos de regresión

| Riesgo | Mitigación |
|---|---|
| Quitar `alter` del guard deja capitalizado un adjetivo erróneo `…zum Alter Mann` | Forma no estándar; no aparece en pool G2 |
| Supplement amplía léxico → menos decap homógrafo | Solo afecta palabras listadas; `HOMOGRAPH_RISK` + `isKnownGermanNoun` ya acotan |
| Guard modal+prep no cubre `Man kann Kosten sparen` | No observado en G2; ampliar preps si aparece |
| Swaps Interesse/Arbeiten seguirán en diff naive | Documentar; no afectan Δ real por archivo |

---

## 7. Patch propuesto (condicional — no aplicado)

Condición cumplida: **6 regresiones reales eliminables sin perder 9 fixes reales** (11 − 2 swaps).

### 7.1 `scripts/lib/germanNounLexicon.mjs`

```javascript
const SUPPLEMENT_PATH = path.join(__dirname, 'data', 'german-noun-supplement.json');

function loadNounSupplement() {
  try {
    return JSON.parse(fs.readFileSync(SUPPLEMENT_PATH, 'utf8'));
  } catch {
    return [];
  }
}

// inside buildLexicon(), before return:
for (const w of loadNounSupplement()) lexicon.add(String(w).toLowerCase());
```

### 7.2 `scripts/lib/capitalizeNouns.mjs`

```javascript
// ADJ_NEEDS_ARTICLE_GUARD: remove line 'alter' (noun homograph Alter/alter)

const MODAL_NOUN_OBJECT_PREPS = new Set([
  'für', 'mit', 'an', 'auf', 'in', 'von', 'über', 'unter', 'nach', 'bei',
  'gegen', 'ohne', 'um', 'durch', 'vor', 'hinter', 'neben', 'zwischen',
]);

export function isModalInfinitiveOvercapitalized(word, prevWord = '', nextWord = '') {
  const lc = tokenLemma(word);
  if (!HOMOGRAPH_RISK.has(lc) || !isInfinitiveShape(lc)) return false;
  const prevLc = tokenLemma(prevWord);
  const nextLc = tokenLemma(nextWord);
  if (prevLc === 'zu' || SUBSTANTIVISING_ARTICLES.has(prevLc)) return false;
  if (isKnownGermanNoun(word) && MODAL_NOUN_OBJECT_PREPS.has(nextLc)) return false;
  return MODAL_VERBS.has(nextLc) || MODAL_VERBS.has(prevLc);
}
```

### 7.3 Verificación post-patch

```powershell
$env:NODE_OPTIONS="--use-system-ca"
node scripts/repair-german-caps-normalize.mjs `
  --dir batches/ready/lesen `
  --decap-only `
  --out batches/ready/G2-DECAP-ONLY-IMPACT-iter2.json
```

Criterios de aceptación:

- `findingsAdded` sin `alter`, `sorgen`, `kosten`
- `findingsEliminated` conserva los 11 IDs actuales (o 9 fixes netos + 2 swaps)
- `afterDecapOnly.totalFindings` ≤ 79

---

## 8. Findings eliminados que debe preservar el patch

| # | archivo | word | reason | regla decap |
|---:|---|---|---|---|
| 1 | t1-174 | Morgens | adv_after_pronoun | heuristic |
| 2 | t2-060 | Viele | quantifier_capitalized | heuristic |
| 3 | t2-060 | Viele | adj_before_noun | heuristic |
| 4 | t2-061 | Besuchen | verb_census_no_finite | other/zu |
| 5 | t2-072 | Interesse | verb_census_no_finite | swap (Junge fix correcto) |
| 6 | t4-035 | Bessere | adj_before_noun | adj_after_article |
| 7 | t4-035 | Öffentlicher | adj_before_noun | heuristic |
| 8 | t5-061 | Ganzen | adj_before_noun | adj_after_article |
| 9 | t5-061 | Arbeiten | modal_final_infinitive | swap |
| 10–11 | t5-061 | Spät | zu_adv_capitalized | heuristic (×2) |

**Fixes reales netos:** filas 1–4, 6–8, 10–11 (9 findings).

---

*Generado: iteración 2 · sin modificar código de producción.*
