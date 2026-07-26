# Preparación de infraestructura A2 / B2 / C1 — paridad con B1

**Fecha:** 2026-07-22  
**Alcance:** diagnóstico + evidencia ejecutada. **Sin generación de volumen** en ningún nivel.  
**Referencia B1:** pipeline `generar-hasta-50.ps1`, pool-verified ~400+ fichas, gates ejercitados, moldes T3/T4/T5, `weak-de_B1.json` operativo.

Comandos ejecutados desde `c:\Users\marco\Desktop\MDR\lexiloop` salvo indicación contraria.

---

## Resumen ejecutivo — semáforo

| Nivel | Pipeline al nivel de B1 | Primer bloqueante |
|-------|-------------------------|-------------------|
| **A2** | **PARCIAL** | Pipeline de volumen no parametrizado (`generar-hasta-50` → B1); cobertura vocab A2 sin blobs; plantillas Lesen incompletas; gates B1-centrados sin calibrar todos para A2 |
| **B2** | **NO** | `examLevelCells.mjs` no define B2 (fallback erróneo a layout B1); plantillas/prompts caen a B1; sin `weak-de_B2.json` ni pool |
| **C1** | **NO** | Igual que B2 + blueprint C1 con Lesen 4 Teile (no 5); sin `weak-de_C1.json` ni pool |

---

# A2

## Punto 0 — Definición de formato real

### 0.1 — ¿Existe definición equivalente a `examLevelCells.mjs`?

**Sí, definida y alineada con blueprint.**

| Fuente | Contenido |
|--------|-----------|
| `scripts/lib/examLevelCells.mjs` | `ASSEMBLE_LAYOUT.A2`: Lesen **4**, Hören **4**, Schreiben **2**, Sprechen **3** → **13 celdas** |
| `library/blueprints/goethe_A2.json` | Misma estructura; `source`: «Goethe-Institut Modellsatz A2 Erwachsene»; `structureVersion: 3` |

Verificación ejecutada:

```text
node -e "import { layoutForLevel } from './scripts/lib/examLevelCells.mjs'; …"
→ A2: lesen[1-4], horen[1-4], schreiben[1-2], sprechen[1-3]
→ blueprint A2: lesen=4, horen=4, schreiben=2, sprechen=3  ✓ COINCIDE
```

Tipos de tarea por Teil (blueprint, no copia B1):

| Módulo | T | slotType | Items | Notas vs B1 |
|--------|---|----------|-------|-------------|
| Lesen | 1 | `press_mcq` | 5 MCQ | B1: blog 1ª persona |
| Lesen | 2 | `info_board_mcq` | 5 MCQ | B1: 2 textos prensa |
| Lesen | 3 | `email_mcq` | 5 MCQ | B1: anuncios A–J |
| Lesen | 4 | `ads_matching` | 5 matching + 6 Anzeigen | B1: foro ja/nein |
| Hören | 1 | `short_texts_twice` | 5 MCQ ×2 escucha | B1 H1: 1RF+1MC por segmento |
| Hören | 2 | `picture_matching` | 5 matching, banco a–i | B1 H2: monólogo MCQ |
| Hören | 3 | `short_dialogues_once` | 5 MCQ | distinto |
| Hören | 4 | `interview_twice` | 5 ja_nein | B1 H4: matching speakers |
| Schreiben | 1–2 | SMS / carta corta | 20–30 / 30–40 Wörter | B1: 3 tareas distintas |
| Sprechen | 1–3 | diálogo / foto / planificación | 3 Teile | B1: 3 tareas distintas |

### 0.2 — Formato oficial documentado

Ya cubierto en `goethe_A2.json` (duraciones: Lesen/Hören/Schreiben 30 min c/u; Sprechen ~15 min).

### 0.3 — Estado de verificación

**Definido y verificado** — `examLevelCells` ↔ blueprint ↔ ensamblado (13 celdas).

---

## Punto 1 — Pipeline de generación parametrizado

### 1.1 — `generar-hasta-50.ps1`

| Componente | Reutilizable sin cambio | Necesita parámetro A2 |
|------------|-------------------------|------------------------|
| Loop tandas / `--from-coverage` / publish | Sí (lógica genérica) | `$Level = 'B1'` **hardcoded** L30; `$WeakFile = weak-de_B1` L31 |
| Teile Lesen 1–5 | No | A2 solo T1–4 |
| `make-t3.mjs` / `make-t4.mjs` | No | Moldes B1 T3/T4 |
| `generate-lesen-part-gemini.mjs --level` | Parcial | Acepta `--level A2` pero… |
| `generatePartGeminiLib.mjs --level` | Parcial | Reglas A2 en `examTemplatePrompt.mjs` (H2 pictures, H3/H4) |

