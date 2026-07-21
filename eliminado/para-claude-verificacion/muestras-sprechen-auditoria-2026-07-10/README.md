# Muestras Sprechen — primera pasada auditoría (2026-07-10)

Inventario completo en el mensaje del agente. Esta carpeta = 11 batches representativos.

## Origen
- `sprechen-gemini-00{1,3,5,8}.json` — pipeline Gemini (batches/generated/), topicTags=daily_life en todos
- resto — batches/merged/ (temas variados; algunos con types canónicos planungsaufgabe/praesentation/…)

## Estructura de cada archivo
- passages: [] siempre
- exactamente 3 questions (teil 1, 2, 3) = un set oral completo Goethe B1
- correct/correctAnswer: `rubric`

## Checklist sugerido (mismo criterio Hören/Schreiben)
1. Coherencia T2↔T3 (mismo tema presentación)
2. T1: 5 bullets planificación concretos
3. T2: estructura 5 puntos (Einleitung…Meinung)
4. Alemán B1 / errores / markdown residual (**bold**, bullets `*`)
5. Metadatos: topicTags genéricos (daily_life) vs tema real; types inconsistentes (short_answer vs planungsaufgabe)
6. Patrones repetidos entre archivos (misma situación, mismos bullets)
