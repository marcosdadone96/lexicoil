# Respuesta a vuestra revisión del handoff EN B1

**De:** Danilo · **Para:** Marcos · **Fecha:** 26 de julio de 2026 · **actualizado el 5 de agosto de 2026** (ver nota al inicio)
**Responde a:** `REVISION-HANDOFF-EN-B1-2026-07-26.md` (vuestra revisión de `docs/handoff-en-b1-para-marcos.md`)
**Rama:** `feat/en-b1` → remoto `danilo`. Cuerpo §1–§6 escrito en `ffcc287`; tip actual **`e082d86`**
**Medido contra `main` = `a50a89a`** en §1–§6, **= `0f99b5c`** en la actualización · base común `4e5efac`

> ## ⚠️ Documento histórico — 7 de agosto de 2026
>
> **Lo que este documento pide ya no está pendiente.** Dice en §2 y §5 que "(A) sigue sin hacerse —
> y es lo único que bloquea", y que abriría el PR en cuanto estuviera. Ocho días después seguía sin
> estar, así que hice (A) yo dentro del merge: los 162 conflictos `modify/delete` eran build que
> `.gitignore` ya cubría y se resolvían todos por la misma regla.
>
> **El estado vigente es el PR #1**, con los 237 conflictos resueltos, 0 conflictos contra `main`
> y QA de navegador de los seis Parts de Cambridge y del Lesen alemán. Este documento se conserva
> sin editar porque el PR referencia sus mediciones.

> **Nota para quien lea esto con un agente de IA:** cada cifra de este documento lleva al lado el
> comando con el que se midió. Contrasta contra el repo antes de asumir que tengo razón — es lo
> mismo que os pedí en el handoff y es lo que he hecho yo con vuestra revisión.

Relacionado: [`handoff-en-b1-para-marcos.md`](handoff-en-b1-para-marcos.md) ·
[`CONTENT_LIVE_POLICY.md`](CONTENT_LIVE_POLICY.md)

---

## Actualización — 5 de agosto de 2026 (v2 de esta respuesta)

**Añadido diez días después.** El cuerpo del documento (§1–§6) se queda **tal cual**: nada de lo que
escribí el 26 de julio ha dejado de ser cierto. Esta nota solo re-mide contra el estado de hoy y
recoge lo que ha cambiado en vuestro lado.

**Estado de las ramas hoy:**

| | 26 jul (lo que medisteis) | 5 ago |
|---|---|---|
| Vuestro `main` | `a50a89a` | **`0f99b5c`** (+9 commits, 28–29 jul) |
| Mi `feat/en-b1` | `1e8a50f` / `56eb9be` | **`e082d86`** (24 commits sobre `4e5efac`) |

Mi rama **ya está subida** al fork, así que podéis medir el tip real:

```powershell
git fetch danilo
git log --oneline 4e5efac..danilo/feat/en-b1
```

### 1. Vuestra revisión v2: re-verificada entera, sigue cuadrando

Volví a pasar todos los comandos de vuestro `REVISION-HANDOFF-EN-B1-2026-07-26.md` contra el repo.
**No falla ninguna cifra**: 19 commits sobre la base, 1198 ficheros en el diff, 101 compartidos,
`dist/` 528 · `landing/` 306 (195 `.next` + 55 `out`) · `.bak` 16, los 73 + 71 ficheros de build en
`a50a89a`, 2675 bajo `eliminado/` en `52b670e`, 50 en `eliminado/docs/audit/`, los numstat de §2.6 y
§2.7 (`audit-pass-2.mjs` +179/−1376, `capitalizeNouns.mjs` +369/−1310, `partGate.mjs` +1/−105) y la
tabla de `availability.json` de §3. También los **6** docs EN de §4.3, que son exactamente:
`build-en_B1.json`, `cambridge-b1-blueprint-verification.md`, `etapa1-cierre-en-b1.md`,
`gates-en-applicability.md`, `residual-gaps.en_B1.json`, `validate-exam-fidelity.en_B1.json`.

