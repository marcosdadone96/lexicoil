# REFACTOR_MAP — extracción sin cambiar comportamiento

## appFeatures.js (650 ln) ->
- featureQuota.js        (lógica de cuota cliente)
- featurePayments.js     (Stripe checkout/confirm UI)
- featurePdf.js          (export PDF)
- featureSpeaking.js     (modo oral / micrófono)
- featureFlashcards.js   (baraja / repetición espaciada)
- appFeatures.js (shim)  re-exporta y mantiene window.* + orden de carga

## examGeneration.js (697 ln) ->
- examSources.js: { fromQuestionLibrary, fromExamLibrary, fromPool, fromAI, runCascade }
- examValidation.js: helper validación único (reemplaza el bloque duplicado 4x)
- generateExam() en appFeatures shim: orquestador delgado (<~50 ln)
- conservar salvageJson SOLO hasta que la salida estructurada (fase 03) lo haga innecesario;
  marcar como deprecated.

## Utilidades
- notify(msg, type): toast si existe, si no alert. Sustituye ~6 duplicados.
- debugLog.js: console.* detrás de DEBUG_LEXICOIL / lcDebug.

## Contrato de paridad
- Mismos window.* expuestos.
- Mismo orden de carga (?v=N) — no romper el contrato implícito.
- Salida de examen idéntica. Smoke test antes/después.

## Coherencia con PLAN/
No contradecir la arquitectura objetivo (motor modular). Este split prepara el terreno para
que PLAN/ siga consolidando el PromptBuilder/KnowledgeEngine.

## Implementado (fase 10)
Ver MIGRATION_REPORT.md para rutas exactas y resultados de tests.
