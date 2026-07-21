# Sprechen partner — level calibration & aiFeatures

## Level-aware partner (B1 / A2)

- **Source of truth:** `netlify/functions/lib/speakingPersonas.js`
- **UI personas:** `js/config/speakingModes.js` (`personalitiesForLevel`)
- **Client sends:** `level: S?.level` on `speaking-chat` start/turn
- **T2:** no partner (transcript only) — unchanged

### A2 vs B1 task format

| Teil | B1 | A2 |
|------|----|----|
| T1 | Gemeinsame Planung | Fragen zur Person (4 Karten, Wechsel 4+4) |
| T2 | Präsentation (solo) | Monolog (solo) |
| T3 | Feedback + Fragen nach T2 | Gemeinsam planen + Termin mit 2 Agenden |

### Persona word caps

| Persona | B1 max words/turn | A2 max words/turn |
|---------|-------------------|-------------------|
| Kim | 12 | 8 |
| Alex | 35 | 20 |
| Leo | 70 | 35 |

## `aiFeatures: false` on `de.A2` — decision (2026-07-20)

**Current behaviour:** `aiFeatures: false` in `data/exams/availability.json` disables:

- Personalized weakness exams (`examGeneration.js`)
- Some vocab-hub AI paths (`vocabHub.js`)

**It does NOT block:**

- Pro Sprechen partner chat (`speaking-chat`) — gated by **Pro plan + `speaking_realtime` credits**
- Post-exam rubric correction (separate credit bucket)

**Decision: keep `aiFeatures: false` for A2; do not block the speaking partner.**

Rationale:

1. `aiFeatures` was introduced for **library-driven personalized generation**, which A2 explicitly disables (`personalized: false`, `curatedOnly: true`).
2. The speaking partner is **curated-exam practice** (official Sprechen T1/T3), aligned with the A2 product surface — not open-ended AI generation from the question bank.
3. Pro + credits already rate-limit cost and access.
4. Blocking partner on `aiFeatures` would hide a paid Pro feature from the only A2 exam path without reducing LLM abuse surface meaningfully.

If we later want a single kill-switch for all LLM on A2, add an explicit flag (e.g. `speakingPartner: true`) rather than overloading `aiFeatures`.
