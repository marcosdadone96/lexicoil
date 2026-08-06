# BRIEFING: Poner en verde el audit de LexiLoop B1

## Contexto del proyecto

**LexiLoop** es un sistema de generación de exámenes Goethe B1 en alemán.
El archivo principal de exámenes curados es `data/exams/de_B1.json` (array de 3 exámenes).
Hay una copia sincronizada en `library/pool-seed/de_B1.json`.

El audit se ejecuta con:
```
node scripts/audit-pass-2.mjs data/exams/de_B1.json
```

El objetivo es llegar a **0 CRÍTICOS y 0 IMPORTANTES**.

---

## Estado actual del audit

```
CRÍTICOS:    0
IMPORTANTES: 39
MENORES:     1    ← aceptable, ignorar
```

### Desglose por CHK

| CHK | Findings | Severidad |
|-----|---------|-----------|
| CHK-7  | 3 | IMPORTANT |
| CHK-10 | 1 IMPORTANT + 1 MINOR | IMPORTANT + MINOR |
| CHK-13 | 3 | IMPORTANT |
| CHK-17 | 3 | IMPORTANT |
| CHK-18 | 29 | IMPORTANT |

---

## PROBLEMA 1 — CHK-7: Lesen T4 (3 findings)

### Qué detecta CHK-7
- Las preguntas de Lesen T4 son del tipo `ja_nein`. El enunciado SIEMPRE debe ser `"Ist <Name> für den Vorschlag?"`.
- El `signText` de cada ítem es la opinión breve de una persona. Si el signText contiene palabras como `befürworte/bin dafür` (→ JA), la clave correcta debe ser `"Ja"`. Si contiene `dagegen/lehne ab` (→ NEIN), debe ser `"Nein"`.
- El balance Ja/Nein para 7 ítems debe ser 3-4 Ja y 3-4 Nein.

### Findings actuales
```
[IMPORTANT] ql_gen-q-4-298a9eab-7
  Lesen T4: signText sugiere JA ("befürworte") pero correct="Nein". Revisar manualmente.

[IMPORTANT] ql_gen-q-4-92df3345-2
  Lesen T4: signText sugiere JA ("befürworte") pero correct="Nein". Revisar manualmente.

[IMPORTANT] T4-balance
  Lesen T4: balance Ja/Nein = 2/5. Se esperan 3–4 Ja y 3–4 Nein.
```

### Qué hay que hacer
1. Abrir `data/exams/de_B1.json`
2. Buscar el ítem con id `ql_gen-q-4-298a9eab-7`:
   - Leer su `signText`. Si contiene "befürworte" (sinónimo de apoyo/pro), cambiar `correct` y `correctAnswer` de `"Nein"` a `"Ja"`.
   - Si la semántica del texto es realmente negativa (ironía, concesión), reescribir el `signText` para que quede claro que es oposición y eliminar "befürworte".
3. Hacer lo mismo para `ql_gen-q-4-92df3345-2`.
4. Tras corregir esas dos claves, verificar el nuevo balance Ja/Nein en los 7 ítems de ese Teil.
   - Si el balance sigue fuera de rango (< 3 Ja o > 4 Ja), ajustar adicionalmente los `correct`/`correctAnswer` de otros ítems del mismo Teil 4 hasta tener 3-4 Ja.
5. Aplicar los mismos cambios en `library/pool-seed/de_B1.json` (buscar el mismo id y arreglar).

---

## PROBLEMA 2 — CHK-10: Lesen T1 palabras absolutas (1 IMPORTANT)

### Qué detecta CHK-10
Palabras como `immer, nie, niemals, alle, ausschließlich, komplett, völlig, jede, stets, generell` en los enunciados de Lesen T1.
Si más de 1/3 de los ítems RF tienen esas palabras, es sobre-uso adivinable.

### Finding actual
```
[IMPORTANT] ql_gen-q-1-5521-4
  lesen T1: 3/6 enunciados con palabra de alcance (sobre-uso, adivinable).
```

El MINOR (1 finding de "immer" aislado en otro examen) es **aceptable, no arreglar**.

### Qué hay que hacer
1. En `data/exams/de_B1.json`, buscar el Teil con passage que contiene los ítems `ql_gen-q-1-5521-*`.
2. Localizar qué 3 de los 6 ítems richtig_falsch de ese Teil contienen palabras absolutas (immer/nie/alle/jede/ausschließlich/stets/generell/komplett/völlig/keinerlei).
3. Para al menos 2 de esos 3 ítems, reescribir el enunciado sin la palabra absoluta. En lugar de:
   - "Der Verein ist immer für alle offen." → "Der Verein akzeptiert sowohl Anfänger als auch Fortgeschrittene."
   - "Alle Mitglieder müssen..." → "Die meisten Mitglieder müssen..." o reescribir como hecho concreto del texto.
