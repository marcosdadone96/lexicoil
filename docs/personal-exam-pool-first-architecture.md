# Arquitectura pool-first para exámenes personalizados (Lesen B1 DE)

Documento de diagnóstico y propuesta para handoff a implementación.  
**Objetivo:** máxima fiabilidad para el usuario — servir **siempre al instante** desde pool indexado (tema + vocabulario), con generación **por detrás** (sin espera, sin revisión humana en caliente).

**Fecha de referencia:** datos del seed `library/reusable-seed/de_B1.json` y scripts `pool-health-report`, `hybridExamPlan`, `partIndex.buscar` (julio 2026).

**Alcance ampliado (julio 2026):** **tres contadores** (12 Prüfungen / 24 Übungen personal / 40 AI-Credits), personal pool **sin créditos IA**, módulos combinables, Opción B (~$6–8), dimensionamiento pool ↔ Bucket B, anti-repetición (al final).

---

## 1. Problema de raíz (estado actual — arquitectura B)

### Generación en vivo (híbrido)

- El usuario espera **hasta ~4×55s** (pool + T3/T4/T5 live).
- **Netlify cap 60s** por llamada; T1/T2 lentos; fallos de delivery gate → fallback pool opaco.
- Validación tardía puede **rechazar o sustituir** el examen que el usuario ya veía.
- Coste API **por usuario**; fiabilidad **baja-media**.

### Hallazgo T3 (no es calidad Gemini)

- **T3 live = `make-t3.mjs`** (determinista, 0 API), no Gemini.
- El batch crudo **sí contiene 10 anuncios** en `questions[].options[]` (`A) …` … `J) …`).
- Fallo era **conversión** (`part.ads[]` vacío) — reparable con `coalesceLesenAdsMatchingPart` (ya implementado).
- **T2/T4/T5 live = Gemini**; fallos mezclan gate de calidad, timeout y fallback.

### Propuesta A — Pool es el producto

| | A: Pool instantáneo + relleno background | B: Híbrido en vivo (actual) |
|---|------------------------------------------|------------------------------|
| Fiabilidad UX | **Alta** | Baja-media |
| Calidad | Solo entra lo gateado | Variable |
| Personalización | Mejor match del pool | Texto a medida (si funciona) |
| Coste/usuario | ~0 API | Alto |
| Espera | Segundos | Minutos |

**Conclusión:** A es la arquitectura más fiable si aceptamos:  
*personalizado = el mejor examen del pool para tu vocab + tema*, no *generado en el acto*.

---

## 2. Estado del pool HOY (Lesen B1 DE)

### 2.1 Stock por Teil (cualquier tema)

| Teil | Verificadas | Limpias (POOL-2) |
|------|-------------|------------------|
| T1 | 61 | 5 |
| T2 | 20 | 5 |
| T3 | 12 | 5 |
| T4 | 58 | 6 |
| T5 | 22 | 8 |

Hay stock **global** en todas las celdas Teil; el cuello de botella es **tema + vocab**, no volumen bruto.

### 2.2 Stock por tema (topicTag estricto)

Celdas = `(tema canónico × Teil 1–5)`. Total teórico: **16 temas × 5 = 80 celdas**.

Solo **3 temas** tienen ≥1 parte etiquetada en **cada** Teil hoy:

| Tema | T1 | T2 | T3 | T4 | T5 |
|------|----|----|----|----|-----|
| Technik | 4 | 3 | 1 | 4 | 4 |
| Bildung | 7 | 1 | 2 | 8 | 1 |
| Ernährung | 2 | 2 | 1 | 18 | 2 |

**Umwelt** (ejemplo frecuente): T1:2, T2:2, **T3:0**, T4:2, T5:1 → **no puede montar 5 Teile tema-coherentes** sin fallback.

### 2.3 Vocabulario + tema (buscar)

`partIndex.buscar()` exige:

- `topicTag` exacto (normalizado B1), y
- **≥1 palabra** del deck del usuario presente en `part.vocabIndex`.

Ejemplo Umwelt + palabras típicas: hits por Teil ≈ T1:1, T2:1, **T3:0**, T4:0, T5:1.

`assembleModuleFromPool` marca `missingTeile` si no hay parte para un Teil.

### 2.4 Curación vs pool de partes

- **Pool de partes** (`reusable-seed`, `exam-part.js`): 173 Lesen verificadas — base del personal híbrido.
- **Exámenes curados completos** (`library/curated`, `exam-pool`): 3 curated + 5 official published — otra capa (Official/Practice), no sustituye celdas tema×Teil.

---

## 3. ¿Cuánto contenido mínimo hace falta?

### 3.1 Definición de “abastecer” (criterios de producto)

Propuesta acordada con el producto:

1. Usuario elige **tema B1** (ej. Umwelt) y **N palabras** del deck (ej. 10).
2. El sistema sirve **5 Teile Lesen al instante** desde pool.
3. **No bloquear** si solo 4–5 palabras aparecen en el examen → **aviso honesto** (`PersonalExamCoverage`: “Dein Examen nutzt X deiner Y Wörter”).
4. **Sí bloquear/fallback** solo si falta un Teil entero (no hay parte en la celda `(tema, teil)`).

### 3.2 Tres niveles de stock (por celda = tema × Teil)

| Nivel | Partes limpias/celda | Total Lesen | Para qué sirve |
|-------|----------------------|-------------|----------------|
| **Mínimo estructural** | **1** | **80** | 1 examen tema-coherente por tema; repetición al 2.º examen del mes |
| **Operativo** | **3** | **240** | ~3 exámenes/mes mismo tema (usuario típico con rotación) |
| **Pro mensual (Tier A)** | **12** | **360** (6 temas × 5 × 12) | 12 exámenes/mes **sin repetición** en un tema Tier A |
| **Cómodo** | **5** | **400** | Margen multi-usuario; ver §10 |

> **Nota cuota Pro:** el target **3/celda** cubre usuarios medios; el target **12/celda** en Tier A es el que cumple la promesa de **12 exámenes/mes sin repetir** (§7–§10).

Estos números son **solo Lesen B1**. Hören/Schreiben/Sprechen suman celdas aparte (§9).

