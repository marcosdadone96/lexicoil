# BRIEFING PARA CLAUDE — Audit LexiLoop B1
## Objetivo: 0 CRITICAL · 0 IMPORTANT → cobertura 100%

---

## CONTEXTO DEL SISTEMA

**LexiLoop** genera exámenes Goethe B1 en alemán.
- Archivo principal: `data/exams/de_B1.json` (array de 3 exámenes completos)
- Copia sincronizada: `library/pool-seed/de_B1.json` (mismos IDs — editar también)
- Motor de audit: `scripts/audit-pass-2.mjs` (CHK-1 al CHK-20)

**Cómo verificar que todo está arreglado:**
```bash
node scripts/audit-pass-2.mjs data/exams/de_B1.json
# Resultado esperado:
#   CRÍTICOS:    0
#   IMPORTANTES: 0
#   MENORES:     ≤1   ← el MINOR de CHK-10 (immer aislado) es aceptable
```

**Estado actual:**
```
CRÍTICOS:    0
IMPORTANTES: 39   ← todos deben llegar a 0
MENORES:     1    ← aceptable, no tocar
```

---

## FICHEROS ADJUNTOS EN ESTA CARPETA

| Fichero | Contiene |
|---------|----------|
| `BRIEFING.md` | Este documento — plan maestro |
| `audit-structured.json` | Output completo del audit en JSON (findings + items) |

**Ficheros del proyecto que necesitas editar:**
- `data/exams/de_B1.json` — datos principales (editar aquí)
- `library/pool-seed/de_B1.json` — copia sincronizada (aplicar los mismos cambios)
- `scripts/audit-pass-2.mjs` — solo para CHK-17 (bajar a INFO)

---

## ESTADO ACTUAL DEL AUDIT (39 IMPORTANTES)

```
CHK-7  →  3 findings   Lesen T4: coherencia signText + balance Ja/Nein
CHK-10 →  1 finding    Lesen T1: sobre-uso de palabras absolutas (immer/nie/alle)
CHK-13 →  3 findings   Hören T1: MCQ no usa letra "c" / letra dominante >55%
CHK-17 →  3 findings   Lesen T3: formato per-item (MCQ) vs oficial (shared A-J)
CHK-18 → 29 findings   Explanations demasiado cortas (<10 palabras)
```

---

## PLAN DE ACCIÓN (orden recomendado)

### PASO 0 — Preparación
Abre `data/exams/de_B1.json`. Trabaja siempre sobre ESTE archivo.
Cuando termines todos los cambios, replica exactamente los mismos cambios en `library/pool-seed/de_B1.json` buscando los mismos IDs.

---

### PASO 1 — CHK-17: Lesen T3 formato (3 findings → 0)

**Qué detecta:** L3 usa opciones individuales por ítem (MCQ-style) en lugar de lista compartida A-J (formato oficial Goethe). Esto es una característica del sistema, no un bug real de contenido.

**Solución:** Bajar la severidad de INFO (no bloquea) en el código del audit.

**Fichero a editar:** `scripts/audit-pass-2.mjs`

**Prompt para hacer el cambio:**
```
En el archivo scripts/audit-pass-2.mjs, dentro de la función chk17(),
hay una línea que dice:

  findings.push(finding('CHK-17', 'IMPORTANT', file, 'lesen-3',
    `L3 usa opciones por ítem (MCQ-style)...`));

Cambia 'IMPORTANT' por 'INFO' en esa línea (y solo en esa línea).
No toques nada más en el archivo.
```

**Verificación parcial:**
```bash
node scripts/audit-pass-2.mjs data/exams/de_B1.json --summary-only
# CHK-17 debe desaparecer de IMPORTANTES
```

---

### PASO 2 — CHK-7: Lesen T4 signText + balance (3 findings → 0)

**Qué detecta:**
1. Items `ql_gen-q-4-298a9eab-7` y `ql_gen-q-4-92df3345-2`: su `signText` contiene "befürworte" (indica apoyo → JA) pero `correct = "Nein"` → contradicción.
2. Balance Ja/Nein = 2/5 en uno de los exámenes. Debe ser 3-4 Ja y 3-4 Nein.

**Regla del formato Lesen T4:**
- `signText` = opinión breve de una persona sobre un tema
- Si la opinión es favorable (befürworte, bin dafür, finde gut, unterstütze, bin einverstanden) → `correct = "Ja"`
- Si la opinión es contraria (dagegen, lehne ab, bin skeptisch, bin gegen) → `correct = "Nein"`
- El examen NUNCA tiene negaciones en el `question` field

