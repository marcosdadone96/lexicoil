# Q2 answerKeyCoherence — dry-run

**Fecha:** 2026-07-10T07:17:54.083Z
**Modelo:** claude-haiku-4-5
**Archivos:** 519/519
**LLM calls:** 973
**Ítems revisados:** 3298
**CHK-18b hits (escalados a LLM):** 52
**LLM éxito (archivos):** 518
**LLM parse errors:** 1
**LLM credit errors:** 0
**wouldBlock files:** 20
**wouldWarn files:** 3
**Mismatches confidence=high:** 20

## Mismatches high (revisión manual)

### 1. batches/ready/lesen/lesen-t1-gemini-168.json — gen-q-1-9cdb29e6-3

- **declarada:** Richtig → **inferida:** Falsch (LLM)
- **motivo:** Die Aussage behauptet ausschließlich, aber der Text nennt den Kurs als ein Beispiel unter vielen Gründen für die positive Veränderung, nicht als einziger Grund.
- **pregunta:** Sie besuchte die Online-Schulung ausschließlich, um ihre Computerkenntnisse zu erweitern.
- **explanation:** Im Text steht, dass sie den Online-Kurs besuchte, um ihre digitalen Fähigkeiten zu verbessern.

### 2. batches/ready/lesen/lesen-t3-auto-bybnyb.json — gen-q-3-9fky7o-4

- **declarada:** J → **inferida:** D (LLM)
- **motivo:** Die Frage verlangt einen Kurs zum Anfertigen eigener Kleidung; Option D (SchnittKurs) passt besser als J (NähKurs).
- **pregunta:** Lena möchte lernen, eigene Kleidung selbst anzufertigen, und sucht einen Einsteigerkurs.
- **opciones:**
  - A) ReißFix — Wir reparieren defekte Reißverschlüsse an Jacken und Taschen, Abgabe Di–Sa.
  - B) TragHilfe — Wir packen bei Ihrem Umzug an, auch sonntags, ab 40 Euro pro Stunde.
  - C) Tierpension — Pflege Ihres Hundes im Urlaub, großer Garten, 18 Euro pro Tag.
  - D) SchnittKurs — Anfängerkurs Schneidern eigener Kleidung, Sa 10–13 Uhr, kleine Gruppen.
  - E) SohlenStark — Wir reparieren Schuhe und Stiefel, neue Sohlen und Absätze, Mo–Fr 9–18 Uhr.
  - F) ZeitFix — Wir reparieren Armbanduhren und wechseln Batterien, Werkstatt zentral, Mo–Fr.
  - G) WohnVermitt — Wir vermitteln kleine Wohnungen in zentraler Lage, faire Provision.
  - H) StrickKurs — Anfängerkurs Stricken für Erwachsene, Do 18–20 Uhr, Wolle inklusive.
  - I) Glanzweg — Pflege und Reinigung von Fenstern und Büro, Sa 10–14 Uhr nach Absprache.
  - J) NähKurs — Anfängerkurs Nähen mit der Maschine, Di 17–19 Uhr, Stoffe werden gestellt.
- **explanation:** NähKurs lehrt Nähen.

### 3. batches/ready/lesen/lesen-t3-auto-p75b7k.json — gen-q-3-jsss5i-4

- **declarada:** c → **inferida:** G (LLM)
- **motivo:** Die Frage verlangt einen Kurs zum Anfertigen eigener Kleidung. SchnittKurs lehrt Schneidern eigener Kleidung, nicht NähKurs mit der Maschine.
- **pregunta:** Lena möchte lernen, eigene Kleidung selbst anzufertigen, und sucht einen Einsteigerkurs.
- **opciones:**
  - A) StrickKurs — Anfängerkurs Stricken für Erwachsene, Do 18–20 Uhr, Wolle inklusive.
  - B) SohlenStark — Wir reparieren Schuhe und Stiefel, neue Sohlen und Absätze, Mo–Fr 9–18 Uhr.
  - C) NähKurs — Anfängerkurs Nähen mit der Maschine, Di 17–19 Uhr, Stoffe werden gestellt.
  - D) WohnVermitt — Wir vermitteln kleine Wohnungen in zentraler Lage, faire Provision.
  - E) TragHilfe — Wir packen bei Ihrem Umzug an, auch sonntags, ab 40 Euro pro Stunde.
  - F) ZeitFix — Wir reparieren Armbanduhren und wechseln Batterien, Werkstatt zentral, Mo–Fr.
  - G) SchnittKurs — Anfängerkurs Schneidern eigener Kleidung, Sa 10–13 Uhr, kleine Gruppen.
  - H) Tierpension — Pflege Ihres Hundes im Urlaub, großer Garten, 18 Euro pro Tag.
  - I) ReißFix — Wir reparieren defekte Reißverschlüsse an Jacken und Taschen, Abgabe Di–Sa.
  - J) Glanzweg — Pflege und Reinigung von Fenstern und Büro, Sa 10–14 Uhr nach Absprache.
