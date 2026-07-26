# Handoff: inglés B1 + cambios en código compartido

**De:** Danilo · **Para:** Marcos · **Fecha:** 26 de julio de 2026
**Rama:** `feat/en-b1` → `https://github.com/Abelardo94/lexicoil` (remoto `mio`), commit `1e8a50f`
**Medido contra `main` = `a50a89a`** (tu push del 26/07) · **base común: `4e5efac`, 4 de julio**

> **Nota para quien lea esto con un agente de IA:** este documento describe cambios que **ya están
> hechos y commiteados** en otra rama. No es una lista de tareas para implementar. Lo que se pide es
> **revisión y tres decisiones** (sección 5). Todos los hashes, rutas y cifras son reales y
> reproducibles; el comando exacto con el que se midió cada número está indicado al lado. Si algo
> no cuadra, contrasta contra el repo antes de asumir que el documento tiene razón.
>
> Todas las mediciones son del **26 de julio, con `main` en `a50a89a`** (el push de esa mañana).
> Si `main` avanza, hay que rehacerlas: el comando está en la sección 5.

---

## 1. Para qué es esta rama

Cerrar la **Etapa 2** del plan de inglés: 3 exámenes de Cambridge B1 Preliminary publicados y
funcionando en la app. Eso está hecho y verificado en el navegador. Lo que necesito de ti es la
revisión del **código compartido** que hubo que tocar, porque afecta al alemán.

Cómo traer la rama:

```bash
git remote add danilo https://github.com/Abelardo94/lexicoil.git   # solo la primera vez
git fetch danilo
git checkout -b en-b1-review danilo/feat/en-b1
```

---

## 2. Lo importante: dos gates ocultos que hacían que **el alemán tampoco arrancara**

Esto no es específico del inglés y creo que es lo primero que deberías mirar.

### 2.1 Los módulos Quick renderizaban un examen vacío en los dos idiomas — `130c22a`

`js/ui/exam/examRunner.js` · `renderExam()` exigía `d.goetheFormat && !isQ` para usar el renderer
por partes. Los exámenes armados desde la library traen `lesenParts` / `horenParts` y **no** tienen
`d.lesen`, así que en modo quick caía a ramas que solo entienden las formas legacy singulares. No
renderizaba nada, y el guard de "no hay contenido" vive **dentro** de la rama que se saltaba, así
que ni siquiera avisaba: página en blanco silenciosa.

Arreglo: quitar el gate `!isQ`. `stripExamToSkills()` ya vacía los módulos no pedidos y
`renderGoetheExam` se salta los arrays de partes vacíos, así que renderiza exactamente un módulo.
`renderGoetheExam` recibe `isQ` pero nunca lo lee.

> El warning `[renumber] duplicate lesen numbers` que aparece por consola aquí es ruido:
> `js/engine/examRenumber.js:206` solo avisa, no rompe nada. Perdí un rato con eso.

### 2.2 Ningún nivel `beta` se puede abrir, en ningún idioma — `1e8a50f`

`js/library/levelAvailability.js` · `showBetaLevels()` solo miraba
`window.LEXICOIL_SHOW_BETA_LEVELS`, que **no lo define nada**: la línea de `index.html` que lo
ponía está comentada como "staging only". Sin ese flag, `getLevelUiStatus` convierte `beta` en
`soon` y el workspace responde con el modal "Coming soon".

Hoy **solo `de/A2` está `live`**. Todo lo demás (de A1/B1/B2/C1/C2 y en B1) es `beta` o `hidden`.
Es decir: poner un nivel en `beta` en `availability.json` **no basta** para que se pueda usar.

Añadí un opt-in por navegador, además del global existente:

```js
localStorage.setItem('lc_show_beta', '1')
```

**Deliberadamente no descomenté la línea de `index.html`**, porque eso viaja con el sitio y
expondría todos los niveles beta a cualquier visitante — es decisión de producto, tuya y mía, no
mía sola. Es la decisión (C) de la sección 5.

El lookup va envuelto en `try/catch` y con guard de `typeof`, porque estos dos ficheros también se
cargan en Node (tests, funciones de Netlify) donde no existe `localStorage`, y porque lanza en modo
privado.

---

## 3. Cambios en código compartido que tocan alemán

Ordenados por riesgo para el alemán. Los tres primeros modifican comportamiento que el alemán ya
usa; el resto son aditivos o lang-aware.

