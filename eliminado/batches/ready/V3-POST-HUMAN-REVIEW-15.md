# v3.0-stable vs revisión humana — 15 generados

**Normalización:** `v3.0-stable` (simulada post-generación)
**Gate:** v6.1-B-G2 (frozen)
**Fecha:** 2026-07-08T16:09:48.896Z

## Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Findings gate (raw) | 7 |
| Findings gate (post-v3) | 7 |
| Δ gate | 0 |
| Issues humanos → corregidos por v3 | **1** (Freien→freien) |
| Issues humanos → persisten | **16** |
| Issues humanos → parcial/revertido | 0 |
| Regresiones v3 | 0 |
| Grupos duplicación detectados | **1** (t3 qeh7ew↔tz7n7y) |

## 1. Duplicación de contenido

- **Confirmado (hash):** `lesen-t3-auto-qeh7ew.json` ↔ `lesen-t3-auto-tz7n7y.json` — mismo set de 7 preguntas + mismos anuncios (solo permutación de letras A–J).
- **Revisión humana (no byte-identical en pool actual):** `lesen-t1-gemini-177.json` (Theaterverein), `lesen-t2-gemini-091.json` (Familienzeit) — posible reutilización semántica/plantilla vs archivos analizados en sesiones previas, no duplicado exacto en `batches/generated`+`ready`.

## 2. Errores de capitalización — checklist humano vs post-v3

| archivo | error | categoría | antes | después v3 | estado | componente | fix propuesto |
|---|---|---|---|---|---|---|---|
| `lesen-t2-gemini-092.json` | ein Wichtiger Schritt | adj_over_cap | `…ig, damit jeder teilnehmen kann. Es ist ein Wicht` | `…ig, damit jeder teilnehmen kann. Es ist ein Wicht` | **persists** | generador (prompt) | Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2) |
| `lesen-t2-gemini-092.json` | das Nächste Fest | adj_over_cap | `…ernen. Die Organisatoren planen bereits das Nächs` | `…ernen. Die Organisatoren planen bereits das Nächs` | **persists** | generador (prompt) | Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2) |
| `lesen-t2-gemini-092.json` | ein Alter Industriebau | adj_over_cap | `… das jetzt das Kulturzentrum ist, zuvor ein Alter` | `… das jetzt das Kulturzentrum ist, zuvor ein Alter` | **persists** | generador (prompt) | Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2) |
| `lesen-t2-gemini-092.json` | eine Breite Teilnahme | adj_over_cap | `…Kosten für die Kurse gering sind, damit eine Brei` | `…Kosten für die Kurse gering sind, damit eine Brei` | **persists** | generador (prompt) | Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2) |
| `lesen-t2-gemini-093.json` | den Täglichen Weg | adj_over_cap | `…n großen Städten nutzen das Fahrrad für den Tägli` | `…n großen Städten nutzen das Fahrrad für den Tägli` | **persists** | generador (prompt) | Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2) |
| `lesen-t2-gemini-093.json` | in den Letzten fünf Jahren | adj_over_cap | `…hrer. Ein aktueller Bericht zeigt, dass in den Le` | `…hrer. Ein aktueller Bericht zeigt, dass in den Le` | **persists** | generador (prompt) | Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2) |
| `lesen-t2-gemini-093.json` | in den Nächsten drei Jahren | adj_over_cap | `… verbessern. Die Stadtverwaltung plant, in den Nä` | `… verbessern. Die Stadtverwaltung plant, in den Nä` | **persists** | generador (prompt) | Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2) |
| `lesen-t2-gemini-093.json` | Sportlichen Aktivitäten | adj_over_cap | `… Gemeinschaft und Gesundheit. Neben den Sportlich` | `… Gemeinschaft und Gesundheit. Neben den Sportlich` | **persists** | generador (prompt) | Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2) |
| `lesen-t2-gemini-091.json` | Wichtige Rolle / Wichtiger Bestandteil | adj_over_cap | `…Auch gemeinsame Mahlzeiten spielen eine Wichtige ` | `…Auch gemeinsame Mahlzeiten spielen eine Wichtige ` | **persists** | generador (prompt) | Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2) |
| `lesen-t3-auto-qeh7ew.json` | Die Kleine Emma | adj_over_cap | `…Die Kleine Emma soll ein Tasteninstrument erlerne` | `…Die Kleine Emma soll ein Tasteninstrument erlerne` | **persists** | generador (prompt) | Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2) |
| `lesen-t3-auto-tz7n7y.json` | Die Kleine Emma | adj_over_cap | `…Die Kleine Emma soll ein Tasteninstrument erlerne` | `…Die Kleine Emma soll ein Tasteninstrument erlerne` | **persists** | generador (prompt) | Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2) |
| `lesen-t4-gemini-036.json` | ein Wichtiger Schritt (Clara) | adj_over_cap | `…nder, die gerne draußen spielen. Es ist ein Wicht` | `…nder, die gerne draußen spielen. Es ist ein Wicht` | **persists** | generador (prompt) | Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2) |
| `lesen-t4-gemini-037.json` | etwas wichtiges (falta Wichtiges) | substantiv_missing_cap | `…Manchmal vergesse ich etwas wichtiges für das Abe` | `…Manchmal vergesse ich etwas wichtiges für das Abe` | **persists** | normalizador (gap) | Ampliar sustantivadores (etwas/nichts/viel) en capitalizeNouns + verificar orden decap→cap |
| `lesen-t4-gemini-037.json` | die Kleinen Läden/Geschäfte | adj_over_cap | `…Ich finde, die Kleinen Läden in der Stadt hätten ` | `…Ich finde, die Kleinen Läden in der Stadt hätten ` | **persists** | auditor/gate (ambigüedad sustantivación) | Gate pide minúscula pero es sustantivación (Kleine Läden); revisar regla gate vs normalize |
| `lesen-t5-gemini-063.json` | Inicio oración minúscula tras encabezado (persönliche Gegenstände) | sentence_start_lowercase | `… Sie an der Information und online.
3.  **Umkleid` | `… Sie an der Information und online.
3.  **Umkleid` | **persists** | plantilla t5-reglamento + generador | Post-proceso sentence-start tras `**Header:**` en pipeline o regla en prompt t5 plantilla reglamento |
| `lesen-t5-gemini-065.json` | Inicio oración minúscula tras encabezado (persönliche Daten) | sentence_start_lowercase | `…ie IT-Abteilung informiert werden.

4.  **Datensc` | `…ie IT-Abteilung informiert werden.

4.  **Datensc` | **persists** | plantilla t5-reglamento + generador | Post-proceso sentence-start tras `**Header:**` en pipeline o regla en prompt t5 plantilla reglamento |
| `lesen-t5-gemini-067.json` | den Freien Verkehr | adj_over_cap | `…um den Freien Verkehr…` | `…um den freien Verkehr…` | **fixed_by_v3** | normalizador (OK v3) | OK en v3; verificar despliegue en prod |
| `lesen-t5-gemini-067.json` | Ähnlichen/Ähnliche Fortbewegungsmittel | adj_over_cap | `…Mitführen von Rollern, Skateboards oder Ähnlichen` | `…Mitführen von Rollern, Skateboards oder Ähnlichen` | **persists** | generador (prompt) | Añadir ähnlich a heurística adj o lista homograph; o regla comparativo+Artikel |

