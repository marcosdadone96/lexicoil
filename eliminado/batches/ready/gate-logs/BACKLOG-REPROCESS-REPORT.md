# Backlog reproceso completo

**Fecha:** 2026-07-09T18:45:09.762Z
**Inventario previo:** 557 backlog + 30 wave2a (excluidos)

## 1. Inventario por Teil (antes)

| Teil | total | wave2a | backlog | generated | ready |
|---:|---:|---:|---:|---:|---:|
| T1 | 102 | 5 | 97 | 85 | 17 |
| T2 | 73 | 5 | 68 | 58 | 15 |
| T3 | 272 | 8 | 264 | 147 | 125 |
| T4 | 57 | 5 | 52 | 40 | 17 |
| T5 | 83 | 7 | 76 | 64 | 19 |

## 2. Reproceso PROSE (T1/T2/T4/T5)

| Teil | escaneados | sobrescritos |
|---:|---:|---:|
| T1 | 97 | 52 |
| T2 | 68 | 63 |
| T4 | 52 | 32 |
| T5 | 76 | 75 |

## 3. T3 regenerado

- Eliminados backlog: 264
- Regenerados generated: 139
- Regenerados ready: 125
- Idiomas en minúscula (grep): **0**

## 4. Gates (conjunto final)

| Métrica | N |
|---------|---:|
| Archivos | 587 |
| Q4 topic_mismatch block | 25 |
| Q3 ≠ pass | 0 |
| Q1 wouldReject | 380 |

## 5. G2 actionable (sin ruido conocido)

Raw: 1591 · Actionable: 1503

| archivo | word | reason | field |
|---------|------|--------|-------|
| lesen-t1-gemini-064.json | teil | lexicon_override_tag | questions.explanation |
| lesen-t1-gemini-084.json | klasse | lexicon_nn | passages.text |
| lesen-t1-gemini-090.json | Vorwissen | modal_final_infinitive | passages.text |
| lesen-t1-gemini-092.json | klasse | lexicon_nn | passages.text |
| lesen-t1-gemini-099.json | Herzlichkeit | modal_final_infinitive | passages.text |
| lesen-t1-gemini-099.json | Herzlichkeit | modal_final_infinitive | questions.explanation |
| lesen-t1-gemini-108.json | sprechen | lexicon_override_tag | passages.text |
| lesen-t1-gemini-120.json | machen | lexicon_override_tag | passages.text |
| lesen-t1-gemini-122.json | mitmachen | lexicon_override_tag | passages.text |
| lesen-t1-gemini-135.json | dessen | lexicon_override_tag | questions.question |
| lesen-t1-gemini-137.json | sprechen | lexicon_override_tag | passages.text |
| lesen-t1-gemini-148.json | treffen | lexicon_after_adj | passages.text |
| lesen-t1-gemini-148.json | treffen | lexicon_after_adj | questions.explanation |
| lesen-t1-gemini-154.json | Unternehmen | verb_census_no_finite | passages.text |
| lesen-t1-gemini-154.json | Ausflüge | verb_census_no_finite | passages.text |
| lesen-t1-gemini-154.json | Kochen | adv_before_verb | passages.text |
| lesen-t1-gemini-156.json | machen | lexicon_override_tag | passages.text |
| lesen-t1-gemini-156.json | wissen | lexicon_after_adj | passages.text |
| lesen-t1-gemini-158.json | machen | lexicon_override_tag | passages.text |
| lesen-t1-gemini-163.json | Vielen | quantifier_capitalized | questions.question |
| lesen-t1-gemini-164.json | machen | lexicon_override_tag | passages.text |
| lesen-t1-gemini-171.json | Besuchen | modal_final_infinitive | passages.text |
| lesen-t1-gemini-172.json | Essen | verb_census_no_finite | passages.text |
| lesen-t1-gemini-174.json | Vielen | adj_before_noun | questions.question |
| lesen-t1-gemini-174.json | geräten | lexicon_override_tag | questions.question |
| lesen-t1-gemini-175.json | mitmachen | lexicon_override_tag | questions.explanation |
| lesen-t1-gemini-180.json | besuchen | lexicon_override_tag | passages.text |
| lesen-t2-gemini-022.json | treffen | lexicon_after_adj | passages.text |
| lesen-t2-gemini-028.json | Täglichen | adj_before_noun | passages.text |
| lesen-t2-gemini-028.json | treffen | lexicon_after_adj | questions.options |
| lesen-t2-gemini-029.json | laufen | lexicon_override_tag | passages.text |
| lesen-t2-gemini-029.json | sprechen | lexicon_override_tag | passages.text |
| lesen-t2-gemini-031.json | Gemüse | verb_census_no_finite | passages.text |
| lesen-t2-gemini-032.json | Vielen | adj_before_noun | passages.text |
| lesen-t2-gemini-038.json | machen | lexicon_override_tag | passages.text |
| lesen-t2-gemini-038.json | kochen | lexicon_after_adj | passages.text |
| lesen-t2-gemini-038.json | Essen | adv_before_verb | passages.text |
| lesen-t2-gemini-047.json | machen | lexicon_override_tag | passages.text |
| lesen-t2-gemini-047.json | machen | lexicon_override_tag | questions.explanation |
| lesen-t2-gemini-048.json | Aufgaben | verb_census_no_finite | passages.text |

… +1463 más

## 6. Promoción

- No promover a library/de/B1/questions.json en esta tarea (banco publicado fuera de scope).
- ready/lesen limpio → candidato a ingesta futura tras resolver AUD servido + re-ingesta selectiva.
- generated/ limpio → pool operativo normal de la app / futura promoción a ready/.
- Archivos con Q4 topic_mismatch, Q3 fail, Q1 wouldReject o G2 actionable → revisión antes de promover.

- **ready limpio (gates+G2):** 15
- **generated limpio:** 99