| # | Commit | Fichero | Qué cambia | Riesgo para el alemán |
|---|---|---|---|---|
| 1 | `130c22a` | `js/ui/exam/examRunner.js` | Quita el gate `!isQ` del renderer por partes | **Cambia el alemán**: los quick modules de/B1 y de/A2 también estaban en blanco y ahora renderizan. Es la corrección de un bug, pero es un cambio de comportamiento visible |
| 2 | `84e57a5` | `js/ui/exam/examGeneration.js` | `rebuildLesenAdsMatchingInstruction` ahora recibe el idioma | Alemán **intacto a propósito**: sigue reconstruyendo la instrucción en cada normalize para que los rangos de ítems y anuncios queden sincronizados. 5 de las 13 aserciones nuevas fijan justo eso, incluida la regla "schreiben Sie 0" |
| 3 | `ffac769` | `js/library/adsMatching.js` | Cambridge Reading P2 se arma como matching real (bloque A–H en `part.text`, mismas 8 líneas en las opciones de cada ítem) | Camino alemán separado; la ruta T3 de Goethe no cambia |
| 4 | `1e8a50f` | `js/library/levelAvailability.js`, `js/data/examLibrary.js` | Opt-in de beta por `localStorage` | Aditivo |
| 5 | (rama) | `js/library/ExamBlueprint.js` (+21) | Picker set-coherente para Cambridge | Solo se activa con blueprints Cambridge |
| 6 | (rama) | `js/engine/validation/blueprintFidelity.js` (+15/−4) | `segmentsTotal` en el blueprint Cambridge de `horen` | Solo Cambridge |
| 7 | (rama) | `scripts/publish-promote-candidates.mjs` (+31/−4) | Dos cosas: `verifyBlueprintComplete` deriva los slots esperados del **blueprint real** en vez del mapa `BLUEPRINT` hardcodeado (que es Goethe-B1); y la `BLACKLIST` de anglicismos C1/C2 solo se aplica con `lang === 'de'` — en inglés "hiking" o "swimming" son vocabulario B1 normal | Alemán se comporta igual (sigue usando `BLUEPRINT` por defecto y sigue filtrando), pero **es el punto donde yo miraría con más lupa** |
| 8 | (rama) | `scripts/audit-pass-2.mjs` (+40/−14) | Lang-aware | Ídem |
| 9 | (rama) | `scripts/lib/normalizeBatch.mjs` (+46/−39), `scripts/lib/capitalizeNouns.mjs` (+211/−61) | Guards de idioma: la capitalización de sustantivos alemana ya no corre sobre EN/ES; `TEIL_QUESTION_TYPE` solo para `de` | Tests de regresión en `scripts/lib/__tests__/normalizeBatch.lang-guard.test.mjs` |
| 10 | (rama) | `scripts/pipeline/lib/candidateBuilder.mjs` (+19) | Conserva los textos de los distractores del matching | Aditivo |

Scripts nuevos, ninguno destructivo (**dry-run por defecto**, idempotentes, sin llamadas a API):

- `scripts/sync-speaking-prompts.mjs` — espeja los prompts de speaking del banco a
  `library/<lang>/<level>/writing-speaking.json`. Hizo falta porque
  `ContentServable.assessLevel` cuenta los prompts **solo** desde ese fichero, nunca desde
  `questions.json`. En en/B1 ese array seguía siendo el stub vacío, así que el nivel entero
  reportaba `servable:false` ("Content is being prepared for this level") aunque las 12 preguntas
  `sprechen` llevaban ahí desde el principio. **Esto le puede pasar a cualquier nivel nuevo.**
- `scripts/repair-en-p2-matching.mjs` — reparó los 3 curated en/B1 que ya tenían la forma rota
  baked in. Se niega a escribir si alguna respuesta correcta cae fuera de las claves recuperadas.
- `scripts/test-lesen-instruction-lang.mjs` — 13 aserciones sobre la instrucción de matching.

Y un detalle de infraestructura: `--all-served` recorría una lista fija `[de/B1, de/A2]`, así que
el TTS del inglés nunca se comprobaba (`cc79eaa`). Añadido en/B1: los 70 clips de los 3 exámenes
servidos ya estaban cacheados.

### Cómo verificar

```bash
npm run test:engine
node scripts/test-lesen-instruction-lang.mjs
node scripts/lib/__tests__/adsMatching.cambridge-p2.test.mjs
npm run validate:fidelity -- --lang en --level B1 --strict   # 3/3, 0 errores
node scripts/audit-stored-exams.mjs --strict                  # en_B1 sin hallazgos
```