- **explanation:** NähKurs lehrt Nähen.

### 4. batches/ready/lesen/lesen-t3-auto-qz4p2f.json — gen-q-3-yuqs05-4

- **declarada:** F → **inferida:** H (LLM)
- **motivo:** Die Frage verlangt einen Kurs zum Anfertigen eigener Kleidung; Option H (SchnittKurs) passt besser als F (NähKurs).
- **pregunta:** Lena möchte lernen, eigene Kleidung selbst anzufertigen, und sucht einen Einsteigerkurs.
- **opciones:**
  - A) ZeitFix — Wir reparieren Armbanduhren und wechseln Batterien, Werkstatt zentral, Mo–Fr.
  - B) WohnVermitt — Wir vermitteln kleine Wohnungen in zentraler Lage, faire Provision.
  - C) Glanzweg — Pflege und Reinigung von Fenstern und Büro, Sa 10–14 Uhr nach Absprache.
  - D) TragHilfe — Wir packen bei Ihrem Umzug an, auch sonntags, ab 40 Euro pro Stunde.
  - E) ReißFix — Wir reparieren defekte Reißverschlüsse an Jacken und Taschen, Abgabe Di–Sa.
  - F) NähKurs — Anfängerkurs Nähen mit der Maschine, Di 17–19 Uhr, Stoffe werden gestellt.
  - G) StrickKurs — Anfängerkurs Stricken für Erwachsene, Do 18–20 Uhr, Wolle inklusive.
  - H) SchnittKurs — Anfängerkurs Schneidern eigener Kleidung, Sa 10–13 Uhr, kleine Gruppen.
  - I) SohlenStark — Wir reparieren Schuhe und Stiefel, neue Sohlen und Absätze, Mo–Fr 9–18 Uhr.
  - J) Tierpension — Pflege Ihres Hundes im Urlaub, großer Garten, 18 Euro pro Tag.
- **explanation:** NähKurs lehrt Nähen.

### 5. batches/ready/lesen/lesen-t3-auto-tgvlkh.json — gen-q-3-olxma4-4

- **declarada:** a → **inferida:** I (LLM)
- **motivo:** Lena möchte eigene Kleidung anfertigen; SchnittKurs lehrt Schneidern eigener Kleidung, nicht NähKurs.
- **pregunta:** Lena möchte lernen, eigene Kleidung selbst anzufertigen, und sucht einen Einsteigerkurs.
- **opciones:**
  - A) NähKurs — Anfängerkurs Nähen mit der Maschine, Di 17–19 Uhr, Stoffe werden gestellt.
  - B) SohlenStark — Wir reparieren Schuhe und Stiefel, neue Sohlen und Absätze, Mo–Fr 9–18 Uhr.
  - C) WohnVermitt — Wir vermitteln kleine Wohnungen in zentraler Lage, faire Provision.
  - D) ReißFix — Wir reparieren defekte Reißverschlüsse an Jacken und Taschen, Abgabe Di–Sa.
  - E) TragHilfe — Wir packen bei Ihrem Umzug an, auch sonntags, ab 40 Euro pro Stunde.
  - F) ZeitFix — Wir reparieren Armbanduhren und wechseln Batterien, Werkstatt zentral, Mo–Fr.
  - G) StrickKurs — Anfängerkurs Stricken für Erwachsene, Do 18–20 Uhr, Wolle inklusive.
  - H) Tierpension — Pflege Ihres Hundes im Urlaub, großer Garten, 18 Euro pro Tag.
  - I) SchnittKurs — Anfängerkurs Schneidern eigener Kleidung, Sa 10–13 Uhr, kleine Gruppen.
  - J) Glanzweg — Pflege und Reinigung von Fenstern und Büro, Sa 10–14 Uhr nach Absprache.
