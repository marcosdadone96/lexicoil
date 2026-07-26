# Plantillas de prompt reutilizables — LexiCoil / Goethe B1 + A2

Pega **TODO** el bloque del Teil elegido en Claude, ChatGPT, Gemini u otra IA.

### Flujo por módulo

| Módulo | Antes de generar | Vocabulario en prompt |
|--------|------------------|------------------------|
| **Lesen / Hören** | `generate-cli --status` + `vocab-coverage-report.mjs` | **Sí — crítico** (matching Personalizado Track A) |
| **Schreiben / Sprechen** | **Prompt autónomo** (rotación embebida abajo) | **No — opcional / decorativo** (solo tema importa) |

**Lesen/Hören** — consulta tema y lemas flojos:

```powershell
node scripts/generate-cli.mjs --cell lesen-t1 --status    # o horen-t1…
node scripts/vocab-coverage-report.mjs --lang de --level B1
```

Sustituye `TEMA:` y `VOCABULARIO A INTEGRAR:` en cada prompt Lesen/Hören.

**Schreiben/Sprechen** — usa los prompts autónomos de § B1/A2 Schreiben/Sprechen (sin `vocab-coverage-report`).

Validación posterior:

```powershell
# Lesen/Hören (1 Teil por archivo):
node scripts/paste-lesen-inbox.mjs --module lesen --teil N --file batches/inbox/mi-parte.json --continue --publish --allow-bank-dup

# Schreiben/Sprechen:
node scripts/paste-exam-inbox.mjs --module schreiben --level B1 --file batches/inbox/mi-batch.json --continue --publish --allow-bank-dup
```

---

## BLOQUE COMÚN (incluir mentalmente en TODOS los prompts)

```
REGLAS GENERALES OBLIGATORIAS (LexiCoil — rechazo automático si fallan):

1. IDIOMA: TODO el JSON (passages, questions, options, explanation) 100% en ALEMÁN.
   PROHIBIDO español/inglés en el contenido del examen. lang:"de", level:"B1" o "A2".

2. SALIDA: SOLO JSON válido { "passages": [...], "questions": [...] } — sin markdown, sin ```.

3. CAMPOS: correct === correctAnswer en cada question. explanation en alemán, nunca vacía.
   IDs únicos (no reuses los del ejemplo). teil como NÚMERO, no string.

4. MAYÚSCULAS ALEMANAS: sustantivos y nombres propios en MAYÚSCULA; adjetivos/adverbios/verbos en minúscula a mitad de frase.

5. VOCABULARIO CEFR:
   - B1: evita términos B2+ en consignas y explanations (CHK-6 rechaza: Aspekte, Klarheit, Manifestation, kontextualisieren…).
     Usa: Punkt/Teil, deutlich/verständlich, Vorteil/Nachteil.
   - A2: evita Präsentation, Feedback, Workshop, Konferenz — usa Kurs/Seminar/Werkstatt.

6. ANTI-ANGLICISMOS: gardening→Gartenarbeit, jogging→Joggen, hiking→Wandern, Workshop→Kurs/Seminar.

7. NOMBRES: apellidos y nombres de pila VARIADOS; no repitas los del banco (Anna+Ben, Lena+Markus, Dana+Florian…).

8. TEMA: el contenido debe ser coherente con TEMA en TODO el texto (no solo en topicTags).

9. VOCABULARIO A INTEGRAR: integra lemas solo si suenan naturales; omite los que no encajen. Nunca marques palabras con **negrita** en consignas.

