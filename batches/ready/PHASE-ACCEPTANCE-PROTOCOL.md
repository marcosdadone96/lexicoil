# Protocolo de aceptación — fases arquitectónicas (M1–M4)

**Estado:** vigente desde 2026-07-08  
**Baseline de referencia:** `germanCapsNormalize v3.1-stable` (Phase 1 integrada)  
**Gate:** `v6.1-B-G2` congelado — no modificar  
**Principio:** pequeños cambios, verificables, sin regresiones (mismo estándar que Phase 1, criterios endurecidos)

---

## Regla de oro

> **Una fase solo se integra si cumple *todas* las condiciones a la vez.**  
> **Un solo `addedFinding` nuevo → la fase se rechaza y vuelve a diseño.** No se mergea, no se etiqueta `-stable`.

---

## Criterios de aceptación (obligatorios, simultáneos)

| # | Criterio | Definición operativa |
|---:|---|---|
| 1 | **`addedFindings == 0`** | Suma de `addedFindings` en el JSON de dry-run = **0** en cada corpus (ver abajo). Ningún finding bloqueante nuevo tras normalizar. |
| 2 | **`findings <= baseline`** | `summary.afterFindings` ≤ `summary.beforeFindings` en cada corpus. Mejora o empate; nunca empeora. |
| 3 | **Tests** | `npm run test:german-caps-normalize` — **100 % pass**, sin tests eliminados ni relajados. |
| 4 | **`capFixed` no disminuye** | `summary.capFixed` del dry-run con el cambio ≥ `capFixed` del dry-run **baseline** (misma versión anterior, mismo corpus, mismo modo). El fix no debe dejar de capitalizar sustantivos legítimos. |
| 5 | **Dry-run completo** | Ejecutar los **tres** corpus definidos abajo y archivar artefactos. |

### Nota sobre `capFixed`

- Comparar contra el **baseline de la fase anterior aceptada**, no contra raw sin normalizar.
- `decapFixed` puede variar; no es criterio de bloqueo.
- Modo dry-run: pipeline **full** (`decapOnly: false`), salvo que la fase documente explícitamente lo contrario.

### Nota sobre `addedFindings`

El script `repair-german-caps-normalize.mjs` calcula por archivo:

```text
addedFindings = findings en batch normalizado que no existían en batch raw
              (match por word + reason + field)
```

Criterio **estricto:** `Σ addedFindings.length === 0` en el reporte agregado.

---

## Tres corpus obligatorios

| ID | Directorio / selección | Archivos | Artefacto dry-run |
|---|---|---:|---|
| **G2** | `batches/ready/lesen` | 193 | `batches/ready/PHASEn-G2-DRYRUN.json` |
| **generated** | `batches/generated` (todos `lesen-t*.json`) | ~364 | `batches/ready/PHASEn-GENERATED-DRYRUN.json` |
| **producción-15** | 15 generados más recientes (lista fija por fase) | 15 | `batches/ready/PHASEn-PRODUCTION-15-DRYRUN.json` |

### Producción-15 — selección de archivos

Usar los 15 archivos listados en el manifest de la fase anterior aceptada, o regenerar con el mismo criterio:

> Los 15 `lesen-t*.json` más recientes en `batches/generated` por `mtime`.

Manifest de referencia v3.1: `batches/ready/V3-PRODUCTION-15-GENERATED.json` → campo `files[].file`.

---

## Comandos de verificación

```powershell
$env:NODE_OPTIONS="--use-system-ca"

# 1. Tests (bloqueante)
npm run test:german-caps-normalize

# 2. G2
node scripts/repair-german-caps-normalize.mjs `
  --dir batches/ready/lesen `
  --dry-run `
  --out batches/ready/PHASEn-G2-DRYRUN.json

# 3. Generated (completo)
node scripts/repair-german-caps-normalize.mjs `
  --dir batches/generated `
  --dry-run `
  --out batches/ready/PHASEn-GENERATED-DRYRUN.json

# 4. Producción-15 (lista explícita)
node scripts/repair-german-caps-normalize.mjs `
  --files batches/generated/lesen-t5-gemini-067.json batches/generated/lesen-t5-gemini-066.json ... `
  --dry-run `
  --out batches/ready/PHASEn-PRODUCTION-15-DRYRUN.json
