# Canary report — 2026-07-11

Corrida sin supervisión en vivo. **Nada promovido a `pool-verified`.** Hallazgos documentados sin corregir.

- **Inicio:** `2026-07-11T16:23:02.201Z` (`batches/ready/gate-logs/canary-run-marker-2026-07-11.txt`)
- **Flags:** `--from-coverage --skip-pool-ready --fix-retries 3`
- **Modelo:** `gemini-2.5-flash`
- **Logs de generación:**
  - `batches/ready/gate-logs/canary-generation-2026-07-11.log` (ola 1; archivo quedó bloqueado al final)
  - `batches/ready/gate-logs/canary-generation-retry-2026-07-11.log`
  - `batches/ready/gate-logs/canary-generation-retry2-2026-07-11.log`

---

## 0. Hallazgos nuevos / prioritarios (leer primero)

### BUG A — CHK-14 falsos positivos agresivos (bloquea generación)

CHK-14 sigue marcando como “sustantivo en minúscula” formas que **no** son sustantivos:

| Token marcado | Contexto real | Tipo |
|---|---|---|
| `brauchen` | `…und brauchen einen Gästeausweis` | verbo |
| `glaube` | `Das glaube ich dir` | verbo |
| `leises` | `…und leises Spielen erlaubt` | adjetivo atributivo |
| `kleineren` | `bei kleineren Wohnungsgesellschaften` | adjetivo comparativo |
| `teurere` | `eine teurere Wohnung` | adjetivo comparativo |
| `paar` | `ein paar Ideen` / `ein paar tolle Rezepte` | cuantificador fijo |
| `essen` | `noch das essen` (aquí sí podría ser sustantivo mal capitalizado) | caso mixto |

**Impacto en el canario:** varios temas agotaron fix-retries 3 por este FP (`Familie` L5, `Wohnen`/`Freizeit` H3, intentos fallidos de `Familie` H3). El triaje CUBO A a veces “repara” y re-valida, pero el fallo residual vuelve a bloquear. **No es el mismo FP de adjetivo attributivo que se cerró hoy en Hören T1** — aquí el patrón dominante son verbos (`glaube`/`brauchen`) y `ein paar`.

### BUG B — Lesen T4: seed/debate × topic mismatch (CHK-27) gasta reintentos en vano

Al forzar `--topic Gesundheit` o `--topic Familie`, el generador **repite el mismo debate incompatible** en todos los reintentos:

- `Gesundheit` → debate «Autofreie Innenstadt» (válido solo Verkehr/Umwelt/Stadtleben) × **4 intentos**
- `Familie` → debate «Mehr Geld für Vereine» (válido solo Freizeit/Sport/Kultur) × **8 llamadas / 4 intentos**

No rota el seed pese a CHK-27. **Costo quemado sin archivo:** ~$0.069 (Gesundheit) + ~$0.124 (Familie) ≈ **$0.19**. Esto explica parte del déficit T4: temas “huecos” de stock no son generables hasta alinear el banco de debates con el topic pedido.

### HALLAZGO C — Repetición real de nombres (hueco Medium confirmado)

Sin banco de nombres en Hören T3 (y con set corto en Lesen T4):

- **Hören T3 canary:** `Gesundheit` y `Familie` usan ambos **Anna + Ben**. Solo `Medien` usa Lena/Markus.
- **vs pool Hören T3 (5 archivos):** Anna aparece en 2/5, Ben en 2/5. Los canary Anna/Ben chocan con pool `001`/`002`/`004`.
- **Lesen T4 canary:** solape fuerte de personajes de foro (`Anna`, `Ben`, `Clara`, `David`) **entre** los 3 archivos nuevos y **con** el pool existente (mismos nombres en casi todos los T4 del pool).

Esto es evidencia práctica del hueco de prioridad Media dejado abierto hoy: **sí hay repetición real**, no solo teórica.