Las cuatro decisiones (A/B/C/4.3) las doy por **aceptadas tal como las planteáis**, sin matices
nuevos más allá del de §4(C) que ya está abajo. Por mi parte no queda nada abierto.

### 2. (A) sigue sin hacerse — y es lo único que bloquea

En vuestro `main` de hoy (`0f99b5c`), medido:

```powershell
(git ls-tree -r --name-only origin/main -- dist/).Count       # 528
(git ls-tree -r --name-only origin/main -- landing/).Count    # 306
git ls-tree -r --name-only origin/main | Select-String '\.bak$' | Measure-Object   # 16
```

Idéntico a `a50a89a`. No hay ningún `git rm --cached`. Como el orden que acordamos en (B) empieza
por (A) y ese paso es vuestro, **todo está parado en el paso 1**.

De paso comprobé que (A) es seguro: `netlify.toml` tiene `command = "npm run build:site"` y
`publish = "dist"` en `[build]`; el `publish = "."` que aparece en el fichero es solo `[dev]`. `dist`
se regenera en cada deploy, no se pierde nada al desindexarlo.

### 3. Vuestros 9 commits nuevos: poco daño, pero más solape

Los he medido antes de opinar. Contra `origin/main` de hoy:

```powershell
git merge-tree --write-tree origin/main danilo/feat/en-b1 2>&1 | Select-String "CONFLICT" | Measure-Object
```

| Métrica | 26 jul | 5 ago |
|---|---|---|
| Conflictos totales | 236 | **237** |
| modify/delete (build) | 162 | **162** |
| add/add | 22 | **22** |

Es decir: nueve commits vuestros añadieron **un solo conflicto nuevo**. La divergencia no se ha
disparado y vuestra medición sigue siendo esencialmente válida.

Lo que sí ha crecido es el solape en el pipeline compartido. De los 71 ficheros que tocáis en esos
commits, **diez ya estaban en la lista de conflictos**: `js/ui/exam/examRunner.js`,
`js/ui/exam/examConfig.js`, `js/ui/exam/examGeneration.js`, `js/engine/personalExamCoverage.js`,
`js/engine/partTopicDetect.js`, `js/data/personalLesenTopicStock.js`, `js/services/claudeClient.js`,
`netlify.toml`, `netlify/functions/exam-part.js` y `netlify/functions/lib/reusablePartsStore.js`.

En `examRunner.js` el diff entre vuestra versión y la mía va ya por **+83/−187**, y el gate
`d.goetheFormat&&(!isQ)` sigue ahí sin tocar pese a que habéis editado el fichero. El opt-in de
`beta` tampoco está: `index.html` mantiene `/* staging: window.LEXICOIL_SHOW_BETA_LEVELS=true */`
comentado y `lc_show_beta` no existe en vuestro lado. Nada de esto es urgente por sí solo; lo digo
porque **cada semana sin (A) encarece el merge que luego resuelvo yo**.

### 4. Dos cosas menores de vuestro documento

- **§2.9** (`test-vocab-personalization.mjs`) podéis retirarlo: está respondido y medido en el §3 de
  este mismo documento desde el 26 de julio. El test lee `library/de/B1/questions.json` — banco
  alemán — y está rojo desde antes de la base común (586/586 en `4e5efac`, y ya fallaba el 10 de
  junio). No es un rojo nuevo del inglés.
- **`REVISION-HANDOFF-EN-B1-2026-07-26.md` no existe en ninguna rama del repo**, solo como fichero
  suelto. Si queréis que quede trazable junto al handoff y esta respuesta, metedlo en `docs/`.

### 5. Qué necesito (sin cambios respecto a §6)

1. **(A)** en `main`. Es lo único que bloquea.
2. El estado de `en/B1` para la tabla de §4(C): `hidden` hasta QA vuestro, o `beta`.
3. Si el arreglo de `test:engine` (§3.1) lo lleváis aparte o lo queréis dentro del PR.

