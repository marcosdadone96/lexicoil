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
