# Revisión del sistema de generación — Goethe B1

Este paquete contiene todos los archivos que usamos para generar contenido de examen
Goethe-Zertifikat B1 en alemán, tanto manualmente (chat con Gemini/Claude) como de
forma automatizada (pipeline Node.js con Gemini API).

---

## Estructura

```
para-claude-revision/
├── plantillas/          ← Prompts de generación (se pegan en Gemini/Claude)
│   ├── horen-teil1.md   ← Hören T1: 5 audios × 2 preguntas (RF + MC)
│   ├── horen-teil2.md   ← Hören T2: 5 monólogos × 1 MC
│   ├── │   ├── horen-teil3.md   ← Hören T3: diálogo informal (2 voces), 7 RF
│   ├── horen-teil4.md   ← Hören T4: discusión radiofónica (3 voces), 8 matching (Wer sagt was?)
│   ├── lesen-teil1.md   ← Lesen T1: blog/email en 1ª persona, 6 RF
│   ├── lesen-teil2.md   ← Lesen T2: 2 textos de prensa, 6 MC (3 por texto)
│   ├── lesen-teil3.md   ← Lesen T3: 10 anuncios A–J + 7 situaciones, matching (clave "0" = ninguno)
│   ├── lesen-teil4.md   ← Lesen T4: foro de opinión (7 personas), 7 Ja/Nein
│   ├── lesen-teil5.md   ← Lesen T5: Hausordnung/reglas, 4 MC
│   ├── schreiben-b1.md  ← Schreiben T1+T2+T3 (forum/email/nota)
│   └── sprechen-b1.md   ← Sprechen T1+T2+T3 (plan/presentación/feedback)
│
├── pipeline/            ← Scripts del pipeline de validación automatizado
│   ├── normalizeBatch.mjs        ← Normaliza tipos, extrae teil del ID, strip bold/Stichworte
│   ├── horenBatchQuality.mjs     ← Gates pedagógicos específicos Hören
│   ├── promptBatchQuality.mjs    ← Gates pedagógicos Schreiben/Sprechen
│   ├── lexicalCheck.mjs          ← Blacklist C1/C2 + reglas léxicas contextuales
│   ├── blueprintConformance.mjs  ← Verifica conformidad con el blueprint Goethe B1
│   ├── audit-pass-2.mjs          ← Auditoría automática (CHK-1…CHK-10)
│   ├── import-manual-batch.mjs   ← Importa JSON pegado de Gemini/Claude y lo valida
│   └── print-horen-prompt.mjs    ← Imprime el prompt de Hören listo para pegar
│
└── muestras/            ← Ejemplos reales aprobados por el pipeline (uno por módulo/teil)
    ├── horen-t1-muestra.json
    ├── horen-t2-muestra.json
    ├── horen-t3-muestra.json
    ├── horen-t4-muestra.json
    ├── lesen-t1-muestra.json
    ├── lesen-t2-muestra.json
    ├── lesen-t3-muestra.json
    ├── lesen-t4-muestra.json
    ├── lesen-t5-muestra.json
    ├── schreiben-muestra.json
    └── sprechen-muestra.json
```

---

## Flujo de generación

### Automático (pipeline Gemini API)
```
Plantilla .md → buildExamPrompt() → Gemini API → JSON
  → normalizeBatch (tipos, teil, strip artefactos)
  → validate-batch (blueprint Goethe B1)
  → horenBatchQuality / promptBatchQuality (pedagógico)
  → lexicalCheck (C1/C2 blacklist)
  → semanticDedup (Jaccard ≥0.55 → rechazar duplicados)
  → audit-pass-2 (CHK-1…CHK-10)
  → guardar en batches/generated/
```

### Manual (chat con Gemini o Claude)
```
print-horen-prompt.mjs --teil N  → copiar prompt → pegar en chat
  → copiar respuesta JSON → guardar en batches/inbox/horen-tN.txt
  → import-manual-batch.mjs --module horen --teil N --file batches/inbox/horen-tN.txt
  → mismo pipeline de validación → guardar en batches/generated/
```

---

## Checks del pipeline (audit-pass-2)

| ID | Severidad | Qué verifica |
|---|---|---|
| CHK-1 | CRÍTICO | Tipos canónicos (no "multiple", solo "multiple_choice") |
| CHK-2 | CRÍTICO | correct/correctAnswer válidos y dentro de options |
| CHK-3 | CRÍTICO | Conteo de ítems por teil (blueprint) |
| CHK-4 | IMPORTANTE | Balance de respuestas (no >55% la misma letra) |
| CHK-5 | CRÍTICO | Deduplicación global (pasajes exactos duplicados) |
| CHK-6 | CRÍTICO | Léxico C1/C2 en pasajes Hören/Lesen |
| CHK-7 | IMPORTANTE | Lesen T4: afirmativas, coherencia |
| CHK-8 | CRÍTICO | Integridad básica (IDs únicos, campos requeridos) |
| CHK-9 | MENOR | Beispiel (0) ausente en T1/T4 |
| CHK-10 | IMPORTANTE | Lenguaje absoluto en Lesen T1 (immer/nie/alle…) |

---

## Estado actual del corpus (30 Jun 2026)

| Módulo/Teil | Aprobados | Exámenes posibles |
|---|---|---|
| lesen_t1 | 342 ítems | 57 ✅ |
| lesen_t2 | 90 ítems | 15 ✅ |
| lesen_t3 | 707 ítems | 101 ✅ |
| lesen_t4 | 49 ítems | 7 ⚠️ |
| lesen_t5 | 20 ítems | 5 ⚠️ |
| horen_t1 | 20 ítems | 2 🔶 |
| horen_t2 | 15 ítems | 3 🔶 |
| horen_t3 | 42 ítems | 6 ⚠️ |
| horen_t4 | 24 ítems | 3 🔶 |
| schreiben_t1/2/3 | 6 c/u | 6 ⚠️ |
| sprechen_t1/2/3 | 7 c/u | 7 ⚠️ |

**Objetivo: 50 exámenes por teil.**

---

## Qué necesitamos de Claude

Revisa principalmente:
1. **Plantillas** — ¿Son los prompts 100% coherentes con el formato oficial Goethe B1?
   ¿Alguna plantilla tiene instrucciones contradictorias o incompletas?
2. **Muestras** — ¿Los ejemplos generados cumplen el estándar Goethe en calidad,
   formato, nivel lingüístico y coherencia pedagógica?
3. **Pipeline** — ¿Los checks (CHK-1…CHK-10) son suficientes? ¿Falta algún gate crítico?
4. **Hören específicamente** — Es el módulo más caro de generar manualmente.
   ¿Las plantillas horen-teil1…4 son lo suficientemente claras para que Gemini/Claude
   genere sin errores en el primer intento?

