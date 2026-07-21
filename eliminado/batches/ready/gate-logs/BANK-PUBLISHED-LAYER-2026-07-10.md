# Bank + served — respuestas pendientes + re-escaneo (2026-07-10)

**Solo lectura / dry-run.** No se escribió `questions.json` ni `de_B1.json`.

---

## 1. ¿Por qué el servido no tiene AUD-4b?

**Respuesta: ese pasaje concreto nunca tuvo viñetas `*`/`-` en origen.** No hubo un paso intermedio que las quitara antes de publicar.

| Hecho | Evidencia |
|---|---|
| T5 de `official-de-B1-e1` / `data/exams/de_B1.json` | `passageId = gen-l5-772fcef4` |
| Formato del pasaje | Lista **numerada** `1.  **An- und Abreise:**`, `2.  **Ruhezeiten:**`, … |
| AUD-4b (`*   ` / `- ` al inicio de línea) | **0** en servido |
| AUD-4 (`**…**`) | **Sí** (8 encabezados en negrita) — mismo texto en banco |
| Banco == servido | `gen-l5-772fcef4` idéntico en `questions.json` y `de_B1.json` |

Los **4** pasajes del banco **con** AUD-4b (`gen-l5-bc914684`, `af60e599`, `06ffadec`, `770f7b8d`) usan `*   **Label:**`. **No están** en el examen servido actual. Si se ensamblan en un examen nuevo **sin** pasar por `stripMarkdownLeak`, heredarán el problema.

---

## 2. Recomendación: selectiva (cambio respecto al informe original)

**Cambio de recomendación:** preferir **normalización selectiva de los 16 pasajes AUD-4/4b** (no full-bank sobre 1056 preguntas).

| Enfoque | Pros | Contras |
|---|---|---|
| **Selectiva (recomendado ahora)** | Superficie mínima (16/109 pasajes); mismo `applyGermanCapsNormalize` validado; dry-run revisable | Hay que listar IDs / detectar markdown |
| Full-bank (recomendación original) | Un solo pase operativo | Riesgo de decap colateral en texto ya correcto (visto en Hören con `cap` full); toca ~1056 preguntas sin necesidad |

**Por qué se prefería full antes:** simplicidad operativa (un script, un sync de pool), **no** porque la re-ingesta selectiva tenga un bug conocido de índices/IDs. La alternativa “re-ingestar batches limpios” sigue válida si existen fuentes en `batches/ready/` con el mismo `passageId`, pero para AUD-4/4b basta con strip+decap in-place selectivo.

Script: `scripts/apply-bank-german-caps-v32.mjs` (default selectivo; `--all` opcional; `--apply` no ejecutado).

---

## 3. Re-escaneo con herramientas actuales

Informe: `batches/ready/gate-logs/BANK-CURRENT-GATES-SCAN.md`  
JSON: `batches/ready/gate-logs/bank-current-gates-scan.json`

### Banco (`library/de/B1/questions.json`)

| Gate | Resultado | Notas |
|---|---:|---|
| AUD-4 bold | **16** pasajes | Sin cambio vs diagnóstico original |
| AUD-4b bullets | **4** pasajes | Sin cambio |
| topic_mismatch (detector nuevo) | **2** | Solo 2 pasajes tienen topic B1 canónico derivable |
| topic no escaneable | **107** | 95 con slug legacy `daily_life` (no mapea a B1); 13 sin tags |
| copia literal ≥4 | **16** ítems | 6 opción correcta · 9 pregunta · 1 afirmación RF |
| verb_census V2 | **34** | Hallazgo **nuevo** significativo |

**topic_mismatch (los 2 escaneables):**
- `p-lesen-1` T1 tag=Umwelt → detectado Bildung
- `p-horen-1` T1 tag=Technik → detectado Reisen

**Copia en opción correcta (comparable a Hören T2) — 6 casos:**  
`lb-de-b1-l5`, `lb-de-b1-h1`, `lb-de-b1-h4`, `gen-q-5-0f9283ea-4`, `gen-q-5-3ded8185-1`, `gen-q-5-3ded8185-4` (detalle en JSON).

**V2 muestra:** Essen/Kochen/Wissen/Unternehmen/Glaube capitalizados mid-sentence en varios pasajes/opciones (p. ej. `gen-l1-61b004a3`, `gen-l2-8dfdafc7*`).

### Servido (`data/exams/de_B1.json`)

| Gate | Resultado |
|---|---:|
| AUD-4 | 1 parte T5 (772fcef4) |
| AUD-4b | **0** |
| topic_mismatch | **0** (sin topic B1 útil en parts) |
| copia ≥4 | **0** |
| verb_census V2 | **0** |

### Alcance / orden (no arreglar todo ahora)

1. **AUD-4/4b** — dry-run listo (abajo); apply + republicar T5 servido en tarea aparte.  
2. **Copia literal (6+ opciones)** — cola nueva, patrón wordMatchRepair.  
3. **V2 (34)** — cola nueva, mismo guard que Hören/Lesen backlog.  
4. **topicTags `daily_life`** — deuda de metadatos; el detector no puede auditar el banco hasta remapear.

---

## 4. Dry-run AUD-4/4b (selectivo, sin `--apply`)

```
node scripts/apply-bank-german-caps-v32.mjs
```

| Métrica | Valor |
|---|---:|
| Pasajes en scope | **16** |
| Con cambios | **16** |
| Banco escrito | **No** |

Incluye `gen-l5-772fcef4` (T5 servido: solo bold, sin viñetas) y los 4 con AUD-4b.

Tabla completa: `batches/ready/gate-logs/BANK-AUD4-CAPS-DRYRUN.md`  
JSON: `batches/ready/gate-logs/bank-aud4-caps-dryrun.json`

**Siguiente paso (cuando se autorice):**  
`node scripts/apply-bank-german-caps-v32.mjs --apply` → sync pool → re-publicar e1 T5 → `sync-published-to-served` — **no** en esta tarea.
