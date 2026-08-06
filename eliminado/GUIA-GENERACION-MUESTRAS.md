# Guía de generación — LexiLoop B1
**Última actualización:** 2026-06-30 | Auditoría: 25/25 exámenes verificados ✓

---

## 0. Cómo funciona el sistema — el flujo completo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PASO 1 — GENERAR PARTES                                                    │
│                                                                             │
│  Generas piezas sueltas: "un Hören T3", "un Lesen T2", etc.                │
│  Cada pieza = 1 módulo de un examen (Lesen, Hören, Schreiben o Sprechen)   │
│                                                                             │
│  Ruta A: node scripts/generate-*.mjs  →  Gemini API (automático)           │
│  Ruta B: Pegar prompt en Claude chat  →  copias el JSON a mano             │
│                                                                             │
│  Validación automática: esquema + blacklist + auditoría pedagógica          │
│  Si pasa → se guarda en:                                                   │
│                                                                             │
│  📁 batches/generated/                                                      │
│      horen-t1-gemini-001.json   ← 1 parte de Hören T1                      │
│      horen-t1-gemini-002.json   ← otra parte de Hören T1                   │
│      lesen-t3-auto-045.json     ← 1 parte de Lesen T3                      │
│      schreiben-b1-001.json      ← 1 parte de Schreiben                     │
│      ...  (212 archivos ahora mismo)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
                    node scripts/rebuild-pool-from-generated.mjs
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  PASO 2 — RECONSTRUIR EL BANCO DE PREGUNTAS                                 │
│                                                                             │
│  El script lee todos los archivos de batches/generated/ y los combina       │
│  en dos archivos indexados que el sistema puede consultar:                  │
│                                                                             │
│  📁 library/de/B1/                                                          │
│      questions.json   (1.7 MB) ← todas las preguntas indexadas             │
│      passages.json    (170 KB) ← todos los textos de lectura               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
                    node scripts/build-disjoint-pool.mjs --max 60
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  PASO 3 — ENSAMBLAR EXÁMENES COMPLETOS                                      │
│                                                                             │
│  El script combina partes del banco formando exámenes completos.            │
│  "Disjunto" = ninguna pregunta se repite entre exámenes.                    │
│                                                                             │
│  Cada examen completo tiene:                                                │
│    Lesen T1 + T2 + T3 + T4 + T5                                             │
│    Hören T1 + T2 + T3 + T4                                                  │
│    Schreiben (3 partes)                                                     │
│    Sprechen (3 partes)                                                      │
│                                                                             │
│  Resultado guardado en:                                                     │
│                                                                             │
│  📁 library/pool-seed/de_B1.json   ← array de exámenes completos           │
│      [examen1, examen2, examen3, ...]   (ahora 13 exámenes)                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
                              (usuario abre la app)
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  PASO 4 — LA APP SIRVE EL EXAMEN                                            │
│                                                                             │
│  Cascada de fuentes (en orden de preferencia):                              │
│                                                                             │
│  1. 📁 library/pool-seed/de_B1.json        ← 13 exámenes pre-ensamblados  │
│  2. 📁 data/exams/de_B1.json               ← 12 exámenes de librería      │
│  3. 🔧 QuestionLibrary (ensambla al vuelo) ← usa library/de/B1/            │
│                                                                             │
│  Si el pool-seed se agota → cae a data/exams                               │
│  Si data/exams se agota  → ensambla desde el banco en tiempo real           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### ¿Por qué hay dos pools (library/ y data/exams/)?

- `library/pool-seed/` → exámenes ensamblados **por ti** desde el banco de partes (pasos 1-3)
- `data/exams/` → exámenes **importados/curados manualmente**, con estructura diferente

Ambos están verificados y son fiables.

---

## 1. Estado actual — exámenes disponibles

### Exámenes listos para usar ahora mismo: **25 verificados ✅**

| Fuente | Cantidad | Temas | Estado |
|--------|----------|-------|--------|
| `library/pool-seed/` | 13 | technology ×2, food, education ×2, travel ×2, culture, daily_life, environment, transport, work, health | ✅ |
| `data/exams/` | 12 | technology, education, media, culture, family, daily_life, food, environment, transport, work, health, travel | ✅ |
| **Total** | **25** | 12 temas distintos | ✅ |

Todos tienen: Lesen T1–T5, Hören T1–T4 con transcript, Schreiben ×3, Sprechen ×3, sin flojos.

---

## 2. Estado del banco de partes (batches/generated/)

Lo que hay ahora para ensamblar **nuevos** exámenes:

| Teil | Archivos | Para 50 exámenes faltan | Prioridad |
|------|----------|------------------------|-----------|
| Lesen T1 | 59 | — ✅ | — |
| Lesen T2 | 16 | 34 | ⚠ Media |
| Lesen T3 | 76 | — ✅ | — |
| Lesen T4 | 8 | 42 | ⚠ Alta |
| Lesen T5 | 6 | 44 | ⚠ Alta |
| Hören T1 | 14 | 36 | ⚠ Media |
| Hören T2 | 7 | 43 | ⚠ Alta |
| Hören T3 | 7 | 43 | ⚠ Alta |
| **Hören T4** | **4** | **46** | 🔴 CRÍTICO |
| Schreiben | 7 | 43 | ⚠ Alta |
| Sprechen | 8 | 42 | ⚠ Alta |

> **Cuello de botella:** Hören T4 (4 archivos) → si ejecutas el paso 3 ahora, solo obtienes **4 exámenes nuevos** adicionales.

---

## 3. Generar partes nuevas (Paso 1)

### Ruta A — Automática con Gemini