**Prompt para Claude (análisis + corrección):**
```
Analiza el archivo data/exams/de_B1.json.

Busca todos los ítems de Lesen Teil 4 (lesenParts donde teil=4).
Estos ítems tienen type="ja_nein" y un campo "signText" con la opinión de una persona.

PASO A — Corrige los 2 ítems con signText contradictorio:
1. id: "ql_gen-q-4-298a9eab-7"
   - Lee su signText completo
   - Si contiene "befürworte" u otras palabras de apoyo y la persona SÍ está a favor: cambia correct y correctAnswer a "Ja"
   - Si la persona realmente está en contra a pesar del "befürworte" (ej. ironía o concesión): reescribe el signText para que refleje claramente oposición, eliminando "befürworte"

2. id: "ql_gen-q-4-92df3345-2"
   - Mismo análisis

PASO B — Verifica el balance Ja/Nein en cada examen:
Para cada examen (índices 0, 1, 2), suma cuántos ítems de lesen T4 tienen correct="Ja" y cuántos "Nein".
Si hay menos de 3 Ja o menos de 3 Nein en un examen de 7 ítems: ajusta 1-2 ítems para llegar a 3-4 Ja / 3-4 Nein.
Al cambiar correct, también cambia correctAnswer al mismo valor.

Muestra todos los cambios antes de aplicarlos.
```

---

### PASO 3 — CHK-13: Hören T1 MCQ balance (3 findings → 0)

**Qué detecta:**
- En algunos exámenes, los 5 MCQ de Hören T1 no usan la letra "c" en ningún ítem
- O una letra (a/b) representa >55% de las respuestas correctas

**Regla:** Para ítems `multiple_choice` con 3 opciones (a, b, c), cada letra debe aparecer al menos 1 vez y ninguna puede superar el 55% del grupo.

**Cómo identificar los MCQ de H1:**
```json
horenParts → teil=1 → segments[] → questions[] donde type="multiple_choice"
```
Hay 5 segmentos, cada uno con 1 MCQ → 5 MCQ por examen.

**Prompt para Claude:**
```
Analiza data/exams/de_B1.json.

Para cada examen (índice 0, 1, 2):
1. Busca en horenParts → teil=1 → segments → questions donde type="multiple_choice"
2. Lista todos los valores de correct de esos MCQ (son "a", "b" o "c")
3. Calcula la distribución: cuántas veces aparece cada letra
4. Si alguna letra NO aparece → hay un problema
5. Si alguna letra aparece en >55% de los ítems → hay un problema

Para CORREGIR sin cambiar el contenido semántico:
- Cuando necesites cambiar "correct":"a" → "correct":"c": 
  intercambia en options[] la posición de las opciones a y c
  (la opción correcta ahora queda en posición c)
  actualiza correct y correctAnswer a "c"
- NUNCA cambies el texto de las opciones — solo su orden dentro de options[]

Muestra el plan completo con qué cambios hacer en qué ítem antes de ejecutar.
```

---

### PASO 4 — CHK-10: Lesen T1 palabras absolutas (1 finding → 0)

**Qué detecta:** Un examen tiene 3/6 ítems richtig_falsch con palabras absolutas (immer, nie, alle, jede, ausschließlich, stets, komplett, völlig, generell, keinerlei). Cuando >1/3 tiene palabras absolutas, el examen es "adivinable" porque el alumno puede usar esas palabras para predecir la respuesta.

**El finding afecta a:** ítems del grupo `ql_gen-q-1-5521-*` (Lesen T1, examen 2)

**Regla:** Máximo 1/6 ítems puede tener palabra absoluta. Reescribir 2 de los 3 ítems problemáticos.

**Prompt para Claude:**
```
Analiza data/exams/de_B1.json.

Busca el grupo de preguntas con IDs que empiezan por "ql_gen-q-1-5521-" 
(son 6 ítems de Lesen T1 en uno de los exámenes).

1. Lista los 6 enunciados (campo "question") e identifica cuáles contienen:
   immer, nie, niemals, alle, alles, jede, jeder, ausschließlich, stets, generell, 
   komplett, völlig, keinerlei, täglich, jeden Tag, jede Woche, ohne Ausnahme

2. Si hay 3 o más ítems con esas palabras: reescribe 2 de ellos eliminando la palabra absoluta.
   - Mantén el mismo significado y la misma correct/correctAnswer
   - Sustituye la generalización por un hecho concreto del texto
   - Ejemplo: "Der Verein ist immer für alle offen" → "Der Verein nimmt auch Anfänger ohne Vorkenntnisse auf"
   - Ejemplo: "Alle Mitglieder müssen..." → "Die meisten Mitglieder müssen..."

Muestra los enunciados originales y los reescritos para aprobación.
```

