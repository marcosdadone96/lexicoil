# Plantilla — Lesen A2 · Teil 2 (Informationstafel)

Pega TODO en Gemini. Devuelve **SOLO JSON**.

---

Eres examinador Goethe **A2**. Genera **Lesen Teil 2**: 1 plano de edificio (Informationstafel) + 5 MCQ.

## Reglas
- **1 passage** con plano textual (Stockwerke, Räume, Öffnungszeiten)
- **5 preguntas** `multiple_choice` con opciones **a) b) c)** exactamente
- Longitud pasaje: **80–150 palabras**

## PROSA DEL PASAJE (OBLIGATORIO — gate CEFR ingest)

El plano debe leerse como **texto informativo A2 con oraciones completas**, no como listado telegráfico de rótulos.

### ✅ CORRECTO — prosa + estructura por pisos (modelo oficial)
```
Willkommen im Stadtzentrum 'Am Brunnen'! Hier finden Sie alles für Ihren Einkauf und Ihre Freizeit.

Erdgeschoss:
Bäckerei Müller: Frisches Brot und Kuchen.
Café Sonne: Kaffee und kleine Snacks.
Buchhandlung Lesen & Mehr: Neue Bücher und Zeitschriften.

1. Obergeschoss:
Modehaus Elegant: Kleidung für Damen und Herren.
Spielzeugland: Spielsachen für Kinder.
```

### ❌ INCORRECTO — solo rótulos sin oraciones (CEFR rechaza)
```
Erdgeschoss:
Empfang & Informationen
Café "Medienpause" (Mo-Fr: 8:00-18:00 Uhr)

1. Stock:
Stadtbibliothek – Abteilung Medien
Lesesaal
```

**Reglas de redacción del pasaje:**
1. **Apertura obligatoria:** 1–2 oraciones completas («Willkommen im…! Hier finden Sie…»).
2. **Por cada local/ servicio:** formato **«Nombre: oración completa A2.»** (mínimo 4–8 palabras por entrada; verbo o descripción clara).
3. **Encabezados de piso:** `Erdgeschoss:` / `1. Stock:` / `1. Obergeschoss:` — debajo van las entradas en prosa, no solo nombres sueltos.
4. **Cierre opcional:** 1 oración breve («Wir freuen uns auf Ihren Besuch!»).
5. **PALABRAS OBJETIVO:** integra las del tema en las descripciones (sube cobertura CEFR ≥55%).
6. **PROHIBIDO** pasajes de solo etiquetas, horarios entre paréntesis sin frase, o líneas sueltas sin punto final.

## FÓRMULA OFICIAL DE PREGUNTAS (OBLIGATORIO — GATE 4/5)

**En al menos 4 de las 5 preguntas**, el campo `"question"` debe contener **«Stock» o «Etage»** (u Obergeschoss/Erdgeschoss/Stockwerk).

Patrón obligatorio por pregunta:
- Enunciado tipo: **«In welchem Stock…?»** / **«Auf welcher Etage…?»** / **«Wo befindet sich…?»** + **Stock/Etage**
- Contexto breve con persona: «Maria sucht…», «Herr Klein braucht…», «Sie möchten…»
- Opciones SIEMPRE con **3 alternativas de piso distintas** (ver sección mcq_distinct abajo)

**PROHIBIDO** preguntas genéricas sin Stock/Etage en el enunciado: solo «Bis wann…», «Wo ist der Eingang?» sin piso, «Welche Öffnungszeiten…».

### Ejemplo CORRECTO (5/5 cumplen Stock + anderer Stock)
```json
"question": "Lisa braucht einen Termin beim Hausarzt. In welchem Stock ist die Praxis?"
"options": ["a) im 1. Stock", "b) im 3. Stock", "c) in einem anderen Stock"]
```

### Ejemplo INCORRECTO (gate rechaza — solo 2/5 tienen Stock)
- Q1: «Bis wann ist die Apotheke geöffnet?» ← sin Stock/Etage
- Q2: «Wo ist der Haupteingang?» ← sin Stock/Etage
- Solo Q3–Q4 usan «In welchem Stock…» → **RECHAZADO** (mínimo 4/5)

