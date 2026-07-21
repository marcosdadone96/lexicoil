# Pool lifecycle — automatización (2026-07-10)

## ¿`poolReadyCheck` es automático?

**Sí, vía `finalizePoolReady`**, al final de cada generación/ingesta exitosa (salvo `--skip-pool-ready` / dry-run).

| Vía | ¿Automático? | Notas |
|-----|--------------|--------|
| `generate-lesen-part-gemini.mjs` (T1/T2/T4/T5 + T3 vía spawn make-t3 → `finalizeBatch`) | **Sí** | |
| `generatePartGeminiLib.mjs` (Hören / Schreiben / Sprechen) | **Sí** | |
| `paste-exam-inbox.mjs` → `pasteExamBatchLib` | **Sí** | |
| `make-t3.mjs` CLI directo | **Sí** (desde 2026-07-10) | Antes solo escribía en `generated/`; ahora llama `finalizePoolReady` si `--out` es `batches/generated` |
| `run-pool-ready-check.mjs` | Manual / bulk | Re-triar carpetas enteras |

Destinos posibles tras el triage:

| Veredicto | Carpeta |
|-----------|---------|
| READY | `pool-verified/` |
| Solo Q1 (Lesen) | `pool-content-ok-lesen/` |
| Gates 1–7 OK, falla metadata | `pool-content-ok/` (+ copia tagged en needs-regen según vía) |
| REJECT contenido | `needs-regeneration/` |

## 23/07 — `pool-content-ok-lesen/`

**No se promueve solo** al activar Q1 en block. Hay que correr:

```bash
node scripts/promote-pool-content-ok-lesen.mjs --dry-run
node scripts/promote-pool-content-ok-lesen.mjs
```

Checklist en [`PENDING-REVIEWS.md`](../PENDING-REVIEWS.md).
