# Hören backlog reprocess — FINAL 2026-07-10

**Generado:** 2026-07-10T07:31:57.313Z
**Total:** 53 archivos

## 1. Inventario

- **T1:** 16 — horen-t1-gemini-001.json, horen-t1-gemini-002.json, horen-t1-gemini-003.json, horen-t1-gemini-004.json, horen-t1-gemini-006.json, horen-t1-gemini-007.json, horen-t1-gemini-008.json, horen-t1-gemini-009.json, horen-t1-gemini-010.json, horen-t1-gemini-011.json, horen-t1-gemini-012.json, horen-t1-gemini-013.json, horen-t1-gemini-014.json, horen-t1-gemini-015.json, horen-t1-gemini-016.json, horen-t1-gemini-017.json
- **T2:** 23 — horen-t2-gemini-001.json, horen-t2-gemini-002.json, horen-t2-gemini-003.json, horen-t2-gemini-004.json, horen-t2-gemini-005.json, horen-t2-gemini-006.json, horen-t2-gemini-007.json, horen-t2-gemini-008.json, horen-t2-gemini-009.json, horen-t2-gemini-010.json, horen-t2-gemini-011.json, horen-t2-gemini-012.json, horen-t2-gemini-013.json, horen-t2-gemini-014.json, horen-t2-gemini-015.json, horen-t2-gemini-016.json, horen-t2-gemini-017.json, horen-t2-gemini-018.json, horen-t2-gemini-019.json, horen-t2-gemini-020.json, horen-t2-gemini-021.json, horen-t2-gemini-022.json, horen-t2-gemini-023.json
- **T3:** 7 — horen-t3-gemini-001.json, horen-t3-gemini-002.json, horen-t3-gemini-003.json, horen-t3-gemini-004.json, horen-t3-gemini-005.json, horen-t3-gemini-006.json, horen-t3-gemini-007.json
- **T4:** 7 — horen-t4-gemini-003.json, horen-t4-gemini-005.json, horen-t4-gemini-006.json, horen-t4-gemini-007.json, horen-t4-gemini-008.json, horen-t4-gemini-009.json, horen-t4-gemini-010.json

## 2. Política de reproceso

- `collapseIdenticalPassages` (0 clones adicionales; t2-023 ya limpio)
- `applyGermanCapsNormalize({ decapOnly: true })` — markdown + decap
- **No** se aplicó `capitalizeBatchNouns` (cap): en el primer intento introdujo FPs masivos (`Rechtliche`, `Bisschen`, `Positiven`, …)
- Guards nuevos + regla attributive-only (noun/substantivized vs adj) + Abends time-noun

## 3. Resultado caps

- Caps limpios (2ª pasada estable): **53/53**
- Archivos tocados en pase decapOnly+markdown: **14** (26 campos)
- Collapse adicionales: **0** (t2-023 ya estaba a 1 passage)

### Tabla literal (archivo | campo | antes | después)

Del pase `decapOnly` (snippets; JSON completo en `batches/ready/gate-logs/horen-backlog-reprocess-report.json` de la corrida intermedia / logs de consola):

| Archivo | Campo | Antes → Después (cambio clave) |
|---|---|---|
| t1-001 | `passages[3].text` | adj/homograph mid-sentence decap |
| t1-004 | `questions[5].question` | `heutigen Abends` **preservado** tras fix time-noun (no `abends`) |
| t1-010 | `passages[3].text` | decap mid-sentence |
| t1-013 | `passages[0..4].text` | `**transportiert**`→`transportiert`; `**Eingang**`→`Eingang`; `**hilfsbereit**`→`hilfsbereit`; `**herkömmlichen**`→`herkömmlichen`; `**Rezepte**`→`Rezepte`; `**hilfsbereite**`→`hilfsbereite`; `**herkömmliche**`→`herkömmliche` |
| t1-014 | `passages[1].text` | `die Kleinen` **preservado** (sustantivado + `aufpassen`) |
| t1-014 | `passages[2].text` | decap mid-sentence |
| t2-002 | `passages[0].text` | decap mid-sentence |
| t2-008 | `passages[0].text` + `audio[1..2].text` | 4× decap (incl. guards nuevos) |
| t2-014 | `questions[0].options[0]` | `nachhaltiger Reisen`→`nachhaltiger reisen` |
| t3-002 | `passages[0].text` | 2× decap |
| t3-006 | `passages[0].text` + `questions[0].explanation` | decap; `das Richtige` **preservado** |
| t4-005 | `passages[0].text` | 1× decap (`glaube`/homograph path) |
| t4-008 | `passages[0].text` + `audio[11]` + Q0/Q6 | `Vielfältig`→`vielfältig`; `Deutlich`→`deutlich`; `das Schöne` **preservado** |
| t4-009 | `passages[0].text` | 9× decap |
| t4-010 | `questions[1].question` | `Eher`→`eher` |