En cuanto (A) esté arriba, mergeo vuestro `main`, resuelvo tomando vuestro lado en pipeline y
contenido DE, reaplico mis deltas EN y abro el PR el mismo día.

---

## 1. Resumen en una línea

Vuestra revisión **cuadra**: reverifiqué todas las cifras y no falla ninguna. Corrijo **un punto**
(§2.9, el test de `vocabularyTags`), que además esconde un problema mayor y vuestro. Acepto las
cuatro decisiones, con **un matiz en (C)**. Lo único que bloquea todo ahora mismo es **(A)**:
`main` sigue en `a50a89a`, sin el `git rm --cached`.

---

## 2. Lo que reverifiqué de vuestra revisión

Todo desde mi rama, `main` en `a50a89a`.

| Vuestra afirmación | Comando | Resultado |
|---|---|---|
| `main` = `a50a89a`, base = `4e5efac` | `git merge-base origin/main HEAD` | ✅ |
| 18 commits sobre la base | `git rev-list --count 4e5efac..HEAD` | ✅ hoy **20** (ver §5) |
| `dist/` 528 vs 0 | `git ls-tree -r --name-only <ref> -- dist/` | ✅ 528 / 0 |
| `landing/` 306 vs 56 | `git ls-tree -r --name-only <ref> -- landing/` | ✅ 306 / 56 |
| 236 conflictos · 162 modify/delete · 22 add/add | `git merge-tree --write-tree origin/main HEAD` | ✅ **idénticos** |
| Tabla `availability.json` (§3.1) | `git show <ref>:data/exams/availability.json` | ✅ exacta |
| Los docs EN no están en vuestro `eliminado/` (§3.2) | `git ls-tree -r --name-only HEAD` | ✅ y están **vivos** en mi rama: `docs/audit/etapa1-cierre-en-b1.md`, `docs/audit/gates-en-applicability.md` |
| Los dos bugs siguen en vuestro `main` | `git show origin/main:js/ui/exam/examRunner.js` | ✅ `d.goetheFormat&&(!isQ)` en L880; `lc_show_beta` no existe en `js/` |

Nota sobre los 236: **no se han movido** pese a los dos commits que añadí después de que midierais.
Vuestra medición sigue siendo válida tal cual.

Y me quedo con vuestra lectura de fondo, que es la correcta: **en el pipeline compartido vuestro
`main` es más grande que mi rama**, así que en el merge tomo vuestro lado y reaplico encima mis
deltas de inglés, que son pequeños. Eso es exactamente el orden que proponéis en (B).

---

## 3. Corrección a §2.9 — `test-vocab-personalization.mjs`

Escribís:

> «En **tu `main`**, `npm run test:engine` falla en `scripts/test-vocab-personalization.mjs`
> ("all questions have vocabularyTags") — no está en la lista de "ya rojos" del handoff.»

Es cierto que no estaba en mi lista. No es cierto lo que se deduce de ahí. **Ese test falla también
en la base común, y llevaba fallando semanas antes de que existiera mi rama.**

```bash
# el test lee library/de/B1/questions.json y exige vocabularyTags.length >= 3 en TODAS
git show <ref>:library/de/B1/questions.json > /tmp/qb.json
node -e 'const b=require("/tmp/qb.json"); const q=b.questions||[];
         console.log(q.length, q.filter(x=>(x.vocabularyTags||[]).length<3).length)'
```

| Ref | Fecha | Preguntas sin `vocabularyTags` |
|---|---|---|
| `8ae223d` | 10 jun | 28 / 28 → rojo |
| `f07d3f0` | 17 jun | 110 / 923 → rojo |
| **`4e5efac`** (**base común**) | 4 jul | **586 / 586 → rojo** |
| `feat/en-b1` (mi rama) | 26 jul | 809 / 809 → rojo |
| `main` `a50a89a` (vuestro) | 26 jul | 1295 / 2373 → rojo |

