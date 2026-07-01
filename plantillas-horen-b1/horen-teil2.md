# Plantilla de generación — Hören B1 · Teil 2

Pega TODO este texto en Gemini/ChatGPT. Devuelve **SOLO JSON**.
Formato oficial: **1 monólogo + 5 MCQ**, escucha **1×**.

---

Eres examinador del Goethe-Zertifikat B1. Genera **UNA** parte de **Hören Teil 2**
(Vortrag, Einführung, Referat), alemán **hablado**, nivel B1.

## Reglas estrictas
- **1 passage** (monólogo de una persona), **240–300 palabras** (mín. 220, máx. 320).
- **5 preguntas** `type: "multiple_choice"` con exactamente **3 opciones** a)/b)/c).
- `correct` / `correctAnswer`: solo `"a"`, `"b"` o `"c"`.
- **`options` = array de STRINGS**, nunca objetos:
  `"options": ["a) Texto…", "b) Texto…", "c) Texto…"]`
- **PROHIBIDO:** `{ "key": "a", "text": "…" }` — el esquema rechaza objetos.
- Todas las preguntas con el mismo `passageId`.

## ESTILO
- Una persona habla de forma sostenida (Universität, Verein, Beruf, Umwelt, Gesundheit…).
- Marcadores orales naturales: «Heute möchte ich …», «Zum Schluss …», «Das bedeutet …»
- **PROHIBIDO:** diálogo con Person A/B (eso es Teil 3).

## REGLAS DE CALIDAD
1. **Varía** la letra correcta (no 5× `"b"`).
2. Distractores plausibles pero incorrectos si se escuchó con atención.
3. Mezcla: ~3 preguntas explícitas + ~2 inferencia/paráfrasis.
4. Anti word-matching: la pregunta no repite 4+ palabras seguidas del monólogo.

## CAMPO AUDIO (obligatorio para TTS)
Incluye en el passage un campo `"audio"` con los turnos del monólogo:
```json
"audio": [
  { "speaker": "Sprecher", "voiceId": "de-DE-ConradNeural", "text": "Guten Tag, heute möchte ich über…" }
]
```
- T2 tiene **1 solo hablante** — una única voz (`de-DE-ConradNeural` para hombre, `de-DE-KatjaNeural` para mujer).
- El `text` puede ser el pasaje completo o dividido en bloques de ≤500 chars.
- No incluye el prefijo `Sprecher:`.

## PALABRAS OBJETIVO
<<< vortrag, erfahrung, organisation, stadt, familie, kurs, beratung, transport, anmeldung, gebühr >>>

## ANTI WORD-MATCHING — OBLIGATORIO
El monólogo contiene: *«…die Erfahrung zeigt, dass regelmäßige Pausen die Produktivität steigern…»*

❌ **MALO (rechazado):** «Laut dem Sprecher zeigt die Erfahrung, dass Pausen die Produktivität steigern?»
→ Copia «zeigt» «Erfahrung» «Pausen» «Produktivität» del monólogo.

✅ **BUENO:** «Was empfiehlt der Referent für effizienteres Arbeiten?»
→ La pregunta es nueva, las opciones parafrasean la idea sin copiar.

**Proceso obligatorio:** tras escribir el monólogo, lista sus 20 palabras clave. Las preguntas NO deben contener 4+ palabras consecutivas del monólogo. Para el enunciado usa: «Was sagt der Sprecher über…?», «Welchen Rat gibt der Referent bezüglich…?», «Was erfährt man über…?»

## AUTORREVISIÓN
- ¿1 passage 240–300 palabras contadas?
- ¿Passage incluye campo `"audio"` con voiceId?
- ¿5 preguntas con campo `question` (enunciado), opciones `a)/b)/c)` como strings?
- ¿`correct` solo letra: "a", "b" o "c"? ¿`type: "multiple_choice"` en las 5?
- ¿Ninguna pregunta copia 4+ palabras seguidas del monólogo?
- ¿module:"horen", teil:2? ¿Solo JSON?

## Formato de salida
- Passage: `gen-p-h2-XXXX`
- Questions: `gen-q-h2-XXXX-q1` … `q5`
- `explanation` en alemán · `skills:["listening"]`

## EJEMPLO ESTRUCTURAL (imita format, NO el contenido)
```json
{
  "passages": [{
    "id": "gen-p-h2-5a3f",
    "module": "horen", "teil": 2, "lang": "de", "level": "B1",
    "title": "Vortrag über nachhaltiges Reisen",
    "text": "Guten Tag, meine Damen und Herren. Heute möchte ich Ihnen etwas über nachhaltiges Reisen erzählen. Immer mehr Menschen entscheiden sich dafür, umweltfreundliche Transportmittel zu nutzen. Das bedeutet zum Beispiel, mit dem Zug statt mit dem Flugzeug zu fahren. Natürlich kostet das manchmal mehr Zeit, aber viele Reisende berichten, dass sie die Fahrt selbst als Erlebnis schätzen. Zum Schluss möchte ich betonen: Kleine Änderungen im Reiseverhalten können große Wirkung haben."
  }],
  "questions": [
    {
      "id": "gen-q-h2-5a3f-q1",
      "module": "horen", "teil": 2, "type": "multiple_choice",
      "question": "Was ist das Hauptthema des Vortrags?",
      "options": ["a) Günstige Urlaubsangebote", "b) Umweltfreundliches Reisen", "c) Neue Zugverbindungen"],
      "correct": "b", "correctAnswer": "b",
      "explanation": "Der Referent erläutert, wie umweltfreundliche Transportmittel wie der Zug das Reiseverhalten verändern können.",
      "passageId": "gen-p-h2-5a3f", "lang": "de", "level": "B1", "skills": ["listening"]
    }
  ]
}
```

Genera **UN monólogo nuevo** (240–300 palabras) + **5 preguntas completas**, integrando PALABRAS OBJETIVO. Devuelve solo JSON.
