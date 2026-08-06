# Informe `adj_before_noun` — pool v6.1-B (104 findings)

**Fuente:** `batches/ready/german-caps-gate-report-v6.1-B.json`  
**Total `adj_before_noun`:** 24 / 104 (23,1 %)  
**Análisis spaCy:** `de_core_news_sm` + texto completo desde `batches/ready/lesen/`  
**Detalle machine-readable:** `batches/ready/adj-before-noun-report-v6.1-B.json`

## Condición exacta de disparo

En `pos-caps-check.py`, perfil PROSE con `adj_before_noun=True`:

```
profile.adj_before_noun
AND token.text[0].isupper()
AND is_adjective_before_following_noun(token)
```

Donde `is_adjective_before_following_noun`:

- `cur_adj` = `is_adj_tag(tag_)` OR `pos_ == "ADJ"` OR token en `HOMOGRAPH_ADJECTIVES`
- `nxt_noun` = siguiente token con `is_noun_tag(tag_)` OR `pos_ == "NOUN"`

**Nota:** Los PIAT (`Viele`, `Vielen`) entran porque `is_adj_tag("PIAT")` es verdadero. La regla paralela `is_quantifier_adjective_error` también los captura, pero `adj_before_noun` se evalúa antes en el flujo y produce el mismo finding para quantifiers reales.

---

## Resumen por estructura semántica

| Estructura | N | FP claros | Errores reales | Ambiguos |
|---|---:|---:|---:|---:|
| **ADJ sustantivado + NOUN** (Junge, Deutschen, Freie, Hamburger, Yogalehrer…) | 14 | 14 | 0 | 0 |
| **Quantifier PIAT + NOUN** (Viele/Vielen como cuantificador) | 3 | 0 | 3 | 0 |
| **Quantifier idiom** (`den Ganzen Tag`) | 1 | 0 | 1 | 0 |
| **ADJ comparativo/atributivo + NOUN** (Bessere, Niedrigen) | 2 | 1 | 1 | 0 |
| **PIAT determinante** (`die Vielen Kommentare`) | 1 | 1 | 0 | 0 |
| **NOUN + ADJ + NOUN** (cadena genitiva, Öffentlicher) | 1 | 0 | 1 | 0 |
| **Sustantivo tras ADP** (Rasenflächen, mis-tag) | 1 | 1 | 0 | 0 |
| **Homógrafo / mis-tag** (Besuchen) | 1 | 0 | 0 | 1 |
| **Total** | **24** | **17** | **6** | **1** |

---

## Cobertura hipotética de guards estructurales (sin implementar)

| Guard propuesto | Findings cubiertos | % del total (24) | FP eliminados | Riesgo sobre MUST_CATCH |
|---|---:|---:|---:|---|
| G1: ADJ sustantivado ante NOUN plural/compuesto | 14 | 58,3 % | 14/17 FP | Ninguno (0 errores reales en grupo) |
| G2: PIAT tras ART como determinante (`ART + Vielen + N`), no cuantificador | 1 | 4,2 % | 1/17 FP | No toca Viele/Vielen cuantificador |
| G3: Tras ADP, token con tag NN/NE (no ADJA) | 1 | 4,2 % | 1/17 FP | Ninguno |
| **G1+G2+G3 combinados** | **16** | **66,7 %** | **16/17 FP (94 %)** | Conservan los 6 MUST_CATCH + 1 ambiguo |

Una **única regla** (solo G1 sustantivado) cubriría **58,3 %** del total y **82 %** de los FP.  
**2–3 guards** (G1+G2+G3) cubrirían **~67 %** del total y casi todos los FP, dejando intactos los 6 errores reales.

---

## Detalle por finding (24)

### A. ADJ sustantivado + NOUN — 14 (todos FP claros)

Adjetivo nominalizado usado como modificador de grupo nominal (`der/die/den Junge …`, `in Deutschen Städten`). Ortografía correcta con mayúscula sustantiva; spaCy los etiqueta ADJA + NOUN siguiente.