**Tests que ya estaban rojos antes de tocar nada** (verificados uno a uno haciendo `stash` del
cambio y volviendo a correr — no los persigas achacándolos al inglés):
`test-blueprint.mjs` ("de B2 lesen parts"), `test-teil3-uniqueness.mjs` ("7 distinct keys valid"),
`test-exam-runner-render.mjs` ("ads T3: matching key radios"), `test-personal-exam-normalize.mjs`
(`dedupeModulePartsByTeil is not defined`), `test-personal-modules.mjs` ("missing ads detected"),
`test-library-first.mjs`, `test-nav-routes.mjs`, y `audit-stored-exams.mjs --strict` (85
bloqueantes, **todos** `de_A1`/`de_A2`, `passage_missing:reading[3]`). Esos 85 son tuyos, y creo
que merecen una pasada.

Dos avisos si corres esto en Windows:

- Cualquier script de audit/validate reescribe `docs/audit/*.json` con rutas en barra invertida y
  timestamp nuevo. Es ruido, descártalo.
- Al previsualizar en el navegador hay que forzar una recarga real: cambiar solo el hash de la URL
  no recarga la SPA y deja datos viejos en memoria. Y `Start now →` es el camino de generación por
  IA, que en local falla con "AI service is not configured on the server"; para contenido de
  library hay que usar los módulos Quick.

---

## 4. La rama trae más que inglés

Sinceridad sobre el tamaño: `feat/en-b1` son **17 commits sobre `4e5efac`**. Siete son el inglés B1
(los de arriba). Los otros diez están en mi `main` local y tampoco los has visto — son el trabajo
híbrido:

```
34fbc01 hybrid-exam: pool-first exam planning and on-demand part generation
81760ac pool-first: searchable pool index with topic tags and vocab scoring
ba736d1 pipeline: English B1 generation path, blueprint v3 and audit gates
d308312 blobs: strict seed-to-blob sync with backup, restore and verification
bb4bab3 official-exams: E1-E5 publishing checks and capitalization audit
0acc9cf app: wire the hybrid exam flow into the client
3f9e1ef functions: topic-aware part serving and quality gate updates
f5623d3 content: English B1 corpus, German B1 pool growth and bank fixes
54e5582 config: wire hybrid functions and new npm scripts
e270f94 git: ignore build outputs and every .env variant; untrack artifacts
```

Si prefieres revisar por partes, el corte natural es: **`e270f94` (higiene de git, sección 5)** →
**`34fbc01..54e5582` (híbrido)** → **`ffac769..1e8a50f` (inglés B1)**.

El diff total es de 1197 ficheros, pero eso engaña: unos 794 son el **borrado** del output de
build que ya estaba en `.gitignore` (528 de `dist/`, 250 de `landing/.next|out`, 16 `.bak` — ver
sección 5A). El código compartido de verdad son ~103 ficheros entre `js/`, `scripts/lib/` y
`netlify/functions/`.

**Lo que aprendí y creo que nos afecta a los dos:** el reparto "Danilo = inglés / Marcos = alemán"
**no se sostiene en el repo**. El contenido sí se separa por idioma, pero el pipeline generador no:
`scripts/lib/`, `netlify/functions/`, `js/engine/` y `js/ui/exam/` son comunes. Por eso divergir
mucho tiempo sale caro. Propongo sincronizar más a menudo aunque sea en trozos pequeños.

### 4.1 Y tú vas por delante en varios de esos ficheros

Al medir el merge contra `a50a89a` sale una cosa que cambia el orden de todo: **en buena parte del
pipeline compartido, tu versión es bastante más grande que la mía.** Diferencia en líneas yendo de
tu versión a la mía (`git diff --numstat a50a89a:F HEAD:F`):

| Fichero | +añade / −quita respecto a lo tuyo |
|---|---|
| `scripts/audit-pass-2.mjs` | +179 / **−1376** |
| `scripts/lib/capitalizeNouns.mjs` | +369 / **−1310** |
| `scripts/generate-lesen-part-gemini.mjs` | +162 / **−1194** |
| `scripts/lib/generatePartGeminiLib.mjs` | +74 / **−804** |
| `scripts/lib/lesenTemplatePrompt.mjs` | +39 / **−759** |
| `scripts/lib/repairTriage.mjs` | +12 / **−342** |
| `js/engine/personalLesenPoolFallback.js` | +12 / **−240** |