- **explanation:** NähKurs lehrt Nähen.

### 6. batches/ready/lesen/lesen-t5-gemini-021.json — gen-q-5-85ae542e-4

- **declarada:** a → **inferida:** c (LLM)
- **motivo:** Die Erklärung nennt Kosten von 0,30 Euro pro kWh und maximale Parkdauer von vier Stunden. Der passageText enthält jedoch keine Informationen zu Ladestationen für Elektroautos. Die Erklärung ist nicht im Text belegt.
- **pregunta:** Was ist über die Ladestationen für Elektroautos bekannt?
- **opciones:**
  - a) Die maximale Parkdauer beträgt vier Stunden, und die Nutzung kostet 30 Cent pro kWh.
  - b) Es gibt nur eine Ladestation, und die Nutzung ist kostenlos.
  - c) Eine Reservierung ist notwendig, und die Kosten betragen 0,30 Euro pro Kilowattstunde.
- **explanation:** Die Nutzung der Ladestationen kostet 0,30 Euro pro Kilowattstunde, und die maximale Parkzeit an der Station ist auf vier Stunden begrenzt.

### 7. batches/ready/lesen/lesen-t5-gemini-060.json — gen-q-5-2faf8867-4

- **declarada:** b → **inferida:** c (LLM)
- **motivo:** Die Erklärung erwähnt kostenloses WLAN und Computer für sechzig Minuten, die im Passagetext nicht vorkommen. Der Text verbietet Essen in Lesebereichen, erlaubt aber nur Wasser.
- **pregunta:** Was ist in der Bibliothek bezüglich der Nutzung von Technik und Verpflegung erlaubt?
- **opciones:**
  - a) Das Telefonieren ist überall erlaubt, solange der Lärmpegel niedrig ist.
  - b) Man kann gratis Internet nutzen und Computer für sechzig Minuten täglich verwenden; Speisen sind in den Lesezimmern jedoch nicht erlaubt.
  - c) Man darf in den Lesesälen Essen und Trinken, aber WLAN ist kostenpflichtig.
- **explanation:** Kostenloses WLAN und Computer für 60 Minuten pro Tag sind erlaubt, aber Essen ist in den Lesebereichen nicht gestattet, nur Wasser in verschließbaren Flaschen.

### 8. batches/generated/lesen-t2-gemini-098.json — gen-q-2-bc20349f-3

- **declarada:** c → **inferida:** b (LLM)
- **motivo:** Die Erklärung nennt zwei Ziele: Zusammenleben stärken und Vielfalt der Kulturen zeigen. Option b trifft das erste Ziel, Option c das zweite. Die Erklärung begründet eher b und c gemeinsam, aber declaredKey ist nur c.
- **pregunta:** Was ist ein Ziel der Veranstaltung laut Text?
- **opciones:**
  - a) Die Stadtverwaltung finanziell zu unterstützen.
  - b) Die Gemeinschaft der Nachbarn zu stärken.
  - c) Die kulturelle Breite der Stadt vorzustellen.
- **explanation:** Das Fest stärkt das Zusammenleben in der Stadt und zeigt die Vielfalt der Kulturen.

### 9. batches/generated/lesen-t1-gemini-124.json — gen-q-1-41f4b587-5

- **declarada:** Richtig → **inferida:** Falsch (LLM)
- **motivo:** Der Text sagt, sie ruft an, wenn sie Fragen hat, nicht dass die Hotline immer Informationen bietet.
- **pregunta:** Die 'Bürger-Hotline' bietet ihr immer Informationen zu städtischen Angeboten.
- **explanation:** Sie ruft dort an, wenn sie Fragen zu Transport oder Programmen hat, was auf eine Informationsquelle hinweist.

