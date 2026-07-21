# Diseño de estabilización arquitectónica — mecanismos M1–M4

**Estado:** propuesta — sin implementar  
**Baseline:** `germanCapsNormalize v3.1-stable` (Phase 1 completada)  
**Gate:** `v6.1-B-G2` congelado — no tocar  
**Evidencia base:** `PHASE1-G2-6-NEW-FINDINGS-ANALYSIS.md`, dry-runs `PHASE1-G2-DRYRUN.json`, `PHASE1-PRODUCTION-15-DRYRUN.json`  
**Fecha:** 2026-07-08

---

## Contexto y decisión de arquitectura

Phase 1 demostró que **iteraciones pequeñas y verificables** funcionan: un early-return simétrico en `shouldCapitalizeLowerNoun` eliminó reverts decap↔cap sin tocar el gate.

El análisis de los 6 findings nuevos demuestra que **no conviene seguir ampliando manualmente `ADJ_NEEDS_ARTICLE_GUARD`**. Los problemas restantes son estructurales:

| ID | Nombre | Síntoma en los 6 casos |
|---|---|---|
| **M1** | Huecos de flexión del guard | `vielen`, `langen` |
| **M2** | Homógrafos del léxico | `positiven→positive`, `blaue→blau`, `vielen→viele` |
| **M3** | `SUBSTANTIVISING_ARTICLES` demasiado agresivo | `welchen`, `als` |
| **M4** | Bug morfológico `hasNominalSuffix` (`-chen`) | `frischen` |

**Principio rector:** una fase = un mecanismo = un diff acotado, validado con el protocolo de aceptación (`PHASE-ACCEPTANCE-PROTOCOL.md`).

**Protocolo vigente:** una fase solo se integra si cumple *simultáneamente* `addedFindings=0`, `findings≤baseline`, tests pass, `capFixed` no disminuye, y dry-run completo en G2 + generated + producción-15. Un solo `addedFinding` → rechazo y vuelta a diseño.

---

## Mapa de dependencias (por qué no mezclar)

```
                    ┌─────────────────────────────────────┐
                    │   shouldCapitalizeLowerNoun()       │
                    └─────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
   prev ∈ SUBSTANTIVISING      lemma ∈ ADJ_GUARD (Phase1)    isCertainNounLemma()
   (M3)                       (M1 — solo si flexión lista)         │
                                                                    ├── getSafeNouns / isKnownGermanNoun (M2)
                                                                    └── hasNominalSuffix (M4)
```

- **M4** es ortogonal: corrige `isCertainNounLemma` sin tocar guard ni artículos.
- **M2** corrige la rama `isKnownGermanNoun` en el path de cap; independiente del set de artículos.
- **M3** solo afecta la condición `SUBSTANTIVISING_ARTICLES.has(prevLc)`; no arregla homógrafos por sí solo.
- **M1** es simétrico decap↔cap pero **no debe ser “más entradas a mano”**; propone cierre automático de flexiones.

Los casos `positiven` mezclan M2+M3 en producción, pero el fix debe **desacoplarse**: primero M2 (no confiar en homógrafo léxico para cap), luego M3 (restringir disparadores).

---

# M1 — Huecos de flexión del guard

## 1. Causa raíz

`ADJ_NEEDS_ARTICLE_GUARD` es un **set plano de formas superficiales** sin generación de flexiones. El guard incluye bases (`viele`, `lang`, `lange`, `wichtig`, `freien`…) pero **no todas las desinencias del paradigma adjetivo alemán** (`-en`, `-em`, `-er`, `-es`).

Cuando el texto trae una flexión ausente:

1. **decap** no baja (token ya en minúscula, o no está en guard).
2. **cap** pasa Phase 1 (flexión ∉ guard).
3. **cap** entra en rama sustantivadora porque `isCertainNounLemma` es true (a menudo vía M2) y `nextWordIsCapitalizedNoun` falla.

No es un fallo de Phase 1: Phase 1 solo espeja lo que **ya está** en el guard.

## 2. Funciones que intervienen

