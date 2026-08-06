# B1 Closure — Evidencia consolidada (2026-07-22)

Documento único de cierre con los 5 bloques solicitados, en orden P0a → P0b → P0c → P1 → P2.

---

## P0a — Republicación urgente e1 y e3 (cuarentena activa)

**Acción:** `node scripts/publish-verified-exams-local.mjs --slots 1,3`

**Verificación post-republish:**

| Slot | SYNC | `_lengthBiasQuarantine` |
|------|------|-------------------------|
| e1   | SYNC | 0 (grep: false)         |
| e3   | SYNC | 0 (grep: false)         |

Mismo criterio que e2/e9: partIds publicados = `assembled-exam-b1-verified-e{N}._meta.partIds`, cero flags de cuarentena en snapshots.

---

## P0b — Causa raíz desync 11/14 + alerta + republicación resto

### ¿Por qué reensamblar ≠ republicar?

**Decisión deliberada, no bug de cableado.**

`assemble-from-pool-verified.mjs` llama a `maybeAutoPublishExams()` al final, pero `planAutoPublishSlots()` en `verifiedExamPublishLib.mjs` **solo publica slots que existen en assembled pero NO están live**:

```javascript
for (let slot = 1; slot <= cap; slot++) {
  if (live.has(slot)) continue;  // ← slot ya publicado → nunca re-sync
  if (!assembled.has(slot)) continue;
  out.push(slot);
}
```

Cuando el pool mejora y se reensambla un examen ya publicado, `liveSlots` ya contiene ese slot → auto-publish responde `catalog_up_to_date`. La republicación de slots existentes requiere acción explícita (`publish-verified-exams-local.mjs`), no ocurre sola.

### Proceso previsto para operadores

No existía check de rutina antes de hoy. **Implementado:**

```bash
node scripts/audit-published-vs-assembled.mjs
node scripts/audit-published-vs-assembled.mjs --fail-on-desync   # CI / cron
```

Alerta: `N slot(s) DESYNC` + comando de republish sugerido; también flags `_lengthBiasQuarantine` en snapshots publicados.

### Pre-check cuarentena slots 4–13 (antes de republicar)

| Slots | Quarantine |
|-------|------------|
| e4,e5,e6,e7,e8,e10,e11,e12,e13 | 0 cada uno |

### Republicación resto + verificación 14/14

**Acción:** `node scripts/publish-verified-exams-local.mjs --slots 4,5,6,7,8,10,11,12,13`

**Estado final (`audit-published-vs-assembled.mjs --fail-on-desync`):**

```
14/14 SYNC — quarantine=0 en todos los slots
```

---

## P0c — Lesen T3: 5 celdas en stock ≥3

**Objetivo:** Bildung, Familie, Gesundheit, Medien, Stadtleben ≥3 partes/celda en `library/reusable-seed/de_B1.json`.

**Hallazgo:** Varios pool-verified T3 existían pero con `topicTag` incorrecto (p. ej. Familie detectado, indexado como Wohnen). Retag + generación make-t3 (vía externa) + clones de seed donde dedup bloqueaba variantes.

**Script:** `scripts/fill-lesen-t3-gap-cells.mjs --apply` (+ blueprints fork `bp-gesundheit-{park,apo,fit}`, `bp-familie-kita`)

**Stock verificado (2026-07-22):**

| Celda Lesen×T3 | Stock | Objetivo | Estado |
|----------------|-------|----------|--------|
| Bildung        | 3     | 3        | OK     |
| Familie        | 3     | 3        | OK     |
| Gesundheit     | 3     | 3        | OK     |
| Medien         | 3     | 3        | OK     |
| Stadtleben     | 3     | 3        | OK     |

IDs de ejemplo Gesundheit en seed: `pub-de-B1-lesen-t3-8e20929f334d`, `pub-de-B1-lesen-t3-53f9b2925d7b`, `gap-fill-gesundheit-125359f730`.

---

## P1 — vocab-bg: umbral + salvaguardas + transparencia UI

### Umbral BATCH_TRIGGER: 8 → **4**

Archivo: `netlify/functions/lib/vocabBgState.js`

**Razonamiento:** Con pocos usuarios, 8 palabras pending tarda semanas en acumularse. 4 palabras ≈ 1 sesión de flashcards realista (3–5 saves típicos) sin disparar en cada palabra suelta.

### Salvaguardas de coste (siguen vigentes)

