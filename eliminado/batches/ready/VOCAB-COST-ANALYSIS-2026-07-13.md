# Análisis vocabulario vs costo de generación (2026-07-13)

## Pregunta

¿Pedir 10 palabras cuando el modelo integra 2–6 causa reintentos extra (más allá de fails de calidad)?

## Evidencia logs (`generation-cost.jsonl`, 2026-07-13)

| Métrica | Valor |
|---------|-------|
| Fails totales | 437 |
| Fails con `failReason` mencionando integración vocab (`notUsed`, `no encajaron`, `targetUsage`) | **0** |
| Fails `lexico` con keyword `vocabulario` | 27 (todos B2+ en texto generado, no “palabra no integrada”) |
| Dominancia real de fails | `calidad` 318, `formato` 50, `audit2` 39 |

**Conclusión:** Hoy **no existe gate** que reintente por “vocabulario no integrado”. `attachVocabFeedback` solo loguea `used/notUsed` post-éxito; no bloquea.

## Configuración actual

- `generate-cli` default `--word-count` = **6** (rango 5–8).
- Prompt: “integra solo si encajan; omite las que no encajen” (`userVocabPrompt.mjs`, `lesenTemplatePrompt.mjs`).
- Contradicción residual en texto: “Forzar una palabra que no encaja es motivo de rechazo” — **no está cableado a ningún checker** (solo instrucción al modelo).

## Efecto indirecto (hipótesis, no medido como gate)

Pedir muchas palabras puede empuar al modelo a forzar términos → más fails de:
- `calidad` (word-copy, distractores incoherentes)
- `lexico` (B2+ al forzar lemas difíciles)

Los 27 fails léxicos de hoy son B2+ en preguntas/explicaciones, no “faltó lema X”.

## Recomendación

1. **Mantener default 6** (`--word-count`); no subir a 10 en pool-fill rutinario.
2. **No añadir gate de ratio `used/requested`** — evitaría rechazar archivos válidos cuando el resto pasa calidad.
3. **Opcional (bajo costo):** relajar el copy “motivo de rechazo” en `userVocabPrompt.mjs` a “preferencia, no gate” para alinear prompt con comportamiento real.
4. **Métrica de cobertura:** seguir usando `userVocabFeedback.ratio` solo en logs y `coverage-generation.jsonl`, no como criterio de retry.
