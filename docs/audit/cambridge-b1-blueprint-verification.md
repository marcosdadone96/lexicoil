# Verificación blueprint `cambridge_B1.json` vs formato oficial (Etapa 0 — EN)

**Fecha:** 2026-07-08 · **Fuente oficial:** cambridgeenglish.org → B1 Preliminary exam format (formato 2020, idéntico en digital y papel) · **Autor:** Danilo

## Resumen

Los **conteos, tiempos y totales son correctos** (Reading 6 partes/32; Writing 2/2; Listening 4/25; Speaking 4). Los **tipos de tarea (`taskFormat`/`slotType`) son incorrectos en la mayoría de partes**: el blueprint mezcla tareas de B2 First (word formation, key word transformation, essay, review) que **no existen** en B1 Preliminary, y desordena las que sí existen. El test `test-cambridge-b1-modellsatz` pasa porque solo valida conteos, no formatos.

## Reading (45 min, 32 ítems) — 6/6 partes con formato incorrecto

| Parte | Oficial (Cambridge) | Blueprint actual | Veredicto |
|---|---|---|---|
| P1 (5) | MCQ sobre 5 avisos/mensajes cortos reales | `multiple_choice_cloze` | ✗ (el cloze va en P5) |
| P2 (5) | Matching: 5 personas ↔ 8 textos | `open_cloze` | ✗ (el open cloze va en P6) |
| P3 (5) | Texto largo, MCQ 4 opciones (actitud/opinión) | `word_formation` | ✗ (no existe en B1P; es B2 First) |
| P4 (5) | Gapped text: 5 frases extraídas | `key_word_transformation` | ✗ (no existe en B1P; es B2 First) |
| P5 (6) | Multiple-choice cloze (vocabulario) | `long_text_mcq` | ✗ |
| P6 (6) | Open cloze (1 palabra por hueco) | `gapped_text` | ✗ |

## Writing (45 min, 2 tareas)

| Parte | Oficial | Blueprint actual | Veredicto |
|---|---|---|---|
| P1 | **Email** obligatorio, ~100 palabras, responde a email+notas | `essay` (essay es B2 First P1) | ✗ |
| P2 | Elección: **artículo o historia**, ~100 palabras | choice de `email/review/article` | ✗ (review es B2; story falta; email pertenece a P1) |

`wordsTarget 100–120` razonable ("about 100 words" oficial).

## Listening (30 min, 25 ítems)

| Parte | Oficial | Blueprint actual | Veredicto |
|---|---|---|---|
| P1 (7) | MCQ con **imágenes** (elegir el visual correcto) | `dialogue_extracts` MCQ | ~ (aceptable si se adapta sin imágenes; documentar la desviación) |
| P2 (6) | MCQ gist, 6 diálogos cortos | `sentence_completion` | ✗ (el gap-fill va en P3) |
| P3 (6) | **Gap fill** sobre monólogo | `monologue_mcq` | ✗ |
| P4 (6) | MCQ sobre entrevista (actitud/opinión) | `dialogue_speakers` (matching) | ✗ |

`plays: 2` ✓ (cada audio se escucha dos veces).

## Speaking (4 partes) — genérico, sin diferenciar

Oficial: P1 entrevista (2') · P2 **descripción de una foto** (turno largo, 3') · P3 discusión colaborativa (4') · P4 conversación general (3'). El blueprint repite `interaction/discussion` en las 4 partes; falta al menos `photo_description` en P2. Tiempo oficial: 10–12 min por pareja (blueprint dice 12–17).

## Criterio de aprobado

El blueprint usa `modularGrading: true` + `passPercentPerModule: 60` (modelo Goethe). Cambridge **no exige aprobar cada paper**: nota agregada en la Cambridge English Scale (aprobado B1 desde 140; cada paper pondera 25 %). **Decisión de producto pendiente** (mantener el modelo modular como adaptación pedagógica o replicar el agregado Cambridge). Afecta a `moduleGrading` del motor → coordinar con Marcos.

## Inconsistencias derivadas

