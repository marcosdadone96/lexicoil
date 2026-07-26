# Auditoría B1 — generación pool (25 jul 2026)

Ejecución: `generate-cli.mjs --publish --reset --max-attempts 12` en 7 celdas (Lesen T1/T2/T3/T5, Hören T1/T2/T3). Log: `batches/logs/audit-b1-exhaustive-2026-07-25.log` (~78 min).

**Resultado:** 5/7 partes publicadas · **Hören T1 (Familie) y Hören T2 (Reisen) agotaron 12 intentos sin publicar.**

---

## 1 — Evidencia por Teil

| Teil | Tema | Parte | Intentos | Coste celda | Motivos principales de fallo |
|------|------|-------|----------|-------------|------------------------------|
| Lesen T1 | Arbeit | `lesen-t1-gemini-205.json` | 1 | $0,038 | word-matching RF → Cubo C + 1 fix-retry |
| Lesen T2 | Stadtleben | `lesen-t2-gemini-162.json` | 2 | $0,087 | MCQ length; **publish POOL-2 CHK-33** (+6% marginal) en intento 1 |
| Lesen T3 | Verkehr | `lesen-t3-gemini-034.json` | 1 | $0 | Blueprint `bp-oepnv-ticket` |
| Lesen T5 | Wohnen | `lesen-t5-gemini-104.json` | 3 | $0,175 | JSON inválido ×2; MCQ length |
| Hören T1 | Familie | — | **12 FAIL** | $0,673 | word-copy MCQ, MCQ length, RF balance, scope CHK-10 |
| Hören T2 | Reisen | — | **12 FAIL** | $0,774 | word-copy, MCQ length, léxico B2+ |
| Hören T3 | Reisen | `horen-t3-gemini-063.json` | 3 | $0,158 | CHK-35 cronología; word-copy |

### Hören T1 · Familie · motivos terminales por intento

1. MCQ length · 2. **100% Falsch** RF · 3. word-copy · 4–5. MCQ length · 6. word-copy · 7. gramática · 8–9. word-copy · 10. MCQ + 1R/4F · 11. word-copy · 12. **100% Falsch**

En casi todos: `topic_mismatch` y `date_weekday_mismatch` **audit-only**.

---

## 2 — Patrones agrupados (18–25 jul, `generation-cost.jsonl`)

| Patrón | Fallos API | Teile |
|--------|------------|-------|
| Word-matching (≥4 palabras) | 409 | 6/6 con generación Gemini |
| MCQ length bias (CHK-33) | 238 | 6/6 |
| Caps / audit2 | 252 | 6/6 |
| Vocab B2+ / lexico | 210 | 6/6 |
| Topic mismatch | 86 | Lesen + audit Hören |
| Balance R/F (CHK-12) | 66 | Hören T1, Lesen T5 |
| date_weekday_mismatch (Q3) | 284 hallazgos | **solo Hören T1** |

**R/F en Familie:** no es tema-specific (histórico Hören T1: Kultur 20, Sport 14, Familie 8). Patrón estructural ventana 5 RF.

**Desalineación MCQ length:** generación usa `collectMcqLengthBiasIssues({ gate: true })` (≥20%/12ch o ≥2 significativas); POOL-2/CHK-33 usaba `gate: false` (cualquier correcta más larga) → caso Lesen T2 +6%/+6 chars.

**Word-copy Hören T1:** reparación solo actualizaba `question`, no opciones MCQ → «genügend pausen…» persistía.

---

## 3 — Propuestas P1 (implementadas 25 jul)

1. **Word-copy:** router Hören T1/T3/T4 repara MCQ vía mismo batch que Lesen T2; n-gramas prohibidos del transcript; validación post-patch. **Causa «genügend pausen…»:** el repair Hören solo parcheaba `question`, no la opción MCQ correcta (no era límite de fix-retries).
2. **MCQ length:** CHK-33 alineado a `gate: true` (mismo umbral 20%/12ch que generación); Hören T1 B1 incluye gate en calidad pedagógica.

### Verificación post-fix (25 jul, 4 corridas)

| Celda | Resultado | Intentos | USD |
|-------|-----------|----------|-----|
| lesen-t2 | OK | 1 (antes audit: 2) | 0,058 |
| horen-t2 (1ª) | OK | 2 (antes audit: 12 FAIL) | 0,111 |
| horen-t1 | FAIL | 10 | 0,646 |
| horen-t2 (2ª) | OK | 3 | 0,144 |

**3/4 publicadas · ~$0,10/parte publicada** (solo OK) vs **~$0,38/parte** en auditoría con Hören fallido incluido. Hören T1 sigue siendo cuello (RF balance + cadenas MCQ/length); P1 atacó copia y umbral publish.

---

## 4 — Promedios

| Métrica | Valor |
|---------|--------|
| Publicadas hoy (5 OK) | 2,0 intentos/parte · $0,092/parte |
| Con 2 Hören fallidas incluidas | ~$1,91 total · **~$0,38/parte efectiva** |
| Histórico 7 días (publicadas) | lesen-t1 ~11,3 llam · horen-t3 ~2,5 llam |

---

## 5 — Top 3 problemas de fondo

1. Anti-copia + reparación que no tocaba opciones MCQ (Hören T1).
2. Sesgo longitud MCQ + umbral publish más estricto que generación.
3. Hören combined (RF+MCQ+5 segmentos) con fix-retries=2 insuficiente para cadenas compuestas.