### 10. batches/generated/lesen-t1-gemini-131.json — gen-q-1-3b5df4ea-5

- **declarada:** Richtig → **inferida:** Falsch (LLM)
- **motivo:** Die Verfasserin erkundete aktiv die Stadt, besuchte Museen und Galerien. Das Wort abschalten bedeutet nicht ausschließlich entspannen, sondern auch aktive Erholung.
- **pregunta:** Sie wollte auf dieser Reise ausschließlich entspannen.
- **explanation:** Sie ist allein gereist, um wirklich abzuschalten.

### 11. batches/generated/lesen-t1-gemini-153.json — gen-q-1-d3f64de7-5

- **declarada:** Richtig → **inferida:** Falsch (LLM)
- **motivo:** Der Text sagt, dass sie sich mit Freunden trifft, die ähnliche Interessen haben, nicht dass alle ihre Freunde dieses Interesse teilen.
- **pregunta:** Alle ihre Freunde teilen ihr Interesse an einem gesunden Lebensstil.
- **explanation:** Sie trifft sich regelmäßig mit Freunden, die ähnliche Interessen haben, was darauf hindeutet, dass sie ihr Interesse teilen.

### 12. batches/generated/lesen-t2-gemini-084.json — gen-q-2-2b7cec20-3

- **declarada:** c → **inferida:** b (CHK-18b+LLM)
- **motivo:** Die Erklärung beschreibt, dass gemeinsames Lernen motivierender ist. Dies entspricht semantisch Option b, nicht Option c, die einen Arbeitsplatz garantiert.
- **pregunta:** Was ist ein Vorteil des Lernens in einer Gruppe, laut dem Text?
- **opciones:**
  - a) Es ist immer günstiger als Online-Angebote.
  - b) Es fördert die Motivation der Teilnehmer.
  - c) Es garantiert den Teilnehmern einen neuen Arbeitsplatz.
- **explanation:** Die Erfahrungen zeigen, dass das gemeinsame Lernen in der Gruppe motivierender ist für die Teilnehmer.

### 13. batches/generated/lesen-t3-auto-1z4z0i.json — gen-q-3-1b85p7-4

- **declarada:** E → **inferida:** G (LLM)
- **motivo:** Die Frage verlangt einen Kurs zum Anfertigen eigener Kleidung. Option G SchnittKurs lehrt Schneidern eigener Kleidung, nicht Option E NähKurs.
- **pregunta:** Lena möchte lernen, eigene Kleidung selbst anzufertigen, und sucht einen Einsteigerkurs.
- **opciones:**
  - A) Tierpension — Pflege Ihres Hundes im Urlaub, großer Garten, 18 Euro pro Tag.
  - B) WohnVermitt — Wir vermitteln kleine Wohnungen in zentraler Lage, faire Provision.
  - C) ReißFix — Wir reparieren defekte Reißverschlüsse an Jacken und Taschen, Abgabe Di–Sa.
  - D) TragHilfe — Wir packen bei Ihrem Umzug an, auch sonntags, ab 40 Euro pro Stunde.
  - E) NähKurs — Anfängerkurs Nähen mit der Maschine, Di 17–19 Uhr, Stoffe werden gestellt.
  - F) ZeitFix — Wir reparieren Armbanduhren und wechseln Batterien, Werkstatt zentral, Mo–Fr.
  - G) SchnittKurs — Anfängerkurs Schneidern eigener Kleidung, Sa 10–13 Uhr, kleine Gruppen.
  - H) SohlenStark — Wir reparieren Schuhe und Stiefel, neue Sohlen und Absätze, Mo–Fr 9–18 Uhr.
  - I) StrickKurs — Anfängerkurs Stricken für Erwachsene, Do 18–20 Uhr, Wolle inklusive.
  - J) Glanzweg — Pflege und Reinigung von Fenstern und Büro, Sa 10–14 Uhr nach Absprache.
- **explanation:** NähKurs lehrt Nähen.

### 14. batches/generated/lesen-t3-auto-3a0bg4.json — gen-q-3-jbxh7y-4

