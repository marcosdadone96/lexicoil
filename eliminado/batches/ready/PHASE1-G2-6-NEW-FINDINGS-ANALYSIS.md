# Análisis de evidencia: 6 findings nuevos del dry-run G2 (Fase 1 / v3.1-stable)

**Corpus:** `batches/ready/lesen` (193 archivos)  
**Artefacto base:** `batches/ready/PHASE1-G2-DRYRUN.json`  
**Gate:** `v6.1-B-G2` (congelado) — sin cambios  
**Normalizador:** `germanCapsNormalize v3.1-stable` (Fase 1 aplicada)  
**Fecha:** 2026-07-08  
**Alcance:** solo los 6 `addedFindings` (88→85 findings, Δ−3 eliminados, +6 nuevos)

---

## Conclusión ejecutiva

**Los 6 findings nuevos no pertenecen al mismo patrón que resolvió Fase 1.**

Fase 1 bloquea la re-capitalización cuando `prev ∈ SUBSTANTIVISING_ARTICLES` **y** `lemma ∈ ADJ_NEEDS_ARTICLE_GUARD` (p. ej. `ein wichtiger` → no revierte decap). Ninguno de estos 6 casos cumple esa condición: o el lema flexionado **no está en el guard**, o el disparador previo **no es un artículo estándar**, o `capitalizeNouns` activa otra rama (`hasNominalSuffix`, homógrafo léxico).

En los 6 casos el **raw ya traía el adjetivo/cuantificador en minúscula** → **decap no intervino** (`decapFixed: 0` en cada archivo). El finding nuevo lo introduce **exclusivamente `capitalizeNouns`** al subir minúscula→mayúscula; el gate detecta correctamente el resultado.

Se observan **cuatro mecanismos distintos**:

| Mecanismo | Casos | Descripción |
|---|---|---|
| **M1 — Hueco de flexión en guard** | `vielen`, `langen` | El guard tiene la forma base (`viele`, `lang`/`lange`) pero no la flexión que aparece en texto |
| **M2 — Homógrafo léxico (sustantivo en `de-gender`)** | `vielen`, `positiven`, `langen`, `blaue` | `isKnownGermanNoun()` devuelve `true` vía `singularCandidates` hacia un sustantivo del léxico, no vía el adjetivo |
| **M3 — Disparador no estándar en `SUBSTANTIVISING_ARTICLES`** | `positiven` (×2), `vielen` | `welchen`, `als` activan la rama sustantivadora igual que `der`/`die` |
| **M4 — Falso positivo morfológico `-chen`** | `frischen` | `hasNominalSuffix('frischen') === true` porque la cadena termina en `…chen` (índices 4–7: `c-h-e-n`) |

---

## Ficha por finding

### 1. `Vielen` — `lesen-t1-gemini-163.json`

| Campo | Valor |
|---|---|
| **Campo JSON** | `questions[2].question` |
| **Frase completa** | *Die vielen elektronischen Hilfsmittel belasten sie gelegentlich.* |
| **Contexto sintáctico** | `Die` (DET/ART) + `vielen` (PIAT/cuantificador) + `elektronischen` (ADJ) + `Hilfsmittel` (N) |
| **¿Art + Adj + N exacto?** | **No.** Es **Art + cuantificador + adj + N** (cadena atributiva más larga). |
| **¿Decap corrigió antes?** | **No.** Raw: `vielen` minúscula; `decapFixed: 0`. |
| **¿Por qué cap capitaliza?** | 1) `prevLc = 'die'` ∈ `SUBSTANTIVISING_ARTICLES`. 2) `vielen` ∉ `ADJ_NEEDS_ARTICLE_GUARD` (sí está `viele`, no `vielen`). 3) `isCertainNounLemma('vielen')` → `true` vía `singularCandidates` → **`viele`** (en léxico). 4) Siguiente token `elektronischen` en minúscula → `nextWordIsCapitalizedNoun` falla → **cap devuelve `true`**. |
| **Riesgo sustantivación real** | **Medio.** *die Vielen* (“los muchos”, sustantivado) es gramatical; aquí *vielen* es cuantificador atributivo (*die vielen Hilfsmittel*). El gate lo marca como `quantifier_capitalized`, no `adj_before_noun`. |
| **Evidencia dry-run** | `capFixed: 3` (incl. `ganz→Ganz`, `bisschen→Bisschen` en passage); cambio relevante: `vielen→Vielen` en `questions[2].question`. |

