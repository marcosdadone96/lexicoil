# Q2 REAL + topic strong (a) — 2026-07-10

Mode: **apply**

## Q2 REAL (tarea 1) — claves corregidas

| Archivo | Item | Antes → Después | Paths |
|---------|------|-----------------|-------|
| `lesen-t1-gemini-124.json` | `gen-q-1-41f4b587-5` | Richtig → **Falsch** | needs-regeneration |
| `lesen-t1-gemini-131.json` | `gen-q-1-3b5df4ea-5` | Richtig → **Falsch** | needs-regeneration |
| `lesen-t1-gemini-153.json` | `gen-q-1-d3f64de7-5` | Richtig → **Falsch** | needs-regeneration |
| `lesen-t1-gemini-168.json` | `gen-q-1-9cdb29e6-3` | Richtig → **Falsch** | needs-regeneration + ready/lesen |
| `lesen-t2-gemini-084.json` | `gen-q-2-2b7cec20-3` | c → **b** | needs-regeneration |

## Sample verification (8) before bulk

| File | Verdict |
|------|---------|
| `horen-t1-gemini-001.json` | APPLY Umwelt (Müll Treppenhaus) |
| `horen-t1-gemini-012.json` | APPLY Bildung (Online-Lernen) |
| `horen-t1-gemini-013.json` | OVERRIDE/APPLY per passage (Verkehr/Umwelt/Stadtleben) |
| `horen-t2-gemini-002.json` | OVERRIDE Stadtleben (not Ernährung) |
| `lesen-t1-gemini-075.json` | APPLY Verkehr |
| `lesen-t1-gemini-173.json` | KEEP Gesundheit (FP Freizeit) |
| `lesen-t2-gemini-065.json` | KEEP Reisen (FP Umwelt) |
| `lesen-t5-gemini-054.json` | OVERRIDE Ernährung (not Konsum) |

## Summary (tarea 2)

| Metric | N |
|--------|--:|
| Strong files reviewed | **61** |
| Files with tag changes | **52** |
| KEEP only (detector FP) | **9** |
| Passage findings | 69 |
| Path rows (incl mirrors) | 113 |
| APPLY changed (path rows) | 75 |
| OVERRIDE changed (path rows) | 21 |

Script: `scripts/fix-topic-mismatch-strong-2026-07-10.mjs`

## KEEP (detector FP)

- `lesen-t1-gemini-164.json` `gen-l1-56609157`: keep **Technik** (detected was Freizeit)
- `lesen-t1-gemini-166.json` `gen-l1-8297e7d4`: keep **Arbeit** (detected was Freizeit)
- `lesen-t1-gemini-173.json` `gen-l1-5b6dc8fb`: keep **Gesundheit** (detected was Freizeit)
- `lesen-t1-gemini-181.json` `gen-l1-7d42939c`: keep **Medien** (detected was Freizeit)
- `lesen-t2-gemini-061.json` `gen-l2-4c1435c2a`: keep **Reisen** (detected was Umwelt)
- `lesen-t2-gemini-065.json` `gen-l2-358dc234a`: keep **Reisen** (detected was Umwelt)
- `lesen-t2-gemini-079.json` `gen-l2-831ec385a`: keep **Technik** (detected was Umwelt)
- `lesen-t5-gemini-052.json` `gen-l5-f750c057`: keep **Gesundheit** (detected was Sport)
- `lesen-t5-gemini-066.json` `gen-l5-9c847fa2`: keep **Bildung** (detected was Technik)

## Changes

