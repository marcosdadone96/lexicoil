# Plantilla de generación — Lesen B1 · Teil 3

Pega TODO este texto en Gemini/ChatGPT/Claude. Sustituye **PALABRAS OBJETIVO** (5–8 palabras).
Devuelve **SOLO JSON**. El ejemplo de abajo pasa validación técnica + calidad + CEFR al 100%.

---

Eres examinador del Goethe-Zertifikat B1. Genera **UNA** parte de **Lesen Teil 3**
(anuncios A–J + situaciones, matching), alemán estándar, nivel B1.

## Reglas estrictas
- Formato: **ads_matching** — **10 anuncios A–J** (idénticos en las 7 preguntas) + **7 situaciones**.
- Tipo: **matching** — cada situación → una letra (A–J) o **0** (ningún anuncio encaja).
- **Sin pasaje prose** — `passages: []`. Los anuncios van en `options` de cada pregunta.

## LONGITUD CEFR (OBLIGATORIO)
Cada anuncio (`A) …` hasta `J) …`) debe tener **25–45 palabras** (mínimo **20**, máximo **60**).
Cuenta palabras en **cada línea por separado**. Anuncios demasiado cortos o largos fallan el ingest.

## VOCABULARIO B1 (cobertura ≥75% — OBLIGATORIO)
Usa léxico **simple y frecuente** en anuncios:

> Termin, Kurs, Reparieren, Transport, Stadt, Familie, Organisation, Anmeldung, Hausbesuch, Gebühr, Wochenende, Beratung, Nachhilfe, Miete, Shop

**PROHIBIDO:** anglicismos raros, títulos que delaten la respuesta (p. ej. «Tablet-Kurs» para situación «Tablet kaputt»), jerga jurídica.

## REGLAS DE CALIDAD (rechazo automático si fallas)
1. **Exactamente 7 preguntas** — ni 6 ni 8. Todas tipo `matching`, `passages: []`.
2. Los **10 anuncios A–J son IDÉNTICOS** en las 7 preguntas (mismo array `options`, mismo orden, mismas letras).
3. **Solo A–J y 0** — **PROHIBIDO** un 11.º anuncio «K)», `correct: null`, o letra fuera de A–J/0.
4. **Familias temáticas:** agrupa anuncios (p. ej. 3 reparación, 3 clases, 2 transporte, 2 viajes). Cada situación con respuesta A–J debe tener **≥2 competidores** de su familia entre los otros anuncios.
5. **Anti word-matching:** la situación NO comparte **2+ palabras (≥4 letras)** con su anuncio correcto. El **titular** del anuncio correcto **neutro** (p. ej. «PC-Hilfe Zuhause», no «Tablet-Reparatur») y **≤1 palabra** compartida con la situación.
6. **Al menos 1 situación** con respuesta **`"0"`** (string cero = ningún anuncio encaja). **No uses la letra K** ni un anuncio extra para el «ninguno».
7. Usa **≥6 letras distintas** como respuesta correcta entre las 7 (objetivo: repartir A–J).
8. **≥4 anuncios** con restricción horaria o condición (`Mo–Fr 9–17 Uhr`, `nur mit Termin`, `Sa 10–14 Uhr`, `bis Fr.`).

## PASO 0 — Tabla de familias (OBLIGATORIO antes del JSON)

**No escribas JSON hasta completar esta tabla.** Asigna cada anuncio A–J a una familia y cada situación a su respuesta.

| Anuncio | Familia (ej.) | Titular neutro |
|---------|---------------|----------------|
| A | Kurse/Schreiben | Schreibcoaching Abends |
| B | Auto/Pflege | Glanz & Grün |
| C | IT/Hausbesuch | PC-Hilfe Zuhause |
| … | … | … |
| J | Geräte/Shop | TechDeal24 |

| # | Situación (resumen) | Respuesta | Competidores (≥2 de la misma familia) |
|---|---------------------|-----------|----------------------------------------|
| 1 | Drucker/WLAN vor Ort | C | F (Repair), J (Shop) — familia IT |
| 2 | … | D | G, B — familia Auto |
| … | … | … | … |
| 4 | Samstagvormittag Mütter+Kleinkind | **0** | — (ningún anuncio encaja) |
| … | … | … | … |

Comprueba: ¿7 filas? ¿≥1 respuesta **0**? ¿Cada fila A–J tiene ≥2 competidores? ¿Titular correcto sin palabras de la situación?

