# ADJ_NEEDS_ARTICLE_GUARD — análisis de riesgo

**Corpus:** 696 archivos · 127 ocurrencias capitalizadas mid-sentence
**Nota:** wichtig, letzt, nächst, klein ya tienen formas en ADJ_NEEDS_ARTICLE_GUARD; täglich, sportlich, breit, ähnlich NO

## Tabla resumen

| palabra | usos adjetivales (error FP target) | usos sustantivados (FN riesgo) | ambiguos | ya en guard | riesgo añadir al guard | recomendación |
|---:|---:|---:|---:|---|---:|---|
| **wichtig** | 13 | 21 | 0 | wichtigen, wichtig, wichtiger, wichtigem, wichtiges, wichtige, wichtigeres | **alto** | YA en guard (wichtig/wichtiger/…); investigar por qué no decap en prod (orden cap/decap o isMidSentence) |
| **täglich** | 1 | 0 | 10 | — | **medio-alto** | Añadir con condición: solo tras artículo, no si lexicon noun |
| **letzt** | 0 | 35 | 0 | letzte, letzten | **alto** | YA en guard (letzte/nächste/…); añadir solo si faltan flexiones (Letzten, Nächsten) |
| **nächst** | 3 | 6 | 0 | nächsten, nächste, nächstes | **alto** | YA en guard (letzte/nächste/…); añadir solo si faltan flexiones (Letzten, Nächsten) |
| **sportlich** | 2 | 0 | 0 | — | **bajo** | Añadir al guard con evidencia — solo usos adjetivales en corpus |
| **breit** | 2 | 0 | 0 | — | **bajo** | Añadir al guard con evidencia — solo usos adjetivales en corpus |
| **klein** | 3 | 25 | 3 | kleinen, kleine | **alto** | YA en guard; no ampliar — riesgo die Kleinen (S.). Mejor regla contextual nombre propio (Emma) |
| **ähnlich** | 0 | 3 | 0 | — | **alto** | NO añadir globalmente; regla contextual «oder Ähnliches» vs adj+Sustantiv |

## Detalle por palabra

### wichtig

**Adjetivales (decap correcto):**
- `Wichtigkeit` en `batches/generated/.rejected/lesen-t4-gemini-036-2026-07-06T18-26-52-409Z.json` — artículo «die» + adj + «Gewohnheiten»
- `Wichtigen` en `batches/generated/.rejected/lesen-t4-gemini-036-2026-07-08T07-19-15-100Z.json` — artículo «einen» + adj + «Vorschlag»
- `Wichtiger` en `batches/generated/.rejected/lesen-t4-gemini-037-2026-07-08T08-14-49-601Z.json` — artículo «ein» + adj + sustantivo «Schritt»
- `Wichtigen` en `batches/generated/.rejected/lesen-t4-gemini-037-2026-07-08T08-14-49-601Z.json` — artículo «als» + adj + sustantivo «Schritt»
- `Wichtigen` en `batches/generated/.rejected/lesen-t4-gemini-038-2026-07-08T08-25-21-026Z.json` — artículo «einen» + adj + «Vorschlag»

**Sustantivados (NO decap):**
- `Wichtigkeit` en `batches/generated/.rejected/lesen-t2-gemini-057-2026-06-29T14-32-09-716Z.json` — artículo «die» + Wichtigkeit sin sustantivo siguiente (sustantivado)
- `Wichtigkeit` en `batches/generated/.rejected/lesen-t4-gemini-036-2026-07-08T07-19-15-100Z.json` — artículo «die» + Wichtigkeit sin sustantivo siguiente (sustantivado)
- `Wichtig` en `batches/generated/.rejected/lesen-t4-gemini-036-2026-07-08T07-19-15-100Z.json` — artículo «diese» + Wichtig sin sustantivo siguiente (sustantivado)
- `Wichtigkeit` en `batches/generated/.rejected/lesen-t4-gemini-037-2026-07-08T08-14-49-601Z.json` — artículo «die» + Wichtigkeit sin sustantivo siguiente (sustantivado)
- `Wichtig` en `batches/generated/.rejected/lesen-t4-gemini-037-2026-07-08T08-14-49-601Z.json` — artículo «als» + Wichtig sin sustantivo siguiente (sustantivado)

### täglich

**Adjetivales (decap correcto):**
- `Täglichen` en `batches/generated/lesen-t2-gemini-093.json` — artículo «den» + adj + «Weg»

**Ambiguos:**
- `Täglich` en `batches/generated/.rejected/lesen-t5-gemini-004.json` — contexto no claro (prev=b, next=von)
- `Täglich` en `batches/generated/.rejected/lesen-t5-gemini-007.json` — contexto no claro (prev=b, next=von)
- `Täglich` en `batches/generated/.rejected/lesen-t5-gemini-008.json` — contexto no claro (prev=Wellness, next=bis)
- `Täglich` en `batches/generated/lesen-t5-gemini-025.json` — contexto no claro (prev=b, next=von)
- `Täglich` en `batches/generated/lesen-t5-gemini-027.json` — contexto no claro (prev=c, next=von)