| # | Token | Archivo | Field | Régimen | Frase completa | Prev → Token → Next | dep / head | Veredicto |
|---:|---|---|---|---|---|---|---|---|
| 1 | Junge | lesen-t2-gemini-061.json | passages.text | PROSE | Viele Junge Leute träumen davon, | Viele(PIAT) → **Junge**(ADJA) → Leute(NN) | nk → Leute | FP |
| 2 | Junge | lesen-t2-gemini-061.json | passages.text | PROSE | …Organisationen, die Junge Leute bei der Planung… | die(ART) → **Junge**(ADJA) → Leute(NN) | nk → Leute | FP |
| 3 | Junge | lesen-t2-gemini-061.json | questions.question | PROSE | Wie reist der Junge Angestellte aus Berlin oft | der(ART) → **Junge**(ADJA) → Angestellte(NN) | nk → Angestellte | FP |
| 4 | Junge | lesen-t2-gemini-066.json | passages.text | PROSE | …dass besonders Junge Erwachsene viel Zeit vor | besonders(ADV) → **Junge**(ADJA) → Erwachsene(NN) | nk → Erwachsene | FP |
| 5 | Junge | lesen-t2-gemini-066.json | questions.explanation | PROSE | (misma estructura) | besonders → **Junge** → Erwachsene | nk → Erwachsene | FP |
| 6 | Junge | lesen-t2-gemini-072.json | passages.text | PROSE | …dass besonders Junge Menschen Interesse… | besonders → **Junge** → Menschen | nk → Menschen | FP |
| 7 | Junge | lesen-t2-gemini-072.json | questions.explanation | PROSE | …dass vor allem Junge Menschen diese Technik… | allem(PIS) → **Junge** → Menschen | nk → Menschen | FP |
| 8 | Junge | lesen-t5-gemini-045.json | questions.question | PROSE | …Altersregelungen gelten für Junge Mitglieder im Studio? | für(APPR) → **Junge** → Mitglieder | nk → Mitglieder | FP |
| 9 | Deutschen | lesen-t2-gemini-079.json | passages.text | PROSE | …Bewohner in Deutschen Städten solche Systeme… | in(APPR) → **Deutschen**(ADJA) → Städten(NN) | nk → Städten | FP |
| 10 | Deutschen | lesen-t2-gemini-087.json | passages.text | PROSE | In vielen Deutschen Städten werden alte Kreidetafeln… | vielen(PIAT) → **Deutschen**(ADJA) → Städten | nk → Städten | FP |
| 11 | Deutschen | lesen-t2-gemini-088.json | passages.text | PROSE | …Bewohner in Deutschen Großstädten entdecken… | in(APPR) → **Deutschen** → Großstädten | nk → Großstädten | FP |
| 12 | Hamburger | lesen-t2-gemini-088.json | passages.text | PROSE | …Wohnprojekt in der Hamburger Innenstadt bringt… | der(ART) → **Hamburger**(ADJA) → Innenstadt | nk → Innenstadt | FP |
| 13 | Freie | lesen-t1-gemini-173.json | questions.question | PROSE | Sie verbringt ihre Freie Zeit gerne draußen… | ihre(PPOSAT) → **Freie**(ADJA) → Zeit | nk → Zeit | FP |
| 14 | Yogalehrer | lesen-t1-gemini-173.json | questions.explanation | PROSE | …von ihrem Yogalehrer Unterstützung, sondern… | ihrem(PPOSAT) → **Yogalehrer**(ADJA) → Unterstützung | nk → Unterstützung | FP |

**Patrón estructural común:** `[DET|ADP|ADV|PIAT]? + ADJA_cap + NOUN` donde el ADJA es sustantivo léxico (joven, alemán, libre, hamburgués…).

---

### B. Quantifier PIAT + NOUN — 3 (todos errores reales, MUST_CATCH)

| # | Token | Archivo | Field | Régimen | Frase | Prev → Token → Next | dep/head | Veredicto |
|---:|---|---|---|---|---|---|---|---|
| 15 | Viele | lesen-t2-gemini-060.json | passages.text | PROSE | Bericht zeigt, dass Viele Kinder zu wenig aktiv | dass(KOUS) → **Viele**(PIAT) → Kinder | nk → Kinder | **REAL** |
| 16 | Vielen | lesen-t1-gemini-174.json | questions.question | PROSE | Die Vielen Medieninhalte empfindet sie manchmal | Die(ART) → **Vielen**(PIAT) → Medieninhalte | nk → Medieninhalte | **REAL** |
| 17 | Vielen | lesen-t2-gemini-089.json | passages.text | PROSE | …wichtige Rolle in Vielen Städten. Sie Berichten | in(APPR) → **Vielen**(PIAT) → Städten | nk → Städten | **REAL** |

**Bloqueo obligatorio en B2:** cualquier guard de sustantivado debe excluir PIAT cuantificador (`pos DET` + tag PIAT + no determinante de grupo nominal concreto).

---

