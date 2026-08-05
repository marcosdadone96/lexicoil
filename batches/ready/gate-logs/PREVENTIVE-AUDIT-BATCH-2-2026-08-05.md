# Auditoría preventiva — Tanda 2 (2026-08-05)

**Alcance:** B1 LT completo · separables a nivel contenido · coherencia B1/B2  
**Operador:** criterio A/B/C/D invariable; no marcar vocab por encima del nivel.

Evidencia: `preventive-lt-B1-2026-08-04.json`, `preventive-separable-content-2026-08-05.json`

---

## Parte 1 — Confirmaciones + B1 LanguageTool

### Confirmaciones (pre-tanda 2) ✅

| # | Decisión | Acción |
|---|----------|--------|
| 1 | Restamp **solo metadata** caps | ✅ 646 archivos → `v3.23-lesen-t2-angebote-corpus-2026-07-28` sin tocar texto |
| 2 | GERMAN_SPELLER A2 23/23 | 3× A aplicados; 20× D (marcas, abrev., compuestos) |
| 3 | Docker 120s | Confirmado: A2/B2 escaneados con `ping.ok: true` |

Detalle: `PREVENTIVE-AUDIT-CONFIRMATIONS-2026-08-05.md`

**Limitación (C) vigente:** LT audit escanea solo `passage.text`, no questions/options/explanations.

---

### B1 LT — resumen bruto

| Métrica | Valor |
|---------|-------|
| Archivos escaneados | 542 |
| Passages con texto | 528 |
| Archivos con matches | 140 |
| Matches totales | 292 |
| Reglas únicas | 47 |

Post-filtro ruido (`LT_NOISE_RULE_IDS`): **161 matches reales** en passages.

---

### B1 — GERMAN_SPELLER_RULE (36/36)

| Cat. | Count | Acción |
|------|-------|--------|
| **A** — capitalización / typo determinista | **14** | ✅ aplicados (ver tabla) |
| **D** — marcas, nombres, anglicismos integrados, idiomáticos | **22** | solo diagnóstico |

#### Fixes A aplicados

| Archivo | Fix |
|---------|-----|
| `horen-t1-gemini-042` | `schönheitsreparaturen` → `Schönheitsreparaturen` |
| `horen-t1-gemini-049` | `schreibtisch` → `Schreibtisch` |
| `horen-t2-gemini-010` | `konzerten` → `Konzerten` (×2) |
| `horen-t3-gemini-030` | `Meal Prepping` → `am Wochenende vorkochen` (anglicismo; alinea con explicaciones Q) |
| `horen-t3-gemini-054` | `fertiggerichten` → `Fertiggerichten` (×3) |
| `horen-t4-gemini-022` | `informationen` → `Informationen`; `gesundheitsinformationen` → `Gesundheitsinformationen` |
| `horen-t4-gemini-034` | `schafft das Arbeitsplätze` → `schafft Arbeitsplätze` (concordancia) |
| `lesen-t2-gemini-118` | `verkäufern` → `Verkäufern` (passage + explanation) |
| `lesen-t2-gemini-126` | `erholungsorten` → `Erholungsorten` |
| `lesen-t2-gemini-149` | `kommunikationsfehlern` → `Kommunikationsfehlern` |
| `lesen-t2-gemini-151` | `Nächstes Monat` → `Nächsten Monat` |
| `lesen-t2-gemini-166` | `kommunikationsfehlern` → `Kommunikationsfehlern` |
| `lesen-t4-gemini-081` | `stellenanzeigen` → `Stellenanzeigen` |
| `lesen-t5-gemini-113` | `dAmit` → `damit` (typo OCR) |
| `lesen-t5-konsum-markthalle` | `Marktgelände` NFD → `Marktgelände` NFC |

#### D — sin acción (22)

| Archivo | Token | Motivo |
|---------|-------|--------|
| `horen-t1-gemini-003` | Broncho-Fit | nombre producto ficticio |
| `horen-t1-gemini-037` | SmartTech | nombre empresa |
| `horen-t1-gemini-046` | Frischeabteilung | compuesto válido (LT FP) |
| `horen-t4-gemini-021` | Fünfe gerade sein | modismo |
| `horen-t4-gemini-028` | Amina (×5) | nombre propio |
| `lesen-t1-gemini-189` | samstagsmorgens | adverbio compuesto válido |
| `lesen-t2-gemini-103` | Tiny Houses (×4) | anglicismo integrado / tema |
| `lesen-t2-gemini-118` | Repair-Cafés | compuesto establecido (misma decisión B2) |
| `lesen-t5-gemini-023` | restentleert | compuesto válido |
| `lesen-t5-gemini-050` | unterzulegen | zu-Infinitiv válido |
| `lesen-t5-gemini-102` | DeskLab | marca ficticia |
| `lesen-t5-gemini-115` | Vitalia | nombre gimnasio |

---

### B1 — otras reglas reales (post-ruido)

| Regla | Count | Veredicto |
|-------|-------|-----------|
| `DE_CASE` | 29 | **~25× D** — mayúsculas tras `:` en diálogos Hören T3/T4 (`Tim: Interessant!`); nombres propios compuestos (`Am Markt`, `Weltweit`) |
| `DE_DATE_WEEKDAY_CURRENTYEAR` | 16 | **D** — fechas ficticias de examen, no error real |
| `FEHLERHAFTES_KOMMA_ALLG` | 12 | **D** — comas en transcripciones orales |
| `EIN_BISSCHEN` | 9 | ignorar (estilo) |
| `GERMAN_WORD_REPEAT_BEGINNING_RULE` | 7 | **D** — repetición retórica en monólogos |
| `DE_SUBJECT_VERB_AGREEMENT` | 3 | **D** — FP: «Hauptsache ist» / «Ernährung ist wichtig» (Sujeto singular) |
| `DE_WORD_COHERENCY` | 2 | **D** — `allein`/`alleine` conviven en textos distintos, no mismo párrafo |
| `DE_COMPOUNDS` | 1 | **D** — `Zwei-Zimmer-Wohnung` vs `Zweizimmerwohnung` (ambas válidas en registro examen) |
| `NOMEN_KLEIN` | 1 | **D** — «ist das ideal» = adjetivo, no sustantivo |