```powershell
# Por prioridad (más urgentes primero)

# 🔴 Hören T4 — CRÍTICO
node scripts/generate-part-gemini.mjs --module horen --teil 4

# ⚠ Lesen T4 y T5
node scripts/generate-lesen-part-gemini.mjs --teil 4 --from-bank --skip-quality
node scripts/generate-lesen-part-gemini.mjs --teil 5 --from-bank --skip-quality

# ⚠ Hören T2 y T3
node scripts/generate-part-gemini.mjs --module horen --teil 2
node scripts/generate-part-gemini.mjs --module horen --teil 3

# ⚠ Lesen T2
node scripts/generate-lesen-part-gemini.mjs --teil 2 --from-bank --skip-quality
```

**Generar en lote** (con pausa para respetar el rate limit):

```powershell
$N = 10
1..$N | ForEach-Object {
    Write-Host "Generando $_ de $N..."
    node scripts/generate-part-gemini.mjs --module horen --teil 4
    Start-Sleep -Seconds 5
}
```

### Ruta B — Chat con Claude (Hören T3/T4, Schreiben, Sprechen)

**Paso B1 — Abrir el prompt:**

| Teil | Archivo de prompt |
|------|------------------|
| Hören T3 | `prompts-claude/LOTE-horen-t3.md` (genera 5 a la vez) ⭐ |
| Hören T4 | `prompts-claude/LOTE-horen-t4.md` (genera 5 a la vez) ⭐ |
| Schreiben | `plantillas-schreiben-b1/schreiben-b1.md` (1 unidad) |
| Sprechen | `plantillas-sprechen-b1/sprechen-b1.md` (1 unidad) |

**Paso B2 — Personalizar (opcional):** añade al final del prompt:
```
Temas: [Reisen, Arbeit, Gesundheit]
Vocabulario: [Umzug, Wohnung, Miete]
```

**Paso B3 — Guardar la respuesta** (solo el JSON) en:
```
batches/inbox/todo-horen-teil4.txt
batches/inbox/todo-schreiben.txt
batches/inbox/todo-sprechen.txt
```

**Paso B4 — Importar:**
```powershell
npm run horen:upload:t4
npm run schreiben:upload
npm run sprechen:upload
```
El importador valida automáticamente (esquema + blacklist + auditoría). Si pasa → se guarda en `batches/generated/`.

---

## 4. Reconstruir banco y pool (Pasos 2 y 3)

Después de añadir partes nuevas:

```powershell
# Paso 2: reconstruir el banco de preguntas
node scripts/rebuild-pool-from-generated.mjs

# Paso 3: ensamblar nuevos exámenes completos
node scripts/build-disjoint-pool.mjs --max 60

# Verificar resultado
node scripts/audit-pass-2.mjs library/pool-seed/de_B1.json --fail-on=IMPORTANT --summary-only
```

Tras esto, los nuevos exámenes aparecen en `library/pool-seed/de_B1.json` y la app los sirve automáticamente.

---

## 5. Plan mínimo para pasar de 25 a 35 exámenes

```powershell
# Generar las partes que faltan (prioridad: cuello de botella primero)
1..10 | ForEach-Object { node scripts/generate-part-gemini.mjs --module horen --teil 4; Start-Sleep 5 }
1..5  | ForEach-Object { node scripts/generate-part-gemini.mjs --module horen --teil 3; Start-Sleep 5 }
1..5  | ForEach-Object { node scripts/generate-part-gemini.mjs --module horen --teil 2; Start-Sleep 5 }
1..5  | ForEach-Object { node scripts/generate-lesen-part-gemini.mjs --teil 4 --from-bank; Start-Sleep 5 }
1..5  | ForEach-Object { node scripts/generate-lesen-part-gemini.mjs --teil 5 --from-bank; Start-Sleep 5 }

# Reconstruir
node scripts/rebuild-pool-from-generated.mjs
node scripts/build-disjoint-pool.mjs --max 60
```

---

## 6. Verificar el corpus

```powershell
# Estadísticas por Teil
node scripts/print-corpus-stats.mjs

# Auditoría de partes (debe dar 0 críticos)
node scripts/audit-pass-2.mjs batches/generated --fail-on=IMPORTANT --summary-only

# Distribución temática (evitar >20% en un tema)
node --input-type=module --eval "
import { getTopicStats } from './scripts/lib/topicRotation.mjs';
const s=getTopicStats('batches/generated');
const t=Object.values(s).reduce((a,b)=>a+b,0);
Object.entries(s).sort((a,b)=>b[1]-a[1]).filter(([,n])=>n).forEach(([top,n])=>console.log(top.padEnd(12),n,'('+(Math.round(n/t*100))+'%)'));
"
```

---

## 7. Probar en local

```powershell
netlify dev   # → http://localhost:8888
```

- `/app` → interfaz de exámenes (usa pool-seed → library → banco)
- `/pool-test.html` → prueba directa del pool-seed sin login

---

## 8. Errores frecuentes

| Error | Causa | Solución |
|-------|-------|----------|
| `No se encontró ningún batch JSON` | JSON vacío o inválido | Validar en [jsonlint.com](https://jsonlint.com) |
| `module en JSON ≠ --module` | Plantilla equivocada | Verificar `"module"` en el JSON |
| Umlauts corruptos | Encoding incorrecto | Guardar en UTF-8 sin BOM (VS Code) |
| `Vocabulario C1/C2 encontrado` | Palabra técnica | Sustituir por equivalente B1 |
| `Auditoría IMPORTANT` | CHK pedagógico falla | JSON indica el CHK; ajustar o regenerar |
| App muestra exámenes "nuevos" | Pool agotado → library | Normal, library tiene 12 verificados |
| Pool tiene solo 4 exámenes nuevos | Falta Hören T4 | Generar más Hören T4 (paso 3 de Ruta A) |