10. AUTORREVISIÓN antes de enviar: cuenta palabras donde aplique; verifica gates del Teil (longitud MCQ, word-matching, etc.).
```

---

## Índice — 28 Teile oficiales Goethe

| # | Nivel | Módulo | Teil | Archivo detallado existente |
|---|-------|--------|------|----------------------------|
| 1 | B1 | Lesen | 1 | `plantillas-lesen-b1/lesen-teil1.md` |
| 2 | B1 | Lesen | 2 | `plantillas-lesen-b1/lesen-teil2.md` |
| 3 | B1 | Lesen | 3 | `plantillas-lesen-b1/lesen-teil3.md` |
| 4 | B1 | Lesen | 4 | `plantillas-lesen-b1/lesen-teil4.md` |
| 5 | B1 | Lesen | 5 | `plantillas-lesen-b1/lesen-teil5.md` |
| 6 | B1 | Hören | 1 | `plantillas-horen-b1/horen-teil1.md` |
| 7 | B1 | Hören | 2 | `plantillas-horen-b1/horen-teil2.md` |
| 8 | B1 | Hören | 3 | `plantillas-horen-b1/horen-teil3.md` |
| 9 | B1 | Hören | 4 | `plantillas-horen-b1/horen-teil4.md` |
| 10 | B1 | Schreiben | 1–3 | `plantillas-schreiben-b1/schreiben-b1.md` |
| 11 | B1 | Sprechen | 1–3 | `plantillas-sprechen-b1/sprechen-b1.md` |
| 12 | A2 | Lesen | 1 | *(ver prompt abajo)* |
| 13 | A2 | Lesen | 2 | `plantillas-lesen-a2/lesen-teil2.md` |
| 14 | A2 | Lesen | 3 | *(ver prompt abajo)* |
| 15 | A2 | Lesen | 4 | `plantillas-lesen-a2/lesen-teil4.md` |
| 16 | A2 | Hören | 1–4 | `plantillas-horen-a2/horen-teilN.md` |
| 17 | A2 | Schreiben | 1–2 | `plantillas-schreiben-a2/schreiben-teilN.md` |
| 18 | A2 | Sprechen | 1–3 | `plantillas-sprechen-a2/sprechen-teilN.md` |

---

## B1 — LESEN

### Lesen B1 · Teil 1 (blog_richtig_falsch)

```
[INCLUIR BLOQUE COMÚN]

Eres examinador Goethe B1. Genera UNA parte Lesen Teil 1.

TEMA: <<< CONSULTAR generate-cli --cell lesen-t1 --status >>>
VOCABULARIO A INTEGRAR: <<< 8–12 lemas de vocab-coverage-report.mjs >>>

FORMATO JSON:
- 1 passage (blog/e-mail, 1ª persona ich), 165–200 palabras (mín. 150).
- 6 questions type "richtig_falsch", options [], correct "Richtig"/"Falsch".
- passageId en cada question. module:"lesen", teil:1, lang:"de", level:"B1".

REGLAS Teil 1:
- ≥2 Richtig y ≥2 Falsch. Falsch = contradicción de contenido, no truco de palabra.
- Anti word-matching: máx. 2 palabras de contenido (≥4 letras) iguales pasaje↔afirmación.
- Pronombres coherentes: solo sie/ihre O er/seine en todas las afirmaciones.
- Sin tono moralizante («Abschließend lässt sich sagen», «Experten raten»).
- explanation en alemán (≥10 palabras).

⚠️ GATES DELICADOS: word-matching (causa #1 de rechazo manual). Revisa las 6 afirmaciones contra el pasaje palabra por palabra.

IDs: gen-l1-XXXX / gen-q-1-XXXX-N
Devuelve SOLO JSON.
```

### Lesen B1 · Teil 2 (press_mcq, 2 textos)

```
[INCLUIR BLOQUE COMÚN]

Eres examinador Goethe B1. Genera UNA parte Lesen Teil 2.

TEMA: <<< generate-cli --cell lesen-t2 --status >>>
VOCABULARIO A INTEGRAR: <<< 5–8 lemas >>>

FORMATO JSON:
- 2 passages (prensa), 165–200 palabras CADA UNO.
- 6 questions multiple_choice, 3 por passageId, options a)/b)/c), correct = letra.
- module:"lesen", teil:2.

REGLAS Teil 2:
- Anti word-matching en pregunta Y opción correcta (≤2 palabras compartidas con pasaje).
- Opción correcta NO 4+ palabras seguidas del pasaje.
- Distribución claves: máx. 2× misma letra en 6 preguntas (ideal 2a/2b/2c).
- ⚠️ SESGO LONGITUD MCQ: las 3 opciones deben tener longitud comparable (~±30% chars).
  La correcta NO puede ser la más larga sistemáticamente.
