# Vocab P0 reconcile + v2.2 — 2026-07-10

## Tarea 1 — Contradicción P0 vs ChatGPT

**Causa raíz:** los ejemplos (`gartenpflanzen`, `vorgesehenen`, `auszuschalten`, `starteen`) estaban en archivos con stamp **`v2.1-per-question-2026-07-10`** (POST-P0). No era contenido viejo sin reprocesar: **P0 tenía huecos reales**.

| Forma | Archivos (ej.) | Por qué P0 fallaba |
|-------|----------------|--------------------|
| `gartenpflanzen` | `lesen-t5-gemini-026` | Sustantivo en *-en* tratado como infinitivo → sin mayúscula / sin singular |
| `vorgesehenen` | `lesen-t5-026/033/036` | Participio adj. no filtrado; `looksLikeInfinitive` lo dejaba pasar |
| `auszuschalten` | `lesen-t2-096`, `lesen-t5-026` | Infinitivo con *zu* separable no normalizado a `ausschalten` |
| `starteen` | `lesen-t2-057` | Bug `gestartet` → `ge`+`starte`+`en` = **starteen** |

## Fix v2.2 (`VOCAB_TAGS_NORMALIZE_VERSION`)

- Nouns antes que heurística *-en*; capitalización vía hints
- `normalizeZuSeparable` (`auszuschalten` → `ausschalten`)
- STOP ampliado (jedoch, bestimmt*, zweit*, vorgesehen*, …)
- Separables enteros + split (`machen … mit` → `mitmachen`)
- Locuciones (`eine Rolle spielen`, `es geht um`, …)
- Attestation anti-artefacto; dedupe zu/base
- `gestartet` → `starten` (no starteen)

**Reproceso:** 134 verified + 155 ok-lesen → todos `v2.2`. Bad tags restantes: **0**. Dup `ausschalten`+`auszuschalten`: **0**.

Tests: `scripts/lib/__tests__/enrichBatchMetadata.vocab.test.mjs` — 20/20.

## Tareas 5–6 (plantillas)

- `STYLE_ANTI_PATTERNS` inyectado en prompts T1–T5 vía `lesenTemplatePrompt.mjs`
- Plantillas md T1/T2/T5 actualizadas (fuente ficticia + tono emocional)
- Prompts build T1/T2/T5: anti-patrones **presentes**
- Pool actual con patrón: fake-source `lesen-t2-055` (+ ok-lesen `081`); Wunder `lesen-t2-057`
- **No se regeneró con LLM** en esta sesión (coste); la próxima generación T1/T2/T5 ya lleva las reglas. Candidatos a regen: esos 2–3 archivos.

## Tareas 7–8

Documentadas en `BACKLOG.md` (DIFF-SCORE, GRAMMAR-PED) con %.