```

Sustituir `PHASEn` por el identificador de fase (`PHASE2-M4`, `PHASE3-M2`, …).

---

## Checklist de aceptación (copiar por fase)

```markdown
## Phase N — [M4|M2|M3|M1] — checklist

- [ ] Diff acotado a un solo mecanismo
- [ ] `npm run test:german-caps-normalize` → PASS
- [ ] G2: addedFindings=0, afterFindings ≤ baseline, capFixed ≥ baseline
- [ ] generated: addedFindings=0, afterFindings ≤ baseline, capFixed ≥ baseline
- [ ] producción-15: addedFindings=0, afterFindings ≤ baseline, capFixed ≥ baseline
- [ ] `PHASEn-RESULTS.md` escrito con tablas antes/después
- [ ] `GERMAN_CAPS_NORMALIZE_VERSION` bump + entrada en GERMAN-CAPS-NORMALIZE.md
```

---

## Qué hacer si falla

| Fallo | Acción |
|---|---|
| `addedFindings > 0` (aunque sea 1) | **Rechazar fase.** Volver a diseño. No integrar. Documentar en `PHASEn-REJECTED.md` con los `addedFindings` completos. |
| `afterFindings > baseline` | Rechazar — regresión de gate. |
| Tests fallan | Rechazar — corregir o rediseñar. |
| `capFixed` baja | Rechazar — regresión de sustantivación real. Identificar tokens en `changes` del dry-run. |
| Solo mejora en 1–2 corpus | Rechazar — los tres corpus son obligatorios. |

---

## Baseline v3.1-stable (referencia para Phase 2+)

Métricas del dry-run **aceptado Phase 1** (modo full). Las fases 2–5 deben **igualar o mejorar** `afterFindings` y **no empeorar** `capFixed`; y cumplir `addedFindings=0` (criterio nuevo, más estricto que Phase 1 en G2).

| Corpus | beforeFindings | afterFindings | Σ addedFindings | capFixed |
|---|---:|---:|---:|---:|
| G2 (193) | 88 | 85 | **6** ⚠️ |
| generated (364) | 209 | 192 | ver JSON | 155 |
| producción-15 | 7 | 4 | **0** ✓ | 0 |

⚠️ Phase 1 **no habría pasado** el criterio `addedFindings=0` en G2 bajo este protocolo. A partir de Phase 2 el listón es uniforme en los tres corpus. El trabajo pendiente M1–M4 existe precisamente para cerrar esos 6 `addedFindings` sin regresiones.

Artefactos baseline:
- `batches/ready/PHASE1-G2-DRYRUN.json`
- `batches/ready/PHASE1-PRODUCTION-15-DRYRUN.json` (generated completo; usar subset 15 para prod)
- `batches/ready/PHASE1-RESULTS.md`

---

## Relación con el roadmap M1–M4

| Fase | Mecanismo | Versión target |
|:---:|---|---|
| 1 ✅ | Espejo guard (Phase 1) | `v3.1-stable` |
| 2 | M4 — `hasNominalSuffix` | `v3.2-stable` |
| 3 | M2 — homógrafos cap-path | `v3.3-stable` |
| 4 | M3 — tiers artículos | `v3.4-stable` |
| 5 | M1 — cierre flexiones | `v3.5-stable` |

Diseño por mecanismo: `batches/ready/ARCH-STABILIZATION-M1-M4-DESIGN.md`

---

## Artefactos obligatorios por fase aceptada

1. `batches/ready/PHASEn-RESULTS.md` — resumen ejecutivo
2. `batches/ready/PHASEn-G2-DRYRUN.json` + `.md`
3. `batches/ready/PHASEn-GENERATED-DRYRUN.json` + `.md`
4. `batches/ready/PHASEn-PRODUCTION-15-DRYRUN.json` + `.md`
5. Bump `GERMAN_CAPS_NORMALIZE_VERSION` en `germanCapsNormalize.mjs`
6. Entrada en `scripts/lib/GERMAN-CAPS-NORMALIZE.md`
