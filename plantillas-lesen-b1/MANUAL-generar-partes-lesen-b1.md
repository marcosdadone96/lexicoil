# Manual paso a paso — Generar partes de Lesen B1 con cualquier IA

Pensado para que lo sigas sin saber el detalle interno. Cada paso dice **qué hacer**,
**el comando exacto** y **dónde guardar**. Al final, una sección de errores típicos.

---

## La idea en una frase

Vas a **fabricar partes de examen** (textos + preguntas) pidiéndoselas a cualquier IA
(ChatGPT, Gemini, Claude) con una **plantilla por Teil**, las **validas** con un comando, y
si pasan, las **subes al pool**. El usuario nunca verá la IA: solo verá estas partes ya
hechas y validadas. Cuantas más metas, mejor cobertura de vocabulario y más variedad.

**Importante (responde a tu duda):** los scripts de validación **NO se cambian**. El
validador `validate-batch.mjs` ya entiende el formato que producen las plantillas. Lo único
nuevo que ya tienes son el report de cobertura y el enrich de vocabulario.

---

## Qué necesitas (una vez)

- Los 5 archivos de plantilla: `plantillas-lesen-b1/lesen-teil1.md` … `lesen-teil5.md`.
- Tu proyecto con los scripts (ya los tienes).
- Una carpeta donde guardar lo que genere la IA. Usaremos `batches/generated/` (créala si no
  existe).

---

## El ciclo completo (resumen)

```
1. MEDIR        → qué palabras faltan (report de cobertura)
2. GENERAR      → pegar plantilla + palabras a una IA → te da un JSON
3. GUARDAR      → guardas ese JSON en batches/generated/
4. VALIDAR      → un comando; si falla, te dice qué arreglar
5. SUBIR AL POOL→ ingest → assemble → promote → enrich
6. RE-MEDIR     → ves cómo sube la cobertura. Repites.
```

---

## Paso 1 — Medir qué falta

```cmd
node scripts/vocab-coverage-report.mjs --lang de --level B1
```
Esto escribe `data/coverage/weak-de_B1.json` con los **lemas flojos** (los que casi no
aparecen en el pool). Abre ese archivo: la lista `weakLemmas` son las palabras objetivo.
Copia un puñado (8-12) para usarlas en el paso 2.

---

## Paso 2 — Generar una parte con una IA

1. Abre la plantilla del Teil que quieras, p. ej. `plantillas-lesen-b1/lesen-teil1.md`.
2. **Copia todo su contenido.**
3. En la plantilla hay una línea de **PALABRAS OBJETIVO**: sustitúyela por 8-12 palabras de
   tu `weakLemmas` (separadas por comas).
4. Pega todo en ChatGPT / Gemini / Claude.
5. La IA te devuelve texto (a veces con ``` alrededor). **No hace falta limpiarlo a mano.**

### Opción A — Gemini/ChatGPT web (sin API key) — recomendado

Abre `plantillas-lesen-b1/lesen-teilN.md` (N = 1…5). Cada plantilla trae **PALABRAS OBJETIVO**
por defecto (8–12 lemas B1); cámbialas por lemas de `weak-de_B1.json` si quieres cubrir huecos.

**Una parte:** pega la respuesta en `batches/inbox/respuesta.txt` y ejecuta:

```cmd
npm run lesen:upload -- --teil N --file batches/inbox/respuesta.txt --tag gemini
```

**Varias partes en un bloc** (`batches/inbox/todo.txt`):

```
=== TEIL 1 ===
{ ... json ... }

=== TEIL 2 ===
{ ... json ... }
```

```cmd
npm run lesen:upload -- --file batches/inbox/todo.txt --tag gemini --continue
```

Eso **extrae cada JSON**, valida las **3 puertas** (formato + calidad + CEFR) y guarda en
`batches/generated/` **solo si pasan**. `--continue` procesa todos aunque uno falle.

Para subir al pool Netlify en el mismo paso (ingest + promote + sync):

```cmd
npm run lesen:upload:pool -- --file batches/inbox/todo.txt --tag gemini --continue
```

Solo validar sin guardar (dry-run de extracción):

```cmd
node scripts/paste-lesen-inbox.mjs --file batches/inbox/todo.txt --tag gemini --continue --save-only
```

### Opción B — Guardar JSON a mano

Copia solo el JSON y guárdalo como:
```
batches/generated/lesen-t1-chatgpt-001.json
batches/generated/lesen-t3-gemini-002.json
```
Asegúrate de que el archivo contiene **solo el JSON** (sin texto antes/después, sin ```).