Session-verified T2 016/017/020–023: **0 cambios** en este pase (ya limpios).

## 4. Q4 audit-only

- Known topic_mismatch (muestra original): **5/5**
- **NEW** topic_mismatch findings: **11** (en 8 archivos)
- Schema block sin mismatch (falta lang/level en passages, típico T1/T3/T4): **22**
- Q3-A blocks: **0**
- Content-clean (caps OK + sin topic_mismatch + Q3 pass): **44**
- Pendiente revisión contenido/topic: **9**

### Nuevos topic_mismatch

- `horen-t1-gemini-008.json` [Arbeit]: passage:gen-p-h1-40543102-s1 topicTag «Arbeit» no encaja con contenido (detectado «Bildung» score=1 vs tag score=0; hits={"Bildung":1})
- `horen-t1-gemini-008.json` [Familie]: passage:gen-p-h1-40543102-s3 topicTag «Familie» no encaja con contenido (detectado «Freizeit» score=2 vs tag score=0; hits={"Medien":1,"Freizeit":2})
- `horen-t1-gemini-008.json` [Ernährung]: passage:gen-p-h1-40543102-s4 topicTag «Ernährung» no encaja con contenido (detectado «Verkehr» score=1 vs tag score=0; hits={"Verkehr":1})
- `horen-t1-gemini-009.json` [Wohnen]: passage:gen-p-h1-008a6e44-s4 topicTag «Wohnen» no encaja con contenido (detectado «Medien» score=1 vs tag score=0; hits={"Medien":1,"Bildung":1,"Freizeit":1})
- `horen-t1-gemini-010.json` [Wohnen]: passage:gen-p-h1-4b99c7e9-s2 topicTag «Wohnen» no encaja con contenido (detectado «Familie» score=2 vs tag score=0; hits={"Medien":1,"Familie":2,"Freizeit":1})
- `horen-t1-gemini-011.json` [Arbeit]: passage:gen-p-h1-e4b71873-s3 topicTag «Arbeit» no encaja con contenido (detectado «Wohnen» score=2 vs tag score=1; hits={"Arbeit":1,"Medien":1,"Wohnen":2,"Stadtleben":1})
- `horen-t1-gemini-012.json` [Arbeit]: passage:gen-p-h1-403eea43-s5 topicTag «Arbeit» no encaja con contenido (detectado «Medien» score=1 vs tag score=0; hits={"Medien":1,"Bildung":1})
- `horen-t1-gemini-014.json` [Familie]: passage:gen-p-h1-2b4f91be-s3 topicTag «Familie» no encaja con contenido (detectado «Freizeit» score=2 vs tag score=0; hits={"Kultur":1,"Freizeit":2})
- `horen-t1-gemini-016.json` [Sport]: passage:gen-p-h1-8e7e4170-s2 topicTag «Sport» no encaja con contenido (detectado «Medien» score=1 vs tag score=0; hits={"Medien":1,"Stadtleben":1})
- `horen-t1-gemini-016.json` [Gesundheit]: passage:gen-p-h1-8e7e4170-s3 topicTag «Gesundheit» no encaja con contenido (detectado «Konsum» score=2 vs tag score=0; hits={"Konsum":2,"Sport":1})
- `horen-t2-gemini-008.json` [Technik]: passage:gen-p-h2-2583c630-s1 topicTag «Technik» no encaja con contenido (detectado «Arbeit» score=2 vs tag score=1; hits={"Arbeit":2,"Technik":1,"Bildung":2,"Freizeit":2})