- Ambos textos sobre TEMA. Sin tono moralizante ni «Ein Bericht zeigt» repetido.

Devuelve SOLO JSON.
```

### Lesen B1 · Teil 3 (matching anuncios)

```
[INCLUIR BLOQUE COMÚN]

Eres examinador Goethe B1. Genera UNA parte Lesen Teil 3.

TEMA: <<< generate-cli --cell lesen-t3 --status >>>
VOCABULARIO A INTEGRAR: <<< 6–10 lemas >>>

FORMATO JSON:
- 10 passages (anuncios a–j), 20–60 palabras cada uno, id con letra.
- 7 questions type "matching", correct = letra a–j o "0" si no hay anuncio.
- 1 situación ejemplo (no cuenta). module:"lesen", teil:3.

REGLAS Teil 3:
- Exactamente 1 anuncio sobra (no encaja en ninguna situación).
- Situaciones concretas sobre TEMA; anuncios plausibles pero no obvios.
- ⚠️ DUPLICADO DE MOLDE: varía estructura de anuncios (no 10 veces el mismo patrón).
- correct "0" permitido cuando ningún anuncio encaja.

Devuelve SOLO JSON.
```

### Lesen B1 · Teil 4 (forum ja_nein)

```
[INCLUIR BLOQUE COMÚN]

Eres examinador Goethe B1. Genera UNA parte Lesen Teil 4.

TEMA: <<< generate-cli --cell lesen-t4 --status >>>
VOCABULARIO A INTEGRAR: <<< 6–10 lemas >>>

FORMATO JSON:
- 7 passages (opiniones de foro, 60–90 palabras), cada uno 1ª persona.
- 7 questions type "ja_nein", correct "Ja"/"Nein", options [].
- module:"lesen", teil:4.

REGLAS Teil 4:
- Tema de debate único coherente en las 7 opiniones.
- Mezcla Ja/Nein (~3–4 de cada).
- ⚠️ ALINEACIÓN TEMA: cada opinión debe referirse al mismo tema del foro, no tangentes genéricas.
- Sin estereotipo «Immer mehr Menschen sagen…» en todas.

Devuelve SOLO JSON.
```

### Lesen B1 · Teil 5 (rules_mcq)

```
[INCLUIR BLOQUE COMÚN]

Eres examinador Goethe B1. Genera UNA parte Lesen Teil 5.

TEMA: <<< generate-cli --cell lesen-t5 --status >>>
VOCABULARIO A INTEGRAR: <<< 5–8 lemas >>>

FORMATO JSON:
- 1 passage (Hausordnung/Anweisungen), 180–250 palabras.
- 4 questions multiple_choice a/b/c. module:"lesen", teil:5.

REGLAS Teil 5:
- Preguntas situacionales sobre reglas concretas del texto.
- ⚠️ SESGO LONGITUD + SESGO POSICIÓN: opciones equilibradas; varía letra correcta.
- Anti word-matching en opción correcta.

Devuelve SOLO JSON.
```

---

## B1 — HÖREN

### Hören B1 · Teil 1 (5 segmentos × RF + MCQ)

```
[INCLUIR BLOQUE COMÚN]

Eres examinador Goethe B1. Genera UNA parte Hören Teil 1.

TEMA: <<< generate-cli --cell horen-t1 --status >>>
VOCABULARIO A INTEGRAR: <<< 6–10 lemas (oral/natural) >>>

FORMATO JSON:
- 5 passages s1–s5 (MONÓLOGO hablado, 50–85 palabras c/u), module:"horen".
- 10 questions: por segmento 1× richtig_falsch + 1× multiple_choice a/b/c.
- segmentLabel "Aufnahme 1"…"Aufnahme 5". passageId obligatorio.

