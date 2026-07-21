# Pendiente de revisión

Recordatorios verificables para decisiones programadas. **No cerrar filas sin ejecutar el script/checklist y actualizar esta tabla.**

---

## Checkpoint activo

| Fecha objetivo | Qué revisar | Criterios (copia vigente) | Logs | Comando | Quién decide |
|----------------|-------------|---------------------------|------|---------|--------------|
| **2026-07-23** | Promoción Q1 shadow → block real | Ver tabla ↓ | `batches/ready/gate-logs/shadow-q1-*.jsonl` (desde 2026-07-09) | `node scripts/summarize-shadow-q1.mjs` | Marco — leer semáforo del summary + muestra manual ≥20 archivos si amarillo |

### Criterios Q1 shadow → block (desde 2026-07-09, solo `batches/generated/`)

Medir solo generación **nueva** post integración Wave 1c — **no** holdout `batches/ready/lesen/`.

| Métrica | Aceptable → activar block | Preocupante → otra iteración |
|---------|---------------------------|------------------------------|
| `wouldReject` rate global (archivos nuevos) | **< 15%** | **> 30%** |
| `wouldReject` por Teil 3 únicamente | **< 40%** (plantillas conocidas) | **> 60%** sin explicación |
| `mirror_pair` en shadow | **0%** (debe permanecer) | cualquier **> 0** → bug regresión |
| `bank_match` en shadow | **< 10%** o warn-only | **> 20%** → política bank_match→warn |
| Falsos positivos confirmados manualmente | **0 casos** en muestra ≥20 archivos | **≥2 casos** misma regla |
| Caso referencia qeh7ew↔tz7n7y en shadow | `wouldReject: true` en al menos uno | no detecta → bug fingerprint |

**Criterio de promoción:** 2 semanas de shadow, rate global < 15%, 0 mirror_pair, 0 FP manuales → Q1 pasa a **block** en generación live. Si T3 shadow > 40% pero 100% son cross_id con plantilla auto conocida, considerar block solo para `near_duplicate` T3, `bank_match`→warn.

### Checklist el 2026-07-23

1. [ ] Ejecutar `node scripts/summarize-shadow-q1.mjs --since 2026-07-09`
2. [ ] Abrir `gate-logs/shadow-q1-summary-{fecha}.md` — leer semáforo global
3. [ ] Si verde: promover Q1 a block en `pipelineIntegration.mjs` + actualizar INDEX
3b. [ ] Si amarillo específicamente por T3 > 40% pero 100% cross_id con fingerprint T3-auto conocido: activar block **SOLO** para `near_duplicate` en Teil 3, dejar `bank_match` en warn, resto de Teiles permanece en shadow. Documentar como promoción parcial en el historial, con fecha de reevaluación completa a 2 semanas más.
4. [ ] Si amarillo/rojo: revisar manualmente ≥20 archivos `wouldReject: true` y documentar en nueva fila aquí
5. [ ] **Promoción `pool-content-ok-lesen/`** (no es automática al activar Q1):
   ```
   node scripts/promote-pool-content-ok-lesen.mjs --dry-run
   node scripts/promote-pool-content-ok-lesen.mjs
   ```
   - READY → `pool-verified/`
   - Sigue solo-Q1 → **permanece** en `pool-content-ok-lesen/` (sigue ensamblable; backlog con riesgo aceptado)
   - Otro REJECT → `needs-regeneration/`
   - Solo si se decide **cerrar** el interim: añadir `--demote-q1` (Q1-only → needs-regen)
6. [ ] Marcar fila como cerrada con fecha y decisión tomada

---

## Adelanto 2026-07-10 (no cierra el checkpoint)

Corrido `summarize-shadow-q1.mjs` + triage del backlog `needs-regeneration` (395 Q1 únicos).  
Informe: [`gate-logs/POOL-CONTENT-TRIAGE-2026-07-10.md`](gate-logs/POOL-CONTENT-TRIAGE-2026-07-10.md) · shadow: [`gate-logs/shadow-q1-summary-2026-07-10T11-02-30.md`](gate-logs/shadow-q1-summary-2026-07-10T11-02-30.md).

| Señal | Resultado |
|-------|-----------|
| Semáforo shadow | 🔴 RED (global 34.5%, T3 100%, mirror 0) |
| Backlog | T3 = 147/395 con 15 fingerprints (agotamiento blueprints); resto mayormente mirror ready↔staging |
| Recomendación | **No promover block antes del 23/07**; T4 shadow 100% también requiere mirar antes de promoción parcial T3 |

---

## Historial (cerradas)

| Fecha cierre | Tema | Decisión |
|--------------|------|----------|
| — | — | — |