1. `batches/MASTER_PROMPT_en.md` instruye generar `use_of_english` para B1 — contradice el blueprint (4 módulos, sin UoE en B1P). Corregir en Etapa 1.
2. `scripts/lib/blueprint-v3-specs.mjs` (cambridge_B1) solo fija conteos → ampliar con `taskFormat` esperado por parte para que el test Modellsatz capture este tipo de error.
3. Blueprints `cambridge_A2/B2/C1/C2` presumiblemente con el mismo patrón de scaffold — verificar antes de usarlos (B2 First sí tiene UoE integrado en Reading: 7 partes/52 ítems).

## Propuesta de corrección (pendiente de aprobación)

Reescribir `modules[].parts[]` de `cambridge_B1.json` con los formatos oficiales manteniendo ids `lesen/horen/schreiben/sprechen` y los conteos actuales; ampliar spec+test; decidir criterio de aprobado. Ningún examen en_B1 generado aún → cambio sin coste de migración de contenido.

## Corrección aplicada (2026-07-09)

Blueprint `cambridge_B1.json` **reescrito con los formatos oficiales** de B1 Preliminary 2020 (verificado contra cambridgeenglish.org/exam-format). El fix se hizo en el generador `scripts/lib/blueprint-v3-builder.mjs` (mapas Reading/Listening/Speaking específicos de B1, level-aware) + `scripts/lib/blueprint-v3-specs.mjs` (tiempo de Speaking 10–12 min; nota `taskFormatsVerified`), y se regeneró solo `cambridge_B1.json`.

Formatos resultantes por parte:

- **Reading:** P1 signs/notices MCQ · P2 person↔text matching (5↔8) · P3 long-text MCQ · P4 gapped text · P5 multiple-choice cloze · P6 open cloze. (Se eliminaron word_formation y key_word_transformation, que son de B2 First.)
- **Listening:** P1 picture MCQ (7) · P2 short-dialogue gist MCQ (6) · P3 monologue gap fill (6) · P4 interview MCQ (6). (P4 es MCQ, no True/False: la fuente T/F reflejaba el formato pre-2020.)
- **Writing:** P1 email obligatorio · P2 elección artículo o historia.
- **Speaking:** P1 interview · P2 photo_description · P3 collaborative_task · P4 general_conversation; tiempo 10–12 min por pareja.

Verificación: `test-cambridge-b1-modellsatz` pasa; A2/B2/C1/C2 Cambridge generan salida byte-idéntica (el builder level-aware no los afecta); ningún examen en_B1 generado aún → sin coste de migración.

**Pendiente antes de Etapa 1 (requiere Marcos, código compartido):** (1) guards de idioma en `normalizeBatch.mjs`; (2) criterio de aprobado (modular vs agregado Cambridge Scale). La recomendación #2 de este doc (ampliar el test para validar `taskFormat` por parte, no solo conteos) queda como mejora abierta.


## Criterio de aprobado — RESUELTO (2026-07-09)

Decisión (Danilo): **modelo agregado Cambridge English Scale** (no modular). Implementado como scope aditivo `cambridge-scale` en `js/ui/exam/moduleGrading.js`:
- `cambridge_B1.json`: `modularGrading:false` + `passRule { scope:'cambridge-scale', passScale:140, scaleFloor:120, scaleCeil:170, passRawPct:60, weightPerSkill:0.25 }`.
- Nota agregada = media de las 4 destrezas (25% c/u); **aprobado B1 desde 140**. Permite compensación entre destrezas (a diferencia del modular).
- Mapeo raw%→escala piecewise-linear anclado en 60% raw = 140 (0%→120, 100%→170). Es una **adaptación**: las tablas oficiales raw→escala por convocatoria no son públicas.
- Scope aditivo: Goethe (modular / whole-exam / whole-exam-total) y DELE (grupos / 3-pruebas) **sin cambios**. `results.js` despacha genéricamente por `ModuleGrading`, así que renderiza sin tocarse. Etiquetas en inglés.
- Tests: casos añadidos a `scripts/test-module-grading.mjs` (mapeo, aprobado/suspenso agregado, compensación, parcial). 18/18 modellsatz + DELE C2 pass-rule OK.

**Pendiente menor:** UX pass de la pantalla de resultados Cambridge (mostrar escala por destreza) → Etapa 2. Este cambio toca el motor compartido → revisar con Marcos (cubierto con tests de regresión, patrón habitual).