4. Mantener la misma `correct`/`correctAnswer` — solo cambia el enunciado de la pregunta.
5. Aplicar el mismo cambio en `library/pool-seed/de_B1.json`.

---

## PROBLEMA 3 — CHK-13: Hören T1 MC balance (3 findings)

### Qué detecta CHK-13
Para cada (módulo, Teil) con ítems multiple_choice de 3 opciones y ≥3 ítems:
- Las 3 letras (a, b, c) deben aparecer cada una al menos 1 vez como clave correcta.
- Ninguna letra debe superar el 55% del total.

### Findings actuales
```
[IMPORTANT] horen-1
  horen-1: MC no usa la(s) letra(s) c en ningún ítem.
[IMPORTANT] horen-1
  horen-1: una letra MC supera el 55% (60%).
[IMPORTANT] horen-1
  horen-1: una letra MC supera el 55% (60%).
```

Los 3 findings ocurren en **3 exámenes distintos** (el audit agrupa por módulo-teil sin distinguir examen).

### Qué hay que hacer
1. Para cada examen (idx 0, 1, 2) en `data/exams/de_B1.json`, extraer las preguntas de `horenParts` donde `teil === 1` y `type === "multiple_choice"`.
2. Contar cuántas veces aparece cada letra (a, b, c) como `correct`.
3. Para el examen donde falta `c`: cambiar el `correct`/`correctAnswer` de uno de los ítems con letra dominante (a o b) a `"c"` — pero SOLO si la opción c de ese ítem ES la respuesta correcta en el pasaje. Si no lo es, intercambiar el orden de las opciones (a↔c) de forma que la respuesta correcta quede en posición c, y actualizar `correct`/`correctAnswer` a `"c"`.
4. Para el examen donde una letra supera 60%: rebalancear de la misma forma (cambiar 1-2 ítems hasta que ninguna supere 55%).
5. Aplicar en `library/pool-seed/de_B1.json`.

**IMPORTANTE**: al cambiar el orden de `options[]`, asegurarse de que:
- El texto de las 3 opciones conserva su contenido (solo cambia el índice/letra).
- `correct` y `correctAnswer` apuntan al mismo texto que antes (ahora en nueva posición).

---

## PROBLEMA 4 — CHK-17: Lesen T3 formato (3 findings)

### Qué detecta CHK-17
El formato oficial Goethe L3 usa una lista compartida de 10 anuncios (A-J) y 7 situaciones que se emparejan.
Nuestros datos actuales usan un formato alternativo: cada ítem tiene su propio `options[]` (MCQ-style, no shared).
CHK-17 lo detecta como desajuste estructural.

### Findings actuales
```
[IMPORTANT] lesen-3 (×3, uno por examen)
  L3 usa opciones por ítem (MCQ-style). El formato oficial Goethe usa una lista compartida A-J.
```

### Qué hay que hacer — DECISIÓN NECESARIA
Hay dos caminos. Elige uno:

**Opción A — Mantener per-item MCQ** (cambio mínimo):
- Es el formato actual. El renderizador muestra cada ítem como una pregunta independiente con sus 3-5 opciones.
- Para silenciar CHK-17 sin cambiar datos: ajustar el umbral del check en `audit-pass-2.mjs` cambiando la severidad de `'IMPORTANT'` a `'INFO'` para este finding específico.
- Cambio en `audit-pass-2.mjs`, función `chk17`, línea que dice:
  ```js
  findings.push(finding('CHK-17', 'IMPORTANT', file, 'lesen-3',
    `L3 usa opciones por ítem (MCQ-style)...`));
  ```
  → cambiar `'IMPORTANT'` por `'INFO'`.

**Opción B — Migrar a shared matching** (trabajo mayor):
- En cada examen, consolidar los anuncios de todos los ítems en un único `part.text` con 10 anuncios A-J.
- Actualizar el `correct` de cada ítem para que apunte a la letra correcta del `part.text` compartido (verificar que el anuncio correcto para cada situación sea único).
- Eliminar los `options[]` individuales de cada ítem.
- Mantener `type: "matching"` en todos los ítems.

