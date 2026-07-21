# Auditoría final — LexiLoop B1 Alemán (Goethe-Zertifikat B1)

## Contexto del proyecto

LexiLoop es un sistema que genera automáticamente exámenes simulados del **Goethe-Zertifikat B1** usando modelos de lenguaje (Gemini). Los exámenes se dividen en cuatro módulos: **Lesen, Hören, Schreiben y Sprechen**, cada uno con varios Teile (partes).

Necesito que hagas una **auditoría completa e independiente** del corpus generado hasta ahora, comparándolo con el examen oficial de referencia (adjunto: `b1_modellsatz_erwachsene.pdf`). Actúa como si no supieras nada del proyecto: solo tienes el PDF oficial y los archivos adjuntos.

---

## Lo que te adjunto

| Archivo | Qué es |
|---|---|
| `b1_modellsatz_erwachsene.pdf` | Examen oficial Goethe-Zertifikat B1 (la referencia gold standard) |
| `audit-pass2-report.json` | Resultado del script de auditoría automática (0 críticos, 0 importantes) |
| `lesen-t1-gemini-NNN.json` | Muestra generada de Lesen Teil 1 |
| `lesen-t2-gemini-NNN.json` | Muestra generada de Lesen Teil 2 |
| `lesen-t3-auto-NNN.json` | Muestra generada de Lesen Teil 3 |
| `lesen-t4-gemini-001.json` | Muestra generada de Lesen Teil 4 |
| `lesen-t5-gemini-009.json` | Muestra generada de Lesen Teil 5 |
| `horen-t3-gemini-001.json` | Muestra generada de Hören Teil 3 |
| `horen-t4-gemini-003.json` | Muestra generada de Hören Teil 4 |
| `schreiben-gemini-003.json` | Muestra generada de Schreiben |
| `sprechen-gemini-001.json` | Muestra generada de Sprechen |
| `lesen-teil4.md` | Template de generación para Lesen T4 |
| `horen-teil3.md` | Template de generación para Hören T3 |
| `horen-teil4.md` | Template de generación para Hören T4 |
| `schreiben-b1.md` | Template de generación para Schreiben |

---

## Estructura JSON de los batches

Cada archivo batch tiene esta forma:

```jsonc
{
  "passages": [
    { "id": "...", "module": "lesen|horen|...", "teil": 1,
      "title": "...", "text": "..." }
  ],
  "questions": [
    {
      "id": "...", "module": "lesen", "teil": 1,
      "type": "richtig_falsch|ja_nein|multiple_choice|matching|short_answer",
      "question": "...", "options": ["a) ...", "b) ...", "c) ..."],
      "correct": "Richtig|Falsch|Ja|Nein|a|b|c|rubric",
      "correctAnswer": "(mismo valor que correct)",
      "explanation": "...",
      "passageId": "...",
      "signText": "...(solo Lesen T4: cita textual de la postura del hablante)",
      "lang": "de", "level": "B1"
    }
  ]
}
```

---

## Estructura oficial del examen (blueprint)

Usa el PDF adjunto como referencia principal. Para orientación:

| Módulo | Teil | Ítems | Tipo de pregunta |
|---|---|---|---|
| Lesen | T1 | 6 | Richtig/Falsch (1 texto largo) |
| Lesen | T2 | 6 | Multiple choice a/b/c (2 textos cortos) |
| Lesen | T3 | 7 | Matching A–J (5 anuncios + 8 textos, clave "0" = ninguno) |
| Lesen | T4 | 7 | Ja/Nein (foro de opinión, 7 personas) |
| Lesen | T5 | 4 | Multiple choice a/b/c (texto con huecos) |
| Hören | T1 | 10 (5RF+5MC) | Richtig/Falsch + Multiple choice |
| Hören | T2 | 5 | Multiple choice a/b/c |
| Hören | T3 | 7 | Richtig/Falsch (diálogo) |
| Hören | T4 | 8 | Matching a/b/c (debate radio, 3 hablantes) |
| Schreiben | T1-T3 | — | short_answer (rubric) |
| Sprechen | T1-T3 | — | short_answer (rubric) |

