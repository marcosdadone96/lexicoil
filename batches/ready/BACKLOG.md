# Backlog — calidad y caps (post Wave 1c)

**Regla:** no implementar ítems de esta lista hasta cerrar la revisión Q1 shadow del **2026-07-23** (ver [`PENDING-REVIEWS.md`](PENDING-REVIEWS.md)), salvo bugs de producción.

**Sprechen (2026-07-10):** fixes deterministas + candidatos de alemán + preguntas abiertas → [`SPRECHEN-AUDIT-2026-07-10.md`](SPRECHEN-AUDIT-2026-07-10.md).

---

## Auditoría review-bundle 2026-07-09 (causa raíz pipeline)

| ID | Hallazgo | Estado | Fix |
|----|----------|--------|-----|
| **AUD-1** | `make-t3.mjs` `fixT3OptionCaps` bajaba idiomas tras «in» | **Cerrado** | Eliminado bloque `langs`; tests `make-t3-fixT3OptionCaps.test.mjs` |
| **AUD-2** | `im freien` → `im Freien` bloqueado por `ADJ_NEEDS_ARTICLE_GUARD` | **Cerrado** | Excepción idiomática en `capitalizeNouns.mjs` |
| **AUD-3** | `ein Paar` cuantificador sin guard | **Cerrado** | `shouldDecapitalizeEinPaarQuantifier` + excepciones Schuhe/… |
| **AUD-4** | Markdown `**…**` en T5 (frontend no renderiza) | **Cerrado** | Prompt explícito teil1–5 + `stripMarkdownLeak.mjs` en `germanCapsNormalize` |
| **AUD-4b** | Viñetas `*   ` / `- ` al inicio de línea (expuestas tras AUD-4) | **Cerrado** | Extensión `stripMarkdownLeak.mjs` — texto plano `Label: …` (sin viñeta; pasa Q3-A) |
| **AUD-5** | T4 converge en ~6 nombres (`[Vorname]` sin pool) | **Implementado (Hören T4)** 2026-07-10 | `nameRotation.mjs` + inyección en `generatePartGeminiLib.mjs`; plantilla Hören T4 actualizada. Lesen T4 / Sprechen T1: pendiente (misma nota) |

**Baseline caps:** `v3.3-stable` (wave review e2/e3/e4: Jungen / sportlich* / ähnlich* / Angeboten / Verkehrsbehinderungen)

---

## Pool ready meta-gate (2026-07-10)

| ID | Qué | Estado |
|----|-----|--------|
| **POOL-READY** | `poolReadyCheck.mjs` + `run-pool-ready-check.mjs` + hook post-generación | **Hecho** — ver [`POOL-READY-REPORT.md`](POOL-READY-REPORT.md) |
| **POOL-META-BACKFILL** | Backfill determinista topic + grammar + vocab | **Hecho** 2026-07-10 — [`POOL-METADATA-BACKFILL-2026-07-10.md`](POOL-METADATA-BACKFILL-2026-07-10.md); **45** en `pool-verified`; Lesen 0 por Q1 dups |
| **POOL-VERIFIED-STALE** | 2/45 pool-verified desactualizados vs guards | **Hecho** 2026-07-10 — v3.4 + stamp en poolReadyCheck; ver [`gate-logs/POOL-VERIFIED-CAPS-REPROCESS-2026-07-10.md`](gate-logs/POOL-VERIFIED-CAPS-REPROCESS-2026-07-10.md) |
| **POOL-LIFECYCLE** | ¿finalizePoolReady en todas las vías? | **Sí** 2026-07-10 — make-t3 CLI cableado; ver [`gate-logs/POOL-LIFECYCLE-AUTOMATION-2026-07-10.md`](gate-logs/POOL-LIFECYCLE-AUTOMATION-2026-07-10.md); promoción ok-lesen el 23/07 = `promote-pool-content-ok-lesen.mjs` (manual un comando) |
| **POOL-Q1-MIRROR** | Falso mirror: `index: corpus.index` anulaba exclusión por logicalId | **Hecho** 2026-07-10 — 74 → pool-verified, 170 → pool-content-ok-lesen, 68 redundantes dropped; ver [`gate-logs/LESEN-Q1-MIRROR-FIX-2026-07-10.md`](gate-logs/LESEN-Q1-MIRROR-FIX-2026-07-10.md) |
| **POOL-CONTENT-OK-LESEN** | Interim Lesen (todo OK excepto Q1 shadow) | **Hecho** — `batches/ready/pool-content-ok-lesen/` (170); ensamblador review prioriza verified → ok-lesen → ready/lesen |
| **POOL-Q1-LESEN** | Q1 shadow → block 23/07 | Sigue; T3 140 q1-only = fingerprint real, no bug índice |
| **POOL-TOPIC-AB** | 132 topic mismatch → 61 (a) fuerte / 70 (b) débil | Cola: revisar solo (a); lista en `gate-logs/topic-mismatch-ab-2026-07-10.json` |
| **POOL-Q2-16** | 5 REAL accionables + 4 Lena discard + 7 FP | No regen; corregir solo los 5 REAL (t1-124/131/153/168, t2-084) |

