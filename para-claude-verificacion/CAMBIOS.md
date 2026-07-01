# CAMBIOS.md — Paquete de verificación (2026-06-30)

## Resumen de cambios aplicados

### FIX-A — Plantilla lesen-teil1.md: regla anti-correlación
- Se añadió la **Regla 6 ANTI-CORRELACIÓN** que prohíbe que las palabras de alcance
  (alle/jede/immer/nie/nur/ausschließlich/komplett/stets) predigan la respuesta.
- Máximo 2 de 6 enunciados pueden contener una palabra de alcance, y deben repartirse
  entre ítems Richtig y Falsch — nunca todas en Falsch.
- El checklist de autorrevisión fue actualizado con la comprobación de correlación.
- El ejemplo JSON de la plantilla fue corregido para mostrar la distribución correcta.

### FIX-B — CHK-10 basado en correlación (no en presencia en Richtig)
- El gate CHK-10 anterior solo marcaba palabras absolutas en ítems **Richtig**.
  Eso ocultaba la correlación real: hasta 88 % de ítems Falsch con absoluta vs 0 % en Richtig.
- El nuevo CHK-10 detecta:
  (1) Sobre-uso: >2 de 6 enunciados con palabra de alcance → IMPORTANT
  (2) Correlación perfecta: ≥2 con absoluta y todas en Falsch → IMPORTANT
  (3) Caso aislado: 1 enunciado con absoluta → MINOR (aceptable)
- Resultado: el banco volvió a exponer los 33 archivos con correlación que la redefinición
  anterior había ocultado. Todos fueron regenerados (swap atómico).

### FIX-C — Pool auditada de verdad (loadBatchFile aplanado)
- La función `loadBatchFile` en `audit-pass-2.mjs` no entendía el esquema de examen
  ensamblado `{exam:{lesenParts, horenParts, …}}`, resultando en `questionsScanned: 0`.
- Se añadió la función `flattenExam()` que aplanar el examen a `{passages, questions}`
  inyectando `module` y `teil` (necesarios para CHK-3/4/10).
- Ahora la pool reporta `questionsScanned > 0` (≈46 preguntas por examen).

### FIX-D — Regeneración de Lesen T1 con swap atómico
- El gate interno del generador exigía "≥2 Falsch con trampa de alcance", lo que generaba
  exactamente el patrón de correlación que detectamos. Se eliminó ese requisito de
  `lesenBatchQuality.mjs` para alinear el generador con la nueva regla anti-correlación.
- **140 archivos en .rejected/** en total (incluidos los de rondas anteriores).
- Los archivos rechazados en esta ronda son todos los lesen-t1-gemini de numeración baja
  que presentaban correlación perfecta (todas las absolutas en Falsch).
- Cada viejo archivo fue sustituido por un nuevo generado con Gemini + plantilla FIX-A,
  verificado por CHK-10 nuevo antes del swap.

## Cómo verificar

1. `audit-banco.json` debe mostrar `critical: 0` e `important: 0` (o solo CHK-10 MINOR).
2. `audit-pool.json` debe mostrar `questionsScanned > 0` — confirma que la pool se audita.
3. En los 5 Lesen T1 de `muestras-aleatorias/lesen-t1-*`: revisar que las palabras de
   alcance (alle/immer/nur/…) **no estén todas en ítems Falsch** — la correlación está rota.