## ERRORES FRECUENTES (Gemini/ChatGPT — evítalos)

| Error | Por qué falla | Solución |
|-------|---------------|----------|
| Solo 6 preguntas | Formato Goethe = 7 | Añade la 7.ª situación |
| Anuncio «K) Kein passendes…» | Respuesta debe ser **`"0"`**, no letra K | Quitar K; poner `"correct": "0"` |
| `options` distintos en Q7 | Checker exige array idéntico | Copia exacta de A–J en las 7 preguntas |
| Titular «Transport-Profi» + situación «Transport» | Titular delata respuesta | Marca neutra: «FlexDrive», «MobilCenter» |
| Situación «Smartphone kaputt» + anuncio «Elektronik-Reparatur» | Word-matching | Anuncio por significado: «Repair-Café Nord — Kleingeräte…» |
| 1 solo competidor temático | Mínimo 2 distractores de la misma familia | Añade otro anuncio de la familia (p. ej. 3ª oferta IT) |
| Anuncios <20 o >60 palabras | Falla ingest CEFR | Cuenta palabras por línea A)…J) |

## ANTI WORD-MATCHING — MALO vs BUENO (léelo antes de escribir)

❌ **MALO:** Situación «Mein **Tablet** ist kaputt» + anuncio correcto «**Tablet**-Reparatur Kurs».
→ Palabras compartidas delatan la respuesta.

✅ **BUENO:** Situación «Mein **Tablet** ist kaputt» + anuncio «PC-Hilfe Zuhause — Router, E-Mail, Drucker. Hausbesuch…» (titular neutro, ≤1 palabra compartida).

**Proceso obligatorio:** escribe primero las 7 situaciones; luego diseña anuncios que encajen por **significado**, no por palabras iguales.

## PALABRAS OBJETIVO — límites
- **5–8 palabras** (no más). Intégralas en los **anuncios**, no en las situaciones. Si una no encaja, omítela.
- Pool **solo Lesen**; Hören es otro módulo.

## PALABRAS OBJETIVO
<<< termin, kurs, reparieren, transport, stadt, familie, organisation, anmeldung, hausbesuch, gebühr >>>

## AUTORREVISIÓN (obligatoria — tras completar PASO 0)
- ¿**Exactamente 7** preguntas matching, `passages: []`?
- ¿Mismo array `options` (A–J, **10 líneas**) **byte a byte** en las 7 preguntas?
- ¿**Sin anuncio K** ni `correct: null`? ¿≥1 `"correct": "0"`?
- ¿Cada situación A–J tiene ≥2 competidores temáticos?
- ¿≥6 letras distintas como correctas (A–J)?
- ¿Situación ↔ anuncio correcto comparten **≤1** palabra (≥4 letras)? ¿Titular neutro?
- ¿≥4 anuncios con horario/condición (`Uhr`, `nur`, `Termin`, `Mo–`)?
- ¿Sin `passageId`? ¿Solo JSON, sin markdown ni tabla?

