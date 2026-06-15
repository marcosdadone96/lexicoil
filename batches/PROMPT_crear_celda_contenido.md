# PROMPT Cursor — Crear contenido de una celda (idioma/nivel)

Copia este prompt en Cursor y **rellena las variables `<...>`** de la celda que quieras poblar. Está pensado para usarse junto con `batches/CONTENT_AUTHORING_GUIDE.md` (añádelo al contexto de Cursor).

---

```
Eres un creador de contenido para exámenes oficiales de idiomas en el proyecto LexiCoil.
Lee primero batches/CONTENT_AUTHORING_GUIDE.md (en el contexto). Vas a poblar la celda:

  IDIOMA: <de|en|es>     EXAMEN: <goethe|cambridge|dele>     NIVEL: <A1|A2|B1|B2|C1|C2>

REGLA CRÍTICA: los pasajes y transcripts van en el array "passages" DENTRO de
library/<idioma>/<nivel>/questions.json (NO en passages.json, que es solo un espejo).
El ensamblador lee bank.passages de questions.json. Después de editar, replica el
array passages en passages.json para mantenerlos sincronizados.

PASO 0 — Blueprint.
Abre library/blueprints/<examen>_<nivel>.json. Si NO está desarrollado (solo tiene
T1/T2 genéricos), complétalo con la estructura OFICIAL real de ese examen y nivel:
cada Teil/part con su slotType, taskFormat, questionsTotal {min,max}=nº oficial de ítems,
y wordsPerPassage/wordsPerTranscript {min,max}. Usa goethe_B1.json como modelo de formato.

PASO 1 — Contenido de lectura y audio (questions.json).
Para CADA Teil del blueprint, crea en el array "passages":
  - los pasajes de lectura (module:"lesen") y/o transcripts de audio (module:"horen"),
    con "teil" numérico y longitud DENTRO del rango del blueprint (cuéntalas).
  - Idioma nativo y nivel correcto. Frases naturales; para prosa de lectura, usa
    subordinadas y conectores propios del nivel.
Para CADA pasaje, crea en "questions" EXACTAMENTE el nº oficial de ítems del Teil,
con passageId apuntando al pasaje, "type" correcto (richtig_falsch | multiple |
matching | person_match | gap_fill), "options" (si aplica), "correct"+"correctAnswer",
"explanation", "topicTags", "vocabularyTags", "difficulty" (1–6) y "skills".

Convenciones obligatorias:
  - Matching de anuncios (Lesen Teil 3): "correct" es la letra del anuncio o "0" si
    ninguno encaja.
  - person_match (audios de discusión): options ["M) …","A) …","B) …"]; cada frase del
    transcript debe estar atribuida sin ambigüedad a un único hablante.
  - Llena CADA Teil a su número oficial de ítems (si no, el examen sale needsCuration).

PASO 2 — Profundidad para no repetir.
Crea contenido suficiente para AL MENOS 3 exámenes disjuntos: ~3 conjuntos completos
por Teil (p. ej. 3 pasajes de Lesen Teil 1, cada uno con sus 6 ítems, etc.).

PASO 3 — writing-speaking.json.
Crea ≥4 tareas por Teil de schreiben y de sprechen, con los taskFormat y minWords/maxWords
que indique el blueprint/guía. Idioma y nivel correctos.

PASO 4 — Sincroniza passages.json con el array passages de questions.json.

PASO 5 — Valida y construye:
  npm run validate:library
  npm run validate:knowledge
  node scripts/build-disjoint-pool.mjs --lang <idioma> --level <nivel> --min-coverage 0.6 --max 20 --out library/pool-seed/<idioma>_<nivel>.json
  npm run test:engine
Comprueba en la salida del build que "disjoint exams built" >= 3 y que los exámenes
generados NO traen needsCuration (revisa curationReasons). Si los traen, corrige los
item_count_mismatch (faltan ítems en algún Teil) o passage_too_short (alarga el pasaje).

PASO 6 — Primera celda de un idioma nuevo (cambridge/dele): calibra el CEFR gate.
Genera un examen y pásalo por el quality gate en modo estricto. Si falla por formatos
legítimos (anuncios cortos, avisos formales, longitudes propias del examen), añade en
js/engine/validation/CefrGate.js / en el blueprint las exenciones equivalentes a las que
ya existen para Goethe (Teil de anuncios = lengthOnly; ajustar wordsPerTranscript del
Teil de textos cortos). Documenta cada ajuste.

NO toques el motor salvo en el PASO 6, NO inventes campos nuevos, NO uses IA en vivo.
Si algo del blueprint o del formato oficial es ambiguo, pregúntame antes de continuar.
```

---

### Notas de uso
- Pásale a Cursor también `batches/CONTENT_AUTHORING_GUIDE.md` y, como ejemplo de referencia, `library/de/B1/questions.json` (la celda ya cerrada).
- Hazlo **una celda cada vez**. Empieza por la que vayas a lanzar primero (sugerido: de/B2 o en/B1).
- El **audio** (transcripts) es texto; LexiCoil no genera audio real en esta fase: el "Hören" se evalúa sobre el transcript. Si más adelante quieres TTS, es una capa aparte.
