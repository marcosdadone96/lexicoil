# Revisión del handoff EN B1 (Danilo → Marcos)

**Fecha:** 26 jul 2026 · **checkpoint PR #1:** 8 ago 2026 (tip **`1eef031`**)  
**PR:** https://github.com/marcosdadone96/lexicoil/pull/1  
**Fuente canónica:** [`docs/handoff-en-b1-para-marcos.md`](handoff-en-b1-para-marcos.md) en `danilo/feat/en-b1` — handoff v2 **`56eb9be`**  
**Respuesta de Danilo:** [`docs/respuesta-revision-en-b1-2026-07-26.md`](respuesta-revision-en-b1-2026-07-26.md)  
**Medido originalmente contra:** `main` = `a50a89a` · merge del PR contra **`e5fed38`** · base común = `4e5efac`  
**Remoto:** `git remote add danilo https://github.com/Abelardo94/lexicoil.git`

Documento de **lectura, decisiones y checkpoint del merge EN B1**. Este fichero **no entra en PR #1** (`git log origin/main..feat/en-b1 -- docs/REVISION-HANDOFF-EN-B1-2026-07-26.md` vacío); se actualiza solo en `main`.

Relacionado: [`docs/CONTENT_LIVE_POLICY.md`](CONTENT_LIVE_POLICY.md) · **`CLAUDE.md`** (añadido en el PR, baseline audit DE)

---

### Checkpoint PR #1 — 8 de agosto de 2026

**Tip del PR:** `1eef031` (`2e139a1` fix Part 4 + docs `CLAUDE.md`).  
**Estado:** mergeable, **0 conflictos** contra `main` (`e5fed38`). Danilo cerró su parte; **pendiente QA preview + merge**.

```powershell
git fetch danilo origin
git log -1 --oneline danilo/feat/en-b1          # 1eef031
git log --oneline e5fed38..danilo/feat/en-b1 | Measure-Object   # 32 commits
git merge-tree --write-tree origin/main danilo/feat/en-b1 2>&1 | Select-String "CONFLICT"   # vacío
```

| Hito | Commit / dato |
|------|----------------|
| Merge de `main` (`e5fed38`) en su rama | `0969fdc` — 4 conflictos de contenido resueltos (a2Topics, audit-pass-2, normalizeBatch, validateCandidate) |
| Fix Reading Part 4 (food-market-02, -03) | `2e139a1` — 7 ficheros, +497/−400; `scripts/repair-en-b1-lesen-t4-gapped-options.mjs` (idempotente, 0 en 2ª pasada) |
| Docs agente / baseline regresión DE | `1eef031` — `CLAUDE.md` (+195); baseline **12 CRÍTICOS / 371 IMPORTANTES / 242 MENORES** (146 arch., 820 preg.) |
| Lockfile CI | `7c41be1` — `npm ci` ya arranca (antes moría desde `52b670e`, 21 jul) |

**Acuerdos cerrados:**

| Tema | Decisión |
|------|----------|
| (A) build untrack | Entra con el PR (Danilo lo aplicó en su rama); no duplicar en `main` aparte |
| (B) flujo | PR #1 contra `main`; Danilo mergeó y resolvió |
| (C) catálogo | `de/A2` + `de/B1` **live** (16); `en/B1` **beta** (3 exámenes); QA con `localStorage.setItem('lc_show_beta','1')` |
| `test:engine` | Fuera del PR — deuda vuestra |
| Preview vs Actions | **Netlify preview** ≠ **GitHub Actions**; preview puede ir verde con Actions rojo |

**Verificación EN (rama PR):**

```powershell
npm run validate:fidelity -- --lang en --level B1 --strict   # 3/3, exit 0
node scripts/repair-en-b1-lesen-t4-gapped-options.mjs        # 0 ocurrencias (2ª pasada)
```

**Regresión DE (comparar identidad con baseline):**

```powershell
node scripts/audit-pass-2.mjs batches/generated
# esperado: 12 CRÍTICOS / 371 IMPORTANTES / 242 MENORES · 146 archivos · 820 preguntas
```

**CI rojo preexistente (no atribuir al inglés):**

```powershell
node scripts/validate-exam-fidelity.mjs --all --strict --live-only
# main e5fed38: 29 exámenes, 0 pasan, 784 errores (solo de/A2 + de/B1 live)
# ci:content = build:availability + validate:fidelity:all; sin continue-on-error → test:engine no corre
```

**Deuda post-merge (orden acordado):** CI live fidelity → `build:availability` → pool P2 (~20 stubs `ads:0`) → CHK-29/35 (`inferAuditLang`) → `test:engine`.

**QA preview:** los 3 exámenes en/B1, Part 4 incluido tras `2e139a1`. Si algo falla en Part 4, Danilo mira sobre `1eef031`.

> ~~Estado al 7 ago~~ — obsoleto: tip `7c41be1` y “4 conflictos vs main local” ya no aplican tras `0969fdc`.

---

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

### (A) Untrack build — **entra con PR #1**

Danilo lo aplicó en `feat/en-b1` (`e270f94` / merge). No hace falta commit aparte en `main` antes del merge.

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

PR **#1** en **`1eef031`**: merge hecho, EN B1 **3/3 fidelity**, regresión DE **idéntica** al baseline, Part 4 reparado. **Pendiente:** QA preview y merge. **Después:** deuda CI/`build:availability`/pool P2/CHK/test:engine en `main`.