| Función / artefacto | Rol |
|---|---|
| `ADJ_NEEDS_ARTICLE_GUARD` | Lista blanca de formas que no deben re-capitalizarse tras artículo |
| `shouldCapitalizeLowerNoun()` L239–241 | Espejo Phase 1 |
| `decapitalizeMidSentence()` L379 | Misma condición para bajar mayúsculas |
| `isHeuristicAdjAdvOvercapitalized()` L435 | Usa el guard para adv/adj heurístico |
| `NEVER_NOUN_WORDS` | Unión con guard — afecta otras ramas |
| `pos-caps-check.py` `QUANTIFIER_ADJ_LEMMAS` | Gate ya reconoce `vielen/vielem/vieler` — **desalineación cap↔gate** |

## 3. Otras reglas afectadas

- **decap:** cualquier flexión añadida al guard activa decap en tokens capitalizados erróneamente.
- **isHeuristicAdjAdvOvercapitalized:** más lemmas → más decaps heurísticos.
- **Sustantivaciones legítimas:** `die Vielen` (sustantivo), `den Langen` (raro) — riesgo FN si el cierre es demasiado amplio.
- **No afecta:** `hasNominalSuffix`, `isKnownGermanNoun`, gate congelado.

## 4. Solución mínima (sin “patch manual del guard”)

**No añadir lemmas sueltos.** Introducir un **cierre de flexiones computado** en tiempo de carga:

```text
ADJ_INFLECTION_CLOSURE = expandGermanAdjFlexions(ADJ_NEEDS_ARTICLE_GUARD)
// Desde cada entrada: +{-en,-em,-er,-es,-e} con reglas de truncación ya usadas en singularCandidates
```

Usar `ADJ_INFLECTION_CLOSURE` **solo** en el par espejo decap↔cap (Phase 1), sustituyendo `.has(lc)` directo sobre el guard estático.

Criterios del generador:

- Solo expande entradas **ya aprobadas** en el guard (no nuevos adjetivos).
- Excluye entradas que son sustantivos homógrafos en léxico (`alter` ya eliminado manualmente — mantener denylist explícita).
- Cuantificadores: alinear con `QUANTIFIER_ADJ_LEMMAS` del gate (`vielen`, `vielem`, `vieler`).

**Diff esperado:** ~40 líneas en `capitalizeNouns.mjs` + helper + tests; **cero** nuevas entradas manuales en el array del guard.

## 5. Riesgo de regresión

| Riesgo | Nivel | Mitigación |
|---|---|---|
| Bloquear sustantivación `die Vielen` | Medio | Test positivo: `die Vielen` sin sustantivo siguiente → cap sí; `die vielen Geräte` → cap no |
| Sobre-generar formas inexistentes | Bajo | Limitar a desinencias documentadas; denylist homógrafos |
| Desalinear decap y cap | Bajo | Un solo set derivado, usado en ambos |

## 6. Impacto esperado

| Corpus | Evidencia actual | Impacto estimado |
|---|---|---|
| **G2** (193) | 5 cap-ups M1 (`vielen`×2, `langen`×3); 2/6 findings nuevos | **−2 a −4 findings**; elimina findings `Vielen`, `Langen` |
| **generated** (364) | 3 `addedFindings` M1 en dry-run post-v3.1 | **−2 a −5 findings** en `adj_before_noun` + `quantifier_capitalized` |
| **producción** (15 sesión) | 0 findings nuevos M1 en el subset pequeño | Bajo directo; beneficio en modo **full** normalize |

---

# M2 — Homógrafos del léxico

## 1. Causa raíz

`isCertainNounLemma(lc)` delega en `isKnownGermanNoun(lc)`, que usa `lexiconHas` + `singularCandidates`:

```javascript
// germanNounLexicon.mjs — singularCandidates
if (lemma.endsWith('en')) out.add(lemma.slice(0, -2));  // positiven → positiv
if (lemma.endsWith('en')) out.add(lemma.slice(0, -1));  // positiven → positive ✓ en léxico
```

Muchos **adjetivos flexionados** resuelven a un **sustantivo homógrafo** en `de-gender.json`:

| Token adj | Candidato léxico | Gender |
|---|---|---|
| `positiven` | `positive` | f |
| `langen` | `lange` | f |
| `blaue` | `blau` | n |
| `vielen` | `viele` | — |
| `grüne` | `grün` | — |
| `gelben` | `gelb` | — |

El path de **cap** interpreta: “es un sustantivo conocido tras artículo → sustantivación → mayúscula”. En realidad es **adj + N** con homógrafo accidental.

