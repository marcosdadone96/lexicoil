# Plantilla de generación — Hören B1 · Teil 1

Pega TODO este texto en Gemini/ChatGPT. Devuelve **SOLO JSON**.
Formato oficial Goethe: **5 audios cortos × 2 preguntas = 10 items**.

---

Eres examinador del Goethe-Zertifikat B1. Genera **UNA** parte de **Hören Teil 1**
(anuncios, Durchsagen, Telefonate, Kurzgespräche), alemán **hablado**, nivel B1.

## Reglas estrictas
- **5 segmentos** de audio (`passages` s1…s5), cada uno **50–85 palabras** (mín. 40, máx. 90).
- **10 preguntas** exactas — por segmento:
  1. `type: "richtig_falsch"` · `options: []` · `correct`: `"Richtig"` o `"Falsch"`
  2. `type: "multiple_choice"` · 3 opciones `a) …`, `b) …`, `c) …` · `correct`: `"a"`/`"b"`/`"c"`
- Escucha oficial: **2×** (implícito; no escribas meta-texto sobre ello).
- `segmentLabel`: `"Aufnahme 1"` … `"Aufnahme 5"` en cada pregunta.
- Cada pregunta con `passageId` del segmento correcto.

## ESTILO (obligatorio — suena hablado, no redacción)
- Anuncios: «Guten Tag, …», «Achtung, …», precios, horarios, lugares concretos.
- Telefonat: turnos cortos, preguntas directas.
- **PROHIBIDO:** tono de ensayo, «Im folgenden Text…», listas numeradas formales.

## REGLAS DE CALIDAD (rechazo si fallas)
1. Segmentos **temáticamente distintos** (no 5 veces el mismo tipo de anuncio).
2. RF: mezcla ~5 Richtig / ~5 Falsch; al menos **2 Falsch** con trampa (nur/alle/immer/nie).
3. MCQ: respuesta inferible del audio; **varía** correct entre a, b, c (no siempre b).
4. Anti word-matching: ver sección específica abajo — **CAUSA DE RECHAZO AUTOMÁTICO**.
5. Pregunta MCQ ≠ misma formulación que la afirmación RF del mismo segmento.

## ANTI WORD-MATCHING — OBLIGATORIO (causa de rechazo automático)
Las preguntas (RF y MCQ) y las opciones correctas **no deben copiar ≥4 palabras seguidas** del transcript. Parafrasea siempre.

**Transcript:** *«Achtung, die Beleuchtung im Treppenhaus ist defekt und wird morgen repariert.»*

❌ **MALO (rechazado):** opción correcta `"Die Beleuchtung im Treppenhaus ist defekt."` → copia 4 palabras del audio.
✅ **BUENO:** `"Das Licht im Hausflur funktioniert zurzeit nicht."` → misma información, reformulada.

❌ **MALO (rechazado):** pregunta RF `"Die Reparatur findet für die nächste Woche statt."` cuando el audio dice `"für die nächste Woche"`.
✅ **BUENO:** `"Die Instandsetzung ist für morgen geplant."` → paráfrasis sin copiar.

**Proceso obligatorio antes de finalizar:** lista las 5–8 palabras clave de cada transcript. Verifica que ninguna pregunta ni opción correcta contiene ≥4 de esas palabras en secuencia.

## PALABRAS OBJETIVO
<<< termin, kurs, stadt, familie, anmeldung, transport, gebühr, organisation, freizeit, beratung >>>

## AUTORREVISIÓN
- ¿5 passages + 10 questions con segmentLabel?
- ¿Orden sN-q1=RF, sN-q2=MCQ en los 5 segmentos?
- ¿Cada transcript 50–85 palabras contadas?
- ¿Ninguna pregunta ni opción correcta copia ≥4 palabras seguidas del transcript? (verificar segmento por segmento)
- ¿module:"horen", teil:1, lang:"de", level:"B1"?
- ¿Solo JSON?

## Formato de salida
Devuelve SOLO `{ "passages": [...], "questions": [...] }`.
- Passage IDs: `gen-p-h1-XXXX-s1` … `s5`
- Question IDs: `gen-q-h1-XXXX-s1-q1`, `s1-q2`, … `s5-q2`
- Campos: `passageVocab` (3–5 lemas), `explanation` en alemán, `skills:["listening"]`

## EJEMPLO ESTRUCTURAL (1 segmento — imita formato, contenido nuevo)

```json
{
  "passages": [
    {
      "id": "gen-p-h1-8842-s1",
      "module": "horen",
      "teil": 1,
      "title": "Ansage Bahnhof",
      "text": "Achtung, liebe Fahrgäste! Der Regionalzug nach München fährt heute von Gleis 4 ab, nicht von Gleis 7. Abfahrt ist um 14:32 Uhr. Bitte achten Sie auf Ihre Fahrkarte. Der nächste Zug nach Nürnberg verlässt den Bahnhof in zwanzig Minuten von Gleis 2.",
      "passageVocab": ["fahrgast", "gleis", "abfahrt", "fahrkarte"]
    }
  ],
  "questions": [
    {
      "id": "gen-q-h1-8842-s1-q1",
      "module": "horen",
      "teil": 1,
      "type": "richtig_falsch",
      "question": "Der Zug nach München fährt von Gleis 7 ab.",
      "options": [],
      "correct": "Falsch",
      "correctAnswer": "Falsch",
      "explanation": "Die Durchsage korrigiert das Gleis: Der Zug fährt von Gleis 4 ab, nicht von Gleis 7.",
      "segmentLabel": "Aufnahme 1",
      "passageId": "gen-p-h1-8842-s1",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h1-8842-s1-q2",
      "module": "horen",
      "teil": 1,
      "type": "multiple_choice",
      "question": "Wann fährt der Zug nach München ab?",
      "options": ["a) Um 14:15 Uhr", "b) Um 14:32 Uhr", "c) Um 15:00 Uhr"],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Die Ansage nennt als Abfahrtszeit ausdrücklich 14:32 Uhr — nicht 14:15 oder 15:00.",
      "segmentLabel": "Aufnahme 1",
      "passageId": "gen-p-h1-8842-s1",
      "lang": "de",
      "level": "B1"
    }
  ]
}
```

Genera **5 segmentos completos** (s1–s5) y **10 preguntas**, integrando PALABRAS OBJETIVO. Devuelve solo el JSON.
