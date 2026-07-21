# batches/ — Generación de contenido

## Archivos que importan

| Archivo | Para qué |
|---------|----------|
| **`GEMINI_MASTER_PROMPT_de_B1.md`** | Prompt definitivo Goethe B1 (de) → pegar en Gemini |
| `MASTER_PROMPT_en.md` | Cambridge (en) |
| `MASTER_PROMPT_es.md` | DELE (es) |
| `GENERATION_GUIDE.md` | Guía operativa, IDs, pipeline |
| `CONTENT_AUTHORING_GUIDE.md` | Esquemas, longitudes, checklist |
| `topic-pools/de.json` | Temas aleatorios por módulo/Teil |
| `templates/de_B1/*.json` | Esqueletos JSON por Teil |
| `merged/*.json` | Batches generados (entrada al pipeline) |

## Flujo automático (con API key)

```bash
# 1. Añade GEMINI_API_KEY=... a .env (https://aistudio.google.com/apikey)
#    Si ves UNABLE_TO_VERIFY_LEAF_SIGNATURE → usa npm run (ya lleva --use-system-ca)
#    o NODE_EXTRA_CA_CERTS; ver README raíz § TLS / antivirus.

# 2. Genera + valida + merge en un paso
npm run generate:batch -- --lang de --level B1 --merge

# 3. AUTOMATIZACIÓN Windows (2 CMD)

```bat
scripts\1-generar-de-b1.cmd           REM solo Teile con gap (Hören T4, Lesen T3…)
scripts\1-generar-de-b1.cmd completo  REM 11 batches = 1 examen nuevo completo
scripts\2-montar-de-b1.cmd            REM merge + exámenes (sin Gemini)
```

```bash
npm run generate:b1:gaps    # solo lo que falta
npm run generate:b1:exam    # 1 examen completo (11 batches)
npm run pipeline:assemble -- --lang de --level B1
```

# 4. Varios batches seguidos
npm run generate:batch -- --lang de --level B1 --count 5 --merge

# 5. Forzar módulo
npm run generate:batch -- --lang de --level B1 --module horen --teil 3 --merge

# 6. Ver cobertura
npm run coverage:report -- --detail
```

## Flujo manual (sin API)

```bash
npm run random:batch -- --lang de --level B1
# → Gemini web + GEMINI_MASTER_PROMPT_de_B1.md
# → guardar en merged/
node scripts/validate-batch.mjs --lang de --level B1 --file batches/merged/<archivo>.json
node scripts/merge-bank-batch.mjs --lang de --level B1 --file batches/merged/<archivo>.json
npm run sync:passages -- --lang de --level B1
```

## Flujo rápido (de/B1) — legacy

## Carpetas

- `merged/` — batches listos o pendientes de merge
- `templates/` — plantillas por idioma/nivel/módulo (referencia para IA)
- `topic-pools/` — pools de temas por idioma

## Comprobador POS de mayúsculas alemanas (offline)

```bash
# Linux/macOS
bash scripts/setup-pos-checker.sh
source .venv-pos-check/bin/activate

# Windows (PowerShell) — desde la raíz del repo
powershell -ExecutionPolicy Bypass -File scripts/setup-pos-checker.ps1
# o manualmente:
python -m venv .venv-pos-check
.\.venv-pos-check\Scripts\Activate.ps1
pip install spacy
pip install https://github.com/explosion/spacy-models/releases/download/de_core_news_sm-3.8.0/de_core_news_sm-3.8.0-py3-none-any.whl
$env:POS_CHECK_PYTHON = ".\.venv-pos-check\Scripts\python.exe"

# Verificar que el gate responde (stdin JSON → stdout findings)
echo '{"texts":["Ohne fristgerechte Anmeldung"],"fields":["test"]}' | .\.venv-pos-check\Scripts\python.exe scripts/pos-caps-check.py

# Calibración pool ready
node scripts/calibrate-german-caps-gate.mjs

# Generación con JSON crudo pre-normalización
node scripts/generate-lesen-part-gemini.mjs --teil 2 --count 1 --save-raw
```

Gate en `checkLesenBatchQuality`: default `GERMAN_CAPS_GATE=warn` (solo avisos). Tras calibrar: `GERMAN_CAPS_GATE=block`. Sin spaCy: warning y skip.

## Normalización alemana estable (`germanCapsNormalize v3.0-stable`)

Capa post-generación / pre-audit, **separada** del gate v6.1-B-G2 (congelado).

| Recurso | Contenido |
|---------|-----------|
| `scripts/lib/GERMAN-CAPS-NORMALIZE.md` | Documentación técnica, problemas resueltos (Alter, Sorgen, Kosten, supplement, guard modal) |
| `scripts/lib/__tests__/germanCapsNormalize.corpus.json` | Corpus de regresión permanente |
| `batches/ready/G2-DECAP-ONLY-ITERATION3-RESULTS.md` | Baseline métrica: 88 → 79 findings (193 archivos) |

```bash
npm run test:german-caps-normalize

# Re-validar pool ready (dry-run)
node scripts/repair-german-caps-normalize.mjs --dir batches/ready/lesen --decap-only
```

## LanguageTool (capa permanente, advisory)

**Decisión:** ambas capas — (1) advisory en cada generación nueva, (2) auditoría periódica del pool. Nunca bloqueante en gen: si el contenedor Docker no está arriba, soft-skip.

```bash
# Contenedor (una vez)
docker run -d --name lexicoil-lt -p 8010:8010 erikvl87/languagetool

# Auditoría periódica / por lote sobre pool-verified
npm run audit:languagetool

# Regresión MUST_CATCH (58 hallazgos reales del audit 2026-07-11 + posteriores)
npm run test:languagetool-must-catch
```

Detalle: `scripts/lib/LANGUAGETOOL-AUDIT.md`. Cableado: `runLanguageToolPipelineAdvisory` tras Q3 en Lesen/Hören.

## Contratos de escritor (normalizadores)

**Regla de gobernanza:** ningún normalizador nuevo escribe en el pool sin (1) un contrato explícito de qué puede tocar / qué invariantes promete, (2) asserts que se ejecutan **antes** de persistir, y (3) regresión en verde (`MUST_CATCH` / violation tests).

| Normalizador | Contrato | Tests |
|--------------|----------|-------|
| `germanCapsNormalize` / `capitalizeNouns` | Solo caps; corpus `decapMustNotChange` + groundtruth MUST_CATCH/MUST_NOT_FLAG | `npm run test:german-caps-normalize` |
| `balanceMcqGroup` / `antiRuns` | (a) textos de opciones intactos (solo orden/labels); (b) cuerpo correcto idéntico; (c) explanation letter sync | `npm run test:balance-mcq-contract` |

Ver `assertBalanceMcqWriterContract` en `scripts/lib/balanceMcq.mjs`.