- **declarada:** H → **inferida:** c (LLM)
- **motivo:** Die Frage verlangt einen Kurs zum Anfertigen eigener Kleidung. Option C (SchnittKurs) passt besser als H (NähKurs), da Schneidern das Anfertigen von Kleidung lehrt.
- **pregunta:** Lena möchte lernen, eigene Kleidung selbst anzufertigen, und sucht einen Einsteigerkurs.
- **opciones:**
  - A) StrickKurs — Anfängerkurs Stricken für Erwachsene, Do 18–20 Uhr, Wolle inklusive.
  - B) ReißFix — Wir reparieren defekte Reißverschlüsse an Jacken und Taschen, Abgabe Di–Sa.
  - C) SchnittKurs — Anfängerkurs Schneidern eigener Kleidung, Sa 10–13 Uhr, kleine Gruppen.
  - D) Glanzweg — Pflege und Reinigung von Fenstern und Büro, Sa 10–14 Uhr nach Absprache.
  - E) Tierpension — Pflege Ihres Hundes im Urlaub, großer Garten, 18 Euro pro Tag.
  - F) SohlenStark — Wir reparieren Schuhe und Stiefel, neue Sohlen und Absätze, Mo–Fr 9–18 Uhr.
  - G) WohnVermitt — Wir vermitteln kleine Wohnungen in zentraler Lage, faire Provision.
  - H) NähKurs — Anfängerkurs Nähen mit der Maschine, Di 17–19 Uhr, Stoffe werden gestellt.
  - I) ZeitFix — Wir reparieren Armbanduhren und wechseln Batterien, Werkstatt zentral, Mo–Fr.
  - J) TragHilfe — Wir packen bei Ihrem Umzug an, auch sonntags, ab 40 Euro pro Stunde.
- **explanation:** NähKurs lehrt Nähen.

### 15. batches/generated/lesen-t3-auto-ir8rsg.json — gen-q-3-fx7qhn-4

- **declarada:** H → **inferida:** F (LLM)
- **motivo:** Lena möchte eigene Kleidung anfertigen. SchnittKurs (F) lehrt Schneidern eigener Kleidung, NähKurs (H) lehrt nur Nähen mit der Maschine. F passt besser.
- **pregunta:** Lena möchte lernen, eigene Kleidung selbst anzufertigen, und sucht einen Einsteigerkurs.
- **opciones:**
  - A) Tierpension — Pflege Ihres Hundes im Urlaub, großer Garten, 18 Euro pro Tag.
  - B) SohlenStark — Wir reparieren Schuhe und Stiefel, neue Sohlen und Absätze, Mo–Fr 9–18 Uhr.
  - C) WohnVermitt — Wir vermitteln kleine Wohnungen in zentraler Lage, faire Provision.
  - D) TragHilfe — Wir packen bei Ihrem Umzug an, auch sonntags, ab 40 Euro pro Stunde.
  - E) ZeitFix — Wir reparieren Armbanduhren und wechseln Batterien, Werkstatt zentral, Mo–Fr.
  - F) SchnittKurs — Anfängerkurs Schneidern eigener Kleidung, Sa 10–13 Uhr, kleine Gruppen.
  - G) ReißFix — Wir reparieren defekte Reißverschlüsse an Jacken und Taschen, Abgabe Di–Sa.
  - H) NähKurs — Anfängerkurs Nähen mit der Maschine, Di 17–19 Uhr, Stoffe werden gestellt.
  - I) Glanzweg — Pflege und Reinigung von Fenstern und Büro, Sa 10–14 Uhr nach Absprache.
  - J) StrickKurs — Anfängerkurs Stricken für Erwachsene, Do 18–20 Uhr, Wolle inklusive.
- **explanation:** NähKurs lehrt Nähen.

### 16. batches/generated/lesen-t3-auto-ozxalp.json — gen-q-3-5qvmh4-1

