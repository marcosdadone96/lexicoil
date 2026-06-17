# LexiCoil — Guía de creación de contenido (todas las celdas)

Esta guía deja el proyecto listo para que **solo tengas que crear contenido**. Cubre: dónde va cada cosa, los esquemas exactos, las longitudes por examen/Teil, el pipeline, la calibración del CEFR gate por idioma y la lista de verificación para dar una celda por cerrada.

Hay 18 celdas: **3 idiomas** (de=Goethe, en=Cambridge, es=DELE) × **6 niveles** (A1–C2). Hoy solo `de/B1` está completa. El motor ya está listo para todas.

---

## 0. ⚠️ Lo más importante (un detalle que cuesta caro descubrir)

Los **pasajes y transcripts viven DENTRO de `library/<lang>/<level>/questions.json`**, en un array `passages` que está al mismo nivel que `questions`. **Ese es el array que usa el ensamblador** (`ExamBuilder.buildHorenParts`/`buildLesenParts` leen `bank.passages`).

Existe además un archivo `library/<lang>/<level>/passages.json` que es un **espejo**. Si editas solo `passages.json`, **el examen no cambia**. Edita siempre el array `passages` de `questions.json` (y, para mantener coherencia, replica el cambio en `passages.json`).

```
library/de/B1/
  questions.json   ← { meta, passages:[...], questions:[...], vocabulary:[...] }  ← FUENTE REAL
  passages.json    ← { passages:[...] }  ← espejo, mantener sincronizado
  writing-speaking.json
```

---

## 1. Estructura de archivos por celda

Cada celda `library/<lang>/<level>/` necesita:

| Archivo | Contenido |
|---|---|
| `questions.json` | `meta`, `passages[]` (lecturas + transcripts de audio), `questions[]`, `vocabulary[]` |
| `passages.json` | espejo de `passages[]` |
| `writing-speaking.json` | `meta`, `writing[]`, `speaking[]` |

Y un **blueprint** en `library/blueprints/<exam>_<level>.json` que define la estructura oficial (Teile, nº de ítems, longitudes). Los blueprints de `goethe_B1` y `goethe_B2` están desarrollados; **los de A1/A2/C1/C2 de Goethe y TODOS los de cambridge/dele son esqueletos** y hay que completarlos con la estructura oficial real antes de poblar contenido (ver §6).

---

## 2. Esquemas exactos (ejemplos reales del banco de/B1)

### Pregunta de lectura — Richtig/Falsch (Lesen Teil 1)
```json
{
  "id": "l1", "module": "lesen", "type": "richtig_falsch", "teil": 1,
  "question": "Urban-Gardening-Projekte werden in deutschen Städten immer beliebter.",
  "options": [], "correct": "Richtig", "correctAnswer": "Richtig",
  "passageId": "p-lesen-t1-579cc63bde",
  "explanation": "", "grammarTags": [], "topicTags": ["umwelt"],
  "vocabularyTags": ["beliebt","urban-gardening"], "difficulty": 4
}
```

### Pregunta de opción múltiple (Lesen Teil 2 / Teil 5)
```json
{
  "id": "de-b1-l-p2-q1", "module": "lesen", "type": "multiple", "teil": 2,
  "question": "Warum bewirbt sich Laura laut Anzeige?",
  "options": ["a) Für eine Teilzeitstelle im Kundenservice.","b) ...","c) ...","d) ..."],
  "correct": "a", "correctAnswer": "a",
  "passageId": "de-b1-p-work",
  "explanation": "...", "topicTags": ["work"], "difficulty": 4, "skills": ["reading"]
}
```

### Matching de anuncios (Lesen Teil 3) — admite respuesta `"0"`
Las opciones son los anuncios `a)…j)`. `correct` es la letra del anuncio que encaja, **o `"0"` si ninguno encaja** (convención oficial Goethe; el validador ya la acepta).
```json
{ "id":"...", "module":"lesen", "type":"matching", "teil":3,
  "question":"Situation 13: Jemand sucht …",
  "options":["a) Anzeige …","b) …", "... j) …"],
  "correct":"c", "correctAnswer":"c", "passageId":"…", "difficulty":4 }
```