---

### PASO 5 — CHK-18: Explanations cortas (29 findings → 0)

**Qué detecta:** 29 ítems tienen explanations con <10 palabras (o <3 para matching). Una explanation debe explicar el razonamiento, no solo confirmar la respuesta.

**Regla de expansión:**
- Para ítems `richtig_falsch` / `ja_nein` / `multiple_choice`: mínimo 10 palabras
  - Añadir: cita o paráfrasis del texto que justifica la respuesta
  - Para RICHTIG: "Der Text sagt, dass..." / "Im Text steht..."
  - Para FALSCH: "Im Text steht, dass... (nicht ...)" / "Der Text erwähnt nur..."
- Para ítems `matching` (L3): mínimo 3 palabras (ya casi todos OK)

**Lista completa de los 29 ítems a expandir** (ID → texto actual → pauta de expansión):

#### Grupo A — Lesen T1 (richtig_falsch)

| ID | Explanation actual | Expansión mínima requerida |
|----|--------------------|---------------------------|
| `ql_gen-q-1-4076d50c-6` | "Es ist eine tolle Unterstützung für ihr Wohlbefinden." (8w) | Añadir: por qué el texto lo indica / qué dice exactamente |
| `ql_gen-q-1-4076d50c-3` | "Sie hat interessante Leute kennengelernt." (5w) | "Im Text wird erwähnt, dass sie durch die Aktivität interessante neue Menschen traf und Kontakte knüpfen konnte." |
| `ql_gen-q-1-4076d50c-1` | "Sie wollte mehr für die Gemeinschaft tun." (7w) | Añadir motivación del texto: "Der Text erklärt, dass sie sich stärker in der Gemeinschaft engagieren wollte." |
| `ql_gen-q-1-5521-4` | "Bei starkem Regen nutzt die Person die Bahn." (8w) | "Der Text beschreibt, dass die Person nur bei schlechtem Wetter auf öffentliche Verkehrsmittel umsteigt." |
| `ql_gen-q-1-5521-3` | "Sie spart Geld für Benzin und Parkplätze." (7w) | "Im Text steht, dass das Fahrrad ihr hilft, Kosten für Benzin und teure Parkplätze in der Stadt zu sparen." |
| `ql_gen-q-1-5521-2` | "Die Kollegin hält die Entscheidung für verrückt." (7w) | "Laut Text reagiert die Kollegin skeptisch und hält die Entscheidung, mit dem Fahrrad zu kommen, für übertrieben." |
| `ql_gen-q-1-5521-5` | "Schöne Gebäude inspirieren die Person bei der Wohnungsgestaltung." (8w) | "Der Text erwähnt, dass architektonisch interessante Gebäude entlang der Route die Person bei der eigenen Einrichtung inspirieren." |
| `ql_gen-q-1-9b370fcf-2` | "Sie beantwortet Fragen zu Ämtern, Kursen oder Freizeitaktivitäten." (8w) | "Im Text wird erklärt, dass die Person Neuankömmlinge gezielt bei Behördengängen, Kursangeboten und Freizeitoptionen berät." |

#### Grupo B — Hören T1 (richtig_falsch / multiple_choice)