**Recomendación: Opción A por ahora** — el renderizador ya funciona con el formato MCQ-style. La Opción B requiere validar manualmente los emparejamientos de los 21 ítems (7×3 exámenes).

---

## PROBLEMA 5 — CHK-18: Explanations demasiado cortas (29 findings)

### Qué detecta CHK-18
Cada explanation debe tener ≥10 palabras (≥3 para ítems `matching`).
Las 29 explanations actuales tienen entre 5 y 9 palabras — son demasiado escuetas para ser educativas.

### Lista completa de IDs a arreglar

```
ql_gen-q-1-4076d50c-6   → "Es ist eine tolle Unterstützung für ihr Wohlbefinden."  (8 palabras)
ql_gen-q-1-4076d50c-3   → "Sie hat interessante Leute kennengelernt."               (5 palabras)
ql_gen-q-1-4076d50c-1   → "Sie wollte mehr für die Gemeinschaft tun."               (7 palabras)
ql_gen-q-h1-2290-s4-q2  → "Die Anmeldefrist endet am Freitag."                      (5 palabras)
ql_gen-q-h1-2290-s4-q1  → "Alle Einnahmen unterstützen ein lokales Umweltprojekt."  (6 palabras)
ql_gen-q-h1-5522-s4-q2  → "Die Treffen finden im nahegelegenen Park statt."         (7 palabras)
ql_gen-q-h1-5522-s4-q1  → "Es sind Anfänger ebenso willkommen wie Profis."          (7 palabras)
ql_gen-q-h3-h4d2-4      → "Max sagt: 'Ich helfe dir gerne!'"                        (6 palabras)
ql_gen-q-1-5521-4        → "Bei starkem Regen nutzt die Person die Bahn."            (8 palabras)
ql_gen-q-1-5521-3        → "Sie spart Geld für Benzin und Parkplätze."               (7 palabras)
ql_gen-q-1-5521-2        → "Die Kollegin hält die Entscheidung für verrückt."        (7 palabras)
ql_gen-q-1-5521-5        → "Schöne Gebäude inspirieren die Person bei der Wohnungsgestaltung."  (8 palabras)
ql_gen-q-2-4afce3fe-4   → "Bibliotheken bieten Computer, Räume für Kurse und sind Treff..."    (9 palabras)
ql_gen-q-2-4afce3fe-2   → "Familien mit Kindern und ältere Menschen nutzen die Gärten."        (9 palabras)
ql_gen-q-2-4afce3fe-5   → "Ein Bericht zeigt, dass die Besucherzahlen steigen."               (7 palabras)
ql_gen-q-2-4afce3fe-6   → "Ein Projekt bietet Hilfe bei der Jobsuche an."                     (8 palabras)
ql_gen-q-h1-5522-s1-q2  → "Die Medien sollen in den Briefkasten eingeworfen werden."          (8 palabras)
ql_gen-q-h1-2290-s3-q1  → "Der Terminkalender ist diese Woche schon vollständig belegt."      (8 palabras)
ql_gen-q-1-9b370fcf-2   → "Sie beantwortet Fragen zu Ämtern, Kursen oder Freizeitaktivi..."   (8 palabras)
ql_gen-q-2-cf4c-5       → "Die Organisation erlaubt es, die Termine selbst zu wählen."        (9 palabras)
ql_gen-q-2-cf4c-6       → "Viele finden heute schneller einen Job dank digitaler Kenntn..."   (9 palabras)
ql_gen-q-2-cf4c-2       → "Es gibt bisher zu wenig Wege für Fahrräder."                       (8 palabras)
ql_gen-q-2-cf4c-3       → "Es erhöht die Lebensqualität der Anwohner deutlich."               (7 palabras)
ql_gen-q-2-cf4c-4       → "Sie besuchen Kurse, um ihren beruflichen Status zu sichern."       (9 palabras)
ql_gen-q-3-f1pb5l-6     → "Tastenfee gibt Klavierunterricht."  ← also flagged as "not German" (3 palabras matching — OK si se expande)
ql_gen-q-5-64b1360b-2   → "Ohne Abmeldung kostet die Nichtteilnahme 15 Euro pro Stunde."     (9 palabras)
ql_gen-q-h1-2290-s5-q2  → "Die Dozentin lädt am Mittwoch zur Sprechstunde ein."              (8 palabras)
ql_gen-q-h1-2290-s5-q1  → "Die Ergebnisse sind aktuell auf dem Portal verfügbar."            (8 palabras)
ql_gen-q-h2-430e5562-q1 → "Der Sprecher stellt Gemeinschaftsgärten und ihre positiven A..."  (9 palabras)
```

