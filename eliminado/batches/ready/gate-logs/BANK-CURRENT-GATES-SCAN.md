# Bank + served — current gates scan (dry-run)

**Fecha:** 2026-07-10T09:11:52.871Z

## Banco `library/de/B1/questions.json`

| Métrica | Valor |
|---|---:|
| Pasajes / preguntas | 109 / 1056 |
| AUD-4 bold (pasajes) | 0 |
| AUD-4b bullets (pasajes) | 0 |
| topic_mismatch | 25 |
| sin topicTag derivable | 0 |
| copia literal ≥4 | 16 |
| verb_census V2 | 30 |

### topic_mismatch (muestra)

- `p-lesen-1` T1 tag=Umwelt → Bildung
- `p-horen-1` T1 tag=Technik → Reisen
- `gen-l1-4492` T1 tag=Wohnen → Freizeit
- `gen-l1-2094` T1 tag=Freizeit → Stadtleben
- `gen-l2-7291a` T2 tag=Sport → Stadtleben
- `gen-l2-8dfdafc7b` T2 tag=Wohnen → Arbeit
- `gen-p-h2-2583c630-s1` T2 tag=Technik → Arbeit
- `gen-l4-26c87b36` T4 tag=Freizeit → Stadtleben
- `gen-l4-1316d4d6` T4 tag=Bildung → Sport
- `gen-p-h1-eac46715-s2` T1 tag=Umwelt → tag_unsupported
- `gen-p-h1-eac46715-s3` T1 tag=Wohnen → Umwelt
- `gen-p-h1-eac46715-s4` T1 tag=Verkehr → Medien
- `gen-l2-f5dd2b2c-1` T2 tag=Gesundheit → Freizeit
- `gen-l2-358dc234a` T2 tag=Reisen → Umwelt
- `gen-l5-b43aec48` T5 tag=Arbeit → Freizeit

### copia literal ≥4 (muestra)

- `lb-de-b1-l3` T1 [statement] «viele menschen möchten wissen»
- `lb-de-b1-l5` T2 [correct_option] «sie verbessern das stadtklima»
- `lb-de-b1-h1` T1 [correct_option] «weil immer mehr menschen»
- `lb-de-b1-h4` T2 [correct_option] «fahrradwege in der stadt»
- `gen-q-2-8dfdafc7-6` T2 [question] «ist für viele familien»
- `gen-q-5-0f9283ea-4` T5 [correct_option] «personen muss ein termin»
- `gen-q-5-502c139f-4` T5 [question] «am ende des arbeitstages»
- `gen-q-5-3ded8185-1` T5 [correct_option] «drei stunden pro tag»
- `gen-q-5-3ded8185-4` T5 [correct_option] «samstags von bis uhr»
- `gen-q-2-918879ec-2` T2 [question] «interesse an smart home»
- `gen-q-5-770f7b8d-3` T5 [question] «daten auf den computern»
- `gen-q-2-a26eaeea-5` T2 [question] «immer noch zu viele»
- `gen-q-2-a26eaeea-6` T2 [question] «eine priorität für viele»
- `gen-q-2-831ec385-5` T2 [question] «für eltern an die»
- `gen-q-2-ea8290ef-1` T2 [question] «viele menschen in deutschland»
- `gen-q-2-ea8290ef-4` T2 [question] «projekt lern app selbst»

### verb_census V2 (muestra)

- `p-lesen-1` passage.text: Essen→essen
- `lb-de-b1-l3` question: Essen→essen
- `gen-l4-e2d0b882` passage.text: Wissen→wissen
- `gen-l2-8dfdafc7a` passage.text: Kochen→kochen
- `gen-q-2-8dfdafc7-2` options[1]: Kochen→kochen
- `gen-q-2-8dfdafc7-6` options[1]: Essen→essen
- `gen-q-2-8dfdafc7-6` options[2]: Essen→essen
- `gen-l2-42c0c14e-b` passage.text: Wissen→wissen
- `gen-q-2-42c0c14e-6` explanation: Wissen→wissen
- `gen-l1-61b004a3` passage.text: Unternehmen→unternehmen
- `gen-l1-61b004a3` passage.text: Kochen→kochen
- `gen-l1-61b004a3` passage.text: Glaube→glaube
- `gen-l2-e5a1-b` passage.text: Wissen→wissen
- `gen-q-h2-d99a3b12-q5` options[0]: Essen→essen
- `gen-l2-69492eda-b` passage.text: Kochen→kochen

## Servido `data/exams/de_B1.json`

| Métrica | Valor |
|---|---:|
| AUD-4 bold parts | 0 |
| AUD-4b bullets | 0 |
| topic_mismatch | 1 |
| copia literal ≥4 | 0 |
| verb_census V2 | 3 |

_Ninguna copia literal_

- topic: T2 Gesundheit→null (tag_unsupported)