| ID | Explanation actual | Expansión |
|----|--------------------|-----------|
| `ql_gen-q-h1-2290-s4-q2` | "Die Anmeldefrist endet am Freitag." (5w) | "Im Gespräch wird deutlich gesagt, dass die Frist für die Kursanmeldung bereits am Freitag abläuft und nicht verlängert wird." |
| `ql_gen-q-h1-2290-s4-q1` | "Alle Einnahmen unterstützen ein lokales Umweltprojekt." (6w) | "Der Text erklärt, dass sämtliche Einnahmen aus der Veranstaltung direkt einem lokalen Umweltschutzprojekt zugutekommen." |
| `ql_gen-q-h1-2290-s3-q1` | "Der Terminkalender ist diese Woche schon vollständig belegt." (8w) | "Laut Aufnahme teilt die Person mit, dass ihr Kalender für diese Woche bereits vollständig ausgebucht ist und kein neuer Termin möglich ist." |
| `ql_gen-q-h1-2290-s5-q2` | "Die Dozentin lädt am Mittwoch zur Sprechstunde ein." (8w) | "Die Aufnahme macht klar, dass die Sprechstunde der Dozentin ausschließlich mittwochs stattfindet und man dafür keinen Termin braucht." |
| `ql_gen-q-h1-2290-s5-q1` | "Die Ergebnisse sind aktuell auf dem Portal verfügbar." (8w) | "Im Text wird bestätigt, dass die aktuellen Prüfungsergebnisse bereits im Online-Portal eingesehen werden können." |
| `ql_gen-q-h1-5522-s4-q2` | "Die Treffen finden im nahegelegenen Park statt." (7w) | "Laut Aufnahme werden die Treffen des Vereins regelmäßig im nahegelegenen Park abgehalten, nicht in geschlossenen Räumen." |
| `ql_gen-q-h1-5522-s4-q1` | "Es sind Anfänger ebenso willkommen wie Profis." (7w) | "Der Text betont ausdrücklich, dass der Kurs für alle offen ist und keine Vorkenntnisse vorausgesetzt werden." |
| `ql_gen-q-h1-5522-s1-q2` | "Die Medien sollen in den Briefkasten eingeworfen werden." (8w) | "In der Aufnahme wird erklärt, dass Zeitschriften und andere Medien ausschließlich in den Briefkasten einzuwerfen sind und nicht persönlich abzugeben." |

#### Grupo C — Hören T2/T3 (multiple_choice / richtig_falsch)

| ID | Explanation actual | Expansión |
|----|--------------------|-----------|
| `ql_gen-q-h3-h4d2-4` | "Max sagt: 'Ich helfe dir gerne!'" (6w) | "Im Gespräch bietet Max explizit seine Hilfe an, indem er wörtlich sagt 'Ich helfe dir gerne!' — das macht diese Aussage eindeutig richtig." |
| `ql_gen-q-h2-430e5562-q1` | "Der Sprecher stellt Gemeinschaftsgärten und ihre positiven Aspekte vor." (9w) | "Der Monolog beginnt mit einer Einführung in das Thema Gemeinschaftsgärten und erklärt, warum sie für viele Menschen einen Mehrwert bieten." |

#### Grupo D — Lesen T2 (multiple_choice)

| ID | Explanation actual | Expansión |
|----|--------------------|-----------|
| `ql_gen-q-2-4afce3fe-4` | "Bibliotheken bieten Computer, Räume für Kurse und sind Trefforte." (9w) | "Der Text nennt Bibliotheken explizit als Orte, die nicht nur Bücher anbieten, sondern auch Computer, Kursräume und soziale Begegnungsmöglichkeiten." |
| `ql_gen-q-2-4afce3fe-2` | "Familien mit Kindern und ältere Menschen nutzen die Gärten." (9w) | "Laut Text sind Gemeinschaftsgärten besonders bei Familien mit kleinen Kindern und Senioren beliebt, die dort regelmäßig Zeit verbringen." |
| `ql_gen-q-2-4afce3fe-5` | "Ein Bericht zeigt, dass die Besucherzahlen steigen." (7w) | "Der Text bezieht sich auf einen aktuellen Bericht, der belegt, dass die Zahl der Bibliotheksbesuche in den letzten Jahren kontinuierlich gestiegen ist." |
| `ql_gen-q-2-4afce3fe-6` | "Ein Projekt bietet Hilfe bei der Jobsuche an." (8w) | "Im Text wird ein konkretes Projekt beschrieben, das arbeitssuchende Menschen dabei unterstützt, einen geeigneten Arbeitsplatz zu finden." |
| `ql_gen-q-2-cf4c-5` | "Die Organisation erlaubt es, die Termine selbst zu wählen." (9w) | "Laut Text ist ein zentrales Merkmal der Organisation die Flexibilität: Mitglieder können ihre Einsätze nach eigenem Zeitplan einplanen." |
| `ql_gen-q-2-cf4c-6` | "Viele finden heute schneller einen Job dank digitaler Kenntnisse." (9w) | "Der Text erklärt, dass digitale Kompetenzen in der modernen Arbeitswelt entscheidend sind und den Einstieg in den Beruf deutlich erleichtern." |
| `ql_gen-q-2-cf4c-2` | "Es gibt bisher zu wenig Wege für Fahrräder." (8w) | "Im Text wird kritisiert, dass das Fahrradwegnetz in der Stadt immer noch unzureichend ausgebaut ist und viele Strecken fehlen." |
| `ql_gen-q-2-cf4c-3` | "Es erhöht die Lebensqualität der Anwohner deutlich." (7w) | "Der Text beschreibt, dass das Projekt direkte positive Auswirkungen auf den Alltag der Anwohner hat und ihre Lebensqualität messbar verbessert." |
| `ql_gen-q-2-cf4c-4` | "Sie besuchen Kurse, um ihren beruflichen Status zu sichern." (9w) | "Laut Text nehmen viele Teilnehmer an Weiterbildungen teil, um ihre berufliche Position zu festigen und nicht den Anschluss zu verlieren." |