| File | Passage | Old → New | Action |
|------|---------|-----------|--------|
| `horen-t1-gemini-001.json` | `gen-p-h1-eac46715-s3` | Konsum → **Umwelt** | APPLY |
| `horen-t1-gemini-002.json` | `gen-p-h1-5562f6a3-s1` | Kultur → **Verkehr** | APPLY |
| `horen-t1-gemini-002.json` | `gen-p-h1-5562f6a3-s5` | Kultur → **Arbeit** | APPLY |
| `horen-t1-gemini-004.json` | `gen-p-h1-5522-s5` | Sport → **Ernährung** | APPLY |
| `horen-t1-gemini-006.json` | `gen-p-h1-2290-s5` | Sport → **Bildung** | APPLY |
| `horen-t1-gemini-007.json` | `gen-p-h1-8c1314af-s1` | Verkehr → **Kultur** | APPLY |
| `horen-t1-gemini-007.json` | `gen-p-h1-8c1314af-s3` | Verkehr → **Gesundheit** | APPLY |
| `horen-t1-gemini-008.json` | `gen-p-h1-40543102-s2` | Sport → **Kultur** | APPLY |
| `horen-t1-gemini-009.json` | `gen-p-h1-75f1e7f1-s5` | Gesundheit → **Sport** | APPLY |
| `horen-t1-gemini-012.json` | `gen-p-h1-403eea43-s4` | Arbeit → **Bildung** | APPLY |
| `horen-t1-gemini-013.json` | `gen-p-h1-856641ae-s1` | Ernährung → **Verkehr** | OVERRIDE |
| `horen-t1-gemini-013.json` | `gen-p-h1-856641ae-s2` | Ernährung → **Umwelt** | APPLY |
| `horen-t1-gemini-013.json` | `gen-p-h1-856641ae-s4` | Ernährung → **Stadtleben** | APPLY |
| `horen-t1-gemini-013.json` | `gen-p-h1-856641ae-s5` | Ernährung → **Umwelt** | APPLY |
| `horen-t1-gemini-017.json` | `gen-p-h1-a5cd95df-s2` | Stadtleben → **Verkehr** | OVERRIDE |
| `horen-t2-gemini-002.json` | `gen-p-h2-430e5562-s1` | Wohnen → **Stadtleben** | OVERRIDE |
| `lesen-t1-gemini-075.json` | `gen-l1-2294` | Freizeit → **Verkehr** | APPLY |
| `lesen-t1-gemini-089.json` | `gen-l1-9921` | Sport → **Freizeit** | APPLY |
| `lesen-t1-gemini-130.json` | `gen-l1-d3172d0f` | Freizeit → **Stadtleben** | APPLY |
| `lesen-t1-gemini-138.json` | `gen-l1-e4a28c34` | Freizeit → **Stadtleben** | APPLY |
| `lesen-t1-gemini-139.json` | `gen-l1-fa022359` | Familie → **Freizeit** | APPLY |
| `lesen-t1-gemini-140.json` | `gen-l1-900c752d` | Freizeit → **Stadtleben** | APPLY |
| `lesen-t1-gemini-143.json` | `gen-l1-60cd630d` | Freizeit → **Stadtleben** | APPLY |
| `lesen-t1-gemini-144.json` | `gen-l1-ea42974d` | Wohnen → **Freizeit** | APPLY |
| `lesen-t2-gemini-028.json` | `gen-l2-e932b` | Verkehr → **Bildung** | APPLY |
| `lesen-t2-gemini-029.json` | `gen-l2-f412b` | Sport → **Arbeit** | APPLY |
| `lesen-t2-gemini-030.json` | `gen-l2-g215a` | Arbeit → **Stadtleben** | APPLY |
| `lesen-t2-gemini-034.json` | `gen-l2-a774a` | Bildung → **Gesundheit** | OVERRIDE |
| `lesen-t2-gemini-038.json` | `gen-l2-f777a` | Arbeit → **Verkehr** | APPLY |
| `lesen-t2-gemini-047.json` | `gen-l2-6965b` | Verkehr → **Stadtleben** | APPLY |
| `lesen-t2-gemini-048.json` | `gen-l2-6966b` | Sport → **Bildung** | APPLY |
| `lesen-t2-gemini-052.json` | `gen-l2-4afce3fe-b` | Wohnen → **Bildung** | APPLY |
| `lesen-t2-gemini-056.json` | `gen-l2-61d60ea9a` | Sport → **Verkehr** | OVERRIDE |
| `lesen-t2-gemini-060.json` | `gen-l2-c0a4a40e-a` | Konsum → **Gesundheit** | APPLY |
| `lesen-t2-gemini-060.json` | `gen-l2-c0a4a40e-b` | Konsum → **Bildung** | APPLY |
| `lesen-t2-gemini-062.json` | `gen-l2-69492eda-a` | Konsum → **Gesundheit** | APPLY |
| `lesen-t2-gemini-062.json` | `gen-l2-69492eda-b` | Konsum → **Ernährung** | OVERRIDE |
| `lesen-t2-gemini-063.json` | `gen-l2-a3215fda-1` | Konsum → **Gesundheit** | APPLY |
| `lesen-t2-gemini-064.json` | `gen-l2-f5dd2b2c-1` | Ernährung → **Gesundheit** | OVERRIDE |
| `lesen-t2-gemini-068.json` | `gen-l2-5f6a90a2b` | Freizeit → **Bildung** | APPLY |
| `lesen-t2-gemini-069.json` | `gen-l2-d2f73cdf-2` | Freizeit → **Reisen** | APPLY |
| `lesen-t2-gemini-070.json` | `gen-l2-35e3f56a-2` | Technik → **Bildung** | APPLY |
| `lesen-t2-gemini-071.json` | `gen-l2-1c011fef-b` | Technik → **Bildung** | APPLY |
| `lesen-t2-gemini-073.json` | `gen-l2-0232c450b` | Technik → **Bildung** | APPLY |
| `lesen-t2-gemini-074.json` | `gen-l2-4179686b` | Technik → **Bildung** | APPLY |
| `lesen-t2-gemini-076.json` | `gen-l2-262dcd74a` | Technik → **Verkehr** | OVERRIDE |
| `lesen-t2-gemini-078.json` | `gen-l2-a26eaeea-b` | Technik → **Umwelt** | APPLY |
| `lesen-t2-gemini-080.json` | `gen-l2-03dea0c3a` | Technik → **Bildung** | APPLY |
| `lesen-t2-gemini-080.json` | `gen-l2-03dea0c3b` | Technik → **Verkehr** | OVERRIDE |
| `lesen-t2-gemini-095.json` | `gen-l2-0d078700b` | Gesundheit → **Arbeit** | APPLY |
| `lesen-t4-gemini-002.json` | `gen-l4-55c71c3e` | Freizeit → **Stadtleben** | APPLY |
| `lesen-t4-gemini-006.json` | `gen-l4-92df3345` | Bildung → **Stadtleben** | APPLY |
| `lesen-t4-gemini-030.json` | `gen-l4-849fe147` | Technik → **Bildung** | OVERRIDE |
| `lesen-t4-gemini-031.json` | `gen-l4-c234ed1f` | Familie → **Bildung** | APPLY |
| `lesen-t4-gemini-032.json` | `gen-l4-cfe1e312` | Familie → **Bildung** | APPLY |
| `lesen-t4-gemini-033.json` | `gen-l4-7d1f9527` | Familie → **Sport** | APPLY |
| `lesen-t5-gemini-046.json` | `gen-l5-af60e599` | Freizeit → **Bildung** | OVERRIDE |
| `lesen-t5-gemini-054.json` | `gen-l5-f8a82034` | Gesundheit → **Ernährung** | OVERRIDE |
| `lesen-t5-gemini-060.json` | `gen-l5-2faf8867` | Kultur → **Bildung** | OVERRIDE |
| `lesen-t5-gemini-070.json` | `gen-l5-e8c95797` | Konsum → **Ernährung** | APPLY |

## Conflict check vs pool-verified

Strong set ∩ `batches/ready/pool-verified/` = **∅**. Q2 REAL set also ∅. Safe parallel with pool-verified re-check.
