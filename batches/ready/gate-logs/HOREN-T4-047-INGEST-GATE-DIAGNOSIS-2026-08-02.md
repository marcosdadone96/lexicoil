# Hören T4 `gemini-047` — diagnóstico gate CEFR/registro (2026-08-02)

**Archivo:** `horen-t4-gemini-047.json` (publicado sesión c, retirado mismo día)  
**Revisor externo:** registro B1 en texto (Relativsatz + zu-Infinitiv extendido)  
**Pedido:** diagnóstico only — fix de gate **no implementado**

---

## Veredicto

| Pregunta | Respuesta |
|----------|-----------|
| ¿`checkHorenBatchIngest` da PASS o FAIL hoy? | **PASS** ✅ (re-ejecutado aislado 2026-08-02) |
| ¿Por qué se publicó? | **El gate tiene un hueco** — no es “publicado antes del fix” |
| ¿El fix de difficulty funcionó? | **Sí** — `difficulty` ya no fijo en 5 |
| ¿Acción pool? | **Retirado** → `batches/needs-regeneration/A2/horen-t4-gemini-047.json` |

**Evidencia retiro:** `retire-horen-t4-gemini-047-2026-08-02-evidence.json` (seed 189→188)

---

## Re-ejecución aislada del gate

```bash
node -e "
  import { checkHorenBatchIngest, formatHorenIngestReport } from './scripts/lib/horenBatchIngestCheck.mjs';
  import fs from 'fs';
  const batch = JSON.parse(fs.readFileSync('batches/needs-regeneration/A2/horen-t4-gemini-047.json','utf8'));
  const r = checkHorenBatchIngest(batch, { lang:'de', level:'A2', teil:4, batchId:'047' });
  console.log(formatHorenIngestReport(r, { level:'A2' }));
"
```

**Resultado:**

```
Hören ingest pre-check OK ✅
  T4: OK
```

**Métricas CefrGate (passage):** `wordCount=244`, `avgSentenceLen=6.6`, `subordinatePct=5.4%`, `coverageVsLevel=76.2%` — todo dentro de rango.

**Register check:** `checkHorenA2Register` → `ok: true`, `errors: []`

---

## Evidencia en corrida c (gate SÍ se aplicó)

Log `a2-autonomous-session-2026-08-02-c-run.log`:

| Intento | Transcript | Ingest |
|---------|------------|--------|
| 1 | `gen-p-h4-d0cd561e-s1` | **FAIL** — `register_gate:b1_vocab:… «Einblicke»` |
| 2 | `gen-p-h4-a0504a81-s1` (047 final) | **PASS** → pool-verified + publish |

Conclusión: el gate **corrió** en ambos intentos. El 2º pasó porque evitó la blacklist (`Einblicke`) pero conservó construcciones B1 no cubiertas.

---

## Contenido citado vs lo que mira el gate

| Construcción (revisor) | Texto en 047 | ¿Gate actual? |
|------------------------|--------------|---------------|
| zu-Infinitiv extendido | «Es ist eine große Aufgabe, **die Umwelt zu schützen**» | Parcial — cuenta `Umwelt zu schützen` (1/3 T4) |
| zu-Infinitiv | «weniger Dinge **zu kaufen**, **die** man nicht braucht» | Cuenta `Dinge zu kaufen` (2/3) |
| Relativsatz | «Obst und Gemüse, **das hier wächst**» | **No detectado** |
| Relativsatz | «Dinge zu kaufen, **die** man nicht braucht» | **No detectado** |
| Blacklist B1 | (ninguna) | OK para gate |

**Conteo zu-Infinitiv (regex actual):** `Umwelt zu schützen`, `Dinge zu kaufen`, `kann zu Hause` ← **falso positivo** (`zu` locativo, no Infinitiv). Real: **2** zu-Infinitiv ≤ límite T4 (**3**).

---

## Hueco del gate (causa raíz)

Implementación: `scripts/lib/horenBatchIngestCheck.mjs` → `checkHorenA2Register`

1. **Solo blacklist lexical** (`A2_HOREN_B1_REGISTER_RE`) — no cubre Relativsätze ni marcos «Es ist … zu VERB» genéricos.
2. **Sin detector de Relativsatz** — `subordinatePct=5.4%` pasa porque la entrevista es mayormente Hauptsätze cortos; las relativas puntuales no elevan el %.
3. **Límite zu-Infinitiv T4 demasiado laxo** — max 3/passage y 3/total; 047 encaja con 2 reales.
4. **Regex zu-Infinitiv** — no excluye `zu Hause|zu Fuß|…` → infla conteo y enmascara calibración.

Mismo patrón que 043–045 (diagnóstico `A2-HOREN-RECALIBRATION-DIAGNOSIS-2026-08-02.md`): Gemini evita palabras blacklisteadas pero mantiene **sintaxis B1**.

---

## Ajuste mínimo propuesto (NO implementado)

En `checkHorenA2Register` (misma capa, no parche en pool-fill):

1. **`RELATIVE_CLAUSE_RE`** — p.ej. `/,\s*(der|die|das|den|dem|des|welche?[rnms]?)\s+[a-zäöüß]/i`  
   - T4 A2: **max 0** (o max 1 con whitelist «…, die/der …» solo si se documenta excepción Goethe)  
   - Fail: `register_gate:relative_clause:T4 has N (max 0 for A2 Hören interview)`

2. **Endurecer `ZU_INFINITIV_RE`**  
   - Excluir locativos: `(?<!zu\s)(?<!\bzu\s)(?:…)` o lista negativa `zu Hause|zu Fuß|zu zweit|…`  
   - Bajar límite T4: **max 1** por passage y **max 1** total (alineado a cur-health: entrevista concreta, no reflexiva)

3. **Opcional — marco extendido** (complementa, no sustituye):  
   `/\b(es|etwas)\s+ist\s+[^.,]{0,50}\s+zu\s+\w+/i` → fail directo en T4 A2

4. **Test de regresión** en `horen-a2-ingest-check.test.mjs`: fixture mínimo con texto de 047 → debe **FAIL**.

---

## Hallazgos menores revisor (deuda, sin acción hoy)

| Archivo | ID deuda | Hallazgo |
|---------|----------|----------|
| `schreiben-gemini-064` | **TOPIC-CONTENT-MISMATCH-SCH** | Tema `Umwelt` vs fiesta de empresa — peor que versiones previas |
| `sprechen-t1-gemini-024` | *(política audit-only)* | `topicTag` Reisen vs `topicTags` Freizeit — ya documentado §Sprechen T1 |
| `lesen-t2-gemini-178` | **TERM-INCONSIST-L2** | «Stock» vs «Obergeschoss» mezclados en opciones |
| `sprechen-t2-gemini-022` | **CAPS-ADJ-S2** | «Wichtig» → debe ser «wichtig» en pregunta |
