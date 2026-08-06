# Diseño: interacción decap ↔ capitalizeBatchNouns

**Versión analizada:** `germanCapsNormalize v3.0-stable`  
**Gate:** `v6.1-B-G2` — fuera de alcance (no tocar)  
**Fecha:** 2026-07-08  
**Estado:** propuesta — sin implementar

---

## 1. Síntoma confirmado

Pipeline full en `applyGermanCapsNormalize` (sin `decapOnly`):

```
raw → decapitalizeBatchMidSentence → capitalizeBatchNouns → MCQ normalize
```

| Entrada (post-decap) | Tras `capitalizeBatchNouns` | Neto |
|---|---|---|
| `ein wichtiger Schritt` | `ein Wichtiger Schritt` | revertido |
| `das nächste Fest` | `das Nächste Fest` | revertido |
| `Die kleine Emma` | `Die Kleine Emma` | revertido |

Métrica típica: `decapFixed: 2, capFixed: 2, fieldsChanged: 0`.

**Nota pipeline prod:** la generación Lesen usa `decapOnly: true` en pre-audit (ver `GERMAN-CAPS-NORMALIZE.md` L15). El bug afecta al modo **full** y a cualquier caller que encadene decap+cap.

---

## 2. Dónde exactamente se re-capitaliza

### 2.1 Punto de entrada

```117:124:scripts/lib/germanCapsNormalize.mjs
  const { batch: decapped, totalFixed: decapFixed } = decapitalizeBatchMidSentence(batch);
  let current = decapped;
  let capFixed = 0;
  if (!opts.decapOnly) {
    const capped = capitalizeBatchNouns(current);
    current = capped.batch;
    capFixed = capped.totalFixed;
  }
```

### 2.2 Función responsable

`capitalizeNounsInText` solo procesa tokens **en minúscula** (los ya capitalizados se saltan):

```278:296:scripts/lib/capitalizeNouns.mjs
    if (isCapitalizedWord(token)) {
      prevContent += token;
      lastWord = token;
      return token;
    }
    // ...
    if (shouldCapitalizeLowerNoun(token, lastWord, nextWord, atStart)) {
      const capped = capFirst(token);
      count++;
```

La re-capitalización ocurre en **`shouldCapitalizeLowerNoun`**, rama artículo sustantivador:

```231:246:scripts/lib/capitalizeNouns.mjs
function shouldCapitalizeLowerNoun(token, prevWord, nextWord, atClauseStart) {
  const lc = tokenLemma(token);
  if (!lc || isCapitalizedWord(token)) return false;
  // ...
  if (!isCertainNounLemma(lc)) return false;

  const prevLc = tokenLemma(prevWord);
  if (SUBSTANTIVISING_ARTICLES.has(prevLc)) {
    if (nextWordIsCapitalizedNoun(nextWord)) return false;
    return true;  // ← AQUÍ: re-mayuscula wichtiger/nächste/kleine
  }
```

### 2.3 Cadena causal (ejemplo `ein wichtiger Schritt`)

| Paso | Función | Resultado |
|---|---|---|
| 1 | `isCertainNounLemma('wichtiger')` | **true** — `wichtig` ∈ lexicon; `singularCandidates` quita `-er` → `wichtig` |
| 2 | `SUBSTANTIVISING_ARTICLES.has('ein')` | **true** |
| 3 | `nextWordIsCapitalizedNoun('Schritt')` | **false** — `Schritt` ∉ lexicon Kaikki/CEFR |
| 4 | `return true` → `capFirst('wichtiger')` | **Wichtiger** |

Verificación runtime:

```
wichtiger  isKnownGermanNoun=true   (vía wichtig + -er)
Schritt    isKnownGermanNoun=false
→ nextWordIsCapitalizedNoun('Schritt') = false → cap activa
```

Misma lógica para `nächste`+`Fest` y `kleine`+`Emma` (`Fest`, `Emma` fuera de lexicon).

### 2.4 Asimetría decap vs cap

**Decap** (correcto):

```373:374:scripts/lib/capitalizeNouns.mjs
      if (SUBSTANTIVISING_ARTICLES.has(tokenLemma(lastWord)) && ADJ_NEEDS_ARTICLE_GUARD.has(tokenLemma(token))) {
        fix = token.toLowerCase();
```

Usa `ADJ_NEEDS_ARTICLE_GUARD` — no exige que el siguiente token esté en lexicon.

**Cap** (incorrecto en este contexto):