**Camino A2 hoy:** seed curado (`seed-a2-pool-verified-from-curated.mjs`), no loop B1. Pool: **41 fichas**, **40× `-cur-`**, 1× gemini.

### 1.2 — Moldes / subtipos

| Sistema | A2 |
|---------|-----|
| T4/T5 moldes (`persistedCellPool`, `titleVariantBank`, CHK-29) | **Solo B1** — A2 Lesen T4 = Anzeigen matching, no foro/debate |
| T3 blueprint stock | B1 |
| Hören T2 openings rotadas | B1 pipeline only |
| Plantillas | **Parcial:** `plantillas-lesen-a2/` solo `lesen-teil2.md`, `lesen-teil4.md` — **faltan T1 y T3**; Hören/Sprechen/Schreiben A2 completos |

### 1.3 — Pool vocabulario / coverage

| Archivo | Estado |
|---------|--------|
| `data/coverage/weak-de_A2.json` | **Existe** (600 lemas) pero `weakCount: 600/600` → sin cobertura real en blobs |
| `vocab-coverage-report.mjs --level A2` | **FALLA:** «No hay partes que medir» (0 índices blobs) |

**Prerrequisito antes de volumen A2:** sembrar blobs A2 o adaptar coverage a pool-verified local (como B1).

---

## Punto 2 — Gates y umbrales CEFR

### 2.1 — CefrGate por nivel

`js/engine/validation/CefrGate.js` define bandas **por nivel** (A1–C2):

| Métrica | A2 | B1 | B2 | C1 |
|---------|----|----|----|----|
| avgSentenceLen | 6–14 | 10–22 | 14–28 | 18–35 |
| subordinatePct | 0–12 | 4–45 | 8–45 | 12–55 |
| maxInference | 0.2 | 0.35 | 0.25–0.55 | ≥0.4 min |

`node scripts/test-cefr-gate.mjs` → **PASS** (incluye B1↔A1/C1 contrast).

Length-bias A2: `verify-a2-gates-live.mjs` confirma umbrales `{ minPct: 20, minChars: 8, batchFailCount: 2 }` distintos de B1.

### 2.2 — Gates probados vs teóricos

| Gate / check | A2 evidencia real | Notas |
|--------------|-------------------|-------|
| CHK-LEVEL | ✓ `audit-a2-level-integrity.mjs` PASS en e1 ensamblado | Genérico por `expectedLevel` |
| Ensamblado pool | ✓ dry-run + assemble real; gates CHK-14, MCQ exclusión, CHK-18 | Curated pool |
| CEFR live | ✓ `verify-a2-gates-live.mjs` | Bank slices A2 |
| Generación Gemini volumen | ✗ no ejercitado | Pool curado |
| CHK-20 (H1 1RF+1MC) | Aplica pero **invariante B1** — A2 H1 es 5× MCQ puro | Falso positivo potencial |
| CHK-29 moldes T4/T5 | B1 Lesen only | N/A A2 T4 (Anzeigen) |
| CHK-7 foro T4 | Excluye A2 Lesen/Hören T4 | ✓ adaptado |

### 2.3 — Blacklist léxica

| Lista | A2 | B2/C1 |
|-------|-----|-------|
| `BLACKLIST` (C1/C2 en passages) | Aplica a **todos** los niveles en CHK-6 | **Problema C1:** vocab C1 sería «prohibido» |
| `B1_QUESTION_BLACKLIST` | CHK-6c solo A2 preguntas | — |
| `B2_QUESTION_BLACKLIST` | No en A2 (CHK-6c) | CHK-6 aplica B2+ a preguntas si `level !== 'A2'` — **sin rama C1/B2 específica** |
| `questionBlacklistForLevel()` | A2→B1+ | B2/C1→B2+ (misma lista) |

**Conclusión:** paramétrica parcialmente; **C1 necesita blacklist invertida/desactivada** antes de generar.

---

## Punto 3 — Herramientas de auditoría