El path de **decap** ya tiene más contexto (`ADJ_NEEDS_ARTICLE_GUARD`, `isHeuristicAdjAdvOvercapitalized`) y no sufre el mismo bug cuando el token ya está en minúscula.

## 2. Funciones que intervienen

| Función | Rol |
|---|---|
| `isCertainNounLemma()` | Puerta de cap hacia sustantivos |
| `isKnownGermanNoun()` | Compound + `singularCandidates` + `lexiconHas` |
| `singularCandidates()` | Genera `positive` desde `positiven` |
| `lexiconHas()` | Comprueba Set `de-gender` + CEFR |
| `shouldCapitalizeLowerNoun()` L244–248 | Rama artículo + `isCertainNounLemma` |
| `nextWordIsCapitalizedNoun()` | Supuesto “si siguiente es N cap, esto es adj” — falla si N no está en léxico |
| `getSafeNouns()` | Cache del léxico en cap |
| `buildLexicon()` / `de-gender.json` | Fuente de homógrafos — **no modificar en esta fase** |

## 3. Otras reglas afectadas

- **`nextWordIsCapitalizedNoun`:** si M2 cambia cuándo `isCertainNounLemma` es true, esta función gana fiabilidad.
- **Sustantivaciones reales:** `das Positive`, `im Blauen`, `die Vielen` — no deben perder cap cuando son sustantivos genuinos.
- **decap `isKnownGermanNoun` guard:** no cambiar en M2; scope solo cap.
- **Gate `lexicon_nn` / `lexicon_after_adj`:** no tocar; pueden fluctuar si cap deja de crear errores upstream.
- **Compound decomposition:** no afectada si el fix es en cap-path only.

## 4. Solución mínima

Nueva función **`isCapNounLemma(lc, prevLc, nextWord)`** usada **solo en `shouldCapitalizeLowerNoun`**, con regla:

> Si `isKnownGermanNoun(lc)` es true **únicamente** vía `singularCandidates` (no hit directo en léxico) **y** `nextWord` está capitalizado y parece sustantivo (tag o forma capitalizada), **tratar como adjetivo → no capitalizar**.

Implementación mínima sin spaCy en cap:

```text
if (!lexicon.has(lc) && isKnownGermanNoun(lc) && nextWord && isCapitalizedWord(nextWord)) {
  return false;  // probable adj + N, homógrafo por flexión
}
```

Refinamiento opcional (misma fase, mismo diff): denylist estática `LEXICON_ADJ_HOMOGRAPHS` para stems que **nunca** deben activar cap en contexto Art+minúscula (`positive`, `blau`, `grün`, `gelb`, `lange`, `viele` como sustantivos abstractos).

**No tocar** `de-gender.json` ni `buildLexicon()` en esta fase.

## 5. Riesgo de regresión

| Riesgo | Nivel | Mitigación |
|---|---|---|
| No capitalizar sustantivo flexionado legítimo sin N siguiente | Medio | Solo aplicar cuando `nextWord` capitalizado (patrón adj+N) |
| Compuestos (`Nachhauseweg`) | Bajo | `nextWord` capitalizado sigue bloqueando cap del adj — comportamiento deseado |
| `das Gute` / `das Positive` sin adj | Medio | Test: artículo + lemma sin siguiente N → cap **sí** debe seguir |

## 6. Impacto esperado

| Corpus | Evidencia actual | Impacto estimado |
|---|---|---|
| **G2** | 9 cap-ups M2 (`positiven`×2, `blaue`, `grüne`, `gelben`…); 3/6 findings nuevos | **−3 a −6 findings** |
| **generated** | 4 `addedFindings` M2 | **−4 a −8** en `adj_before_noun`; colateral en `grüne`/`gelben` no reportados por gate |
| **producción** | Colores en T5 notices | Corrige bins/Tonnen/Säcke en modo full |

---

# M3 — `SUBSTANTIVISING_ARTICLES` demasiado agresivo

## 1. Causa raíz

`SUBSTANTIVISING_ARTICLES` mezcla **tres categorías** con semántica distinta:

```javascript
// capitalizeNouns.mjs L96–110
'der'…'den'     // artículos determinantes
'im','am','zum'… // contracciones prep+art
'welchen'…       // interrogativos
'als'            // preposición
```

La rama cap L246–248 trata **cualquier** miembro igual:

