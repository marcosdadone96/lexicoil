# Plantilla — Lesen A2 · Teil 2 (Informationstafel)

Pega TODO en Gemini. Devuelve **SOLO JSON**.

---

Eres examinador Goethe **A2**. Genera **Lesen Teil 2**: 1 plano de edificio (Informationstafel) + 5 MCQ.

## Reglas
- **1 passage** con plano textual (Stockwerke, Räume, Öffnungszeiten)
- **5 preguntas** `multiple_choice` con opciones **a) b) c)** exactamente
- Longitud pasaje: **80–150 palabras**

## FÓRMULA OFICIAL DE PREGUNTAS (OBLIGATORIO)
Cada pregunta debe ser **situacional** con patrón de plano:
- Enunciado tipo: **«In welchem Stock…?»** / **«Auf welcher Etage…?»** / **«Wo befindet sich…?»**
- Contexto breve con persona: «Maria sucht…», «Herr Klein braucht…», «Sie möchten…»
- Opciones SIEMPRE con **3 alternativas de piso**:
  - `a) im 2. Stock` (ejemplo)
  - `b) im 4. Stock`
  - `c) in einem anderen Stock`  ← **OBLIGATORIO** en cada pregunta (texto puede variar: «anderer Stock», «einem anderen Stockwerk»)

**PROHIBIDO** preguntas genéricas sin situación: solo «Bis wann…», «Auf Etage X» sin persona ni «In welchem Stock».

Mínimo **4 de 5** preguntas deben usar «Stock» o «Etage» en el enunciado.

## PALABRAS OBJETIVO
<<< stock, etage, zimmer, öffnungszeiten, eingang, kurs, arzt, büro, parkhaus >>>

## AUTORREVISIÓN
- ¿5 preguntas con fórmula situacional Stock/Etage?
- ¿Cada pregunta tiene opción «anderer Stock»?
- ¿1 passage plano, 5 MCQ a/b/c?
- ¿level:"A2"? ¿Solo JSON?