| Herramienta | A2 | Cambio mínimo |
|-------------|-----|---------------|
| `audit-published-vs-assembled.mjs --level A2` | ✓ ejecutado → **1/1 SYNC** (partIds) | Ampliar a `contentHash` (blind spot conocido B1/A2) |
| `audit-topic-format-mold-matrix.mjs` | Solo B1 (`BATCH_DIRS` → pool-verified/B1) | Reescribir por nivel o parametrizar |
| `titleHeadroom.mjs` | Acepta `opts.level` pero moldes T4/T5 son B1 | N/A A2 (sin T5) |
| CHK-LEVEL | ✓ genérico `checkExamLevelIntegrity()` | Ninguno |

---

## Punto 4 — Prueba de humo (sin volumen)

### Estado post-fix ensamblador (batchToRecord pictures)

```text
node scripts/assemble-from-pool-verified.mjs --level A2 --dry-run
→ capacidad 1, cuello de botella lesen_2=1, horen_2=5 usable

assembled exam e1:
  horen_2.segments[0].pictures.length = 9
  blueprintSlot = picture_matching
  GATE-1 = PASS

node scripts/audit-published-vs-assembled.mjs --lang de --level A2
→ 1/1 SYNC

node scripts/audit-a2-level-integrity.mjs
→ CHK-LEVEL PASS, gate1 PASS
```

### Inventario editorial (no reescrito, Punto 5)

| Issue | Celda | Evidencia |
|-------|-------|-----------|
| Registro B1 en texto A2 | horen_4 | Contenido «billiger», Nahverkehr — nivel declarado A2 |
| Typo Q3 | horen_1 | «nach dem Radio» (sesión previa) |
| Lesen T1 registro alto | lesen_1 ensamblado | «Herausforderungen», «Weiterbildung» en texto curado |
| Bottleneck stock | lesen_2 | 1 usable post-gates → max 1 examen |

---

## Punto 5 — Explícitamente NO hecho (A2)

- Volumen generación masiva
- vocab-bg personalización (sigue B1)
- Reescritura Hören T4 / inventario editorial

---

# B2

## Punto 0 — Definición de formato real

### 0.1 — ¿Existe `examLevelCells` equivalente?

**No.** `layoutForLevel('B2')` → **fallback a layout B1** (15 celdas):

```text
B2 examLevelCells (fallback): schreibenTeils [1,2,3], sprechenTeils [1,2,3]
B2 blueprint real:            schreiben 2, sprechen 2
→ DESALINEACIÓN CRÍTICA en Schreiben T3 y Sprechen T3 (celdas fantasma)
```

### 0.2 — Formato oficial (blueprint — prerrequisito documentado)

Fuente: `library/blueprints/goethe_B2.json` («Modellsatz B2 Erwachsene»)

| Módulo | Teile | Tipo de tarea | Items | Duración módulo |
|--------|-------|---------------|-------|-----------------|
| Lesen | 5 | T1 forum matching (4 personas, 9 ítems); T2 sentence insertion (8 opciones, 6 gaps); T3 artículo MCQ (6); T4 opiniones↔headlines (6+8); T5 reglas↔headings (3+7 pool) | 30 | 65 min |
| Hören | 4 | T1 5 segmentos × (RF+MC)=10; T2 entrevista 6 MCQ ×2; T3 panel 6 matching speakers; T4 Vortrag 8 MCQ ×2 | 30 | ~40 min |
| Schreiben | **2** | T1 foro ≥150 W; T2 mensaje jefe ≥100 W | 2 | 75 min |
| Sprechen | **2** | T1 Vortrag; T2 Diskussion | 2 | ~15 min + 15 prep |

**Nota:** grading modular 60% por módulo (`modularGrading: true`) — distinto de A2/B1.

### 0.3 — Estado verificación

**Definido en blueprint, NO verificado en pipeline de ensamblado/generación.**

- Blueprint: ✓ estructura distinta de B1 documentada
- `examLevelCells`: ✗ ausente (fallback B1 incorrecto)
- Plantillas: ✗ caen a B1 (`resolveModuleDir` / `LESEN_TEMPLATE_DIRS` sin entrada B2)

---

## Punto 1 — Pipeline

| Item | B2 |
|------|-----|
| `generar-hasta-50.ps1` | Hardcoded B1 |
| `generate-lesen-part-gemini.mjs --level B2` | Arranca pero **sin `--from-coverage`** falla (no `weak-de_B2.json`) |
| `generate-part-gemini.mjs --module horen --level B2` | Usa **`plantillas-horen-b1`** → formato B1 H1, no B2 H1 (10 ítems RF+MC) |
| Moldes T3/T4/T5 | B1 only |
| `weak-de_B2.json` | **NO EXISTE** |
| `pool-verified/B2/` | **0 ficheros** |
| `library/reusable-seed/de_B2.json` | **NO EXISTE** |
| `library/de/B2/questions.json` | Existe (legacy bank, no pipeline verified) |

