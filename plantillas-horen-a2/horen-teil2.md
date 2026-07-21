# Plantilla de generación — Hören A2 · Teil 2

Pega TODO este texto en Gemini/ChatGPT. Devuelve **SOLO JSON**.
Formato oficial Goethe A2: **1 diálogo (2 personas) + banco compartido a–i + 5 Zuordnungen (días)**, escucha **1×**.

---

Eres examinador del Goethe-Zertifikat **A2**. Genera **UNA** parte de **Hören Teil 2**
(diálogo entre dos personas sobre actividades de la semana), alemán **hablado**, nivel **A2**.

## Reglas estrictas
- **1 passage** (diálogo `Name:` / `Name:`), **80–150 palabras** (mín. 70, máx. 160).
- **Exactamente 2 hablantes** con nombres de pila (z. B. Maria und Tom). **PROHIBIDO** monólogo.
- En `passages[0]` incluye **`pictures`**: array de **9** objetos (banco compartido **a–i**):
  `{ "key": "a", "icon": "🛒", "label": "Einkaufen" }` — emoji + etiqueta corta A2 (1–3 palabras).
- Las 9 actividades deben ser **distintas** y mencionadas o inferibles del diálogo.
- **5 preguntas** `type: "matching"` — enunciado = día de la semana: `Montag`, `Dienstag`, `Mittwoch`, `Donnerstag`, `Freitag`.
- `correct` / `correctAnswer`: solo una letra **a–i** (minúscula). **Cada letra correcta solo una vez** (5 de 9 usadas).
- **SIN `options` en las preguntas** — el alumno elige del banco `pictures[]`.
- Todas las preguntas con el mismo `passageId`.

## ESTILO
- Diálogo natural A2: planes semanales, hobby, compras, deporte, cita médica, curso, etc.
- Turnos alternados: `Maria: …` / `Tom: …` (mín. 6 turnos).
- El diálogo debe dejar claro qué hace cada persona cada día laborable.

## REGLAS DE CALIDAD
1. Las 5 respuestas correctas usan **5 letras distintas** de a–i.
2. 4 actividades del banco son distractores (no son respuesta correcta de ningún día).
3. Cada `label` del banco debe ser único y comprensible sin el audio (pero la respuesta exige escuchar).
4. Anti word-matching: la pregunta (día) no copia texto del diálogo; la explicación parafrasea.

## CAMPO AUDIO (obligatorio para TTS)
Incluye en el passage un campo `"audio"` con turnos del diálogo:
```json
"audio": [
  { "speaker": "Maria", "voiceId": "de-DE-KatjaNeural", "text": "Hallo Tom! …" },
  { "speaker": "Tom", "voiceId": "de-DE-ConradNeural", "text": "Hi Maria! …" }
]
```

## PALABRAS OBJETIVO
<<< einkaufen, sport, arzt, kurs, kino, kochen, lernen, spazieren, freunde, termin >>>

## AUTORREVISIÓN
- ¿1 diálogo 80–150 palabras con 2 hablantes?
- ¿`pictures` con exactamente 9 entradas a–i (icon + label)?
- ¿5 preguntas matching con días Montag–Freitag sin `options`?
- ¿5 letras correctas distintas?
- ¿module:"horen", teil:2, level:"A2"? ¿Solo JSON?

## Formato de salida
- Passage: `gen-p-h2-XXXX`
- Questions: `gen-q-h2-XXXX-q1` … `q5`
- `explanation` en alemán · `skills:["listening"]`

## EJEMPLO ESTRUCTURAL (imita format, NO el contenido)
```json
{
  "passages": [{
    "id": "gen-p-h2-5a3f",
    "module": "horen", "teil": 2, "lang": "de", "level": "A2",
    "title": "Wochenplan",
    "text": "Maria: Hallo Tom! Was machst du diese Woche?\nTom: Am Montag gehe ich einkaufen. Und du?\nMaria: Ich habe am Montag einen Termin beim Arzt. Am Dienstag gehe ich ins Kino.\nTom: Dienstag mache ich Sport im Fitnessstudio. Mittwoch lerne ich Deutsch.\nMaria: Ich koche am Mittwoch für meine Familie. Donnerstag treffe ich Freunde.\nTom: Ich gehe am Donnerstag spazieren im Park. Freitag besuche ich einen Kurs.\nMaria: Am Freitag schreibe ich eine E-Mail an meine Kollegin.",
    "pictures": [
      { "key": "a", "icon": "🛒", "label": "Einkaufen" },
      { "key": "b", "icon": "🏥", "label": "Arzttermin" },
      { "key": "c", "icon": "🎬", "label": "Kino" },
      { "key": "d", "icon": "🏋️", "label": "Sport" },
      { "key": "e", "icon": "📚", "label": "Deutsch lernen" },
      { "key": "f", "icon": "🍳", "label": "Kochen" },
      { "key": "g", "icon": "👫", "label": "Freunde treffen" },
      { "key": "h", "icon": "🚶", "label": "Spazieren" },
      { "key": "i", "icon": "🎓", "label": "Kurs besuchen" }
    ],
    "audio": [
      { "speaker": "Maria", "voiceId": "de-DE-KatjaNeural", "text": "…" },
      { "speaker": "Tom", "voiceId": "de-DE-ConradNeural", "text": "…" }
    ]
  }],
  "questions": [
    { "id": "gen-q-h2-5a3f-q1", "module": "horen", "teil": 2, "lang": "de", "level": "A2",
      "type": "matching", "question": "Montag", "passageId": "gen-p-h2-5a3f",
      "correct": "b", "correctAnswer": "b",
      "explanation": "Maria sagt, dass sie am Montag einen Termin beim Arzt hat." },
    { "id": "gen-q-h2-5a3f-q2", "module": "horen", "teil": 2, "lang": "de", "level": "A2",
      "type": "matching", "question": "Dienstag", "passageId": "gen-p-h2-5a3f",
      "correct": "c", "correctAnswer": "c",
      "explanation": "Maria geht am Dienstag ins Kino." },
    { "id": "gen-q-h2-5a3f-q3", "module": "horen", "teil": 2, "lang": "de", "level": "A2",
      "type": "matching", "question": "Mittwoch", "passageId": "gen-p-h2-5a3f",
      "correct": "f", "correctAnswer": "f",
      "explanation": "Maria kocht am Mittwoch für ihre Familie." },
    { "id": "gen-q-h2-5a3f-q4", "module": "horen", "teil": 2, "lang": "de", "level": "A2",
      "type": "matching", "question": "Donnerstag", "passageId": "gen-p-h2-5a3f",
      "correct": "g", "correctAnswer": "g",
      "explanation": "Maria trifft am Donnerstag Freunde." },
    { "id": "gen-q-h2-5a3f-q5", "module": "horen", "teil": 2, "lang": "de", "level": "A2",
      "type": "matching", "question": "Freitag", "passageId": "gen-p-h2-5a3f",
      "correct": "i", "correctAnswer": "i",
      "explanation": "Tom besucht am Freitag einen Kurs." }
  ]
}
```
