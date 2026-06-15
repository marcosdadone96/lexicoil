# MIGRATION REPORT — 03_AI_PATH_BLUEPRINTS

> Completado en rama `feat/ai-path-blueprints`. Depende de fase 02.

## Qué cambió

| Archivo | Acción |
|---------|--------|
| `js/engine/validation/blueprintResolver.js` | Ampliado: `resolveBlueprintByType`, `resolveBlueprintForSpec`, `aiPathBlueprintsEnabled`, índice central |
| `js/engine/prompts/blueprintPromptBinding.js` | **Nuevo** — chunk plan + prompt binding desde blueprint |
| `js/engine/prompts/PromptBuilder.js` | `buildExamChunksFromBlueprint`; flag `AI_PATH_BLUEPRINTS` |
| `js/engine/generators/ExamGenerator.js` | Validación strict+blueprint, 1 reintento con feedback, fallback legacy |
| `js/engine/generators/chunkRunner.js` | Suffix de reintento con feedback de validación |
| `js/ui/exam/examGeneration.js` | Pre-carga blueprint vía `ExamBlueprint.load` antes de IA |
| `index.html` | Scripts `blueprintPromptBinding`, `blueprintResolver` |
| `scripts/test-blueprint-ai-path.mjs` | **Nuevo** — tests de binding + muestra before/after |

## Decisiones tomadas

- **Fuente fiel = `library/blueprints/*.json`**, no `knowledge/providers/*.json` (provider sigue siendo fallback).
- **CEFR/gramática** siguen viniendo de `KnowledgeEngine` → `spec.constraints` / `ModuleInstructions`; el blueprint solo aporta estructura oficial (slotType, counts, instruction).
- **`AI_PATH_BLUEPRINTS` default OFF** — prod sin cambios hasta activar flag.
- **Fallback en cascada**: si la ruta blueprint falla tras reintento → generación legacy (provider chunk plan) sin tumbar el flujo.
- **Structured output** vía instrucciones JSON estrictas en prompt (sin tool-use en `claude-chat` en esta fase — reduce salvageJson pero no lo elimina del todo).
- **Módulo `grammatik`** del blueprint excluido (sin `expectKey` en renderer).

## Muestra B1 before / after

| Métrica | Antes (provider) | Después (blueprint) |
|---------|------------------|---------------------|
| Chunks Lesen B1 | 5 teils genéricos | 2 teils: `micro_texts` (5–6 items) + `article` (8–10 items) |
| Prompt | taskTypes + word range | + slotType, instruction oficial, **EXACTLY N items** |
| Validación post-IA | answer keys only | `ExamValidator({ blueprint, strict:true })` + 1 retry |
| Pasaje B1 mínimo | ~80–220 words (genérico) | teil 2: 400–500 target; validator floor 150 words |

## Riesgos / deuda introducida

- Mock/live AI puede seguir incumpliendo counts → fallback legacy frecuente hasta mejorar prompts o tool-use.
- Blueprint preload async solo en browser; Node tests usan sync resolver.
- `VALIDATOR_STRICT` global sigue separado; la ruta blueprint fuerza strict solo en `ExamGenerator` cuando hay blueprint.

## Resultados de tests

- `node scripts/test-blueprint-ai-path.mjs` — **OK**
- `npm run test:engine` — (ejecutado tras cambios)

## Verificación manual

- [ ] Activar `LC_AI_PATH_BLUEPRINTS=1` en consola o `AI_PATH_BLUEPRINTS=1` en Netlify
- [ ] Generar examen B1 DE por IA → revisar prompts en network tab (slotType + item count)
- [ ] Confirmar fallback si IA devuelve examen inválido (log `[exam] Blueprint AI path failed`)

## Próximos pasos / pendientes

1. **04_EXAMBUILDER_PASSAGES** — pasajes largos en banco (complementa teil 2)
2. Tool-use / JSON schema en `claude-chat.js` (eliminar salvageJson del hot path)
3. Activar flag en staging tras validar calidad live

## Feature flags tocados

- `AI_PATH_BLUEPRINTS` (env, default OFF)
- `window.LC_AI_PATH_BLUEPRINTS` (browser)