**Carpetas:** `pool-verified/` (READY 1–8) · `pool-content-ok/` (1–7) · `needs-regeneration/` (REJECT).

---

## Wave 2 caps — guards pendientes (piloto tanda 25, 2026-07-09)

| Patrón | Ejemplo | Estado | Notas |
|--------|---------|--------|-------|
| Sustantivo/participio en minúscula tras comparación | `studierenden` (→ `Studierenden`) | **Pendiente** | `t5-070` — fuera de guards v3.2 |
| Participio adjetivado capitalizado | `Zahlenden` (→ `zahlenden`) | **Pendiente** | `t5-070` |
| Adjetivo tras artículo indefinido | `Automatische Sperre` (→ `automatische`) | **Pendiente** | `t4-040` (Ben) |

~~Bullets `*   ` en T5~~ → resuelto en **AUD-4b** (extensión `stripMarkdownLeak`).

**Cerrados en wave 2a (2026-07-09):** `ganz` (adv. invariable), `beruflich*` (ADJ guard), `reisen` tras adj. atributivo (`zukünftige Reisen`).

**Verificación homógrafo `isHomographNounAfterAttributiveAdj` (2026-07-09, pre-cierre):**

Auditoría sintética (`scripts/audit-homograph-attributive-adj.mjs`) sobre los 24 verbos en `HOMOGRAPH_RISK` con plantilla `Für [adj∈ADJ_NEEDS_ARTICLE_GUARD] [homógrafo] möchte…` y variante `… [Homógrafo] Berlin …`.

| Resultado | Palabras |
|-----------|----------|
| **CORRECTO** (whitelist) | `reisen`, `kosten`, `fragen`, `treffen`, `sorgen`, `zahlen`, `arbeiten`, `spielen`, `essen` |
| **FALSO POSITIVO** (con `HOMOGRAPH_RISK` completo) | `erfolgen`, `verursachen`, `raten`, `berichten`, `glauben` |
| **DUDOSO** (excluidos de whitelist) | `posten`, `wissen`, `kochen`, `fahren`, `denken` |
| **No activa** (sin entrada en lexicon noun) | `leben`, `lernen`, `lesen` |
| **No verbales** (no aplican a esta función) | `spät`, `morgens`, `abends`, `ganz*`, `bessere*`, `oft` |

**Decisión:** lista explícita `HOMOGRAPH_NOMINAL_AFTER_ADJ` (9 palabras) en `capitalizeNouns.mjs` — no aplicar la condición a todo `HOMOGRAPH_RISK`. Casos explícitos: `kosten`/`fragen`/`treffen` → cap correcto; `fahren` → sin cap (no whitelist + no lexicon); `berichten`/`raten`/`verursachen` → sin cap (FP evitado).

**Regresión post-acotación:** 233 archivos, **0 inesperados** (`V32-HOLDOUT-REGRESSION.md` 2026-07-09T12:17Z). Tests: 51/51.

**Wave 2a:** cerrada.

---

## Wave G2-mini-ronda — PROSE wave 2a (2026-07-09)

**Fuente:** [`gate-logs/G2-INSPECTOR-WAVE2A.md`](gate-logs/G2-INSPECTOR-WAVE2A.md) (13 hallazgos PROSE accionables en T1/2/4/5).

