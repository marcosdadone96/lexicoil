# Lesen T3 — familia de molde compartido (FRENADO)

**Estado:** NO generar más partes con estos blueprints hasta ampliar genuinamente
personajes, situaciones y anuncios A–J (tarea aparte, mayor).

## Slugs afectados

| Slug | Notas |
|------|--------|
| `bp-reparatur-kurse` | Molde original (conector «Freizeit») |
| `bp-ernaehrung` | Fork temático |
| `bp-gesundheit` | Fork temático |
| `bp-umwelt` | Fork temático |

Comparten los mismos 10 anuncios y elenco (Brandt, Lena, Tobias, Hofer, Jonas, Sara, Walter).

## Gates automáticos (desde 2026-07-15)

Implementados en `scripts/lib/t3PoolDedupGate.mjs`, cableados en `make-t3.mjs` y `poolReadyCheck.mjs`:

1. **Core fingerprint** — slots 1–6 (q7 excluido); rechaza si ya existe en `pool-verified`.
2. **Límite familia** — máximo **1** parte total de los 4 slugs en `pool-verified`.
3. **Límite por slug** — máximo **1** copia por slug de la familia.

`make-t3` / `generate-lesen-part-gemini` T3 no publicará duplicados aunque se invoque manualmente.

## Excepción

`bp-freizeit-garten` y `bp-garten` son otra familia (elenco distinto) — no están frenados por este documento.
