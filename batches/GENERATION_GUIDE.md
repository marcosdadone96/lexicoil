# Guía de generación de contenido — multi-idioma (de / en / es)

**Guías complementarias:**
- [`CONTENT_AUTHORING_GUIDE.md`](CONTENT_AUTHORING_GUIDE.md) — esquemas, longitudes por Teil, checklist para cerrar una celda (fuente: `questions.json` → `passages[]`)
- [`PROMPT_crear_celda_contenido.md`](PROMPT_crear_celda_contenido.md) — prompt listo para Cursor al poblar una celda nueva

## Idiomas y certificaciones

| Lang | Certificación | Blueprint | Master prompt | Topic pools |
|------|---------------|-----------|---------------|-------------|
| `de` | Goethe B1/B2/C1 | `library/blueprints/goethe_*.json` | `GEMINI_MASTER_PROMPT_de_B1.md` | `topic-pools/de.json` |
| `en` | Cambridge B1/B2/C1 | `library/blueprints/cambridge_*.json` | `MASTER_PROMPT_en.md` | `topic-pools/en.json` |
| `es` | DELE B1/B2/C1 | `library/blueprints/dele_*.json` | `MASTER_PROMPT_es.md` | `topic-pools/es.json` |

**Meta:** ≥**5** exámenes completos disjuntos por combo (`de/B1` … `es/C1`). Ver `content-targets.json`.

```bash
# Parámetros aleatorios por idioma/nivel
npm run random:batch -- --lang de --level B1
npm run random:batch -- --lang en --level B2 --module use_of_english --teil 1
npm run random:batch -- --lang es --level C1 --count 3

# Informe de cobertura (9 combos B1/B2/C1)
npm run coverage:report

# Pipeline (sustituir lang/level)
node scripts/validate-batch.mjs --lang en --level B1 --file batches/merged/<file>.json
node scripts/ingest-to-staging.mjs --lang en --level B1 --file batches/merged/<file>.json --auto-approve
node scripts/promote-approved.mjs --lang en --level B1
npm run pipeline:curated -- --lang en --level B1 --min-coverage 1.0 --max 5
```

### IDs por idioma

- **de:** `de-b1-l-t1-{slug}-q1`, `de-b1-p-horen-t1-{slug}-s1`, …
- **en:** `module` = `use_of_english` | `reading` | `listening` | `writing` — prefijo `en-b1-uoe-t1-…`, `en-b1-r-t1-…`, etc.
- **es:** `es-b1-l-t1-{slug}-q1`, mismo esquema que alemán con prefijo `es-`

### Convención DELE (es) — módulos en alemán

Los blueprints `dele_*.json` usan claves **alemanas** (`lesen`, `horen`, `schreiben`, `sprechen`) aunque el examen sea español. Es intencional: el pipeline (`random:batch`, `validate-batch`, staging) es el mismo que Goethe. El contenido va en español; solo el campo `module` del JSON sigue la convención del blueprint.

Los bancos `en/*` y `es/*` están en modo **scaffold** (`meta.contentStatus: "scaffold"`) — banco vacío, prompts de writing/speaking desde blueprint, pool-seed vacío. Generar con los master prompts y el pipeline estándar.

```bash
# Regenerar celdas en/es (solo si hace falta resetear)
npm run bootstrap:content-cells

# Sincronizar espejo passages.json tras editar questions.json
npm run sync:passages -- --lang en --level B1
```

**Cambridge (en):** `module` = `use_of_english` | `reading` | `listening` | `writing` — prefijo `en-b1-uoe-t1-…`, `en-b1-r-t1-…`, etc.

**DELE (es):** mismos nombres de módulo que Goethe (`lesen`, `horen`, …); contenido en español.

---

### Métricas de cobertura

```bash
npm run coverage:report              # resumen 9 combos
npm run coverage:report -- --detail  # inventario por Teil + binding
node scripts/prune-orphan-bank-modules.mjs --all --dry-run  # ítems fuera del blueprint
```

**Pool-seed ≠ exámenes disjuntos:** `pool-seed/de_B1.json` puede listar 17 entradas pero solo 2–3 exámenes sin reutilizar preguntas. Fíjate en la columna `Disjoint` del reporte.