### Hören con "notas" (Teil 4 gap_fill) o person-match
```json
{ "id":"note1", "module":"horen", "type":"gap_fill", "teil":4,
  "question":"Neue Tonne ab März: Farbe der Tonne:",
  "correct":"orange", "correctAnswer":"orange",
  "passageId":"p-horen-t4-…", "topicTags":["umwelt"], "difficulty":4 }
```
Para **person-match** (Teil 4 discusión): `type:"person_match"`, `options:["M) Moderator","A) Frau X","B) Herr Y"]`, `correct:"A"`. **Cada frase del transcript debe estar claramente atribuida a su hablante** (M/A/B) y no debe haber dos hablantes diciendo lo mismo, o la pregunta se vuelve ambigua.

### Pasaje / transcript (en el array `passages` de questions.json)
```json
{ "id":"de-b1-p-edu", "module":"horen", "teil":2,
  "title":"Podcast: Lernen neben dem Job",
  "text":"Moderatorin: Herzlich willkommen …" }
```
- `module`: `"lesen"` o `"horen"`. `teil`: número (¡no lo olvides, si falta se asigna mal!).
- Las preguntas se enlazan por `passageId` = `id` del pasaje.

### writing-speaking.json
```json
{
  "meta": { "language":"de", "level":"B1", "version":2 },
  "writing": [
    { "id":"ws-de-B1-schreiben-t1", "module":"schreiben", "teil":1,
      "taskFormat":"informal_email", "minWords":70, "maxWords":90,
      "topicTags":["reise"], "prompt":"Schreiben Sie eine E-Mail …" }
  ],
  "speaking": [
    { "id":"ws-de-B1-sprechen-t1", "module":"sprechen", "teil":1,
      "taskFormat":"plan_together", "topicTags":["freizeit"], "prompt":"Planen Sie …" }
  ]
}
```
Apunta a **≥4 tareas por Teil** para tener variedad (3 exámenes disjuntos sin repetición).

---

## 3. Especificaciones por examen/Teil (Goethe)

Lee el blueprint de la celda para los números exactos. Referencia de los que ya están desarrollados:

### goethe_B1 (referencia completa)
| Módulo | Teil | Tipo | nº ítems | Longitud pasaje/audio (palabras) |
|---|---|---|---|---|
| Lesen | 1 | blog Richtig/Falsch | 6 | 150–220 |
| Lesen | 2 | prensa, opción múltiple | 6 | 150–220 |
| Lesen | 3 | matching de anuncios | 7 | 20–60 por anuncio |
| Lesen | 4 | opiniones de foro (Ja/Nein) | 7 | 60–90 |
| Lesen | 5 | reglas/aviso formal, MCQ | 4 | 180–250 |
| Hören | 1 | textos cortos (×2) | 10 | 25–90 |
| Hören | 2 | monólogo (×1) | 5 | 220–320 |
| Hören | 3 | conversación (×1) | 7 | 250–350 |
| Hören | 4 | discusión (×2) | 8 | 300–420 |
| Schreiben | 1/2/3 | email/foro/mensaje | 1 c/u | 70–90 / 70–90 / 30–50 |
| Sprechen | 1/2/3 | planear/presentar/feedback | 1 c/u | — |

### goethe_B2 (referencia)
Lesen 5 Teile (q≈6, 200–350); Hören 4 Teile (q 6–8); Schreiben 3×(100–140 palabras). (El blueprint B2 ya está desarrollado.)

> Para A1/A2/C1/C2 y para cambridge/dele: **completa primero el blueprint** con la estructura oficial real del examen correspondiente (nº de partes, ítems, longitudes), porque ahora son esqueletos.

---

## 4. Reglas del CEFR gate que debes respetar al crear contenido

El validador estricto (Strategy B) comprueba, por pasaje:
- **Longitud** dentro del rango del Teil (tabla §3). Para Hören es el único check.
- **Complejidad** (solo prosa de lectura): frases con longitud media ≥ ~10 palabras y algo de subordinación. No aplica a anuncios (Teil 3) ni a audios.
- **Cobertura de vocabulario** (solo prosa de lectura): ver caveat abajo.