| Caso | Frase (contexto) | Diagnóstico | Guard |
|------|------------------|-------------|-------|
| t1-180 `besuchen` | «Manchmal besuchen wir auch meine Eltern.» | Verbo correcto (minúscula); G2 FP `lexicon_override_tag` | `LEXICON_OVERRIDE_VERB_INFINITIVES` + decap tras `manchmal` |
| t2-094 `Familien` | «Was empfehlen Experten Familien bezüglich…» | Sustantivo objeto correcto; G2 FP `verb_census` | Test regresión (sin cambio) |
| t2-094 `löschen` / `machen` | «…sofort löschen.» / «…öffentlich machen.» | Infinitivos correctos; G2 FP | `LEXICON_OVERRIDE_VERB_INFINITIVES` + `INFINITIVE_DECAP_PREV` |
| t2-095 `teil` | «…nehmen regelmäßig teil.» | Partícula separable correcta; G2 FP | `SEPARABLE_VERB_PARTICLES` + decap tras `nehmen` |
| t2-095 `verantwortlichen` | «Was planen die verantwortlichen für…» | **Under-cap** → `die Verantwortlichen` | `shouldCapitalizeSubstantivizedAdjAfterDefArticle` |
| t2-097 `Radfahren` | «…wie zum Beispiel Radfahren oder Parkbesuche.» | Nominalización correcta; G2 FP `verb_census` | `NOMINALIZED_INFINITIVE_GUARD` + `radfahren` |
| t4-039 `Zusätzlichen` | «…einen Zusätzlichen Gratis-Sonntag…» | **Over-cap** → `zusätzlichen` | `ADJ_NEEDS_ARTICLE_GUARD` + `zusätzig*` |
| t4-042 `mitmachen` | «…wenn alle mitmachen.» | Infinitivo correcto; G2 FP | `LEXICON_OVERRIDE_VERB_INFINITIVES` |
| t5-068 `Euro` | «c) Fünfundvierzig Euro.» | Sustantivo moneda correcto; G2 FP | `CURRENCY_UNITS` (bloquea decap erróneo) |
| t5-069 `online` | «…können online gebucht werden.» | Adverbio correcto; G2 FP `lexicon_nn` | Ya en `PURE_ADVERBS` — G2 no usa nuestras listas; normalize OK |

**Diagnóstico `online`:** ver tabla «Findings conocidos en el log G2» en [`INDEX.md`](INDEX.md) — finding esperado, sin acción en revisión semanal.

**Regresión:** 233 archivos, **0 inesperados** (`V32-HOLDOUT-REGRESSION.md` 2026-07-09). Tests: 64/64.

**Wave G2-mini-ronda:** cerrada.

---

## verb_census PROSE — wave V2 (2026-07-09)

**Fuente:** reproceso backlog 587 archivos → **95 ocurrencias** `verb_census_no_finite` en régimen PROSE (**63 únicas**; el resto del total 1298 es ruido T3 telegráfico).

**Clasificación completa:** [`gate-logs/VERB-CENSUS-PROSE-CLASSIFICATION.md`](gate-logs/VERB-CENSUS-PROSE-CLASSIFICATION.md) — **36 REAL** / **59 FP** (a nivel ocurrencia).

| Patrón REAL | Ejemplo | Guard |
|-------------|---------|-------|
| V2 tras pronombre | Wir Essen, Sie Berichten | `shouldDecapitalizeV2SubjectFiniteVerb` |
| V2 tras sujeto plural | Familien Wissen, Parks Besuchen | idem + `V2_SUBJECT_PLURAL_NOUNS` |
| V2 tras adv/trigger | frisch Kochen, Bitte Waschen, Zusammen Essen, Was Raten | `V2_ADV_VERB_TRIGGERS` |
| V2 invertido | Unternehmen wir oft | `V2_INVERTED_PRONOUN_NEXT` |
| Objeto → verbo | Gemüse Essen, Jahre Zahlen | plural noun / `jahre` en whitelist |

**Más conservador que `HOMOGRAPH_RISK`:** lista explícita `V2_FINITE_VERB_LEMMAS` (15 verbos) + bloqueo `V2_NOUN_OBJECT_PREV_BLOCK` (`nur`, `man`, `beispiel`, `euro`, …).

**Regresión:** holdout 233 → **0 inesperados** (`V32-HOLDOUT-REGRESSION.md`); backlog 587 → **0 inesperados** (`gate-logs/V32-BACKLOG-REGRESSION.md`). Tests: **105/105**.

**Wave verb_census PROSE V2:** cerrada.

---

## Findings conocidos — FP recurrentes `verb_census` PROSE

G2 etiqueta `verb_census_no_finite` cuando no detecta verbo finito en el fragmento; en prosa B1 muchos son **sustantivos-objeto correctos** tras sujeto plural o cuantificador. **No re-investigar** en revisión semanal G2:

