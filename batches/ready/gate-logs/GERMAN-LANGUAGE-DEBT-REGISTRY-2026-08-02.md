# Registro consolidado — deuda de idioma alemán + comportamiento esperado

**Fecha:** 2026-08-02  
**Estado:** Activo — referencia única post PASO 3  
**Relacionado:** `A2-PASO-3-MEDIA-BAJA-DIAGNOSIS-2026-08-02.md`, `BACKLOG.md` §Wave 2 caps

---

## Comportamiento esperado (no bug — no re-investigar)

### Schreiben / Sprechen — `userVocabFeedback.ratio === 0`

| Campo | Valor |
|-------|-------|
| **Veredicto** | **Esperado, no bug** |
| **Motivo** | Los formatos oficiales Goethe (SMS, E-Mail, Karten T1, planificación T2…) no admiten insertar vocabulario de usuario sin romper la estructura del ítem. |
| **Telemetría** | `computeVocabFeedback()` es post-hoc; `feedbackMode: "off"` en oral. |
| **Gate duro** | Solo Lesen T5 (`checkT5VocabIntegration` / topicMoldCircuitBreaker). |
| **Acción** | Ninguna en código. Mejorar integración = **nuevas premisas/blueprints** (BACKLOG §Schreiben A2), no parche de ratio. |

### Sprechen T1 A2 — `topicTag` vs contenido personal

| Campo | Valor |
|-------|-------|
| **Veredicto** | **Política, no bug** |
| **Motivo** | Goethe T1 = 4 Karten fijas (Geburtstag, Wohnort, Beruf, Hobby). El contenido nunca “pinta” el eje `_requestedTopic`. |
| **Implementación** | `isSprechenT1PersonalFixedFormat()` · `batch.topicTag` = eje pool-fill · `question.topicTags` = `Freizeit` · `topic_mismatch` audit-only en `poolReadyCheck` (mismo criterio que Hören T1 `content_topic`). |

---

## Deuda técnica trackeada (acción futura)

| ID | Patrón | Ejemplo | Fuente | Estado |
|----|--------|---------|--------|--------|
| **VOCAB-TEST-6** | Finite / ge-Partizip → Infinitiv en `extractVocabularyFromText` | `vermisst`, `beeinflusst`, `befasst`, `gezeigt`, `gekippt` | `enrichBatchMetadata.vocab.test.mjs` §v2.3.3 / §v2.3.11 | **Pre-existente** — 6 fail idénticos HEAD vs post PASO 3 (`155/6` → `168/6`; evidencia `gate-logs/vocab-test-baseline-stderr.txt`, 2026-08-02) |
| **W2-CAP-1** | Sust./participio minúscula tras comparación | `studierenden` → `Studierenden` | BACKLOG L46 · `t5-070` | Pendiente |
| **W2-CAP-2** | Participio adj. capitalizado | `Zahlenden` → `zahlenden` | BACKLOG L47 · `t5-070` | Pendiente |
| **W2-CAP-3** | Adj. tras art. indefinido | `Automatische Sperre` → `automatische` | BACKLOG L48 · `t4-040` | Pendiente |
| **LT-ADV** | LanguageTool advisory down en generación | `[LT advisory] skipped (LT down)` | Sesión 2026-08-02 | Infra — no bloquea |
| **CHK-14** | Volumen / FP mix en CHK-14 | FP `besser`, etc. | PROJECT-STATE-AUDIT §4 | P2 documentado |
| **CAPS-H3** | Mayúsculas Hören T3 (fricción normal) | Sesión 2026-08-02-b | Auditoría | Conocido |
| **SKIP-ANG** | *Angeboten* skip en normalización | `horen-t3-081` log | Sesión 2026-08-02 | Individual |
| **SEP-GLOSS-FR** | Glosario verbos separables FR vacío (0/125); EN/ES/IT curados | `separableResolve.js` `SEPARABLE_GLOSS` · test `separable-ui-langs-fr-it.test.mjs` espera `fr=0` | Auditoría B1 2026-08-02 | **Pendiente — prioridad media** — replicar patrón IT: `scripts/lib/separableGlossFr.mjs` + `patch-separable-gloss-fr.mjs` (ver `separableGlossIt.mjs` / `patch-separable-gloss-it.mjs`) |
| **JS-FOLD-TOPIC-KEY** | Redeclaración global aborta `a2Topics.js` → A2 UI usa fallback B1 (16 temas) | `verify-a2topics-browser-collision.mjs` post-fix 2026-08-02 | Auditoría B1 2026-08-02 | **Resuelto en código** — alias `b1Helpers` / `b1FoldTopicKey` en `a2Topics.js`; deploy pendiente cuota Netlify |

