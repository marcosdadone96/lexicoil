# Q3-B — Coherencia semántica del pasaje (diseño 2026-07-10)

**Estado:** diseño + fixtures · **NO producción**  
**Protocolo:** mismo que Q2 — diseño → fixtures → dry-run muestra pequeña → coste → escalar.  
**Justificación:** 2ª pasada Hören T1/T3/T4 (2026-07-10) — textos que pasan caps/markdown/topic/copia/Q2 pero son semánticamente rotos o léxicamente incorrectos.

Relacionado: capa A ya en producción (`passageCoherenceGate` markdown). Esta nota **amplía** la capa B del diseño original en [`QUALITY-GATES-DESIGN.md`](../QUALITY-GATES-DESIGN.md) § Q3.

---

## 1. Problema

Ningún gate actual evalúa si el **texto en sí** es alemán real coherente:

| Fallo | Ejemplo | ¿Qué lo deja pasar? |
|-------|---------|---------------------|
| Vocabulario forzado | «die Ontologie des Stresses» en radio-Tipp de salud | `passageVocab` métrica cumplida |
| Non-sequitur temático | «Klimawandel» en Durchsage de farmacia/Hustenmittel | topicTag puede seguir «Gesundheit» |
| Léxico «casi correcto» | Reserven≠Ressourcen, Akzent≠Tonfall, Protokoll≠Bericht | caps OK, copia OK |
| Cita fabricada en explanation | «Ich werde es mal probieren.» no está en el diálogo | Q2 mira clave↔explanation, no quote⊆passage |

---

## 2. Tres ejes del juez (LLM)

Una llamada por parte (o por segmento en T1). Respuesta JSON estricta.

### A — Fluidez / naturalidad (`forced_vocab` | `register_break` | `non_sequitur`)

¿Suena a alemán nativo B1 hablado/escrito coherente, o hay inserciones forzadas / saltos temáticos / meta-comentarios?

### B — Corrección léxica (`wrong_lexeme`)

¿La palabra elegida significa lo que el contexto exige? (casi-sinónimos falsos, colocaciones rotas)

### C — Fidelidad de citas (`fabricated_quote`)

¿Las `explanation` (y opciones que citan) solo usan contenido que **existe** en `passage`/`transcript`? Si inventan apoyo adicional → finding aunque la clave sea correcta por otra vía.

---

## 3. Prompt del juez (borrador)

```
Eres revisor de calidad para materiales Goethe B1 (Hören/Lesen).
Revisa SOLO el JSON de entrada (passages + questions).

Marca problemas en estos ejes (puede haber 0..n findings):

A) naturalness — ¿hay términos que no encajan en el registro/tema del segmento
   (p.ej. jerga filosófica en un anuncio de radio de salud), saltos temáticos
   sin transición, o comentarios meta-lingüísticos sobre la propia gramática?
B) lexicon — ¿hay palabras semánticamente incorrectas para el sentido pretendido
   (p.ej. Reserven vs Ressourcen, Akzent regional vs Tonfall, Protokoll vs Bericht)?
C) quote_fidelity — ¿alguna explanation atribuye una cita literal que NO aparece
   en el passage/transcript? (parafrasear está OK; inventar comillas no)

NO marques: B1 simple pero correcto; topicTag discutible si el contenido es coherente;
mayúsculas (otro gate); solapamiento literal pregunta↔pasaje (otro gate).

Responde SOLO JSON:
{
  "ok": true|false,
  "findings": [
    {
      "axis": "naturalness"|"lexicon"|"quote_fidelity",
      "reason": "forced_vocab"|"non_sequitur"|"register_break"|"wrong_lexeme"|"fabricated_quote",
      "severity": "block"|"warn",
      "passageId": "...",
      "questionId": null|"...",
      "quote": "fragmento ≤120 chars",
      "detail": "1 frase en español o alemán"
    }
  ]
}
```

**Severidad sugerida (dry-run):**

| reason | severity inicial |
|--------|------------------|
| `forced_vocab`, `non_sequitur`, `fabricated_quote` | block |
| `wrong_lexeme`, `register_break` | warn → calibrar a block si FP bajo |

---

## 4. Fixtures de validación

### Deben marcar (5)

| # | Fuente | Eje | Evidencia |
|---|--------|-----|-----------|
| F1 | `horen-t1-gemini-009` **archivado** s4 (`…vocab-forced-2026-07-10T11-22-49.json`) | A naturalness | «die Ontologie des Stresses» + «So ein Konjunktiv hilft oft schon beim Nachdenken» |
| F2 | mismo archivo s2 | A naturalness | Non-sequitur «Auswirkungen des Klimawandels» en Apotheken-Durchsage sobre Hustenmittel |
| F3 | `horen-t4-gemini-003.json` | B lexicon | «natürlichen Reserven» (→ Ressourcen); «ein Protokoll veröffentlichen» (→ Bericht) |
| F4 | `.rejected/horen-t4-gemini-002.json` | B lexicon | «am Akzent … dass er unter Druck steht» (→ Tonfall) |
| F5 | `horen-t3-gemini-003.json` Q7 | C quote_fidelity | explanation cita «Ich werde es mal probieren.» — **ausente** del diálogo (sí existe «Vielleicht mache ich das nächstes Wochenende…») |

### No deben marcar (3 limpios, misma muestra)

| # | Fuente | Por qué limpio |
|---|--------|----------------|
| C1 | `horen-t1-gemini-009.json` **nuevo** s1 (Erinnerung Arzttermin) | Ansage de praxis coherente, sin vocab forzado |
| C2 | `horen-t1-gemini-009.json` nuevo s5 (Fitnessstudio Hygiene) | Durchsage coherente |
| C3 | `horen-t3-gemini-003.json` **passage** (diálogo Detox) | Diálogo natural; el defecto está solo en explanation Q7 (F5), no en el transcript |

**Criterio de aceptación dry-run:** 5/5 must-flag · 0/3 clean-flag · coste ≤ 1 call/parte · modelo tipo Haiku/Flash.

---

## 5. Integración propuesta (cuando se implemente)

```
… → Q3-A markdown (ya) → Q2 (si budget) → Q3-B LLM (warn primero) → write
```

- **Hören T1:** opcionalmente 1 call/segmento o 1 call/parte con 5 textos.
- **No** tocar `pos-caps-check.py`.
- Shadow/warn 1–2 semanas antes de block (como Q1a).

---

## 6. Coste (orden de magnitud)

| Ámbito | Calls | Nota |
|--------|------:|------|
| Dry-run 8 fixtures (5+3) | ~8 | validar prompt |
| Muestra 25 partes Hören | ~25 | calibrar FP |
| Producción / parte | 1 | Flash/Haiku |

---

## 7. Decisión pendiente

¿Implementar dry-run ahora o tras el examen ensamblado?  
Fixtures y prompt listos; **no hay código de gate en producción en esta tarea.**

---

## 8. Trabajo ya hecho en paralelo (contexto)

- Prompt Hören T1: omit-over-force + ejemplos Ontologie/Klimawandel/Konjunktiv (`plantillas-horen-b1/horen-teil1.md`, `userVocabPrompt.mjs`).
- `horen-t1-gemini-009.json` regenerado (sin esos fallos).
- Q4 Hören sigue **audit-only** (`hardBlock=false`) — por eso topic_mismatch Wohnen en s4 viejo no rechazó generación.