**Prompt gap (B1 Hören diálogos):** checklist de mayúsculas tras `Name:` — en diálogos examen la línea del hablante empieza con mayúscula; LT flaggea falsos positivos masivos.

---

## Parte 2 — Separables a nivel contenido

**Motor:** `findSplitSeparablesInText` (misma lógica que `enrichBatchMetadata` / `separableResolve.js`).

### Muestra representativa

| Nivel | Archivos | Split detectados | ok | tag_gap |
|-------|----------|------------------|-----|---------|
| B1 | 6 | 5 | 2 | 3 |
| B2 | 4 | 4 | 0 | 4 |

Evidencia: `preventive-separable-content-2026-08-05.json`

### Hallazgos

| Archivo | Infinitivo | Status | Notas |
|---------|------------|--------|-------|
| `B1/horen-t2-gemini-033` | `stattfinden` | ✅ ok | en allowlist + tags |
| `B1/lesen-t2-gemini-113` | `beitragen` | ✅ ok | en allowlist + tags |
| `B1/horen-t4-gemini-034` | `ankommen` | tag_gap | **FP detector:** «Es kommt darauf an» — no separable |
| `B1/lesen-t2-gemini-165` | `anbieten`, `zunehmen` | tag_gap | **FP parcial:** `anzubieten` / idiom; revisar manual |
| `B2/horen-t2-gemini-113` | `ansprechen`, `vorschlagen` | tag_gap | contenido correcto; tags no incluyen infinitivo completo |
| `B2/lesen-t2-gemini-167` | `beitragen` | tag_gap | idem |
| `B2/lesen-t5-gemini-109` | `beitragen` | tag_gap | idem |

### Veredicto separables contenido

- **Sistema allowlist:** ✅ sin regresiones (tanda 1).
- **Contenido:** no se detectaron verbos separables **mal escritos** o **untrennbar tratados como separables** en la muestra.
- **tag_gap (B):** 7/9 detecciones son gaps de metadata (`vocabularyTags` sin infinitivo completo) o FPs del detector en idioms — **no bloquean examen**.
- **Acción recomendada (C):** extender audit para excluir «darauf ankommen» y zu-Infinitivos compactos; opcional enriquecer tags en batch futuro, no retroactivo masivo.

---

## Parte 3 — Coherencia B1/B2 (muestra)

**Método:** `audit-pass-2.mjs --summary-only` + revisión manual CHK-34 / explicaciones.

### B1 (3 partes)

| Archivo | Módulo | audit-pass-2 | Coherencia manual |
|---------|--------|--------------|-------------------|
| `lesen-t2-gemini-165` | Lesen T2 | 0 CRIT / 0 IMP / 1 MINOR (CHK-33 metadata) | ✅ respuestas defendibles; explicaciones citan texto; narrativa Mehrgenerationenhäuser coherente |
| `horen-t4-gemini-034` | Hören T4 | **0 findings** | ✅ debate Konsum bien balanceado; RF/MCQ alineados con transcripción |
| `lesen-t5-gemini-115` | Lesen T5 | 0 CRIT / 0 IMP / 1 MINOR (CHK-33) | ✅ Hausordnung Fitnessstudio; preguntas localizables en texto |

### B2 (3 partes)

| Archivo | Módulo | audit-pass-2 | Coherencia manual |
|---------|--------|--------------|-------------------|
| `lesen-t4-gemini-086` | Lesen T4 | 0 CRIT / 2 IMP (CHK-14 FP) | ✅ Medien/Nachhaltigkeit; CHK-14 FP post-fix caps (`zu Nachrichten` = prep+noun, no Infinitiv) |
| `horen-t2-gemini-113` | Hören T2 | **0 findings** | ✅ monólogo coherente post-fix `täglich` |
| `lesen-t2-gemini-167` | Lesen T2 | **0 findings** | ✅ Meinungsäußerungen Stadtentwicklung; explicaciones no genéricas |

### Veredicto coherencia

| Nivel | Muestra | CRITICAL | Coherencia examen |
|-------|---------|----------|-------------------|
| B1 | 3 partes / 16 preguntas | 0 | ✅ apta |
| B2 | 3 partes / ~16 preguntas | 0 | ✅ apta |

**Único ruido:** CHK-33 (`_balanceMcqVersion` metadata) y CHK-14 FP en B2 — cosmético / detector, no deuda de contenido.

---

## Pendiente tanda 2 (parte 4, si aplica)

| Item | Estado |
|------|--------|
| Extender LT a questions/options (C) | pendiente |
| tag_gap separables — enrich retroactivo | opcional B, no urgente |
| Prompt gaps documentados arriba | diagnóstico |

---

## Scripts añadidos / actualizados

| Script | Uso |
|--------|-----|
| `scripts/dev/restamp-caps-metadata-only.mjs` | restamp metadata sin texto |
| `scripts/dev/extract-lt-b1-speller.mjs` | clasificación speller B1 |
| `scripts/dev/extract-lt-b1-grammar.mjs` | reglas gramaticales B1 |
| `scripts/dev/audit-separable-pool-content.mjs` | separables contenido (engine real) |
| `scripts/lib/enrichBatchMetadata.mjs` | export `findSplitSeparablesInText` |