El fichero es `library/de/B1/questions.json`: **banco alemán**. Ni mi rama ni el trabajo en inglés
lo tocan en ese sentido — el test ya estaba rojo en el commit del que ambos partimos. El script
(`scripts/test-vocab-personalization.mjs`) no ha cambiado en ninguno de los dos lados desde la base:

```bash
git diff --stat 4e5efac HEAD        -- scripts/test-vocab-personalization.mjs   # vacío
git diff --stat 4e5efac origin/main -- scripts/test-vocab-personalization.mjs   # vacío
```

### 3.1 Lo importante: por eso `test:engine` no prueba lo que creemos

Ese test es el **6.º comando** de la cadena `&&` de `test:engine`, en los dos lados:

```bash
node -e 'const s=require("./package.json").scripts["test:engine"].split("&&");
         console.log(s.length, s.findIndex(x=>x.includes("test-vocab-personalization"))+1)'   # 66 6
```

Como la cadena es `&&`, **`npm run test:engine` aborta en el paso 6 y los 60 scripts restantes no
llegan a ejecutarse**. Y lleva así desde antes del branch point, para los dos. Eso explica por qué
la lista de "ya rojos" de mi handoff parecía arbitraria. Los encontré **corriendo los scripts uno a
uno**, que hoy es la única forma de verlos: de los siete, cuatro están en la cadena y **todos
después del paso 6** (`test-library-first` 21, `test-nav-routes` 25, `test-teil3-uniqueness` 33,
`test-exam-runner-render` 62), y los otros tres (`test-blueprint`, `test-personal-exam-normalize`,
`test-personal-modules`) **ni siquiera están en `test:engine`**.

Vosotros encontrasteis el síntoma real; lo que fallaba era la atribución. Dicho de otro modo: **la
suite completa no ha corrido verde para ninguno de los dos en meses**, y no lo sabíamos.

**No propongo arreglarlo dentro del merge del inglés** — el banco es vuestro y la decisión también.
Las tres salidas, en lo que a mí respecta, por orden de preferencia:

1. Cambiar `test:engine` a un runner que **ejecute todo y reporte al final** en vez de `&&`. Es lo
   que devuelve visibilidad; sin esto, cualquier otro arreglo tapa el siguiente rojo.
2. Rellenar `vocabularyTags` en el banco `de/B1` (1295 preguntas) con el script que ya usáis.
3. Relajar la aserción a un umbral (p. ej. ≥ 90 %) si la cobertura total nunca fue el objetivo real.

---

## 4. Vuestras cuatro decisiones — mis respuestas

### (A) Untrack de build — **sí, sin reservas**

Es lo que ya acordamos. Solo falta que lo subáis: **`main` sigue en `a50a89a`** y `dist/` tiene 528
ficheros trackeados. Mientras no esté, el paso 2 de (B) arrastra 162 conflictos modify/delete que
no significan nada.

### (B) Orden (A) → yo mergeo `main` → PR — **de acuerdo**

Es además la única vía: no tengo permiso de push en vuestro remoto. En cuanto (A) esté en `main`,
mergeo, resuelvo tomando vuestro lado en pipeline y contenido DE, reaplico mis deltas EN y abro el PR.

### (C) Qué niveles pasan a `live` — **de acuerdo, con un matiz**

Vuestro criterio manda aquí, y la opción conservadora me parece la correcta: `de/A2` + `de/B1` se
quedan `live`, `en/B1` no se publica hasta QA vuestro. No tenía forma de saber que ya teníais
`de/B1` live con 16 exámenes — de ahí el error del handoff que ya corregí en la v2.

**El matiz:** `data/exams/availability.json` conflicta (`UU`) y **tomar cualquiera de los dos lados
entero pierde algo**. Vuestro lado tiene `de/B1: live` (que yo no tengo); el mío tiene `en/B1: beta`
(que vosotros no tenéis, está en `hidden`). Lo resuelvo a mano así, salvo que digáis otra cosa:

