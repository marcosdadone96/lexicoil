# Política de niveles `live` — contenido servido

Ningún combo `lang/level` pasa a **`live`** en `data/exams/availability.json` sin cumplir **todos** estos criterios:

| Criterio | Comando / gate |
|----------|----------------|
| **12 exámenes** servidos | `build-level --target 12` + conteo en manifest |
| **Fidelidad 12/12** vs blueprint v3 | `npm run validate:fidelity:de-b1 -- --strict` (o `--all --live-only` en CI) |
| **Dedupe cross-exam OK** | incluido en `validate-exam-fidelity` (0 duplicados >85 % texto) |
| **Tests verdes** | `npm run test:engine` + CI `.github/workflows/content-validation.yml` |
| **Curated alineado** | `library/curated/<lang>/<level>/` pasa caps + fidelidad (validado en `pre-build-guard`) |

## Estados en `availability.json`

| Status | CI bloquea build | Uso |
|--------|------------------|-----|
| **`live`** | **Sí** — falla `validate:fidelity:all --live-only` si hay errores o dedupe roto | Usuarios finales |
| **`beta`** | **No** — solo reporta warnings en log | Staging / QA interno |
| **`hidden`** | **No** | Sin archivo servido o vacío |

## CI (GitHub Actions)

Workflow: [`.github/workflows/content-validation.yml`](../.github/workflows/content-validation.yml)

En cada **push** y **pull_request** a `main`/`master`:

1. `npm ci` (Node 20)
2. `npm run ci:content` → `build:availability` + `validate:fidelity:all --strict --live-only`
3. `npm run test:engine`

**Falla el job** si:

- Algún nivel **`live`** tiene exámenes con errores de fidelidad blueprint
- Algún nivel **`live`** tiene duplicados de pasaje cross-exam
- Cualquier script de `test:engine` sale con exit ≠ 0

Los niveles **`beta`** / **`hidden`** aparecen en el log como *report only* y **no bloquean** el merge.

## Pre-build guard (local)

Antes de escribir `data/exams/<lang>_<level>.json`, `build-level.mjs --apply` invoca:

```bash
node scripts/pre-build-guard.mjs --lang de --level B1 --snapshot data/exams/_snapshots/de_B1.<ts>.json
```

Flujo:

1. Snapshot del served actual (`scripts/snapshot-served.mjs`)
2. Validar curated (caps + fidelidad + dedupe)
3. Promover curated → served
4. Re-validar served
5. **Si falla → revertir** al snapshot (no dejar served corrupto)

Restaurar manualmente:

```powershell
copy data\exams\_snapshots\de_B1.<timestamp>.json data\exams\de_B1.json
npm run validate:fidelity:de-b1 -- --strict
```

## Promover a `live` (checklist manual)

1. `npm run build:level -- --lang de --level B1 --target 12 --apply --yes`
2. `npm run validate:fidelity:de-b1 -- --strict` → **12/12**, dedupe OK
3. Validar curated: `node scripts/pre-build-guard.mjs --lang de --level B1 --dry-run`
4. `npm run ci:content && npm run test:engine` en local (o esperar CI verde)
5. Editar manifest / `build-availability.mjs` para marcar `live` **solo entonces**

**Nunca** marcar `live` con menos de 12 exámenes o con fidelidad parcial.