### JS-FOLD-TOPIC-KEY — redeclusión global aborta A2 en browser

**Estado: RESUELTO en código (2026-08-02)** — fix en `js/data/a2Topics.js`: helpers B1 vía `b1Helpers` + alias locales (`b1FoldTopicKey`, `b1NormalizeTopic`, `b1TopicsList`); browser lee `window.B1Topics` y referencia global `foldTopicKey` sin redeclarar.

**Verificación post-fix** (`node scripts/verify-a2topics-browser-collision.mjs` → exit 0, artefacto `a2topics-browser-collision-verify-2026-08-02.json`):

| Probe | Antes | Después |
|-------|-------|---------|
| `pageerror` tras load | `Identifier 'foldTopicKey' has already been declared` | **ninguno** |
| `window.A2Topics` | ausente | **presente** (5 keys export) |
| `personalStockA2` | 16 temas B1 | **5 ejes oficiales** |
| `hasDestructuringLine` en fetch a2Topics.js | `true` | **`false`** |
| `eval(a2Topics.js)` | SyntaxError | **sin error** |
| B1 `foldTopicKey('Freizeit')` | `'freizeit'` | **`'freizeit'`** (intacto) |
| B1 `normalizeB1Topic('Freizeit')` | `'Freizeit'` | **`'Freizeit'`** (intacto) |
| `personalStockB1` | 16 temas | **16 temas** (sin regresión) |

**Histórico (pre-fix):**

| Probe | Resultado |
|-------|-----------|
| `pageerror` tras load normal | `Identifier 'foldTopicKey' has already been declared` |
| `window.A2Topics` | **`false` / ausente** — script A2 no ejecuta |
| `window.B1Topics` | presente (16 temas) |
| `PersonalTopicStock.buildFallbackManifest('de','A2')` | **16 temas B1** incl. `Freizeit`, `Technik`, `Arbeit` — **idéntico a B1** |
| `normalizeA2Topic('Freizeit')` | **`__A2Topics_MISSING__`** (función no registrada) |
| Global `normalizeB1Topic('Freizeit')` | `'Freizeit'` (B1 path activo) |

**Cadena de fallback (código):**

```22:34:js/data/personalTopicStock.js
  function topicsForLevel(level) {
    const lv = normalizeLevel(level);
    if (lv === 'A2' && typeof A2Topics !== 'undefined' && A2Topics.A2_OFFICIAL_TOPICS?.length) {
      return [...A2Topics.A2_OFFICIAL_TOPICS];
    }
    if (typeof B1Topics !== 'undefined' && B1Topics.B1_TOPICS?.length) {
      return [...B1Topics.B1_TOPICS];
    }
```

```105:109:js/ui/exam/examConfig.js
  if(lv==='A2'&&typeof A2Topics!=='undefined'&&A2Topics.normalizeA2Topic){
    canon=A2Topics.normalizeA2Topic(value)||canon;
  }else if(typeof B1Topics!=='undefined'&&B1Topics.normalizeB1Topic){
    canon=B1Topics.normalizeB1Topic(value)||canon;
```

**Nota smoke B1:** el smoke `official-de-B1-e1` pasó porque es flujo B1 — no ejercita picker A2; el warning no implica ausencia de impacto en A2.

**Fix aplicado:** renombrar destructuring en `a2Topics.js` L23 → `b1Helpers` + alias locales; browser usa `window.B1Topics` + global `foldTopicKey` sin re-bind.

---

## Reparados en PASO 3 (2026-08-02)

| ID | Archivo | Error | Fix |
|----|---------|-------|-----|
| **PASO3-LANG-058** | `schreiben-gemini-058` | Bullet 3: `• fragen Sie…` (Sie-Imperativ) | **Corregido** → `• Fragen Sie…` en pool-verified + `de_A2.json` seed |
| **PASO3-VOCAB** | Pool A2 (media) | Tags `punkten`, `themen`, `möcht`, `unternehm`, adj. flexionados | **Código** `enrichBatchMetadata` v2.3.18 + tests |

---

## Pendiente contenido (BACKLOG — no código)

| ID | Ítem | Referencia |
|----|------|------------|
| **3.3** | Plantillas repetitivas Schreiben/Sprechen | `BACKLOG.md` §Schreiben A2 — techo de premisas |
| **POOL-TOPIC-AB** | 132 → 61 topic mismatch fuerte | `gate-logs/topic-mismatch-ab-2026-07-10.json` |

---

## Evidencia PASO 3

- Tests: `enrichBatchMetadata.vocab.test.mjs`, `sprechen-t1-topic-policy.test.mjs`
- Scan pool: `gate-logs/paso3-vocab-repair-evidence-2026-08-02.json` (post-enrich determinista)
