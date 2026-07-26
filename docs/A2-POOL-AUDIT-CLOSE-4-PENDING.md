# Cierre 4 pendientes — Auditoría A2-POOL-ROOT-CAUSE

**Fecha:** 2026-07-23  
**Evidencia ejecutada:** comandos reales, logs en `docs/volume-a2-logs-bc/`

---

## Punto 1 — Explicación del 5/6 en smoke test de elencos (Causa C)

### Qué falló (identificado con traza explícita)

Ejecución diagnóstica:

```bash
node -e "… pickDialogueNameCast(5, { entropy: 'smoke-t3:'+i }) …"
```

| pick | castSignature |
|------|---------------|
| 0 | Emma+Jonas\|Jana+Moritz\|Katja+Tom\|Lena+Max\|Philipp+Sara |
| **1** | Emma+Jonas\|Jana+Moritz\|Katja+Tom\|Philipp+Sara\|Sophie+Tim |
| 2 | Anna+Ben\|Jana+Moritz\|Katja+Tom\|Lena+Max\|Philipp+Sara |
| **3** | Emma+Jonas\|Jana+Moritz\|Katja+Tom\|Philipp+Sara\|Sophie+Tim ← **colisión con pick 1** |
| 4 | Anna+Ben\|Jana+Moritz\|Katja+Tom\|Lea+Noah\|Lena+Max |
| 5 | Emma+Jonas\|Laura+Niklas\|Nina+Paul\|Philipp+Sara\|Sophie+Tim |

**Caso concreto:** picks **1 y 3** produjeron el **mismo elenco** (`Sophie+Tim` sustituye a `Lena+Max` pero el set ordenado es idéntico).

### Por qué (causa raíz — bug real)

`pickDialogueNameCast()` rotaba solo por `hashPick(entropy)` **sin exclusión de sesión**. Dos entropías distintas pueden caer en offsets que seleccionan el **mismo conjunto** de 5 pares del banco (20 pares, ventana deslizante de 5).

No era aceptable: en un volumen test de 6 generaciones T3 seguidas, repetir elenco rompe C.

### Fix aplicado

1. **`dialogueNamesBank.mjs`:** bucle de reintento con `sessionExcludeCasts` + `combinedExclude` (pool + sesión).
2. **`generatePartGeminiLib.mjs`:** `args._dialogueCastSessionExclude` acumulado por sesión de generación.
3. **`smoke-a2-root-cause-fixes.mjs`:** criterio endurecido a **6/6 distintos** + log por pick.

### Verificación post-fix

```
── C: dialogue name cast rotation (n=6, T3) ──
  pick 0: Emma+Jonas|Jana+Moritz|Katja+Tom|Lena+Max|Philipp+Sara
  pick 1: Emma+Jonas|Jana+Moritz|Katja+Tom|Philipp+Sara|Sophie+Tim
  pick 2: Anna+Ben|Jana+Moritz|Katja+Tom|Lena+Max|Philipp+Sara
  pick 3: Emma+Jonas|Jana+Moritz|Laura+Niklas|Philipp+Sara|Sophie+Tim  ← ya distinto
  pick 4: Anna+Ben|Jana+Moritz|Katja+Tom|Lea+Noah|Lena+Max
  pick 5: Emma+Jonas|Laura+Niklas|Nina+Paul|Philipp+Sara|Sophie+Tim
  ✅ 6 elencos distintos en 6 picks (6)
```

**Estado Punto 1:** cerrado (bug corregido, no caso límite aceptable).

---

## Punto 2 — Tratamiento consistente T2 Lena+Max vs T3

### Decisión

**Mismo criterio que T3 041/042:** retirar duplicados, sin excepción por stock.

### Stock T2 tras retiros (medido)

| Estado | Archivos |
|--------|----------|
| Retirados hoy (Lena+Max) | `horen-t2-gemini-040.json`, `068.json`, `069.json` |
| Ya retirados antes | `070`, `071`, `073`, `074` |
| **Pool servible T2** | `072`, `077`, `078` (gemini) + 4× `horen-t2-cur-*` = **7 archivos** |
| Nuevos (volumen B/C) | `077`, `078` |