---

# Guía detallada — de/B1 Goethe (referencia)

## Estado actual del banco

| Módulo | Teil | Disponible | Necesario/examen | Batches para cubrir |
|--------|------|-----------|-----------------|---------------------|
| Lesen  | T1   | 58 q ✅    | 6               | Ya tienes 8 batches. Sigue generando (meta: 20 batches) |
| Lesen  | T2   | 10 q ⚠️   | 6               | Necesitas 8+ batches |
| Lesen  | T3   | 9 q ⚠️    | 7               | Necesitas 8+ batches |
| Lesen  | T4   | 5 q ⚠️    | 7               | Necesitas 8+ batches |
| Lesen  | T5   | 5 q ⚠️    | 4               | Necesitas 8+ batches |
| Hören  | T1   | 10 q ⚠️   | 10              | Necesitas 5+ batches |
| Hören  | T2   | 7 q ⚠️    | 5               | Necesitas 5+ batches |
| Hören  | T3   | 4 q ❌     | 7               | Necesitas 5+ batches |
| Hören  | T4   | 5 q ❌     | 8               | Necesitas 5+ batches |
| Schreiben | T1 | 1 q ❌    | 1               | Necesitas 10+ tareas |
| Schreiben | T2 | 1 q ❌    | 1               | Necesitas 10+ tareas |
| Schreiben | T3 | 0 q ❌    | 1               | Necesitas 10+ tareas |
| Sprechen  | T1 | 0 q ❌    | 1               | Necesitas 10+ tareas |
| Sprechen  | T2 | 0 q ❌    | 1               | Necesitas 10+ tareas |
| Sprechen  | T3 | 0 q ❌    | 1               | Necesitas 10+ tareas |

**Meta: 5 exámenes disjuntos** → ~5 batches por Teil en los módulos limitantes (Hören, Schreiben, Sprechen).

---

## Nomenclatura de IDs — OBLIGATORIO

Todos los IDs deben ser únicos en todo el banco. Usa este esquema:

```
Passages:  de-b1-p-{modulo}-{slug}-{num}
           de-b1-p-lesen-t1-recycling-04     (para Lesen T1)
           de-b1-p-horen-t1-sport-01-s1      (Hören T1, segmento 1)
           de-b1-p-horen-t2-klimawandel-02   (Hören T2)
           de-b1-p-lesen-t5-sportverein-03   (Lesen T5)

Questions: de-b1-l-t1-{slug}-q{n}           (Lesen)
           de-b1-h-t1-{slug}-s{seg}-q{n}    (Hören T1, segmento)
           de-b1-h-t2-{slug}-q{n}           (Hören T2-T4)
           de-b1-s-t1-{slug}-q1             (Schreiben)
           de-b1-sp-t1-{slug}-q1            (Sprechen)
```

**Usa slugs descriptivos únicos**: `arbeit-homeoffice-01`, `gesundheit-ernaehrung-02`, `wohnen-umzug-01`...

---

## Gramática tags válidos

```
g-de-b1-perfekt           g-de-b1-praeteritum
g-de-b1-konjunktiv        g-de-b1-passiv
g-de-b1-nebensatz         g-de-b1-relativ
g-de-b1-modalverben       g-de-b1-adjektivdeklination
g-de-b1-futur             g-de-b1-komparativ
g-de-b1-genitiv           g-de-b1-dativ
```

## Topic tags válidos

```
daily_life  work  health  environment  travel
education   culture  technology  society  family
food  housing  sport  media  shopping
```

---

## Workflow — cómo generar y mergear un batch

```bash
# 0. Parámetros aleatorios (tema, slug, módulo…):
npm run random:batch
#    Solo randomiza tema dentro de un Teil concreto:
npm run random:batch -- --module lesen --teil 2

# 1. Copia el bloque MODO=aleatorio + el MASTER PROMPT completo → Gemini
# 2. Guarda el JSON en: batches/merged/{archivo}.json  (el script te dice el nombre)
# 3. Valida el batch:
node scripts/validate-batch.mjs --lang de --level B1 --file batches/merged/{archivo}.json
# 4. Mergea (directo al banco):
node scripts/merge-bank-batch.mjs --lang de --level B1 --file batches/merged/{archivo}.json
#    O vía staging (recomendado — valida por Teil antes del banco):
node scripts/ingest-to-staging.mjs --lang de --level B1 --file batches/merged/{archivo}.json --auto-approve
node scripts/promote-approved.mjs --lang de --level B1
# 5. Valida el banco completo:
npm run validate:library
# 6. Cuando el banco cubre el blueprint al 100%, promueve exámenes completos:
npm run pipeline:curated -- --lang de --level B1 --min-coverage 1.0 --max 5
```

