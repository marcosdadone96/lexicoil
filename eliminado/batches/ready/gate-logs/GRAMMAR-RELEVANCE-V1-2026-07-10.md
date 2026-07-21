# grammarTags relevance v1.0.1 (2026-07-10)

**Version:** `v1.0.1-relevance-2026-07-10`  
**Scope:** `pool-verified/` 134 files / 749 questions  
**Stamp:** `_grammarTagsNormalizeVersion`  
**Empty grammarTags after:** **0**

## 1. Análisis — lógica anterior (binaria)

`inferGrammarTagsFromText` (pre-v1.0):

| # | Tag | Detector | Problema |
|---|-----|----------|----------|
| 1 | nebensatz | 1× conj. `weil\|dass\|obwohl|…` | Umbral 1; casi siempre true en B1 |
| 2 | relativ | patrón `der/die/das …` + 2 determinantes en texto | Muy permisivo |
| 3 | passiv | `wird/werden` + particípio (+ `von/durch` o rama débil) | A menudo 3º en cola |
| 4 | konjunktiv | `hätte\|würde\|könnte|…` | Idem |
| 5 | modalverben | 1× modal | Idem |
| 6 | perfekt | `haben/sein` + particípio | Idem |
| 7 | futur | `werden` + inf. si no passiv | Raro |
| 8 | komparativ | `besser\|größer\|…er als` | Raro |
| 9 | genitiv | `des/der` + Nomen / `wegen des` | Raro |
| 10 | dativ | prep. `mit\|bei|…` + `dem/der/den` | Idem |
| 11 | adjektivdeklination | artículo + adj. flex. + Nomen | Idem |

**Causa raíz:** `hits.slice(0, 2)` en **orden de detección** (nebensatz → relativ primero) → 518/749 Q con exactamente `nebensatz+relativ` (69%); **81.1%** de todos los tags = relativ+nebensatz.

## 2. Plan implementado

1. Contar matches por tipo (`countGrammarSignals`), no presencia binaria.
2. Umbral mínimo por tipo: relativ/nebensatz/dativ/adj ≥2; modal ≥2; resto ≥1.
3. Prioridad pedagógica: Passiv > Konjunktiv > Modal > Dativ > Adj > … ≫ nebensatz/relativ.
4. Presupuesto 2 tags: si ≥2 high (≥70) → top 2 high; si 1 high → high + mid/low; si 0 high → mid/low.
5. Passiv más estricto (agente `von/durch`, `wurde/wurden`, o particípio `ge-`/`-iert`).
6. `forceGrammar` + stamp `_grammarTagsNormalizeVersion`.
7. **Mejora futura documentada:** `GRAMMAR-FOCUS` — ponderar `explanation`/opción correcta vs pasaje compartido (BACKLOG).

## 3. Distribución vs auditoría original

| Tag | Auditoría (antes) | v1.0.1 | Δ |
|-----|------------------:|-------:|--:|
| `g-de-b1-relativ` | 649 | **2** | −647 |
| `g-de-b1-nebensatz` | 537 | **2** | −535 |
| `g-de-b1-modalverben` | 92 | **390** | +298 |
| `g-de-b1-passiv` | 89 | **122** | +33 |
| `g-de-b1-konjunktiv` | 26 | **253** | +227 |
| `g-de-b1-dativ` | 25 | **179** | +154 |
| `g-de-b1-perfekt` | 20 | **76** | +56 |
| `g-de-b1-adjektivdeklination` | 14 | **304** | +290 |
| `g-de-b1-komparativ` | 10 | **116** | +106 |
| `g-de-b1-futur` | 1 | **7** | +6 |
| `g-de-b1-genitiv` | 0 | **15** | +15 |
| **Total tags** | 1463 | **1466** | |
| **Q vacías** | 0 | **0** | |

### relativ + nebensatz share

| | Antes | Después |
|--|------:|--------:|
| % de todos los tags | **81.1%** | **0.3%** |
| Parejas exactas `nebensatz+relativ` | 518 | **0** |

## 4. Before / after (5 casos reales)

Antes = tags almacenados pre-relevancia (muestra de esta sesión / patrón dominante).

| Archivo / Q | Antes | Después |
|-------------|-------|---------|
| `horen-t2-007` q1 | nebensatz + relativ | **passiv + konjunktiv** |
| `lesen-t2-057` q1 | nebensatz + relativ | **konjunktiv + modalverben** |
| `lesen-t4-017` q3 | nebensatz + relativ | **adjektivdeklination + komparativ** |
| `horen-t1-016` s1-q1 | relativ + modalverben | **modalverben + adjektivdeklination** |
| `schreiben-010` t1-q1 | relativ + modalverben | **adjektivdeklination + genitiv** |

## 5. Tests

`node scripts/lib/__tests__/enrichBatchMetadata.grammar.test.mjs` — **18/18** (fixtures 007, 057, 016, 017).

## 6. Nota para el operador (revisión)

La prioridad funciona: Passiv/Konjunktiv/Modal/Dativ/Adj ya no quedan opacados.

**Sobreajuste posible:** relativ/nebensatz caen a ~0.3% porque casi todo texto B1 del pool tiene ≥2 señales high-tier (modal+adj, konj+modal, …) que llenan el presupuesto de 2 tags. Si se quiere recuperar relativ/nebensatz como *segundo* tag cuando solo hay una señal “rara” (passiv/konjunktiv), opción de seguimiento: bajar modal/dativ/adj a prioridad mid.

**No dar por cerrado en producción** hasta OK del operador.
