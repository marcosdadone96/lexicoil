# LexiCoil — Load test (k6)

Scripts listos para ejecutar contra **staging** cuando el operador lo decida. No correr contra producción sin aviso.

## Requisitos

1. [k6](https://k6.io/docs/get-started/installation/) instalado (`choco install k6` en Windows, o `brew install k6`).
2. Sitio staging desplegado con pool en Blobs (`reusable_part_idx:*` poblado).
3. Variables de entorno (ver `.env.example`).

## Staging mínimo (sin 500 cuentas)

| Variable | Obligatorio | Uso |
|----------|-------------|-----|
| `LOAD_TEST_BASE_URL` | Sí | URL base, ej. `https://deploy-preview-xxx--lexicoil.netlify.app` |
| `LOAD_TEST_JWT` | Para user-sync / personal exam-part | Token de 1 cuenta de prueba |
| `VOCAB_BG_INTERNAL_SECRET` o `AUTH_JWT_SECRET` | Para vocab-bg-trigger | Mismo secret que producción staging |
| `LOAD_TEST_EMAIL` | Para vocab-bg-trigger | Email de cuenta con vocab pendiente |
| `LOAD_SKIP_CLAUDE=1` | Recomendado | Evita gasto Anthropic en smoke |

Opcional: `LOAD_STAGE_1`, `LOAD_STAGE_2`, `LOAD_STAGE_3`, `LOAD_VUS`, `LOAD_SYNC_VUS`, `LOAD_CLAUDE_VUS`.

## Comandos

### Smoke (sin costo AI)

```powershell
cd c:\Users\marco\Desktop\MDR\lexiloop

$env:LOAD_TEST_BASE_URL = "https://TU-STAGING.netlify.app"
$env:LOAD_SKIP_CLAUDE = "1"

k6 run tests/load/k6-exam-part.js
```

**Esperado:** p95 &lt; 5s, `http_req_failed` &lt; 2%, respuestas 200 con `{ part: ... }` o `{ part: null }`.

### Tráfico mixto (plan completo)

```powershell
$env:LOAD_TEST_BASE_URL = "https://TU-STAGING.netlify.app"
$env:LOAD_TEST_JWT = "eyJ..."          # cuenta test
$env:LOAD_SKIP_CLAUDE = "1"            # o quitar para spell_check real (gasta créditos)
$env:LOAD_STAGE_1 = "50"
$env:LOAD_STAGE_2 = "200"
$env:LOAD_STAGE_3 = "500"

k6 run tests/load/k6-mixed-traffic.js
```

**Esperado:** gráficos k6 con thresholds verdes; si fallan → anotar VU y endpoint en el primer 429/5xx.

### Por endpoint

```powershell
k6 run tests/load/k6-exam-part.js
k6 run tests/load/k6-user-sync.js      # requiere LOAD_TEST_JWT
k6 run tests/load/k6-claude-chat.js    # LOAD_SKIP_CLAUDE=1 recomendado
k6 run tests/load/k6-vocab-bg-trigger.js
```

## Qué NO hacer en el primer run

- No usar `claude-chat` con generación de examen completo (gasta Sonnet + cuota).
- No disparar `vocab-bg-trigger` masivo sin cuenta de prueba aislada (puede lanzar Gemini bg).
- No apuntar a `lexicoil.com` producción sin límite de VUs bajo (&lt;20).

## Salida útil

Al finalizar, k6 imprime resumen `checks`, `http_req_duration`, thresholds. Guardar:

```
k6 run ... 2>&1 | Tee-Object -FilePath batches/ready/gate-logs/k6-run-FECHA.txt
```

## Archivos

| Script | Endpoint |
|--------|----------|
| `k6-mixed-traffic.js` | exam-part + user-sync + claude (mix) |
| `k6-exam-part.js` | GET pool genérico + personal |
| `k6-user-sync.js` | GET/PUT sync |
| `k6-claude-chat.js` | spell_check ligero |
| `k6-vocab-bg-trigger.js` | POST interno |