### Pipeline de contenido (piezas → banco → exámenes completos)

```
batches/merged/*.json  ──►  staging/{lang}/{level}/candidates/   (piezas sueltas)
IA runtime (partes)    ──►  Netlify Blobs ──► export-remote-staging
                                    │
                                    ▼
                         library/de/B1/questions.json  (banco)
                                    │
                                    ▼
                         library/curated/ + pool-seed/  (exámenes COMPLETOS)
```

```bash
# Todo en uno (ingest + banco + curated):
npm run pipeline:run -- --lang de --level B1 --file batches/merged/mi-batch.json --auto-approve

# Solo promover exámenes completos desde el banco actual:
npm run pipeline:curated -- --lang de --level B1

# Traer piezas IA de producción a staging local:
npm run pipeline:export-staging -- --lang de --level B1
```

Ver también: `staging/README.md`

**Pools de temas:** editables en `batches/topic-pools.json` (el script lee de ahí).

---

## PROMPTS PARA CADA MÓDULO

### ─────────────────────────────────────────
### LESEN T1 (ya funciona bien, sigue así)
### ─────────────────────────────────────────

```
Genera un batch JSON para el banco de examen Goethe B1 alemán, Lesen Teil 1.

FORMATO EXACTO — devuelve solo JSON válido, sin markdown:
{
  "passages": [{ "id": "de-b1-p-lesen-t1-{SLUG}-{NUM}", "module": "lesen", "title": "...", "text": "...", "passageVocab": ["wort1", "wort2"] }],
  "questions": [/* 6 preguntas richtig_falsch */]
}

REGLAS:
- Texto: 150–220 palabras, alemán B1, tema: [TEMA]
- 6 preguntas tipo richtig_falsch: correct = "Richtig" o "Falsch", options = null
- 4 explícitas, 2 paráfrasis
- Cada pregunta tiene: id, module:"lesen", teil:1, type:"richtig_falsch", question, correct, correctAnswer, explanation, passageId, options:null, grammarTags:["g-de-b1-{TAG}"], topicTags:["[topic]"], vocabularyTags:["wort1","wort2"], difficulty (3-6), skills:["reading"], language:"de", level:"B1", examType:"goethe"
- IDs únicos: usa slug {SLUG} = [TU SLUG, e.g. 'arbeit-schicht-03']

TEMA: [describe el tema aquí]
```

---

### ─────────────────────────────────────────
### LESEN T2 — Dos textos, MCQ
### ─────────────────────────────────────────

> **Recomendado:** usa el bloque completo de `GEMINI_MASTER_PROMPT_de_B1.md` (optimizado para Gemini).

