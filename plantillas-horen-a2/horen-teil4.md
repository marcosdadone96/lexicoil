# Plantilla — Hören A2 · Teil 4 (Radiointerview Ja/Nein)

Pega TODO en Gemini. Devuelve **SOLO JSON**.

---

Eres examinador Goethe **A2**. Genera **Hören Teil 4** — **NO** es B1 (sin 8 matching M/A/B).

## FORMATO OFICIAL
- **1 passage** — entrevista de radio, **150–250 palabras**
- Estilo: presentador + invitado/a, turnos «Name:»
- **5 preguntas** `type: "ja_nein"`
- `correct` / `correctAnswer`: **"Ja"** o **"Nein"** (capitalizado)
- `options: []` siempre vacío

## PROHIBIDO (formato B1)
- 8 preguntas matching con opciones M/A/B
- 3 hablantes en debate
- Opciones a/b/c en las preguntas

## REGISTRO A2 (OBLIGATORIO — gate rechaza B1)
- Entrevista **sencilla**, frases cortas, vocabulario cotidiano (Familie, Arbeit, Freizeit, Stadt).
- **PROHIBIDO:** *Experte für digitale Kommunikation*, *Herausforderung*, *herzlich willkommen zu unserer Sendung*, *Es ist wichtig, kritisch zu sein*, *Einblicke*, *beeinflussen*.
- Máximo **3** construcciones *… zu …* en toda la entrevista (p. ej. *Energie zu sparen*, *Freunde zu treffen*). Prefiere oraciones principales.
- Apertura moderador: *Guten Tag. Heute sprechen wir über …* — NO fórmula larga de radio B1.
- `difficulty`: entero **2–4** por pregunta (nunca 5).

## PALABRAS OBJETIVO
<<< radio, interview, frage, antwort, meinung, arbeit, gesundheit, reisen, hobby >>>

## CAMPO AUDIO (obligatorio para TTS)
Incluye en el passage un campo `"audio"`: array de turnos en orden de aparición (presentador + invitado/a):
```json
"audio": [
  { "speaker": "Moderator", "voiceId": "de-DE-ConradNeural", "text": "Guten Tag. Heute sprechen wir über …" },
  { "speaker": "Frau Keller", "voiceId": "de-DE-KatjaNeural", "text": "Das ist ein wichtiges Thema. Ich denke, dass …" },
  { "speaker": "Moderator", "voiceId": "de-DE-ConradNeural", "text": "Und was ist mit …?" }
]
```
- **2 `voiceId` distintas** (Moderator + invitado/a).
- El `text` de cada turno **no** incluye el prefijo `Nombre:`.
- Cubre los turnos principales del diálogo (≥6 entradas recomendadas).

## AUTORREVISIÓN
- ¿1 entrevista 150–250 W + 5 ja_nein?
- ¿5 preguntas, options vacíos?
- ¿Mezcla Ja/Nein (no todo igual)?
- ¿Passage incluye `"audio"` con 2 voces distintas?
- ¿Solo JSON?

## EJEMPLO (estructura — NO copies contenido)
```json
{
  "passages": [{
    "id": "gen-p-h4-a2ex01",
    "module": "horen", "teil": 4, "lang": "de", "level": "A2",
    "title": "Aufnahme 1",
    "text": "Moderator: Guten Tag. …\n\nFrau Keller: …",
    "passageVocab": ["interview", "meinung", "stadt"],
    "audio": [
      { "speaker": "Moderator", "voiceId": "de-DE-ConradNeural", "text": "Guten Tag. Heute sprechen wir über …" },
      { "speaker": "Frau Keller", "voiceId": "de-DE-KatjaNeural", "text": "Ich finde, dass …" }
    ]
  }],
  "questions": [{
    "id": "gen-q-h4-a2ex01-q1",
    "module": "horen", "teil": 4, "type": "ja_nein",
    "question": "…?",
    "correct": "Ja", "correctAnswer": "Ja", "options": [],
    "explanation": "… (≥6 Wörter, Zitat aus dem Interview).",
    "passageId": "gen-p-h4-a2ex01",
    "skills": ["listening"]
  }]
}
```
