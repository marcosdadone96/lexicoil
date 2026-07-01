# Playbook: nuevo nivel / idioma

Flujo genérico para llevar un par `(lang, level)` desde blueprint verificado hasta **live** en la app. Los scripts leen rutas y blueprint vía `scripts/lib/examPipeline.mjs` y `js/engine/validation/blueprintResolver.js`.

## Mapa de proveedor

| `lang` | Proveedor   | Blueprint                         |
|--------|-------------|-----------------------------------|
| `de`   | goethe      | `library/blueprints/goethe_<LEVEL>.json` |
| `en`   | cambridge   | `library/blueprints/cambridge_<LEVEL>.json` |
| `es`   | dele        | `library/blueprints/dele_<LEVEL>.json` |

## Rutas estándar

| Recurso        | Ruta |
|----------------|------|
| Blueprint      | `library/blueprints/{provider}_{LEVEL}.json` |
| Banco          | `library/<lang>/<LEVEL>/questions.json` |
| Passages       | `library/<lang>/<LEVEL>/passages.json` |
| Curated        | `library/curated/<lang>/<LEVEL>/curated_*.json` |
| Pool seed      | `library/pool-seed/<lang>_<LEVEL>.json` |
| Servido (app)  | `data/exams/<lang>_<LEVEL>.json` |
| Disponibilidad | `data/exams/availability.json` |
| Auditoría gaps | `docs/audit/residual-gaps.<lang>_<LEVEL>.json` |
| Fidelidad      | `docs/audit/validate-exam-fidelity.<lang>_<LEVEL>.json` |

---

## 1. Blueprint v3 verificado

Antes de generar contenido:

1. Asegura `structureVersion: 3`, sin módulo `grammatik` (Goethe/DELE donde aplique).
2. Conteos por Teil alineados con el Modellsatz oficial (`itemsTotal`, `passagesPerPart`, `questionTypes`, etc.).
3. Reglas de aprobado: `passPercentPerModule` (modular B1/B2) o `passRule` (A2 no modular).
4. Tests Modellsatz: `npm run test:goethe-b1-modellsatz` (y equivalentes A2/B2).

Referencia: `library/blueprints/goethe_B1.json`.

---

## 2. Seed / generación de banco

Generar y normalizar el banco de preguntas:

```bash
# Ejemplo DE B1 (scripts existentes por nivel)
npm run assemble:b1:10
npm run normalize:bank -- --lang de --level B1

# Genérico (montaje desde batches)
npm run pipeline:assemble -- --lang de --level B2 --target 5 --max 5
```

Salida: `library/<lang>/<LEVEL>/questions.json` (+ `passages.json` si aplica).

---

## 3. Fill gaps from pool (determinista)

Rellena huecos en curated usando el banco, sin IA:

```bash
npm run fill:pool -- --lang de --level B1 --dry-run
npm run fill:pool -- --lang de --level B1 --apply
```

Lee: `library/curated/<lang>/<LEVEL>/`, blueprint vía resolver, banco + passages.  
Escribe audit: `docs/audit/residual-gaps.<lang>_<LEVEL>.json`.

---

## 4. Generate residual parts (IA)

Solo para huecos que el pool no puede cerrar (p. ej. Hören T2, Lesen T3 `correct:"0"`):

```bash
npm run gen:residual -- --lang de --level B1 --dry-run
npm run gen:residual -- --lang de --level B1 --apply --yes
```

Requiere `ANTHROPIC_API_KEY`. Lee `residual-gaps.*.json` (legacy B1: `b1-residual-gaps.json`).

---

## 5. Curated → servible

Promover curated al array que consume el cliente:

```bash
npm run assemble:servable -- --lang de --level B1
```

Equivalente: `node scripts/curated-to-served.mjs --lang de --level B1`

Pipeline completo de montaje (incluye sanitize, coherence, fill-missing, curated→served):

```bash
npm run pipeline:assemble -- --lang de --level B1
```

---

## 6. Validación y tests

```bash
# Fidelidad estricta vs blueprint
npm run validate:fidelity -- --lang de --level B1

# CI local (live estricto + beta solo reporta + audit + tests engine)
npm run ci:content
npm run test:engine
```

Scripts Modellsatz por nivel Goethe: `test:goethe-*-modellsatz`.

---

## 7. Criterios para pasar a **live**

Regenera el manifiesto después de validar:

```bash
npm run build:availability
```

Un nivel `(lang, level)` pasa a **`live`** solo cuando se cumplen **todos** estos criterios:

| Criterio | Comando / artefacto |
|----------|---------------------|
| Blueprint **v3** verificado vs Modellsatz oficial | `structureVersion: 3`, tests Modellsatz verdes (`npm run test:engine`) |
| **12 exámenes** servidos | `data/exams/<lang>_<LEVEL>.json` con 12 entradas |
| Fidelidad **12/12** (incl. C1 si aplica al nivel) | `npm run validate:fidelity -- --lang … --level … --strict` |
| Auditoría almacenada **0** bloqueantes | `node scripts/audit-stored-exams.mjs --strict` |
| Tests engine **verdes** | `npm run test:engine` |

El CI (`.github/workflows/content-validation.yml`) ejecuta `npm run ci:content` + `npm run test:engine`.  
`validate:fidelity:all --live-only` **falla** el build si hay errores en niveles `live`; niveles `beta` solo se reportan.

Gate semántico opcional en generación (producción recomendado ON):

```bash
TOPIC_COHERENCE_GATE=1   # ~1 llamada Claude/parte (CLAUDE_VERIFY_MODEL)
```

---

## Checklist rápido (nuevo nivel)

- [ ] Blueprint v3 + test Modellsatz verde  
- [ ] Banco en `library/<lang>/<LEVEL>/`  
- [ ] Curated en `library/curated/<lang>/<LEVEL>/`  
- [ ] `fill:pool` → `gen:residual` (si hay gaps)  
- [ ] `assemble:servable` → **12 exámenes** en `data/exams/`  
- [ ] `validate:fidelity -- --lang … --level … --strict` → **12/12**  
- [ ] `audit-stored-exams.mjs --strict` → **0** bloqueantes  
- [ ] `npm run test:engine` verde  
- [ ] `build:availability` muestra **`live`**

---

## Comandos npm genéricos

| Script | Uso |
|--------|-----|
| `npm run validate:fidelity -- --lang de --level B1` | Gate fidelidad |
| `npm run fill:pool -- --lang de --level B1 [--apply]` | Relleno pool |
| `npm run gen:residual -- --lang de --level B1 [--apply]` | IA residual |
| `npm run assemble:servable -- --lang de --level B1` | Curated → `data/exams/` |
| `npm run build:availability` | Manifiesto global |

Todos los flags `--lang` / `--level` son obligatorios salvo en `build:availability` (recorre todos los pares).