| Palabra / patrón | Ejemplo típico | Motivo FP |
|------------------|----------------|-----------|
| `Gemüse`, `Obst` | Nachbarn Gemüse und Obst | objeto tras sujeto plural |
| `Interesse` | Menschen Interesse an … | objeto + prep. `an` |
| `Kosten` | man Kosten für Miete | sustantivo (no verbo `kosten`) |
| `Kurse` | Nur / Ausschließlich Kurse für … | objeto tras cuantificador |
| `Zugang` | Lernenden Zugang zu Internet | objeto nominal |
| `Erholung` | Freunde Erholung draußen | objeto nominal |
| `Musikkonzerte` | Nur Musikkonzerte für … | objeto tras `Nur` |
| `Sammelboxen` | sie Sammelboxen in Gebäuden | objeto directo |
| `Bewerbungsgespräche` | zum Beispiel Bewerbungsgespräche, in … | objeto tras `Beispiel` |
| `Wissen` (sust.) | nicht nur Wissen sammeln | sustantivo abstracto |
| `Stärken` | Gemeinschaft Stärken | ambiguo; tratado como FP (sin guard) |
| `Nachrichten` | Erwachsene Nachrichten oft über … | objeto plural |
| `Radfahren` | zum Beispiel Radfahren oder … | nominalización (→ `NOMINALIZED_INFINITIVE_GUARD`) |
| `Familien` (obj.) | Experten Familien bezüglich … | objeto de `empfehlen` |
| `Euro` / `Gebühr` / `Kosten` (T5) | 15 Euro Gebühr; 10 Euro Kosten | unidad monetaria + sustantivo |
| `Schalten` (T5) | Schalten Sie das Licht aus | imperativo tras encabezado — mayúscula correcta |

**Diagnóstico:** mismo criterio que `online` — finding esperado en log G2; normalize no debe tocar estos casos.

---

## T3 — decisión de producto sobre volumen (2026-07-09)

**Hallazgo Q1:** 272/272 T3 en `near_duplicate` con 20 blueprints y ~15 fingerprints distintos — **diseño esperado**, no bug (perturb solo reordena A–J).

**Techo actual:** con 20 blueprints, el banco produce **~15–20 piezas T3 semánticamente distintas**; el resto son variantes de orden/ruido telegráfico.

**Necesidad estimada para app/exámenes simultáneos:** si el producto requiere **>20 exámenes T3 sin repetición perceptible** para el mismo usuario en ventanas cortas, **no basta generar más volumen** de los blueprints actuales.

| Escenario | Política |
|-----------|----------|
| **~15–20 T3 distintos suficientes** (p. ej. rotación lenta, pocos exámenes paralelos) | Limitar generación a **máx. 1 pieza por blueprint por tanda**; aceptar Q1 `near_duplicate` en el excedente como ruido documentado |
| **>20 T3 distintos necesarios** (muchos exámenes simultáneos, baja repetición) | **Tarea futura:** escribir blueprints T3 nuevos (no solo más batches del pool actual). Sin relajar umbral Q1 hasta tener más fingerprints |

**Decisión provisional:** asumir **~20 es el techo útil** con el pool actual → política de generación **máx. 1 por blueprint por tanda**; backlog documentado para nuevos blueprints si escala de producto lo exige.

**No relajar Q1 T3** sin revisión de producto explícita.

---

## Schreiben A2 — techo de premisas (2026-07-10)

**Hallazgo:** backlog A2 en `batches/merged/` = **10 archivos / 5 situaciones** (ratio **2.0×**).

| Situación | n | % backlog |
|-----------|---|-----------|
| arbeit-alltag | 4 | 40% |
| nachbarschaft | 2 | 20% |
| wohnung-suche | 2 | 20% |
| krankmeldung | 1 | 10% |
| kurs-anmeldung | 1 | 10% |

**80%** del backlog (8/10) concentra solo **3** situaciones — mismo patrón de techo de premisas que Lesen T3 (20 blueprints → ~15–20 piezas semánticamente distintas).

| Escenario | Política |
|-----------|----------|
| Volumen A2 actual suficiente | No generar más A2 hasta ampliar pool de premisas/situaciones |
| Escalar volumen A2 (más exámenes sin repetición perceptible) | **Bloqueante:** escribir premisas/situaciones nuevas antes de más batches; no basta regenerar variantes de arbeit-alltag / nachbarschaft / wohnung-suche |

