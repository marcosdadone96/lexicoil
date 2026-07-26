# Plantilla de generación — Hören A2 · Teil 2

Pega TODO este texto en Gemini/ChatGPT. Devuelve **SOLO JSON**.
Formato oficial Goethe A2: **1 diálogo (2 personas) + banco compartido a–i + 5 Zuordnungen (días)**, escucha **1×**.

---

Eres examinador del Goethe-Zertifikat **A2**. Genera **UNA** parte de **Hören Teil 2**
(diálogo entre dos personas sobre actividades de la semana), alemán **hablado**, nivel **A2**.

## Reglas estrictas
- **1 passage** (diálogo `Name:` / `Name:`), **80–150 palabras** (mín. 70, máx. 160).
- **Exactamente 2 hablantes** con nombres de pila (z. B. Lena und Max). **PROHIBIDO** monólogo.
- En `passages[0]` incluye **`pictures`**: array de **9** objetos — usa **exactamente** este banco estándar **a–i** (icon + label):
  - a) 🚴 Fahrrad fahren · b) 🇩🇪 Deutschkurs · c) 👫 Freunde treffen · d) 🏋️ Sport machen
  - e) 🏛️ Museum · f) 🎬 Kino · g) 📚 Lernen · h) 🛒 Einkaufen · i) 🍳 Kochen
- **5 preguntas** `type: "matching"` — enunciado **obligatorio**:
  **`Was macht {Name} am {Montag|Dienstag|Mittwoch|Donnerstag|Freitag}?`**
  (nombre del hablante + día; **PROHIBIDO** solo «Montag» sin hablante).
- Cubre **los 5 días laborables** (Montag–Freitag), cada uno con **un** hablante explícito.
- `correct` / `correctAnswer`: letra **a–i** minúscula = actividad que **ese hablante** dice hacer **ese día** en el diálogo.
- **5 letras correctas distintas** (5 de 9 usadas; 4 distractores en el banco).
- **SIN `options` en las preguntas** — el alumno elige del banco `pictures[]`.
- Todas las preguntas con el mismo `passageId`.

## ALINEACIÓN CLAVE ↔ DIÁLOGO (OBLIGATORIO — el checker lo verifica)
Antes de enviar el JSON, para **cada** pregunta:
1. Localiza el turno `Name:` donde **ese hablante** menciona **ese día** (`am Montag`, `Montag`, etc.).
2. La `correct` debe ser la ficha cuya actividad describe **ese turno** (p. ej. «Fitnessstudio» → d Sport; «Museum» → e; «einkaufen» → h).
3. El diálogo debe usar palabras reconocibles: Fahrrad/Rad, Fitnessstudio/Sport, Freunde/Café treffen, Museum, Kino, Bibliothek/lerne, einkaufen, koche/Suppe, Deutschkurs.

**MAL ❌** Pregunta «Was macht Maria am Montag?» pero Maria dice «Termin beim Arzt» y `correct: "b"` con label «Deutschkurs».
**BIEN ✅** Pregunta «Was macht Max am Montag?» y Max dice «fahre mit dem Fahrrad» → `correct: "a"`.

## ESTILO
- Diálogo natural A2: planes semanales, hobby, compras, deporte, museo, curso, etc.
- Turnos alternados: `Lena: …` / `Max: …` (mín. 6 turnos).
- Cada día laborable: **exactamente una** actividad clara por la pregunta correspondiente (no ambigüedad).
- Refleja el **tema pedido** en el diálogo (p. ej. Freizeit → «Freizeit»/«Hobby»/«Wochenende»; Sport → «Sport»/«Fitness»/«Training»).

## REGLAS DE CALIDAD
1. Las 5 respuestas correctas usan **5 letras distintas** de a–i.
2. 4 actividades del banco son distractores (no son respuesta correcta de ningún día).
3. Anti word-matching: la pregunta no copia el diálogo; la explicación parafrasea en alemán.

## CAMPO AUDIO (obligatorio para TTS)
Incluye en el passage un campo `"audio"` con turnos del diálogo:
```json
"audio": [
  { "speaker": "Lena", "voiceId": "de-DE-KatjaNeural", "text": "Hallo Max! …" },
  { "speaker": "Max", "voiceId": "de-DE-ConradNeural", "text": "Hallo Lena! …" }
]
```

## PALABRAS OBJETIVO
<<< einkaufen, sport, freunde, kino, lernen, kochen, museum, fahrrad, termin >>>

