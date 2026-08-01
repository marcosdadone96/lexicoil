# Plantilla — Lesen B2 · Teil 1 (Forum, Personen zuordnen)

Pega TODO en Gemini. Devuelve **SOLO JSON** según la fase indicada en el prompt (Fase A o Fase B).

---

## FORMATO OFICIAL (Modellsatz Erwachsene)

Instrucción de examen (debe figurar en el batch o en la consigna de la parte):

`Lesen Sie in einem Forum, wie Menschen über ein Thema denken.
Auf welche der vier Personen treffen die einzelnen Aussagen zu? Die Personen können mehrmals gewählt werden.`

- **4 personas** (A, B, C, D) — cada una = **1 passage** con `title` (Person A — Vorname) y `text` (Beitrag im Forum).
- **80–180 Wörter** por persona (cuenta antes de responder).
- **9 matching** (Fase B): tipo `matching`, `correct`/`correctAnswer` = `"A"`|`"B"`|`"C"`|`"D"` (repetición permitida).
- Opciones fijas por pregunta: `"A"`, `"B"`, `"C"`, `"D"` (strings exactos, sin «a)»).
- Nivel **B2** · registro foro (Sie/du según contexto natural del foro).
- `grammarTags`: **omitir** o `[]` (post-proceso; solo las 6 categorías B2 oficiales).

---FASE-A---

Genera **SOLO Fase A** — foro con **4 Personen**, **sin preguntas**.

### Salida Fase A
```json
{
  "passages": [
    { "id": "gen-l1-XXXX-a", "module": "lesen", "teil": 1, "level": "B2", "personKey": "A",
      "title": "Person A — …", "text": "… (80–180 Wörter)" },
    { "id": "gen-l1-XXXX-b", "personKey": "B", "title": "Person B — …", "text": "…" },
    { "id": "gen-l1-XXXX-c", "personKey": "C", "title": "Person C — …", "text": "…" },
    { "id": "gen-l1-XXXX-d", "personKey": "D", "title": "Person D — …", "text": "…" }
  ],
  "questions": []
}
```

### Reglas Fase A
- **Un tema B2** controvertido pero cotidiano (Medien, Arbeit, Umwelt, Bildung, Technik…).
- **4 posturas distintas** (pro/con/matices); no clones.
- Cada Beitrag: opinión clara + al menos **1 argumento/ejemplo** propio.
- **PROHIBIDO:** tono moralizante de manual, texto informativo sin voz personal, ich-Blog B1 monolítico.
- **PROHIBIDO** negrita con `**` en `text`.
- IDs únicos; no copies el ejemplo.

---FASE-B---

Genera **SOLO Fase B** — **9 Aussagen** de matching sobre el foro **ya fijado** (JSON de passages incluido abajo en el prompt).

### Salida Fase B
```json
{
  "passages": [],
  "questions": [
    {
      "id": "gen-q-1-XXXX-1",
      "module": "lesen", "teil": 1, "level": "B2", "type": "matching",
      "question": "Aussage parafraseada (≤2 palabras de contenido iguales al texto de la persona).",
      "options": ["A", "B", "C", "D"],
      "correct": "B", "correctAnswer": "B",
      "passageId": "gen-l1-XXXX-b",
      "explanation": "Begründung B2 en alemán (≥10 Wörter), cita la idea, no copies frases largas.",
      "options": ["A", "B", "C", "D"]
    }
  ]
}
```

### Reglas Fase B
- **Exactamente 9 preguntas**; cada `correct` ∈ {A,B,C,D}.
- **Repetición:** al menos **2 personas** deben ser respuesta correcta más de una vez (Modellsatz).
- **Cobertura:** cada persona A–D debe ser `correct` al menos **1 vez**.
- **Anti word-matching:** parafraseo; máx. **2** tokens de contenido (≥4 letras) compartidos con el Beitrag de la persona elegida.
- `passageId` = id del passage de la persona **correcta** (coherencia clave ↔ texto).
- **PROHIBIDO** inventar hechos que ninguna persona escribió.
- Vocabulario B2 en pasajes; preguntas/explicaciones claras B2 (sin jerga C1).

## PALABRAS OBJETIVO (integrar sobre todo en Fase A)
<<< meinung, diskussion, argument, gesellschaft, erfahrung, vorschlag, digital, bildung, umwelt, arbeit >>>