```text
if (SUBSTANTIVISING_ARTICLES.has(prevLc)) {
  if (nextWordIsCapitalizedNoun(nextWord)) return false;
  return true;  // capitaliza token en minúscula
}
```

- **`welchen positiven Punkt`:** `welchen` activa sustantivación; M2 alimenta `isCertainNounLemma`.
- **`als positiven Schritt`:** `als` fue añadido para *als Erstes* / *als Wichtig* (sustantivo solo), pero en *als positiven Schritt* hay **adj + N atributivo** — no sustantivación.

decap **también** usa el set (L317, L379, L436) para **no bajar** tras artículo — cambiar el set afecta ambos lados.

## 2. Funciones que intervienen

| Función | Rol |
|---|---|
| `SUBSTANTIVISING_ARTICLES` | Disparador binario sustantivación |
| `shouldCapitalizeLowerNoun()` L246–248 | Cap tras disparador |
| `decapitalizeMidSentence()` L317, L379 | No decap tras artículo |
| `isHeuristicAdjAdvOvercapitalized()` L436 | Excepción si prev es artículo |
| `isModalInfinitiveOvercapitalized()` L428 | Excepción zu/artículo |
| `scanP2CapitalizationViolations()` L460 | Auditoría pool |

## 3. Otras reglas afectadas

- **Sustantivaciones reales con `als`:** `als Erstes`, `als Wichtig`, `als Bestes` → deben **seguir** capitalizándose.
- **Interrogativos:** `welche Möglichkeit` (adj) vs `Welches ist besser?` (sustantivo elíptico).
- **Contracciones `im/am/zum`:** comparten comportamiento con artículos — mantener en tier “fuerte”.
- **decap:** si se saca `als` del set global, decap podría bajar sustantivaciones legítimas tras `als`.

## 4. Solución mínima

**Split en dos tiers** sin eliminar datos:

```text
SUBSTANTIVISING_ARTICLES_STRONG  // der, die, das, ein, welche, im, am, …
SUBSTANTIVISING_ARTICLES_WEAK    // als  (solo sustantivo elíptico, sin N siguiente)
```

Regla cap mínima:

```text
if (STRONG.has(prevLc)) { /* lógica actual */ }
if (WEAK.has(prevLc)) {
  // Solo capitalizar si NO hay nextWord capitalizado (sustantivo elíptico)
  if (nextWord && isCapitalizedWord(nextWord)) return false;
  return isCertainNounLemma(lc);
}
```

Para **`welchen`:** mover a tier intermedio o aplicar la misma regla que WEAK: si `nextWord` es N capitalizado → no cap (es adj+N).

**No tocar** el set usado por decap en la primera iteración M3-cap-only; o aplicar simetría en iteración M3b tras medir.

## 5. Riesgo de regresión

| Riesgo | Nivel | Mitigación |
|---|---|---|
| Romper `als Erstes` | Alto | Test explícito: `als` + sin N siguiente → cap sí |
| Romper `welches Problem` vs elíptico | Medio | Tests con/sin N siguiente |
| Desincronizar decap↔cap | Medio | Fase M3a = solo cap; M3b = decap si métricas OK |

## 6. Impacto esperado

| Corpus | Evidencia actual | Impacto estimado |
|---|---|---|
| **G2** | 2/6 findings (`positiven` t2+t4 con `welchen`/`als`) | **−2 findings** directos |
| **generated** | 3 `addedFindings` con prev `als`/`welchen` | **−2 a −4** |
| **producción** | Casos `als wichtigen` ya cubiertos por Phase 1 | Bajo incremental; beneficio en adj **fuera** del guard |

**Dependencia:** M3 solo sobre `positiven` **después** de M2 reduce el alcance; si M2 ya corrige adj+N homógrafo, M3 aporta margen en lemmas **no homógrafos** futuros.

---

# M4 — Bug morfológico `hasNominalSuffix` (`-chen`)

## 1. Causa raíz

```javascript
const NOMINAL_SUFFIX_RE = /(?:ung|heit|keit|schaft|tion|tät|nis|tum|chen|lein)$/i;

function hasNominalSuffix(lc) {
  return NOMINAL_SUFFIX_RE.test(lc);
}
```

El alternante `chen` matchea **cualquier** secuencia final `…chen`, incluyendo **desinencias adjetivas**, no solo diminutivos:

