# Simulación G2 (PIAT) — pool G1.1 (89 findings)

**Guard propuesto:** `prose_g2_skip_piat_determiner_adj_before_noun`  
**Alcance:** PROSE, `reason=adj_before_noun` únicamente  
**G1/G1.1:** congelados, sin cambios

## Lógica estructural G2

Skip cuando **todas** se cumplen:

1. `token.tag_ == PIAT` y lemma ∈ {viele, vielen, vielem, vieler}
2. `is_adjective_before_following_noun(token)`
3. `prev.tag_ == ART` (artículo definido: die/der/das/den/dem/des)
4. siguiente NOUN con **`dep_ ∈ {oa, og}`** (objeto acusativo/genitivo) → determinante nominal FP

**No skip** cuando:

- `prev` es ADP/KOUS/etc. → cuantificador real (`in Vielen Städten`, `dass Viele Kinder`)
- siguiente NOUN con **`dep_ == sb`** → sujeto (`Die Vielen Medieninhalte empfindet…`)
- `Ganzen` (tag NN, no PIAT) → fuera de G2

## Distinción clave (spaCy)

| Caso | Frase | prev | nxt.dep | G2 |
|---|---|---|---|---|
| **FP** | die **Vielen** Kommentare | die/ART | **oa** | skip ✓ |
| **REAL** | Die **Vielen** Medieninhalte empfindet… | Die/ART | **sb** | no skip |
| **REAL** | dass **Viele** Kinder… | dass/KOUS | sb | no skip (no ART) |
| **REAL** | in **Vielen** Städten | in/APPR | nk | no skip (no ART) |
| **REAL** | den **Ganzen** Tag | den/ART | mo | no skip (no PIAT) |

## Resultados simulación

| Métrica | Valor |
|---|---:|
| Pool G1.1 | 89 findings |
| `adj_before_noun` restantes | 9 |
| **G2 eliminaría** | **1** (`die Vielen Kommentare`, t2-089 options) |
| **Pool esperado** | **88** |
| **MUST_CATCH afectados** | **0** |
| **MUST_NOT_FLAG afectados** | **0** |

## PIAT en adj_before_noun (9 total, post-G1.1)

| Token | Archivo | G2 skip | Protegido |
|---|---|---:|---|
| Vielen | t1-174 question | no | MUST_CATCH Medieninhalte |
| Viele | t2-060 passages | no | MUST_CATCH Kinder |
| Vielen | t2-089 passages | no | MUST_CATCH Städten |
| Vielen | t2-089 options | **sí** | FP Kommentare |
| Bessere | t4-035 signText | no | TITLE (G2 no aplica) |
| Öffentlicher | t4-035 | no | ADJA, no PIAT |
| Besuchen | t2-066 | no | NN, no PIAT |
| Rasenflächen | t5-056 | no | NE, no PIAT |
| Ganzen | t5-061 | no | NN, no PIAT |

Detalle JSON: `batches/ready/g2-simulation-G1.1.json`

## Veredicto

**Simulación OK — implementación autorizada** (0 regresiones en MUST_CATCH / MUST_NOT_FLAG).

## Nota implementación

Tras skip en `adj_before_noun`, el FP `die Vielen Kommentare` reaparecía vía `quantifier_capitalized` (misma PIAT, regla posterior). G2 aplica el **mismo guard** también en esa rama → pool neto **89 → 88**.
