# batches/generated — staging de generación

Los archivos **ya no viven aquí de forma permanente**.

Tras cada generación (o tras `npm run pool:ready-check`):

| Destino | Criterio |
|---------|----------|
| `batches/ready/pool-verified/` | `poolReadyCheck` → **READY** (gates 1–8) |
| `batches/ready/pool-content-ok/` | Gates 1–7 OK; falta metadata retrieval |
| `batches/needs-regeneration/` | **REJECT** (motivo en `_poolRejectReason`) |

Script: `node scripts/run-pool-ready-check.mjs`  
Lib: `scripts/lib/poolReadyCheck.mjs` + `scripts/lib/finalizePoolReady.mjs`