---

**Si usaste Opción A (paste)** y el script terminó con ✅, puedes saltar al Paso 5.
Si usaste Opción B, valida manualmente:

```cmd
node scripts/validate-batch.mjs --lang de --level B1 --file batches/generated/lesen-t1-chatgpt-001.json
```

Qué comprueba:
- Que el JSON es válido.
- Que cada pregunta tiene los campos obligatorios (`id`, `module`, `question`,
  `correctAnswer`) y que `teil` es un **número** (no texto).
- Que los IDs **no chocan** con los que ya hay en el banco.
- Que el tipo de pregunta es el correcto para ese Teil (richtig_falsch, multiple_choice…).
- Que encaja en el blueprint (nº de preguntas, formato).

**Si sale OK** → pasa al paso 4b (calidad pedagógica).
**Si sale con problemas** → te lista qué falla (p. ej. "teil es texto", "falta
correctAnswer", "id ya existe"). Vuelve a la IA, dile el error y que lo corrija, re-guarda y
re-valida. No pasa nada por repetir; es gratis.

---

## Paso 4b — Calidad pedagógica Goethe (recomendado)

Comprueba anti–word-matching, distractores y trampas de examen. Sustituye `N` y la ruta:

```cmd
node scripts/check-lesen-batch-quality.mjs --teil N --file batches/generated/lesen-tN-xxx-001.json
```

**Si sale OK ✅** → adelante al pool.
**Si falla** → corrige el JSON (o pide a la IA que lo rehaga siguiendo la sección *Goethe Hard Mode* de la plantilla) y repite 4 + 4b.

## Paso 4c — Pre-ingest CEFR (longitud + vocabulario B1)

Comprueba longitud mínima y cobertura léxica B1 (umbral **75%**, antes 85%):

```cmd
node scripts/check-lesen-batch-ingest.mjs --file batches/generated/lesen-tN-xxx-001.json
```

**Causas habituales de fallo:**
- **Texto demasiado corto** (p. ej. T1 con 130 palabras; mínimo **150**, objetivo **165-200**).
- **Cobertura <75%** por términos raros (Design, Begabung…) — usa léxico frecuente de las plantillas.

> **Por qué Gemini acorta:** las plantillas decían "150-220" pero el ejemplo JSON tenía ~119 palabras. Los modelos imitan el ejemplo, no la regla. Las plantillas v2 exigen conteo explícito y ejemplos más largos.

Generación automática con Gemini (incluye validación + calidad + reintentos):

```cmd
npm run generate:lesen:gemini -- --teil 1
npm run check:lesen:quality -- --teil 3 --file batches/generated/lesen-t3-gemini-001.json
```

Referencia de calidad ya validada al ~100 % (ejemplos también en cada plantilla):
- `plantillas-lesen-b1/lesen-teil1.md` … `lesen-teil5.md` (JSON al final de cada archivo)
- `batches/generated/lesen-tN-gemini-001.json` (N = 1…5)

> Truco: pídele a la IA "IDs aleatorios con prefijo gen-..." para no chocar nunca con el banco.

---

## Paso 5 — Subir al pool (solo si validó OK)

Tres comandos, en este orden:

**5.1 Ingerir a staging** (mete la parte en la cola de contenido):
```cmd
node scripts/ingest-to-staging.mjs --lang de --level B1 --file batches/generated/lesen-t1-chatgpt-001.json --auto-approve
```

**5.2 Ensamblar y promover al pool** (sube el tope a 50):
```cmd
npm run assemble:b1:10
npm run promote:b1:12 -- --max 50 --max-per-topic 4
```

**5.3 Etiquetar vocabulario** (para que el pool sepa qué palabras contiene cada parte):
```cmd
node scripts/enrich-reusable-vocab.mjs --lang de --level B1 --apply
```
(necesita `NETLIFY_SITE_ID` y `NETLIFY_API_TOKEN` en la sesión, como en el seed)

---

## Paso 6 — Re-medir

```cmd
node scripts/vocab-coverage-report.mjs --lang de --level B1 --source blobs
```
Verás bajar el "sin cubrir". Vuelve al Paso 1/2 y repite, apuntando a los lemas que sigan
flojos. Así, tanda a tanda, profundizas el pool.

---

## La PRIMERA vez: haz una sola parte de punta a punta

Antes de generar muchas, haz **una** parte completa (pasos 2→6) y comprueba que aparece en
el pool abriendo en el navegador:
```
https://www.lexicoil.com/.netlify/functions/exam-part?lang=de&level=B1&module=lesen&teil=1
```
Si tras varias recargas ves tu texto nuevo (y trae `vocab`), el circuito funciona y ya puedes
generar en volumen con confianza.

---

## Errores típicos y qué significan

- **"teil es texto"** → en el JSON, `teil` debe ser `1` (número), no `"1"`. Dile a la IA.
- **"falta correctAnswer"** → cada pregunta necesita `correct` Y `correctAnswer`, iguales.
- **"id ya existe en el banco"** → la IA reusó un id del ejemplo. Pídele ids aleatorios.
- **"passageId inexistente / es null"** → en Teil 3 (anuncios) NO pongas `passageId`;
  omítelo. En T1/T2/T4/T5, el `passageId` de cada pregunta debe coincidir con el `id` de un
  passage del mismo archivo.
- **"type_not_allowed"** → el tipo de pregunta no es el del Teil (p. ej. multiple_choice en
  Teil 1 que es richtig_falsch). Revisa la regla de la plantilla.
- **JSON inválido** → la IA metió texto o ``` alrededor. Deja solo el objeto JSON.
- **Pronombres mezclados (T1)** → el pasaje usa *ich* pero unas afirmaciones dicen *sie* y otras *er*.
  Unifica todo en *sie/ihre* o todo en *er/seine*.
- **Cobertura CEFR <75%** → demasiados términos raros o demasiadas palabras objetivo forzadas.
  Usa 8–12 lemas frecuentes B1.

---

## Qué NO cambia (para tu tranquilidad)

- Los scripts de validación: se usan tal cual.
- El formato del pool: lo convierte la pipeline (assemble/promote) automáticamente.
- El runtime del usuario (A.2/A.3/A.4): ya está; estas partes nuevas las consume igual.

Lo único nuevo en todo esto son las **plantillas por Teil** y el **report de cobertura**, que
ya tienes.

---

## Objetivo actual: 50 partes Lesen por Teil

Prioridad **solo Lesen** (T1–T5). Meta: **50 partes válidas en el pool por cada Teil**
antes de abrir Hören/Schreiben/Sprechen.

```
Lesen T1 → 50   Lesen T2 → 50   Lesen T3 → 50   Lesen T4 → 50   Lesen T5 → 50
```

Comprueba cuántas tienes en el admin o con:

```cmd
npm run assemble:b1:10
npm run promote:b1:12 -- --max 50 --max-per-topic 4
```

Genera en tandas (p. ej. 10 Teil 1 de golpe con `paste-lesen-inbox`), sube solo las que
pasen las 3 puertas (formato + calidad + CEFR), y repite hasta 50.

---

## Aviso: palabras objetivo (8–12, no 15)

| Qué crees | Qué pasa en realidad |
|-----------|----------------------|
| Pones **15 palabras** en PALABRAS OBJETIVO | En ~190 palabras (T1) **no caben todas** de forma natural; la IA fuerza términos raros y **baja la cobertura CEFR** (<75%). |
| Generas **solo Lesen** | Mejoras el pool de **lectura**; Hören tiene **sus propias partes** y otro vocabulario en audio. |
| El alumno hace **un examen** | Ve **una** parte aleatoria por Teil (Lesen + Hören + …), no todas tus palabras objetivo en la misma sesión. |

**Regla práctica:** elige **8–12 lemas** de `weakLemmas`, preferiblemente **frecuentes en B1**
(Bewohner, Kurs, Nachbar, Wohnung…). Evita forzar lemas muy literarios (`empfand`, `bloß`,
`funktional`) si no están en tu lista objetivo.

**Teil 1 extra:** el pasaje usa **ich**; todas las afirmaciones deben referirse igual — solo
**sie/ihre** *o* solo **er/seine**, nunca mezclar en el mismo batch.
