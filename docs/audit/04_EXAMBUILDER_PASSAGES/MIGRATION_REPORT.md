# MIGRATION REPORT — 04_EXAMBUILDER_PASSAGES

> Cursor rellena esto al terminar la fase. No borrar las secciones.

## Qué cambió

- **`js/library/PassageResolver.js`** (nuevo): resuelve `passageId` desde pregunta, contexto o inferencia por `module+teil`; nunca inventa texto.
- **`js/library/ExamBlueprint.js`**: ensamblado de partes lesen/hören embebe texto de pasaje (`signText`, `part.text`, `transcript`) vía PassageResolver; enriquece preguntas antes del pick.
- **`js/library/ExamBuilder.js`**: `buildLesenParts` / `buildHorenParts` usan PassageResolver; `annotateCurationNeeds()` marca exámenes con `needsCuration` + `curationReasons`.
- **`js/library/LibraryLoader.js`**: `getPassage` delega en PassageResolver.
- **`index.html`**: script tag para `PassageResolver.js`.
- **`scripts/repair-question-passage-ids.mjs`**: propaga `passageId` faltante en bancos (48 referencias reparadas).
- **`scripts/audit-stored-exams.mjs`**: audita `library/pool-seed/`, `library/{lang}/{level}/exams/`, `data/exams`, `data/demo`.
- **`scripts/test-exambuilder-passages.mjs`**: regresión de ensamblado de `de/B1`.
- **`scripts/warm-pool.mjs`**: expone `PassageResolver` + `ExamValidator` en global para anotación de curación en Node.
- **Bancos reparados**: `library/de/B1`, `de/B2`, `en/B2`, `en/C1` — `passageId` inferido en preguntas hermanas.
- **Pool re-publicado**: `library/pool-seed/{de_B1,de_B2,en_B2,en_C1,es_B2,es_C1}.json` regenerado con pasajes embebidos y flags de curación.

## Decisiones tomadas

- **No rellenar pasajes cortos**: los bancos actuales tienen pasajes ~37–75 palabras; el mínimo B1 es 150. Se marca `needsCuration: true` con `passage_too_short` en lugar de padding.
- **Inferencia de `passageId`**: solo desde preguntas del mismo `module+teil` en el banco; sin texto generado.
- **Criterio de “reparado” para esta fase**: toda parte de lectura/escucha tiene texto/transcript no vacío (0 `passage_missing` / `transcript_missing` en auditoría). Cumplir `strict:true` completo queda para fase 07 (contenido más largo + slots blueprint completos).
- **Pool seed**: sigue filtrando por `ExamValidator` no-estricto (examen jugable); los flags `needsCuration` documentan deuda de contenido.

## Riesgos / deuda introducida

- Bancos siguen **subdimensionados** vs blueprint (p. ej. lesen teil 2 espera 8–10 ítems, banco entrega 4) → `item_count_mismatch` en pool y exámenes estáticos.
- Cambridge `use_of_english` y DELE `schreiben`/`sprechen` aún **sin partes** en algunos ensamblados → `part_missing` (fuera del alcance del bug de pasajes, pero aparece en auditoría).
- Inferencia de `passageId` puede ser incorrecta si dos teils comparten grupo pero pasajes distintos (bajo riesgo con datos actuales).

## Resultados de tests

- Comando(s):
  - `npm run repair:passage-ids` → 48 `passageId` inferidos
  - `npm run seed:pool` → 6 archivos pool-seed regenerados
  - `npm run audit:stored-exams` → 85 archivos, 98 exámenes, 50 con `needsCuration`
  - `npm run test:library` → PASS (incl. `test-exambuilder-passages.mjs`)
  - `npm run test:engine` → PASS
- Resultado: **todos verdes**. Regresión confirma `signText` = texto de pasaje (no stub de pregunta), teil 2 con `text` compartido, hören con transcript.

## Verificación manual

- `library/pool-seed/de_B1.json`: `lesenParts[0].items[].signText` contiene texto de pasaje Stadtgärten (~52 palabras), no el enunciado de la pregunta.
- Auditoría post-fix: **0** ocurrencias de `passage_missing` o `transcript_missing` en `audit-report.json`.
- Pool seeds llevan `needsCuration: true` y `curationReasons` (p. ej. `passage_too_short`, `item_count_mismatch`).

## Próximos pasos / pendientes

- Fase **07_STRATEGY_B_PIPELINE**: ampliar bancos con pasajes ≥ mínimo por nivel y completar slots blueprint.
- Implementar ensamblado de `use_of_english` (Cambridge) y módulos DELE faltantes para eliminar `part_missing`.
- Consumir `needsCuration` en UI/admin para no servir exámenes incompletos en modo estricto.

## Feature flags tocados

- Ninguno nuevo. Reutiliza `ExamValidator` strict (fase 02) y blueprints (fase 03) solo para anotación/auditoría.

## Archivos reparados / regenerados

| Archivo | Acción |
|---------|--------|
| `library/de/B1/questions.json` | +15 `passageId` |
| `library/de/B2/questions.json` | +12 `passageId` |
| `library/en/B2/questions.json` | +12 `passageId` |
| `library/en/C1/questions.json` | +9 `passageId` |
| `library/pool-seed/*.json` (6) | Regenerados con pasajes + `needsCuration` |

Reporte machine-readable: `docs/audit/04_EXAMBUILDER_PASSAGES/audit-report.json`
