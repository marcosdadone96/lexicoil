# Cierre calibración A2 + prueba de fuego — evidencia ejecutada

**Fecha:** 2026-07-22  
**Alcance:** PASO 1–4 en orden estricto. Sin generación masiva, sin B2/C1, sin blacklist de passages nueva.

---

## PASO 1 — P7: longitud Lesen en ingest (gate crítico)

### Cambio aplicado

`CefrGate.js` cablea `wordsPerPassage` del blueprint por Teil (mismo patrón que `listeningBoundsFromPart` para Hören):

- `readingBoundsFromPart(bpPart)` lee `wordsPerPassage.min/max`
- `extractReadingPassageChecks()` pasa `lengthBounds` / `lengthMinExempt` cuando el blueprint los define
- `validateExam()` aplica esos bounds en la rama Lesen

Blueprint T1 A2: **120–200** (`library/blueprints/goethe_A2.json`).

### Verificación — casos T1 (output literal)

Comando:

```powershell
node -e "
const fs = require('fs');
const CefrGate = require('./js/engine/validation/CefrGate.js');
const bp = JSON.parse(fs.readFileSync('library/blueprints/goethe_A2.json','utf8'));
function buildText(targetWords) {
  const sentence = 'Ich gehe heute in die Stadt und kaufe Brot und Milch ein.';
  const wordsPerSent = sentence.split(/\s+/).length;
  const sents = Math.ceil(targetWords / wordsPerSent);
  let text = Array(sents).fill(sentence).join(' ');
  return text.split(/\s+/).slice(0, targetWords).join(' ');
}
function run(label, wc) {
  const text = buildText(wc);
  const exam = { level: 'A2', lang: 'de', lesenParts: [{ teil: 1, text }] };
  const r = CefrGate.validateExam(exam, { level: 'A2', lang: 'de', blueprint: bp });
  console.log('=== ' + label + ' (' + wc + ' words) ===');
  console.log('withinRange:', r.withinRange);
  console.log('reasons:', r.reasons);
  console.log('metrics.wordCount:', r.metrics.wordCount);
  console.log('metrics.lengthBounds:', JSON.stringify(r.metrics.lengthBounds));
}
run('T1 80 words — expect FAIL', 80);
run('T1 160 words — expect PASS', 160);
"
```

Output:

```
=== T1 80 words — expect FAIL (80 words) ===
withinRange: false
reasons: [ 'length_below_min:wordCount=80,min=120' ]
metrics.wordCount: 80
metrics.lengthBounds: {"min":120,"max":200}
metrics.avgSentenceLen: 11.4
=== T1 160 words — expect PASS (within 120-200) (160 words) ===
withinRange: true
reasons: []
metrics.wordCount: 160
metrics.lengthBounds: {"min":120,"max":200}
metrics.avgSentenceLen: 11.4
```

**Resultado:** 80 palabras → **FALLA** (`length_below_min:wordCount=80,min=120`). Antes pasaba con el rango genérico 60–150 de `knowledge/cefr/A2.json`.  
160 palabras → **PASA** longitud blueprint. Antes fallaba por `max=150` genérico.

### Regresión unitaria

```powershell
node scripts/test-cefr-gate.mjs
```

Output (final):

```
CefrGate tests passed.
```

**PASO 1: CERRADO.**

---

## PASO 2 — Registro B1+ en passages A2 (pool-verified)

### Escaneo

Referencia: `B1_QUESTION_BLACKLIST` en `scripts/blacklist.mjs` (punto de partida; objetivo = **passages**, no preguntas).

Comando:

```powershell
node -e "…" # escaneo recursivo de batches/ready/pool-verified/A2/*.json
```

**Pre-fix:**

```
Files scanned: 41
Files with B1+ hits in passages: 1
Total hits: 1

lesen-t1-cur-education.json: Herausforderungen
```

(Caso real confirmado — mismo texto que en `assembled-exam-a2-verified-e1.json`.)

### Corrección manual

Archivo: `batches/ready/pool-verified/A2/lesen-t1-cur-education.json`

| Antes | Después |
|-------|---------|
| `…freut sich auf die neuen Herausforderungen…` | `…freut sich auf die neuen Aufgaben…` |
| opción `b) Sie ist eine gute Investition` | `b) Sie ist eine gute Idee` |

