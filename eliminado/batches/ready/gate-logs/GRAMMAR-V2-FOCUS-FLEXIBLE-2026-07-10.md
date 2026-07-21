# grammarTags v2.0 — GRAMMAR-FOCUS + flexible cupo (2026-07-10)

**Version:** `v2.0-focus-flexible-2026-07-10`  
**Soft max:** 4  
**v1.0.1:** descartada (trasladaba discriminación a modal/adj)

## Plan

1. **PRIMARY blob** = `question + explanation + correct option` (`questionSpecificGrammarBlob`)
2. **SECONDARY** = passage only as reinforcement (never sole source)
3. **Cupo flexible** — cada categoría vs su umbral; soft-max 4; vacío permitido
4. **Umbrales endurecidos** — modal solo modal+infinitivo (min 2); adj min 3; Perfekt solo `ge-`/`-iert`

## Coverage (% of 749 questions)

| Tag | Auditoría | v1.0.1 | **v2.0** |
|-----|----------:|-------:|---------:|
| `g-de-b1-relativ` | 86.6% | 0.3% | **15.2%** |
| `g-de-b1-nebensatz` | 71.7% | 0.3% | **4.3%** |
| `g-de-b1-modalverben` | ~12%* | **52.1%** | **6.5%** |
| `g-de-b1-passiv` | ~12%* | 16.3% | **6.0%** |
| `g-de-b1-konjunktiv` | ~3.5%* | 33.8% | **7.5%** |
| `g-de-b1-dativ` | ~3.3%* | 23.9% | **1.6%** |
| `g-de-b1-perfekt` | ~2.7%* | 10.1% | **13.8%** |
| `g-de-b1-adjektivdeklination` | ~1.9%* | **40.6%** | **2.3%** |
| `g-de-b1-komparativ` | ~1.3%* | 15.5% | **13.6%** |
| `g-de-b1-futur` | ~0.1%* | 0.9% | **5.9%** |
| `g-de-b1-genitiv` | 0% | 2.0% | **9.9%** |

\*Auditoría era conteo de tags ≈ cobertura bajo cupo=2.

**Categories >35%:** **none**  
**Categories >40%:** **none**

## Length distribution

| Length | Questions | % |
|-------:|----------:|--:|
| 0 | 316 | **42.2%** |
| 1 | 279 | 37.2% |
| 2 | 110 | 14.7% |
| 3 | 27 | 3.6% |
| 4+ | 17 | 2.3% |

Ya no está clavado en exactamente 2 (era 95.7% en v1.0.1).  
**0 tags (42%)** es aceptable bajo GRAMMAR-FOCUS: el ítem no muestra estructura relevante (mismo criterio que vocab vacío).

## Examples (pasaje vs ítem)

| Caso | Primario rel/neb | Pasaje rel/neb | Tags v2.0 |
|------|------------------|----------------|-----------|
| `horen-t2-007` q3 (passage-only) | 0/0 | 6/1 | `genitiv` — **sin** relativ/nebensatz |
| `horen-t2-013` q2 (passage-only) | 0/1 | 6/2 | `[]` — **sin** relativ/nebensatz |
| `lesen-t1-139` q2 (passage-only) | 0/0 | 5/3 | `[]` — **sin** relativ/nebensatz |
| Item synthetic: 2× relativ en explicación | ≥2 | — | incluye `relativ` |
| Item synthetic: 2× weil/dass | ≥2 | — | incluye `nebensatz` |

## Tests

`node scripts/lib/__tests__/enrichBatchMetadata.grammar.test.mjs` — **30/30**

## Veredicto

Problema de discriminación **resuelto en cobertura**: ninguna categoría >35%. Modal/adj bajaron de 52%/41% a 6.5%/2.3%. relativ vuelve a un nivel razonable (15%) solo cuando aparece en el ítem.