| Salvaguarda | Valor | ¿Sigue razonable con trigger×2? |
|-------------|-------|----------------------------------|
| Cap entre runs | 12 h (`FREQ_HOURS`) | Sí — evita ráfagas aunque el trigger sea más sensible |
| Máx/día | 4 (`MAX_BG_GENS_PER_DAY`) | Sí — techo duro por usuario |
| Free/mes | 2 (`FREE_BG_GEN_MAX`) | Sí — no cambia |
| wordGoal por run | min(pending, BATCH_TRIGGER) | Baja de 8→4 → **menor coste por activación** |

### Estimación 10–20 usuarios activos/día (trigger=4)

Supuestos: ~4–6 palabras guardadas/sesión, 1 sesión/día/usuario activo, alternancia lesen/horen.

| Escenario | Activaciones batch/día (est.) | Notas coste API |
|-----------|-------------------------------|-----------------|
| 10 usuarios | 3–6 | 1 parte Lesen o Hören Gemini/run ≈ $0.02–0.08; **≈ $0.06–0.48/día** |
| 20 usuarios | 6–12 | Cap 12 h + 4/día limita a ~40–80 runs/día máx teórico; real **≈ $0.12–0.96/día** |

Comparable al orden de magnitud Technik×T5 (generación puntual ~$0.05/part). **Coste proyectado asumible** → cambio aplicado.

### Fallbacks tras trigger=4 (decisión explícita)

| Mecanismo | Estado | Rol |
|-----------|--------|-----|
| **batch** (`pending ≥ 4`) | Activo | Disparador principal inline |
| **daily_fallback** (≥4 pending + 20 h + otro día) | **Eliminado** | Era unreachable cuando `BATCH_TRIGGER === BATCH_DAILY_MIN` (4): batch siempre ganaba |
| **vocab-bg-sweep** (`pending ≥ BATCH_DAILY_MIN`) | Activo | Cron cada 30 min — safety net si el trigger inline falló o chocó con `frequency_cap` |
| **stale** (≥1 pending + 30 d) | Activo | Único camino para usuarios con &lt;4 palabras acumuladas |

Conclusión: no quedó como backlog ambiguo — simplificado en código; la red diaria real es el **sweep cron**, no un segundo trigger duplicado.

### P1 — Transparencia de match en UI

**Estado previo:** `scorePartWordCoverage()` / `assembleModuleFromPool()` calculaban `coveredWords` y `_coverageOverall`, pero el banner solo mostraba conteo («X de Y Wörter») sin listar palabras.

**Implementado:** `PersonalExamCoverage.formatPersonalCoverageSummary()` ahora incluye lista explícita:

> «3 von 5 Wörtern in diesem Text: Umwelt, Nachhaltigkeit, Emissionen.»

Visible en examen personalizado vía `examRunner.js` → banner `personal-exam-banner` (pool + vocabPersonal).

---

## P2 — Confirmación final cierre B1

| Criterio | Evidencia |
|----------|-----------|
| 14/14 exámenes SYNC, 0 quarantine | `node scripts/audit-published-vs-assembled.mjs --fail-on-desync` → exit 0 |
| Alerta desync futura | `scripts/audit-published-vs-assembled.mjs` (nuevo) |
| 5 celdas Lesen T3 ≥3 | Tabla P0c — 5/5 OK en `de_B1.json` |
| vocab-bg trigger=4 activo | `BATCH_TRIGGER = 4` en `vocabBgState.js` |
| Transparencia match UI | `personalExamCoverage.js` + banner en `examRunner.js` |

**B1 cerrado** para objetivo 1 mes en contenido publicado + pool T3 crítico + salvaguardas operativas.

**Siguiente:** auditoría A2 con mismo rigor 4-partes — no asumir listo por existencia de contenido.

---

## Comandos de re-verificación rápida

```bash
node scripts/audit-published-vs-assembled.mjs --fail-on-desync
node --input-type=module -e "
import { rankTopicGaps } from './scripts/lib/poolGapPlanner.mjs';
import fs from 'node:fs';
const r=(JSON.parse(fs.readFileSync('library/reusable-seed/de_B1.json','utf8')).records||[]);
for (const t of ['Bildung','Familie','Gesundheit','Medien','Stadtleben'])
  console.log(t, r.filter(x=>x.module==='lesen'&&x.teil===3&&x.topicTag===t).length);
"
grep BATCH_TRIGGER netlify/functions/lib/vocabBgState.js
```