| Token | ¿Match? | ¿Diminutivo real? |
|---|---|---|
| `frischen` | ✓ (`frisch`+`en` contiene `chen` en pos. 4–7) | ✗ adj |
| `chemischen` | ✓ | ✗ adj |
| `technischen` | ✓ | ✗ adj |
| `gemeinschaftlichen` | ✓ | ✗ adj |
| `bisschen` | ✓ | ✓ diminutivo (caso límite) |
| `Mädchen` | ✓ | ✓ sustantivo |

`isCertainNounLemma('frischen')` → true **solo** por `hasNominalSuffix`, no por léxico.

## 2. Funciones que intervienen

| Función | Rol |
|---|---|
| `NOMINAL_SUFFIX_RE` / `hasNominalSuffix()` | Falso positivo |
| `isCertainNounLemma()` | OR con léxico |
| `shouldCapitalizeLowerNoun()` | Consumidor |
| `HOMOGRAPH_RISK` check L234 | Excepción si `hasNominalSuffix` — amplifica el bug |

**Nota:** `germanNounLexicon.mjs` usa `NOUN_SUFFIX_RE` distinto (más estricto en contexto `buildLexicon`). El bug es **local de cap**.

## 3. Otras reglas afectadas

- **Diminutivos reales:** `Mädchen`, `Brötchen`, `bisschen` — no deben dejar de capitalizarse cuando son sustantivos.
- **`HOMOGRAPH_RISK`:** palabras con sufijo nominal espurio escapan homógrafo block.
- **No afecta decap** directamente (no usa `hasNominalSuffix` en decap path principal).

## 4. Solución mínima

Reemplazar el alternante bare `chen` por **diminutivo con raíz mínima**:

```text
// Opción A (preferida): dos reglas separadas
hasNominalSuffix(lc):
  if (/(?:ung|heit|keit|schaft|tion|tät|nis|tum|lein)$/i.test(lc)) return true
  if (/(?<![eil])chen$/i.test(lc) && lc.length >= 7) return true  // excluye -ischen/-lichen
  return false

// Opción B (más conservadora): hasNominalSuffix solo si lexicon.has(lc) || isKnownGermanNoun(lc)
// Elimina sufijo como señal independiente — puede reducir recall de sustantivos no léxicos
```

**Opción A** recomendada: un solo archivo, tests con lista de regresión de los 14 cap-ups G2.

Excluir explícitamente patrones adjetivos: `/(ischen|lichen|ischen|ischen)$/`.

## 5. Riesgo de regresión

| Riesgo | Nivel | Mitigación |
|---|---|---|
| Dejar de capitalizar diminutivo válido | Bajo | Tests: `Mädchen`, `Brötchen`, `Gärtchen` |
| `bisschen` en `ganz bisschen` | Medio | Sigue siendo -chen válido; contexto adverbial lo maneja decap/heurística — test |
| Sustantivos en `-ung` no léxicos | Muy bajo | Otros alternantes del RE siguen activos |

**Riesgo global: BAJO** — mecanismo más aislado del pipeline.

## 6. Impacto esperado

| Corpus | Evidencia actual | Impacto estimado |
|---|---|---|
| **G2** | **14 cap-ups** por sufijo espurio; 1/6 findings nuevos (`Frischen`) | **−1 finding** directo; **−10 a −14** cap fixes colaterales |
| **generated** | 5 `addedFindings` M4 | **−3 a −6 findings** |
| **producción** | `frischen`, `chemischen` en passages | Mejora en T2/T4/T5 modo full |

Tokens G2 afectados: `frischen`, `chemischen`, `technischen`, `beruflichen`, `zusätzlichen`, `schädlichen`, `gemeinschaftlichen`, `anfänglichen`, `bisschen` (revisar caso adverbial).

---

# Priorización de fases

## Criterios

1. **Aislamiento** — ¿el diff toca un solo mecanismo?
2. **Riesgo** — ¿rompe sustantivaciones reales?
3. **ROI medido** — cap-ups / findings en dry-run
4. **Dependencias** — M2 antes que M3 en casos mixtos; M4 independiente

## Roadmap propuesto