**Decisión:** pool de premisas A2 = **bloqueante antes de escalar volumen**, mismo criterio que la política de blueprints T3 en Lesen (sección anterior).

**No generar más Schreiben A2** sin revisión de producto / ampliación de pool.

---

## Regla general — gates vs. contenido ya generado (2026-07-10)

Cada vez que se **añade o corrige** un gate/clasificador/normalizador (caps, `topicTags`, reglas de `_rejectedReason`, markdown strip, skills dedup, etc.), el contenido generado **antes** de esa fecha **no se beneficia retroactivamente** a menos que se **reprocese explícitamente** (script de backlog / backfill).

**Antes de confiar** en cualquier metadato o etiqueta de un archivo antiguo (`_rejectedReason`, `topicTag` / `topicTags`, `skills`, etc.):

1. Mirar la **fecha de generación** del archivo (mtime / stamp en nombre / historial).
2. Compararla con la **fecha del último cambio** del gate o normalizador correspondiente.
3. Si el archivo es anterior → tratar la etiqueta como **potencialmente obsoleta** hasta reprocesar o revalidar a mano.

**Ejemplos ya vistos:** `_rejectedReason: registro informal ausente` en Schreiben T3 (regla vieja); `topicTags: ["daily_life"]` en Schreiben/Sprechen generated pre-`tagBatchWithTopic` (2026-07-01).

**No asumir** que “está en `.rejected/`” o “tiene daily_life” refleja la lógica viva del pipeline.

---

## Q2 — answerKeyCoherenceGate (2026-07-09)

**Estado:** dry-run — no bloquea pipeline.

| Componente | Rol |
|------------|-----|
| `scripts/lib/qualityGates/answerKeyCoherenceGate.mjs` | Gate LLM clave↔explanation |
| `scripts/lib/llmJsonClient.mjs` | Inferencia JSON (Haiku por defecto) |
| `scripts/run-q2-answer-key-dryrun.mjs` | Bulk holdout + backlog |
| [`Q2-ANSWER-KEY-GATE.md`](Q2-ANSWER-KEY-GATE.md) | Prompt exacto + coste/latencia |

**Modelo:** `claude-haiku-4-5` (1 llamada/archivo). Pre-filtro CHK-18b sin LLM.

**Siguiente:** revisar `gate-logs/Q2-DRYRUN-REPORT.md` → decidir block real vs warn.

---

## Automatización G2 (2026-07-09)

| Componente | Rol |
|------------|-----|
| `scripts/lib/g2FindingsLog.mjs` | Append JSONL persistente |
| `checkLesenBatchQuality` | Invoca log en cada check (modo warn) |
| `generate-lesen-part-gemini.mjs` | Pasa `file` al quality check |
| `make-t3.mjs` | Log tras escribir batch válido (`skipG2Log` en intentos internos) |
| `batches/ready/gate-logs/g2-findings-log.jsonl` | Acumulador entre sesiones |

**No es corrector automático** — solo detección. Corrección sigue siendo humano → lista → regression.

---

## Teil 3 telegráfico — diagnóstico `verb_census` (pendiente G2)

**Archivos:** `lesen-t3-auto-jhnc6c.json` (17 findings), `lesen-t3-auto-u7x6w8.json` (7 findings). **Régimen:** `TELEGRAPHIC_AD`.

### 5 ejemplos (texto completo del anuncio)

| # | Anuncio completo | Palabra | reason G2 | ¿Error real? |
|---|------------------|---------|-----------|--------------|
| 1 | `A) FlexDrive — PKW leihen für Tage & Wochenenden, FS min. 2 Jahre. Abholung Bahnhofsviertel.` | `Bahnhofsviertel` | `verb_census_no_finite` | **Ruido** — nombre de lugar en anuncio telegráfico |
| 2 | `E) Horizont Reisen — Pauschalreisen, Beratung Mi–Fr 10–18 Uhr im Büro.` | `Reisen` | `verb_census_no_finite` | **Ruido** — parte del nombre comercial «Horizont Reisen» |
| 3 | `D) Physik & Co. — Nachhilfe Kl. 9–13, online oder vor Ort. Erste 30 Min. zum Testen kostenlos.` | `Nachhilfe` | `verb_census_no_finite` | **Ruido** — sustantivo en cola telegráfica («Probestunde Nachhilfe») |
| 4 | `F) Gebrauchtwagen West — PKW & Transporter, Kauf oder Kurzzeitmiete, HU, 6 Mon. Garantie schriftlich.` | `Tagesmiete` | `verb_census_no_finite` | **Ruido** — sustantivo compuesto en nombre de producto |
| 5 | `J) SprachTor — Nachhilfe in Arabisch, auch Schrift, Mo 18–19 Uhr, geduldige Betreuung.` | `Schrift` | `verb_census_no_finite` | **Ruido** — sustantivo («auch Schrift» = también escritura), sin verbo finito en el fragmento |