### 3.3 Mínimo para vocab + tema (la pregunta clave)

El vocab del usuario es **libre** (cualquier lemma del deck). No se puede garantizar 10/10 palabras con stock finito unless:

- generáis partes con **listas lemma objetivo por tema**, o
- relajáis el filtro de serve a **tema primero, vocab como ranking** (no hard filter).

**Modelo recomendado (viable):**

| Regla de serve | Mínimo por celda | Comportamiento vocab |
|----------------|------------------|----------------------|
| **Serve** | 1 parte limpia con `topicTag` correcto | Elegir la de mayor overlap vocab (`buscar`); si overlap=0, **igual servir** parte del tema + aviso “0 de tus N palabras en este Teil” |
| **Warn** | — | Examen completo con ≥1 palabra total: toast/banner X/N (ya existe) |
| **Fail** | 0 partes en celda | Solo aquí: Teil faltante o examen incompleto |

Con este modelo, el **mínimo duro = 80 partes** (1×80 celdas), todas:

- `complete: true`, `verified: true`
- Pasan **POOL-2** (`isPartPoolReady`, semantic:false)
- `topicTag` canónico explícito (no `_untagged`)
- `vocabIndex` poblado (`applyPartIndex` al ingest)

**Para que 4–5/10 palabras sea habitual (no suerte):** por celda **3 partes** con **lemmas distintos** del glosario del tema (ver §5). Eso sube el target operativo a **240 partes** con diversidad lexical.

### 3.4 ¿Es viable?

| Pregunta | Respuesta |
|----------|-----------|
| ¿Viable técnicamente? | **Sí** — `assembleModuleFromPool`, `exam-part`, `buscar`, gates ya existen |
| ¿Viable con pool actual? | **Parcial** — 3/16 temas cubren 5 Teile; Umwelt y la mayoría no |
| ¿Viable sin generación background? | **No** — hace falta rellenar ~77 celdas deficitarias mínimo (80 − 3 temas ya OK parcialmente) |
| ¿Coste generación 80 partes? | T3 barato (make-t3); T1/T4/T5 vía Gemini batch; estimación orden: **decenas de $** one-off + cron, vs **$ por usuario** en vivo |

---

## 4. Temas B1 — lista canónica y priorización

### 4.1 Lista cerrada (16 temas — `js/data/b1Topics.js`)

Reisen · Gesundheit · Arbeit · Technik · Medien · Wohnen · Konsum · Bildung · Familie · Umwelt · Ernährung · Kultur · Sport · Freizeit · Verkehr · Stadtleben

### 4.2 Temas más típicos (prioridad de relleno)

**Tier A — Goethe / knowledge B1 core** (generar primero):

| Canónico | Alias knowledge / prompts |
|----------|-------------------------|
| **Umwelt** | Umwelt und Nachhaltigkeit |
| **Gesundheit** | Gesundheit und Ernährung |
| **Arbeit** | Arbeit und Beruf |
| **Bildung** | Bildung und Lernen |
| **Technik** | Technologie im Alltag |
| **Reisen** | Reisen und interkulturelle Begegnungen |

**Tier B — resto B1** (16 temas): Medien, Wohnen, Konsum, Familie, Ernährung, Kultur, Sport, Freizeit, Verkehr, Stadtleben

**Tier A mínimo producto:** 6 temas × 5 Teile × 1 parte = **30 partes** para demo creíble de “elige tema + vocab”.  
**Tier A operativo:** 6 × 5 × 3 = **90 partes**.  
**Completo B1 operativo:** 16 × 5 × 3 = **240 partes**.

### 4.3 Estado actual Tier A (partes verificadas con `topicTag`)

Conteo por celda `(tema × Teil)` en `library/reusable-seed/de_B1.json` (julio 2026):

| Tema | T1 | T2 | T3 | T4 | T5 | Total | ¿5 Teile? |
|------|----|----|----|----|-----|-------|-----------|
| **Umwelt** | 2 | 2 | **0** | 2 | 1 | **7** | ❌ T3=0 |
| **Gesundheit** | 0 | 0 | 0 | 0 | 1 | **1** | ❌ |
| **Arbeit** | 2 | 0 | 1 | 0 | 2 | **5** | ❌ T2,T4 |
| **Bildung** | 6 | 1 | 2 | 6 | 1 | **16** | ✅ (T2/T5 escasos) |
| **Technik** | 4 | 3 | 1 | 3 | 4 | **15** | ✅ |
| **Reisen** | 2 | 2 | **0** | 1 | **0** | **5** | ❌ T3,T5 |
| **Total Tier A** | | | | | | **49** | 2/6 temas OK |

**Huecos críticos para generación inmediata:** Umwelt T3, Reisen T3/T5, Gesundheit T1–T4.

**Nota:** hay ~154 partes Lesen etiquetadas en los 16 temas, pero **distribución desigual**. Schreiben tiene 10 partes limpias/Teil sin `topicTag` (retaggeables). **Sprechen: 0 partes etiquetadas.**

---

## 5. Cómo implementarlo

### 5.1 Flujo usuario (arquitectura A)

```
Usuario: tema + palabras deck + Lesen
    ↓
exam-plan (modo pool-only): 5 celdas (tema, T1..T5)
    ↓
Por cada Teil: exam-part / buscar
  - Filtrar topicTag
  - Rankear por overlap vocab (no exigir overlap>0 para servir)
  - excludeIds / servedCount (no repetir — hoy parcial; ver §8.9 ServedPartsRegistry)
    ↓
assembleModuleFromPool → normalizeExam → renderExam (<3s)
    ↓
PersonalExamCoverage → toast "X de Y Wörter" (warn, no block)
```

**Desactivar:** `exam-hybrid-execute`, live Gemini en personal Lesen, progressive reveal híbrido.

**Flags existentes:** `EXAM_POOL_ONLY`, `assembleModuleFromPool`, `isExamPoolOnly()`.

### 5.2 Flujo background (relleno pool)

