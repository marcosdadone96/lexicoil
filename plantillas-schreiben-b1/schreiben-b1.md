# Plantilla de generación — Schreiben B1 · Teile 1–3

Pega TODO este texto en Gemini/ChatGPT. Devuelve **SOLO JSON**.
**Un batch = las 3 Aufgaben** del examen oficial (60 min total).

---

Eres examinador del Goethe-Zertifikat B1. Genera **UN conjunto completo Schreiben**
(3 consignas de escritura), alemán estándar, nivel B1.

## Reglas estrictas
- `"passages": []` **siempre vacío**.
- **Exactamente 3 preguntas** (`teil`: 1, 2, 3).
- `type: "short_answer"` · `correct: "rubric"` · `correctAnswer: "rubric"` · `options: []`.
- **Sin** `passageId`. **Sin** respuesta modelo completa del alumno en `correct`.
- `question`: consigna completa en alemán (multilínea con `\n` y bullets `•`).

## TEIL 1 — E-Mail informal (~80 Wörter, 20 min)
- Destinatario: **Freund/in** (du/Sie según tono informal du).
- **3 bullet points** de contenido concretos y distintos.
- Instrucción explícita: Anrede + Gruß + ca. 80 Wörter.
- Tono: personal, cercano.
- **PROHIBIDO:** placeholders entre corchetes (`[Name]`, `[Name des Freundes/der Freundin]`, `[Dein Name]`). No escribas la Anrede del alumno con corchetes — describe el destinatario en la consigna (`Ihre Freundin`, `ein Freund/eine Freundin`).

## TEIL 2 — Meinung im Forum (~80 Wörter, 25 min)
- Tema de debate actual (Medien, Schule, Umwelt, Arbeit, Wohnen…).
- Incluir **cita breve** del Forumpost original entre comillas «…».
- Pedir: Meinung + Begründung + **Vor- und Nachteile**.
- Tono: semiformal (man/ich), no SMS.

## TEIL 3 — Kurzmitteilung persönlich (~40 Wörter, 15 min)
- Destinatario: **persona conocida y mencionada por nombre** — amigo/a, vecino/a, colega, profesor/a, familiar.
- **OBLIGATORIO:** el campo `question` debe mencionar SIEMPRE el **nombre propio o cargo concreto** del destinatario de forma explícita (ej. "Ihr Nachbar Herr Klein", "Ihre Kursleiterin Frau Wagner", "Ihr Kollege Tom"). **PROHIBIDO** usar un rol genérico sin nombre ("Ihrem Vorgesetzten", "der Lehrperson", "Ihrem Chef") — sin nombre o cargo explícito, la Anrede no puede generarse de forma coherente y la consigna será rechazada.
- Registro según el destinatario:
  - **Informal (du):** amigo, vecino, familiar → *Hallo Max, / Liebe Anna,* … *Bis bald / Tschüss*
  - **Formal personal (Sie):** profesor/a, superior → *Liebe Frau Müller, / Lieber Herr Schmidt,* … *Mit freundlichen Grüßen*
- Situación práctica: Termin absagen, Entschuldigung, kurze Bitte, Einladung, Absage…
- Anrede + Gruß **obligatorios** y coherentes con el registro elegido.
- **3 puntos concretos** (bullets o frases breves).
- Longitud: ca. 40 Wörter (35–45).
- **PROHIBIDO:** dirigirse a instituciones anónimas (Bürgerbüro, Stadtamt, "Sehr geehrte Damen und Herren…"). Eso es una carta formal, no una Kurzmitteilung personal.

## REGLAS DE CALIDAD
1. Los **3 temas** deben ser **independientes** (no repetir el mismo asunto).
2. Cada consigna debe poder evaluarse con rúbrica clara en `explanation`. La `explanation` NO debe mencionar ningún nombre fijo (como "Frau Müller") — usa el nombre que aparece en la propia `question` o describe el destinatario en general ("al destinatario mencionado").
3. Bullets accionables (el alumno sabe qué escribir en cada punto).
4. **PROHIBIDO:** MCQ, passages, emails ya escritas como respuesta.
5. **PROHIBIDO** marcar tipográficamente palabras objetivo dentro del enunciado (negrita `**…**`, cursiva `_…_`, etc.). Las palabras objetivo deben integrarse en la prosa de forma indistinguible — el examinador real nunca resaltaría vocabulario en su propia consigna.
   ❌ MALO: `"Haben Sie Angst, dass es viel zu **teurer** wird?"`
   ✅ BUENO: `"Haben Sie Angst, dass es am Ende teurer wird als geplant?"`