**Conclusión:** Las 24 alertas T3 son **ruido estructural** — `verb_census_no_finite` asume prosa con verbo finito; los anuncios T3 son telegráficos (nombre de negocio + servicios + horario, a menudo sin verbo conjugado).

**Backlog G2 (cuando se revise formalmente, no ahora):** skip `verb_census_no_finite` en régimen `TELEGRAPHIC_AD` (o umbral de longitud/frase sin VFIN). Documentado aquí; **`pos-caps-check.py` sigue congelado**.

---

## Pregunta abierta — estrategia de guards caps

Cada wave de verificación manual encuentra 2–3 palabras nuevas del mismo tipo que ninguna wave anterior cubría. **¿Lista exhaustiva B1 de adj/adv vs. «cazar y añadir»?**

| Enfoque | Pros | Contras |
|---------|------|---------|
| **Lista exhaustiva** (PURE_ADVERBS + ADJ_NEEDS_ARTICLE_GUARD ampliados desde corpus B1) | Menos sorpresas en revisión manual | Riesgo de regresión si la lista es demasiado amplia o ambigua |
| **Cazar y añadir** (actual) | Bajo riesgo, cada guard con test + holdout | 2–3 hallazgos nuevos por wave de revisión |

**Decisión:** pendiente — revisar tras cerrar Q1 shadow (2026-07-23) o tras acumular ≥3 waves con el mismo patrón de descubrimiento.

---

## T4 — rotación de nombres propios (AUD-5)

**Estado 2026-07-10:** **prioridad alta** (3/3 exámenes review e2–e4 repetían Dana/Florian en Hören T4).

| Ámbito | Estado |
|--------|--------|
| **Hören T4** | **Hecho** — `scripts/lib/nameRotation.mjs` + inyección en `generatePartGeminiLib.mjs` (excluye Dana/Florian/… de plantilla; elige 2 nombres menos usados del pool ~25) |
| **Lesen T4** | Pendiente — mismo módulo reusable; cablear en `generate-lesen-part-gemini.mjs` cuando se priorice |
| **Sprechen T1** (diálogo) | **Nota para la otra IA** — confirmar si el formato diálogo converge en el mismo par de nombres; si sí, reutilizar `nameRotation.mjs` |

**Criterio de aceptación (Hören):** en tanda de 3+ T4 nuevos, 0× Dana/Florian; ≥2 pares de nombres distintos.

---

## Hören T3 — techo de premisas en seed (bloqueante, 2026-07-10)

**Hallazgo (cross-examen e2/e3/e4):** los 3 exámenes ensamblados usaron la misma situación base **Büroumzug** en `horen_3` (nombres distintos: Anna/Ben, Anna/Ben, Lena/Tom; `topicTag` Arbeit/Technik). Ningún gate de duplicados por archivo lo ve.

**Dimensión del pool seed** (`library/reusable-seed/de_B1.json`, `module=horen` `teil=3`):

| Métrica | Valor |
|---------|------:|
| Registros Hören T3 | **13** |
| Familias de premisa (heurística) | **~6** |
| Büroumzug | **4** (dominante) |
| Wohnungs-Umzug | 2 |
| Städtetrip/Kurzreise | 2 |
| Wiedersehen-Freunde | 2 |
| Pause/Kaffee + otros | 3 |

**Veredicto:** no es un bug de código del ensamblador en aislamiento — es **techo de contenido** análogo a la política «1 Lesen T3 por blueprint». Con 4/13 Büroumzug, al ensamblar ≥3 exámenes con Hören T3 seed la repetición de premisa es probable.

**Acción:** **bloqueante de contenido** antes de escalar volumen de exámenes con Hören T3 real (no solo seed). **No generar** Hören T3 nuevo en la sesión de caps/nombres — otra sesión debe ampliar situaciones base (objetivo: ≥12 premisas distintas, máx. 1 Büroumzug por tanda de ensamblado).

**ID:** `HOREN-T3-PREMISE-CEILING`

---

## Caps wave review e2/e3/e4 (2026-07-10) — diagnóstico casos documentados

