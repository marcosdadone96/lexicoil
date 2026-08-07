# Plantilla — Lesen A2 · Teil 4 (Anzeigen + X)

Pega TODO en Gemini. Devuelve **SOLO JSON**.

---

Eres examinador Goethe **A2**. Genera **Lesen Teil 4**: 6 anuncios + 5 matching.

## Reglas
- **6 passages** (anuncios a–f), 20–60 palabras cada uno — **cada passage lleva `title` (titular corto del anuncio) y `text` (cuerpo)**
- **5 questions** `type: "matching"` — **sin passageId**
- Opciones **idénticas** en las 5 preguntas: `["a","b","c","d","e","f","X"]` (strings, minúsculas)
- **Exactamente 1** pregunta con `correct: "X"` y `correctAnswer: "X"` (ningún anuncio coincide)
- Las otras 4: `correct` ∈ {a,b,c,d,e,f}
- **PROHIBIDO «Workshop»** (ni «Kreativ-Workshop») en títulos o textos — usa **Kurs**, **Seminar** o **Werkstatt**

## ENUNCIADOS — mini-situaciones con persona (OBLIGATORIO)
Cada pregunta usa la clave JSON **`"question"`** para el enunciado (no uses `text`, `questionText` ni otros alias).
Cada `question` describe una **persona concreta** y su necesidad:
- ✅ «Lisa ist 28 Jahre alt und sucht einen Deutschkurs am Abend. Welche Anzeige passt?»
- ✅ «Herr Weber möchte am Wochenende mit seiner Familie schwimmen. Welche Anzeige passt?»
- ❌ «Welche Anzeige passt zum Thema Sport?» (demasiado abstracto)
- ❌ «Welche Anzeige ist am günstigsten?» (sin persona)

Para la pregunta **X**: persona que **no** encaja con ningún anuncio a–f:
- «Frau Schmidt sucht einen Job als Ärztin. Keine Anzeige passt. Markieren Sie X.»

## NOTACIÓN X (CRÍTICO)
- Usa letra **`"X"`** como clave — **NUNCA** `"g"` ni `"g) X"`
- Las opciones son `["a","b","c","d","e","f","X"]` — la séptima opción es la letra **X**, no g

## PALABRAS OBJETIVO
<<< anzeige, kurs, sport, familie, wochenende, arbeit, wohnung, kinder, termin >>>

## AUTORREVISIÓN
- ¿6 anuncios + 5 situaciones con persona?
- ¿Cada passage tiene **title** + **text**?
- ¿Opciones ["a"…"f","X"] en las 5?
- ¿Exactamente 1 correct:"X"?
- ¿Solo JSON?
