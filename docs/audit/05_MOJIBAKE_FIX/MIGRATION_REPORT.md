# MIGRATION REPORT — 05_MOJIBAKE_FIX

> Cursor rellena esto al terminar la fase. No borrar las secciones.

## Qué cambió

- **`scripts/lib/mojibakeLib.mjs`** (nuevo): detección de firmas mojibake (acentos `Ã*`, puntuación cp1252 `â€œ`, `â‚¬`, `Â¿`), reparación por mapa cp1252 + round-trip Latin-1→UTF-8, walker de ficheros.
- **`scripts/fix-mojibake.mjs`** (nuevo): dry-run por defecto; `--apply` repara in-place (UTF-8 sin BOM) con validación JSON post-fix.
- **`scripts/lib/assert-no-mojibake.mjs`** (nuevo): guard CI que falla si reaparece mojibake en `data/`, `js/content/`, `library/`.
- **`package.json`**: `fix:mojibake`, `fix:mojibake:apply`; guard en `validate:demo` y `test:engine`.
- **Inventario dry-run**: `docs/audit/05_MOJIBAKE_FIX/inventory.json` — **0 ficheros afectados** en el árbol actual (104 ficheros escaneados).

## Decisiones tomadas

- **Dos estrategias de reparación**: (1) mapa explícito cp1252 para comillas/guiones/euro/¿¡; (2) Latin-1→UTF-8 para secuencias `Ã*` típicas de es/de. Solo se tocan ficheros con firmas detectadas.
- **Sin reescritura de contenido**: el árbol ya estaba limpio; no se aplicaron cambios a exámenes existentes (`--apply` no necesario).
- **Prioridad demos**: verificados `de_B1_v3`, `es_A2_v1`, `es_C1_v1`, `es_C2` + exámenes `data/exams/de_*` — JSON válido, acentos/umlauts correctos, 0 firmas mojibake.
- **Nota**: algunos títulos legacy usan ASCII transliterado (`Hoeren` en lugar de `Hören`) — eso **no** es mojibake y queda fuera de alcance de esta fase.

## Riesgos / deuda introducida

- Reparación mixed-line (cp1252 + `Ã*` en la misma línea) depende de paso token; casos exóticos triple-codificados podrían quedar `unresolved` (el script reporta error y no escribe).
- El guard escanea extensiones de texto en tres raíces; contenido en otras rutas (p. ej. `landing/`) no está cubierto.

## Resultados de tests

- Comando(s):
  - `npm run fix:mojibake` → 104 ficheros, 0 mojibake
  - `node scripts/lib/assert-no-mojibake.mjs` → OK
  - `npm run validate:demo` → 54/54 variantes + 9/9 base + guard OK
  - Reparación sintética (`HÃ¶ren`, `Â¿QuÃ©?`, `MÃ¼nchen`, `â‚¬`) → texto limpio, JSON parseable
- Resultado: **todos verdes**

## Verificación manual

- Demos prioritarios (primera impresión): acentos españoles (`¿Qué`, `Mañana`) y umlauts alemanes presentes; sin secuencias `Ã`/`â€`.
- Exámenes almacenados `data/exams/de_A1…de_C2`: parsean; pasajes con `Stadtgärten`, `CO₂`, etc. legibles.

## Próximos pasos / pendientes

- Si se reimportan bancos desde fuentes legacy, ejecutar `npm run fix:mojibake` antes de `--apply`.
- Opcional: normalizar `Hoeren`→`Hören` en metadatos de módulo (cambio de contenido/copy, no encoding).

## Feature flags tocados

- Ninguno.

## Comandos útiles

```bash
npm run fix:mojibake          # dry-run + inventory.json
npm run fix:mojibake:apply    # reparar in-place
npm run validate:demo         # incluye assert-no-mojibake
```