```
Genera un batch JSON para Goethe B1 Lesen Teil 2.

FORMATO — devuelve SOLO JSON válido, sin markdown:
{
  "passages": [2 passages],
  "questions": [6 questions — 3 por texto]
}

REGLAS DE LONGITUD (CRÍTICO):
- Cada texto: mínimo oficial 150, máximo 220 palabras
- OBJETIVO AL ESCRIBIR: 165–210 palabras por texto (los modelos suelen quedarse cortos)
- ANTES de devolver: cuenta las palabras de cada passage; si <165, añade 1–2 frases

REGLAS DE CONTENIDO:
- 2 textos periodísticos/magazinescos, mismo tema general, perspectivas distintas
- 3 preguntas MCQ por texto (a/b/c): 2 explícitas + 1 paráfrasis
- type: "multiple", options: ["a) ...", "b) ...", "c) ..."]
- correct Y correctAnswer: SOLO la letra "a", "b" o "c" — IDÉNTICOS entre sí
  ❌ PROHIBIDO: "correctAnswer": "a) Texto completo de la opción..."
  ✅ CORRECTO:  "correct": "a", "correctAnswer": "a"
- teil: 2 (número, no string)
- Passage IDs: "de-b1-p-lesen-t2-{SLUG}-a" y "de-b1-p-lesen-t2-{SLUG}-b"
- Question IDs: "de-b1-l-t2-{SLUG}-a-q1"…"a-q3", "de-b1-l-t2-{SLUG}-b-q1"…"b-q3"
- Cada passage: passageVocab con 3–5 lemas
- grammarTags: solo si la estructura aparece de verdad en el texto (no inventar passiv)
- vocabularyTags: lemas del texto, umlautes como ae/oe/ue/ss
- Campos por pregunta: id, module:"lesen", teil:2, type:"multiple", question, correct, correctAnswer, explanation, passageId, options, grammarTags, topicTags, vocabularyTags, difficulty(4-6), skills:["reading"], language:"de", level:"B1", examType:"goethe"

SLUG: {SLUG}
TEMA: [describe el tema, ej: Online-Shopping vs. lokale Geschäfte]
```

---

### ─────────────────────────────────────────
### LESEN T3 — Anzeigen zuordnen (Matching)
### ─────────────────────────────────────────

```
Genera un batch JSON para Goethe B1 Lesen Teil 3 (Anzeigen zuordnen).

FORMATO — devuelve solo JSON válido:
{
  "passages": [],
  "questions": [7 questions tipo matching]
}

REGLAS:
- Crea 10 anuncios (A–J) de 25–55 palabras cada uno. Tema unificado: [AREA, e.g. "Freizeit und Sport", "Bildung und Kurse"]
- 7 situaciones (personas con necesidades concretas)
- 7 situaciones se resuelven: 6 tienen anuncio correcto (A–J), 1 tiene correcto "0" (ninguno)
- Cada pregunta lleva TODAS las 10 opciones en el campo "options" con formato "A) [texto completo del anuncio]"
- type: "matching", correct/correctAnswer: letra mayúscula ("A"–"J") o "0"
- Question IDs: "de-b1-l-t3-{SLUG}-q1" hasta "q7"
- Campos: id, module:"lesen", teil:3, type:"matching", question:[situación completa], correct, correctAnswer, explanation, passageId:null, options:[10 anuncios], grammarTags:[], topicTags, vocabularyTags, difficulty(4-6), skills:["reading"], language:"de", level:"B1", examType:"goethe"

SLUG: {SLUG}
AREA: [Freizeitangebote / Bildungskurse / Gesundheitsangebote / Dienstleistungen]
```

---

### ─────────────────────────────────────────
### LESEN T4 — Meinungen im Forum (Ja/Nein)
### ─────────────────────────────────────────

```
Genera un batch JSON para Goethe B1 Lesen Teil 4 (Meinungen, Ja/Nein).

FORMATO — devuelve solo JSON válido:
{
  "passages": [],
  "questions": [7 questions tipo ja_nein]
}

REGLAS:
- 7 opiniones de personas ficticias sobre un tema de debate B1: [TEMA]
- Cada opinión: 60–90 palabras, primera persona, lenguaje natural B1
- La opinión va en el campo "signText" de la pregunta (NO en passages)
- type: "ja_nein", options: ["Ja", "Nein"]
- correct: "Ja" (la persona está a favor del tema) o "Nein" (en contra)
- Distribución: al menos 3 Ja y 3 Nein entre las 7
- Al menos 4 requieren paráfrasis (no dicen directamente Ja/Nein)
- La pregunta en "question" describe qué posición toma la persona (ej. "Klaus ist gegen autofreie Innenstädte.")
- Question IDs: "de-b1-l-t4-{SLUG}-q1" hasta "q7"
- Campos: id, module:"lesen", teil:4, type:"ja_nein", question, signText, correct, correctAnswer, explanation, passageId:null, options:["Ja","Nein"], grammarTags, topicTags, vocabularyTags, difficulty(4-6), inferenceLevel("explicit"|"paraphrase"|"inference"), skills:["reading"], language:"de", level:"B1", examType:"goethe"

SLUG: {SLUG}
TEMA DEL DEBATE: [e.g. "Homeoffice für alle Berufe", "Vegetarische Ernährung in Schulen", "Fahrverbote in Innenstädten"]
```