- **declarada:** F → **inferida:** E (LLM)
- **motivo:** Sara hat einen platten Schlauch. ReifenDoc repariert platte Reifen und defekte Bremsen. RadFit repariert nur Fahrräder allgemein, nicht spezifisch Schläuche.
- **pregunta:** Saras Drahtesel hat einen platten Schlauch, den sie ungern selbst flickt.
- **opciones:**
  - A) Umzugsfee — Wir tragen Ihre Möbel, auch am Wochenende, versichert, ab 45 Euro pro Stunde.
  - B) Sonnengarten — Wir pflegen Ihren Garten: Rasen, Hecken, Beete. Kostenloser Voranschlag, Mo–Fr.
  - C) Taktgefühl — Tanzkurs für Paare und Einzelne, Einsteiger willkommen, Fr ab 20 Uhr.
  - D) Drahtesel-Hilfe — Wir reparieren alte Fahrräder und tauschen Ketten, Abgabe Di–Sa bis 17 Uhr.
  - E) ReifenDoc — Wir reparieren platte Reifen und defekte Bremsen an jedem Rad, Werkstatt zentral.
  - F) RadFit — Wir reparieren Fahrräder und E-Bikes direkt vor Ihrer Tür, Termin nur über die App.
  - G) Wasserratten — Schwimmkurs für Anfänger ab 16 Jahren, Sa 9–11 Uhr, kleine Gruppen.
  - H) Beweglich — Anfängerkurs Yoga für Erwachsene, Mo und Mi 19 Uhr, erste Stunde gratis.
  - I) Heimstatt — Wir vermitteln möblierte Wohnungen auf Zeit, ideal für Berufstätige.
  - J) Blitzrein — Pflege und Reinigung von Treppenhaus und Praxis, wöchentlich oder monatlich.
- **explanation:** RadFit repariert Fahrräder.

### 17. batches/generated/lesen-t3-auto-rb0eeo.json — gen-q-3-6r4ttw-1

- **declarada:** b → **inferida:** F (LLM)
- **motivo:** Die Erklärung nennt nur, dass RadFit Fahrräder repariert. Sara hat aber einen platten Schlauch, wofür ReifenDoc spezialisiert ist.
- **pregunta:** Saras Drahtesel hat einen platten Schlauch, den sie ungern selbst flickt.
- **opciones:**
  - A) Blitzrein — Pflege und Reinigung von Treppenhaus und Praxis, wöchentlich oder monatlich.
  - B) RadFit — Wir reparieren Fahrräder und E-Bikes direkt vor Ihrer Tür, Termin nur über die App.
  - C) Heimstatt — Wir vermitteln möblierte Wohnungen auf Zeit, ideal für Berufstätige.
  - D) Drahtesel-Hilfe — Wir reparieren alte Fahrräder und tauschen Ketten, Abgabe Di–Sa bis 17 Uhr.
  - E) Taktgefühl — Tanzkurs für Paare und Einzelne, Einsteiger willkommen, Fr ab 20 Uhr.
  - F) ReifenDoc — Wir reparieren platte Reifen und defekte Bremsen an jedem Rad, Werkstatt zentral.
  - G) Beweglich — Anfängerkurs Yoga für Erwachsene, Mo und Mi 19 Uhr, erste Stunde gratis.
  - H) Wasserratten — Schwimmkurs für Anfänger ab 16 Jahren, Sa 9–11 Uhr, kleine Gruppen.
  - I) Sonnengarten — Wir pflegen Ihren Garten: Rasen, Hecken, Beete. Kostenloser Voranschlag, Mo–Fr.
  - J) Umzugsfee — Wir tragen Ihre Möbel, auch am Wochenende, versichert, ab 45 Euro pro Stunde.
- **explanation:** RadFit repariert Fahrräder.

### 18. batches/generated/lesen-t3-auto-toixf8.json — gen-q-3-mct5mc-4

