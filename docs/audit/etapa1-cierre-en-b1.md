# Cierre Etapa 1 — Piloto en_B1 (Cambridge B1 Preliminary)

**Fecha:** 2026-07-12 · **Autor:** Danilo (con asistencia) · **Estado:** Etapa 1 lista para cerrar; Etapa 2 se inicia en otra sesión.

## Resultado de la generación piloto
Con `build:level --lang en --level B1 --target 1` (dry-run) se generaron y **validaron los 12 módulos/Teile** (Reading T1–T6, Listening T1–T4, Writing, Speaking). Todos: esquema OK, conformidad blueprint OK, `correct===correctAnswer`, claves válidas.

## Auditoría de calidad (12 módulos)

| Módulo | Conteo/tipo | Veredicto contenido |
|---|---|---|
| Reading T1 | 5 MCQ | OK — avisos/notas cortos, main message |
| Reading T2 | 5 matching | OK — 8 day-trips bien diferenciados, matching lógico |
| Reading T3 | 5 MCQ (4 op) | OK — entrevista con preguntas de actitud/inferencia, distractores plausibles |
| Reading T4 | 5 matching | OK — gapped text coherente, encaje por cohesión |
| Reading T5 | 6 MCQ (4 op) | OK — cloze de vocabulario, distractores tipo falso-amigo |
| Reading T6 | 6 gap_fill | OK — open cloze, una palabra por hueco (by/although/which/for…) |
| Listening T1 | 7 MCQ | OK — 7 grabaciones cortas |
| Listening T2 | 6 MCQ | OK — gist de diálogos |
| Listening T3 | 6 gap_fill | OK — monólogo museo, respuestas correctas (8.45/transport/robots) |
| Listening T4 | 6 MCQ | OK — entrevista, actitud/opinión |
| Writing | 2 (email + article/story) | OK — email con notas [Tell Alex]; Part 2 con opción artículo/historia |
| Speaking | 4 consignas | OK — interview/foto/colaborativa/conversación |

## Defectos detectados y su estado

1. **Capitalización alemana en texto inglés** ("Team", "Person", "Information", "Kind"…). Causa: `generate-batch-gemini.mjs` llamaba `normalizeBatch` sin `lang` → el capitalizador de sustantivos alemán corría sobre inglés. **CORREGIDO** (se pasa `{lang}`; alemán byte-idéntico). Se aplica desde la próxima generación.
2. **Sesgo de respuesta** (Reading T3 con 'b' 4/5; T5 con 'b' 5/6). **CORREGIDO en el prompt** (`GEMINI_API_COMPACT_en_B1.md`): regla de distribución — ninguna letra correcta más de 2 veces por set.
3. **Writing/Speaking sin `taskTypes`** (no bloquea validación). **CORREGIDO en el prompt**: se exige `taskTypes` por parte.
4. **Modelo/cuota:** `gemini-flash-latest` → `gemini-3.5-flash` (≈20/día gratis). **Cambiado `.env` a `gemini-2.5-flash-lite`** (1000/día, bucket separado).

## Nota sobre los archivos piloto
Los batches en `batches/merged/*-01/-02.json` (ingleses) son del piloto **anterior** a los arreglos 1–3, por lo que conservan la capitalización y el sesgo. Sirvieron para validar el pipeline; **en la Etapa 2 se regeneran limpios** y se pueden descartar.

## Arranque de Etapa 2 (otra conversación)
1. Confirmar `.env`: `GEMINI_MODEL=gemini-2.5-flash-lite`.
2. Generar 3 exámenes con escritura real:
   `npm run build:level -- --lang en --level B1 --target 3 --apply --yes`
3. Validar: `npm run validate:fidelity -- --lang en --level B1` → objetivo 3/3.
4. Prueba UX en la app (`netlify dev`), luego `availability` en_B1 `hidden`→`beta`.
5. Checkpoint con Marcos (cambios en motor compartido cubiertos con tests).