### Re-escaneo post-fix

```
Post-fix scan: files=41, hits=0
OK — no B1+ blacklist terms in passages
```

**PASO 2: CERRADO** (1 archivo, 1 término; sin nueva blacklist de passages).

---

## PASO 3 — Gate de inferencia inactivo (deuda conocida, no arreglado)

### Hecho

`inferencePct` en `CefrGate.validateInference()` solo incrementa cuando una pregunta tiene `inferenceLevel` o `inference` igual a `'inference'` o `'global'`:

```526:557:js/engine/validation/CefrGate.js
  function validateInference(exam, opts = {}) {
    // ...
    questions.forEach((q) => {
      const il = q.inferenceLevel || q.inference;
      if (il === 'inference' || il === 'global') inferenceCount++;
    });
    const inferencePct = questions.length ? Math.round((inferenceCount / questions.length) * 1000) / 10 : 0;
```

Las partes A2 curadas y generadas **no llevan** ese metadata → `inferencePct` queda **0%** siempre. El gate **no falla** (0% ≤ 20% máx A2), pero **no mide dificultad inferencial real**.

### Clasificación

| Aspecto | Estado |
|---------|--------|
| Umbral A2 `maxInference: 0.2` | Calibrado en código |
| Metadata `inferenceLevel` en preguntas A2 | **Ausente** |
| Gate operativo | **No** — aparenta activo, mide 0% siempre |
| Tratamiento | **Deuda conocida** (igual que `daily_fallback` muerto en vocab-bg: documentado, no confundir con gate calibrado) |

### Acción

Ninguna en esta sesión. Mejora futura: etiquetar preguntas en ingest/generación o desactivar/marcar el gate en reportes A2.

**PASO 3: DOCUMENTADO.**

---

## PASO 4 — Prueba de fuego real (Gemini)

### Cobertura / `--from-coverage`

Blobs remotos vacíos:

```powershell
node scripts/vocab-coverage-report.mjs --level A2 --source blobs
```

```
  list lesen: 0 índices
  list horen: 0 índices
No hay partes que medir. ¿Has sembrado/etiquetado el pool?
```

Reporte local (seed curado, sin blobs):

```
Lemas flojos (en <3 partes): 600 → escritos en data\coverage\weak-de_A2.json
```

**600/600 lemas flojos** — cobertura efectiva **0%** para `--from-coverage`.  
Generaciones ejecutadas con **`--from-bank`** (alternativa temporal explícita; sembrado de blobs = bloqueante aparte).

---

### 4A — Lesen A2 T1 (plantilla cerrada)

```powershell
node scripts/generate-lesen-part-gemini.mjs --teil 1 --level A2 --from-bank --count 1 --max-api-calls 45 --fix-retries 2
```

**Log completo (resumido por intento):**

| # | API | Gates ejercitados | Resultado |
|---|-----|-------------------|-----------|
| 1 | Llamada 1/45 | generación → normalizeNouns → validate-batch → **calidad pedagógica** | FAIL `type_not_allowed:richtig_falsch:allowed=multiple_choice` |
| 2 | Llamada 2/45 | validate-batch | vocab 20% → **topic-mold-circuit** |

Salida final:

```
Partes guardadas (formato + calidad OK): 0
Llamadas API Gemini: 2/45
⛔ Circuit breaker: vocab <40% en 2 intentos consecutivos (ratios: 20%, 20%) y pool casi agotado (0 molde(s) restante(s)) — revisión manual
```

Segundo intento con `--words kino,park,…` (3 llamadas, `--fix-retries 3`): mismo patrón — Gemini devuelve **richtig_falsch** + texto **ich-Blog B1** (`level:"B1"` en passage). Rechazado en `.rejected/lesen-t1-gemini-196-2026-07-22T14-23-30-293Z.json`.

**Gates que sí corrieron:** validate-batch, calidad pedagógica (type_not_allowed), vocab feedback, topic-mold-circuit.  
**No llegó a:** ingest CEFR con P7 (parte no guardada).

---

### 4B — Hören A2 T2 (única plantilla A2 cerrada para formato picture-matching; T1 no tiene `plantillas-horen-a2/horen-teil1.md`)