> **Ojo al leer estas cifras junto a la tabla de la sección 3: no miden lo mismo.** La de la
> sección 3 es *mi cambio* respecto a la base común (`4e5efac..HEAD`) — por eso `audit-pass-2.mjs`
> sale ahí como +54/−14. Esta de aquí es *la distancia entre tu versión y la mía hoy*
> (`a50a89a` → `HEAD`), y sale −1376 porque incluye todo lo que tú le has añadido desde el 4 de
> julio. Las dos son correctas; no se contradicen.

Esas cifras de "−" son trabajo tuyo que mi rama no tiene. **Yo no quiero pisar nada de eso.** En
casi todos esos ficheros mi cambio real es pequeño (un guard de idioma, un parámetro `lang`), así
que lo sensato es lo contrario de lo que propone un merge normal: **partir de tu versión y volver
a aplicar encima mis deltas**, no al revés. Puedo hacerlo yo si me confirmas que tu `main` es la
referencia buena en esos ficheros.

### 4.2 Los ficheros del híbrido son "add/add": mismo código, cero ancestro común

21 de los 46 conflictos de código son de este tipo — el fichero **no existe en la base `4e5efac`
pero sí en los dos lados**. Git no tiene ancestro con el que comparar, así que marca conflicto
aunque el contenido sea casi idéntico:

| Fichero | tuyo → mío |
|---|---|
| `scripts/lib/hybridExamPlan.mjs` (368 L) | +3 / −2 |
| `scripts/lib/hybridLesenAssembly.mjs` (478 L) | +4 / −2 |
| `netlify/functions/lib/loadPoolIndex.js` | +2 / −2 |
| `netlify/functions/lib/hybridExamWebExecute.js` | +1 / −10 |
| `scripts/lib/partGate.mjs` (269 L tuyo, 165 mío) | +1 / **−105** ← este sí diverge |

O sea: **el código híbrido ya lo tienes tú, prácticamente igual que yo** (llegó fuera de git en
algún momento). Son 21 conflictos que asustan en el listado y se resuelven eligiendo un lado. La
excepción es `partGate.mjs`, donde tu versión tiene 105 líneas que la mía no — ahí me quedo con la
tuya y le vuelvo a pasar el `lang:'en'` que necesita el inglés.

**Lo que esto significa de verdad:** duplicamos esfuerzo sin darnos cuenta porque el código viajó
por fuera del repositorio. Merece la pena arreglar el flujo, no solo este merge.

### 4.3 `eliminado/` se llevó la documentación del inglés

En `52b670e` moviste 2675 ficheros a `eliminado/` (1854 de `batches/`, 348 de `_archive/`, 127 de
`scripts/`…). Entre ellos, **`docs/audit/` entero — los 50 ficheros**, incluida la documentación de
las etapas del inglés:

```
eliminado/docs/audit/etapa1-cierre-en-b1.md
eliminado/docs/audit/gates-en-applicability.md
eliminado/docs/audit/cambridge-b1-blueprint-verification.md
eliminado/docs/audit/build-en_B1.json
eliminado/docs/audit/residual-gaps.en_B1.json
eliminado/docs/audit/validate-exam-fidelity.en_B1.json
```

Doy por hecho que fue una limpieza y no una decisión sobre esos ficheros concretos. Solo dime si
`eliminado/` es un archivo muerto (y entonces recupero los seis de arriba a `docs/audit/`) o si es
la nueva ubicación buena. Ahora mismo el plan del inglés apunta a rutas que en tu `main` ya no
existen.

---

## 5. Las tres decisiones que necesito de ti

(Hay una cuarta, menor, en la sección 4.3: si `eliminado/` es un archivo muerto o la ubicación
buena.)

### (A) `dist/` y `landing/out` ya están en `.gitignore` — solo falta sacarlos del índice

Esto lo tenía yo apuntado como un desacuerdo de criterio entre los dos. **Al medirlo hoy resulta
que no lo es: ya estamos de acuerdo, y desde antes de separarnos.** El `.gitignore` de la base
común `4e5efac` — que es tuyo, viene de `65e3fcf` — ya trae:

```
dist/              (línea 5)
landing/.next/     (línea 10)
landing/out/       (línea 11)
```

El problema es puramente mecánico: **`.gitignore` no afecta a ficheros que ya están trackeados.**
Se ignora lo que aún no está en el índice; lo que ya entró sigue entrando en cada `git add -A`
para siempre. Por eso tu último commit `a50a89a` arrastra 73 ficheros de `dist/` (+123.919 líneas)
y 71 de `landing/out/`, sin que tú hayas decidido nada: te los mete `git add` solo.