### HALLAZGO D — Numeración local colisiona con IDs de pool

`batches/generated/` estaba vacío (o sin estos Teile) al arrancar → los archivos salieron como `*-gemini-001.json`… mientras **pool-verified ya tiene esos mismos nombres con otro contenido**.

| Staging canary | Topic canary | Pool homónimo (NO es el mismo archivo) |
|---|---|---|
| `horen-t3-gemini-001` | Gesundheit | pool `001` = Arbeit |
| `horen-t3-gemini-002` | Familie | pool `002` = Arbeit |
| `horen-t3-gemini-004` | Medien | pool `004` = Kultur |
| `lesen-t4-gemini-001`…`003` | Arbeit/Freizeit/Sport | pool usa 002/006/016/017/019 |
| `lesen-t5-gemini-001`…`003` | Arbeit/Wohnen/Bildung | pool tiene decenas con IDs altos |

**Antes de cualquier promote futuro hay que renumerar.** Promover tal cual sobrescribiría o confundiría el pool.

### HALLAZGO E — POS caps gate apagado (Python ausente)

En generación Lesen aparece de forma recurrente:

> `POS caps gate skipped: Python was not found…`

El canario corrió **sin** ese gate. Cualquier revisión humana debe asumir cobertura incompleta de capitalización vía POS.

### HALLAZGO F — Aperturas Hören T3 muy estereotipadas (sin cruce exacto, sí patrón)

No hay apertura idéntica entre los 9 ni vs pool (criterio first-sentence), pero el molde es casi fijo:

- `Anna: Hallo Ben, …`
- `Anna: Hallo Ben! Wie war dein Wochenende?`
- `Lena: Markus, hast du eigentlich die Nachrichten…`

Confirma que falta banco de aperturas en H3 (junto al de nombres).

---

## 1. Inventario de archivos generados (staging — NO pool)

### Temas elegidos (stock bajo en pool)

| Teil | Stock pool al inicio | Temas pedidos (ola 1) | Temas finales en staging |
|---|---|---|---|
| Lesen T5 | Umwelt×14; varios a 0–3 | Arbeit, Familie, Wohnen | **Arbeit, Wohnen, Bildung** (Familie falló → retry Bildung) |
| Lesen T4 | solo Stadtleben×2, Umwelt×3 | Arbeit, Gesundheit, Freizeit | **Arbeit, Freizeit, Sport** (Gesundheit/Familie fallaron por BUG B) |
| Hören T3 | Arbeit×2; Technik/Kultur/Reisen×1 | Freizeit, Gesundheit, Wohnen | **Gesundheit, Familie, Medien** (Freizeit/Wohnen fallaron; Familie/Medien en retry) |

### Rutas staging (fuente de verdad del canary)

**Lesen T5** — `batches/ready/lesen-t5-staging-2026-07-11-canary/`

| Archivo | Topic | También en |
|---|---|---|
| `lesen-t5-gemini-001.json` | Arbeit | `batches/generated/` + `canary-all-staging-2026-07-11/` |
| `lesen-t5-gemini-002.json` | Wohnen | idem |
| `lesen-t5-gemini-003.json` | Bildung | idem |

**Lesen T4** — `batches/ready/lesen-t4-staging-2026-07-11-canary/`

| Archivo | Topic |
|---|---|
| `lesen-t4-gemini-001.json` | Arbeit |
| `lesen-t4-gemini-002.json` | Freizeit |
| `lesen-t4-gemini-003.json` | Sport |

**Hören T3** — `batches/ready/horen-t3-staging-2026-07-11-canary/`

| Archivo | Topic | Notas |
|---|---|---|
| `horen-t3-gemini-001.json` | Gesundheit | |
| `horen-t3-gemini-002.json` | Familie | Guardado en `generated/`; un intento CLI posterior falló, pero el archivo OK quedó y se retuvo |
| `horen-t3-gemini-004.json` | Medien | Se descartó del staging el `003` (también Medien, Anna/Ben) para no duplicar tema |