---

## Lo que necesito que audites

### 1. Fidelidad al examen oficial (compara con el PDF)
Para cada Teil de cada muestra adjunta, responde:
- ¿El formato coincide exactamente con el oficial? (longitud de textos, número de ítems, tipo de preguntas)
- ¿El nivel lingüístico es B1 auténtico? (vocabulario, gramática, complejidad de frases)
- ¿Los textos son naturales, creíbles y culturalmente apropiados para el contexto alemán?
- ¿Las distracciones (opciones incorrectas) son plausibles pero claramente distinguibles de la correcta?

### 2. Calidad pedagógica
- ¿Los pasajes/textos son temáticamente variados y relevantes para adultos?
- ¿Las preguntas evalúan comprensión real (no copia literal del texto)?
- ¿Las explicaciones son útiles para el aprendizaje?
- ¿Hay coherencia interna entre texto, preguntas y respuestas correctas?

### 3. Lesen T4 — verificación especial
- ¿Las 7 preguntas son afirmativas y siguen el patrón `"Ist <Vorname> für den Vorschlag?"`?
- ¿El `signText` (cita del hablante) es natural y no contiene meta-etiquetas como "Ich bin implizit dagegen"?
- ¿La clave (`correct: "Ja"/"Nein"`) coincide con la postura real expresada en el signText?
- ¿El balance Ja/Nein es 3–4 / 3–4?

### 4. Hören T3 y T4 — verificación especial
- **T3**: ¿El diálogo es informal (Umgangssprache apropiado)? ¿Las 7 preguntas Richtig/Falsch no copian literalmente el texto?
- **T4**: ¿El debate tiene 3 hablantes claramente diferenciados? ¿Las opciones son `["a) Moderator","b) <Inv1>","c) <Inv2>"]`? ¿Cada letra aparece al menos una vez?

### 5. Schreiben y Sprechen
- ¿Los enunciados son claros y graduados correctamente para B1?
- ¿Los criterios de evaluación (`explanation`) son aplicables y concretos?
- ¿Los temas son apropiados para el formato oficial (carta, email, discusión con imágenes)?

### 6. Templates de generación (archivos .md)
Revisa los templates adjuntos y dime:
- ¿Las instrucciones al LLM producirían contenido conforme al examen oficial?
- ¿Hay alguna regla contraproducente, ambigua o que falte?
- ¿Alguna instrucción podría llevar sistemáticamente a errores que se colarían en el pipeline?

---

## Lo que NO necesito

- No audites el código del pipeline (generadores, scripts de validación).
- No propongas cambios de arquitectura.
- No es necesario que revises todos los archivos adjuntos ítem por ítem: con una muestra representativa de cada Teil es suficiente.

---

## Formato de respuesta esperado

Para cada Teil auditado:
```
### [Módulo] Teil [N]
**Fidelidad oficial:** [✅ CONFORME / ⚠️ PARCIAL / ❌ NO CONFORME]
**Nivel lingüístico B1:** [✅ / ⚠️ / ❌]
**Calidad pedagógica:** [✅ / ⚠️ / ❌]

Hallazgos:
- [CRÍTICO/IMPORTANTE/MENOR] Descripción del problema con ejemplo específico del archivo
- ...

Veredicto: [LISTO PARA GENERACIÓN MASIVA / NECESITA AJUSTES MENORES / BLOQUEA GENERACIÓN]
```

Al final, un resumen ejecutivo con:
- Lista de bloqueos (si los hay) que impidan la generación masiva
- Lista de mejoras recomendadas (no bloqueantes)
- Veredicto global: ¿está el sistema listo para generar en masa?

---

> **Nota para Claude:** sé directo y específico. Cita ejemplos concretos de los archivos adjuntos cuando señales un problema. Si algo está bien hecho, dilo también — no inventes problemas donde no los hay.