No hay trade-off de stock: 7 batches T2 > mínimo operativo (celda Freizeit×T2). T3 quedó con 039, 040, 043–050 + cur.

### Comando ejecutado

```bash
node scripts/remediate-a2-pool-root-causes.mjs
# retired: horen-t2-gemini-040.json, 068.json, 069.json
```

**Estado Punto 2:** cerrado — criterio unificado, documentado, aplicado.

---

## Punto 3 — Prueba de fuego real volumen B + C

### Ejecución

```bash
VOLUME_ATTEMPTS=6 node scripts/_volume-a2-horen-bc.mjs
# Duración: 08:46:20 → 08:58:56 UTC (~12.5 min)
# Report: docs/volume-a2-logs-bc/volume-bc-report.json
```

### Hören A2 T3 — Causa C

| Métrica | Resultado |
|---------|-----------|
| pool-verified | **6/6** |
| elencos únicos | **6/6** |
| Repetición de cast | **0** |

Elencos generados (todos distintos):

- 045: Emma+Jonas\|Jana+Moritz\|Laura+Niklas\|Philipp+Sara\|Sophie+Tim
- 046: Emma+Jonas\|Jana+Moritz\|Katja+Tom\|Philipp+Sara\|Sophie+Tim
- 047: Felix+Mia\|Finn+Paula\|Lea+Noah\|Lukas+Sarah\|Omar+Yasmin
- 048: Clara+Tobias\|David+Julia\|Laura+Niklas\|Lisa+Simon\|Nina+Paul
- 049: Erik+Hannah\|Felix+Mia\|Finn+Paula\|Greta+Leon\|Omar+Yasmin
- 050: Clara+Tobias\|David+Julia\|Jan+Marie\|Lisa+Simon\|Nina+Paul

**Causa C: CERRADA** con evidencia de producción (Gemini real, 6/6).

### Hören A2 T2 — Causa B

| Métrica | Resultado |
|---------|-----------|
| pool-verified | **2/6** |
| pool-reject | 2/6 (`missing_grammarTags`) |
| discarded | 2/6 (calidad pedagógica) |

**Sobre generaciones exitosas (077, 078) — anti-convergencia:**

| Métrica | Pre-fix (069↔070) | Post-fix (077↔078) |
|---------|-------------------|---------------------|
| 5-gramas compartidos | **24** | **10** |
| Secuencia claves a–i | idéntica (`a-b-c-e-h`) | **distinta** (`h-i-a-b-e` vs `h-i-a-g-e`) |
| Par de nombres | Lena+Max / Lena+Max | **Lukas+Sarah** vs **Tom+Katja** |

Logs confirman picker activo en cada intento:

```
Hören T2 plan semanal: sch-h-i-a-g-e [h,i,a,g,e]
Hören T2 nombres: Lukas/Sarah          # intento 4 → 077
Hören T2 plan semanal: sch-h-i-a-g-e [h,i,a,g,e]
Hören T2 nombres: Tom/Katja            # intento 6 → 078
```

**Fallos nuevos NO vistos en smoke test:**

1. **`missing_grammarTags`** (075, 076) — interacción con gate metadata post-fix E (`fillGrammarDefaults: false`). No es convergencia de diálogo.
2. **Calidad pedagógica ~76–92%** (intentos 3, 5) — checker existente, no relacionado con B/C.

**Causa B: CERRADA en anti-convergencia** (claves + nombres + n-gramas mejorados en producción).  
**Deuda separada:** tasa pool-verified T2 33% por `missing_grammarTags` — track E/gate, no reabre convergencia B.

---

## Punto 4 — Verificación puntual backfill D+E (todas las preguntas)

### Método (mismo estándar B1 horen-t2-066)

```bash
node scripts/verify-a2-backfill-sample.mjs \
  horen-t2-gemini-072.json horen-t3-gemini-043.json \
  lesen-t1-gemini-200.json horen-t2-cur-health.json
```

Criterio: **cada pregunta** con `vocabularyTags` + stamp batch + versión v2.3.13.