| Caso | Archivo | Por qué no se había aplicado |
|------|---------|------------------------------|
| `Sportlichen` / `Ähnlichen` | t2-093, t5-067 | Documentados en `V3-POST-HUMAN-REVIEW` / `ADJ-GUARD-RISK-ANALYSIS` como **persists**; guards **propuestos pero nunca añadidos** a `ADJ_NEEDS_ARTICLE_GUARD` |
| `Angeboten` | t2-092 | Fuente a veces ya correcta; `angeboten` en guard como **participio** hacía que `germanCapsNormalize` **re-decapara** `Angeboten` tras `solchen` al ensamblar |
| `jungen` / `Verkehrsbehinderungen` | t1-175, h1-001 | Recurrencia Gemini / hueco de lexicon; no había excepción sustantivo `Jungen` ni lemma en supplement |

**Fix:** `v3.3-stable` + reproceso de los 5 fuentes.

---

## Banco — preguntas sin `passageId` (2026-07-10)

| ID | Hallazgo | Tamaño | ¿Toca publicado? | Prioridad |
|----|----------|--------|------------------|-----------|
| **BANK-T3-ORPHANS** | 602 preguntas `lesen` T3 `matching` con `passageId` **undefined** (campo ausente, no dangling) | **602 / 1056 = 57.0%** del banco; 86 grupos × 7 ítems; **0** pasajes T3 en `passages[]` | **No** — 0 IDs en `official-de-B1-e*` ni en `data/exams/de_B1.json`. e1 T3 usa IDs `gen-q-3-vn8ems-*` (tampoco en banco) | Baja — pool T3 legacy; schema T3 = anuncios/`ads`, no pasaje narrativo. Diagnosticar en sesión aparte si conviene `partId`/`adsId` o no indexar T3 en `questions.json` sin contenedor |

**Causa probable:** no es borrado de pasajes. T3 matching nunca tuvo `passageId` en este corpus (ingesta/pool sin contenedor de ads en `passages[]`). Mismo patrón “contenido viejo / schema incompleto” que otros backfills, pero aquí el campo **nunca existió** para estas filas.

**No arreglar** hasta priorizar en otra sesión. Detalle: `gate-logs/BANK-T3-ORPHANS-2026-07-10.md`.

---

## Gates de calidad (Wave 2)

| ID | Qué | Diseño | Bloqueado por | Notas |
|----|-----|--------|---------------|-------|
| **Q2** | `answerKeyCoherenceGate` — coherencia clave ↔ explanation | [`QUALITY-GATES-DESIGN.md`](QUALITY-GATES-DESIGN.md) | Q1 shadow resuelto | Existe `keyExplanationGate.mjs` (CHK-18b) como referencia parcial |
| **Q3-B** | Capa B LLM — coherencia semántica (fluidez, léxico, fidelidad de citas) | [`gate-logs/Q3B-SEMANTIC-COHERENCE-DESIGN-2026-07-10.md`](gate-logs/Q3B-SEMANTIC-COHERENCE-DESIGN-2026-07-10.md) + [`QUALITY-GATES-DESIGN.md`](QUALITY-GATES-DESIGN.md) | Decisión: ¿dry-run ahora o post-ensamblado? | **Priorizado 2026-07-10** tras hallazgos Hören (Ontologie, Reserven/Akzent, cita fabricada). Fixtures 5+3 listos. NO prod todavía |
| **Q1 iter.** | `bank_match` → **warn** (no block) en re-sync/republicación | Recomendación [`Q-DRYRUN-WAVE1b.md`](Q-DRYRUN-WAVE1b.md) | Q1 shadow resuelto | Evitar rechazar contenido ya publicado al re-ingestar |

---

## Caps / normalizador (`germanCapsNormalize`)

| ID | Qué | Diseño | Estado | Notas |
|----|-----|--------|--------|-------|
| **M4** | Fase M4 (`hasNominalSuffix` / `-chen`) | [`ARCH-STABILIZATION-M1-M4-DESIGN.md`](ARCH-STABILIZATION-M1-M4-DESIGN.md) | Luz verde Phase 2 | Primera fase pendiente con protocolo endurecido |
| **M2** | Mecanismo M2 caps | [`ARCH-STABILIZATION-M1-M4-DESIGN.md`](ARCH-STABILIZATION-M1-M4-DESIGN.md) | Pendiente | Tras M4 |
| **M3** | Mecanismo M3 caps | [`ARCH-STABILIZATION-M1-M4-DESIGN.md`](ARCH-STABILIZATION-M1-M4-DESIGN.md) | Pendiente | Tras M2 |
| **M1** | Mecanismo M1 caps | [`ARCH-STABILIZATION-M1-M4-DESIGN.md`](ARCH-STABILIZATION-M1-M4-DESIGN.md) | Pendiente | Tras M3 |