---

### ─────────────────────────────────────────
### LESEN T5 — Regeltext, MCQ
### ─────────────────────────────────────────

```
Genera un batch JSON para Goethe B1 Lesen Teil 5 (Regeltext + 4 MCQ).

FORMATO — devuelve solo JSON válido:
{
  "passages": [1 passage],
  "questions": [4 questions]
}

REGLAS:
- 1 texto formal de reglas: 180–250 palabras
  Tipos: Hausordnung, Bibliotheksordnung, Vereinssatzung, Parkplatzbenutzungsordnung, Kantinenbenutzung, Betriebsordnung, etc.
  Debe contener detalles precisos (horarios, precios, lugares, condiciones)
- 4 preguntas MCQ (a/b/c), 2 explícitas + 2 paráfrasis
- Passage ID: "de-b1-p-lesen-t5-{SLUG}"
- Question IDs: "de-b1-l-t5-{SLUG}-q1" hasta "q4"
- Campos: id, module:"lesen", teil:5, type:"multiple", question, correct, correctAnswer, explanation, passageId, options:["a)...","b)...","c)..."], grammarTags, topicTags, vocabularyTags, difficulty(4-5), skills:["reading"], language:"de", level:"B1", examType:"goethe"

SLUG: {SLUG}
TIPO DE TEXTO: [Hausordnung Wohnanlage / Benutzungsordnung Bibliothek / Vereinsordnung Sportklub / etc.]
```

---

### ─────────────────────────────────────────
### HÖREN T1 — 5 textos cortos (×2), R/F + MCQ
### ─────────────────────────────────────────

```
Genera un batch JSON para Goethe B1 Hören Teil 1 (5 Segmente, je 2 Fragen = 10 Fragen).

FORMATO — devuelve solo JSON válido:
{
  "passages": [5 passages — uno por segmento],
  "questions": [10 questions — 2 por segmento: 1 richtig_falsch + 1 multiple]
}

REGLAS PASSAGES:
- Cada passage: 40–90 palabras, alemán hablado B1
- Tipos: Bahnhofsdurchsage, Radionachricht, kurzes Telefonggespräch, Ansage, Wetterbericht, Werbespot, Nachricht auf Anrufbeantworter
- 5 segmentos de temas distintos
- Passage IDs: "de-b1-p-horen-t1-{SLUG}-s1" hasta "s5"

REGLAS QUESTIONS:
- Pregunta 1 de cada segmento: richtig_falsch (correct = "Richtig" o "Falsch", options = [])
- Pregunta 2 de cada segmento: multiple choice a/b/c
- segmentLabel: "Aufnahme 1" hasta "Aufnahme 5"
- Question IDs: "de-b1-h-t1-{SLUG}-s{N}-q1" y "de-b1-h-t1-{SLUG}-s{N}-q2"
- Campos: id, module:"horen", teil:1, type, question, correct, correctAnswer, explanation, passageId, segmentLabel, options, grammarTags, topicTags, vocabularyTags, difficulty(4-6), skills:["listening"], language:"de", level:"B1", examType:"goethe"

SLUG: {SLUG}
TEMAS (uno por segmento): [e.g. "Bahnhof, Supermarkt, Wetter, Kino, Arzt"]
```

---

### ─────────────────────────────────────────
### HÖREN T2 — Monólogo (×1), 5 MCQ
### ─────────────────────────────────────────

```
Genera un batch JSON para Goethe B1 Hören Teil 2 (Vortrag/Monolog + 5 MCQ).

FORMATO — devuelve solo JSON válido:
{
  "passages": [1 passage],
  "questions": [5 questions]
}

REGLAS:
- 1 monólogo: 220–320 palabras, Vortrag/Einführung/Radiosendung sobre tema B1: [TEMA]
- Lenguaje hablado natural, estructura clara: introducción → 4 puntos → conclusión
- 5 preguntas MCQ a/b/c cubriendo distintas partes del texto
- Passage ID: "de-b1-p-horen-t2-{SLUG}"
- Question IDs: "de-b1-h-t2-{SLUG}-q1" hasta "q5"
- Campos: id, module:"horen", teil:2, type:"multiple", question, correct, correctAnswer, explanation, passageId, options:["a)...","b)...","c)..."], grammarTags, topicTags, vocabularyTags, difficulty(5-7), skills:["listening"], language:"de", level:"B1", examType:"goethe"

SLUG: {SLUG}
TEMA: [Vortrag über: Ehrenamt, Digitalisierung, Nachhaltigkeit, Gesundheit, Stadtentwicklung...]
```