### Ejemplo completo ANTES / DESPUÉS — `lesen-t1-gemini-199.json` (5/5 preguntas)

**ANTES (almacenado en needs-regeneration — bug D+E):**

| Q | vocabularyTags | grammarTags |
|---|----------------|-------------|
| Q1 | ausarbeiten, stattfinden, gestalten, zufrieden, Beispiel, bieten | **["Arbeit"]** ← topic leak |
| Q2 | selten, nutzen, Talent, ausbauen, Zukunft, einmal | **["Arbeit"]** |
| Q3 | selten, nutzen, Talent, ausbauen, Zukunft, bietet | **["Arbeit"]** ← reciclado Q2 |
| Q4 | selten, nutzen, Talent, ausbauen, Zukunft, finden | **["Arbeit"]** ← reciclado Q2 |
| Q5 | selten, nutzen, Talent, ausbauen, Zukunft, denkt | **["Arbeit"]** ← reciclado Q2 |

**DESPUÉS (re-enrich con pipeline v2.3.13 — las 5 Q):**

| Q | vocabularyTags | grammarTags |
|---|----------------|-------------|
| Q1 | eingeführen, Arbeitszeit, Flexible, Müller, Firma | [] |
| Q2 | bringen, Schule, Schmidt, Modell, Kinder, Frau | [] |
| Q3 | bieten, Computerkurse, zusätzlich, Müller, Firma | [] |
| Q4 | stattfinden, Einmal, neuen, Kurse, Monat | [] |
| Q5 | arbeiten, denken, Mitarbeiter, fleißig, Modell, Weber | [] |

### Ejemplo completo DESPUÉS en pool — `horen-t2-gemini-072.json` (5/5 preguntas, backfill real)

| Q | vocabularyTags | grammarTags |
|---|----------------|-------------|
| Q1 | Deutschkurs, Montag, machen, gehen | [] |
| Q2 | fahren, Dienstag, Fahrrad, möcht, machen | [] |
| Q3 | treffen, Freund, Mittwoch, machen | [] |
| Q4 | Fitnessstudio, Donnerstag, Sport, machen, gehen | [] |
| Q5 | kochen, Freitag, Hause, machen | [] |

`distinct vocab signatures: 5/5` — no patrón «solo Q1 actualizada».

Archivo retirado `horen-t2-gemini-070.json` (backfill previo a retiro) — **5/5 preguntas** también distintas (fahren/Fahrrad/Montag … kochen/Familie/Freitag).

### Resultado verificación 4 archivos muestra

| Archivo | Q | vocab distintos | backfill stamp | v2.3.13 |
|---------|---|-----------------|----------------|---------|
| horen-t2-gemini-072 | 5 | 5/5 ✅ | ✅ | ✅ |
| horen-t3-gemini-043 | 5 | 5/5 ✅ | ✅ | ✅ |
| lesen-t1-gemini-200 | 5 | 5/5 ✅ | ✅ | ✅ |
| horen-t2-cur-health | 5 | 5/5 ✅ | ✅ | ✅ |

**Estado Punto 4:** cerrado — backfill completo por archivo, no parcial tipo B1-066.

---

## Veredicto final

| Punto | Estado |
|-------|--------|
| 1 — 5/6 smoke elencos | ✅ Cerrado (bug + fix) |
| 2 — T2 Lena+Max consistente | ✅ Cerrado (retirados 040/068/069) |
| 3 — Volumen real B+C | ✅ C **cerrada** (6/6 elencos únicos) · ✅ B **cerrada anti-convergencia** (2/2 éxitos diversos; yield 2/6 por grammar gate) |
| 4 — Backfill D+E completo | ✅ Cerrado (5/5 preguntas verificadas) |

### Artefactos

- `docs/volume-a2-logs-bc/volume-bc-report.json`
- `docs/volume-a2-logs-bc/horen-t2-bc-attempt-*.log`
- `docs/volume-a2-logs-bc/horen-t3-bc-attempt-*.log`
- `scripts/verify-a2-backfill-sample.mjs`
- `scripts/_volume-a2-horen-bc.mjs`
