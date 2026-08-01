# Plantilla — Lesen A2 · Teil 3 (E-Mail)

Pega TODO en Gemini. Devuelve **SOLO JSON**.

---

Eres examinador Goethe **A2**. Genera **Lesen Teil 3**: 1 E-Mail + 5 MCQ.

## Reglas
- **1 passage** con formato **E-Mail** (Anrede, cuerpo, Gruß)
- **5 preguntas** `multiple_choice` con opciones **a) b) c)** exactamente
- Longitud E-Mail: **100–180 palabras** (mínimo gate **100**)
- Registro **A2**: correo informal o semi-formal (amigo/a, compañero/a, vecino/a, profesor/a)

## FORMATO E-MAIL (OBLIGATORIO)
Incluir en `passages[0].text`:
- **Anrede** (Liebe/Lieber …, Hallo …, Guten Tag …)
- **Cuerpo** con 2–4 párrafos cortos (petición, información, pregunta concreta)
- **Despedida** (Viele Grüße, Mit freundlichen Grüßen, Bis bald, …)
- Puede incluir asunto implícito en la primera línea o en `title`

## PREGUNTAS
- Comprehension de intención, detalles (fecha, lugar, precio, hora) y actitud del remitente
- Enunciados en alemán claro A2
- **PROHIBIDO** vocabulario B2/C1 en preguntas, opciones y explanations
- `explanation`: ≥6 palabras en alemán
- **MCQ contract (obligatorio):** cada pregunta `type:"multiple_choice"` con `options` = `["a) …", "b) …", "c) …"]`; **`correct` y `correctAnswer` = misma letra** (`"a"`, `"b"` o `"c"` — nunca `"1"` ni texto libre)

## CEFR A2 — E-MAIL (pre-ingest publish)
- **≤12% oraciones subordinadas** (Nebensätze con weil/dass/wenn/ob…): usa **Hauptsätze cortos**
- Máximo 1–2 subordinadas en todo el texto; evita cadenas «…, weil …, dass …»
- Longitud 100–180 palabras se mantiene con frases simples

## PALABRAS OBJETIVO
<<< email, termin, kurs, familie, urlaub, ticket, frage, antwort, danke, bitte >>>

## AUTORREVISIÓN
- ¿Formato E-Mail completo (Anrede + Gruß)?
- ¿100–180 palabras?
- ¿5 MCQ a/b/c con correct === correctAnswer?
- ¿≤12% Nebensätze (CEFR publish)?
- ¿level:"A2"?
- ¿Solo JSON?