---

### ─────────────────────────────────────────
### HÖREN T3 — Diálogo informal (×1), 7 R/F
### ─────────────────────────────────────────

```
Genera un batch JSON para Goethe B1 Hören Teil 3 (Gespräch + 7 Richtig/Falsch).

FORMATO — devuelve solo JSON válido:
{
  "passages": [1 passage],
  "questions": [7 questions]
}

REGLAS:
- 1 diálogo informal: 250–350 palabras, entre 2-3 personas
- Formato: "Person A: ..." / "Person B: ..."
- Tema B1 cotidiano: Urlaub, Umzug, Jobwechsel, Hobby, Familie
- 7 afirmaciones R/F — 4 Richtig, 3 Falsch (o 3-4). Al menos 3 requieren paráfrasis
- Passage ID: "de-b1-p-horen-t3-{SLUG}"
- Question IDs: "de-b1-h-t3-{SLUG}-q1" hasta "q7"
- Campos: id, module:"horen", teil:3, type:"richtig_falsch", question, correct, correctAnswer, explanation, passageId, options:[], grammarTags, topicTags, vocabularyTags, difficulty(4-6), skills:["listening"], language:"de", level:"B1", examType:"goethe"

SLUG: {SLUG}
TEMA DEL DIÁLOGO: [e.g. "Zwei Freunde planen einen Städtetrip", "Kollegen besprechen den neuen Homeoffice-Plan"]
```

---

### ─────────────────────────────────────────
### HÖREN T4 — Diskussion (×2), 8 Speaker-Matching
### ─────────────────────────────────────────

```
Genera un batch JSON para Goethe B1 Hören Teil 4 (Diskussion + 8 Speaker-Matching).

FORMATO — devuelve solo JSON válido:
{
  "passages": [1 passage],
  "questions": [8 questions]
}

REGLAS:
- 1 transcripción de debate: 300–420 palabras, Moderator + 2 invitados con posiciones distintas
- Formato: "Moderator: ..." / "[Nombre Gast A]: ..." / "[Nombre Gast B]: ..."
- type: "matching", options: ["M) Moderator", "A) [Nombre Gast A]", "B) [Nombre Gast B]"]
- correct/correctAnswer: "M", "A", "B" (a quién pertenece la afirmación parafraseada)
- Distribución: ~3 M, ~3 A, ~2 B (o similar, variada)
- Passage ID: "de-b1-p-horen-t4-{SLUG}"
- Question IDs: "de-b1-h-t4-{SLUG}-q1" hasta "q8"
- Campos: id, module:"horen", teil:4, type:"matching", question:[afirmación parafraseada], correct, correctAnswer, explanation, passageId, options, grammarTags, topicTags, vocabularyTags, difficulty(6-7), skills:["listening"], language:"de", level:"B1", examType:"goethe"

SLUG: {SLUG}
TEMA DE DEBATE: [e.g. "Sollte das Autofahren in Städten verboten werden?", "Vor- und Nachteile der 4-Tage-Woche"]
```

---

### ─────────────────────────────────────────
### SCHREIBEN — 3 tareas por batch (T1 + T2 + T3)
### ─────────────────────────────────────────