## Formato de salida
Devuelve SOLO `{ "passages": [], "questions": [...] }` — sin ```, sin texto extra.
- IDs únicos: `gen-q-3-XXXX-N` (XXXX aleatorio, no reutilizar ejemplo).
- `module`:"lesen", `teil`:3 (número), `lang`:"de", `level`:"B1".
- `correct` = `correctAnswer` (letra A–J o **0**). **NO** incluyas `passageId`.

## EJEMPLO VERIFICADO (100% checker — imita estructura, familias y parafraseo)

```json
{
  "passages": [],
  "questions": [
    {
      "id": "gen-q-3-8842-1",
      "module": "lesen",
      "teil": 3,
      "type": "matching",
      "question": "Seit dem Umzug spinnt zu Hause der Drucker, und das WLAN ist unzuverlässig. Jemand soll vor Ort nach dem Rechten sehen.",
      "options": [
        "A) Schreibcoaching Abends — Business-Korrespondenz üben, Di+Do 18–20 Uhr, max. 8 Plätze. Anmeldung online.",
        "B) Glanz & Grün — Auto innen/außen, nur mit Termin, Mo–Fr. Stempelkarte: 10. Wäsche gratis.",
        "C) PC-Hilfe Zuhause — Router, E-Mail, Drucker. Hausbesuch, ab 35 €/Std. Kein Handy-Support.",
        "D) Gebrauchtwagen West — PKW & Transporter, Kauf oder Kurzzeitmiete, HU, 6 Mon. Garantie schriftlich. Bar/Überweisung. Probefahrt Di–Sa.",
        "E) Physik & Co. — Nachhilfe Kl. 9–13, online oder vor Ort. Erste 30 Min. zum Testen kostenlos.",
        "F) Repair-Café Nord — Kleingeräte, Textilien. Sa 10–14 Uhr. Material gegen Spende, keine Teile vorrätig.",
        "G) FlexDrive — PKW leihen für Tage & Wochenenden, FS min. 2 Jahre. Abholung Bahnhofsviertel.",
        "H) Sommerküche — 6 Abende Di 19 Uhr, 89 €, Anmeldung bis Fr.",
        "I) Horizont Reisen — Pauschalreisen, Beratung Mi–Fr 10–18 Uhr im Büro.",
        "J) TechDeal24 — Laptops & Tablets, Versand 2–5 Werktage, Abholung im Shop sofort."
      ],
      "correct": "C",
      "correctAnswer": "C",
      "explanation": "Router/Drucker vor Ort — PC-Hilfe mit Hausbesuch, nicht Geräteverkauf.",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-3-8842-2",
      "module": "lesen",
      "teil": 3,
      "type": "matching",
      "question": "Sie hat genug gespart und möchte beim Erwerb nicht nur mündliche Zusagen, sondern klare Regeln auf Papier für ein halbes Jahr.",
      "options": [
        "A) Schreibcoaching Abends — Business-Korrespondenz üben, Di+Do 18–20 Uhr, max. 8 Plätze. Anmeldung online.",
        "B) Glanz & Grün — Auto innen/außen, nur mit Termin, Mo–Fr. Stempelkarte: 10. Wäsche gratis.",
        "C) PC-Hilfe Zuhause — Router, E-Mail, Drucker. Hausbesuch, ab 35 €/Std. Kein Handy-Support.",
        "D) Gebrauchtwagen West — PKW & Transporter, Kauf oder Kurzzeitmiete, HU, 6 Mon. Garantie schriftlich. Bar/Überweisung. Probefahrt Di–Sa.",
        "E) Physik & Co. — Nachhilfe Kl. 9–13, online oder vor Ort. Erste 30 Min. zum Testen kostenlos.",
        "F) Repair-Café Nord — Kleingeräte, Textilien. Sa 10–14 Uhr. Material gegen Spende, keine Teile vorrätig.",
        "G) FlexDrive — PKW leihen für Tage & Wochenenden, FS min. 2 Jahre. Abholung Bahnhofsviertel.",
        "H) Sommerküche — 6 Abende Di 19 Uhr, 89 €, Anmeldung bis Fr.",
        "I) Horizont Reisen — Pauschalreisen, Beratung Mi–Fr 10–18 Uhr im Büro.",
        "J) TechDeal24 — Laptops & Tablets, Versand 2–5 Werktage, Abholung im Shop sofort."
      ],
      "correct": "D",
      "correctAnswer": "D",
      "explanation": "Kauf mit 6 Monaten Garantie schriftlich — Gebrauchtwagen West, nicht Miete.",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-3-8842-3",
      "module": "lesen",
      "teil": 3,
      "type": "matching",
      "question": "Im Job muss sie oft Kunden antworten und ist unsicher, ob der Ton professionell genug wirkt.",
      "options": [
        "A) Schreibcoaching Abends — Business-Korrespondenz üben, Di+Do 18–20 Uhr, max. 8 Plätze. Anmeldung online.",
        "B) Glanz & Grün — Auto innen/außen, nur mit Termin, Mo–Fr. Stempelkarte: 10. Wäsche gratis.",
        "C) PC-Hilfe Zuhause — Router, E-Mail, Drucker. Hausbesuch, ab 35 €/Std. Kein Handy-Support.",
        "D) Gebrauchtwagen West — PKW & Transporter, Kauf oder Kurzzeitmiete, HU, 6 Mon. Garantie schriftlich. Bar/Überweisung. Probefahrt Di–Sa.",
        "E) Physik & Co. — Nachhilfe Kl. 9–13, online oder vor Ort. Erste 30 Min. zum Testen kostenlos.",
        "F) Repair-Café Nord — Kleingeräte, Textilien. Sa 10–14 Uhr. Material gegen Spende, keine Teile vorrätig.",
        "G) FlexDrive — PKW leihen für Tage & Wochenenden, FS min. 2 Jahre. Abholung Bahnhofsviertel.",
        "H) Sommerküche — 6 Abende Di 19 Uhr, 89 €, Anmeldung bis Fr.",
        "I) Horizont Reisen — Pauschalreisen, Beratung Mi–Fr 10–18 Uhr im Büro.",
        "J) TechDeal24 — Laptops & Tablets, Versand 2–5 Werktage, Abholung im Shop sofort."
      ],
      "correct": "A",
      "correctAnswer": "A",
      "explanation": "Professioneller Ton in Korrespondenz — Schreibcoaching, nicht PC-Hilfe.",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-3-8842-4",
      "module": "lesen",
      "teil": 3,
      "type": "matching",
      "question": "Sie sucht einen Kurs samstags vormittags, der sich an Mütter mit Kleinkindern richtet.",
      "options": [
        "A) Schreibcoaching Abends — Business-Korrespondenz üben, Di+Do 18–20 Uhr, max. 8 Plätze. Anmeldung online.",
        "B) Glanz & Grün — Auto innen/außen, nur mit Termin, Mo–Fr. Stempelkarte: 10. Wäsche gratis.",
        "C) PC-Hilfe Zuhause — Router, E-Mail, Drucker. Hausbesuch, ab 35 €/Std. Kein Handy-Support.",
        "D) Gebrauchtwagen West — PKW & Transporter, Kauf oder Kurzzeitmiete, HU, 6 Mon. Garantie schriftlich. Bar/Überweisung. Probefahrt Di–Sa.",
        "E) Physik & Co. — Nachhilfe Kl. 9–13, online oder vor Ort. Erste 30 Min. zum Testen kostenlos.",
        "F) Repair-Café Nord — Kleingeräte, Textilien. Sa 10–14 Uhr. Material gegen Spende, keine Teile vorrätig.",
        "G) FlexDrive — PKW leihen für Tage & Wochenenden, FS min. 2 Jahre. Abholung Bahnhofsviertel.",
        "H) Sommerküche — 6 Abende Di 19 Uhr, 89 €, Anmeldung bis Fr.",
        "I) Horizont Reisen — Pauschalreisen, Beratung Mi–Fr 10–18 Uhr im Büro.",
        "J) TechDeal24 — Laptops & Tablets, Versand 2–5 Werktage, Abholung im Shop sofort."
      ],
      "correct": "0",
      "correctAnswer": "0",
      "explanation": "Kein Angebot passt: kein Samstagvormittag-Kurs für Mütter mit Kleinkindern.",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-3-8842-5",
      "module": "lesen",
      "teil": 3,
      "type": "matching",
      "question": "Der Laptop ist ausgefallen. Ersatz soll her, am liebsten heute noch im Laden abholbar.",
      "options": [
        "A) Schreibcoaching Abends — Business-Korrespondenz üben, Di+Do 18–20 Uhr, max. 8 Plätze. Anmeldung online.",
        "B) Glanz & Grün — Auto innen/außen, nur mit Termin, Mo–Fr. Stempelkarte: 10. Wäsche gratis.",
        "C) PC-Hilfe Zuhause — Router, E-Mail, Drucker. Hausbesuch, ab 35 €/Std. Kein Handy-Support.",
        "D) Gebrauchtwagen West — PKW & Transporter, Kauf oder Kurzzeitmiete, HU, 6 Mon. Garantie schriftlich. Bar/Überweisung. Probefahrt Di–Sa.",
        "E) Physik & Co. — Nachhilfe Kl. 9–13, online oder vor Ort. Erste 30 Min. zum Testen kostenlos.",
        "F) Repair-Café Nord — Kleingeräte, Textilien. Sa 10–14 Uhr. Material gegen Spende, keine Teile vorrätig.",
        "G) FlexDrive — PKW leihen für Tage & Wochenenden, FS min. 2 Jahre. Abholung Bahnhofsviertel.",
        "H) Sommerküche — 6 Abende Di 19 Uhr, 89 €, Anmeldung bis Fr.",
        "I) Horizont Reisen — Pauschalreisen, Beratung Mi–Fr 10–18 Uhr im Büro.",
        "J) TechDeal24 — Laptops & Tablets, Versand 2–5 Werktage, Abholung im Shop sofort."
      ],
      "correct": "J",
      "correctAnswer": "J",
      "explanation": "Sofort im Shop abholen — TechDeal24, nicht Repair-Café.",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-3-8842-6",
      "module": "lesen",
      "teil": 3,
      "type": "matching",
      "question": "Der Wasserkocher tropft. Eine neue Maschine möchte sie erst einmal vermeiden.",
      "options": [
        "A) Schreibcoaching Abends — Business-Korrespondenz üben, Di+Do 18–20 Uhr, max. 8 Plätze. Anmeldung online.",
        "B) Glanz & Grün — Auto innen/außen, nur mit Termin, Mo–Fr. Stempelkarte: 10. Wäsche gratis.",
        "C) PC-Hilfe Zuhause — Router, E-Mail, Drucker. Hausbesuch, ab 35 €/Std. Kein Handy-Support.",
        "D) Gebrauchtwagen West — PKW & Transporter, Kauf oder Kurzzeitmiete, HU, 6 Mon. Garantie schriftlich. Bar/Überweisung. Probefahrt Di–Sa.",
        "E) Physik & Co. — Nachhilfe Kl. 9–13, online oder vor Ort. Erste 30 Min. zum Testen kostenlos.",
        "F) Repair-Café Nord — Kleingeräte, Textilien. Sa 10–14 Uhr. Material gegen Spende, keine Teile vorrätig.",
        "G) FlexDrive — PKW leihen für Tage & Wochenenden, FS min. 2 Jahre. Abholung Bahnhofsviertel.",
        "H) Sommerküche — 6 Abende Di 19 Uhr, 89 €, Anmeldung bis Fr.",
        "I) Horizont Reisen — Pauschalreisen, Beratung Mi–Fr 10–18 Uhr im Büro.",
        "J) TechDeal24 — Laptops & Tablets, Versand 2–5 Werktage, Abholung im Shop sofort."
      ],
      "correct": "F",
      "correctAnswer": "F",
      "explanation": "Kleingerät reparieren statt neu kaufen — Repair-Café.",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-3-8842-7",
      "module": "lesen",
      "teil": 3,
      "type": "matching",
      "question": "Ihr eigenes Auto ist in der Werkstatt. Für drei Tage braucht sie kurzfristig ein Ersatzfahrzeug — Führerschein seit fünf Jahren.",
      "options": [
        "A) Schreibcoaching Abends — Business-Korrespondenz üben, Di+Do 18–20 Uhr, max. 8 Plätze. Anmeldung online.",
        "B) Glanz & Grün — Auto innen/außen, nur mit Termin, Mo–Fr. Stempelkarte: 10. Wäsche gratis.",
        "C) PC-Hilfe Zuhause — Router, E-Mail, Drucker. Hausbesuch, ab 35 €/Std. Kein Handy-Support.",
        "D) Gebrauchtwagen West — PKW & Transporter, Kauf oder Kurzzeitmiete, HU, 6 Mon. Garantie schriftlich. Bar/Überweisung. Probefahrt Di–Sa.",
        "E) Physik & Co. — Nachhilfe Kl. 9–13, online oder vor Ort. Erste 30 Min. zum Testen kostenlos.",
        "F) Repair-Café Nord — Kleingeräte, Textilien. Sa 10–14 Uhr. Material gegen Spende, keine Teile vorrätig.",
        "G) FlexDrive — PKW leihen für Tage & Wochenenden, FS min. 2 Jahre. Abholung Bahnhofsviertel.",
        "H) Sommerküche — 6 Abende Di 19 Uhr, 89 €, Anmeldung bis Fr.",
        "I) Horizont Reisen — Pauschalreisen, Beratung Mi–Fr 10–18 Uhr im Büro.",
        "J) TechDeal24 — Laptops & Tablets, Versand 2–5 Werktage, Abholung im Shop sofort."
      ],
      "correct": "G",
      "correctAnswer": "G",
      "explanation": "Kurzfristig fahren ohne Kauf — FlexDrive Tagesmiete.",
      "lang": "de",
      "level": "B1"
    }
  ]
}
```

Genera UNA parte **NUEVA** (anuncios y situaciones distintos al ejemplo), mismas reglas, integrando PALABRAS OBJETIVO. Devuelve solo el JSON.