- Usa `isCertainNounLemma` (lexicon + inflexiones + sufijos nominales).
- Protección anti-adj: solo `nextWordIsCapitalizedNoun` (lexicon estricto).
- **No consulta `ADJ_NEEDS_ARTICLE_GUARD`.**

Muchas formas del guard (`wichtig`, `nächste`, `klein`, `letzte`, …) son **también** `isKnownGermanNoun` por inflexión (`singularCandidates` -e/-er/-en) o entrada directa en lexicon.

---

## 3. Qué información pierde la fase decap

La fase decap es **stateless** respecto a cap: solo devuelve texto transformado.

| Información | Disponible en decap | Visible en cap |
|---|---|---|
| Motivo del fix (article+adj / modal / homograph) | sí (interno) | **no** |
| Posición del token corregido | sí | **no** |
| «Siguiente token es sustantivo común» (Schritt, Fest) | sí (`nextWord`) | cap solo si ∈ lexicon |
| «Token está en ADJ_NEEDS_ARTICLE_GUARD» | sí | **no** |
| «No re-capitalizar este span» | **no persistido** | — |

`capitalizeBatchNouns` re-parsea el string desde cero; cualquier decisión contextual de decap se pierde.

### Efecto colateral relacionado

`etwas Wichtiges` → decap → `etwas wichtiges` (guard trata `wichtiges` como adj tras artículo-like contexto insuficiente; `etwas` ∉ `SUBSTANTIVISING_ARTICLES` pero pasa por otra rama). Cap **no** restaura `Wichtiges` (`count: 0`). Doble fallo bidireccional en sustantivación.

---

## 4. Opciones de solución

### A) Marcar tokens corregidos por decap

**Idea:** `decapitalizeMidSentence` devuelve `{ result, count, frozen: [{ start, end, reason }] }`. `capitalizeNounsInText` recibe `frozen` y no toca esos offsets.

| Pros | Contras |
|---|---|
| Precisión quirúrgica | Offsets frágiles si cap reescribe longitudes |
| Trazabilidad / debug | Cambio de API en `decapitalizeBatchMidSentence`, `capitalizeBatchNouns`, `applyGermanCapsNormalize` |
| No depende de lexicon para Schritt | Mantenimiento de mapa posicional por campo |

**Riesgo:** medio — MCQ normalize u otras fases posteriores pueden invalidar offsets.

**Recomendación:** viable como capa interna; exportar solo en pipeline normalize.

---

### B) Pasar contexto adicional entre fases

**Idea:** estructura `DecapContext` por campo de texto:

```typescript
{
  adjAfterArticle: Set<string>  // lemmas lowercased intentionally
  // o: rulesApplied: ['article_adj:3', ...]
}
```

Cap consulta contexto antes de `shouldCapitalizeLowerNoun`.

| Pros | Contras |
|---|---|
| Sin offsets; robusto a re-tokenización | API más compleja |
| Permite reglas distintas por motivo | Hay que propagar contexto por `fixPassageTextFields` / batch walk |
| Testeable unitariamente | Dos fuentes de verdad si context y texto divergen |

**Riesgo:** bajo-medio.

**Recomendación:** buena opción si se prevén más reglas decap específicas.

---

### C) Segunda validación después de capitalize

**Idea:** pipeline `decap → cap → decap_adj_guard_only` (tercer pase que solo re-aplica rama `ADJ_NEEDS_ARTICLE_GUARD`).

| Pros | Contras |
|---|---|
| Mínimo cambio en `shouldCapitalizeLowerNoun` | Parche sintomático; dos pasadas decap |
| Reutiliza lógica existente | No evita trabajo inútil de cap |
| Fácil de probar con casos conocidos | Posible ping-pong si cap y decap3 discrepan en edge cases |
| | `etwas wichtiges` sigue roto (decap2 rompe sustantivación) |

**Riesgo:** medio — oscila entre fases en casos límite.

**Recomendación:** acceptable como hotfix temporal; no como diseño final.

---

### D) Modificar prioridad de reglas en cap (espejo de decap)

**Idea:** al inicio de `shouldCapitalizeLowerNoun`, **antes** de `isCertainNounLemma`:

```javascript
if (SUBSTANTIVISING_ARTICLES.has(prevLc) && ADJ_NEEDS_ARTICLE_GUARD.has(lc)) {
  return false;  // nunca re-capitalizar adj tras artículo
}
```

Opcionalmente ampliar `nextWordIsCapitalizedNoun`:

```javascript
// Si siguiente token capitalizado y NO está en guard → asumir sustantivo común
if (isCapitalizedWord(nextWord) && !ADJ_NEEDS_ARTICLE_GUARD.has(tokenLemma(nextWord))) {
  return true; // en rama artículo: no capitalizar el adj intermedio
}
```

