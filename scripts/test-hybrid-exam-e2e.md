# E2E híbrido Lesen (`test-hybrid-exam-e2e.mjs`)

Orquestación terminal: **decisión** (`planHybridExam`) → pool → live → gate → ingest mock → examen.

Escenario fijo: **5 teils Lesen**, tema **Umwelt**, **10 palabras** de vocabulario.

## Comandos

```powershell
# Modo structural (sin API, sin coste)
node scripts/test-hybrid-exam-e2e.mjs

# Modo live (Gemini / make-t3 real)
$env:ALLOW_LIVE_GEN='1'
node scripts/test-hybrid-exam-e2e.mjs --live
```

Requisitos `--live`: `ALLOW_LIVE_GEN=1` y `GEMINI_API_KEY` o `GOOGLE_API_KEY` en `.env`.

---

## Dos modos, dos resultados distintos (no confundir con regresión)

El mismo script tiene **17 assertions**. Según el modo, el resultado esperado **no es el mismo**:

| | **Structural** (default) | **`--live`** |
|---|---------------------------|--------------|
| API / LLM | No | Sí (Gemini, make-t3 en T3) |
| Teils “live” en plan | Simulados con `simulateLivePart` | Generados de verdad |
| Resultado típico | **~12/17 OK**, **3 fallos** | **17/17 OK** |
| Tiempo | ~5–15 s | ~1–3 min (según API) |

### Structural: por qué falla T3 (y 3 assertions)

En structural, las celdas live **no llaman al generador**. `hybridLesenAssembly` intenta reutilizar una parte del **seed local** que pase gate (`pickGatedSeedPart`).

Con el seed actual (`library/reusable-seed/de_B1.bank.json`):

- Hay **12 partes T3** en seed.
- **0/12 pasan `validatePart`** (gate estructural, `semantic: false`).
- T3 termina con `reason=no_seed_for_simulation`.

Eso arrastra **3 assertions** del E2E:

1. `5 partes Lesen T1–T5` (solo llegan 4 partes)
2. `todas las live (2/3) completadas`
3. `live ingest al pool (2/3 celdas)`

T4/T5 suelen simularse bien porque sí hay seed gated para esos teils. **El plan (pool T1+T2, live T3+T4+T5) sigue siendo correcto**; el fallo es de la capa de ejecución simulada, no de la decisión.

Comprobar el seed T3:

```powershell
node scripts/_t3-seed-scan.mjs
```

### Live: el flujo “real” (17/17)

Con `--live`, T3 usa **make-t3** (no el seed). T4/T5 usan Gemini. El E2E valida el camino que usará producción cuando haya generación live.

Resultado esperado cuando la API responde bien: **17/17 assertions OK** (2 pool + 3 live, examen completo).

Puede haber **flakiness** puntual (gate semantic en T4/T5, timeouts). Eso es variabilidad del generador, no del reparto pool/live.

---

## Qué valida cada capa

| Capa | Módulo | Structural | Live |
|------|--------|------------|------|
| Decisión | `planHybridExam.mjs` / `hybridExamPlan.mjs` | ✅ | ✅ |
| Ejecución | `hybridLesenAssembly.mjs` | Parcial (T3 seed) | ✅ completo |
| UI web | `examGeneration.js` | — | Aún no cableado |

Tests unitarios de decisión (sin E2E):

```powershell
node scripts/test-hybrid-exam-plan.mjs
```

---

## Interpretar resultados sin falsa “regresión”

| Observación | Interpretación |
|-------------|----------------|
| Structural 12/17, T3 `no_seed_for_simulation` | **Esperado** con seed actual; no indica bug del refactor de decisión |
| Live 17/17 | Flujo híbrido completo OK |
| Live &lt; 17/17 | Flakiness generación/gate o API; comparar trace `── LIVE ──` y `── GATE ──` |
| Cambias solo `planHybridExam` / `hybridExamPlan` | Comparar con `planHybridExam.inline.mjs` + `node scripts/test-hybrid-exam-plan.mjs` antes de culpar al E2E |

**Regla práctica:** para validar decisión + ejecución real, usa **`--live`**. Structural sirve para CI rápido y pool, sabiendo que T3 live simulado fallará hasta que haya seed T3 gated o se cambie el fallback de simulación.

---

## Salida útil

Tras cada corrida revisar:

- `── PLAN ──` — pool vs live y vocab repartido
- `── LIVE ──` — `ok`, `reason`, `fallback sim`
- `── GATE ──` — blocking ids si falla
- `Resultado: N passed, M failed` — **17 assertions** en total
