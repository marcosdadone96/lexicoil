# Pool exhaustive audit — 2026-07-10

**Universo:** 289 archivos (pool-verified 134 + pool-content-ok-lesen 155) · todos los módulos · **sin fixes** (solo informe).

Datos crudos: `POOL-EXHAUSTIVE-AUDIT-2026-07-10.json`

## Tabla única

| # | Check | Archivos que fallan | Cobertura | Ejemplos (verificar) |
|---|-------|--------------------:|-----------|----------------------|
| **1a** | `vocabularyTags` **idénticos** entre preguntas del mismo archivo (ratio pares idénticos ≥50%) | **138** | 100% | `horen-t2-gemini-003.json` (5/5 qs, ratio 1.0) · `lesen-t3-auto-we7l2c.json` (tags casi iguales: Urlaub/Umzug/marken/Bildschirm en 6/7 qs) · `lesen-t1-gemini-081.json` |
| 1a′ | Tags casi idénticos (J≥0.8) sin mayoría idéntica | **0** | 100% | — |
| 1b | ß→ss en `vocabularyTags` | **0** | 100% lexicón parcial (`gross/strasse/fuss/spass/heiss/…`) | — |
| 1b′ | ß→ss en campos de texto | **0** | idem | — (grep manual del mismo lexicón: 0 hits en el pool) |
| 1c | Verbo conjugado en tags | **0** | 100% lista finita | — |
| 1d | Sustantivo en minúscula en tags | **1** | 100% lista B1 | `lesen-t4-gemini-026.json` → `verein` |
| 1e | Adjetivo flexionado en tags | **0** | 100% lista | — |
| 1f | Palabra funcional en tags | **0** | 100% | — |
| **2** | `grammarTags` poco relacionados al texto | **2** / muestra 40 | **No 100% auto** | `horen-t1-gemini-016.json` stored `[relativ, modalverben]` vs inferred `[nebensatz, relativ]` · `horen-t2-gemini-016.json` `[relativ, passiv]` vs `[relativ, konjunktiv]` |
| **3** | `topicTag` mismatch vs contenido | **0** | 100% detector actual | — |
| **4** | `_poolRejectReason` en `pool-verified/` | **0** | 100% | — (no reapareció tras T3) |
| 5a | Pasajes duplicados internos (`collapseIdenticalPassages`) | **0** | 100% | — |
| **5b** | Preguntas casi idénticas en el mismo archivo (token J≥0.85) | **47** | 100% | `lesen-t3-auto-we7l2c.json` Jan/Russland vs Sami/Arabisch (J=0.87) · `lesen-t3-auto-x4k027.json` Bügel/Sehhilfe vs Rolle/Gepäck (J=0.85) · `lesen-t3-auto-yii0su.json` Kleidung vs Mützen vs Hosen (J=0.87–0.88) — *ver nota T3 abajo* |
| **6** | Concordancia género art+adj+sust | **0** | **Parcial** (netz/system/problem/angebot/zentrum + neutros/masc frecuentes) | — (FN esperados fuera del lexicón) |
| **7** | Vocabulario forzado / registro | **0** | Proxy regex (Ontologie/Konjunktiv/…); **Q3B LLM no corrido** | — |

### 1a desglose por módulo/Teil

| Celda | Archivos |
|-------|--------:|
| lesen-t3 | **59** |
| lesen-t1 | **36** |
| lesen-t5 | **21** |
| horen-t2 | 10 |
| horen-t4 | 7 |
| horen-t3 | 5 |
| horen-t1 | **0** |
| schreiben / sprechen | 0 en este corte |

**Lectura 1a:** el patrón de “bloque compartido → mismos tags en todas las preguntas” está confirmado en **Lesen T3** (opciones A–J compartidas) y también en **Lesen T1/T5** y **Hören T2–T4** (extractor alimentado con blob de pasaje/opciones comunes). **Hören T1 no** muestra el patrón (segmentos separados).

**Nota 5b / T3:** solapamiento léxico alto entre *situaciones* del matching es en parte estructural (misma plantilla: “X möchte … suchen”). No todos los 47 son basura; priorizar revisión de pares con J≥0.9 o pregunta casi calcada, no el matching T3 en bloque.

## Límites de automatización

| Check | ¿100% auto? | Si no |
|-------|-------------|-------|
| 1a–1f vocab | Sí (FN posibles en conjugados/sustantivos fuera de lista) | — |
| 1b ß/ss | Parcial (lexicón) | Ampliar pares; no requiere muestra si se acepta cobertura |
| 2 grammar | **No** | Muestra **40** ya hecha (2 flagged); revisión manual de esos 2 + opcional +20 si se quiere más confianza |
| 3–5a, 4 | Sí | — |
| 5b | Sí métrica; **interpretación** parcial en T3 | Muestrear **15** de los 47 (mezcla T3/no-T3) antes de regenerar |
| 6 género | **Parcial** | Tras ampliar lexicón: muestra manual **30** para residual |
| 7 forced | Proxy only | Si se quiere cierre fuerte: Q3B LLM en **20** Hören T1+T2 (confirmar coste) |

## Orden de arreglo (impacto → búsqueda por vocabulario)

| Prioridad | Qué | Por qué |
|-----------|-----|---------|
| **P0** | **1a — tags por pregunta, no por bloque compartido** | 138 archivos: el buscador no puede distinguir ítems; corazón del producto |
| P1 | **1d residual** (`verein`) | 1 archivo; cierre higiene v2 |
| P2 | **5b** (tras triaje T3 estructural vs basura real) | 47 archivos; confunde práctica, no tanto el índice de lemmas |
| P3 | **6** ampliar lexicón de género + re-scan | 0 hits hoy ≠ 0 errores; cobertura incompleta |
| P4 | **2** grammarTags (2/40) | Metadata secundaria; no bloquea vocab search |
| P5 | **7** solo si se aprueba coste Q3B | Proxy limpio; no regenerar en masa sin evidencia |
| — | 1b/1c/1e/1f/3/4/5a | **0** en este barrido; no abrir trabajo |

Cuando priorices, el bloque de fix natural es: **(1) extractor/enrich por-pregunta con texto local de cada ítem**, luego higiene 1d, luego triaje 5b.
