# CEFR vocab bank gap-fill — 2026-07-12

## Verification of seed gaps (before)

| Lemma | A1 | A2 | B1 |
|-------|----|----|-----|
| bitten | ✗ | ✗ | ✗ |
| beachten | ✗ | ✗ | ✗ |
| aktuell | ✗ | ✗ | ✗ |
| angenehm | ✗ | ✗ | ✗ |

## Sources

- Cross-check: pool unknowns (`audit-cefr-vocab-level.mjs` over 148 pool-verified files) × `scripts/lib/de-frequency-tiers.mjs` (A1/A2/B1 cores)
- Durable include: `library/vocab/de/_overrides.json` → `forceInclude`
- Rebuild: `node scripts/build-vocab-open.mjs --lang de --write-freq` (also restored full B1 slice 1200; prior B1.json was truncated at 634 real lemmas)

## Added lemmas (curated; not lemmatizer noise)

### A1 (core everyday)
| Lemma | Why ≤B1 / not A2+ only |
|-------|------------------------|
| halten | Basic verb (stop/hold); Goethe A1 |
| zusammen | Core adverb |
| einmal | Core adverb |
| freuen | Basic verb (sich freuen) |

### A2 (daily life / travel / work)
| Lemma | Why A2 not A1/B2 |
|-------|------------------|
| nutzen | Everyday “use”; A2 textbook core |
| gemeinsam | Joint activities; A2 |
| sondern | Coordinator; A2 grammar |
| versuchen | Try; A2 |
| aktiv | Lifestyle/health; A2–B1 borderline → A2 |
| gehören | Belong; A2 |
| melden / anmeldung | Register; A2 bureaucracy light |
| trennen | Separate (recycling); A2–B1 → A2 |
| bedeuten | Mean; A2 |
| packen | Pack (travel); A2 |
| vorteil | Advantage; A2 opinions |
| gerät | Device; A2 household |
| aufgabe | Task; A2 school/work |
| direkt | Direct; A2 |
| täglich | Daily; A2 |
| zukunft | Future; A2 (not B2 abstract) |

### B1 (exam / opinion / household — seed + pool-frequent)
| Lemma | Why B1 not A2 / not B2+ |
|-------|-------------------------|
| bitten | Polite request; Goethe B1 Schreiben |
| beachten | Heed rules; B1 Hausordnung/Lesen T5 |
| aktuell | Current; B1 media/news |
| angenehm | Pleasant; B1 descriptions |
| bieten | Offer; B1 |
| pflegen | Care for / cultivate; B1 |
| achten | Pay attention / respect; B1 |
| schaffen | Manage / create; B1 |
| diskutieren | Discuss; B1 |
| vermitteln | Convey / mediate; B1 |
| positiv | Positive; B1 opinion |
| speziell | Specific; B1 |
| genießen | Enjoy; B1 |
| zentral | Central; B1 |
| verlassen | Leave; B1 |
| nutzung | Usage (noun); B1 |
| heizung | Heating; B1 household |
| bedeutung | Meaning; B1 |
| reinigung | Cleaning; B1 Hausordnung |
| mülltrennung | Waste separation; B1 exam topic |
| sorgfältig | Careful; B1 |
| finanziell | Financial; B1 (not academic Finanz…) |
| aktivität | Activity; B1 |
| erwachsen | Adult; B1 |
| erfolgen | Take place (neutral); B1 admin |
| betreffen | Concern; B1 |
| schritt | Step; B1 |

**Excluded from add** (lemmatizer garbage / declined forms): `staden`, `arbeien`, `vielen`, `sollten`, `unseren`, `großen`, `teur`, etc.

## Re-audit (pool 148)

| Metric | Before | After | Δ |
|--------|--------|-------|---|
| Allow-list ≤B1 | 1798 | 1845 | +47 curated (+ restored B1 band coverage in union) |
| Sum unknown (file×lemma) | 4362 | 3772 | −590 |
| % unknown of unique | 51.8% | 44.8% | **−7.0 pp** |
| % not≤B1 | 51.8% | 44.9% | **−6.9 pp** |

Log: `batches/ready/gate-logs/cefr-vocab-level-audit-2026-07-11.json` (regenerated).
