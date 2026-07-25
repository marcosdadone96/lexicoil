# Web hybrid backend (`exam-plan` + `exam-hybrid-execute`)

Backend del examen híbrido personal **sin UI**. Usa `planHybridDecision` + factory Gemini compartido.

## Piezas

| Pieza | Ruta | Rol |
|-------|------|-----|
| **Decisión** | `netlify/functions/exam-plan.js` | POST/GET → `planHybridDecision` |
| **Ejecución** | `netlify/functions/exam-hybrid-execute.js` | Pool + factory Gemini + gate entrega |
| **Lib** | `netlify/functions/lib/hybridExamWebExecute.js` | Orquestación (terminal tests importan directo) |
| **Factory** | `scripts/lib/generateLesenPartFactory.mjs` | Gemini + plantillas + make-t3 |
| **Gate entrega** | `scripts/lib/lesenDeliveryGate.mjs` | T3 semantic:false, T4/T5 semantic:true |
| **Cliente** | `js/services/claudeClient.js` | `fetchHybridExamPlan`, `executeHybridLesenExam` |

## Flujo de créditos (personal_exam)

1. `POST claude-chat` `{ startGeneration: true, scope: 'personal_exam', maxChunks: 1 }` → **3 créditos** + `genTicket`
2. `POST exam-hybrid-execute` `{ genTicket, topic, vocab, plan? }` → examen (Gemini **no** cobra de nuevo)
3. Éxito al mostrar examen → `POST claude-chat` `{ deliverGeneration: true, genTicket }`
4. Fallo total → `POST claude-chat` `{ releaseGeneration: true, genTicket }` → reembolso

## exam-plan

```http
POST /.netlify/functions/exam-plan
Authorization: Bearer …
Content-Type: application/json

{
  "module": "lesen",
  "teils": [1, 2, 3, 4, 5],
  "topic": "Umwelt",
  "vocab": ["Klimawandel", "Mülltrennung", "…"],
  "lang": "de",
  "level": "B1"
}
```

## exam-hybrid-execute

```http
POST /.netlify/functions/exam-hybrid-execute
Authorization: Bearer …
Content-Type: application/json

{
  "genTicket": "<from startGeneration>",
  "topic": "Umwelt",
  "vocab": ["Klimawandel", "…"],
  "plan": { "fromPool": […], "toGenerate": […] },
  "lang": "de",
  "level": "B1"
}
```

Respuesta (`200`):

```json
{
  "ok": true,
  "exam": { "lesenParts": […], "_genTicket": "…" },
  "plan": { … },
  "trace": { "generator": "factory", "live": […], "gates": […] },
  "validation": { "valid": true, "errors": [] },
  "liveStats": { "gatePass": 3, "fallback": 0, "failed": 0 },
  "genTicket": "…"
}
```

Timeout Netlify: **300s** (`netlify.toml`). Requiere `ALLOW_LIVE_GEN=1` + `GEMINI_API_KEY` en servidor.

## Ejecución web vs terminal

| | Terminal | Web (HTTP) |
|---|----------|------------|
| Decisión | `planHybridDecision` | `exam-plan` |
| Generación | `generateLesenPartFactory` | mismo factory vía runner |
| Gate entrega | `validateLesenDelivery` | mismo |
| Créditos | N/A (CLI) | ticket `personal_exam` |

## Tests

```powershell
$env:ALLOW_LIVE_GEN='1'
node scripts/test-hybrid-exam-web-e2e.mjs

# Benchmark gate rate (3 runs web)
$env:ALLOW_LIVE_GEN='1'
node scripts/benchmark-hybrid-gate-rate.mjs --runs=3
```

Solo plan + pool: `--skip-live`

## UI (siguiente fase)

Cablear `generatePersonalExam` → `fetchHybridExamPlan` + `startExamGeneration` + `executeHybridLesenExam` + `deliverExamGeneration`. Ver `examGeneration.js` (aún pool-only / LexiCoilEngine serial).