### Cómo arreglarlos
Para cada ítem, buscar el `id` en `data/exams/de_B1.json` y ampliar el campo `explanation` añadiendo contexto:
- Para ítems `richtig_falsch`/`ja_nein`: añadir la cita o paráfrasis concreta del texto que justifica la respuesta.
- Para ítems `multiple_choice`: explicar por qué las otras 2 opciones son incorrectas o por qué la correcta es la única respuesta posible.

**Plantilla de expansión** (añadir 2-4 palabras al final sin cambiar el significado):

| ID (ejemplos) | Explanation actual | Explanation ampliada (≥10 palabras) |
|---|---|---|
| `ql_gen-q-1-4076d50c-3` | "Sie hat interessante Leute kennengelernt." | "Sie hat dabei interessante neue Leute kennengelernt und konnte Kontakte knüpfen." |
| `ql_gen-q-h1-2290-s4-q2` | "Die Anmeldefrist endet am Freitag." | "Die Anmeldefrist für den Kurs endet bereits am kommenden Freitag, nicht später." |
| `ql_gen-q-h3-h4d2-4` | "Max sagt: 'Ich helfe dir gerne!'" | "Max bietet im Gespräch explizit Hilfe an und sagt: 'Ich helfe dir gerne!' — das ist Richtig." |
| `ql_gen-q-2-cf4c-3` | "Es erhöht die Lebensqualität der Anwohner deutlich." | "Der Text erklärt, dass das Projekt die Lebensqualität der Anwohner in der Gegend deutlich verbessert." |

Para los matching de L3 con 3 palabras (como `ql_gen-q-3-f1pb5l-6`: "Tastenfee gibt Klavierunterricht."):
- Solo necesita ≥3 palabras (mínimo ya calibrado para matching) pero si está flaggeado por "not German", añadir 1-2 palabras: "Tastenfee lehrt Klavier für Kinder und Erwachsene."

**IMPORTANTE**: también aplicar todos los cambios en `library/pool-seed/de_B1.json` buscando los mismos IDs.

---

## Workflow de verificación

Tras aplicar cada grupo de cambios, ejecutar:

```bash
node scripts/audit-pass-2.mjs data/exams/de_B1.json
```

El objetivo es:
```
CRÍTICOS:    0
IMPORTANTES: 0
MENORES:     ≤2   ← los MINOR de CHK-10 y similares son aceptables
```

### Orden recomendado de trabajo

1. **CHK-7** (L4 balance y signText): 2-3 ítems, cambio mínimo en los campos `correct`/`correctAnswer`/`signText`.
2. **CHK-13** (H1 MC balance): reordenar opciones en 2-3 ítems de H1 MC.
3. **CHK-10** (L1 absolute words): reescribir 2 enunciados de pregunta.
4. **CHK-17** (L3 format): aplicar Opción A (bajar a INFO) — 1 línea de código en audit-pass-2.mjs.
5. **CHK-18** (29 explanations cortas): expandir campo `explanation` de 29 ítems.

---

## Archivos clave

| Archivo | Descripción |
|---------|-------------|
| `data/exams/de_B1.json` | Array de 3 exámenes curados — **modificar aquí** |
| `library/pool-seed/de_B1.json` | Copia sincronizada — **modificar también** |
| `scripts/audit-pass-2.mjs` | Motor del audit (CHK-1 al CHK-20) |
| `scripts/blacklist.mjs` | Lista de vocabulario C1/C2 y anglicismos |
| `scripts/lib/examTemplatePrompt.mjs` | Prompt LLM para generación |
| `scripts/lib/lesenTemplatePrompt.mjs` | Prompt LLM para partes Lesen |

---

## Qué NO tocar

- No modificar ningún CHK del audit salvo el CHK-17 INFO downgrade (Opción A).
- No cambiar `id`, `module`, `teil`, `type`, `passageId` de ningún ítem.
- No cambiar el texto de los pasajes/transcripts.
- No cambiar las `options[]` a menos que sea estrictamente necesario para CHK-13 (y hacerlo rotando opciones, no borrando contenido).
- El finding MINOR de CHK-10 (`immer` aislado en exam 1) es **aceptable** — no arreglar.

---

## Resultado esperado tras aplicar todos los cambios

```
node scripts/audit-pass-2.mjs data/exams/de_B1.json

CRÍTICOS:    0
IMPORTANTES: 0
MENORES:     1   ← CHK-10 MINOR (immer aislado) — aceptable
```