**Clasificación: A** — Añadir flexiones de cuantificador (`vielen`, `vielem`, `vieler`) al guard es **relativamente seguro** y alinea cap con decap/gate (`QUANTIFIER_ADJ_LEMMAS` en `pos-caps-check.py` ya lista estas formas). Riesgo residual solo en *die Vielen* sustantivado (raro en B1).

---

### 2. `Positiven` — `lesen-t2-gemini-089.json`

| Campo | Valor |
|---|---|
| **Campo JSON** | `questions[2].question` |
| **Frase completa** | *Welchen positiven Punkt erwähnen die Autoren über lokale Berichte?* |
| **Contexto sintáctico** | `Welchen` (PWAT/interrogativo) + `positiven` (ADJ) + `Punkt` (N) |
| **¿Art + Adj + N exacto?** | **Sí** (determinante interrogativo + adj + sustantivo). |
| **¿Decap corrigió antes?** | **No.** Raw: `positiven` minúscula. |
| **¿Por qué cap capitaliza?** | 1) `welchen` ∈ `SUBSTANTIVISING_ARTICLES`. 2) `positiven` ∉ guard. 3) `isKnownGermanNoun('positiven')` → `true` vía `singularCandidates` → **`positive`** (`de-gender.json`: `positive` → `f`). 4) `Punkt` capitalizado pero **`punkt` ∉ léxico** → `nextWordIsCapitalizedNoun` falla → cap. |
| **Riesgo sustantivación real** | **Bajo en este contexto** (atributo ante sustantivo concreto). Existe *ein Positiver* / *das Positive*, pero no aplica aquí. |
| **Causa raíz** | Colisión **adjetivo `positiv` ↔ sustantivo léxico `positive`**, no hueco del guard de adjetivos de Fase 1. |

**Clasificación: B** — Necesita **regla contextual** (homógrafo léxico / no tratar flexiones de adj como sustantivo solo porque `positive` está en `de-gender`). Ampliar el guard con `positiven` sería un parche incompleto: el motor seguiría confundiendo adj y sustantivo homógrafo.

---

### 3. `Frischen` — `lesen-t4-gemini-028.json`

| Campo | Valor |
|---|---|
| **Campo JSON** | `questions[6].signText` |
| **Frase completa** | *Sport an der frischen Luft ist wichtig für die Gesundheit, besonders für Familien mit Kindern. Das ist ein tolles Angebot…* |
| **Contexto sintáctico** | `an` (PREP) + `der` (ART) + `frischen` (ADJ) + `Luft` (N) — grupo preposicional, no nominativo con artículo simple |
| **¿Art + Adj + N exacto?** | **No.** Es **Prep + Art + Adj + N** (`an der frischen Luft`). |
| **¿Decap corrigió antes?** | **No.** Raw: `frischen` minúscula. |
| **¿Por qué cap capitaliza?** | 1) `prevLc = 'der'` ∈ `SUBSTANTIVISING_ARTICLES`. 2) `isKnownGermanNoun('frischen')` → **`false`**. 3) **`hasNominalSuffix('frischen')` → `true`** — falso positivo: `NOMINAL_SUFFIX_RE` matchea el sufijo `chen` en las posiciones finales `…chen` de *frisch**en*** (no es diminutivo `-chen`). 4) Siguiente `Luft` capitalizada, `luft` ∉ léxico → cap. |
| **Riesgo sustantivación real** | **Nulo** — *frische Luft* es siempre adjetivo atributivo. |
| **Régimen gate** | `TITLE_HEADING` (signText T4); el gate aplica `adj_before_noun` igualmente. |

**Clasificación: B** — Requiere **corrección morfológica en `hasNominalSuffix`** (límite de palabra / longitud mínima de raíz antes de `-chen`), **no** entrada en `ADJ_NEEDS_ARTICLE_GUARD`. Patrón ortográfico distinto de Art+Adj+N.

**Evidencia reproducible:**
```
NOMINAL_SUFFIX_RE.test('frischen') === true   // bug
isKnownGermanNoun('frischen') === false
capitalizeNounsInText('an der frischen Luft') → 'an der Frischen Luft'
```

---

### 4. `Positiven` — `lesen-t4-gemini-029.json`

