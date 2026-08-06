# e1 post-republish verification (2026-07-10)

## Apply

| Step | Exit | Result |
|------|-----:|--------|
| `publish-exam.mjs --apply --yes --local-only --seed-overlay …` | **0** | `official-de-B1-e1` written |
| `sync-published-to-served.mjs --lang de --level B1 --apply` | **0** | `data/exams/de_B1.json` ← 1 exam |

## Hash vs dry-run (exact match)

| Cell | Predicted | Applied | Status |
|------|-----------|---------|--------|
| lesen_1 | `fc9bf3488fb9` | `fc9bf3488fb9` | CHANGED ✓ |
| lesen_2 | `361d68345765` | `361d68345765` | CHANGED ✓ |
| lesen_5 | `cc8169b7296f` | `cc8169b7296f` | CHANGED ✓ |
| horen_1 | `fd1cd3eb9ded` | `fd1cd3eb9ded` | CHANGED ✓ |
| other 8 cells | unchanged | unchanged | ✓ |

Content spot-check: lesen_5 `**` gone; L1 `Unternehmen wir…`; L2 `öffentliche Diskurs…`; topicTags present on L1/L2/L5/H1.

## Post-scan (`scan-bank-current-gates.mjs` on served e1)

| Gate | Served e1 | Notes |
|------|----------:|-------|
| AUD-4 bold | **0** | Treated → clean |
| AUD-4b bullets | **0** | Treated → clean |
| copia literal ≥4 (opción correcta) | **0** | Clean (los 6 del banco no están en e1) |
| topic_mismatch | **1** | Ver abajo — no es “sin topicTags” |
| verb_census V2 | **3** | Backlog explícito (no tratado hoy); en L1 tras sync de caps del banco |

### topic_mismatch = 1 (resuelto: FP / baja señal)

**Veredicto 2026-07-10:** tag `Gesundheit` en L2 pasaje 1 es **correcto** (texto sobre Herz, Immunsystem, Ärzte, krank…). Detector favorece Freizeit por Spaziergang/Park/Ausflüge. El `tag_unsupported` del escaneo fue artefacto (`part.text` vacío; cuerpo en `passages[]`).

→ Sin retagueo. Caso conocido: [`E1-L2-TOPIC-VERDICT-2026-07-10.md`](E1-L2-TOPIC-VERDICT-2026-07-10.md) + [`INDEX.md`](../INDEX.md).

### verb_census V2 = 3

En `gen-l1-61b004a3`: `Unternehmen` / `Kochen` / `Glaube` — mismo backlog V2 ya aparcado; no tocar en esta ronda.

JSON completo: `batches/ready/gate-logs/bank-current-gates-scan.json`
