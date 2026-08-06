# Q2 — Diagnóstico error de parse JSON

**Fecha:** 2026-07-10

## Hallazgo principal: NO eran 257 parse errors

Re-análisis del jsonl `dryrun-Q2-answerKeyCoherence-2026-07-09T20-11-53.jsonl`:

| Causa | Archivos |
|-------|--------:|
| **Créditos API agotados** (mid-run) | **245** |
| **Parse JSON real** | **12** |
| Éxito LLM | 262 |

El corte a medias del primer re-run se debió a **presupuesto**, no a un fallo sistémico del 50% del corpus.

## Causa raíz del parse (12 casos)

**Comillas alemanas sin escapar dentro del campo `motivo`**, no truncamiento de `passageText`.

### Ejemplo crudo — `lesen-t4-gemini-010.json`

```
```json
[
  {
    "itemId": "gen-q-4-26c87b36-1",
    ...
    "motivo": "Anna sagt explizit „Den Vorschlag unterstütze ich" und findet die Idee gut."
  },
```

La `"` ASCII tras `ich` cierra el string JSON antes de tiempo → `Expected ',' or '}' after property value in JSON at position 207 (line 8 column 67)`.

### Patrón

- Afecta **T4** (7 ítems ja/nein con citas directas en motivo) y **T1** (6 ítems).
- El LLM envuelve en ` ```json ` a pesar del prompt.
- **No** es truncamiento de salida (el error ocurre en el **primer** objeto, línea 8).
- **No** es `passageText` cortado a mitad de palabra (T4 no usa passageText; T1 fallos también son comillas).

## Fix aplicado

1. **`repairMotivoQuoteBreaks()`** — escaneo campo `motivo`, convierte comillas ASCII internas en `'`.
2. **`stripResponseWrappers()`** — elimina ` ```json ` y extrae entre `<<<Q2_JSON>>>` / `<<<END_Q2>>>`.
3. **Prompt** — prohibir Anführungszeichen en motivo; delimitadores explícitos.
4. **`truncatePassageText()`** — corte en límite de frase (`. ` / `\n\n`), no a 1500 chars duros.
5. **Chunking 5 ítems** + **3 reintentos** de parse.

## Validación post-fix

| Métrica | Valor |
|---------|------:|
| Raw samples diagnosticados (5) | 5/5 parse OK |
| Dry-run completo 519 archivos | **519/519 OK** |
| Parse errors residuales | **0** (`t4-038` re-test formal → `Q2-T4-038-RETEST.json`) |
| Credit errors | **0** |