| Fase | Mecanismo | Versión target | Diff estimado | Criterio de éxito |
|:---:|---|---|---|---|
| **1** ✅ | Phase 1 espejo guard | `v3.1-stable` | Hecho | Integrada; G2 tuvo 6 `addedFindings` (protocolo endurecido después) |
| **2** | **M4** sufijo `-chen` | `v3.2-stable` | ~15 LOC + 8 tests | **Protocolo completo** (ver abajo) |
| **3** | **M2** homógrafo cap-path | `v3.3-stable` | ~30 LOC + 10 tests | **Protocolo completo** |
| **4** | **M3** tiers artículos | `v3.4-stable` | ~25 LOC + 8 tests | **Protocolo completo** |
| **5** | **M1** cierre flexiones | `v3.5-stable` | ~50 LOC helper + 12 tests | **Protocolo completo** |

**Criterio de éxito unificado (fases 2–5):** ver `PHASE-ACCEPTANCE-PROTOCOL.md`.

### Por qué este orden

1. **M4 primero:** bug determinista, 14 cap-ups medidos, riesgo mínimo, no interactúa con guard ni léxico.
2. **M2 antes que M3:** resuelve el núcleo homógrafo (`positive`, `blau`) independiente del disparador; reduce casos mixtos antes de tocar artículos.
3. **M3 después:** requiere tests de sustantivación elíptica; impacto menor una vez M2 aplicado.
4. **M1 al final:** es la única fase que toca el guard (vía closure automático); el usuario pidió detener parches manuales — se implementa como **infraestructura**, no como lista nueva de lemmas.

### Fases explícitamente fuera de scope

- Modificar `pos-caps-check.py` / gate G2
- Editar `de-gender.json` para quitar homógrafos
- Ampliar manualmente `ADJ_NEEDS_ARTICLE_GUARD`
- Mezclar M2+M3 en un solo PR

---

## Protocolo de verificación (cada fase)

**Documento canónico:** [`PHASE-ACCEPTANCE-PROTOCOL.md`](PHASE-ACCEPTANCE-PROTOCOL.md)

Condiciones **simultáneas** (todas obligatorias):

1. `addedFindings == 0` en G2, generated y producción-15
2. `afterFindings <= beforeFindings` en cada corpus
3. `npm run test:german-caps-normalize` — 100 % pass
4. `capFixed` ≥ baseline de la fase anterior (mismo corpus)
5. Dry-run completo en los **tres** corpus

**Regla de rechazo:** un solo `addedFinding` → la fase no se integra; vuelta a diseño (`PHASEn-REJECTED.md`).

```powershell
npm run test:german-caps-normalize
node scripts/repair-german-caps-normalize.mjs --dir batches/ready/lesen --dry-run --out batches/ready/PHASEn-G2-DRYRUN.json
node scripts/repair-german-caps-normalize.mjs --dir batches/generated --dry-run --out batches/ready/PHASEn-GENERATED-DRYRUN.json
node scripts/repair-german-caps-normalize.mjs --files <15 archivos producción> --dry-run --out batches/ready/PHASEn-PRODUCTION-15-DRYRUN.json
```

**Artefactos por fase aceptada:** `PHASEn-RESULTS.md` + 3 JSON/MD de dry-run + bump `GERMAN_CAPS_NORMALIZE_VERSION`.

---

## Resumen de impacto acumulado (estimación conservadora)

| Corpus | Baseline pre-Phase 1 | Tras Phase 1 | Tras fases 2–5 (objetivo) |
|---|---:|---:|---:|
| G2 findings | 88 | 85 | **≤ 78** (−7 adicional) |
| generated findings | 209 | 192 | **≤ 180** |
| Findings nuevos post-normalize | — | 6 (G2) | **0** |

La cifra G2 ≤ 78 asume: M4 −1, M2 −3, M3 −0/−2 (solapamiento con M2), M1 −2.

---

## Referencias

- `scripts/lib/capitalizeNouns.mjs` — guard, artículos, `shouldCapitalizeLowerNoun`, `hasNominalSuffix`
- `scripts/lib/germanNounLexicon.mjs` — `singularCandidates`, `isKnownGermanNoun`
- `scripts/lib/germanCapsNormalize.mjs` — pipeline decap→cap
- `batches/ready/PHASE1-G2-6-NEW-FINDINGS-ANALYSIS.md` — evidencia de los 6 casos
- `batches/ready/ADJ-GUARD-RISK-ANALYSIS.md` — riesgo sustantivación en guard
- `batches/ready/DECAP-CAP-INTERACTION-DESIGN.md` — diseño Phase 1
