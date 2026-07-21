# Sprechen F3 — auditoría productionEval vs spec (2026-07-10)

Fuente: `netlify/functions/lib/productionEval.js` (vía `claude-chat` `scoreProductionModules`).

## Spec (prompt maestro) vs existente

| Requisito | Antes | Después (esta fase) |
|-----------|-------|---------------------|
| 4 criterios Goethe orales | Sí (EN names, 0–5) | Sí — nombres DE: Aufgabenerfüllung, Wortschatz, Grammatik, Kohärenz & Flüssigkeit |
| Errores citados verbatim, máx 8 | No en sprechen | Sí — `errors[]` máx 8 |
| Aviso Aussprache no evaluable | No | Sí — `ausspracheNote` + instrucción explícita |
| Idioma del usuario | Sí (`explLang`) | Sin cambio |
| Un solo evaluador Free+Pro | Sí (mismo `runProductionEval`) | Sin cambio |

## Decisión

**Alinear la existente**, no crear evaluador paralelo. Free (post-examen, créditos `speaking`) y Pro (post-conversación, mismo path) usan este prompt.

## Pendiente Fase 4

Calibración con 9 transcripts + errores plantados — innegociable pre-lanzamiento.