```
Cron diario (netlify scheduled function — patrón stripe-reconcile)
    ↓
pool-health-report --target 3
    ↓
Lista celdas deficitarias (module, teil, theme) orden stock ASC
    ↓
Por celda deficit:
  - T3 → make-t3 + buildLesenT3SeedRecord + --words <lemmas del tema>
  - T1/T4/T5 → generateLesenPart (Gemini) con topic + vocab list en prompt
  - T2 → scan batches/generated o Gemini split
    ↓
isPartPoolReady (POOL-2; SEM-1 opcional en background)
    ↓
applyPartIndex (topicTag + vocabIndex)
    ↓
Ingest exam-part POST / seed merge
```

**Scripts reutilizables hoy:**

| Script / módulo | Rol |
|-----------------|-----|
| `pool-health-report.mjs` | Detectar déficits |
| `fill-pool-deficit-b1.mjs` | Rellenar L2+L3 (ampliar a T1/T4/T5) |
| `generate-lesen-part-gemini.mjs` / `factory-lesen.mjs` | Generación batch |
| `make-t3.mjs` | T3 determinista |
| `audit-pass-2.mjs` / `isPartPoolReady` | Gate calidad |
| `partIndex.applyPartIndex` | Indexación |
| `hybridExamPlan.countTeilInventory` | Priorizar celdas vacías |

**No existe aún:** orquestador scheduled único que una los pasos.

### 5.3 Cambio de política vocab (1 línea de producto)

Hoy `buscar` descarta partes con `score <= 0`. Para pool-first:

```text
Si topicTag match y hay stock → servir mejor parte del tema
Avisar coverage X/N; no rechazar examen por vocab parcial
```

Opcional: umbral soft — warn si `found < ceil(N*0.4)` (4/10).

### 5.4 Migración B → A (coste)

| Esfuerzo | Trabajo |
|----------|---------|
| **Pequeño (días)** | Personal Lesen = pool-only; mensaje cobertura; desactivar hybrid live |
| **Medio (1–2 sem)** | Cron déficit; ampliar fill a 6 temas Tier A; 1 parte/celda mínimo |
| **Grande (1–2 mes)** | 240 partes operativas; SEM-1 background; métricas servedCount |

**No es rewrite** — es cambio de producto + job batch. ~70% código reutilizado.

---

## 6. Opciones de producto personalizado (viables)

**Principio clave:** no se genera por combinación `usuario × vocab` (imposible escalar). Se generan **partes por celda `(tema × Teil)`** con **listas rotativas de lemmas del tema**; el deck del usuario solo **rankea** qué parte servir.

### 6.1 Cuatro opciones comparadas

| Opción | Alcance | Exámenes/mes mismo tema (sin repetir) | Satisfacción vocab (palabras **del tema**) | Satisfacción vocab (deck **aleatorio**) | Cuándo elegirla |
|--------|---------|----------------------------------------|--------------------------------------------|----------------------------------------|-----------------|
| **A — MVP Lesen** | Lesen, Tier A, 4/celda | ~4 | **4–6/10** | 2–3/10 | Lanzar rápido; validar pool-first |
| **B — Recomendada** | Lesen+Hören vocab · Schreiben+Sprechen sin vocab | ~6 (Lesen+Hören) | **5–7/10** (L+H) | 3–4/10 | Mejor equilibrio coste/UX |
| **C — Usuario medio** | 16 temas, 3/celda Lesen+Hören | ~3 | **3–5/10** | 2–3/10 | Muchos usuarios; rotación de temas |
| **D — Power user** | Lesen Tier A, 12/celda | **12** | **6–8/10** | 3–5/10 | Solo si prometes 12/mes sin repetir en 1 tema |

**Recomendación de producto:** **Opción B** — Track A (Lesen+Hören con vocab) + Track B (Schreiben+Sprechen genéricos por tema + IA).

### 6.2 Palanca UX que multiplica satisfacción (sin más stock)

Al elegir tema, sugerir: *„Wähle Wörter aus deinem Deck, die zum Thema passen.“*  
Si 0/10 palabras: servir examen del tema igualmente + aviso (`PersonalExamCoverage`).

---

## 7. Plan de generación — cuánto crear y cuánto cuesta

Cifras calculadas contra el seed actual (`de_B1.json`, julio 2026): **partes verificadas con `topicTag`**.  
“**A generar**” = gap hasta alcanzar el target por celda.

### 7.1 Partes nuevas a generar — Tier A (6 temas)

| Target/celda | Lesen (6×5 celdas) | Hören (6×4) | Schreiben (6×3) | Sprechen (6×3) | **Total partes** |
|--------------|-------------------|-------------|-----------------|----------------|------------------|
| **3/celda** | 49 | 33 | 46 | 54 | **182** |
| **4/celda** | 75 | 53 | 64 | 72 | **264** |
| **6/celda** | 131 | 99 | 100 | 108 | **438** |
| **12/celda** (solo Lesen) | 311 | — | — | — | **311** |

**Opción B desglosada (targets concretos):**

| Módulo | Target | Partes a generar | Notas |
|--------|--------|------------------|-------|
| Lesen | 6/celda Tier A | **131** | Prioridad: Umwelt T3, Gesundheit, Reisen T3/T5 |
| Hören | 4/celda Tier A | **53** | Lemmas en transcript; mismo `topicTag` |
| Schreiben | 3/celda Tier A | **46** | Prompts por tema; **sin** `vocabIndex` obligatorio |
| Sprechen | 3/celda Tier A | **54** | Tareas genéricas; pool hoy = 0 etiquetado |
| **Total Opción B** | | **284** | Schreiben: 10/Teil existentes sin tag → retaggear antes de regenerar |

### 7.2 Partes nuevas — 16 temas completos (Opción C)

| Target/celda | Lesen (16×5) | Hören (16×4) | Schreiben (16×3) | Sprechen (16×3) |
|--------------|--------------|--------------|------------------|-----------------|
| **3/celda** | 136 | 117 | 120 | 144 |
| **4/celda** | 204 | 174 | 166 | 192 |

### 7.3 Estrategia de vocabulario por tema (no por usuario)

Por cada parte nueva en **Track A** (Lesen/Hören):