```
Genera un batch JSON para Goethe B1 Schreiben (3 tareas de escritura).

FORMATO — devuelve solo JSON válido:
{
  "passages": [],
  "questions": [3 questions — una por Aufgabe]
}

REGLAS:
- correct: "rubric", correctAnswer: "rubric", options: []
- Teil 1 (type:"short_answer", teil:1): E-Mail informal a amigo/a, ~80 palabras, 3 puntos de contenido obligatorios. Tema: [TEMA T1]
- Teil 2 (type:"short_answer", teil:2): Opinión en foro, ~80 palabras, con cita del post que motiva la respuesta. Tema: [TEMA T2]  
- Teil 3 (type:"short_answer", teil:3): Mensaje/nota corta semiformal, ~40 palabras, con motivo concreto. Tema: [TEMA T3]
- explanation: contiene los criterios de evaluación simplificados
- Question IDs: "de-b1-s-t1-{SLUG}-q1", "de-b1-s-t2-{SLUG}-q1", "de-b1-s-t3-{SLUG}-q1"
- Campos: id, module:"schreiben", teil, type:"short_answer", question:[enunciado completo], correct, correctAnswer, explanation, passageId:null, options:[], grammarTags, topicTags, vocabularyTags, difficulty(5-7), skills:["writing"], language:"de", level:"B1", examType:"goethe"

SLUG: {SLUG}
TEMAS: T1=[email informal sobre qué], T2=[foro sobre qué], T3=[mensaje corto sobre qué]
```

---

### ─────────────────────────────────────────
### SPRECHEN — 3 tareas por batch (T1 + T2 + T3)
### ─────────────────────────────────────────

```
Genera un batch JSON para Goethe B1 Sprechen (3 tareas orales).

FORMATO — devuelve solo JSON válido:
{
  "passages": [],
  "questions": [3 questions]
}

REGLAS:
- correct: "rubric", correctAnswer: "rubric", options: []
- Teil 1 (teil:1): Planungsaufgabe — actividad a planificar juntos con 5 puntos guía. Tema: [TEMA T1]
- Teil 2 (teil:2): Präsentation — tema a presentar con estructura: introducción / comparación con país de origen / ventajas y desventajas / opinión personal. Tema: [TEMA T2]
- Teil 3 (teil:3): Feedback y preguntas — relacionado con el mismo tema que T2. Incluir 2-3 preguntas típicas que el interlocutor podría hacer.
- Question IDs: "de-b1-sp-t1-{SLUG}-q1", "de-b1-sp-t2-{SLUG}-q1", "de-b1-sp-t3-{SLUG}-q1"
- Campos: id, module:"sprechen", teil, type:"short_answer", question:[enunciado completo con todos los puntos], correct, correctAnswer, explanation:[criterios de evaluación], passageId:null, options:[], grammarTags, topicTags, vocabularyTags, difficulty(6-8), skills:["speaking"], language:"de", level:"B1", examType:"goethe"

SLUG: {SLUG}
TEMAS: T1=[actividad a planificar], T2+T3=[tema de presentación]
```

---

## Temas sugeridos para generar (evitar repetición)

### Lesen T1 — temas para nuevos batches
```
arbeit-schicht, wohnen-umzug, gesundheit-ernaehrung, freizeit-sport,
digitalisierung-alltag, nachhaltigkeit-konsum, bildung-weiterbildung,
familie-pflege, reisen-urlaub, gesellschaft-ehrenamt, medien-social,
technologie-ki, umwelt-energie, stadtleben-verkehr, kultur-museum
```

### Lesen T2/T3/T4/T5 — slugs disponibles
```
t2: arbeit-homeoffice, gesundheit-bewegung, technik-apps, umwelt-muelltrennung
t3: freizeit-angebote, bildungskurse-stadt, gesundheitsangebote, sport-vereine
t4: homeoffice-alltag, vegetarismus-schule, autofreie-stadt, soziale-medien
t5: sportverein-ordnung, bibliothek-regeln, firmenparkplatz, kantine-regeln
```

### Hören — slugs disponibles
```
t1: alltag-behoerden, transport-stadtverkehr, einkaufen-markt, gesundheit-arzt
t2: umweltschutz-vortrag, digitale-bildung, stadtplanung, ehrenamt-chancen
t3: urlaubsplanung-freunde, jobwechsel-kollegen, umzug-familie, hobby-neues
t4: autoverbote-debatte, homeoffice-diskussion, bildungssystem-reform
```

### Schreiben/Sprechen — slugs disponibles
```
schreiben: nachbarschaft, urlaub-planung, kurs-anmeldung, krankmeldung
sprechen: stadtfest-planung, sport-praesentation, ehrenamt-thema
```