- **declarada:** H → **inferida:** I (LLM)
- **motivo:** Lena möchte eigene Kleidung anfertigen; SchnittKurs lehrt Schneidern eigener Kleidung, nicht NähKurs.
- **pregunta:** Lena möchte lernen, eigene Kleidung selbst anzufertigen, und sucht einen Einsteigerkurs.
- **opciones:**
  - A) SohlenStark — Wir reparieren Schuhe und Stiefel, neue Sohlen und Absätze, Mo–Fr 9–18 Uhr.
  - B) StrickKurs — Anfängerkurs Stricken für Erwachsene, Do 18–20 Uhr, Wolle inklusive.
  - C) Glanzweg — Pflege und Reinigung von Fenstern und Büro, Sa 10–14 Uhr nach Absprache.
  - D) ZeitFix — Wir reparieren Armbanduhren und wechseln Batterien, Werkstatt zentral, Mo–Fr.
  - E) ReißFix — Wir reparieren defekte Reißverschlüsse an Jacken und Taschen, Abgabe Di–Sa.
  - F) TragHilfe — Wir packen bei Ihrem Umzug an, auch sonntags, ab 40 Euro pro Stunde.
  - G) Tierpension — Pflege Ihres Hundes im Urlaub, großer Garten, 18 Euro pro Tag.
  - H) NähKurs — Anfängerkurs Nähen mit der Maschine, Di 17–19 Uhr, Stoffe werden gestellt.
  - I) SchnittKurs — Anfängerkurs Schneidern eigener Kleidung, Sa 10–13 Uhr, kleine Gruppen.
  - J) WohnVermitt — Wir vermitteln kleine Wohnungen in zentraler Lage, faire Provision.
- **explanation:** NähKurs lehrt Nähen.

### 19. batches/generated/lesen-t3-auto-yzcwhp.json — gen-q-3-0v55oi-6

- **declarada:** a → **inferida:** d (LLM)
- **motivo:** Ben sucht einen Kurs zum Anfertigen eigener Hosen. NähKurs (D) lehrt Nähen mit der Maschine, was zum Anfertigen von Kleidung passt. SchnittKurs (A) lehrt Schneidern, nicht Nähen.
- **pregunta:** Ben träumt davon, sich eigene Hosen anzufertigen, und sucht einen Kurs dafür.
- **opciones:**
  - A) SchnittKurs — Anfängerkurs Schneidern eigener Kleidung, Sa 10–13 Uhr, kleine Gruppen.
  - B) ZeitFix — Wir reparieren Armbanduhren und wechseln Batterien, Werkstatt zentral, Mo–Fr.
  - C) WohnVermitt — Wir vermitteln kleine Wohnungen in zentraler Lage, faire Provision.
  - D) NähKurs — Anfängerkurs Nähen mit der Maschine, Di 17–19 Uhr, Stoffe werden gestellt.
  - E) SohlenStark — Wir reparieren Schuhe und Stiefel, neue Sohlen und Absätze, Mo–Fr 9–18 Uhr.
  - F) TragHilfe — Wir packen bei Ihrem Umzug an, auch sonntags, ab 40 Euro pro Stunde.
  - G) StrickKurs — Anfängerkurs Stricken für Erwachsene, Do 18–20 Uhr, Wolle inklusive.
  - H) Glanzweg — Pflege und Reinigung von Fenstern und Büro, Sa 10–14 Uhr nach Absprache.
  - I) Tierpension — Pflege Ihres Hundes im Urlaub, großer Garten, 18 Euro pro Tag.
  - J) ReißFix — Wir reparieren defekte Reißverschlüsse an Jacken und Taschen, Abgabe Di–Sa.
- **explanation:** SchnittKurs lehrt Schneidern.

### 20. batches/generated/lesen-t5-gemini-032.json — gen-q-5-ac9868b9-4

- **declarada:** a → **inferida:** b (LLM)
- **motivo:** Die Erklärung erwähnt Tauschbörsen, die im Passagetext nicht vorkommen. Der Text verbietet nur chemische Mittel und erwähnt Regenwassersammlung.
- **pregunta:** Welche Empfehlungen gibt es für Balkone/Gärten und die Gemeinschaft?
- **opciones:**
  - a) Chemische Pflanzenschutzmittel sind verboten, und es gibt regelmäßige Tauschbörsen.
  - b) Regenwasser darf nicht gesammelt werden, und Tauschbörsen sind Freiwillig.
  - c) Man soll chemische Mittel nutzen und wöchentlich Tauschbörsen Besuchen.
- **explanation:** Es ist verboten, chemische Pflanzenschutzmittel zu verwenden, und es gibt monatliche Tauschbörsen für die Bewohner.


JSONL: `dryrun-Q2-answerKeyCoherence-2026-07-10T06-21-34.jsonl`
JSON: `Q2-DRYRUN-REPORT.json`