1. **`topicTag`** canónico (ej. `Umwelt`).
2. **`vocabIndex`**: **5–8 lemmas** del glosario B1 del tema (`library/vocab/de/B1.json` — ~40–50 lemmas/tema).
3. **Rotación por celda:** en `(Umwelt, T1)` con **N partes**, cubrir **~25–30 lemmas distintos** en total (solapamiento intencional).

| Partes/celda | Lemmas únicos en 5 Teile del examen | Hit rate vocab (palabras **del tema**) | Hit rate (deck **aleatorio**) |
|--------------|-------------------------------------|----------------------------------------|-------------------------------|
| **3** | ~15–20 | **4–5/10** | 2–3/10 |
| **6** | ~25–30 | **5–7/10** | 3–4/10 |
| **12** | ~35–40 | **6–8/10** | 3–5/10 |

**Generación en batch:** usar `--words` / `pickTargetWords` con lemmas rotados del tema en cada job (`generate-lesen-part-gemini.mjs`, `make-t3.mjs` con `--words`).

**Track B** (Schreiben/Sprechen): solo `topicTag` en el prompt; corrección vía `writing_correction` / `canUseSpeakingAi`.

### 7.4 Estimación de coste (Gemini batch, one-off)

Modelo del repo: `GEMINI_EST_USD_PER_REQ = $0.012` (`scripts/lib/buildLevelStats.mjs`).  
**T3 Lesen** = `make-t3.mjs` → **$0 API**.  
Media **~1,0–1,2 llamadas/parte** Lesen/Hören (T2 + reparos incluidos).  
Buffer **+35%** por rechazos POOL-2 (`isPartPoolReady`).

| Opción | Partes a generar | Llamadas API (~) | Coste base | **Coste realista (+35%)** |
|--------|------------------|------------------|------------|---------------------------|
| **A** MVP Lesen (4/celda) | 75 | ~90 | ~$1,10 | **$1,50–2,00** |
| **B** Recomendada | 284 | ~370 | ~$4,40 | **$6–8** |
| **C** 16 temas L+H (3/celda) | 253 | ~330 | ~$3,90 | **$5–7** |
| **D** Power 12/mes | 311 Lesen | ~400 | ~$4,80 | **$6–10** |

**Desglose Opción B:**

| Módulo | Partes | Coste estimado |
|--------|--------|----------------|
| Lesen 6/celda | 131 | $2,00–2,80 |
| Hören 4/celda | 53 | $0,80–1,20 |
| Schreiben 3/celda | 46 | $0,70–1,00 |
| Sprechen 3/celda | 54 | $0,80–1,20 |
| **Total** | **284** | **~$6–8 one-off** |

**No incluido:** tiempo de auditoría humana, re-etiquetado `_untagged`, ingest a blob (negligible).

**Comparación:** generación live ≈ **$0,01–0,05+ por examen × usuarios** → el pool one-off se amortiza en pocos Pro.

### 7.5 Plan de ejecución recomendado (Opción B)

**Fase batch 1 (~$6–8, 1–2 semanas):**

1. **131 Lesen** → 6/celda × 6 temas Tier A (prioridad huecos §4.3).
2. **53 Hören** → 4/celda Tier A, lemmas en transcript.
3. **46 Schreiben** → retaggear existentes + generar déficit; sin vocab forzado.
4. **54 Sprechen** → generar desde cero por tema.
5. Cada parte Track A: `--words` con 5–8 lemmas rotados del tema.

**Resultado producto:** Pro practica **Lesen+Hören con vocab** (5–7/10 habitual) + **Schreiben+Sprechen sin vocab**; ~**6 exámenes/mes mismo tema** sin repetir; rotando 2 temas → ~12/mes.

**Fase batch 2 (opcional, +$4–6):** subir Lesen Tier A a **12/celda** (+180 partes) si se promete cuota Pro sin repetición en un solo tema.

### 7.6 Fases de implementación (código + contenido)

#### Fase 0 — Ya hecho / estabilización

- [x] `coalesceLesenAdsMatchingPart` + validación alineada
- [x] No fallback silencioso biblioteca tras híbrido progresivo
- [x] `ensureLesenT3Example` en `sanitizeGoetheParts`

#### Fase 1 — Contenido Opción B (284 partes) + pool-only UX

- [ ] Generar gaps §7.1 (Lesen/Hören/Schreiben/Sprechen Tier A)
- [ ] Personal Lesen+Hören = pool-only; Track B sin vocab
- [ ] Toast cobertura vocab; cero live en personal Lesen

#### Fase 2 — Contadores B/C + anti-repetición (parcial al lanzar; dedup al final)

- [ ] Bucket B `personal_practice` (24/40 sesiones) — §8.2, §8.10
- [ ] Pool personal: 0 créditos; UI tres barras — §8.3–§8.6
- [ ] `ServedPartsRegistry` unificado (§8.9) — al final

#### Fase 3 — Power user / escala

- [ ] Lesen Tier A 12/celda (+180 partes, +$4–6)
- [ ] 16 temas × 3/celda si crece base usuarios
- [ ] Cron `pool-health-report` + orquestador scheduled

---

## 8. Tres contadores separados + anti-repetición

**Decisión de producto (acordada):**

1. **Bucket A** — 12 exámenes completos/mes (Official / Practice).  
2. **Bucket B** — sesiones personalizadas pool (vocab + tema). **Contador propio**, no comparte el 12.  
3. **Bucket C** — 40 créditos IA/mes (Pro). **No** limitan el ensamblado pool; solo acciones que llaman al modelo.

Los tres se resetean mensualmente (`getMonthKey()`). La **anti-repetición de partes** (§8.9) es transversal a A y B.

### 8.1 Bucket A — Exámenes completos (Official / Practice)

Exámenes **ya montados** de 4 módulos (15 partes) desde `library/curated`, `exam-pool` o ensamblado blueprint estándar **sin** vocab del deck.

| Plan | Cuota / mes | Scope API | Qué es |
|------|-------------|-----------|--------|
| **Free** | 5 (`FREE_QUOTA`) | `exam_generation` | Mock oficial (1 cert/nivel) |
| **Pro / Pro Max** | **12** (`PRO_QUOTA`) | `exam_generation`, `quick_exam` | Practice **o** Official completo |

**Reglas Bucket A:**

