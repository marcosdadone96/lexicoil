# Limpieza library/vocab/de/B1.json (2026-07-10)

## Causa raíz

`scripts/build-vocab-open.mjs` → `readLegacyPool()` mezclaba **todos** los niveles
(`knowledge/cefr/vocab/de/{A1…C2}.json`) como filler alfabético en la lista ranked.
El slice B1 (`ranked[1200:2400]`) absorbía lemas C1/C2 (p. ej. `morphologie`, `hegemonie`).

`vocab-coverage-report.mjs` solo escribe `weak-de_B1.json` desde ese banco —
**0 lemas fuera de B1.json**; la basura venía del banco mismo.

## Acciones (2026-07-10)

- Entradas antes: 1200 (únicos 693)
- Tras clean: 632–634
- Eliminados: `c1_c2_only` ~55–57, `blacklist` 7, `duplicate` ~504
- Fix origen: `readLegacyPool(lang, maxLevel)` + filler ≤B1 separado de C1/C2
- Whitelist en `filterPromptTargetWords` / `sanitizePromptTargetWords`

## Lemas eliminados (c1_c2_only) — ver `_overrides.json` exclude

(Lista histórica en gate-logs / overrides exclude: morphologie, hegemonie, ästhetik, …)

---

# Reconstrucción 2026-07-12 (descarta rebuild con pads)

## Qué se descartó

El rebuild `build-vocab-open --write-freq` (634→1200) era **555 pads** + reshuffle;
perdió 33 lemas buenos del clean. No se usa como base.

## Qué se hizo

1. `git show HEAD:library/vocab/de/B1.json` → criterio clean (dedupe / c1_c2_only / blacklist / no pads) → **634**
2. + **48** gap-fill curadas (ninguna ya estaba en el clean) → **682**
3. Re-clean → **682** (0 removidos: sin pads, sin dupes, sin fugas C1/C2)
4. A1/A2 restaurados desde HEAD (deshacer contaminación del rebuild)
5. Script: `scripts/reconstruct-b1-clean-plus-gapfill-2026-07-12.mjs`

## Conteos

| Estado | Lemas reales | Pads |
|--------|--------------|------|
| Clean 2026-07-10 | 634 | 0 |
| + gap-fill 48 | 682 | 0 |
| Final post re-clean | **682** | **0** |

## Lost-33 recuperadas

genehmigen, handy, besitzen, räume, küche, groß, entscheidung, gemüse, ernte, engagement, ehrenamt, dokumente, therapie, verein, lehrerin, unterstützung, verkehrsmittel, urlaub, regionen, region, kulturell, partner, veränderung, viertel, kündigen, hobby, backen, wald, gehen, stress, kopf, reisen, umwelt — **33/33 presentes**.

## CEFR re-audit (pool 148)

Allow-list filtra pads siempre → el −7 pp del rebuild con pads **no estaba inflado por pads**.

| | Allow ≤B1 | % unknown |
|--|-----------|-----------|
| Antes gap-fill (B1=634) | 1798 | 51.8% |
| Banco limpio 634+48 (ahora) | **1846** | **44.8%** (−7.0 pp) |
