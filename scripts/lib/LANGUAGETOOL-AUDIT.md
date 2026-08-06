# LanguageTool audit — LexiCoil

## Decisión de integración (2026-07-12)

| Capa | Modo | Motivo |
|------|------|--------|
| **Generación nueva** | **Advisory only** (nunca bloquea) | Docker LT puede estar caído; no puede ser el único SPOF que pare toda la fábrica. Soft-skip con log `[LT advisory] skipped`. |
| **Pool / lote** | **Auditoría periódica** (`npm run audit:languagetool`) | Barrido completo report-only → `batches/ready/gate-logs/languagetool-audit-*.json` para revisión humana. |
| **Fecha/día** | Gate determinista (`dateWeekdayGate`) | Misma señal que `DE_DATE_WEEKDAY_CURRENTYEAR` sin Docker. |

**Trade-off:** bloquear gen con LT daría recall más fuerte, pero acoplaría el pipeline a un servicio externo frágil. Advisory + MUST_CATCH + audit semanal/por lote cubre detección permanente sin detener generación.

## Setup

```bash
docker run -d --name lexicoil-lt -p 8010:8010 erikvl87/languagetool
# wait until healthy:
curl http://127.0.0.1:8010/v2/languages
```

## Comandos

```bash
npm run audit:languagetool
npm run audit:languagetool -- --dir batches/ready/pool-verified --out batches/ready/gate-logs/languagetool-audit-$(date +%Y-%m-%d).json
npm run test:languagetool-must-catch
npm run test:languagetool-must-catch -- --require-live   # falla si LT down
```

## Ruido vs señal

Excluidos del advisory / MUST_CATCH live: `WHITESPACE_RULE`, ellipsis/space prefs, colloquial (`DRAUF`, `MATHE`, …). Ver `LT_NOISE_RULE_IDS` en `scripts/lib/qualityGates/languageToolGate.mjs`.

## Groundtruth

`scripts/lib/__tests__/languagetoolGate.groundtruth.json` — 58 hallazgos reales del audit completo 2026-07-11 (171 − whitespace/style) + hallazgos reales posteriores no duplicados.