## AUTORREVISIÓN
- ¿1 diálogo 80–150 palabras con 2 hablantes?
- ¿`pictures` con exactamente 9 entradas a–i (banco estándar arriba)?
- ¿5 preguntas «Was macht {Name} am {Wochentag}?» sin `options`?
- ¿Cada `correct` coincide con el turno del hablante ese día?
- ¿5 letras correctas distintas?
- ¿module:"horen", teil:2, level:"A2"? ¿Solo JSON?

## Formato de salida
- Passage: `gen-p-h2-XXXX`
- Questions: `gen-q-h2-XXXX-q1` … `q5`
- `explanation` en alemán · `skills:["listening"]`

## EJEMPLO VERIFICADO (100% checker A2 — imita estructura, NO copies contenido)

```json
{
  "passages": [{
    "id": "gen-p-h2-a2ex01",
    "module": "horen", "teil": 2, "lang": "de", "level": "A2",
    "title": "Wochenpläne",
    "text": "Lena: Hallo Max! Hast du Pläne für die Woche?\nMax: Hallo Lena! Ja. Am Montag fahre ich mit dem Fahrrad in den Park.\nLena: Sportlich! Am Dienstag gehe ich ins Fitnessstudio.\nMax: Sehr gut! Am Mittwoch treffe ich Freunde im Café.\nLena: Klingt gemütlich! Am Donnerstag besuche ich ein Museum.\nMax: Interessant! Am Freitag gehe ich einkaufen — ich brauche Geschenke.",
    "pictures": [
      { "key": "a", "icon": "🚴", "label": "Fahrrad fahren" },
      { "key": "b", "icon": "🇩🇪", "label": "Deutschkurs" },
      { "key": "c", "icon": "👫", "label": "Freunde treffen" },
      { "key": "d", "icon": "🏋️", "label": "Sport machen" },
      { "key": "e", "icon": "🏛️", "label": "Museum" },
      { "key": "f", "icon": "🎬", "label": "Kino" },
      { "key": "g", "icon": "📚", "label": "Lernen" },
      { "key": "h", "icon": "🛒", "label": "Einkaufen" },
      { "key": "i", "icon": "🍳", "label": "Kochen" }
    ],
    "audio": [
      { "speaker": "Lena", "voiceId": "de-DE-KatjaNeural", "text": "Hallo Max! Hast du Pläne für die Woche?" },
      { "speaker": "Max", "voiceId": "de-DE-ConradNeural", "text": "Hallo Lena! Ja. Am Montag fahre ich mit dem Fahrrad in den Park." }
    ]
  }],
  "questions": [
    { "id": "gen-q-h2-a2ex01-q1", "module": "horen", "teil": 2, "lang": "de", "level": "A2",
      "type": "matching", "question": "Was macht Max am Montag?", "passageId": "gen-p-h2-a2ex01",
      "correct": "a", "correctAnswer": "a",
      "explanation": "Max fährt am Montag mit dem Fahrrad in den Park." },
    { "id": "gen-q-h2-a2ex01-q2", "module": "horen", "teil": 2, "lang": "de", "level": "A2",
      "type": "matching", "question": "Was macht Lena am Dienstag?", "passageId": "gen-p-h2-a2ex01",
      "correct": "d", "correctAnswer": "d",
      "explanation": "Lena geht am Dienstag ins Fitnessstudio." },
    { "id": "gen-q-h2-a2ex01-q3", "module": "horen", "teil": 2, "lang": "de", "level": "A2",
      "type": "matching", "question": "Was macht Max am Mittwoch?", "passageId": "gen-p-h2-a2ex01",
      "correct": "c", "correctAnswer": "c",
      "explanation": "Max trifft am Mittwoch Freunde im Café." },
    { "id": "gen-q-h2-a2ex01-q4", "module": "horen", "teil": 2, "lang": "de", "level": "A2",
      "type": "matching", "question": "Was macht Lena am Donnerstag?", "passageId": "gen-p-h2-a2ex01",
      "correct": "e", "correctAnswer": "e",
      "explanation": "Lena besucht am Donnerstag ein Museum." },
    { "id": "gen-q-h2-a2ex01-q5", "module": "horen", "teil": 2, "lang": "de", "level": "A2",
      "type": "matching", "question": "Was macht Max am Freitag?", "passageId": "gen-p-h2-a2ex01",
      "correct": "h", "correctAnswer": "h",
      "explanation": "Max geht am Freitag einkaufen." }
  ]
}
```