- 1 inicio de examen completo = **−1** del contador mensual.
- **Retake** de examen guardado (`_fromSaved`) → **0**.
- Demos / guided demo → **0**.
- Fuente típica: exam-pool indexado, exámenes curados publicados, blueprint + banco (no personal vocab).

**UI:** *„Noch 7 von 12 Prüfungen diesen Monat“* (solo exámenes completos).

### 8.2 Bucket B — Práctica personalizada (vocab + tema)

Ensamblado **on demand** desde pool de partes (`assembleModuleFromPool`, `exam-part`): el usuario elige **tema B1**, **palabras del deck** (Track A) y **módulos** (1–4 o Teil suelto).

| Plan | Cuota / mes (propuesta) | Scope API | Coste marginal |
|------|-------------------------|-----------|----------------|
| **Free** | 0 o trial muy limitado | — | — |
| **Pro** | **24 sesiones** (`PERSONAL_PRACTICE_QUOTA`, propuesta) | `personal_practice` (nuevo) | **~0 API** en pool-only |
| **Pro Max** | **40 sesiones** (propuesta) | idem | idem |

**1 sesión personalizada** = 1 clic en „Generar“ (da igual si elige solo Lesen o 4 módulos).  
**No** descuenta del bucket de 12 exámenes completos (Bucket A).  
**No** descuenta créditos IA (Bucket C) en **pool-only puro**.

#### Por qué NO usar los 40 créditos para limitar personal pool

| Enfoque | Problema |
|---------|----------|
| **Hoy:** `personal_exam` = **3 créditos** / generación live | 40 ÷ 3 ≈ **13 sesiones/mes** — mezclado con quiz, speaking, writing |
| Pool-first ensambla en **~0 API** | Cobrar créditos confunde (*„¿por qué gasto IA si es instantáneo?“*) |
| Dimensionar stock del pool | Hay que usar **sesiones B/mes**, no créditos C |

**Decisión:** el personal pool se limita con **Bucket B** (`personal_practice`). Los créditos quedan para **IA real** (§8.3).

**UI Bucket B:** *„Personalisiert: 18 von 24 Übungen diesen Monat“*

**Loader pool:** *„Dein Examen wird zusammengestellt…“* (segundos) — **no** mostrar „3 AI credits“ ni „Generating with AI“.

### 8.3 Bucket C — Créditos IA (acciones con modelo)

| Plan | Créditos / mes | Variable | Roll over |
|------|----------------|----------|-----------|
| **Free** | 6 (`AI_CREDITS_FREE`) | `aiUsed` / `aiRemaining` | — |
| **Pro** | **40** (`AI_CREDITS_PRO`) | idem | hasta 50 |
| **Pro Max** | **150** (`AI_CREDITS_PRO_MAX`) | idem | idem |

**Costes actuales** (`netlify/functions/lib/aiCredits.js` → `AI_COSTS`):

| Acción | Créditos | ¿Cuándo? |
|--------|----------|----------|
| `personal_exam` (live / híbrido) | **3** | Solo si hay llamada Gemini (`startGeneration`) |
| `vocab_quiz` | 2 | Quiz AI del deck |
| `speaking` | 2 | Evaluación oral post-tarea |
| `speaking_realtime` | 4 | Sesión oral en tiempo real |
| `writing_correction` | 1 | Corrección Schreiben |
| `grammar_coaching` | 1 | Coaching gramatical |
| `listening_game` | 1 | Hören game (pocas palabras) |
| **Ensamblado personal pool** | **0** | Bucket B (−1 sesión), no Bucket C |

**UI Bucket C:** *„12 / 40 AI-Credits“* — independiente de Prüfungen y Übungen.

**Ejemplo uso mensual Pro:** 8 sesiones personal pool (0 cr) + 10 writing corrections (10 cr) + 5 speaking evals (10 cr) + 2 vocab quizzes (4 cr) = **24 cr** de 40.

### 8.4 Matriz de cobro (resumen)

| Acción | Bucket A (−1 examen) | Bucket B (−1 sesión) | Bucket C (créditos IA) |
|--------|---------------------|----------------------|------------------------|
| Official / Practice completo | **Sí** | No | No* |
| Personal pool (1–4 módulos) | No | **Sí** | **No** |
| Personal live / híbrido (fallback) | No | **Sí** | **Sí (3)** |
| Retake examen guardado | No | No | No |
| Corrección Schreiben | No | No | **Sí (1)** |
| Evaluación Sprechen | No | No | **Sí (2)** |
| Vocab quiz | No | No | **Sí (2)** |
| `generateSectionExam` (práctica suelta) | No | **Sí** (recomendado) | No en pool |

\*Official puede usar pool server-side sin créditos usuario.

### 8.5 Dimensionamiento del pool ↔ Bucket B

**Regla:** dimensionar stock con **sesiones personal/mes (Bucket B)**, no con créditos IA.

**Límites acordados (propuesta):**

| Plan | Bucket B (sesiones/mes) |
|------|-------------------------|
| Pro | **24** |
| Pro Max | **40** |

**Partes pool consumidas por sesión** (anti-repetición = partes únicas/mes):

| Tipo sesión | Partes |
|-------------|--------|
| Solo Lesen | 5 |
| Solo Hören | 4 |
| Lesen + Hören | 9 |
| 4 módulos | 15 |

**Peor caso (power user Pro):** 24 sesiones × solo Lesen × **mismo tema** → **24 partes/celda** `(tema × T1…T5)`.

**Caso realista:** 10–12 sesiones/mes, 2 temas, mix Lesen+Hören → ~**6 partes/celda/mes** en Tier A.

**Fórmula producción:**

```text
partes_por_celda ≥ sesiones_B_mes × P(mismo_tema) / temas_en_rotación
```

| Stock Tier A (Lesen) | Cubre (mismo tema, solo Lesen) | Alineado con |
|----------------------|--------------------------------|--------------|
| **6/celda** (Opción B, §7) | ~6 sesiones/mes | Pro 24 ses + rotar 2–3 temas |
| **12/celda** (Fase batch 2) | ~12 sesiones/mes | Pro 24 ses en 1 tema |
| **12/celda × 6 temas** | power user extremo | Opcional |

