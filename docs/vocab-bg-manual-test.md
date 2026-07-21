# Prueba manual — generación de fondo (vocab bg)

Guía para operadores que quieren ver la feature funcionando **sin esperar 12h ni acumular 8 palabras**.

## Seguridad

- Solo existe como **script de terminal** (`scripts/test-vocab-bg-manual-trigger.mjs`).
- Requiere `ADMIN_SECRET` en el entorno (mismo secreto que `activate-pro.mjs`).
- **No hay botón ni endpoint público** para usuarios normales en producción.

## Paso 1 — Guardar vocabulario de prueba

1. Entrá a [lexicoil.com](https://lexicoil.com) con tu cuenta.
2. Abrí **Vocabulario** (flashcards).
3. Guardá **2 a 8 palabras nuevas** del banco B1 alemán, por ejemplo:
   - Fitness, Therapie, Urlaub, Umwelt, Aktivität, Alltag
4. Las palabras deben existir en el banco B1 (`library/vocab/de/B1.json`). Palabras inventadas no entran en la cola.

> Si ya tenés vocabulario guardado pero la cola `pending` está vacía (palabras viejas), el script puede usar `--bootstrap-from-deck`.

## Paso 2 — Correr el disparo manual

Desde la carpeta del proyecto, con `.env` configurado:

```bash
node scripts/test-vocab-bg-manual-trigger.mjs --email TU@EMAIL.com
```

Variables necesarias en `.env`:

| Variable | Para qué |
|----------|----------|
| `ADMIN_SECRET` | Puerta de operador (obligatorio) — copiarlo de Netlify → Site settings → Environment variables |
| `GEMINI_API_KEY` | Generación real con Gemini |
| `NETLIFY_SITE_ID` | Leer/escribir datos de producción |
| `NETLIFY_API_TOKEN` | Token de acceso Netlify |

**Windows (antivirus/proxy):** si Gemini falla con error TLS, agregá antes del comando:
`$env:NODE_OPTIONS="--use-system-ca";`

Opciones útiles:

```bash
# Forzar Hören en lugar del módulo alternado
node scripts/test-vocab-bg-manual-trigger.mjs --email TU@EMAIL.com --module horen

# Si no hay palabras pendientes pero sí vocab guardado
node scripts/test-vocab-bg-manual-trigger.mjs --email TU@EMAIL.com --bootstrap-from-deck

# Si quedó un job colgado (mutex)
node scripts/test-vocab-bg-manual-trigger.mjs --email TU@EMAIL.com --force

# Solo ver planificación, sin gastar Gemini
node scripts/test-vocab-bg-manual-trigger.mjs --email TU@EMAIL.com --dry-plan
```

## Paso 3 — Qué mirar en consola

El script imprime cada etapa:

1. **STATE** — palabras pendientes, última generación, cuota lesen/hören
2. **NORMAL_ELIGIBILITY** — qué diría el disparador automático (para comparar)
3. **BYPASS** — confirma que se ignoran 12h y umbral de 8
4. **PLAN** — módulo, Teil, tema, 8 palabras elegidas
5. **GEMINI** — generación (1–5 min)
6. **PUBLISH** — `poolId` si pasó gates POOL-2
7. **COMMIT** — cuota descontada

## Paso 4 — Ver el resultado en la app

1. En LexiCoil: **Examen** → modo **Personalizado**.
2. Elegí **Lesen** o **Hören** (el módulo que generó el script).
3. Usá palabras de tu vocabulario guardado (las del anchor del script).
4. Al armar el examen deberías ver el cartel azul:

   > ✨ Automatisch aus deinem kürzlichen Vokabular generiert · auch im Pool

5. La parte también queda en el pool reutilizable (`library/reusable-seed/de_B1.json` en repo; en producción, Netlify Blobs `reusable-parts`).

## Si falla

| Mensaje | Qué hacer |
|---------|-----------|
| `Falta ADMIN_SECRET` | Pedir el secreto al admin del proyecto |
| `No hay palabras pendientes` | Guardar palabras nuevas o usar `--bootstrap-from-deck` |
| `bgGenPending` | Esperar 30 min o `--force` |
| `POOL-2: N blocking` | Gate de calidad — reintentar; revisar logs |
| `personal_pool_quota_exceeded` | Cuota mensual de pool personal agotada |