---

## OPCIÓN «ANDERER STOCK» (OBLIGATORIO — GATE 4/5)

**En al menos 4 de las 5 preguntas**, una opción (típicamente **c)**) debe incluir la frase:
- `in einem anderen Stock` · `in einem anderen Stockwerk` · `anderer Stock` · `anderes Stockwerk`

Texto aceptado (case-insensitive): cualquiera de las variantes anteriores.

**PROHIBIDO** las 3 opciones como pisos concretos sin «anderer Stock»:
```
a) im 1. Stock
b) im 2. Stock
c) im 3. Stock   ← RECHAZADO: falta «anderer Stock»
```

**Plantilla fija recomendada** (usa en ≥4 preguntas):
```
a) im {X}. Stock
b) im {Y}. Stock
c) in einem anderen Stock
```
Con X ≠ Y (dos pisos distintos del plano).

---

## OPCIONES MCQ NO SOLAPADAS — mcq_distinct (OBLIGATORIO — GATE CHK-28)

Las **3 opciones de cada pregunta deben ser mutuamente excluyentes**: solo UNA puede ser correcta; las otras dos deben describir **pisos o lugares claramente distintos**, sin parafrasear la misma respuesta.

### ✅ CORRECTO — 3 pisos excluyentes
```
a) im 1. Stock
b) im 3. Stock
c) in einem anderen Stock
```

### ❌ INCORRECTO — duplicado (jaccard=1.00)
```
a) im 2. Stock
b) im 4. Stock
c) im 2. Stock        ← PROHIBIDO: igual que a)
```

### ❌ INCORRECTO — mismo piso con distinta redacción (gate rechaza)
```
a) im Erdgeschoss
b) im 2. Stock
c) Erdgeschoss        ← PROHIBIDO: mismo piso que a), solo sin «im»
```

```
a) im 1. Stock
b) im 1. Stock        ← PROHIBIDO: repetir el mismo piso en dos opciones
c) in einem anderen Stock
```

### Reglas mcq_distinct (aplica en las 5 preguntas)
1. **Formato corto**: preferí `im {N}. Stock` / `im Erdgeschoss` — evitá descripciones largas del tipo «im Stock wo…».
2. **PROHIBIDO repetir el mismo piso en dos opciones** — ni con la misma redacción ni parafraseando (`im 2. Stock` ≠ `2. Stock` / `zweiten Stock` / `im Erdgeschoss` ≠ `Erdgeschoss`).
3. **Tres destinos distintos**: dos pisos concretos **diferentes** del plano + «in einem anderen Stock» como tercera opción (X ≠ Y).
4. Antes de enviar, compará **cada par** (a/b, a/c, b/c): si dos opciones se refieren al **mismo piso** → reescribí una.

### ❌ INCORRECTO — misma idea con otras palabras
```
a) im Stock mit dem Arzt
b) im Stock, wo der Arzt ist   ← PROHIBIDO: parafrasea a)
c) in einem anderen Stock
```

### ❌ INCORRECTO — frases largas que comparten «im Stock wo…»
```
a) im Stock, wo die Bibliothek ist
b) im Stock mit der Bibliothek   ← PROHIBIDO: solapamiento literal
c) in einem anderen Stock
```

---

## PALABRAS OBJETIVO
<<< stock, etage, zimmer, öffnungszeiten, eingang, kurs, arzt, büro, parkhaus >>>

## AUTORREVISIÓN (obligatoria antes de enviar)
- [ ] ¿El pasaje tiene **apertura en prosa** + **cada local como «Nombre: oración completa.»** (no solo rótulos)?
- [ ] ¿**≥4/5** preguntas con «Stock» o «Etage» en el **enunciado** `"question"`?
- [ ] ¿**≥4/5** preguntas con opción «**anderer Stock**» / «in einem anderen Stock»?
- [ ] ¿En **cada** pregunta las 3 opciones son **3 pisos distintos** (PROHIBIDO repetir el mismo piso en a/b/c)?
- [ ] ¿1 passage plano, 5 MCQ a/b/c?
- [ ] ¿level:"A2"? ¿Solo JSON?