REGLAS Teil 1:
- SOLO monólogo (PROHIBIDO diálogo Name:/Name:).
- RF y MCQ del mismo segmento = DATOS DISTINTOS (no parafraseo del mismo dato).
- ⚠️ SESGO LONGITUD MCQ: opciones a/b/c longitud comparable.
- ⚠️ ANTI-COPIA: preguntas NO copian ≥4 palabras seguidas del transcript.
- Varía correct MCQ entre a/b/c. Varía nombres Herr/Frau + apellido entre segmentos.
- explanation MCQ: NO digas "Option a/b/c es correcta" — explica el contenido.

Devuelve SOLO JSON.
```

### Hören B1 · Teil 2 (monólogo + 5 MCQ)

```
[INCLUIR BLOQUE COMÚN]

Eres examinador Goethe B1. Genera UNA parte Hören Teil 2.

TEMA: <<< generate-cli --cell horen-t2 --status >>>
VOCABULARIO A INTEGRAR: <<< 6–10 lemas >>>

FORMATO JSON:
- 1 passage monólogo/Vortrag, 240–300 palabras, lenguaje hablado.
- 5 questions multiple_choice a/b/c. module:"horen", teil:2.

REGLAS Teil 2:
- ⚠️ ANTI-COPIA MCQ: pregunta parafraseada; opción correcta NO copia frase del audio.
- ⚠️ SESGO LONGITUD: las 3 opciones ~misma longitud; correcta NO siempre la más detallada.
- Distractores temáticamente plausibles (no obviamente absurdos).
- Prohibido apertura «Guten Tag, liebe Zuhörerinnen und Zuhörer».

Devuelve SOLO JSON.
```

### Hören B1 · Teil 3 (diálogo + 7 RF)

```
[INCLUIR BLOQUE COMÚN]

Eres examinador Goethe B1. Genera UNA parte Hören Teil 3.

TEMA: <<< generate-cli --cell horen-t3 --status >>>
VOCABULARIO A INTEGRAR: <<< 6–10 lemas >>>

FORMATO JSON:
- 1 passage diálogo informal, 270–330 palabras, 2 hablantes «Vorname: …» alternando.
- 7 questions richtig_falsch. module:"horen", teil:3.

REGLAS Teil 3:
- Nombres reales variados (no Person A/B, no Anna+Ben).
- Mezcla Richtig/Falsch; ≥2 inferencia/paráfrasis.
- Evitar apertura estereotipo «Hallo/Hey [Name], wie geht's am Wochenende».
- ⚠️ RF: afirmaciones parafraseadas, no copian frases del diálogo.

Devuelve SOLO JSON.
```

### Hören B1 · Teil 4 (debate + 8 matching M/A/B)

```
[INCLUIR BLOQUE COMÚN]

Eres examinador Goethe B1. Genera UNA parte Hören Teil 4.

TEMA: <<< generate-cli --cell horen-t4 --status >>>
VOCABULARIO A INTEGRAR: <<< 6–10 lemas >>>

FORMATO JSON:
- 1 passage debate, 320–400 palabras, Moderator + 2 Gäste.
- 8 questions matching, options IDÉNTICAS en las 8:
  ["M) Moderator","A) Name1","B) Name2"]
- correct ∈ {M,A,B}; reparte M/A/B (no todo A). module:"horen", teil:4.

REGLAS Teil 4:
- PROHIBIDO estereotipo «Herzlich willkommen zu "… im Fokus"».
- Nombres invitados variados (rotación).
- ⚠️ Cada pregunta evalúa quién dijo qué — datos localizables en el texto.

Devuelve SOLO JSON.
```

---

## B1 — SCHREIBEN (autónomo · 1 batch = Teile 1–3 · **30 archivos** pendientes)

**No uses `vocab-coverage-report`.** El pool Personalizado filtra Schreiben solo por `topicTag`, no por lemas del deck (Track B — ver `docs/personal-exam-pool-first-architecture.md` §9).

**Modo de uso:** pegá este prompt en la IA externa. Al final, indicá **una** línea:
`Generá el batch #N de la tabla` (N = 1…30). Cada batch = 1 JSON con Teile 1+2+3 del mismo tema.