| Pros | Contras |
|---|---|
| Cambio localizado (~5–15 líneas) | `die Kleinen` (S. pl.) no se re-cap si generator puso minúscula |
| Simétrico con decap | Sustantivación `ein Wichtiges` (sin etwas) necesita regla aparte |
| No cambia API | 22 lemmas del guard ya están en lexicon — hay que confiar en el guard |
| Arregla los 3 casos confirmados | Ampliar guard (täglich…) sin este fix seguiría sin efecto en full |

**Riesgo:** bajo para los casos Art+Adj+N comunes; medio para sustantivaciones (`das Gute`, `ein Weniges`).

**Recomendación:** **opción preferida** como fix principal.

---

## 5. Matriz comparativa

| Criterio | A frozen | B context | C decap₂ | D regla cap |
|---|---|---|---|---|
| Complejidad impl. | alta | media | baja | **baja** |
| Arregla 3 casos confirmados | sí | sí | sí | **sí** |
| Arregla `etwas wichtiges` | no* | no* | no | no* |
| Riesgo regresión G2 | bajo | bajo | medio | **bajo**† |
| Cambio API público | sí | sí | no | **no** |
| Alineado con decap-only prod | indirecto | indirecto | sí | **sí** |

\*Requiere regla sustantivador (`etwas|nichts|viel`) separada en decap **y** cap.  
†Con corpus `germanCapsNormalize.corpus.json` + holdout 193.

---

## 6. Propuesta recomendada (fases)

### Fase 1 — D (prioridad reglas cap)

1. En `shouldCapitalizeLowerNoun`: early return `false` si artículo + `ADJ_NEEDS_ARTICLE_GUARD`.
2. Relajar `nextWordIsCapitalizedNoun`: capitalizado + no-en-guard ⇒ suficiente para bloquear cap del adj (sin lexicon).

**Criterio aceptación:**

```
ein wichtiger Schritt  → cap → ein wichtiger Schritt
das nächste Fest       → cap → das nächste Fest
Die kleine Emma        → cap → Die kleine Emma
```

### Fase 2 — Sustantivadores (fuera del guard)

Regla paralela (decap + cap):

- **Decap:** no bajar mayúscula tras `etwas|nichts|viel|wenig|alles`.
- **Cap:** sí subir `etwas wichtiges` → `etwas Wichtiges`.

### Fase 3 — Ampliar guard (täglich, sportlich, breit)

Solo después de Fase 1; si no, ampliar guard no tiene efecto en pipeline full.

### Fase 4 (opcional) — B context

Si aparecen reglas decap más granulares (klein+Emma vs die Kleinen).

---

## 7. Tests de regresión propuestos

Añadir a `germanCapsNormalize.corpus.json` / iter test:

| id | pipeline | input | expect |
|---|---|---|---|
| `pipe-adj-wichtiger` | full | `Es ist ein Wichtiger Schritt.` | `ein wichtiger Schritt` |
| `pipe-adj-naechste` | full | `…das Nächste Fest…` | `das nächste Fest` |
| `pipe-adj-kleine-emma` | full | `Die Kleine Emma…` | `Die kleine Emma` |
| `pipe-subst-etwas` | full | `etwas wichtiges` | `etwas Wichtiges` |
| `pipe-preserve-die-kleinen` | full | `für die Kleinen` | según criterio documentado |
| `pipe-decap-only-unchanged` | decapOnly | G2 corpus 79 findings | sin nuevos |

Validar con:

```powershell
node scripts/lib/__tests__/germanCapsNormalize.iter3.test.mjs
npm run test:german-caps-normalize
node scripts/repair-german-caps-normalize.mjs --dir batches/ready/lesen  # full, no solo decap-only
```

---

## 8. Resumen ejecutivo

| Pregunta | Respuesta |
|---|---|
| ¿Dónde revierte cap? | `shouldCapitalizeLowerNoun` L239-242, rama artículo + `isCertainNounLemma` |
| ¿Por qué? | Adj en lexicon (inflexión); sustantivo siguiente no en lexicon |
| ¿Qué pierde decap? | Motivo, guard match, decisión «no re-cap» |
| ¿Fix mínimo? | **D** — espejar `ADJ_NEEDS_ARTICLE_GUARD` en cap |
| ¿Gate? | No tocar v6.1-B-G2 |

---

JSON de trazas: ver sesión análisis 2026-07-08 (`ADJ-GUARD-RISK-ANALYSIS.json`).