---

## Punto 2 — Gates

| Item | B2 |
|------|-----|
| CefrGate bandas B2 en código | ✓ definidas |
| Ejercitado con contenido B2 real | ✗ **sin ejercitar** |
| CHK-20 H1 (1RF+1MC) | Incompatible con B2 H1 (2 preguntas/segmento) — requiere gate nuevo |
| CHK-6 BLACKLIST C1/C2 | Bloquearía vocabulario B2 legítimo en passages si se aplicara igual que B1 |
| `verify-a2-gates-live.mjs` equivalente B2 | No existe |

---

## Punto 3 — Auditoría

| Herramienta | B2 |
|-------------|-----|
| `assemble-from-pool-verified.mjs --level B2` | **FATAL: no hay archivos en pool-verified/B2** |
| `audit-published-vs-assembled --level B2` | Acepta flag; sin catálogo assembled |
| mold-matrix / titleHeadroom | B1 hardcoded |
| CHK-LEVEL | Genérico ✓ (cuando haya contenido) |

---

## Punto 4 — Humo

**NO generado** (Punto 0: formato en blueprint sí, pero **no cableado** — generar ahora produciría contenido con forma B1, no B2).

Evidencia:

```text
node scripts/generate-part-gemini.mjs --module horen --level B2 --teil 1 --count 1 --dry-run
→ plantilla: plantillas-horen-b1/horen-teil1.md (5× MCQ, no 5× RF+MC)
```

---

## Punto 5 — NO hecho (B2)

Todo volumen; vocab-bg; contenido editorial.

---

# C1

## Punto 0 — Definición de formato real

### 0.1 — `examLevelCells`

**No.** Fallback B1 → **15 celdas** vs **12 reales**:

```text
C1 blueprint: lesen=4, horen=4, schreiben=2, sprechen=2
C1 examLevelCells (fallback): lesen=5, schreiben=3, sprechen=3
→ lesen_5, schreiben_3, sprechen_3 son celdas FANTASMA
→ lesen_4 real existe pero el layout B1 mezcla tipos incorrectos en T1-T5
```

### 0.2 — Formato oficial (blueprint)

Fuente: `library/blueprints/goethe_C1.json` (`source`: «Modellsatz C1 (Lesen 8/7/8/7, Hören 6/9/8/7, Schreiben 2, Sprechen 2)»)

| Módulo | Teile | Resumen | Items |
|--------|-------|---------|-------|
| Lesen | **4** | T1 artículo MCQ (8); T2 sentence insertion (7); T3 matching headlines (8); T4 gap article (7, gap_fill+MCQ) | 30 |
| Hören | 4 | T1 short×2 (6); T2 monologue×1 (9); T3 conversation RF (8); T4 discussion×2 (7, matching+MCQ) | 30 |
| Schreiben | **2** | Ensayo/formal + argumentative (200–280 W c/u) | 2 |
| Sprechen | **2** | Präsentation + Diskussion | 2 |

Duraciones: Lesen 70 min, Hören 40 min, Schreiben 80 min, Sprechen 15+15 prep. Modular 60%.

### 0.3 — Estado verificación

**Definido en blueprint, NO verificado en ensamblado/generación** (mismo patrón que B2, peor desalineación en Lesen 4 vs 5).

---

## Punto 1 — Pipeline

Idéntico a B2: sin pool, sin weak file, plantillas → B1, moldes B1, `generar-hasta-50` B1-only.

`LESEN_TEMPLATE_DIRS`: solo A2/B1 → C1 usa `plantillas-lesen-b1` + reglas longitud B1 (5 Teile).

---

## Punto 2 — Gates

| Item | C1 |
|------|-----|
| CefrGate bandas C1 | ✓ en código (`minInference: 0.4`, subord 12–55%) |
| Ejercitado | ✗ |
| CHK-6 BLACKLIST | **Bloqueante conceptual:** passages C1 rechazarían vocabulario C1/C2 de `BLACKLIST` |
| CHK-6 B2+ questions | Aplica B2_QUESTION_BLACKLIST — insuficiente/inverso para C1 |

---

## Punto 3 — Auditoría