**Copia agregada para audits:** `batches/ready/canary-all-staging-2026-07-11/` (9 JSON).

### Temas fallidos (no insistir más allá de fix-retries=3)

| Tentativa | Motivo dominante | Intentos / costo fail |
|---|---|---|
| L5 Familie | CHK-14 FP `leises` | 2 fail calls · ~$0.025 |
| L4 Gesundheit | CHK-27 seed fijo Autofreie Innenstadt | 4 · ~$0.069 |
| L4 Familie | CHK-27 seed fijo Vereine | 8 · ~$0.124 |
| H3 Freizeit | longitud + copia MCQ + CHK-14 `paar` | 4 · ~$0.074 |
| H3 Wohnen | CHK-14 `glaube`/`kleineren` + copia MCQ | 4 · ~$0.083 |

Extra no retenido en staging canary: `batches/generated/horen-t3-gemini-003.json` (Medien, Anna/Ben) — OK de gates pero tema duplicado con `004`.

---

## 2. LanguageTool (`audit-languagetool-de.mjs --dir`)

- **Comando:** `node scripts/audit-languagetool-de.mjs --dir batches/ready/canary-all-staging-2026-07-11 --out batches/ready/gate-logs/lt-canary-2026-07-11.json`
- **Servicio:** `http://127.0.0.1:8010` (Docker `lexicoil-lt` healthy)
- **Resumen:** 9/9 con texto · **7 matches** · 5 archivos limpios · 4 con hallazgos · 0 errores HTTP

### Por archivo

| Archivo | Matches | Reglas |
|---|---|---|
| horen-t3-001 Gesundheit | 1 | `AUSLASSUNGSPUNKTE_LEERZEICHEN` (`hilft...`) |
| horen-t3-002 Familie | 2 | `AUSLASSUNGSPUNKTE_LEERZEICHEN` + `DE_CASE` tras `überlegen… Mit` (posible FP tipográfico/ellipsis) |
| horen-t3-004 Medien | 2 | `FEHLERHAFTES_KOMMA_ALLG` en vocativo `Lena: Markus,` (probable FP) · `MATHE` estilo sobre `Infos` |
| lesen-t4-001/002/003 | 0 | — |
| lesen-t5-001/002 | 0 | — |
| lesen-t5-003 Bildung | 2 | `GERMAN_SPELLER_RULE` `MensaCard` · `EINHEIT_LEERZEICHEN` `20%` |

**Veredicto LT:** nada grave tipo fecha/día; hallazgos menores / varios FP de estilo. Ningún `DE_DATE_WEEKDAY_*` en este lote.

Detalle completo: `batches/ready/gate-logs/lt-canary-2026-07-11.json`.

---

## 3. dateWeekdayGate

- Script ad-hoc sobre los 9 usando `runDateWeekdayGate` (año calendario actual).
- **Resultado: 0 findings en los 9 archivos.**
- Artefacto: `batches/ready/gate-logs/dateweekday-canary-2026-07-11.json`

(Estos Teile tienen pocas fechas absolutas tipo “Montag, den 15. Mai”; el gate está sano pero poco ejercitado aquí.)

---

## 4. Escaneo de nombres y aperturas

Artefacto: `batches/ready/gate-logs/canary-names-openings-2026-07-11.json`

### 4.1 Hören T3 — nombres

| Archivo | Topic | Hablantes |
|---|---|---|
| 001 | Gesundheit | Anna, Ben |
| 002 | Familie | Anna, Ben |
| 004 | Medien | Lena, Markus |

- **Entre canary:** Anna+Ben compartidos por 001↔002.
- **vs pool Hören T3:** Anna/Ben también en pool 001/002/004; Lena en pool 003 (Technik).

### 4.2 Lesen T4 — nombres de foro (preguntas `Ist <Name>…`)