```
[INCLUIR BLOQUE COMÚN — level B1]

Eres examinador Goethe B1. Genera UN batch Schreiben completo (3 consignas, Teile 1–3).

ROTACIÓN FIJA (30 batches — generá SOLO el #N que te indique el operador):

 1. Umwelt (1/2)    11. Medien (3/3)   21. Sport (1/2)
 2. Umwelt (2/2)    12. Verkehr (1/3)  22. Sport (2/2)
 3. Gesundheit (1/3) 13. Verkehr (2/3)  23. Kultur (1/2)
 4. Gesundheit (2/3) 14. Verkehr (3/3)  24. Kultur (2/2)
 5. Gesundheit (3/3) 15. Stadtleben (1/2) 25. Familie (1/2)
 6. Reisen          16. Stadtleben (2/2) 26. Familie (2/2)
 7. Arbeit (1/2)    17. Ernährung       27. Technik (1/2)
 8. Arbeit (2/2)    18. Freizeit (1/3)  28. Technik (2/2)
 9. Medien (1/3)    19. Freizeit (2/3)  29. Bildung (1/2)
10. Medien (2/3)    20. Freizeit (3/3)  30. Bildung (2/2)

(Wohnen y Konsum ya cumplen stock ≥3 — no generar.)

TEMA del batch = tema de la fila elegida. Coherencia temática en las 3 consignas.
NO hace falta lista de vocabulario del banco — léxico B1 natural del tema basta.

FORMATO JSON:
- passages: []
- 3 questions: teil 1, 2, 3 · type "short_answer" · correct/correctAnswer "rubric" · options []
- topicTag raíz = TEMA · topicTags en cada question
- skills:["writing"] · difficulty 5–6 · examType:"goethe" · level:"B1" · lang:"de"

TEIL 1: E-Mail a Freund/in, circa 80 Wörter, 3 bullets •, Sie en consigna, Anrede+Gruß pedidos.
TEIL 2: Forumpost ~80 W, cita «…», Meinung + Vor-/Nachteile + Begründung.
TEIL 3: Nota ~40 W a PERSONA CON NOMBRE (Herr/Frau + Apellido), 3 bullets, registro coherente.
  PROHIBIDO: [Name], instituciones anónimas (Bürgerbüro, Stadtamt).

explanation: plantilla Goethe canónica por Teil (4 criterios B1; T3 escala 0–4/0–6).
  T1/T2: Erfüllung/Kohärenz/Wortschatz/Strukturen (0–10). Ca. 80 Wörter.
  T3: Erfüllung (0–4), Kohärenz (0–4), Wortschatz (0–6), Strukturen (0–6). Ca. 40 Wörter.

⚠️ CHK-6: NO uses Aspekte, Klarheit, Manifestation — usa Punkt, verständlich.

IDs únicos: gen-q-s-t1-XXXX-q1, gen-q-s-t2-XXXX-q1, gen-q-s-t3-XXXX-q1
Devuelve SOLO JSON.
```

---

## B1 — SPRECHEN (autónomo · 1 batch = Teile 1–3 · **43 archivos** pendientes)

**No uses `vocab-coverage-report`.** Sprechen en Personalizado = Track B (solo tema; vocab del deck no es gate).

**Modo de uso:** pegá el prompt + `Generá el batch #N de la tabla` (N = 1…43).

