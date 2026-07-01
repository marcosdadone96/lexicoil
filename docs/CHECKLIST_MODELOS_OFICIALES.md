# Checklist — modelos oficiales vs blueprints v3

Verificación de conteos por Teil (`itemsTotal`, `passagesPerPart`) y reglas de aprobación contra Modellsatz / handbook / guía oficial.

**Estado global:** 17/18 **coincide con oficial** · 1 **pendiente de fuente** (Cambridge A1) · 1 campo estructural **ajustado** (Goethe B1 `modularGrading`).

**Tests:** `scripts/test-<provider>-<nivel>-modellsatz.mjs` (18 archivos) + agregador `scripts/test-blueprints-v3-all.mjs`. Todos en `npm run test:engine`.

**Specs canónicas:** `scripts/lib/blueprint-v3-specs.mjs`

---

## Goethe-Institut (goethe.de / bfu.goethe.de)

| Blueprint | Lesen | Hören | Schreiben | Sprechen | passRule | Fuente | Estado |
|-----------|-------|-------|-----------|----------|----------|--------|--------|
| goethe_A1 | 5+5+5 (3T) | 5+5+5 (3T) | 2 | 3 | whole-exam-total ≥60/100 | Start Deutsch 1 Modellsatz | coincide |
| goethe_A2 | 5×4=20 | 5×4=20 | 2 | 3 | whole-exam 45/75 escrito + 15/25 oral | A2 Modellsatz Erwachsene | coincide |
| goethe_B1 | 6/6/7/7/4=30 | 10/5/7/8=30 | 3 | 3 | modular 60 % | B1 Modellsatz + Durchführungsbestimmungen | coincide *(ajustado `modularGrading: true`)* |
| goethe_B2 | 9/6/6/6/3=30 | 10/6/6/8=30 | 2 | 2 | modular 60 % | B2 Modellsatz Erwachsene | coincide |
| goethe_C1 | 8/7/8/7=30 | 6/9/8/7=30 | 2 | 2 | modular 60 % | C1 Modellsatz | coincide |
| goethe_C2 | 10/6/6/8=30 | 15/5/10=30 (3T) | 2 | 2 | modular 60 % | C2 Modellsatz | coincide |

### Notas Goethe

- **A1:** 3 Teile en Lesen y Hören (no 5); cada Teil = 5 ítems.
- **B1 Hören:** corregido helper obsoleto `goethe-b1-modellsatz.mjs` (era 6/6/7/8; oficial 10/5/7/8).
- **C2 Hören:** 3 Teile oficiales (15+5+10), no 4.

---

## Cambridge English (handbooks 2020 / YLE)

| Blueprint | Lesen (R&UoE) | Schreiben | Hören | Sprechen | passRule | Fuente | Estado |
|-----------|---------------|-----------|-------|----------|----------|--------|--------|
| cambridge_A1 | 5/6/6/5/7=29 | 6 (R&W P6) | 5×5=25 | 4×1 | modular 60 % | YLE **Movers** handbook 2018 | **pendiente de fuente** |
| cambridge_A2 | 6/7/5/6/6=30 | 2 | 5×5=25 | 2 | modular 60 % | A2 Key handbook 2020 | coincide |
| cambridge_B1 | 5/5/5/5/6/6=32 | 2 | 7/6/6/6=25 | 4 | modular 60 % | B1 Preliminary handbook 2020 | coincide |
| cambridge_B2 | 8/8/8/6/6/6/10=52 | 2 | 8/10/5/7=30 | 4 | modular 60 % | B2 First handbook 2020 | coincide |
| cambridge_C1 | 8/8/8/6/6/4/6/10=56 | 2 | 6/8/6/10=30 | 4 | modular 60 % | C1 Advanced handbook 2020 | coincide |
| cambridge_C2 | 8/8/8/6/6/7/10=53 | 2 | 6/9/5/10=30 | 4 | modular 60 % | C2 Proficiency handbook | coincide |

### Notas Cambridge

- **A1:** No existe examen main-suite A1; el blueprint usa **Movers (YLE)** como proxy. `[VERIFICAR]` hasta confirmar si se mantiene este mapeo o se sustituye por otro certificado.
- R&W oficial se reparte en `lesen` (partes de lectura) + `schreiben` (tareas de escritura).
- B2+ fusiona Reading + Use of English en módulo `lesen` (sin `use_of_english`).

---

## DELE (examenes.cervantes.es)

| Blueprint | Lesen | Hören | Schreiben | Sprechen | passRule | Fuente | Estado |
|-----------|-------|-------|-----------|----------|----------|--------|--------|
| dele_A1 | 5/6/6/8=25 | 5/5/8/7=25 | 2 | 3 | dele-groups ≥30/50 ×2 | modelo A1 v2020 | coincide |
| dele_A2 | 5/8/6/6=25 | 6/6/6/7=25 | 2 | 3 | dele-groups | modelo A2 v2020 | coincide |
| dele_B1 | 6×5=30 | 6×5=30 | 2 | 4 | dele-groups | guía B1 | coincide |
| dele_B2 | 6/10/6/14=36 | 6×5=30 | 2 | 3 | dele-groups | examenes.cervantes.es B2 | coincide |
| dele_C1 | 6/6/6/8/14=40 | 6/8/6/10=30 | 2 | 3 | dele-groups | examenes.cervantes.es C1 | coincide |
| dele_C2 | 12/6/8=26 | 5/7/6/8=26 | 3 | 3 | dele-c2-three-tests ≥20/25 | modelo C2 2024 | coincide |

### Notas DELE

- **C2:** Prueba 1 oficial combina uso de la lengua + lectura + auditiva; en el blueprint se reparte en `lesen` (tareas 1–3) y `horen` (tareas 4–7).
- Aprobación estándar (A1–C1): Grupo 1 (lectura+escritura) y Grupo 2 (auditiva+oral) ≥ 30/50 cada uno.

---

## Resumen por blueprint

| Blueprint | Estado |
|-----------|--------|
| goethe_A1 | coincide con oficial |
| goethe_A2 | coincide con oficial |
| goethe_B1 | ajustado (`modularGrading`) — conteos ya coincidían |
| goethe_B2 | coincide con oficial |
| goethe_C1 | coincide con oficial |
| goethe_C2 | coincide con oficial |
| cambridge_A1 | pendiente de fuente (proxy Movers) |
| cambridge_A2 | coincide con oficial |
| cambridge_B1 | coincide con oficial |
| cambridge_B2 | coincide con oficial |
| cambridge_C1 | coincide con oficial |
| cambridge_C2 | coincide con oficial |
| dele_A1 | coincide con oficial |
| dele_A2 | coincide con oficial |
| dele_B1 | coincide con oficial |
| dele_B2 | coincide con oficial |
| dele_C1 | coincide con oficial |
| dele_C2 | coincide con oficial |

---

## TODOs abiertos

1. **cambridge_A1** — Decidir certificado objetivo (Movers vs otro) y re-verificar conteos con handbook definitivo.
2. Ejecutar `node scripts/test-blueprints-v3-all.mjs` en CI (opcional; hoy cubierto por los 18 tests individuales en `test:engine`).

---

## Comandos

```bash
node scripts/test-blueprints-v3-all.mjs
node scripts/test-goethe-b1-modellsatz.mjs   # ejemplo individual
npm run test:engine                           # suite completa
```