## 3. Patrones por Teil

| Teil | issues checklist | corregidos v3 | persisten |
|---:|---:|---:|---:|
| 1 | 1 | 0 | 0 |
| 2 | 10 | 0 | 9 |
| 3 | 4 | 0 | 2 |
| 4 | 3 | 0 | 3 |
| 5 | 4 | 0 | 4 |

### Interpretación por componente

| Componente | Rol en este lote |
|---|---|
| **Prompt generador** | Inconsistencia bidireccional caps (sobra Y falta); adj capitalizados en texto/explicaciones/signText |
| **Plantilla fija** | t3-auto recicla 7 preguntas; t5-reglamento repite patrón `**Header:**` + minúscula inicial |
| **Normalizador v3** | Corrige subset adj-over-cap (p.ej. Freien→freien); no toca inicio oración ni todos los adj |
| **Auditor (gate)** | Detecta 7 casos ambiguos; no corrige; a veces discrepa con criterio humano (Kleinen) |

## 4. Ejemplos detallados

### `lesen-t2-gemini-092.json` — ein Wichtiger Schritt
- **Estado:** persists
- **Antes:** …ig, damit jeder teilnehmen kann. Es ist ein Wichtiger Schritt für die kulturelle Entwicklung. Die Erö…
- **Post-v3:** …ig, damit jeder teilnehmen kann. Es ist ein Wichtiger Schritt für die kulturelle Entwicklung. Die Erö…
- **Componente:** generador (prompt)
- **Fix:** Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2)
### `lesen-t2-gemini-092.json` — das Nächste Fest
- **Estado:** persists
- **Antes:** …ernen. Die Organisatoren planen bereits das Nächste Fest und hoffen auf noch mehr internationale…
- **Post-v3:** …ernen. Die Organisatoren planen bereits das Nächste Fest und hoffen auf noch mehr internationale…
- **Componente:** generador (prompt)
- **Fix:** Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2)
### `lesen-t2-gemini-092.json` — ein Alter Industriebau
- **Estado:** persists
- **Antes:** … das jetzt das Kulturzentrum ist, zuvor ein Alter Industriebau war.…
- **Post-v3:** … das jetzt das Kulturzentrum ist, zuvor ein Alter Industriebau war.…
- **Componente:** generador (prompt)
- **Fix:** Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2)
### `lesen-t2-gemini-092.json` — eine Breite Teilnahme
- **Estado:** persists
- **Antes:** …Kosten für die Kurse gering sind, damit eine Breite Teilnahme möglich ist.…
- **Post-v3:** …Kosten für die Kurse gering sind, damit eine Breite Teilnahme möglich ist.…
- **Componente:** generador (prompt)
- **Fix:** Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2)
### `lesen-t2-gemini-093.json` — den Täglichen Weg
- **Estado:** persists
- **Antes:** …n großen Städten nutzen das Fahrrad für den Täglichen Weg zur Arbeit oder zur Schule. Das ist gut…
- **Post-v3:** …n großen Städten nutzen das Fahrrad für den Täglichen Weg zur Arbeit oder zur Schule. Das ist gut…
- **Componente:** generador (prompt)
- **Fix:** Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2)
### `lesen-t2-gemini-093.json` — in den Letzten fünf Jahren
- **Estado:** persists
- **Antes:** …hrer. Ein aktueller Bericht zeigt, dass in den Letzten fünf Jahren die Zahl der Radfahrer um 20 Prozent ge…
- **Post-v3:** …hrer. Ein aktueller Bericht zeigt, dass in den Letzten fünf Jahren die Zahl der Radfahrer um 20 Prozent ge…
- **Componente:** generador (prompt)
- **Fix:** Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2)
### `lesen-t2-gemini-093.json` — in den Nächsten drei Jahren
- **Estado:** persists
- **Antes:** … verbessern. Die Stadtverwaltung plant, in den Nächsten drei Jahren weitere 50 Kilometer Radwege zu bauen u…
- **Post-v3:** … verbessern. Die Stadtverwaltung plant, in den Nächsten drei Jahren weitere 50 Kilometer Radwege zu bauen u…
- **Componente:** generador (prompt)
- **Fix:** Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2)
### `lesen-t2-gemini-093.json` — Sportlichen Aktivitäten
- **Estado:** persists
- **Antes:** … Gemeinschaft und Gesundheit. Neben den Sportlichen Aktivitäten gibt es auch gemeinsame Ausflüge und Fe…
- **Post-v3:** … Gemeinschaft und Gesundheit. Neben den Sportlichen Aktivitäten gibt es auch gemeinsame Ausflüge und Fe…
- **Componente:** generador (prompt)
- **Fix:** Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2)
### `lesen-t2-gemini-091.json` — Wichtige Rolle / Wichtiger Bestandteil
- **Estado:** persists
- **Antes:** …Auch gemeinsame Mahlzeiten spielen eine Wichtige Rolle. Viele Eltern kochen am Samstag oder So…
- **Post-v3:** …Auch gemeinsame Mahlzeiten spielen eine Wichtige Rolle. Viele Eltern kochen am Samstag oder So…
- **Componente:** generador (prompt)
- **Fix:** Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2)
### `lesen-t3-auto-qeh7ew.json` — Die Kleine Emma
- **Estado:** persists
- **Antes:** …Die Kleine Emma soll ein Tasteninstrument erlernen.…
- **Post-v3:** …Die Kleine Emma soll ein Tasteninstrument erlernen.…
- **Componente:** generador (prompt)
- **Fix:** Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2)
### `lesen-t3-auto-tz7n7y.json` — Die Kleine Emma
- **Estado:** persists
- **Antes:** …Die Kleine Emma soll ein Tasteninstrument erlernen.…
- **Post-v3:** …Die Kleine Emma soll ein Tasteninstrument erlernen.…
- **Componente:** generador (prompt)
- **Fix:** Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2)
### `lesen-t4-gemini-036.json` — ein Wichtiger Schritt (Clara)
- **Estado:** persists
- **Antes:** …nder, die gerne draußen spielen. Es ist ein Wichtiger Schritt für mehr Sport in der Stadt. Ich unters…
- **Post-v3:** …nder, die gerne draußen spielen. Es ist ein Wichtiger Schritt für mehr Sport in der Stadt. Ich unters…
- **Componente:** generador (prompt)
- **Fix:** Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2)

## 5. Propuestas de fix (sin implementar)

1. **t3-auto dedup:** rechazar ingest si `t3CanonicalSignature` ya existe en pool activo.
2. **t5 sentence-start:** regla post-gen `/: \p{Ll}/` → capitalizar tras `**Sección:**` (fuera de germanCapsNormalize o capa nueva).
3. **Sustantivación etwas/nichts:** verificar que `capitalizeBatchNouns` corre en prod tras decap; ampliar triggers si persiste.
4. **Adj tras artículo:** extender cobertura a Letzten/Nächsten/Sportlichen/Täglichen (misma familia que G2).
5. **Kleinen Läden:** resolver ambigüedad gate (sustantivación) vs normalize (decap adj) con criterio documentado.
6. **Ähnliche/Ähnlichen:** añadir a heurística solo con evidencia (comparativo + noun phrase).

JSON: `V3-POST-HUMAN-REVIEW-15.json`