### letzt

**Sustantivados (NO decap):**
- `Letzte` en `batches/generated/.rejected/lesen-t1-gemini-094.json` — en lexicon como sustantivo
- `Letztes` en `batches/generated/.rejected/lesen-t1-gemini-098.json` — en lexicon como sustantivo
- `Letzte` en `batches/generated/.rejected/lesen-t1-gemini-103.json` — en lexicon como sustantivo
- `Letztes` en `batches/generated/.rejected/lesen-t1-gemini-109.json` — en lexicon como sustantivo
- `Letztes` en `batches/generated/.rejected/lesen-t1-gemini-110.json` — en lexicon como sustantivo

### nächst

**Adjetivales (decap correcto):**
- `Nächste` en `batches/generated/lesen-t1-gemini-151.json` — artículo «das» + adj + «Abenteuer»
- `Nächste` en `batches/generated/lesen-t1-gemini-177.json` — artículo «das» + adj + «Stadtfest»
- `Nächste` en `batches/generated/lesen-t2-gemini-092.json` — artículo «das» + adj + «Fest»

**Sustantivados (NO decap):**
- `Nächsten` en `batches/generated/.rejected/lesen-t1-gemini-063.json` — en lexicon como sustantivo
- `Nächsten` en `batches/generated/.rejected/lesen-t4-auto-9eidf2.json` — artículo «den» + Nächsten sin sustantivo siguiente (sustantivado)
- `Nächsten` en `batches/generated/lesen-t2-gemini-058.json` — en lexicon como sustantivo
- `Nächsten` en `batches/generated/lesen-t2-gemini-093.json` — artículo «den» + Nächsten sin sustantivo siguiente (sustantivado)
- `Nächsten` en `batches/generated/lesen-t2-gemini-093.json` — artículo «den» + Nächsten sin sustantivo siguiente (sustantivado)

### sportlich

**Adjetivales (decap correcto):**
- `Sportlichen` en `batches/generated/lesen-t2-gemini-093.json` — artículo «den» + adj + «Aktivitäten»
- `Sportlichen` en `batches/generated/lesen-t2-gemini-093.json` — artículo «den» + adj + «Aktivitäten»

### breit

**Adjetivales (decap correcto):**
- `Breitere` en `batches/generated/.rejected/lesen-t4-auto-5rv7iq.json` — seguido de sustantivo «Radwege»
- `Breite` en `batches/generated/lesen-t2-gemini-092.json` — artículo «eine» + adj + «Teilnahme»

### klein

**Adjetivales (decap correcto):**
- `Kleinen` en `batches/generated/lesen-t2-gemini-090.json` — artículo «Diese» + adj + «Auszeiten»
- `Kleine` en `batches/generated/lesen-t3-auto-qeh7ew.json` — artículo «Die» + adj + «Emma»
- `Kleingartenverein` en `batches/generated/lesen-t5-gemini-009.json` — artículo «den» + adj + «Sonnenschein»

**Sustantivados (NO decap):**
- `Kleinen` en `batches/generated/.rejected/lesen-t1-gemini-112.json` — artículo «die» + Kleinen sin sustantivo siguiente (sustantivado)
- `Kleinstadt` en `batches/generated/.rejected/lesen-t1-gemini-132-2026-07-06T16-31-58-399Z.json` — artículo «der» + Kleinstadt sin sustantivo siguiente (sustantivado)
- `Kleinstadt` en `batches/generated/.rejected/lesen-t4-auto-9eidf2.json` — artículo «meiner» + Kleinstadt sin sustantivo siguiente (sustantivado)
- `Kleine` en `batches/generated/.rejected/lesen-t4-auto-ay7xhf.json` — en lexicon como sustantivo
- `Kleine` en `batches/generated/.rejected/lesen-t4-auto-ugo3p4.json` — en lexicon como sustantivo

**Ambiguos:**
- `Kleinigkeiten` en `batches/generated/.rejected/lesen-t1-gemini-077.json` — contexto no claro (prev=über, next=zu)
- `Kleinigkeiten` en `batches/generated/.rejected/lesen-t1-gemini-106.json` — contexto no claro (prev=auch, next=reklamieren)
- `Kleinen` en `batches/generated/lesen-t4-gemini-037.json` — artículo+Kleinen+Läden (adj vs sustantivación coloquial)

### ähnlich

**Sustantivados (NO decap):**
- `Ähnliche` en `batches/generated/.rejected/lesen-t4-gemini-003.json` — en lexicon como sustantivo
- `Ähnlichen` en `batches/generated/lesen-t5-gemini-067.json` — en lexicon como sustantivo
- `Ähnliche` en `batches/generated/lesen-t5-gemini-067.json` — en lexicon como sustantivo

JSON completo: `ADJ-GUARD-RISK-ANALYSIS.json`