```text
node scripts/assemble-from-pool-verified.mjs --level C1 --dry-run
→ FATAL: no hay archivos en pool-verified/C1
```

Resto: igual que B2 (herramientas aceptan `--level` pero lógica B1).

---

## Punto 4 — Humo

**NO generado** — sin cableado de formato; riesgo de validar basura con forma B1.

---

## Punto 5 — NO hecho (C1)

Todo volumen; vocab-bg; contenido.

---

# Matriz transversal — componentes reutilizables

| Componente | Agnóstico | B1-only hoy | Acción para B2/C1 |
|------------|-----------|-------------|-------------------|
| `CefrGate.js` COMPLEXITY/INFERENCE | ✓ por nivel | — | Crear `verify-b2-gates-live.mjs` etc. |
| `validate-batch.mjs` + blueprint | ✓ | — | OK cuando haya batch |
| `ExamBlueprint.INDEX` | ✓ A1–C2 | — | OK |
| `examLevelCells.mjs` | — | A2 only | **Añadir B2/C1 layouts** |
| `generar-hasta-50.ps1` | — | ✓ | `-Level` param + Teile por layout |
| Plantillas prompts | Parcial A2 | B1 default | Directorios B2/C1 por módulo×Teil |
| Moldes T3/T4/T5 | — | ✓ | N/A B2/C1 (formatos distintos); nuevos moldes por slotType |
| `weak-de_*.json` | — | B1 (+ archivo A2 vacío) | Generar B2/C1 desde CefrVocab |
| CHK-20, CHK-29, CHK-7 | — | B1 Lesen/Hören | Gates por slotType/nivel |
| Blacklist | Parcial | B1-centric | Desactivar/invertir para C1; relajar para B2 |
| CHK-LEVEL | ✓ | — | OK |
| `audit-published-vs-assembled` | ✓ CLI | contentHash pendiente | +contentHash |
| vocab-bg | — | B1 hardcoded | Fase posterior |

---

# Orden de trabajo recomendado (infra, no contenido)

## Bloqueantes P0 (antes de cualquier generación B2/C1)

1. **`examLevelCells.mjs`:** entradas B2 y C1 alineadas a blueprint (no fallback B1).
2. **Plantillas/prompts B2/C1** por módulo×Teil (o generación desde blueprint slotType, no copia B1).
3. **`weak-de_B2.json` / `weak-de_C1.json`** + estrategia coverage (blobs o pool-local).
4. **Blacklist paramétrica:** C1 off/inverted; B2 passages sin filtro C1/C2.

## P1 (paridad operativa)

5. Parametrizar `generar-hasta-50.ps1` (`-Level`, Teile dinámicos, weak file).
6. Gates estructurales por slotType (sustituir CHK-20 B1-H1 por reglas B2-H1, etc.).
7. `verify-{level}-gates-live.mjs` para B2/C1.
8. Completar plantillas A2 Lesen T1/T3; cablear `--from-coverage` A2.

## P2 (madurez auditoría)

9. mold-matrix / titleHeadroom parametrizados o paralelos por nivel.
10. `audit-published-vs-assembled` → compare `contentHash` por celda.

---

# Anexo — comandos de evidencia

```bash
# Layout vs blueprint
node -e "import { layoutForLevel } from './scripts/lib/examLevelCells.mjs'; …"

# A2 assemble + audit
node scripts/assemble-from-pool-verified.mjs --level A2 --dry-run
node scripts/audit-published-vs-assembled.mjs --lang de --level A2
node scripts/audit-a2-level-integrity.mjs

# A2 gates live
node scripts/verify-a2-gates-live.mjs

# CEFR unit tests (todos los niveles en código)
node scripts/test-cefr-gate.mjs

# B2/C1 pool vacío
node scripts/assemble-from-pool-verified.mjs --level B2 --dry-run   # FATAL
node scripts/assemble-from-pool-verified.mjs --level C1 --dry-run   # FATAL

# Coverage B2 sin pool
node scripts/vocab-coverage-report.mjs --lang de --level B2 --source blobs  # FAIL

# Generación B2 sin infra
node scripts/generate-lesen-part-gemini.mjs --level B2 --teil 1 --count 1 --dry-run  # FAIL sin words
node scripts/generate-part-gemini.mjs --module horen --level B2 --teil 1 --count 1 --dry-run  # plantilla B1
```

---

*Documento de preparación de infraestructura. Sin commits asociados. Sin generación de volumen.*