Estado actual del índice:

| | `main` (`a50a89a`) | `feat/en-b1` |
|---|---|---|
| ficheros bajo `dist/` versionados | 528 | 0 |
| ficheros bajo `landing/` versionados | 306 (250 son `.next/` y `out/`) | 56 (exactamente la fuente) |
| ficheros `.bak` versionados | 16 | 0 |

Y lo que cuesta, medido hoy con
`git merge-tree --write-tree --name-only HEAD origin/main`:

| Zona | Conflictos | |
|---|---:|---|
| `dist/` | 87 | output de build |
| `landing/out/` | 75 | output de build |
| **subtotal artificial** | **162** | **69% del total** |
| código compartido (`js/`, `scripts/`, `netlify/`) | 46 | lo único que hay que revisar de verdad |
| contenido y datos (`library/`, `data/`, `staging/`…) | 10 | mayoritariamente tuyos, me quedo con tu versión |
| `eliminado/` (sección 4.3) | 12 | |
| `.gitignore`, `index.html`, `netlify.toml`, `package.json`, 2 plantillas | 6 | |
| **TOTAL** | **236** | |

**162 de 236 conflictos no existen.** Son ficheros que Netlify regenera en cada deploy
(`netlify.toml` declara `command = "npm run build:site"` y `publish = "dist"`), y que tú mismo ya
marcaste como ignorables.

La corrección es un commit tuyo en `main`, sin tocar nada en disco:

```bash
git rm -r --cached dist landing/out landing/.next
git ls-files '*.bak' | xargs -r git rm --cached      # PowerShell: git ls-files '*.bak' | %{ git rm --cached $_ }
git commit -m "chore(git): untrack build output already covered by .gitignore"
```

`--cached` saca del índice pero **no borra nada de tu disco**. El único efecto real es que quien
haga `checkout` de un commit anterior ya no verá esos ficheros en el árbol: si algún deploy
depende de que `dist/` esté versionado en vez de generarse, dímelo antes, porque entonces esta
premisa es falsa y me callo.

En mi rama esto ya está hecho (`e270f94`), junto con ignorar todas las variantes de `.env` —
`.env.bak-*` llegó a contener claves reales, y eso conviene mirarlo aparte de este merge.

### (B) ¿Merge o PR, y en qué orden?

Yo no tengo permiso de escritura en `marcosdadone96/lexicoil` (`git push` me da 403), así que el
código está en mi fork. Puedo abrir un PR contra `main` o puedes hacer fetch y mergear tú.

Visto lo de la sección 4.1 — que en varios ficheros del pipeline tú vas por delante — **el orden
que propongo es este, y el grueso del trabajo lo hago yo**:

1. Tú aplicas (A) en `main`. Un commit, cinco minutos, y desaparecen 162 de los 236 conflictos.
2. Yo mergeo tu `main` **dentro** de mi rama y resuelvo, tomando tu lado por defecto en todo
   `scripts/lib/`, `js/engine/` y contenido alemán, y volviendo a aplicar encima mis deltas de
   idioma (que son pequeños).
3. Te llega un PR ya sincronizado, sin conflictos, contra un `main` que no he tocado.

Así tú revisas cambios pequeños sobre tu propio código en vez de un merge de 236 ficheros, y yo
asumo el coste de haber divergido tres semanas, que es justo.

### (C) ¿Qué niveles pasan a `live`?

Hoy solo `de/A2`. en/B1 está en `beta` con 3 exámenes válidos, y de/B1 lleva tiempo en beta. Con
el gate de la sección 2.2 tal como está, **ningún visitante puede abrirlos**. Hay que decidir qué
se expone y cuándo — y si la respuesta es "todavía no", entonces la línea comentada de `index.html`
se queda como está y esto no bloquea nada.

---

## 6. Resumen en una línea

El inglés B1 está listo y verificado en el navegador. De los 236 conflictos que hay ahora mismo
entre tu `main` y mi rama, **162 son output de build que los dos ya damos por ignorable** y
desaparecen con un `git rm --cached` tuyo; de los 46 de código, 21 son ficheros del híbrido que ya
tienes casi idénticos. Lo que queda para revisar entre los dos es pequeño, y el merge lo hago yo
partiendo de tu versión.

Lo único que te pido para arrancar es el punto (A).
