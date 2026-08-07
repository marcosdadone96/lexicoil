# CLAUDE.md

Contexto para agentes de IA que trabajan en este repo. **Todo lo de aquí está verificado contra el
código el 7 de agosto de 2026** (`main` en `e5fed38`). Si algo no cuadra, contrasta contra el repo
antes de asumir que este fichero tiene razón, y actualízalo.

---

## Qué es

Simulador de exámenes oficiales de idiomas: **Goethe** (alemán) y **Cambridge** (inglés).
Producción en https://www.lexicoil.com.

El stack real **no** es el que dice el brief del proyecto:

| Capa | Realidad |
|---|---|
| App | SPA en **JavaScript vanilla**, sin framework ni TypeScript, scripts clásicos en `index.html` |
| Landing | Next.js con export estático, en `landing/` (lo único con framework) |
| Despliegue | **Netlify** — Functions, Blobs, scheduled functions |
| Datos | **Doble**: Supabase (auth, sync, RLS) y Netlify Blobs (cuotas, usuarios legacy, pool, caché TTS) |
| IA | Claude en runtime · **Gemini** para generación offline de contenido |

## Reparto de trabajo

**Marcos lleva el alemán (Goethe). Danilo lleva el inglés (Cambridge).**

El reparto **no se sostiene en el código**: `js/`, `scripts/` y `netlify/functions/` son comunes
(~101 ficheros compartidos). Antes de tocar el pipeline, asume que el cambio afecta a los dos
idiomas y verifícalo. Territorio claro de cada uno:

- Alemán: `library/pool-seed/de_*.json`, `plantillas-{lesen,horen,schreiben,sprechen}-b1/`, `staging/de/`
- Inglés: `library/pool-seed/en_B1.json`, `plantillas-en-b1/`, `docs/audit/*en_B1*`

Danilo **no tiene push** al repo de Marcos (`origin`); trabaja en su fork (`mio`) y abre PRs.

---

## Trampas conocidas (léelas antes de tocar nada)

### 1. `npm ci` falla — el lockfile está desincronizado

`package.json` declara 6 dependencias; `package-lock.json` solo tiene 3. Faltan `@google/genai`,
`@sparticuz/chromium` y `puppeteer-core`. Entró en `52b670e` (21 jul 2026).

**Consecuencia: el CI llevaba rojo desde el 21 de julio sin llegar a validar nada** — moría en el
paso `Install dependencies`, y `ci:content`, `test:engine` y el job `pre-build-guard` se saltaban.

Arreglado en `7c41be1` con `npm install --package-lock-only`. Ojo a lo que eso destapa: el CI ya
arranca, y ahora muere más adelante, en `ci:content`. `validate:fidelity:all` corre con
`--live-only` y falla por los niveles **live** de alemán:

```
node scripts/validate-exam-fidelity.mjs --all --strict --live-only
e5fed38 → exit 1 · 29 exámenes, 0 pasan, 784 errores
```

Son 210 errores estructurales en `de/B1` y `de/A2` — `passages_per_part_mismatch` 65,
`sprechen_topic_missing` 51, `schreiben_max_words` 48, `items_total_mismatch` 19. Preexistente,
solo que llevaba tapado desde julio. Los niveles `beta` se reportan pero no tumban el build
(`enforceStrict`, `validate-exam-fidelity.mjs:179`).

El job no tiene `continue-on-error`, así que **muere en `ci:content` y `test:engine` ni se ejecuta**.

### 2. `npm run test:engine` aborta en el paso 6 de 70

La cadena son 70 comandos unidos con `&&`. El sexto es `test-vocab-personalization.mjs`, que exige
`vocabularyTags.length >= 3` en todas las preguntas de `library/de/B1/questions.json` y falla desde
antes de junio de 2026. **Los 64 restantes no llegan a ejecutarse.** Si necesitas verificar algo,
corre los scripts uno a uno; no confíes en que `test:engine` verde signifique nada.