**Conclusión producción:** lanzar con **Opción B (284 partes, 6/celda Tier A)** + UI que **sugiera rotar tema** cuando `stock < sesiones_restantes`. Subir a 12/celda solo si analytics muestran usuarios agotando un solo tema.

Los **12 exámenes Bucket A** usan inventario **exam-pool/curated** (otra capa); el stock `(tema × Teil)` es principalmente para **Bucket B**.

### 8.6 Comparativa de los tres buckets

| | **A — Examen completo** | **B — Personal pool** | **C — Créditos IA** |
|---|-------------------------|----------------------|---------------------|
| **Qué limita** | Mocks Official/Practice | Sesiones vocab+tema | Quiz, oral, writing, live |
| **Pro / mes** | **12** | **24** | **40** |
| **Scope API** | `exam_generation` | `personal_practice` (nuevo) | `confirmAiCreditConsumption` |
| **Coste API** | Bajo (pool exámenes) | **~0** | Alto (por acción) |
| **UI** | „7/12 Prüfungen“ | „18/24 Übungen“ | „12/40 Credits“ |

**Anti-repetición:** A y B comparten `ServedPartsRegistry` (§8.9) — misma parte no en Official y Personal el mismo mes.

### 8.7 Selección de módulos (personalizado — 15 combinaciones)

Multi-select (cambio UX pendiente; hoy UI solo permite 1 módulo):

| Módulos elegidos | Partes pool | Track vocab |
|------------------|-------------|-------------|
| Solo Lesen | 5 | A |
| Solo Hören | 4 | A |
| Solo Schreiben | 3 | B (solo tema) |
| Solo Sprechen | 3 | B (+ eval IA) |
| Lesen + Hören | 9 | A |
| … cualquier subconjunto | suma | A/B mix |
| **4 módulos** | **15** | A + B |

Opcional por módulo: **Alle Teile** o **un Teil** (ya existe `teilFilter` en configurador).

**Restricciones sesión personal (Bucket B):**

- Pro obligatorio (`requireProOnlyAction('personal_practice')`).
- Track A (Lesen/Hören): ≥ **4 palabras** del deck + **tema** obligatorio.
- Track B solo (Schreiben/Sprechen): **tema** obligatorio; vocab opcional.
- Sin stock en celda → error claro o sesión parcial con aviso (no fallback silencioso).

### 8.8 No repetición — reglas de producto

**Principio:** mientras dure el **mes de cuota** (`getMonthKey()`), ninguna **parte reutilizable** (`reusable-seed` / `exam-part`) ni **texto equivalente** (mismo pasaje/transcript vía `ContentKey`) debe volver a servirse al mismo usuario, **independientemente del modo**:

- Examen Official servido desde `exam-pool` / library
- Examen Practice ensamblado por blueprint
- Examen Personalizado (pool o híbrido)

**Cross-mode obligatorio:**

> Si el usuario ya vio la parte `lesen-t4-umwelt-042` en un Official, **no** puede recibirla en un Personal del mismo mes (ni en Hören si el transcript comparte `ContentKey`).

**Excepciones aceptables:**

- Retake de examen **guardado explícitamente** (`_fromSaved`).
- Tras fin de mes: reset **independiente** en Buckets A, B y C; partes servidas según §8.9.

### 8.9 Modelo de registro recomendado: `ServedPartsRegistry`

Unificar hoy tres mecanismos fragmentados:

| Mecanismo actual | Qué guarda | Problema |
|------------------|------------|----------|
| `seenPartIds()` | `S.history[].partId` por módulo | Solo pool; **no** enlaza Official; `fillMissing*FromPool` **no registra** |
| `BurnedRegistry` | `ContentKey` + question ids, cooldown 15 días | No usa `partId` del pool; cooldown ≠ mes calendario |
| `poolIndex.servedCount` | Global por parte | No es per-user |

**Propuesta:**

```text
S.servedParts = {
  v: 1,
  month: "2026-07",           // alineado con quota month
  partIds: { "lesen:de:B1:uuid": ts, ... },
  contentKeys: { "t1a2b3c4...": ts, ... }
}
```

- **Al iniciar cualquier examen** (Official, Practice, Personal): registrar todas las partes del examen (`_poolPartIds`, `_genReport.poolFallback`, ids de partes ensambladas).
- **Al buscar en pool** (`fetchExamPart`, `fetchExamPartVocab`, `assembleModuleFromPool`):  
  `excludeIds = servedPartIdsThisMonth ∪ seenPartIdsLegacy`
- **Al filtrar candidatos**: rechazar si `ContentKey.examTouchesBurned` **o** `partId` ya servido **este mes**.
- **Persistir** en `S.history` + sync servidor (`Auth.pushSync`) igual que `BurnedRegistry`.
- **Migración:** `BurnedRegistry` pasa a ser capa de **spaced repetition opcional** (>30 días), no la única anti-repetición mensual.

**Criterio de aceptación:** usuario Pro con 12 exámenes Official (Bucket A) + 24 personal (Bucket B) + créditos IA solo en acciones C → contadores independientes; **ningún `partId` overlap** entre A y B vía §8.9.

### 8.10 Estado código hoy vs objetivo

| Flujo | Hoy | Objetivo |
|-------|-----|----------|
| Official / Practice | Bucket A ✅ (`exam_generation`) | Sin cambio |
| Personal pool-only | A veces `canGenerate()` ❌; sin contador B | Bucket B: `checkPersonalPracticeQuota()` → ensamblar → `incrementPersonalPractice()` |
| Personal pool-only | No cobra créditos (correcto si pool) | **0 créditos**; no `startExamGeneration('personal_exam')` |
| Personal live / híbrido | 3 créditos + a veces cuota A | Bucket B **+** Bucket C (3 cr) |
| Configurador UI | „3 AI credits“ en botón personal | Quitar copy de créditos en pool; mostrar „−1 Übung“ |
| `examConfig.js` | „3 AI credits“ en hints | Solo mencionar créditos si live habilitado |

**Flujo pool-only (objetivo):**