```
[INCLUIR BLOQUE COMÚN — level B1]

Eres examinador Goethe B1. Genera UN batch Sprechen completo (3 tareas, Teile 1–3).

ROTACIÓN FIJA (43 batches — generá SOLO el #N que te indique el operador):

 1. Umwelt (1/3)     16. Verkehr (2/3)   31. Kultur (2/3)
 2. Umwelt (2/3)     17. Verkehr (3/3)   32. Kultur (3/3)
 3. Umwelt (3/3)     18. Stadtleben (1/3) 33. Familie (1/3)
 4. Gesundheit (1/3) 19. Stadtleben (2/3) 34. Familie (2/3)
 5. Gesundheit (2/3) 20. Stadtleben (3/3) 35. Familie (3/3)
 6. Gesundheit (3/3) 21. Ernährung (1/3)  36. Konsum (1/3)
 7. Reisen (1/3)     22. Ernährung (2/3)  37. Konsum (2/3)
 8. Reisen (2/3)     23. Ernährung (3/3)  38. Konsum (3/3)
 9. Reisen (3/3)     24. Freizeit (1/3)   39. Technik (1/3)
10. Arbeit (1/2)     25. Freizeit (2/3)   40. Technik (2/3)
11. Arbeit (2/2)     26. Freizeit (3/3)   41. Technik (3/3)
12. Wohnen           27. Sport (1/3)      42. Bildung
13. Medien (1/3)     28. Sport (2/3)
14. Medien (2/3)     29. Sport (3/3)
15. Medien (3/3)     30. Kultur (1/3)

TEMA del batch = tema de la fila elegida. NO hace falta vocabulario del banco.

FORMATO JSON:
- passages: []
- 3 questions teil 1/2/3:
  T1 type "planungsaufgabe" · T2 "praesentation" · T3 "feedback_diskussion"
- correct/correctAnswer "rubric" · options [] · difficulty 5 · skills:["speaking"]
- topicTag = TEMA · level:"B1" · lang:"de"

TEIL 1: Partner/Partnerin, situación concreta, 5 puntos (sin •/*/− al inicio), Sie.
TEIL 2: «Präsentation» + tema entre «…» + 5 puntos numerados 1.–5.
TEIL 3: «Feedback»/«Rückmeldung» + «Stellen Sie … Fragen» + línea «Beispielfragen:»
  + referencia al tema T2. PROHIBIDO Kandidat/Prüfer/1ª persona examinador.

explanation en alemán B1 simple (NO B2+: evita Klarheit, Aspekte, Kohärenz académica).
  Usa: Struktur, verständlich, Grammatik, Wortschatz, Interaktion.

⚠️ CHK-6: vocabulario ≤B1 en question Y explanation.

Devuelve SOLO JSON.
```

---

## A2 — LESEN

### Lesen A2 · Teil 1 (Medientext MCQ)

```
[INCLUIR BLOQUE COMÚN — level A2]

Eres examinador Goethe A2. Genera Lesen Teil 1.

TEMA: <<< tema cotidiano A2 >>>
VOCABULARIO A INTEGRAR: <<< lemas A2 >>>

FORMATO: 1 passage 120–200 palabras + 5 MCQ a/b/c. module:"lesen", teil:1, level:"A2".
Léxico A2 simple (Familie, Wohnung, Arbeit, Einkaufen). Sin jerga B1+.

Devuelve SOLO JSON.
```

### Lesen A2 · Teil 2 — ver `plantillas-lesen-a2/lesen-teil2.md`

### Lesen A2 · Teil 3 (E-Mail MCQ)

```
[INCLUIR BLOQUE COMÚN — level A2]

Eres examinador Goethe A2. Genera Lesen Teil 3.

TEMA: <<< tema cotidiano >>>
VOCABULARIO A INTEGRAR: <<< lemas A2 >>>

FORMATO: 1 E-Mail 100–180 palabras + 5 MCQ a/b/c. module:"lesen", teil:3, level:"A2".
Preguntas sobre detalles concretos de la correspondencia.

Devuelve SOLO JSON.
```

### Lesen A2 · Teil 4 — ver `plantillas-lesen-a2/lesen-teil4.md`

---

## A2 — HÖREN · Teil 1–4

Ver plantillas completas en `plantillas-horen-a2/horen-teilN.md`. Resumen:

| Teil | Formato | Longitud |
|------|---------|----------|
| T1 | 5 segmentos + 5 MCQ (escucha 2×) | 20–70 palabras/segmento |
| T2 | 1 diálogo + pictures[9] + 5 matching a–i | 80–150 palabras |
| T3 | 5 diálogos cortos + 5 MCQ | 15–50 palabras/diálogo |
| T4 | 1 Radiointerview + 5 ja_nein | 150–250 palabras |

Cada prompt incluye TEMA: y VOCABULARIO A INTEGRAR: + BLOQUE COMÚN A2.

---

## A2 — SCHREIBEN (autónomo · 1 batch = Teile 1–2)

