# G2 Inspector — wave 2a (Prueba_2 / generated)

**Fecha:** 2026-07-09T12:34:02.502Z
**Gate:** v6.1-B-G2 (frozen)
**Archivos:** 30
**Findings totales:** 37
**Promedio/archivo:** 1.233 (holdout 193: 0.456 = 45.60%)
**Δ vs holdout:** +0.777 → lote igual o peor

## Findings por archivo

| Archivo | Teil | N | Detalle |
|---|---|---:|---|
| lesen-t1-gemini-178.json | T1 | 0 | — |
| lesen-t1-gemini-179.json | T1 | 0 | — |
| lesen-t1-gemini-180.json | T1 | 1 | `besuchen` (lexicon_override_tag) |
| lesen-t1-gemini-181.json | T1 | 0 | — |
| lesen-t1-gemini-182.json | T1 | 0 | — |
| lesen-t2-gemini-094.json | T2 | 4 | `Familien` (verb_census_no_finite); `löschen` (lexicon_override_tag); `machen` (lexicon_override_tag); `machen` (lexicon_override_tag) |
| lesen-t2-gemini-095.json | T2 | 2 | `teil` (lexicon_override_tag); `verantwortlichen` (lexicon_nn) |
| lesen-t2-gemini-096.json | T2 | 0 | — |
| lesen-t2-gemini-097.json | T2 | 1 | `Radfahren` (verb_census_no_finite) |
| lesen-t2-gemini-098.json | T2 | 0 | — |
| lesen-t3-auto-1u2l8c.json | T3 | 0 | — |
| lesen-t3-auto-5hhflb.json | T3 | 0 | — |
| lesen-t3-auto-dfn273.json | T3 | 0 | — |
| lesen-t3-auto-jhnc6c.json | T3 | 17 | `Bahnhofsviertel` (verb_census_no_finite); `Reisen` (verb_census_no_finite); `Bahnhofsviertel` (verb_census_no_finite); `Reisen` (verb_census_no_finite); `Ton` (verb_census_no_finite); `Nachhilfe` (verb_census_no_finite); `Bahnhofsviertel` (verb_census_no_finite); `Reisen` (verb_census_no_finite); `Bahnhofsviertel` (verb_census_no_finite); `Reisen` (verb_census_no_finite); `Bahnhofsviertel` (verb_census_no_finite); `Reisen` (verb_census_no_finite); `Bahnhofsviertel` (verb_census_no_finite); `Reisen` (verb_census_no_finite); `Tagesmiete` (verb_census_no_finite); `Bahnhofsviertel` (verb_census_no_finite); `Reisen` (verb_census_no_finite) |
| lesen-t3-auto-jja73u.json | T3 | 0 | — |
| lesen-t3-auto-n0lt9z.json | T3 | 0 | — |
| lesen-t3-auto-sds0gv.json | T3 | 0 | — |
| lesen-t3-auto-u7x6w8.json | T3 | 7 | `Schrift` (verb_census_no_finite); `Schrift` (verb_census_no_finite); `Schrift` (verb_census_no_finite); `Schrift` (verb_census_no_finite); `Schrift` (verb_census_no_finite); `Schrift` (verb_census_no_finite); `Schrift` (verb_census_no_finite) |
| lesen-t4-gemini-038.json | T4 | 0 | — |
| lesen-t4-gemini-039.json | T4 | 1 | `Zusätzlichen` (adj_before_noun) |
| lesen-t4-gemini-040.json | T4 | 1 | `Automatische` (adj_before_noun) |
| lesen-t4-gemini-041.json | T4 | 0 | — |
| lesen-t4-gemini-042.json | T4 | 1 | `mitmachen` (lexicon_override_tag) |
| lesen-t5-gemini-068.json | T5 | 1 | `Euro` (verb_census_no_finite) |
| lesen-t5-gemini-069.json | T5 | 1 | `online` (lexicon_nn) |
| lesen-t5-gemini-070.json | T5 | 0 | — |
| lesen-t5-gemini-071.json | T5 | 0 | — |
| lesen-t5-gemini-072.json | T5 | 0 | — |
| lesen-t5-gemini-073.json | T5 | 0 | — |
| lesen-t5-gemini-074.json | T5 | 0 | — |

## 3 pendientes conocidos (BACKLOG wave 2)

| Patrón | Archivo | ¿G2 marca? | reason |
|---|---|---|---|
| studierenden | lesen-t5-gemini-070.json | **NO** | — |
| Zahlenden | lesen-t5-gemini-070.json | **NO** | — |
| Automatische | lesen-t4-gemini-040.json | **SÍ** | adj_before_noun |

## Findings nuevos / no revisados manualmente