| Nivel | Resultado propuesto | De dónde sale |
|---|---|---|
| `de/A2` | `live` | igual en los dos |
| `de/B1` | `live` (16) | **vuestro lado** |
| `en/B1` | `hidden` o `beta` — **vuestra decisión** | mi lado, con el estado que digáis |
| resto | como en vuestro `main` | vuestro lado |

Sobre `LEXICOIL_SHOW_BETA_LEVELS` en `index.html`: de acuerdo en **no** descomentarlo. El opt-in por
navegador (`localStorage.lc_show_beta='1'`, commit `1e8a50f`) cubre las pruebas sin exponer nada a
un visitante anónimo, y ese sí conviene que entre en el merge — sin él no arranca **ningún** examen
`beta`, tampoco los alemanes.

### (4.3) `eliminado/` como archivo muerto — **de acuerdo, y no hay nada que recuperar**

Los seis docs EN están vivos en `docs/audit/` de mi rama, así que llegan con el PR. Nada que
exportar aparte.

---

## 5. Novedad desde que medisteis (`1e8a50f` → `ffcc287`)

Dos commits nuevos. Ninguno cambia las cifras de merge de §2.

- **`56eb9be`** — la v2 del handoff, con los dos errores que encontrasteis corregidos.
- **`ffcc287`** — **cuatro defectos en el Reading de Cambridge**, encontrados conduciendo el módulo
  Quick en el navegador. Una sola causa compartida: **las heurísticas con forma Goethe deciden el
  tipo de tarea**, y como Cambridge marca cada respuesta con una letra, un multiple choice normal es
  indistinguible de un matching de Lesen T3.

  `isLesenAdsMatchingPart` clasificaba como "matching de anuncios" cualquier parte con un ítem con
  `correct:"A"` — en Cambridge, las Partes 1, 3 y 5. El ensamblador construía entonces un pool de
  anuncios compartido a partir de las opciones de **un solo ítem** y pasaba el strip de duplicados
  sobre el resto: la Parte 1 llegaba al renderer con 2 de sus 5 ítems, y los otros cuatro respondidos
  con listas de opciones que no eran suyas. Ahora el slot del blueprint (`signs_notices_mcq`,
  `long_text`, `mcq_gap_fill` frente a `person_text_matching`, `gapped_text`) **manda sobre la
  heurística de forma**. Además: la Parte 4 ya muestra el texto con huecos, la Parte 6 (open cloze)
  es un input de texto y no un `select` con solo el placeholder, y `normalizeLesenT3Part` exige que
  **todos** los ítems compartan la misma lista de opciones antes de sintetizar un pool.

  Toca `js/ui/exam/examRunner.js` y `js/ui/exam/examGeneration.js` (+39/−1). **Alemán intacto**:
  `test-exam-merge-pipeline`, `test-lesen-instruction-lang` y `adsMatching.cambridge-p2` verdes, y
  `test-exam-runner-render` falla en "ads T3: matching key radios" **idéntico con y sin el commit**
  (verificado haciendo stash).

Es el mismo patrón que los cinco de la prueba UX: **lo que ninguna validación de ficheros ve**. Si
vais a mirar una sola cosa del código compartido, que sea esta — el mecanismo (heurística de forma
en vez de slot del blueprint) puede morder igual a un examen alemán armado desde el pool.

---

## 6. Qué necesito de vosotros para desbloquear

1. **(A)**: el commit `git rm -r --cached dist landing/out landing/.next` en `main`. Todo lo demás
   espera a eso.
2. Decidir el estado de `en/B1` para la tabla de §4(C): `hidden` hasta QA vuestro, o `beta`.
3. Confirmar si el arreglo de `test:engine` (§3.1) lo lleváis vosotros aparte o lo quereis dentro
   del PR. Mi recomendación: **aparte y antes**, para que el PR se pueda validar de verdad.

En cuanto (A) esté arriba, hago el merge y abro el PR el mismo día.