### C. Quantifier idiom — 1 (error real, MUST_CATCH)

| Token | Archivo | Field | Frase | Estructura | Veredicto |
|---|---|---|---|---|---|
| Ganzen | lesen-t5-gemini-061.json | questions.options | Man kann dort den Ganzen Tag kostenlos Arbeiten. | den(ART) → **Ganzen**(NN/pos ADJ) → Tag | **REAL** (`den ganzen Tag`) |

spaCy etiqueta `Ganzen` como NN; entra por `pos_==ADJ` fallback o homografía. Guard sustantivado no debe absorber este caso.

---

### D. ADJ comparativo/atributivo + NOUN — 2

| Token | Archivo | Field | Régimen | Frase | Veredicto |
|---|---|---|---|---|---|
| Bessere | lesen-t4-gemini-035.json | questions.signText | TITLE_HEADING | Stadt sollte lieber in Bessere Fahrradwege investieren. | **REAL** (MUST_CATCH; comparativo atributivo → minúscula) |
| Niedrigen | lesen-t5-gemini-060.json | passages.text | PROSE | …achten Sie auf einen Niedrigen Lärmpegel… | **FP** (`niedrigen Lärmpegel` correcto) |

---

### E. PIAT determinante — 1 (FP claro)

| Token | Archivo | Field | Frase | Estructura | Veredicto |
|---|---|---|---|---|---|
| Vielen | lesen-t2-gemini-089.json | questions.options | …finden die Vielen Kommentare im Internet gut | die(ART) → **Vielen**(PIAT) → Kommentare | **FP** (determinante “los muchos comentarios”, no cuantificador de cláusula) |

Distinto de B.17 (`in Vielen Städten`): aquí PIAT modifica sustantivo concreto tras artículo definido.

---

### F. NOUN + ADJ + NOUN (cadena genitiva) — 1 (error real)

| Token | Archivo | Field | Frase | Estructura | Veredicto |
|---|---|---|---|---|---|
| Öffentlicher | lesen-t4-gemini-035.json | questions.explanation | …Nutzung Öffentlicher Verkehrsmittel, auch wenn | Nutzung(NN) → **Öffentlicher**(ADJA) → Verkehrsmittel | **REAL** (falta `der`; debe ser `öffentlicher`) |

---

### G. Sustantivo tras ADP (mis-tag) — 1 (FP claro)

| Token | Archivo | Field | Frase | Estructura | Veredicto |
|---|---|---|---|---|---|
| Rasenflächen | lesen-t5-gemini-056.json | questions.options | Man darf auf Rasenflächen Rad fahren… | auf(APPR) → **Rasenflächen**(NE,pos ADJ) → Rad | **FP** (sustantivo compuesto; capitalización correcta) |

Dispara porque spaCy asigna `pos_=ADJ` pese a `tag_=NE`.

---

### H. Homógrafo / mis-tag — 1 (ambiguo)

| Token | Archivo | Field | Frase | Estructura | Veredicto |
|---|---|---|---|---|---|
| Besuchen | lesen-t2-gemini-066.json | passages.text | Einige Besuchen Kurse, um Handwerk | Einige(PIS) → **Besuchen**(NN,pos ADJ) → Kurse | **AMB** |

Posible verbo finito mal capitalizado (`Einige besuchen Kurse`) o sustantivo (`Besuchen` = visitas). spaCy lo parsea como ROOT/ADJ. No encaja en guard sustantivado; candidato a regla distinta (homógrafo verbal) o dejar como finding.

---

## Conclusiones para diseño B2

1. **Los 24 findings se reducen a ~6 patrones estructurales**, no a 24 excepciones léxicas.
2. **El 58 % del volumen (14/24) es un solo patrón:** adjetivo sustantivado + sustantivo (FP puro).
3. **Los 6 errores reales** caen en 4 patrones distintos: quantifier PIAT (3), idiom `ganzen Tag` (1), comparativo atributivo (1), genitivo compuesto (1).
4. **B2 viable con 2–3 guards generales:**
   - **G1** skip sustantivado (estructural: ADJA entre modificador y NOUN, excluyendo PIAT cuantificador)
   - **G2** skip PIAT+ART como determinante nominal (`ART + PIAT + N` referencial)
   - **G3** skip ADP + NN/NE (no ADJA)
5. **No implementar listas de palabras** (`Junge`, `Deutschen`…): el grupo A comparte estructura, no lemmas.
6. **Besuchen** queda fuera de B2; posible B3/homógrafo o tolerancia ambigua.