| Archivo | word | type | reason | context |
|---|---|---|---|---|
| lesen-t1-gemini-180.json | besuchen | noun_lowercase | lexicon_override_tag | unsere Gemeinschaft. Manchmal besuchen wir auch meine Eltern |
| lesen-t2-gemini-094.json | Familien | wrong_capitalized | verb_census_no_finite | Was empfehlen Experten Familien bezüglich der Nutzung sozial |
| lesen-t2-gemini-094.json | löschen | noun_lowercase | lexicon_override_tag | Fotos von Kindern sofort löschen. |
| lesen-t2-gemini-094.json | machen | noun_lowercase | lexicon_override_tag | keine persönlichen Informationen öffentlich machen sollte. |
| lesen-t2-gemini-094.json | machen | noun_lowercase | lexicon_override_tag | keine persönlichen Informationen öffentlich machen. |
| lesen-t2-gemini-095.json | teil | noun_lowercase | lexicon_override_tag | 80 Personen nehmen regelmäßig teil. Die Stadt plant |
| lesen-t2-gemini-095.json | verantwortlichen | noun_lowercase | lexicon_nn | Was planen die verantwortlichen für die Zukunft des |
| lesen-t2-gemini-097.json | Radfahren | wrong_capitalized | verb_census_no_finite | , wie zum Beispiel Radfahren oder Parkbesuche. |
| lesen-t3-auto-jhnc6c.json | Bahnhofsviertel | wrong_capitalized | verb_census_no_finite | 2 Jahre. Abholung Bahnhofsviertel. |
| lesen-t3-auto-jhnc6c.json | Reisen | wrong_capitalized | verb_census_no_finite | E) Horizont Reisen — Pauschalreisen, Beratung |
| lesen-t3-auto-jhnc6c.json | Bahnhofsviertel | wrong_capitalized | verb_census_no_finite | 2 Jahre. Abholung Bahnhofsviertel. |
| lesen-t3-auto-jhnc6c.json | Reisen | wrong_capitalized | verb_census_no_finite | E) Horizont Reisen — Pauschalreisen, Beratung |
| lesen-t3-auto-jhnc6c.json | Ton | wrong_capitalized | verb_census_no_finite | Professioneller Ton in Korrespondenz — Schreibcoaching |
| lesen-t3-auto-jhnc6c.json | Nachhilfe | wrong_capitalized | verb_census_no_finite | PC-Hilfe oder kostenlose Probestunde Nachhilfe. |
| lesen-t3-auto-jhnc6c.json | Bahnhofsviertel | wrong_capitalized | verb_census_no_finite | 2 Jahre. Abholung Bahnhofsviertel. |
| lesen-t3-auto-jhnc6c.json | Reisen | wrong_capitalized | verb_census_no_finite | E) Horizont Reisen — Pauschalreisen, Beratung |
| lesen-t3-auto-jhnc6c.json | Bahnhofsviertel | wrong_capitalized | verb_census_no_finite | 2 Jahre. Abholung Bahnhofsviertel. |
| lesen-t3-auto-jhnc6c.json | Reisen | wrong_capitalized | verb_census_no_finite | E) Horizont Reisen — Pauschalreisen, Beratung |
| lesen-t3-auto-jhnc6c.json | Bahnhofsviertel | wrong_capitalized | verb_census_no_finite | 2 Jahre. Abholung Bahnhofsviertel. |
| lesen-t3-auto-jhnc6c.json | Reisen | wrong_capitalized | verb_census_no_finite | E) Horizont Reisen — Pauschalreisen, Beratung |
| lesen-t3-auto-jhnc6c.json | Bahnhofsviertel | wrong_capitalized | verb_census_no_finite | 2 Jahre. Abholung Bahnhofsviertel. |
| lesen-t3-auto-jhnc6c.json | Reisen | wrong_capitalized | verb_census_no_finite | E) Horizont Reisen — Pauschalreisen, Beratung |
| lesen-t3-auto-jhnc6c.json | Tagesmiete | wrong_capitalized | verb_census_no_finite | ohne Kauf — FlexDrive Tagesmiete, nicht Gebrauchtwagen West |
| lesen-t3-auto-jhnc6c.json | Bahnhofsviertel | wrong_capitalized | verb_census_no_finite | 2 Jahre. Abholung Bahnhofsviertel. |
| lesen-t3-auto-jhnc6c.json | Reisen | wrong_capitalized | verb_census_no_finite | E) Horizont Reisen — Pauschalreisen, Beratung |
| lesen-t3-auto-u7x6w8.json | Schrift | wrong_capitalized | verb_census_no_finite | in Arabisch, auch Schrift, Mo 18–19 Uhr |
| lesen-t3-auto-u7x6w8.json | Schrift | wrong_capitalized | verb_census_no_finite | in Arabisch, auch Schrift, Mo 18–19 Uhr |
| lesen-t3-auto-u7x6w8.json | Schrift | wrong_capitalized | verb_census_no_finite | in Arabisch, auch Schrift, Mo 18–19 Uhr |
| lesen-t3-auto-u7x6w8.json | Schrift | wrong_capitalized | verb_census_no_finite | in Arabisch, auch Schrift, Mo 18–19 Uhr |
| lesen-t3-auto-u7x6w8.json | Schrift | wrong_capitalized | verb_census_no_finite | in Arabisch, auch Schrift, Mo 18–19 Uhr |
| lesen-t3-auto-u7x6w8.json | Schrift | wrong_capitalized | verb_census_no_finite | in Arabisch, auch Schrift, Mo 18–19 Uhr |
| lesen-t3-auto-u7x6w8.json | Schrift | wrong_capitalized | verb_census_no_finite | in Arabisch, auch Schrift, Mo 18–19 Uhr |
| lesen-t4-gemini-039.json | Zusätzlichen | wrong_capitalized | adj_before_noun | , und hält einen Zusätzlichen Gratis-Sonntag für unnötig. |
| lesen-t4-gemini-042.json | mitmachen | noun_lowercase | lexicon_override_tag | verbessert, wenn alle mitmachen. |
| lesen-t5-gemini-068.json | Euro | wrong_capitalized | verb_census_no_finite | c) Fünfundvierzig Euro. |
| lesen-t5-gemini-069.json | online | noun_lowercase | lexicon_nn | oder Aqua-Fitness, können online gebucht werden. Eine |

## Por reason

- `verb_census_no_finite`: 27
- `lexicon_override_tag`: 6
- `lexicon_nn`: 2
- `adj_before_noun`: 2