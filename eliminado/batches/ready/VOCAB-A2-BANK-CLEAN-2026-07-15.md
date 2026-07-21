# Reconstrucción library/vocab/de/A2.json (2026-07-15)

## Ancla semántica

- **Wortliste oficial Goethe A2** vía DWDS: [wortschatz-goethe-zertifikat/A2](https://zwei.dwds.de/lemma/wortschatz-goethe-zertifikat/A2)
- API A2: `https://www.dwds.de/api/lemma/goethe/A2.json` (**612** entradas)
- API A1 (gap-fill verificado): `https://www.dwds.de/api/lemma/goethe/A1.json` (**849** entradas)
- El banco open-frequency anterior quedó **descartado** (contaminación B1: `boomen`, `anbauen`, `abstimmung`, …).

## Techo operativo

- Banda A2 = `CUMULATIVE_CUTS.A2 - A1` = **600** lemas (acumulado ≤1200)
- Conteo final: **600**
- Lemas con hit DWDS (A1∪A2 API): **581**

## Pipeline

1. Anchor: entradas API A2 no presentes en `A1.json` → **470**
2. Dedupe exacto + ASCII/umlaut (`spaß` > `spass`; **0** fold-duplicados finales)
3. Filtro calidad: c1_c2_only, blacklist, force B1/B2, invalid_shape, in_a1_band
4. Gap-fill priorizado: forceInclude A2 → A2_CORE → partial-seed → pool legado DWDS → DWDS A1 restante
5. Gap-fill añadidos: **130**

## Verificación DWDS

| Muestra | Aciertos | Tasa |
|---------|----------|------|
| Banco completo (n=30) | 30/30 | 100.0% |
| Solo lemas DWDS-sourced (n=30) | 30/30 | 100.0% |
| Duplicados ASCII/diéresis | **0** | — |

### Muestra banco completo

- `wählen` → DWDS ✓ `wählen` pos=Verb genera=—
- `veranstaltung` → DWDS ✓ `veranstaltung` pos=Substantiv genera=fem.
- `wäsche` → DWDS ✓ `wäsche` pos=Substantiv genera=fem.
- `streiten` → DWDS ✓ `streiten` pos=Verb genera=—
- `hängen` → DWDS ✓ `hängen` pos=Verb genera=—
- `sportlich` → DWDS ✓ `sportlich` pos=Adjektiv genera=—
- `einige` → DWDS ✓ `einige` pos=Indefinitpronomen genera=—
- `besichtigen` → DWDS ✓ `besichtigen` pos=Verb genera=—
- `berühmt` → DWDS ✓ `berühmt` pos=partizipiales Adjektiv genera=—
- `leer` → DWDS ✓ `leer` pos=Adjektiv genera=—
- `verschieden` → DWDS ✓ `verschieden` pos=Adjektiv genera=—
- `ander` → DWDS ✓ `ander` pos=Indefinitpronomen genera=—
- `faul` → DWDS ✓ `faul` pos=Adjektiv genera=—
- `erreichen` → DWDS ✓ `erreichen` pos=Verb genera=—
- `appetit` → DWDS ✓ `appetit` pos=Substantiv genera=mask.
- `beschweren` → DWDS ✓ `beschweren` pos=Verb genera=—
- `creme` → DWDS ✓ `creme` pos=Substantiv genera=fem.
- `interview` → DWDS ✓ `interview` pos=Substantiv genera=neutr.
- `malen` → DWDS ✓ `malen` pos=Verb genera=—
- `paar` → DWDS ✓ `paar` pos=Substantiv genera=neutr.
- `notieren` → DWDS ✓ `notieren` pos=Verb genera=—
- `vertrag` → DWDS ✓ `vertrag` pos=Substantiv genera=mask.
- `bahn` → DWDS ✓ `bahn` pos=Substantiv genera=fem.
- `all` → DWDS ✓ `all` pos=— genera=—
- `mitarbeiter` → DWDS ✓ `mitarbeiter` pos=Substantiv genera=mask.
- `fett` → DWDS ✓ `fett` pos=Adjektiv genera=—
- `aufregen` → DWDS ✓ `aufregen` pos=Verb genera=—
- `t-shirt` → DWDS ✓ `t-shirt` pos=Substantiv genera=neutr.
- `anzug` → DWDS ✓ `anzug` pos=Substantiv genera=mask.
- `süß` → DWDS ✓ `süß` pos=Adjektiv genera=—

## Gramática A2 (sin colisión)

Taxonomía A2: Perfekt + Akk/Dativ (`knowledge/languages/german.json`). Sin Passiv, Konjunktiv I ni Relativsätze avanzados.
Gap-fill excluye `forceInclude` B1/B2 y lemas meta `grammar_above_a2`.

## Gap-fill añadidos (top 40)

- `anmeldung` (prioridad 0)
- `aufgabe` (prioridad 0)
- `bedeuten` (prioridad 0)
- `erlauben` (prioridad 0)
- `gehören` (prioridad 0)
- `gemeinsam` (prioridad 0)
- `melden` (prioridad 0)
- `nutzen` (prioridad 0)
- `sondern` (prioridad 0)
- `täglich` (prioridad 0)
- `trennen` (prioridad 0)
- `vorteil` (prioridad 0)
- `zukunft` (prioridad 0)
- `angebot` (prioridad 1)
- `angestellte` (prioridad 1)
- `bestellung` (prioridad 1)
- `firma` (prioridad 1)
- `kunde` (prioridad 1)
- `kundin` (prioridad 1)
- `lager` (prioridad 1)
- `lieferung` (prioridad 1)
- `nachfrage` (prioridad 1)
- `personal` (prioridad 1)
- `transport` (prioridad 1)
- `koffer` (prioridad 2)
- `medien` (prioridad 2)
- `perfekt` (prioridad 2)
- `selten` (prioridad 2)
- `vergleich` (prioridad 2)
- `empfehlen` (prioridad 3)
- `garten` (prioridad 3)
- `kulturell` (prioridad 3)
- `ab` (prioridad 5)
- `abfahrt` (prioridad 5)
- `abfliegen` (prioridad 5)
- `abflug` (prioridad 5)
- `abgeben` (prioridad 5)
- `absender` (prioridad 5)
- `achtung` (prioridad 5)
- `achtzehn` (prioridad 5)

… y 90 más.

## Script

`scripts/reconstruct-a2-goethe-dwds.mjs`

