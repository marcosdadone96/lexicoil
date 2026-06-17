# MASTER PROMPT — DELE Exam Content Generator (ES)

> **Modo aleatorio:** `npm run random:batch -- --lang es --level B1`  
> Copia el bloque impreso **antes** de `---INICIO---` y pégalo en Gemini.

```bash
npm run random:batch -- --lang es --level B1
npm run random:batch -- --lang es --level B2 --module lesen --teil 2
npm run random:batch -- --lang es --count 3 --level C1
```

La estructura de batches es **idéntica a Goethe (de)**: módulos `lesen`, `horen`, `schreiben`, `sprechen`.  
Para reglas detalladas de formato JSON, rangos de palabras y tipos de pregunta, usa `GEMINI_MASTER_PROMPT_de_B1.md` como referencia y adapta idioma/certificación.

---INICIO---

## PARÁMETROS DE GENERACIÓN

```
LANG   = es
LEVEL  = B1 | B2 | C1
EXAM   = dele
MODULE = lesen | horen | schreiben | sprechen
TEIL   = número del apartado
TOPIC  = [tema en español]
SLUG   = [kebab-case único]
ID_PREFIX = es-b1   ← es-b2 / es-c1 según nivel
```

**Regla crítica:** respeta `MODULE` igual que en Goethe. Schreiben/Sprechen → `passages: []`, solo consignas.

### Esquema de IDs (obligatorio)

```
Passages:  es-b1-p-lesen-t1-{slug}-01
           es-b1-p-horen-t1-{slug}-s1
Questions: es-b1-l-t1-{slug}-q1          (comprensión lectora)
           es-b1-h-t1-{slug}-s1-q1      (comprensión auditiva)
           es-b1-s-t1-{slug}-q1         (expresión escrita)
           es-b1-sp-t1-{slug}-q1        (expresión oral)
```

Campos en cada pregunta: `"language":"es"`, `"level":"B1"`, `"examType":"dele"`, `"grammarTags":["g-es-b1-…"]`, `"topicTags"`.

Grammar tags (ejemplos): `g-es-b1-pretérito`, `g-es-b1-subjuntivo`, `g-es-b1-ser-estar`, `g-es-b1-por-para`, `g-es-b1-condicional`.

### DELE B1 — recordatorio de estructura

| Módulo | Teile | Notas |
|--------|-------|-------|
| lesen | T1, T2 | T1: textos cortos; T2: textos opuestos / comparación |
| horen | T1, T2 | T1: audios cortos; T2: monólogo / diálogo largo |
| schreiben | T1, T2, T3 | email / foro / mensaje breve — sin passages |
| sprechen | T1, T2, T3 | planificación / presentación / feedback — sin passages |

Consulta `library/blueprints/dele_B1.json` (y B2/C1) para conteos exactos por Teil.

### Anti-patrones (rechazo)

- Textos en alemán o inglés
- Sprechen/Schreiben con passages o MCQ de lectura
- IDs con prefijo `de-b1` en lugar de `es-b1`

Guardar en `batches/merged/{archivo del script}` y validar:

```bash
node scripts/validate-batch.mjs --lang es --level B1 --file batches/merged/<archivo>.json
```

---FIN---