| Campo | Valor |
|---|---|
| **Campo JSON** | `questions[5].explanation` |
| **Frase completa** | *Anna sieht Vorteile für Freiheit und Verkehr, auch wenn sie den Austausch im Büro schätzt. Sie unterstützt den Vorschlag als positiven Schritt.* |
| **Contexto sintáctico** | `als` (PREP/APPR, en `SUBSTANTIVISING_ARTICLES`) + `positiven` (ADJ) + `Schritt` (N) |
| **¿Art + Adj + N exacto?** | **No.** Es **Prep sustantivadora (`als`) + Adj + N**, análogo a *als guter Freund* pero con `als` en el set de artículos. |
| **¿Decap corrigió antes?** | **No.** Raw: `positiven` minúscula. |
| **¿Por qué cap capitaliza?** | Misma cadena que caso 2: `als` dispara rama sustantivadora + homógrafo léxico `positive` + `schritt` ∉ léxico. |
| **Riesgo sustantivación real** | **Bajo** — complemento preposicional atributivo (*als positiven Schritt*), no sustantivación. |

**Clasificación: B** — Combina **M2 (homógrafo `positive`)** y **M3 (`als` como disparador)**. No es candidato limpio para guard; requiere regla que distinga `als`+adj atributivo vs. sustantivación real.

---

### 5. `Langen` — `lesen-t4-gemini-034.json`

| Campo | Valor |
|---|---|
| **Campo JSON** | `questions[4].signText` (también `explanation` con el mismo `langen`) |
| **Frase completa** | *Ich verstehe, dass die Lehrer Ruhe wollen. Aber ein generelles Verbot ist Ungerecht. Manche Schüler brauchen ihr Handy für den langen Nachhauseweg. Man kann nicht von allen das Gleiche erwarten.* |
| **Contexto sintáctico** | `für` + `den` (ART) + `langen` (ADJ) + `Nachhauseweg` (N compuesto) |
| **¿Art + Adj + N exacto?** | **Sí** (`den langen Nachhauseweg`). |
| **¿Decap corrigió antes?** | **No.** Raw: `langen` minúscula en signText y explanation. |
| **¿Por qué cap capitaliza?** | 1) `den` ∈ `SUBSTANTIVISING_ARTICLES`. 2) Guard tiene `lang`, `lange` pero **no `langen`**. 3) `isKnownGermanNoun('langen')` → `true` vía **`lange`** (`de-gender.json`: `lange` → `f`). 4) `Nachhauseweg` capitalizado, compuesto no en léxico → cap. |
| **Riesgo sustantivación real** | **Bajo-medio.** *auf lange Sicht* / *das Lange* existen; aquí es adjetivo de distancia (*langer Weg*). |
| **Nota** | Mismo archivo: decap corrige `Online→online` (2 tokens); el finding nuevo es independiente. |

**Clasificación: A** — Añadir **`langen`** (y flexiones paralelas si faltan) al guard es **seguro** en este contexto: el guard ya incluye `lang`/`lange`; es el mismo patrón de hueco de flexión que Fase 1 cubrió para `wichtigen`/`freien`. Componente **C** residual: `lange` como sustantivo en léxico alimenta `isCertainNounLemma`.

---

### 6. `Blaue` — `lesen-t5-gemini-021.json`

| Campo | Valor |
|---|---|
| **Campo JSON** | `passages[0].text` |
| **Frase completa** | *…Bioabfälle gehören in die grüne Tonne, Papier und Karton in die blaue Tonne. Plastik- und Verpackungsmüll sammeln Sie bitte im gelben Sack…* |
| **Contexto sintáctico** | `in die` (PREP+ART) + `blaue` (ADJ color) + `Tonne` (N) |
| **¿Art + Adj + N exacto?** | **Sí** (`die blaue Tonne`). |
| **¿Decap corrigió antes?** | **No.** Raw: `blaue` minúscula. |
| **¿Por qué cap capitaliza?** | 1) `die` ∈ `SUBSTANTIVISING_ARTICLES`. 2) Color no está en guard. 3) `isKnownGermanNoun('blaue')` → `true` vía **`blau`** (`de-gender.json`: `blau` → `n`). 4) `Tonne` capitalizada, `tonne` ∉ léxico → cap. |
| **Riesgo sustantivación real** | **Bajo** en contenedor de basura; *das Blaue* como sustantivo abstracto no aplica. |
| **Efecto colateral** | En el mismo pasaje cap también sube **`grüne→Grüne`** y **`gelben→Gelben`** (`capFixed: 4`), pero el gate solo reporta **`Blaue`** como finding nuevo — probable divergencia spaCy (tag `PIAT` vs `ADJA`, skips G1/G2) en las otras dos formas. |

**Clasificación: B** — Los **adjetivos de color** (`blau/grün/gelb/rot/…`) forman una **clase** con homógrafos en léxico (`blau`, `grün`, `gelb` como sustantivos). Añadir solo `blaue` al guard no escala; hace falta regla de clase o exclusión léxica contextual.