## PALABRAS OBJETIVO
<<< termin, anmeldung, organisation, familie, stadt, kurs, gebühr, beratung, transport, freizeit >>>

## AUTORREVISIÓN
- ¿passages: [] y 3 questions (teil 1,2,3)?
- ¿correct:"rubric" en las 3?
- ¿T1 ~80W informal (du, a Freund/in), T2 ~80W con Forumpost citado, T3 ~40W personal (a persona con nombre)?
- ¿T3: la `question` incluye nombre propio o cargo concreto del destinatario (no solo un rol genérico)?
- ¿T3: Anrede con nombre ("Liebe Frau Müller," / "Hallo Max,") + Gruß al final?
- ¿T3 NO dirigida a institución anónima?
- ¿Ningún enunciado contiene palabras en negrita `**…**` o cursiva `_…_`?
- ¿module:"schreiben", lang:"de", level:"B1"?
- ¿Solo JSON?

## Formato de salida
- IDs: `gen-q-s-t1-XXXX-q1`, `gen-q-s-t2-XXXX-q1`, `gen-q-s-t3-XXXX-q1`
- `explanation`: **texto fijo canónico Goethe** por Teil (copia exacta del ejemplo verificado abajo para T1/T3; T2 con variante Forumsbeitrag) — no redactes otra estructura de criterios
- `skills: ["writing"]`

## EJEMPLOS VERIFICADOS — imita estructura, registro y longitud

### T1 (informal, a amigo/a)
```json
{
  "id": "gen-q-s-t1-8842-q1",
  "module": "schreiben", "teil": 1, "type": "short_answer",
  "question": "Sie haben vor einer Woche Ihren Geburtstag gefeiert. Ein Freund/Eine Freundin konnte wegen Krankheit nicht kommen.\nSchreiben Sie eine E-Mail (circa 80 Wörter). Schreiben Sie etwas zu allen drei Punkten. Achten Sie auf Anrede und Gruß.\n\n• Beschreiben Sie: Wie war die Feier?\n• Begründen Sie: Welches Geschenk finden Sie besonders schön und warum?\n• Machen Sie einen Vorschlag für ein Treffen.",
  "options": [], "correct": "rubric", "correctAnswer": "rubric",
  "explanation": "Bewertung: alle 3 Punkte (0–5), Anrede/Gruß informell – du-Form (0–3), Grammatik/Wortschatz B1 (0–5), Länge ca. 80 Wörter (0–3).",
  "lang": "de", "level": "B1", "skills": ["writing"]
}
```

### T3 (personal, puede ser formal O informal según destinatario)
```json
{
  "id": "gen-q-s-t3-8842-q1",
  "module": "schreiben", "teil": 3, "type": "short_answer",
  "question": "Ihre Kursleiterin, Frau Müller, hat Sie zu einem Gespräch über Ihre persönlichen Lernziele eingeladen. Zu dem Termin können Sie aber nicht kommen.\nSchreiben Sie an Frau Müller. Schreiben Sie eine E-Mail (circa 40 Wörter). Vergessen Sie nicht Anrede und Gruß.\n\n• Entschuldigen Sie sich höflich.\n• Erklären Sie, warum Sie nicht kommen können.\n• Bitten Sie um einen neuen Termin.",
  "options": [], "correct": "rubric", "correctAnswer": "rubric",
  "explanation": "Bewertung: Mitteilung vollständig (alle 3 Punkte, 0–5), Anrede/Gruß passend zum Empfänger im Aufgabentext (0–3), Grammatik/Wortschatz B1 (0–3), Länge ca. 40 Wörter (0–3).",
  "lang": "de", "level": "B1", "skills": ["writing"]
}
```

Genera **las 3 consignas completas** (Teile 1–3), integrando PALABRAS OBJETIVO. Devuelve solo JSON.
