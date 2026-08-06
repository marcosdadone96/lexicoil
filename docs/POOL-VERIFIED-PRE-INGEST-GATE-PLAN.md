# Plan: gate obligatorio pre–pool-verified (Fase 4 — no implementado)

Documento de handoff para convertir `audit-pass-2.mjs` (CHK-* extendidos) en **bloqueo obligatorio antes** de que cualquier parte entre en `batches/ready/pool-verified/`, no solo auditoría retroactiva.

## Objetivo

**Publicación ≡ ingestión ≡ pool-verified**: un registro solo puede copiarse o promoverse a `pool-verified` si pasa el mismo conjunto determinista que la limpieza masiva (CHK-30, CHK-30b, CHK-Q5, CHK-31, CHK-32 global por celda, CHK-33, CHK-35, CHK-29, más invariantes existentes).

## Punto de enganche actual

| Etapa | Código hoy | Gap |
|--------|------------|-----|
| Generación → normalize | `normalizeBatch.mjs`, `balanceMcq`, Q5 en pipeline | No garantiza sello `_balanceMcqVersion` en históricos |
| POOL-2 ingest | `isPartPoolReady()` en `audit-pass-2.mjs` | Usa `auditExam` + CHK-23/26/27; **no** incluye aún CHK-30/Q5/31/33/35 ni global CHK-32 |
| Promoción manual a pool-verified | Scripts / copia de archivos | **Sin gate** — origen de `_rejectedReason` en pool |
| Publicación examen | `isExamPublishable()` + `GATE_BLOCK_CHECKS` | Nivel examen, no parte suelta |

## Diseño propuesto (implementación futura)

### 1. Función única `assertPoolVerifiedEligible(part, ctx)`

- Entrada: record de parte (mismo shape que POOL-2) + contexto opcional `{ allBatchesInCell, fileLabel }` para CHK-32.
- Ejecuta en orden:
  1. Metadatos: CHK-30 (rechazar si `_rejectedReason` presente).
  2. Contenido idioma: CHK-Q5 (`runGermanContentLanguageGate`).
  3. Estructura + calidad existente: mismos checks que el loop CLI actual de `audit-pass-2.mjs`.
  4. Global CHK-32: opcional en ingest (solo advierte) o bloqueante si nombre supera umbral **y** política POOL-5 lo activa.
- Salida: `{ ok, blocking[], advisory[] }` con acciones sugeridas (`retirar` / `corregir` / `ignorar`).

### 2. Integración en pipeline

1. **`isPartPoolReady`**: delegar a `assertPoolVerifiedEligible` (o llamar los mismos `chk*` que el CLI) para que POOL-2 y pool-verified compartan criterios.
2. **Script de promoción** (p. ej. mover a `pool-verified`): antes de `fs.rename` / copia, llamar gate; escribir rechazo en `pool-rejected/` con motivo CHK-id.
3. **`generate-cli` / ingest batch**: tras normalize + enrich, ejecutar gate; no escribir en pool si `ok === false`.
4. **CI opcional**: job `node scripts/audit-pass-2.mjs batches/ready/pool-verified --fail-on=IMPORTANT --action-report=gate-logs/pool-verified-latest.json` en PR que toque JSON del pool.

### 3. Política de severidad (alineada con reporte accionable)

| Severidad | Comportamiento ingest |
|-----------|------------------------|
| CRITICAL (CHK-Q5, CHK-30, CHK-22, CHK-23, …) | Bloqueo duro — no entra a pool-verified |
| IMPORTANT (CHK-30b, CHK-31, CHK-33, CHK-35, CHK-29, …) | Bloqueo en gate final; permitir cuarentena `pool-quarantine/` con flag |
| MINOR / INFO (CHK-32, CHK-24, …) | Advisory o bloqueo según `GATE_BLOCK_PENDING` |

Activar progresivamente moviendo CHK de `GATE_BLOCK_PENDING` → `GATE_BLOCK_CHECKS` cuando pool-health esté limpio (política V-10 ya documentada en `audit-pass-2.mjs`).

### 4. Metadatos de trazabilidad

Al pasar el gate, escribir en el JSON:

- `_poolVerifiedAt`: ISO timestamp
- `_poolVerifiedAuditVersion`: hash o versión de `audit-pass-2.mjs` + `GERMAN_CONTENT_LANGUAGE_GATE_VERSION`
- `_balanceMcqVersion`: obligatorio si hay MCQ (CHK-33)
- Prohibir persistir `_rejectedReason` en destino pool-verified (strip en normalize o fallo CHK-30)

### 5. Retroactivo vs nuevo contenido

- **Retroactivo**: auditoría masiva CLI (`--action-report`) — ya disponible.
- **Nuevo contenido**: mismo binario `audit-pass-2.mjs` invocado desde ingest; sin script paralelo.

### 6. Próximos pasos concretos (orden sugerido)

1. Extraer loop CLI a `runAuditPass2OnBatches(allBatches, files)` exportable (evitar duplicar lista de `chk*`).
2. Ampliar `isPartPoolReady` / `auditSinglePartRecord` con CHK-30, Q5, 30b, 31, 33, 35.
3. Encontrar todos los call sites que escriben en `pool-verified` y envolver con gate.
4. Añadir test de regresión: fixture con `_rejectedReason` debe fallar CHK-30.
5. Documentar en README operativo del batch pipeline.

## Referencias

- Auditoría: `scripts/audit-pass-2.mjs`
- Idioma Q5: `scripts/lib/qualityGates/germanContentLanguageGate.mjs`
- Lematizador: `isVocabLemmaCorruption` en `scripts/lib/enrichBatchMetadata.mjs` (v2.3.16)
- MCQ longitud: `scripts/lib/mcqLengthBias.mjs`
- Cronología Hören: `horenRfChronoEvidence.mjs` (T3), `horenT4ChronoEvidence.mjs` (T4)
