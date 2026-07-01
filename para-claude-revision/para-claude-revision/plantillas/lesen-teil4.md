# Plantilla de generación — Lesen B1 · Teil 4

Pega TODO este texto en Gemini/ChatGPT/Claude. Sustituye **PALABRAS OBJETIVO** (8–12 palabras).
Devuelve **SOLO JSON**. El ejemplo de abajo pasa validación técnica + calidad + CEFR al 100%.

---

Eres examinador del Goethe-Zertifikat B1. Genera **UNA** parte de **Lesen Teil 4**
(foro con opiniones, Ja/Nein), alemán estándar, nivel B1.

## Reglas estrictas
- Formato: **forum_opinions** — 1 intro breve + **7 opiniones** en `signText`.
- **7 preguntas** exactas, tipo **ja_nein** con opciones **a) Ja** / **b) Nein**.
- **LAS 7 PREGUNTAS DEBEN TENER EL MISMO ENUNCIADO AFIRMATIVO**, por ejemplo:
  `"Ist [Vorname] für den Vorschlag?"` — solo varía el nombre.
- **PROHIBIDO en el enunciado de pregunta:** nicht, kein, lehnt, gegen, ablehnen, widerspricht.
  ❌ "Lehnt Thomas den Vorschlag ab?" → ✅ "Ist Thomas für den Vorschlag?"

## LONGITUD CEFR (OBLIGATORIO)
- `passages[0].text`: intro al debate, **50–70 palabras**.
- Cada pregunta lleva **`signText`** con la opinión (~**25–35 palabras**).
- **Suma total** (intro + 7 × signText): **150–380 palabras**, máximo **400**.
- No repitas el mismo texto en `text` y `signText`.

## VOCABULARIO B1 (cobertura ≥75% — OBLIGATORIO)
Usa léxico **simple y frecuente**:

> Stadt, Transport, Auto, Nachhaltigkeit, Kinder, Besucher, Organisation, Nachbar, Familie, Erfahrung, Meinung, Problem, Vorteil, Plan, Regel

**PROHIBIDO:** empfand, faszinierend, jurídico-raro, tono moralizante («Abschließend…», «man sollte wissen»).

**Usa:** finden, denken, meinen, wichtig, weil, dass — frases claras B1.

## REGLAS DE CALIDAD (rechazo automático si fallas)
1. **Enunciado igual para todos:** las 7 preguntas = "Ist [Nombre] für den Vorschlag?" (solo cambia el nombre). **PROHIBIDA cualquier negación en el enunciado.**
2. Opciones siempre exactamente **a) Ja** y **b) Nein**.
3. **Distribución OBLIGATORIA:** exactamente **3 Ja y 4 Nein** (o 4 Ja y 3 Nein) — NUNCA ≥5 del mismo.
4. **≥2 opiniones con matices:** crítica parcial pero a favor en general (→ Ja) o escepticismo parcial pero en contra (→ Nein). El alumno debe leer con atención.
5. **Anti word-matching:** pregunta ↔ `signText` — el nombre está permitido; el resto ≤2 palabras de contenido comunes.
6. **Coherencia clave ↔ signText (OBLIGATORIO):**
   - `signText` con «nicht gut», «bin dagegen», «sage ich Nein», «lehne ab» → `correct` = **Nein**
   - `signText` con «bin dafür», «finde ich gut», «unterstütze», «stimme zu» → `correct` = **Ja**
   - Verifica cada ítem antes de emitir. Una clave invertida provoca rechazo automático.

## ANTI WORD-MATCHING — MALO vs BUENO (léelo antes de escribir)

Opinión: *«Ich finde **Fahrrad**fahren gut…»*

❌ **MALO:** «Findet die Person **Fahrrad**fahren gut?»
✅ **BUENO:** «Hält die Person Radfahren für eine gute Alternative zum Auto?» (≤2 palabras del signText).

**Proceso obligatorio:** escribe cada `signText`; luego redacta la pregunta **sin** repetir sustantivos/verbos clave.

## PALABRAS OBJETIVO — límites
- **8–12 palabras** (no 15). Intégralas en intro y opiniones, no en las preguntas.
- Pool **solo Lesen**; Hören es otro módulo.

## PALABRAS OBJETIVO
<<< stadt, transport, auto, nachhaltigkeit, kinder, besucher, organisation, nachbar, familie, erfahrung >>>

