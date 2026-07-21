# Diseño: modo auditoría para gates nuevos (propuesta — sin implementar)

**Fecha:** 2026-07-13  
**Objetivo:** Cualquier gate nuevo corre primero en modo auditoría (mide, no bloquea) antes de activarse como bloqueante — mismo criterio que la calibración de `mcq_length_bias` (2026-07-13).

---

## Problema

Hoy cada gate nuevo se cablea como bloqueante de entrada; el costo real solo se ve tras incidentes en producción (p. ej. sesgo longitud MCQ, word-copy). Necesitamos un **proceso estándar**, no excepciones ad hoc.

---

## Modelo de fases

| Fase | Comportamiento | Generación real |
|------|----------------|-----------------|
| `audit` | Ejecuta check, loguea findings, **nunca** `unlinkTmp` / retry | Continúa |
| `warn` | Finding en consola + JSONL; opcional flag en batch `_gateWarnings` | Continúa |
| `block` | FAIL normal → triage / retry / brake | Se detiene |

Promoción manual tras revisar métricas (operador o script de calibración).

---

## Registro central (`scripts/lib/qualityGates/gateRegistry.mjs` — nuevo)

```javascript
export const GATE_REGISTRY = {
  mcq_length_bias: {
    id: 'mcq_length_bias',
    phase: 'block',        // audit | warn | block
    modules: ['lesen', 'horen'],
    teile: [2, 5],
    since: '2026-07-13',
    calibrationRef: 'batches/ready/gate-logs/mcq-length-threshold-calibration-2026-07-13.json',
    run: () => import('../mcqLengthBias.mjs'),
  },
  // gate nuevo ejemplo:
  my_new_gate: {
    id: 'my_new_gate',
    phase: 'audit',        // ← empieza aquí
    modules: ['horen'],
    teile: [2],
    since: '2026-07-14',
    run: () => import('./myNewGate.mjs'),
  },
};
```

Override por entorno (sin redeploy):

```
GATE_PHASE_my_new_gate=audit
GATE_PHASE_mcq_length_bias=block
```

O manifest JSON versionado: `batches/ready/gate-phases.json`.

---

## Pipeline de integración

1. **En `runDualGates` / `runQualityAndStructuralGates`:** tras gates existentes, iterar `GATE_REGISTRY` filtrado por module/teil.
2. **`runRegisteredGate(gate, batch, ctx)`:**
   - `phase === 'audit'`: ejecutar check, append a `batches/ready/gate-logs/gate-audit-{date}.jsonl` con `{ gateId, file, findings, wouldBlock: true|false }`.
   - `phase === 'warn'`: igual + `console.warn` resumido.
   - `phase === 'block'`: finding → FAIL como hoy.
3. **No consumir `fixRetries`** en fase audit/warn.

---

## Calibración → promoción (checklist operativo)

1. **Día 0:** gate nuevo registrado con `phase: 'audit'`.
2. **Correr generate-cli** en 1–2 celdas (≥20 partes) o reprocess backlog.
3. **Script:** `scripts/calibrate-gate-threshold.mjs --gate my_new_gate` → tasa `wouldBlock`, distribución severidad, costo evitado estimado.
4. **Criterio mínimo para `block`:**
   - Tasa wouldBlock < 40% en pool representativo, O
   - Umbral calibrado con FP < 10% en muestra manual (como mcq_length_bias).
5. **Operador** cambia `phase` a `block` en registry + commit evidencia en `gate-logs/`.

---

## Log de auditoría (JSONL)

Ruta: `batches/ready/gate-logs/gate-audit.jsonl`

```json
{
  "ts": "2026-07-13T…",
  "gateId": "my_new_gate",
  "phase": "audit",
  "module": "horen",
  "teil": 2,
  "file": "batches/generated/horen-t2-gemini-042.json",
  "wouldBlock": true,
  "findings": ["gen-q-…: …"],
  "severity": "IMPORTANT"
}
```

Dashboard: `node scripts/report-gate-audit.mjs --gate my_new_gate --since 2026-07-13`.

---

## Relación con gates existentes

| Gate | Fase actual | Notas |
|------|-------------|-------|
| mcq_length_bias | block (calibrado) | Modelo de referencia |
| Q1-shadow, Q3, LT | audit de facto | Ya no bloquean |
| Gates nuevos | **audit obligatorio** | Esta propuesta |

---

## Esfuerzo estimado de implementación

1. `gateRegistry.mjs` + `runRegisteredGate()` — ~1 día
2. Wire en Lesen + generatePartGeminiLib — ~0.5 día
3. `gate-audit.jsonl` + report script — ~0.5 día
4. Migrar mcq_length_bias metadata al registry — ~2 h

**Total:** ~2 días. No bloquea el freno por archivo ni la visibilidad de costo (Partes 1–2).