| Archivo | Topic | Nombres |
|---|---|---|
| 001 | Arbeit | Ben, David, Finn, Anna, Eva, Clara, Greta |
| 002 | Freizeit | Anna, Gustav, Emil, Fiona, Clara, David, Ben |
| 003 | Sport | Lena, Julia, David, Clara, Markus, Peter, Sophie |

Solapes canary↔canary: **Anna, Ben, Clara, David** (001↔002); **Clara, David** (001/002↔003).

Solapes vs pool T4: mismos nombres recurrentes (`Anna`, `Ben`, `Clara`, `David`, `Lena`, `Greta`, …) en prácticamente todos los T4 verificados.

### 4.3 Lesen T5

Sin diálogos de personajes; “nombres” detectados son rótulos de reglamento (`Bezahlung`, `Öffnungszeiten`, …) — **no cuentan** como repetición de personajes.

### 4.4 Aperturas (primera frase)

| Archivo | Apertura (recortada) |
|---|---|
| H3-001 | `Anna: Hallo Ben, wie geht's dir?` |
| H3-002 | `Anna: Hallo Ben! Wie war dein Wochenende?` |
| H3-004 | `Lena: Markus, hast du eigentlich die Nachrichten heute Morgen gesehen?` |
| L4-001 | `In vielen Firmen wird über neue Arbeitsmodelle gesprochen.` |
| L4-002 | `In unserer Stadt gibt es einen neuen Vorschlag: …` |
| L4-003 | `Die Stadtverwaltung diskutiert einen neuen Vorschlag: …` |
| L5-001 | `Liebe Mitarbeiterinnen und Mitarbeiter, …` |
| L5-002 | `Willkommen in der Wohnanlage 'Grüne Oase'.` |
| L5-003 | `1. Öffnungszeiten: Die Mensa ist montags bis freitags geöffnet.` |

- **Cruce exacto/near entre los 9:** ninguno.
- **Cruce exacto vs pool mismo Teil:** ninguno.
- **Patrón:** L4-002/003 comparten molde “nuevo Vorschlag / Stadt…” (no idéntico). H3-001/002 comparten molde Anna→Ben saludo.

---

## 5. Costo (`report-generation-cost.mjs --since 2026-07-11T16:23:02.201Z`)

Artefactos:

- `batches/ready/gate-logs/canary-cost-2026-07-11.json`
- `batches/ready/gate-logs/canary-cost-detail-2026-07-11.json`
- Log crudo: `batches/ready/gate-logs/generation-cost.jsonl`

Precios: input **$0.30/1M** · output **$2.50/1M** (candidates + thoughts).

### Totales de la ventana canary

| Métrica | Valor |
|---|---|
| Llamadas logueadas | **62** |
| Marcadas ok / fail (por llamada flush) | 14 / 48 · éxito llamada **22.6%** |
| **Costo total** | **~$0.900** |
| Costo en llamadas ok | ~$0.187 |
| Costo en llamadas fail | ~$0.713 (**79% del gasto en fallos**) |
| Tokens | prompt 279977 · candidates 102754 · thoughts 223769 |

### Por Teil

| Teil | Calls | ok | fail | Costo |
|---|---|---|---|---|
| lesen-t5 | 28 | 7 | 21 | ~$0.282 |
| lesen-t4 | 16 | 3 | 13 | ~$0.247 |
| horen-t3 | 18 | 4 | 14 | ~$0.372 |

### Por tema (éxito de archivo final vs fallos)