```text
Usuario → Generar
  → checkPersonalPracticeQuota()        // Bucket B
  → assembleModuleFromPool (instant)
  → entrega OK → incrementPersonalPractice()
  → NO startExamGeneration('personal_exam')
  → NO confirmAiCreditConsumption
Fallo ensamblado (sin stock) → NO decrementar B (refund análogo a exam_generation)
```

**Implementación mínima:**

```text
quotaLib.js              → personalMaxForPlan(), incrementPersonalQuota(), checkPersonalPracticeQuota()
releaseGeneration.js     → scope personal_practice (refund si no entrega)
generatePersonalExam     → rama pool: solo Bucket B; rama live: B + C
UI (dashboard, config)   → tres indicadores: Prüfungen / Übungen / AI-Credits
planPricing.js           → copy PERSONAL_PRACTICE_QUOTA=24, AI_CREDITS_PRO=40
aiCredits.js             → personal_exam solo en live; documentar pool=0
```

**Deprecar:** usar `canGenerate()` en path personal pool-only.  
**Mantener:** `personal_exam` + 3 créditos **solo** cuando `ALLOW_LIVE_GEN` y híbrido activo.

---

## 9. Hören, Schreiben y Sprechen en exámenes personalizados

### 9.1 ¿Tiene sentido el vocabulario personalizado?

| Módulo | ¿Vocab deck encaja? | Pool-first viable | Recomendación |
|--------|---------------------|-------------------|---------------|
| **Lesen** | **Sí** — palabras en pasajes | **Sí** (core del producto) | Tema + ranking vocab (`buscar`); aviso X/N |
| **Hören** | **Sí parcial** — lemmas en transcript | **Sí** | Misma celda `(tema × Teil)`; overlap vocab informativo |
| **Schreiben** | **Débil** — el usuario *produce* texto; el prompt no “contiene” sus 10 palabras de forma natural | Pool de **prompts** sí; vocab forzado suena artificial | **Práctica genérica** por tema B1, **sin** filtro vocab |
| **Sprechen** | **Muy débil** — tareas fijas (planificar, presentar); forzar 10 lemmas rompe naturalidad | Pool limitado hoy (`assembleModuleFromPool` **no** implementa Sprechen) | **Práctica aleatoria** + evaluación/orientación IA (`canUseSpeakingAi`) |

### 9.2 Propuesta UX — dos tracks dentro de “Personalizado”

**Track A — Vocabulario (Pro):** Lesen + opcional Hören  
- Usuario elige tema + palabras del deck.  
- Serve pool-first; cobertura vocab = **informativa**, no bloqueante.

**Track B — Producción (Pro):** Schreiben + Sprechen  
- **Independiente del deck**; usuario elige solo **tema B1** (o “mix”).  
- Pool de tareas validadas → si no hay stock, **generación IA** con corrección (`writing_correction` / speaking flow).  
- **No** mezclar Track B dentro del mismo flujo que exige 4+ palabras del flashcard deck.

**Examen completo Pro (12/mes):**  
Ensamblar Track A (Lesen + Hören) desde pool con dedup unificado + Track B (Schreiben + Sprechen) desde pool genérico por tema, **sin** exigir overlap vocab.

### 9.3 Stock pool por módulo (Goethe B1 — partes por examen)

| Módulo | Teile/examen | Partes consumidas / examen |
|--------|--------------|----------------------------|
| Lesen | 5 | 5 |
| Hören | 4 | 4 |
| Schreiben | 3 | 3 |
| Sprechen | 3 | 3 |
| **Total** | **15** | **15 partes únicas** |

Celdas adicionales: `(tema × Teil × módulo)` → **16 × (5+4+3+3) = 256 celdas** si se etiqueta todo por tema (Schreiben/Sprechen pueden usar tema del prompt, no vocab).

---

## 10. Dimensionamiento del pool vs cuota 12/mes

### 10.1 Consumo por usuario Pro (peor caso)

Usuario **power user**: 12 exámenes completos/mes, **mismo tema** (p. ej. Umwelt), sin repetición:

| Ámbito | Partes únicas necesarias / mes / usuario |
|--------|------------------------------------------|
| Lesen (5 Teile) | 12 × 5 = **60** partes (12 por celda `(Umwelt, T1..T5)`) |
| Hören (4 Teile) | 12 × 4 = **48** |
| Schreiben (3) | 12 × 3 = **36** |
| Sprechen (3) | 12 × 3 = **36** |
| **Total** | **180 partes / usuario / mes / tema** |

Usuario **típico**: 3–4 exámenes/mes, rota 2–3 temas → presión **~3–4 partes/celda/mes**, no 12.

### 10.2 Tres targets de stock (revisados con cuota Pro)

Objetivo: usuario contento con **tema + vocab** sin agotar pool ni repetir dentro del mes.

| Nivel | Partes limpias / celda `(tema × Teil × módulo)` | Lesen solo (80 celdas) | ¿Soporta 12 ex/mes mismo tema? |
|-------|--------------------------------------------------|------------------------|--------------------------------|
| **Mínimo estructural** | 1 | 80 | ❌ (1 examen; repetición al 2.º) |
| **Operativo (doc anterior)** | 3 | 240 | ❌ para power user (3 ex/mes) |
| **Pro mensual (Tier A)** | **12** | 960 (16×5×12) solo Lesen | ✅ 12 ex/mes 1 tema |
| **Pro mensual completo** | **12** | **256 × 12 ≈ 3 072** todas las celdas | ✅ examen entero 12/mes |
| **Cómodo multi-usuario** | **15–18** | margen para concurrencia | ✅ + cola background |

**Interpretación práctica:**

- El target **3/celda** (240 Lesen) sigue siendo válido para **usuarios medios** y **rotación de temas**.
- Para cumplir **12 exámenes/mes sin repetición** en un solo tema, hace falta **≥12 partes/celda** en ese tema — **priorizar Tier A** (6 temas × 5 × 12 = **360 partes Lesen** mínimo para esos temas).
- **No** hace falta 12/celda en los 16 temas el día 1: solo en **Tier A** + cron que sube a 12 cuando `pool-health` detecte usuarios cerca del techo.

### 10.3 Equilibrio satisfacción (tema + vocab) vs tamaño de pool