## AUTORREVISIÓN (obligatoria)
- ¿Intro 50–70 palabras + 7 signText (~25–35 c/u), suma 150–380?
- ¿Las **7 preguntas tienen el mismo enunciado** "Ist [Name] für den Vorschlag?" (solo varía el nombre)?
- ¿Ningún enunciado de pregunta contiene nicht/kein/lehnt/gegen/ablehnen?
- ¿Cada pregunta tiene `signText` y `passageId`?
- ¿Opciones exactamente a) Ja / b) Nein?
- ¿3–4 Ja y 4–3 Nein?
- ¿`correct` coincide con la postura real del `signText`? (una clave invertida = rechazo)
- ¿Sin tono moralizante?
- ¿Solo JSON, sin markdown?

## Formato de salida
Devuelve SOLO `{ "passages": [...], "questions": [...] }` — sin ```, sin texto extra.
- IDs únicos: `gen-l4-XXXX` / `gen-q-4-XXXX-N` (XXXX aleatorio, no reutilizar ejemplo).
- `module`:"lesen", `teil`:4 (número), `lang`:"de", `level`:"B1".
- `correct` = `correctAnswer` (**Ja** o **Nein**). Cada pregunta con **`signText`** + `passageId`.

## EJEMPLO VERIFICADO (100% checker — imita estructura, matices y parafraseo)

```json
{
  "passages": [
    {
      "id": "gen-l4-8842",
      "module": "lesen",
      "teil": 4,
      "title": "Forum: Autofreie Innenstadt — ja oder nein?",
      "text": "Die Organisation in der Stadt plant neue Regeln für Autos im Zentrum an normalen Tagen. Viele Besucher wünschen weniger Verkehr und bessere Luft, weil Transport und Nachhaltigkeit wichtige Themen bleiben. Viele Nachbarn beschreiben Erfahrungen in lokalen Programmen und in Zeitungen. Lesen Sie die Meinungen — stimmt die Person dem Vorschlag insgesamt zu?"
    }
  ],
  "questions": [
    {
      "id": "gen-q-4-8842-1",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Sabine für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Sie unterstützt die Idee, fordert aber bessere Lieferzeiten.",
      "signText": "Weniger Autos in der Mitte finde ich gut, weil Besucher dort in Ruhe gehen können und Kinder mehr Platz auf den Straßen haben. Läden brauchen Zeiten für Lieferungen, aber die Organisation kann das planen. Ich unterstütze den Vorschlag insgesamt.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-8842-2",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Thomas für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Er sagt explizit 'nicht gut' — er ist gegen den Vorschlag (Nein).",
      "signText": "Ich wohne am Stadtrand und die Busse fahren selten zu meinen Zeiten, obwohl ich den Plan verstehe. Ohne Auto komme ich nicht zum Arzt oder zum Einkauf in der Stadt. Für mich ist der Vorschlag deshalb nicht gut.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-8842-3",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Mira für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Sie will weniger Autos, findet aber den Zeitplan zu schnell.",
      "signText": "Weniger Autos sind richtig für Kinder und Besucher in der Stadt, weil die Straßen dann sicherer werden. Alles schon nächsten Monat zu ändern ist aus meiner Sicht zu schnell. Das Ziel finde ich trotzdem gut.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-8842-4",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Oskar für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Er sagt 'sage ich Nein' — er ist gegen den Vorschlag (Nein).",
      "signText": "Als Ladenbesitzer in der Stadt sage ich Nein, weil viele Kundinnen mit dem Auto kommen und schwere Sachen kaufen. Ohne Parkplätze vor der Tür gehen sie woanders hin, und das sehe ich schon jetzt in meinem Geschäft.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-8842-5",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Jana für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Sie nennt die saubere Luft einen Vorteil und plädiert für einen Test.",
      "signText": "Die Luft wäre sicher besser, da gebe ich zu, weil weniger Autos oft helfen. Trotzdem will ich erst ein halbes Jahr testen, statt gleich alles zu verbieten. Ich bin nicht grundsätzlich dagegen, nur gegen den starren Plan.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-8842-6",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Felix für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Er pendelt mit ÖPNV und sieht keinen Bedarf für private Autos im Zentrum.",
      "signText": "Ich fahre mit der Straßenbahn ins Büro, weil das für mich schneller ist als im Stau mit dem Auto. Autos in der Mitte brauchen wir nicht, solange Bus und Bahn im Takt laufen. Deshalb bin ich dafür.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-8842-7",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Helena für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Sie warnt vor teureren Lieferungen, lehnt das Konzept aber nicht pauschal ab.",
      "signText": "Lieferwagen brauchen Zufahrt in die Stadt, sonst werden Produkte teurer und Nachbarn zahlen mehr. Ich bin skeptisch, ob das alles klappt, aber grundsätzlich verboten finde ich es nicht, wenn es Ausnahmen gibt.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    }
  ]
}
```

Genera UNA parte **NUEVA** (tema distinto al ejemplo), mismas reglas, integrando PALABRAS OBJETIVO. Devuelve solo el JSON.