**Grilla operativa:** el CLI usa los mismos **16 temas Tier-A B1** (objetivo 3 batches/tema). Stock verificado hoy = **0**; hay 4 curados (`health/work/society/education`) fuera del registro.

- **Déficit grilla 16 temas:** **48 archivos** (cada archivo = SMS T1 + E-Mail T2).
- **Déficit grilla 4 temas curados:** **12 archivos** (faltan **8** si ya tenés los 4 curados).

Sin `vocab-coverage-report` — solo tema.

```
[INCLUIR BLOQUE COMÚN — level A2]

Eres examinador Goethe A2. Genera UN batch Schreiben (Teile 1–2 en un solo JSON).

ROTACIÓN 16 TEMAS (generá SOLO el #N indicado; repite tema 3× antes de pasar al siguiente):

 1–3 Umwelt · 4–6 Gesundheit · 7–9 Reisen · 10–12 Arbeit · 13–15 Wohnen · 16–18 Medien
19–21 Verkehr · 22–24 Stadtleben · 25–27 Ernährung · 28–30 Freizeit · 31–33 Sport
34–36 Kultur · 37–39 Familie · 40–42 Konsum · 43–45 Technik · 46–48 Bildung

TEMA = tema del trío (#1→Umwelt, #4→Gesundheit, …). Léxico A2 cotidiano; sin vocab del banco.

FORMATO JSON:
- passages: []
- 2 questions: teil 1 (SMS 20–30 W, 3 bullets) + teil 2 (E-Mail 30–40 W an Chef, 3 bullets)
- type "short_answer" · correct/correctAnswer "rubric" · options []
- topicTag = TEMA · level:"A2" · lang:"de" · grammarTags A2

Devuelve SOLO JSON.
```

Detalle: `plantillas-schreiben-a2/schreiben-teilN.md`.

---

## A2 — SPRECHEN (autónomo · 1 batch = Teile 1–3)

- **Déficit grilla 16 temas:** **48 archivos** (3 Teile c/u).
- **Déficit grilla 4 temas curados:** **12 archivos** (faltan **8** con los 4 curados actuales).

```
[INCLUIR BLOQUE COMÚN — level A2]

Eres examinador Goethe A2. Genera UN batch Sprechen (Teile 1–3 en un solo JSON).

ROTACIÓN 16 TEMAS (generá SOLO el #N; 3 copias por tema = batches 1–3 Umwelt, 4–6 Gesundheit, …):

 1–3 Umwelt … 46–48 Bildung (misma tabla que Schreiben A2, hasta #48).

TEMA = tema del trío. Sin vocab del banco.

FORMATO JSON:
- passages: []
- 3 questions:
  T1 type "personal_questions" — 4 Karten (Geburtstag/Wohnort/Beruf/Hobby), paarweise
  T2 type "about_self" — 1 Karte «…» + erzählen
  T3 type "plan_together" — 2 Wochenpläne + Termin finden
- correct/correctAnswer "rubric" · topicTag = TEMA · level:"A2" · grammarTags A2

Evita Präsentation, Feedback, Workshop — usa formulaciones A2 simples.

Devuelve SOLO JSON.
```

Detalle: `plantillas-sprechen-a2/sprechen-teilN.md`.

---

## Lesen/Hören — advertencia para prompts manuales

Incluir al final de CADA prompt Lesen/Hören:

```
⚠️ ADVERTENCIA GATES DELICADOS (LexiCoil):
- SESGO LONGITUD MCQ: la opción correcta NO puede ser sistemáticamente la más larga.
- SESGO POSICIÓN: distribuye la letra correcta (no siempre b ni siempre la 3.ª opción).
- WORD-MATCHING: máx. 2 palabras de contenido compartidas pasaje↔pregunta/opción; nunca 4+ seguidas.
- TEMA: coherencia en TODO el texto, no solo en topicTags/título.
- DUPLICADO DE MOLDE: varía estructura de anuncios/opiniones/segmentos respecto a partes ya publicadas.
- Sin pipeline auto-repair: si falla validate/paste, corrige manualmente y re-ejecuta.
```