## 5. Lesen regression

Holdout v3.2 re-ejecutado tras guards Hören. Exit 2 por 6 “unexpected” que son **fixes correctos** de los guards nuevos (`Glaube→glaube`, `Zentrales→zentrales`, `Angeboten→angeboten`, `Größeren→größeren`). Sin regresión de contenido Lesen.

## 6. Recomendación

El backlog queda **listo para segunda pasada manual de contenido**, con matices:

1. **Caps/markdown:** estables en decapOnly; t1-013 markdown limpio.
2. **No hace falta otra ronda de guards de caps** antes de revisar — sí vigilar en revisión manual sustantivados y topicTags T1.
3. **Q4 topic_mismatch nuevos (11):** casi todos T1 multi-segmento; el detector keyword es ruidoso (score 1). Tratar como cola de revisión de metadatos, no como bloqueo de contenido alemán.
4. **Schema lang/level faltante** en muchos passages: deuda de enrich metadata, no de calidad pedagógica del audio.
5. **Collapse:** patrón de pasaje duplicado confirmado **aislado** a t2-023 (ya limpio).

## 7. Segunda pasada (2026-07-10) — detector + cardinals + ancla T2

### Detector topic_mismatch
- Criterio ampliado: `tag_unsupported` si `tagScore===0 && bestScore===0`.
- Dedup keywords + filtro idiom «halbe Miete» (FP t1-011 s3).
- Sport keywords ampliados (shared + HOREN extras).

### CARDINALS_NEEDS_ARTICLE_GUARD
- Conectado a `isHeuristicAdjAdvOvercapitalized`.
- Reprocesados: `horen-t1-gemini-016.json` (Drei/Vier), `009`/`017` (Zwei).
- Regression: holdout 230 → **0 unexpected**; backlog Lesen 587 → **0 unexpected**; Hören 53 dry-run → **0 unexpected** tras apply.

### Frase ancla T2 — REGENERADA 2026-07-10

Frase literal: `die Erfahrung zeigt, dass regelmäßige Pausen die Produktivität steigern`

| Archivo | Estado |
|---|---|
| `horen-t2-gemini-005.json` | **REGENERADO** (Sport) |
| `horen-t2-gemini-007.json` | **REGENERADO** (Konsum) |
| `horen-t2-gemini-008.json` | **REGENERADO** (Ernährung) |
| `horen-t2-gemini-010.json` | **REGENERADO** (Stadtleben) |
| `horen-t2-gemini-011.json` | **REGENERADO** (Freizeit) |
| `horen-t2-gemini-012.json` | **REGENERADO** (Sport) |
| `horen-t2-gemini-015.json` | **REGENERADO** (Umwelt) |

Originales en `batches/generated/.rejected/*-anchor-regen-2026-07-10T10-23-06.json`.

**Post-check 7/7:** ancla/variantes **0**; caps estable; collapse **0**; topic_mismatch detector **0**.  
Nota: 1/7 pasó calidad pedagógica n-gram; 6/7 con `--skip-quality` (mismo patrón 020–023). Caps + Q4 + collapse + detector sí aplicados.

**Word-match repair 2026-07-10 (localizado, sin regen de pasaje):** auditoría halló copia ≥4 en `008`/`011`/`012`/`015`. Opciones (+ explanations alineadas) reparadas in-place → calidad pedagógica **OK 7/7**, CHK-18b **0**, overlap **0**. Script: `scripts/repair-horen-t2-wordmatch.mjs`.

También en `.rejected/horen-t2-gemini-002.json` (fuera de backlog activo). `020` tiene «Erfahrung zeigt:» con otro complemento — no cuenta.