---

## Tabla resumen de clasificación

| # | Palabra | Archivo | ¿Art+Adj+N? | Decap previo | Clase | Motivo principal |
|---:|---|---|---|:---:|---|---|
| 1 | `Vielen` | `lesen-t1-gemini-163.json` | Parcial (cuantificador) | No | **A** | Hueco flexión `vielen`; guard tiene `viele` |
| 2 | `Positiven` | `lesen-t2-gemini-089.json` | Sí (`welchen`) | No | **B** | Homógrafo léxico `positive`; disparador `welchen` |
| 3 | `Frischen` | `lesen-t4-gemini-028.json` | No (Prep+Art+Adj+N) | No | **B** | Bug `hasNominalSuffix` / sufijo `-chen` |
| 4 | `Positiven` | `lesen-t4-gemini-029.json` | No (`als`+Adj+N) | No | **B** | Homógrafo `positive` + prep `als` sustantivadora |
| 5 | `Langen` | `lesen-t4-gemini-034.json` | Sí | No | **A** | Hueco flexión `langen`; guard tiene `lang`/`lange` |
| 6 | `Blaue` | `lesen-t5-gemini-021.json` | Sí | No | **B** | Clase color + homógrafo léxico `blau` |

**Distribución:** A = 2 · B = 4 · C = 0 · D = 0

Ningún caso es **D** (falso positivo del gate): en los 6, la mayúscula introducida por cap es ortográficamente incorrecta y el gate la detecta bien.

Ningún caso es **C** aislado (no tocar léxico): aunque el léxico contribuye en 4/6, la corrección no pasa solo por borrar entradas — hace falta lógica en cap (B) o flexiones en guard (A).

---

## ¿Son el mismo patrón Art + Adj + N?

| Subpatrón | Casos | ¿Coincide con Fase 1? |
|---|---|---|
| Art + Adj + N con flexión fuera del guard | `langen`, parcialmente `vielen` | **Parcial** — mismo *tipo* que Fase 1, pero lema no listado |
| Art + Adj + N con homógrafo léxico | `positiven` (t2), `blaue` | **No** — Fase 1 no ayuda; `isCertainNounLemma` es el problema |
| Prep/`als`/`welchen` + Adj + N | `positiven` (t4-029), `frischen`, `positiven` (t2) | **No** — disparador o morfología distintos |
| Sufijo `-chen` espurio | `frischen` | **No** — bug morfológico independiente |

**Veredicto:** mezclan **al menos 4 problemas distintos**. Ampliar ciegamente `ADJ_NEEDS_ARTICLE_GUARD` cubriría solo ~2 casos (`vielen`, `langen`) y dejaría abiertos los otros 4.

---

## Implicaciones para diseño (sin implementar)

1. **No ampliar el guard todavía** — coherente con la restricción del usuario: solo 2/6 son candidatos **A** limpios.
2. **Prioridad técnica distinta por mecanismo:**
   - **M4 (`frischen`):** corrección de `hasNominalSuffix` — alto ROI, cero riesgo sustantivación.
   - **M1 (`vielen`, `langen`):** extensiones de flexión puntuales — bajo riesgo, alineadas con Fase 1.
   - **M2 (`positive`, `lange`, `blau`):** cap no debe tratar homógrafos adj/sust como sustantivación solo por `singularCandidates`.
   - **M3 (`als`, `welchen`):** revisar si deben permanecer en `SUBSTANTIVISING_ARTICLES` con la misma semántica que `der`/`die`.
3. **El gate no necesita cambios** para estos 6: detecta el daño que introduce cap.

---

## Referencias de código

- Guard y Fase 1: `scripts/lib/capitalizeNouns.mjs` L29–74 (`ADJ_NEEDS_ARTICLE_GUARD`), L96–110 (`SUBSTANTIVISING_ARTICLES`), L231–251 (`shouldCapitalizeLowerNoun`)
- Sufijo espurio: `scripts/lib/capitalizeNouns.mjs` L153 (`NOMINAL_SUFFIX_RE`), L217–223 (`hasNominalSuffix` / `isCertainNounLemma`)
- Homógrafos léxicos: `scripts/lib/germanNounLexicon.mjs` L96–111 (`singularCandidates`), L253–260 (`lexiconHas`); entradas `positive`, `lange`, `blau` en `data/lexicon/de-gender.json`
- Gate cuantificador: `scripts/pos-caps-check.py` L534–536 (`QUANTIFIER_ADJ_LEMMAS`), L529–539 (`is_quantifier_adjective_error`), L816–823