En el CI esto ni se ve todavía: el job muere antes, en `ci:content` (trampa #1).

### 3. Las heurísticas de forma no distinguen Goethe de Cambridge

La causa raíz de casi todos los bugs del inglés. Ejemplo: Cambridge marca cada respuesta con una
letra, así que un `correct:"A"` hacía que `isLesenAdsMatchingPart()` clasificara como "matching de
anuncios" partes que eran multiple choice normal.

**Regla: el slot del blueprint manda sobre la forma del dato.** El patrón, repetido en cuatro
sitios (`examGeneration.js`, `examRunner.js` ×2, `personalLesenPoolFallback.js`):

```js
const slot = String(part.blueprintSlot || part.slotType || '').toLowerCase();
if (/mcq|multiple_choice|long_text|open_cloze/.test(slot) && !/matching|ads/.test(slot)) return false;
```

### 4. Funciones "por nivel" que en realidad son Goethe-only

Varias funciones despachan por nivel (A2/B1) pero asumen alemán. Si añades soporte de idioma,
**extiende la función existente con el eje `lang`**, no dupliques. Ya hecho en
`normalizeBatch.lesenSlotQuestionType(teil, level, lang)` y `audit-pass-2.blueprintForLevel(level, lang)`.
Un `lang` desconocido debe devolver `null` y dejar el tipo del blueprint intacto, nunca forzar el mapa Goethe.

Cuidado con lo que se pierde por el camino: `flattenExam()` propagaba `level` pero **descartaba
`lang`**, así que cualquier gating por idioma quedaba inerte.

### 5. Los checks del auditor son Goethe-específicos

`audit-pass-2.mjs` tiene ~35 checks (`CHK-*`). Están gateados con `isDe` los que validan formatos de
tarea Goethe: CHK-6, 6c, 7, 11, 16, 17, 20, 21 y `chkQ5GermanContent` (este marcaría como CRÍTICA
cada pregunta inglesa). **Al añadir un check nuevo, decide si aplica fuera del alemán.**

### 6. `index.html` carga scripts clásicos: cuidado con las globales

Todo `js/**` se carga como `<script>` clásico, así que las declaraciones top-level son globales
compartidas. Dos ficheros que declaren el mismo nombre = `SyntaxError` en parseo, y el segundo
fichero **no se ejecuta entero**. Ya pasó con `foldTopicKey` entre `b1Topics.js` y `a2Topics.js`.

Al editar un fichero de `js/`, **sube su `?v=N` en `index.html`** o los navegadores servirán el viejo.

---

## Comandos que importan

De los **257** scripts de `package.json`, estos son los que se usan de verdad:

```bash
npm run dev              # netlify dev → http://localhost:8888 (stack completo)
npx netlify dev --offline  # si la CLI pide login
npm start                # solo estático + proxy IA, sin cuotas

npm run ci:content       # build:availability + validate:fidelity:all (lo que corre el CI)
npm run validate:fidelity -- --lang en --level B1 --strict
node scripts/audit-pass-2.mjs batches/generated --fail-on=IMPORTANT
node scripts/audit-stored-exams.mjs --strict
```

Para probar cambios del motor de exámenes, estos cinco son rápidos y cubren ambos idiomas:

```bash
node scripts/lib/__tests__/adsMatching.cambridge-p2.test.mjs
node scripts/lib/__tests__/normalizeBatch.cambridge-map.test.mjs
node scripts/lib/__tests__/normalizeBatch.lang-guard.test.mjs
node scripts/test-lesen-instruction-lang.mjs
node scripts/test-exam-merge-pipeline.mjs
```

**Regresión del alemán:** corre `audit-pass-2.mjs` sobre `batches/generated` con y sin tu cambio y
compara las cifras. Deben ser idénticas si tu cambio es de inglés. Baseline actual del corpus:
**12 CRÍTICOS / 371 IMPORTANTES / 242 MENORES, 146 archivos, 820 preguntas.**

El baseline se mueve cuando entra contenido o checks nuevos, así que mídelo antes de tu cambio en
vez de fiarte de la cifra de aquí. Si comparas contra otra rama, hazlo sobre **el mismo corpus**
—el mismo `batches/generated`— o estarás comparando dos conjuntos de ficheros distintos.

---

## Dónde está cada cosa

```
js/engine/      motor de exámenes, validación, blueprints
js/ui/exam/     render y generación (examRunner.js, examGeneration.js — los dos grandes)
js/data/        catálogos estáticos (topics, availability)
js/services/    clientes de API
netlify/functions/   41 funciones · lib/ tiene la lógica compartida
scripts/        724 ficheros de pipeline offline · scripts/lib/ es la parte reutilizable
library/blueprints/  goethe_*.json, cambridge_*.json, dele_*.json
library/pool-seed/   pools servibles por lang_level
docs/           documentación viva
```

Ficheros grandes que conviene no empeorar: `examGeneration.js` (4.638 líneas),
`claude-chat.js` (1.707), `examRunner.js` (1.255).

## Estado del contenido

| Pool | Tamaño | Estado en `availability.json` |
|---|---|---|
| `de_A2` | 515 KB | live |
| `de_B1` | 483 KB | live, 16 exámenes |
| `en_B1` | 359 KB | beta, 3 exámenes |
| `de_B2` | 18 KB | beta |
| `en_*` (resto), `es_*` (DELE) | 4 bytes | hidden — no existen |

Los niveles `beta` solo son visibles con `localStorage.lc_show_beta = '1'`. Un visitante anónimo
no los ve, así que `beta` es seguro para QA.

## Docs de referencia

- `docs/CONTENT_LIVE_POLICY.md` — cuándo un nivel pasa a `live`
- `docs/PLAYBOOK_NUEVO_NIVEL.md` · `docs/LEVEL_BUILD_FLOW.md` — construir un nivel nuevo
- `docs/personal-exam-pool-first-architecture.md` — arquitectura del examen personalizado
- `docs/audit/gates-en-applicability.md` — qué gates aplican al inglés y cuáles no
- `docs/content-schemas.md` — esquemas del contenido

⚠️ `docs/handoff-en-b1-para-marcos.md` y `docs/respuesta-revision-en-b1-2026-07-26.md` son
**históricos**: describen la coordinación de julio, ya resuelta. No los leas como estado actual.

## Convenciones

- Comentarios y commits: **en español** para coordinación, **en inglés** para comentarios de código.
- Los mensajes de commit de este repo explican **por qué**, con la medición al lado. Sigue ese estilo.
- Cualquier cifra que afirmes, ponla junto al comando que la produjo. Es la convención de todos los
  docs de coordinación y la razón de que las revisiones cruzadas funcionen.