Convenciones ya soportadas por el motor (no las rompas):
- Respuesta `"0"` = "ningún anuncio encaja" en Lesen Teil 3.
- Teil 3 (anuncios) está **exento** de complejidad/cobertura (se valida solo por longitud).
- Hören Teil 1: anuncios cortos 25–90 palabras (mín. ya bajado a 25).

⚠️ **Caveat de cobertura (pendiente de decisión, ver el documento de estado):** el umbral de cobertura (85%) puede rechazar pasajes de lectura con compuestos alemanes normales (Stadtbibliothek, Wohnanlage, Ruhezeiten). Mientras no se ajuste, lanza con `STRATEGY_B` apagado (el contenido se sirve igual) o sigue la recomendación del documento de estado.

---

## 5. Pipeline (offline, sin IA en vivo)

Desde la raíz del repo:

```bash
# 1. Validar que la celda está bien formada
npm run validate:library        # esquema de las 18 bibliotecas
npm run validate:knowledge      # coherencia de tags/vocabulario

# 2. Construir exámenes disjuntos (no repetidos) desde el banco
node scripts/build-disjoint-pool.mjs --lang <lang> --level <level> \
  --min-coverage 0.6 --max 20 --out library/pool-seed/<lang>_<level>.json
#   ⚠️ NO añadas --report ni --dry-run si quieres que ESCRIBA el archivo.

# 3. Tests del motor
npm run test:engine
```

Pipeline de generación asistida (si generas candidatos con IA offline y luego curas):
`scripts/pipeline/generate-candidates.mjs` → `promote-approved.mjs` → `bootstrap-servable-level.mjs` → `build-disjoint-pool.mjs`.

Ver también `batches/GENERATION_GUIDE.md` para batches, staging y merge.

---

## 6. Procedimiento para CERRAR una celda nueva (checklist)

1. **Blueprint**: si la celda no es goethe_B1/B2, completa `library/blueprints/<exam>_<level>.json` con la estructura oficial real (Teile, nº ítems, longitudes).
2. **Contenido** en `questions.json` (¡el array `passages` interno!): crea pasajes/transcripts con `module`+`teil`+longitud correcta, y las preguntas enlazadas por `passageId`, llenando **cada Teil a su número oficial de ítems**. Replica `passages[]` en `passages.json`.
3. **writing-speaking.json**: ≥4 tareas por Teil.
4. **Profundidad**: apunta a contenido suficiente para **≥3 exámenes disjuntos** (p. ej. 3× los ítems de cada Teil).
5. **Validar**: `npm run validate:library` y `validate:knowledge` en verde.
6. **Construir pool**: `build-disjoint-pool` (sin `--report`) → confirma que "disjoint exams built" ≥ 3 y que los exámenes **no traen `needsCuration`** (revisa `curationReasons`).
7. **Calibrar CEFR gate del idioma** (solo la primera celda de cada idioma nuevo): cambridge/dele no se han probado con contenido real; aparecerán ajustes de longitud/formato como los que ya se hicieron en goethe (Hören Teil 1, anuncios Teil 3). Documenta y aplica las exenciones equivalentes en `CefrGate.js`/blueprint.
8. **Servir**: con `STRATEGY_B` apagado, soft-valid basta para servir. Enciende Strategy B solo cuando el estricto pase.

---

## 7. Estado actual del contenido (referencia)

| Celda | Estado |
|---|---|
| de/B1 | ✅ funcional (304 preg., Lesen OK, writing/speaking 12+12, pool 2 exámenes limpios). Pendiente: longitud oficial de ~15 transcripts Hören para Strategy B |
| de/A1, A2, B2, C1, C2 | solo 3 exámenes estáticos cada uno (sin banco) |
| en/*, es/* | stubs (4–8 preguntas), prácticamente vacíos |

Recomendación: cierra de/B1 al 100%, **valida con usuarios reales**, y solo entonces replica el patrón celda a celda con esta guía.