| Palanca | Efecto en UX | Coste contenido |
|---------|--------------|-----------------|
| **Tema obligatorio, vocab = ranking** (§5.3) | Siempre examen coherente; 4–5/10 palabras habitual con 3+ partes/celda | Bajo |
| **Rotación de tema sugerida** cuando `stock < 12 − servedThisMonth` | Evita repetición sin inflar pool | UX: banner “Probier auch Technik — mehr frische Aufgaben” |
| **Vocab parcial sin bloqueo** | Usuario Pro no frustrado si 4/10 | Ya existe `PersonalExamCoverage` |
| **Cross-module dedup** (`ContentKey`) | Misma historia no en Lesen y Hören | Reduce sensación de repetición sin duplicar stock |
| **Schreiben/Sprechen sin vocab** | Menos celdas `(tema×Teil)` “imposibles” | Pool genérico más pequeño |

**Fórmula operativa (Lesen, tema T, usuario u):**

```text
partes_necesarias_celda(T, teil) ≥ min(12, exámenes_previstos_u × P(repite_tema_T))
```

Para lanzamiento MVP pool-first → ver **§7.5 Plan de ejecución Opción B**.

### 10.4 Capacidad global vs usuarios concurrentes

Stock **per-user** no escala linealmente: si **U** usuarios Pro activos consumen **12 ex/mes** en el mismo tema Tier A:

```text
Stock_celda ≥ 12 × U   (mismo mes, mismo tema, misma celda)
```

En la práctica **U** es pequeño al inicio → **6/celda Tier A** + rotación de tema es suficiente; escalar cron cuando `servedCount` global por parte > umbral.

---

## 11. Gaps de implementación (checklist Claude)

### Anti-repetición

- [ ] `ServedPartsRegistry` unificado (§8.9)
- [ ] Registrar partes en **todos** los paths: `assembleModuleFromPool`, `fillMissing*FromPool`, Official pool serve, personal hybrid `_genReport.poolFallback`
- [ ] `fetchExamPart(Vocab)` excluye partIds + contentKeys del mes + Official servidos
- [ ] Reset mensual alineado con `getMonthKey()` / cuota

### Cuota / contadores

- [ ] Scope **`personal_practice`** + Bucket B (24 Pro / 40 Pro Max) — §8.2
- [ ] Pool personal: **0 créditos**; quitar `canGenerate()` y copy „3 AI credits“
- [ ] Live residual: Bucket B + Bucket C (3 cr) — §8.4
- [ ] UI: **tres** indicadores (Prüfungen / Übungen / AI-Credits) — §8.6

### Módulos

- [ ] Multi-select módulos en `examConfig.js` (§8.7)
- [ ] `assembleModuleFromPool('sprechen')` o flujo dedicado pool + IA eval
- [ ] Hören: misma política vocab soft que Lesen

### Pool content

- [ ] Ejecutar **Opción B** §7.5: **284 partes** Tier A (~$6–8)
- [ ] Fase 2 opcional: Lesen 12/celda (+180 partes, +$4–6)
- [ ] Etiquetar Schreiben/Sprechen con `topicTag` sin `vocabIndex` obligatorio

---

## 12. Referencia técnica rápida

| Concepto | Ubicación |
|----------|-----------|
| Temas canónicos | `js/data/b1Topics.js` |
| Búsqueda pool vocab+tema | `netlify/functions/lib/partIndex.js` → `buscar` |
| Ensamblado personal | `js/ui/exam/examGeneration.js` → `assembleModuleFromPool` |
| Plan híbrido (→ pool-only) | `scripts/lib/hybridExamPlan.mjs` |
| Cuota exámenes completos (A) | `quotaLib.js`, `PRO_QUOTA` (12) |
| Cuota personal (B) | `personal_practice` — 24 Pro / 40 Pro Max |
| Créditos IA (C) | `aiCredits.js`, `AI_COSTS`, `AI_CREDITS_PRO` (40) |
| Cuota / release | `netlify/functions/lib/releaseGeneration.js`, `quotaLib.js` |
| Anti-repetición (legacy) | `js/library/BurnedRegistry.js`, `js/ui/exam/examGeneration.js` → `seenPartIds` |
| ContentKey cross-module | `js/library/ContentKey.js` |
| Cobertura vocab UI | `js/engine/personalExamCoverage.js` |
| Gate calidad | `scripts/audit-pass-2.mjs` → `isPartPoolReady` |
| Salud pool | `scripts/pool-health-report.mjs` |
| Relleno déficit | `scripts/fill-pool-deficit-b1.mjs` |
| Generación batch | `scripts/generate-lesen-part-gemini.mjs`, `scripts/make-t3.mjs`, `scripts/factory-lesen.mjs` |
| Coste estimado | `scripts/lib/buildLevelStats.mjs` → `GEMINI_EST_USD_PER_REQ` (default $0.012/req) |
| Glosario B1 | `library/vocab/de/B1.json` |
| Serve API | `netlify/functions/exam-part.js` |

---

## 13. Resumen ejecutivo (una página)

1. **Tres contadores separados (§8):** **A** 12 Prüfungen/mes · **B** 24 Übungen personal/mes · **C** 40 AI-Credits/mes (Pro).
2. **Personal pool → Bucket B only:** ensamblado **0 créditos**; no mezclar con los 40 ni con los 12 exámenes.
3. **Créditos (C)** solo para IA real: writing correction, speaking, quiz, live/híbrido residual (3 cr).
4. **Producir pool para B=24:** Opción B (**284 partes**, 6/celda Tier A) + rotación de temas; 12/celda si power users agotan un tema.
5. **Opción B contenido:** ~**$6–8** Gemini one-off; Lesen+Hören vocab; Schreiben/Sprechen solo tema.
6. **UX:** tres barras en UI; loader pool *„wird zusammengestellt“* — no „3 AI credits“.
7. **Anti-repetición** A↔B compartida (§8.9) — implementar al final.
8. **Orden:** contenido §7.5 → pool-only + contadores B/C → dedup §8.9.

---

*Documento para handoff Claude / implementación. Recalcular gaps tras ingest: `node scripts/pool-health-report.mjs --lang de --level B1`.*