#### Grupo E — Lesen T5 (multiple_choice)

| ID | Explanation actual | Expansión |
|----|--------------------|-----------|
| `ql_gen-q-5-64b1360b-2` | "Ohne Abmeldung kostet die Nichtteilnahme 15 Euro pro Stunde." (9w) | "Der Text enthält eine klare Regelung: Wer nicht erscheint, ohne sich vorher abzumelden, muss 15 Euro pro verpasste Stunde bezahlen." |

#### Grupo F — Lesen T3 matching (solo si <3 palabras)

| ID | Explanation actual | Acción |
|----|--------------------|--------|
| `ql_gen-q-3-f1pb5l-6` | "Tastenfee gibt Klavierunterricht." (3w) | Expandir: "Tastenfee bietet Klavierstunden für Kinder und Erwachsene an und ist damit die passende Anzeige." |

**Prompt para Claude (ejecutar todos los cambios del Grupo A-F):**
```
En el archivo data/exams/de_B1.json, busca cada ID de la lista de abajo 
y actualiza su campo "explanation" con el texto expandido indicado.
NO cambies ningún otro campo del ítem.
Después de hacer todos los cambios, ejecuta:
  node scripts/audit-pass-2.mjs data/exams/de_B1.json --summary-only
y confirma que CHK-18 ya no aparece en IMPORTANTES.

Lista de cambios (ID → nueva explanation):

[Pegar la tabla de los 29 ítems con sus explanations expandidas]
```

---

## VERIFICACIÓN FINAL

Después de todos los pasos, ejecuta:

```bash
node scripts/audit-pass-2.mjs data/exams/de_B1.json
```

**Resultado esperado:**
```
CRÍTICOS:    0
IMPORTANTES: 0
MENORES:     1   ← CHK-10 MINOR (immer aislado en examen 1) — aceptable
```

Luego, replica los mismos cambios en `library/pool-seed/de_B1.json`:
- Para cada ID modificado, búscalo en `library/pool-seed/de_B1.json` y aplica el mismo cambio.
- Ejecuta el mismo audit sobre ese archivo para confirmar.

---

## NOTAS IMPORTANTES

1. **NO cambies** `id`, `module`, `teil`, `type`, `passageId`, `question`, ni el texto de los pasajes.
2. **Para CHK-13**: al reordenar opciones, mantén el texto de cada opción — solo cambia el orden en el array `options[]` y actualiza `correct`/`correctAnswer`.
3. **El MINOR de CHK-10** (1 ítem con "immer" aislado en examen 1) es **aceptable** — no arreglar.
4. **CHK-9** (Beispiel ausente) es INFO, no IMPORTANT — ignorar.
5. Tras cada PASO, verifica con `--summary-only` para confirmar progreso.

---

## RESUMEN DE PROMPTS (orden de ejecución para Claude)

```
PROMPT 1 (CHK-17): Cambia 'IMPORTANT' por 'INFO' en chk17() de audit-pass-2.mjs
PROMPT 2 (CHK-7):  Analiza signTexts L4, corrige claves contradictorias + balance
PROMPT 3 (CHK-13): Rebalancea MCQ Hören T1 rotando options[] 
PROMPT 4 (CHK-10): Reescribe 2 enunciados L1 sin palabras absolutas
PROMPT 5 (CHK-18): Expande 29 explanations a ≥10 palabras (usa la tabla de arriba)
```

Después de PROMPT 5: replica todos los cambios en `library/pool-seed/de_B1.json`.