```powershell
node scripts/generate-part-gemini.mjs --module horen --teil 2 --level A2 --from-bank --count 1 --max-api-calls 45 --fix-retries 3 --keep-failed
```

**4 llamadas API.** Formato OK en todos los intentos. **Calidad Hören T2 FAIL** en los 4:

- Intento 1–2: `preguntas deben cubrir los 5 días…` + enunciados no `Was macht {Name} am {Wochentag}?`
- Intento 3–4: `clave «X» no coincide con diálogo (esperada «Y»…)` — métrica alineación respuesta/diálogo

```
Partes guardadas: 0
Rechazado: batches/generated/.rejected/horen-t2-gemini-067-2026-07-22T14-25-57-812Z.json
```

---

### 4C — Hören A2 T3 (intento adicional — más cercano al éxito)

```powershell
node scripts/generate-part-gemini.mjs --module horen --teil 3 --level A2 --from-bank --count 1 --max-api-calls 45 --fix-retries 3 --keep-failed
```

**7 llamadas API.** Progresión:

1. Intento 1: `options_missing`
2. Intento 2–3: calidad FAIL — sesgo longitud MCQ (umbral **20%/8ch**, correcta +27% y +78%)
3. Reparación quirúrgica mcq_length_bias (LLM): parcial
4. Intento 4: **Calidad Hören T3: OK ✅ (~100%)**
5. **Audit-pass-2 BLOQUEADO:** `[CHK-14] Sustantivo en minúscula: "preiswert"` — falso positivo (adjetivo, no sustantivo)

```
Partes guardadas: 0
Rechazado: batches/generated/.rejected/horen-t3-gemini-038-2026-07-22T14-28-13-051Z.json
```

Segmentos generados (palabras): s1=36, s2=46, s3=34, s4=37, s5=41 — dentro blueprint T3 A2 **15–50** por segmento.

---

### Revisión manual humana (smoke sobre artefactos generados)

| Parte | Longitud | Registro A2 | Veredicto humano |
|-------|----------|-------------|------------------|
| Lesen T1 rechazado | ~180 w (ich-Blog) | **B1** (1ª persona, «Organisation», «Gemeinschaft», «empfehlen») | **No A2** — formato equivocado (R/F, no MCQ a/b/c) |
| Hören T2 rechazado | diálogo ~100 w | A2 plausible en registro | No evaluable — respuestas no alineadas con días/actividades |
| Hören T3 rechazado | 34–46 w/segmento | **A2 genuino** (Zug, Verspätung, Fahrrad, Führerschein, Carsharing; frases cortas) | **Sí A2** en contenido; bloqueado por CHK-14 FP |

Ninguna parte pasó **todos** los gates sin intervención manual.

---

## Veredicto global

| Paso | Estado |
|------|--------|
| **1 — P7 Lesen ingest** | ✅ Cerrado y verificado |
| **2 — B1+ passages** | ✅ 1 caso corregido, pool limpio |
| **3 — Inferencia** | 📋 Deuda documentada |
| **4 — Prueba de fuego** | ❌ **Pipeline A2 automatizado aún no demostrado de punta a punta** |

### Bloqueantes restantes (post calibración)

1. **`--from-coverage`:** blobs A2 sin sembrar (0 índices remotos; 600/600 lemas flojos).
2. **Lesen T1 generación:** Gemini ignora plantilla A2 (MCQ + tercera persona) → calidad `type_not_allowed:richtig_falsch`; circuit breaker vocab/moldes en reintentos.
3. **Hören T2 generación:** calidad alineación días/hablante/claves — 4/4 intentos FAIL.
4. **Hören T3 generación:** casi pasa; audit CHK-14 FP sobre adjetivo `preiswert` impide guardado.
5. **Inferencia:** gate inactivo (PASO 3) — no bloquea, pero no valida dificultad.

### Qué sí quedó probado hoy

- Gate P7 Lesen usa bounds **por Teil** del blueprint (120–200 T1), no el genérico 60–150.
- Pool curado A2 sin términos B1+ de la blacklist en passages.
- Generación real llama a Gemini, ejecuta validate-batch + calidad + (casi) audit; fallos son **métricas concretas**, no éxito declarado.

---

*Generado con evidencia literal de comandos ejecutados 2026-07-22.*
