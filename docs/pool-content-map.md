# Mapa de contenido pool — dónde vive cada cosa

Referencia rápida para no mezclar borradores, rechazos y partes finales.

## Flujo pool-fill-teil (un Teil de punta a punta)

```
vocab-coverage-report  →  data/coverage/weak-de_B1.json
        ↓
pool-fill-teil         →  elige tema escaso + lemas flojos (rota cada N)
        ↓
Gemini / make-t3       →  batches/generated/*.json  (solo si pasa validación)
        ↓
publish-* --publish    →  POOL-2 gate → staging → banco → pool
        ↓
build-pool-stock-manifest → library/pool-stock/de_B1-lesen.json
```

## Carpetas importantes

| Carpeta / archivo | Qué contiene | ¿Es “final”? |
|-------------------|--------------|--------------|
| **`batches/generated/`** | Borradores que pasaron formato + calidad pedagógica | No — pendiente de publish o ya publicados |
| **`batches/generated/.rejected/`** | Rechazos del generador (metadata `_rejectedReason`) | No — basura controlada |
| **`batches/rejected/`** | Partes movidas aquí si fallan publish/POOL-2 | No — no entrar al banco |
| **`batches/.rejected/`** | Copia legacy de rechazos | No |
| **`batches/merged/`** | Pipeline legacy (exámenes completos por merge) | Intermedio |
| **`staging/de/B1/`** | Partes en revisión antes del banco | Intermedio |
| **`library/reusable-seed/de_B1.json`** | **Pool personal principal** (partes verificadas + topicTag + vocabIndex) | **Sí — fuente de verdad local** |
| **`library/reusable-seed/de_B1.bank.json`** | Partes adicionales del banco | **Sí — se mezcla en búsqueda pool** |
| **`library/pool-stock/de_B1-lesen.json`** | Manifest de stock por tema×Teil (UI + planner) | Metadatos |
| **`data/coverage/weak-de_B1.json`** | Lemas con poca cobertura (rotación vocab) | Metadatos |
| **`batches/.pool-fill-checkpoint.json`** | Progreso si interrumpes pool-fill | Checkpoint |
| **Netlify Blobs `lexicoil-data`** | Pool en producción (`--sync-pool`) | **Sí — prod** |

## Exámenes “oficiales” vs partes reutilizables

| Qué | Dónde |
|-----|--------|
| Exámenes publicados (Official/Practice) | `library/published-exams/`, `library/curated/` |
| Preguntas banco clásico | `library/de/B1/questions.json` |
| **Partes personalizadas (pool)** | `library/reusable-seed/de_B1*.json` + Blobs |

El configurador **Personal B1** ensambla desde **reusable-seed / Blobs**, no desde exámenes curados completos.

## Separación buenos / malos

- **Bueno:** pasa validate-batch + calidad + (al publicar) **POOL-2** (`isPartPoolReady`) → entra en `reusable-seed` y opcionalmente Blobs.
- **Malo:** se queda en `batches/rejected/` o se borra del generated; **nunca** se mezcla con el seed sin `--allow-audit-failures` (no usar en producción).

## Comandos

```bash
# Ver huecos de una celda
node scripts/pool-fill-teil.mjs --module lesen --teil 3 --status

# Generar 5 partes Lesen T3 (tema+vocab rotando) y publicar al pool
node scripts/pool-fill-teil.mjs --module lesen --teil 3 --target 5 --rotate-every 2 --publish --sync-pool

# Hören T2
node scripts/pool-fill-teil.mjs --module horen --teil 2 --target 10 --rotate-every 3 --publish

# Schreiben T1
node scripts/pool-fill-teil.mjs --module schreiben --teil 1 --target 3 --publish

# Regenerar manifest tras ingest manual
node scripts/build-pool-stock-manifest.mjs
```

Variables `.env` para publish remoto: `GEMINI_API_KEY`, `NETLIFY_SITE_ID`, `NETLIFY_API_TOKEN`.
