# Content staging — piezas sueltas antes de exámenes completos

Cola de contenido validado **por Teil** (Lesen T1, Hören T2, Schreiben T1, etc.) antes de
entrar al banco o convertirse en exámenes completos.

## Estructura

```
staging/
  {lang}/{level}/
    index.json              # índice de candidatos
    candidates/
      stg-de-B1-lesen-t1-abc123.json
      stg-de-B1-horen-t2-def456.json
```

## Estados de un candidato

| Status | Significado |
|--------|-------------|
| `pending` | Ingestado, pendiente de revisión |
| `approved` | Aprobado para merge al banco |
| `promoted` | Ya fusionado en `library/{lang}/{level}/questions.json` |
| `rejected` | Rechazado (manual) |

## Flujo completo

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ Batch Gemini    │     │ staging/         │     │ library/.../        │
│ AI exam (partes)│ ──► │ candidates/      │ ──► │ questions.json      │
│ ingest-to-staging     │ pending/approved │     │ (banco)             │
└─────────────────┘     └──────────────────┘     └──────────┬──────────┘
                                                            │
                                                            ▼
                                               ┌────────────────────────┐
                                               │ library/curated/       │
                                               │ library/pool-seed/     │
                                               │ (exámenes COMPLETOS)   │
                                               └────────────────────────┘
```

## Comandos

```bash
# 1. Ingestar un batch o examen IA → staging
node scripts/ingest-to-staging.mjs --lang de --level B1 --file batches/merged/mi-batch.json
node scripts/ingest-to-staging.mjs --lang de --level B1 --file ai-exam.json --format exam --auto-approve

# 2. Promover candidatos approved → banco
node scripts/promote-approved.mjs --lang de --level B1

# 3. Ensamblar exámenes completos del banco → curated + pool-seed
node scripts/promote-bank-to-curated.mjs --lang de --level B1 --min-coverage 1.0 --max 5

# Todo en uno:
npm run pipeline:run -- --lang de --level B1 --file batches/merged/foo.json --auto-approve
```

## Reglas

- **Piezas sueltas** → siempre staging (nunca pool runtime directamente).
- **Exámenes completos** (blueprint 100%) → `library/curated/` + `library/pool-seed/`.
- Los batches manuales pueden ir directo al banco con `merge-bank-batch.mjs` **o** pasar por staging
  (recomendado: staging permite validación por Teil antes del merge).