**Protocolo aceptación:** [`PHASE-ACCEPTANCE-PROTOCOL.md`](PHASE-ACCEPTANCE-PROTOCOL.md) — `addedFindings=0`, 3 corpus.

---

## Metadata / scoring

### difficulty — decisión Opción B (2026-07-10)

**Decisión:** el pool **no** persiste `difficulty`. Lesen sigue stripeando el campo en `stripPoolLegacyQuestionFields` / `normalizeBatch` (intencional).

**Fuente de verdad:** runtime únicamente — `ExamBuilder.applyExamDifficulty` → `DifficultyScorer.deriveExamDifficulty` / `scoreQuestion` (+ CefrGate). Motivo: si el pool guardara un entero 1–10, `DifficultyScorer.scoreQuestion` hace short-circuit (`if q.difficulty != null && … return q.difficulty`) y un scorer mejorado no recalcularía sin reproceso masivo del JSON.

**No hacer:** calcular `difficulty` en `enrichBatchMetadata` ni en `finalizePoolReady`.

| ID | Qué | Hallazgo / diseño | Estado |
|----|-----|-------------------|--------|
| **DIFF-SCORE** | Mejorar la fórmula runtime de `DifficultyScorer` (longitud, densidad léxica, subordinadas, CEFR vocab, inferencia) | Histórico: valores de plantilla en pool casi uniformes (4–5). Con Opción B esos valores de plantilla no son la fuente de verdad; el trabajo útil es el scorer de ensamblado. | **Backlog diseño** — sesión propia (runtime only) |
| **DIFF-POOL-RO** | Si algún día hace falta filtrar/buscar el pool por dificultad: función de **solo lectura** que invoque CefrGate/`DifficultyScorer` bajo demanda sobre el contenido del pool, **sin escribir** `difficulty` en el JSON | Evita desincronización scorer↔pool. No implementar hasta necesidad real de producto. | **Diseño propuesto** — no implementar aún |
| **GRAMMAR-PED** | `grammarTags` por relevancia + GRAMMAR-FOCUS + cupo flexible | `v2.0-focus-flexible-2026-07-10`. Ninguna categoría >35%. Muestra 12/12 vacíos = vacío correcto (umbrales). | **Producción OK (2026-07-10)** |
| **GRAMMAR-FOCUS** | Blob primario = question/explanation/correct; pasaje solo refuerzo | Incluido en v2.0 | Hecho |
| **GRAMMAR-SHORT-BLOB** | Si blob primario &lt; ~80 chars, valorar ampliar ligeramente el ítem (p.ej. más contexto de options) | Pool: solo 3/316 vacíos con blob&lt;80; muestra 12 no mostró “vacío por blob insuficiente”. Refinamiento opcional, no bloquea v2.0. | **Backlog menor** |
| **VOCAB-EXAM-STEM** | Exclusión estructural de plantillas de enunciado (por módulo/Teil) vs. contenido de pasaje/audio | v2.3 ya strippea fórmulas `Worum geht es…?` conocidas dentro de `extractVocabularyFromText`. Un split completo plantilla↔contenido exigiría catálogo de stems por Teil o campos separados en el JSON. | **Mejora aparte** si el strip regex no basta |

Detalle vocab v2.2 (P0 gap cerrado): [`gate-logs/VOCAB-P0-RECONCILE-2026-07-10.md`](gate-logs/VOCAB-P0-RECONCILE-2026-07-10.md).

---

## Perfiles Q4 futuros

| ID | Qué | Cuándo |
|----|-----|--------|
| **servible_publish** | `difficulty/skills/examType/topicTags` de warn → block | Tras publish-lesen-generated estable en producción |

---

## Referencia rápida

| Área | Índice |
|------|--------|
| Gates en producción | [`INDEX.md`](INDEX.md) |
| Integración Wave 1c | [`Q-WAVE1c-INTEGRATION.md`](Q-WAVE1c-INTEGRATION.md) |
| Revisión programada | [`PENDING-REVIEWS.md`](PENDING-REVIEWS.md) |
