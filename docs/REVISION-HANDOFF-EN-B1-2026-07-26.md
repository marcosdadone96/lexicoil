# Revisión del handoff EN B1 (Danilo → Marcos)

**Fecha:** 26 jul 2026 · **último checkpoint:** 20 ago 2026  
**PR #1 (EN B1):** https://github.com/marcosdadone96/lexicoil/pull/1 — tip **`234a4fa`**  
**PR #2 (audio DE+EN):** https://github.com/marcosdadone96/lexicoil/pull/2 — tip **`3d4f7c9`**  
**`main`:** **`a16d033`** — decisión **(A)** aplicada (`git rm --cached` build, 20 ago)  
**Respuesta de Danilo:** [`docs/respuesta-revision-en-b1-2026-07-26.md`](respuesta-revision-en-b1-2026-07-26.md)

Documento de **lectura, decisiones y checkpoint**. No entra en PR #1; se mantiene solo en `main`.

Relacionado: [`docs/CONTENT_LIVE_POLICY.md`](CONTENT_LIVE_POLICY.md) · **`CLAUDE.md`** (PR #1; baseline audit corregido allí)

---

### Checkpoint — 20 de agosto de 2026

#### Estado de ramas y PRs

| | Tip | Notas |
|---|-----|-------|
| `main` | `a16d033` | `(A)` build destrackeado · Textos v1 (`03c9549`) |
| PR #1 `feat/en-b1` | `234a4fa` | 5 commits QA EN sobre `1eef031` (sin audio) |
| PR #2 audio | `3d4f7c9` | Solo `listeningScript.js` + test + `?v=2` |

Danilo debe **mergear `main` (`a16d033`) en `feat/en-b1`**. Tras `(A)`, conflictos esperados:

- **`index.html`:** `examRunner.js?v=28` + `textosReader.js?v=1` (ambas líneas)
- Cualquier `rename/delete` bajo `dist/` → **stay deleted**

```powershell
git fetch danilo origin
git merge-tree --write-tree origin/main danilo/feat/en-b1 2>&1 | Select-String "CONFLICT"
```

#### QA Danilo (fix/en-b1-qa-preview) — resumen

| # | Ámbito | Estado |
|---|--------|--------|
| 1 | Audio `parseSegmentsInline` — de/A2 T4 + en Listening P4 | **PR #2** |
| 2 | Numeración **de/A2** rota (preexistente) | **Marcos** post-merge |
| 3 | Baseline audit **17 / 371 / 237** (no 12/242) | Corregido en `CLAUDE.md` (PR #1) |
| 4–8 | EN: L3 vacío, numeración Cambridge, examId, CHK-1 gap_fill, results | **PR #1** (`234a4fa`) |

#### Baseline regresión DE (`batches/generated`, 146 arch., 820 preg.)

```powershell
node scripts/audit-pass-2.mjs batches/generated
# 17 CRÍTICOS / 371 IMPORTANTES / 237 MENORES
```

#### TTS post-merge PR #2 — decisiones (Marcos, 20 ago)

Tras merge **#2**, cambian **53 transcripts** → **546 clips** (~73k chars con `eleven_multilingual_v2`).

| Decisión | Valor |
|----------|-------|
| **Canal entrega** | **(a)** commitear mp3 servidos en repo (~53 MB) — evita calentar Blobs con créditos Pro |
| **Modelo prod** | Revisar `ELEVENLABS_MODEL` en Netlify; si no está, **poner `eleven_flash_v2_5`** (mitad de coste vs default v2) |
| **Quién genera** | Danilo: **en/B1 + de/A2** (115 clips) + manifest · Marcos: **de/B1** (431 clips) con key de prod |
| **Cuándo** | Tras merge **#2**; `--dry-run` antes: `npm run pregenerate:tts:served -- --dry-run` |

Implementación (a): habrá que **exceptuar** `library/tts-cache/` servido del `.gitignore` o usar subcarpeta trackeada — post-merge, tarea aparte.

#### Orden de merge acordado

1. Merge **PR #2** (audio)  
2. Danilo mergea **`main` → `feat/en-b1`**, resuelve `index.html`, empuja PR #1  
3. Regeneración TTS (Danilo en+de/A2; Marcos de/B1)  
4. QA preview PR #1 (examen EN entero + quick DE)  
5. Merge **PR #1**

#### Deuda post-merge

CI live fidelity · `build:availability` · pool P2 (~20 stubs) · CHK-29/35 · CHK-LEVEL/served · **de/A2 numeración** · `test:engine`

---

### Checkpoint PR #1 — 8 de agosto de 2026 (histórico)

**Tip inicial del PR:** `1eef031`. Supersedido por `234a4fa` + fixes QA.

| Hito | Commit |
|------|--------|
| Merge `main` en su rama | `0969fdc` |
| Fix Reading Part 4 | `2e139a1` |
| Docs / baseline (obsoleto 12/242) | `1eef031` → corregido a **17/371/237** en rama QA |

**Acuerdos cerrados (siguen vigentes):**

| Tema | Decisión |
|------|----------|
| (A) build untrack | Hecho en **ambos lados**: PR #1 (`e270f94`) + **`main` `a16d033`** |
| (C) catálogo | `de/A2` + `de/B1` live; `en/B1` beta (3); `lc_show_beta` en consola |
| `test:engine` | Fuera del PR |
| Preview vs Actions | Netlify ≠ Actions; CI rojo por fidelity `de/*` live preexistente |

```powershell
npm run validate:fidelity -- --lang en --level B1 --strict   # 3/3 en 234a4fa
```

### Handoff v2 — qué respondió Danilo a esta revisión

Tras [`docs/REVISION-HANDOFF-EN-B1-2026-07-26.md`](REVISION-HANDOFF-EN-B1-2026-07-26.md) (lectura del handoff v1, `32da28c`), Danilo publicó **`56eb9be`** con una **nota v2 al inicio** del handoff (mismo path en su rama). Confirma **los dos errores** que habíamos señalado y los corrige in situ (marcados “Corregido en la v2”):

| # | Error en v1 | Estado en v2 |
|---|-------------|--------------|
| 1 | “Solo `de/A2` live” (§2.2) — falso en tu `main` (`de/B1` live, 16 exámenes) | Tabla `main` vs `feat/en-b1`; el gate beta **no afecta** a niveles `live` |
| 2 | “`eliminado/` se llevó la doc EN” (§4.3) — acusatorio e incorrecto | Los 6 ficheros son **de su rama**; aparecen bajo `eliminado/` por **rename detection** al mergear tu `docs/audit/` → `eliminado/docs/audit/` |

También alinea cifras menores (**add/add 22**, **101** ficheros compartidos, **17 vs 18** commits = commits de este documento), **reformula §5(C)** y avisa del merge manual de `data/exams/availability.json`.

Leer la v2 en el repo:

```powershell
git fetch danilo
git show danilo/feat/en-b1:docs/handoff-en-b1-para-marcos.md
```

---

## 1. Lectura ejecutiva

Danilo cierra **en/B1** en su rama (3 exámenes Cambridge, fixes de matching/instrucciones, speaking servible) y pide sobre todo **revisión del código compartido** y **tres decisiones de producto/proceso** (sección 5 del handoff).

Mensajes centrales que cuadran con el repo:

- El reparto “Danilo = inglés / Marcos = alemán” **no se sostiene en código**: `js/`, `scripts/`, `netlify/functions/` son comunes.
- La mayoría de los **236 conflictos** de merge son **output de build** ya cubierto por `.gitignore` (162 modify/delete).
- En el pipeline compartido, **tu `main` es más grande** que su rama en varios ficheros; sus deltas de idioma son pequeños encima.

En **`main` antes del merge** siguen los dos bugs que el PR corrige:

| Bug | Estado en `main` pre-merge | Fix en PR |
|-----|---------------------------|-----------|
| Quick + library → pantalla en blanco (`goetheFormat && !isQ`) | `js/ui/exam/examRunner.js` ~L884 | `130c22a` |
| Niveles `beta` → “Coming soon” (afecta **beta**, no `live`) | Sin `lc_show_beta` | `1e8a50f` |

---

## 2. Verificación de cifras (comandos reproducibles)

PowerShell desde la raíz del repo (`c:\Users\marco\Desktop\MDR\lexiloop`).

### 2.1 Hashes y rama

```powershell
git rev-parse main
git merge-base main danilo/feat/en-b1
git log -1 --oneline danilo/feat/en-b1
git log --oneline 4e5efac..danilo/feat/en-b1
```

| Afirmación | Resultado |
|------------|-----------|
| `main` = `a50a89a` | OK |
| Base común = `4e5efac` | OK |
| Commits sobre base (doc v2: 17 + docs) | **19** (`32da28c`, `56eb9be` + 17 de producto) — ver nota v2 en handoff |

### 2.2 Ficheros trackeados (índice)

```powershell
(git ls-files dist/).Count
(git ls-files landing/).Count
(git ls-files landing/.next/).Count
(git ls-files landing/out/).Count
(git ls-files '*.bak').Count
git ls-tree -r --name-only danilo/feat/en-b1 -- dist/ | Measure-Object
git ls-tree -r --name-only danilo/feat/en-b1 -- landing/ | Measure-Object
```

| Zona | `main` (`a50a89a`) | `danilo/feat/en-b1` |
|------|-------------------|---------------------|
| `dist/` | **528** | **0** |
| `landing/` | **306** (195 `.next/` + 55 `out/` ≈ 250 build) | **56** (solo fuente) |
| `*.bak` | **16** | **0** |

`.gitignore` en `4e5efac` ya incluye `dist/`, `landing/.next/`, `landing/out/` (líneas 5, 11–12).

### 2.3 Commit `a50a89a` y build arrastrado

```powershell
git diff-tree --no-commit-id --name-only -r a50a89a -- dist/
git diff-tree --no-commit-id --name-only -r a50a89a -- landing/
git diff-tree --no-commit-id --numstat -r a50a89a -- dist/ landing/out/
```

| Métrica | Doc | Medido |
|---------|-----|--------|
| Ficheros `dist/` en ese commit | 73 | **73** |
| Ficheros `landing/` en ese commit | 71 | **71** |
| Inserciones ~+124k (doc: +123 919 solo `dist/`) | ~124k | **123 997** (`dist/` + `landing/out/`) |

### 2.4 Merge-tree (conflictos)

Equivalente al handoff (ellos usan `HEAD` + `origin/main` desde su fork):

```powershell
git merge-tree --write-tree main danilo/feat/en-b1 2>&1 | Select-String "CONFLICT" | Measure-Object
git merge-tree --write-tree main danilo/feat/en-b1 2>&1 | Select-String "modify/delete" | Measure-Object
git merge-tree --write-tree main danilo/feat/en-b1 2>&1 | Select-String "add/add" | Measure-Object
```

| Métrica | Doc | Medido |
|---------|-----|--------|
| Conflictos totales | 236 | **236** |
| modify/delete (build) | 162 | **162** |
| add/add | 22 (v2) | **22** |
| `dist/` (paths únicos modify/delete) | 87 | **87** |
| `landing/out/` + `landing/.next/` | 75 | **19 + 56 = 75** |
| Código `js/`, `scripts/`, `netlify/` | 46 | **46** (paths únicos) |

### 2.5 Tamaño de la rama y pipeline

```powershell
git diff --name-status 4e5efac danilo/feat/en-b1 | Measure-Object
git diff --name-status 4e5efac danilo/feat/en-b1 | Select-String "^D\s+dist/"
git diff --name-only 4e5efac danilo/feat/en-b1 -- js/ scripts/lib/ netlify/functions/ | Measure-Object
```

| Métrica | Doc | Medido |
|---------|-----|--------|
| Ficheros en diff vs base | 1197 | **1198** |
| Borrados bajo `dist/` | ~528 | **535** (métrica distinta: diff vs base, no `ls-files`) |
| Ficheros compartidos `js/` + `scripts/lib/` + `netlify/` | 101 (v2) | **101** |

### 2.6 Distancia `a50a89a` → Danilo (tabla §4.1 handoff)

```powershell
git diff --numstat a50a89a danilo/feat/en-b1 -- scripts/audit-pass-2.mjs scripts/lib/capitalizeNouns.mjs scripts/generate-lesen-part-gemini.mjs scripts/lib/generatePartGeminiLib.mjs scripts/lib/lesenTemplatePrompt.mjs scripts/lib/repairTriage.mjs js/engine/personalLesenPoolFallback.js
```

Coincide con el handoff (ej. `audit-pass-2.mjs` +179/−1376, `capitalizeNouns.mjs` +369/−1310, …).

### 2.7 Híbridos add/add (tabla §4.2)

```powershell
git diff --numstat a50a89a danilo/feat/en-b1 -- scripts/lib/hybridExamPlan.mjs scripts/lib/hybridLesenAssembly.mjs scripts/lib/partGate.mjs netlify/functions/lib/loadPoolIndex.js netlify/functions/lib/hybridExamWebExecute.js
```

OK (incl. `partGate.mjs` +1/−105).

### 2.8 `eliminado/` y audit

```powershell
git diff-tree --no-commit-id --name-only -r 52b670e | Select-String "^eliminado/" | Measure-Object
(git ls-files eliminado/docs/audit/).Count
```

| Métrica | Doc | Medido |
|---------|-----|--------|
| Ficheros bajo `eliminado/` en `52b670e` | 2675 | **2675** |
| `eliminado/docs/audit/` en índice | 50 | **50** |

Deploy: `netlify.toml` → `command = "npm run build:site"`, `publish = "dist"`.

### 2.9 Verificación sugerida por Danilo (en su rama)

Tras checkout de revisión:

```powershell
git fetch danilo
git checkout -b en-b1-review danilo/feat/en-b1
npm run test:engine
node scripts/test-lesen-instruction-lang.mjs
node scripts/lib/__tests__/adsMatching.cambridge-p2.test.mjs
npm run validate:fidelity -- --lang en --level B1 --strict
node scripts/audit-stored-exams.mjs --strict
```

**Nota:** Danilo confirma en [`respuesta-revision-en-b1-2026-07-26.md`](respuesta-revision-en-b1-2026-07-26.md) §3 que `test-vocab-personalization.mjs` **ya fallaba en `4e5efac`** (banco `de/B1`, no inglés) y que `test:engine` aborta en el paso 6 — la suite completa no ha corrido verde en meses. Retirar como “rojo nuevo del inglés”.

---

## 3. Catálogo en el PR (post-merge manual en `0969fdc`)

| Nivel | `main` (`e5fed38`) | PR #1 (`1eef031`) |
|-------|-------------------|-------------------|
| `de/A2` | `live` | `live` |
| `de/B1` | **`live` (16 exámenes)** | **`live` (16)** — lado Marcos |
| `en/B1` | `hidden` | **`beta` (3 exámenes)** — acordado para QA con `lc_show_beta` |

```powershell
git show main:data/exams/availability.json
git show danilo/feat/en-b1:data/exams/availability.json
```

Docs EN del plan: en **su rama** bajo `docs/audit/` (no en tu `eliminado/`). Comprobación que usa el handoff v2:

```powershell
git ls-tree -r --name-only main -- eliminado/docs/audit | Select-String en_b1    # vacío
git ls-tree -r --name-only 4e5efac -- docs/audit | Select-String en_b1          # vacío
git ls-tree -r --name-only danilo/feat/en-b1 -- docs/audit | Select-String en_b1  # los 6
```

---

## 4. Decisiones — **cerradas** (26 jul – 8 ago 2026)

### (A) Untrack build — **hecho en `main` (`a16d033`, 20 ago)**

794 ficheros desindexados (`dist/`, `landing/out/`, `landing/.next/`, `.bak`). También en PR #1 desde `e270f94`.

### (B) PR #1 — **hecho por Danilo**

Merge `0969fdc` contra `e5fed38`; conflictos resueltos; tip `1eef031`. Review + QA preview pendientes.

### (C) Catálogo — **acordado**

`de/A2` + `de/B1` live; `en/B1` **beta** (3); sin descomentar `LEXICOIL_SHOW_BETA_LEVELS` global.

### (4.3) `eliminado/` — **cuarentena**

Docs EN viven en `docs/audit/` de la rama PR; nada que recuperar de `eliminado/`.

### Fuera del PR

`test:engine` — vuestra pista, aparte.

---

## 5. Mensaje enviado a Danilo (referencia)

```
PR #1, review + QA en preview. en/B1 beta, de/A2/de/B1 live, test:engine fuera.
(A) no duplicamos en main; CI rojo preexistente no bloquea merge.
Part 4: QA completo tras 2e139a1. Deuda post-merge: CI live, build:availability, pool P2, CHK-29/35, test:engine.
```

---

## 6. Traer la rama (referencia)

```powershell
git remote add danilo https://github.com/Abelardo94/lexicoil.git   # solo la primera vez
git fetch danilo
git show danilo/feat/en-b1:docs/handoff-en-b1-para-marcos.md
git checkout -b en-b1-review danilo/feat/en-b1   # solo para revisión local
```

---

## 7. Resumen en una línea

PR **#1** (`234a4fa`) + **#2** (`3d4f7c9`) listos. **`main` `a16d033`**. Pendiente: merge #2 → Danilo merge main en #1 → TTS → QA → merge #1.