| Tema | Outcome | Calls | Costo | Notas |
|---|---|---|---|---|
| L5 Arbeit | **OK** → 001 | 3 | ~$0.035 | 2 fail CHK-14 `brauchen` antes de OK |
| L5 Wohnen | **OK** → 002 | 3 | ~$0.019 | |
| L5 Bildung | **OK** → 003 | 20 | ~$0.203 | caro: CHK-29 moldes + calidad; muchas regeneraciones |
| L5 Familie | **FAIL** | 2 | ~$0.025 | CHK-14 `leises` |
| L4 Arbeit | **OK** → 001 | 1 | ~$0.015 | |
| L4 Freizeit | **OK** → 002 | 2 | ~$0.023 | 1 fail léxico B2+ |
| L4 Sport | **OK** → 003 | 1 | ~$0.015 | |
| L4 Gesundheit | **FAIL** | 4 | ~$0.069 | BUG B |
| L4 Familie | **FAIL** | 8 | ~$0.124 | BUG B |
| H3 Gesundheit | **OK** → 001 | 3 | ~$0.071 | |
| H3 Familie | **OK** → 002 | 5 | ~$0.106 | 1 ok file + fails CHK-14/calidad |
| H3 Medien | **OK** → 003+004 | 2 | ~$0.038 | staging retuvo solo 004 |
| H3 Freizeit | **FAIL** | 4 | ~$0.074 | |
| H3 Wohnen | **FAIL** | 4 | ~$0.083 | |

**Costo aproximado por archivo exitoso retenido en staging (9):** orden ~$0.02–$0.11 según dificultad; el promedio “total/$9” (~$0.10) está inflado por fallos y por Bildung (20 calls).

**Señal operativa:** ~$0.71 de $0.90 se fueron a fallos; los dos mayores sumideros evitables son **BUG B (T4 seed)** y **CHK-14 FP**, más **CHK-29** en Bildung×T5.

---

## 6. Notas de proceso / ops

1. Primera ola sin `--from-coverage` falló al instante (CLI exige coverage/bank/words) — corregido; no gastó API.
2. El log principal quedó con lock de proceso; retries usaron logs `*-retry*.log`.
3. Numeración `001…` en `generated/` **no** es segura frente a pool (Hallazgo D).
4. No se ejecutó `finalizePoolReady` / promote. Staging + `canary-all` son el único entregable de contenido.

---

## 7. Checklist diferida sugerida (sin ejecutar ahora)

- [ ] Triage CHK-14: whitelist verbos frecuentes (`glauben`/`brauchen`/…) + `ein paar` + adjetivos `-er/-en` post-determinante (extender el fix de hoy).
- [ ] T4: al fallar CHK-27, **cambiar seed/debate** o filtrar seeds por topic **antes** del prompt.
- [ ] Banco de nombres (+ aperturas) Hören T3; valorar el mismo para Lesen T4 (set actual ~10 nombres se recicla).
- [ ] Renumber canary antes de cualquier promote; no reutilizar IDs de pool.
- [ ] Instalar/activar Python para POS caps gate en la máquina de generación.
- [ ] Revisar LT menores (MensaCard, `20%`, ellipsis) si se quiere pulir estilo antes de pool.
- [ ] Decidir destino de `horen-t3-gemini-003.json` (Medien duplicado, no está en staging canary).

---

## 8. Índice de artefactos

| Qué | Dónde |
|---|---|
| Staging T5/T4/H3 | `batches/ready/*-staging-2026-07-11-canary/` |
| Staging agregado | `batches/ready/canary-all-staging-2026-07-11/` |
| Este reporte | `batches/ready/gate-logs/canary-report-2026-07-11.md` |
| LT | `batches/ready/gate-logs/lt-canary-2026-07-11.json` |
| Fechas | `batches/ready/gate-logs/dateweekday-canary-2026-07-11.json` |
| Nombres/aperturas | `batches/ready/gate-logs/canary-names-openings-2026-07-11.json` |
| Costo | `batches/ready/gate-logs/canary-cost-2026-07-11.json` + `canary-cost-detail-2026-07-11.json` |
| Marker | `batches/ready/gate-logs/canary-run-marker-2026-07-11.txt` |
| Rejects (ej.) | `batches/generated/.rejected/lesen-t4-gemini-002-*.json`, `lesen-t4-gemini-003-*.json` |
