# Q3-B findings accionables (depurados) — 2026-07-10

Veredicto non_sequitur: **HOLD** (65% FP en muestra 20). Solo 7 non_sequitur confirmados REAL.
Otros ejes: entregados completos para corrección manual.

Total accionable: **92** · Held non_sequitur: **55**

## Confirmados REAL (non_sequitur muestra)

- **horen-t2-gemini-017.json** · `passage.text` · «Es ist uns wichtig, dass der Zugang zu Bildung für alle leicht und indirekte Hürden minimiert werden»
  - Oración agramatical: predicado roto. Debería ser «...dass der Zugang zu Bildung für alle leicht ist und indirekte Hürden minimiert werden» o «...dass der Zugang leicht gemacht wird und Hürden minimiert werden».
- **lesen-t2-gemini-055.json** · `passage.text` · «Ein neues Programm ist in Berlin eingetreten.»
  - El verbo 'eintreten' es incorrecto para lanzar/iniciar un programa. Debe ser 'eingeführt' o 'gestartet'.
- **lesen-t2-gemini-055.json** · `passage.text` · «das Gärtnern im freien Stress reduziert»
  - Orden de palabras roto/confuso. Debe ser 'das Gärtnern im Freien reduziert Stress' o 'das Gärtnern reduziert Stress im Freien'.
- **lesen-t3-auto-zspq8n.json** · `question` · «An Lenas Holzstuhl für die kleine ist ein Bein locker»
  - Frase incompleta/confusa: 'für die kleine' carece de sustantivo (debería ser 'für die Kleine' o 'für das Kind'). La construcción es agramatical en B1.
- **lesen-t5-gemini-015.json** · `passage.text` · «Sonntags und an Feiertagen ist die Ruhezeit ganztägig von 13:00 Uhr bis 15:00 Uhr für die Mittaglich»
  - La oración es confusa: dice que la Ruhezeit es 'ganztägig' (todo el día) pero luego especifica solo 13:00–15:00 Uhr. Además, 'Mittagliche Erholung' es un término forzado; debería ser 'Mittagsruhe' o simplemente 'Ruhe'.
- **lesen-t5-gemini-015.json** · `passage.text` · «Für private Feiern in Gemeinschaftsräumen muss zuerst ein Termin bei der Verwaltung in München verei»
  - La mención de 'München' es incongruente: la Hausordnung es para 'Wohnpark Sonnenblick' (ubicación no especificada). Añadir 'in München' rompe la coherencia del documento.
- **schreiben-gemini-010.json** · `question` · «Schlagen Sie einen Transport zu seinem Haus vor, falls Sie Hilfe benötigen.»
  - La instrucción es confusa: el contexto es que el vecino ofrece ayuda al usuario, pero se pide al usuario que proponga un transporte 'si necesita ayuda'. La lógica es invertida o poco clara en alemán B1.

## Otros ejes (manual)

### lexicon/wrong_lexeme (35)

- **horen-t2-gemini-001.json** · `passage.text` · «Ein klarer Akzent in der Aussprache»
  - «Akzent» es incorrecto en este contexto; debería ser «Aussprache» o «Tonfall». Akzent = acento regional/extranjero, no claridad de pronunciación.
- **horen-t2-gemini-001.json** · `passage.text` · «Gruppentreffen sollten ein klares Protokoll haben»
  - «Protokoll» es incorrecto; debería ser «Tagesordnung» o «Agenda». Protokoll = acta de reunión, no plan/orden del día.
- **horen-t2-gemini-003.json** · `explanation` · «Der Sprecher nennt laute Telefongespräche und ständiges Schauen auf das Handy in Gesellsch»
  - La explicación dice que la respuesta correcta es 'a)' (Hohe Kosten...), pero el texto del vortrag nunca menciona costos de tarifas. La respuesta correcta debería ser 'b)' (Smartphones werden auf eine Art benutzt, die and
- **horen-t2-gemini-008.json** · `passage.text` · «lernt neues und trifft nette Leute»
  - Falta mayúscula en 'neues' (sustantivo nominalizado); debería ser 'Neues'. Aunque es un error tipográfico menor, en B1 se espera corrección ortográfica.
- **horen-t2-gemini-009.json** · `passage.text` · «den eigenen Wortschatz zu verbessern»
  - Error ortográfico: 'verbessern' debería ser 'verbessern' (está escrito correctamente en el JSON, pero la forma correcta es 'verbessern' con 's' doble). Revisar: en realidad está bien escrito. Sin embargo, la colocación '
- **horen-t2-gemini-013.json** · `passage.text` · «Ein weiterer Aspekt ist der Konsum von Mobilität.»
  - La colocación 'Konsum von Mobilität' es antinatural en alemán B1. Debería ser 'Nutzung von Mobilität' o simplemente 'Mobilität'. 'Konsum' implica consumo de bienes/recursos, no de servicios de transporte.
- **horen-t2-gemini-013.json** · `passage.text` · «das Auto komplett zu verzichten»
  - Falta la preposición requerida por la colocación. Debe ser 'auf das Auto komplett verzichten' o 'das Auto komplett meiden'. La estructura 'verzichten + Akk.' sin 'auf' es agramatical.
- **horen-t2-gemini-015.json** · `passage.text` · «Das bedeutet, bei der Gestaltung von Grünflächen auf heimische Pflanzenarten zu setzen, di»
  - La mayúscula en 'Besser' es un error tipográfico (debería ser 'besser'), pero además la colocación 'angepasst sein an' es correcta, aunque aquí suena algo forzada; mejor sería 'die besser zu unserem Klima passen'.
- **horen-t2-gemini-016.json** · `passage.text` · «Heute ist die Differenzierung viel größer.»
  - 'Differenzierung' (diferenciación/distinción) es impreciso aquí; lo correcto sería 'Vielfalt' (variedad) o 'Auswahl' (oferta), que ya aparece después. 'Differenzierung' implica separación/clasificación, no abundancia de 
- **horen-t3-gemini-001.json** · `question` · «ein guter Umgang mit Klienten»
  - En el pasaje Lukas dice 'Kunden' (clientes), no 'Klienten' (que se refiere a clientes de servicios profesionales como abogados/psicólogos). La pregunta usa un sinónimo incorrecto en contexto.
- **horen-t3-gemini-002.json** · `passage.text` · «Er war schon festgefahren in seiner Meinung.»
  - Colocación poco natural: 'festgefahren' se usa típicamente para situaciones/conflictos, no para 'Meinung'. Lo correcto sería 'Er war in seiner Meinung festgefahren' o mejor 'Er war stur/unnachgiebig' o 'Er hielt stur an 
- **horen-t4-gemini-003.json** · `passage.text` · «natürlichen Reserven»
  - En contexto de sostenibilidad ambiental, 'Reserven' (reservas financieras/militares) es incorrecto. Debe ser 'Ressourcen' (recursos naturales).
- **horen-t4-gemini-003.json** · `passage.text` · «Protokoll über ihre Nachhaltigkeitsbemühungen veröffentlichen»
  - 'Protokoll' (acta de reunión) es incorrecto en este contexto. Debe ser 'Bericht' (informe/reporte de sostenibilidad).
- **horen-t4-gemini-007.json** · `passage.text` · «anstatt den Menschen das Auto komplett wegzunehmen»
  - Colocación incorrecta: 'das Auto wegzunehmen' es impreciso. Lo correcto es 'auf das Auto verzichten' o 'das Auto abschaffen'. 'Wegzunehmen' implica quitar algo a alguien de forma física/personal, no una política de movil
- **lesen-t1-gemini-075.json** · `passage.text` · «Dieser Kurs in Sachen Mobilität war für mich der beste Schritt»
  - «Kurs» es incorrecto en este contexto (significa 'curso educativo' o 'cotización'). Lo pretendido es «Schritt» (paso) o «Weg» (camino). La frase debería ser «Dieser Schritt in Sachen Mobilität» o simplemente omitir «Kurs
- **lesen-t1-gemini-095.json** · `passage.text` · «den die Organisation organisiert»
  - Repetición innecesaria de 'organisiert' (verbo) y 'Organisation' (sustantivo). Debería ser 'den der Verein anbietet' o 'den die Organisation anbietet'.
- **lesen-t1-gemini-113.json** · `passage.text` · «Ich konnte auch viel von den Erfahrungen der älteren Nachbarn profitieren»
  - La colocación correcta es 'von etwas profitieren' (beneficiarse de algo), pero aquí falta la preposición 'von'. Debería ser 'Ich konnte auch viel von den Erfahrungen der älteren Nachbarn profitieren' — aunque está presen
- **lesen-t1-gemini-126.json** · `explanation` · «Ein lokaler Verein hat ihr 'Anschluss gefunden' geholfen.»
  - La colocación es incorrecta: 'Anschluss finden' (encontrar conexión) no se combina con 'geholfen'. Debería ser 'hat ihr geholfen, Anschluss zu finden' o simplemente 'hat ihr Anschluss ermöglicht'.
- **lesen-t1-gemini-127.json** · `passage.text` · «manchmal spricht er mit einem leichten Akzent, was ich interessant finde»
  - En contexto de 'claridad de pronunciación', 'Akzent' es incorrecto. Debería ser 'Aussprache' o 'Tonfall'. Akzent = acento regional/extranjero, no describe cómo alguien habla de manera interesante.
- **lesen-t1-gemini-135.json** · `passage.text` · «auf die Stilistik geachtet, damit er gut lesbar ist»
  - La colocación 'auf Stilistik achten' es antinatural; debería ser 'auf den Stil achten' o 'auf gute Lesbarkeit achten' para expresar 'cuidar la comprensibilidad'.
- **lesen-t1-gemini-165.json** · `passage.text` · «um besser zu verstehen, wie ich Technik sinnvoll nutzen kann»
  - Colocación correcta pero el verbo 'nutzen' se repite muy frecuentemente en el pasaje (líneas 1, 3, 5); debería variar con 'einsetzen' o 'verwenden' para mayor naturalidad.
- **lesen-t2-gemini-096.json** · `passage.text` · «Ziel ist es, die Lebensqualität zu verbessern»
  - Typo: 'verbessern' debería ser 'verbessern' (aunque está escrito así en el JSON, la forma correcta es 'verbessern' con una sola 's' en la raíz: 'verbessern' es incorrecto; la forma correcta es 'verbessern' o mejor aún 'v
- **lesen-t2-gemini-097.json** · `passage.text` · «der Lärmpegel des Alltags manchmal dazu führt, dass die Kommunikation in Familien schlecht»
  - «Lärmpegel» (nivel de ruido literal) es incorrecto en contexto de comunicación familiar; se pretende «Stress» o «Hektik» (ritmo/estrés del día a día).
- **lesen-t4-gemini-016.json** · `passage.text` · «um Plastikmüll zu reduzieren und das Recycling zu verbessern»
  - «verbessern» es incorrecto; la forma correcta es «verbessern» (sin la 'n' final). Sin embargo, el error real es que debería ser «zu verbessern» o mejor aún «zu fördern» (promover). La colocación natural sería «das Recycl
- **lesen-t4-gemini-017.json** · `signText` · «mehr Grün ist gut für die Energie in der Stadt»
  - «Energie» es incorrecto en este contexto; se pretende «Luftqualität» o «Klima». «Energie» significa energía física/eléctrica, no calidad ambiental.
- **lesen-t4-gemini-019.json** · `signText` · «Ein neues, teures Programm ist nicht nötig.»
  - En contexto de proyecto municipal/ambiental, 'Programm' es aceptable pero 'Projekt' sería más natural. Sin embargo, 'Programm' no es incorrecto en B1; es simplemente menos preciso que 'Projekt'.
- **lesen-t5-gemini-022.json** · `passage.text` · «Bitte verwenden Sie keine Chemischen Schädlingsbekämpfungsmittel.»
  - La mayúscula en 'Chemischen' es incorrecta; en alemán los adjetivos no se capitalizan. Debería ser 'keine chemischen Schädlingsbekämpfungsmittel'.
- **lesen-t5-gemini-022.json** · `explanation` · «Die Ladestationen für E-Bikes befinden sich im Keller und können täglich von 6 bis 22 Uhr »
  - La explicación dice 'täglich von 6 bis 22 Uhr' pero la opción correcta (a) dice 'aber nicht die ganze Nacht', lo que implica limitación. La explicación debería enfatizar que NO es 24/7, no solo repetir el horario.
- **lesen-t5-gemini-028.json** · `question` · «Was ist richtig bezüglich der Entsorgung von Wertstoffen?»
  - La pregunta pregunta por 'Wertstoffe' (materiales valiosos/reciclables), pero el pasaje trata de 'Abfall' (residuos) en general. Wertstoffe es semánticamente cercano pero no es el término usado en el texto; debería ser '
- **lesen-t5-gemini-030.json** · `passage.text` · «um den Naturschutz zu unterstützen»
  - Colocación incorrecta; 'Naturschutz unterstützen' es antinatural. Lo correcto sería 'um die Natur zu schützen' o 'um Wasser zu sparen' (el motivo real).
- **lesen-t5-gemini-053.json** · `option` · «das parken wird nach drei Stunden kostenpflichtig»
  - Falta el artículo: debería ser 'das Parken' (sustantivo, requiere mayúscula y artículo). Además, 'parken' en minúscula es verbo infinitivo, no sustantivo.
- **lesen-t5-gemini-064.json** · `passage.text` · «Das Trinken von Wasser aus verschließbaren Flaschen ist an den Arbeitsplätzen erlaubt.»
  - Colocación antinatural: 'Das Trinken von Wasser' es muy formal/administrativo para B1. Lo natural sería 'Wasser aus verschließbaren Flaschen trinken' o simplemente 'Wasser trinken'.
- **lesen-t5-gemini-070.json** · `passage.text` · «Kinder unter sechs Jahren essen in Begleitung eines Zahlenden Erwachsenen kostenlos.»
  - La explicación de la pregunta 3 dice 'Kleinkinder bis fünf Jahre' pero el pasaje dice 'unter sechs Jahren' (menores de seis años). Hay inconsistencia entre el texto y la explicación.
- **lesen-t5-gemini-071.json** · `explanation` · «Man muss dann eine Gebühr von 10 Euro bezahlen, um es wiederzubekommen.»
  - El verbo 'wiederzubekommen' es incorrecto en este contexto; debería ser 'abholen' (recoger) o 'zurückbekommen' (recuperar). 'Wiederzubekommen' implica recibir algo nuevamente después de haberlo tenido antes, no recuperar
- **sprechen-gemini-006.json** · `question` · «eine gute Reserve für die Zukunft aufzubauen»
  - En contexto de negocio/tienda, 'Reserve' (reserva financiera/militar) es impreciso; debería ser 'Rücklagen' o 'finanzielle Rücklagen' (fondos de reserva empresarial).

### naturalness/forced_vocab (16)

- **horen-t2-gemini-009.json** · `explanation` · «Der Sprecher sagt, dass solche Aktivitäten 'Spaß machen' und 'sehr produktiver sein' könne»
  - La explicación parafrasea correctamente, pero la opción c) combina dos ideas (Spaß + produktiver) que en el pasaje están en la misma oración; la pregunta debería ser más clara sobre cuál es el énfasis principal.
- **horen-t2-gemini-020.json** · `passage.text` · «Sie sind nicht nur Konsumentin von Wissen, sondern auch Gestalterin Ihrer eigenen Zukunft.»
  - El uso de 'Konsumentin von Wissen' es forzado y poco natural en este contexto educativo; debería ser 'Konsument/in von Wissen' o simplemente omitirse en favor de una formulación más directa como 'Sie gestalten Ihre Zukun
- **horen-t2-gemini-021.json** · `passage.text` · «Die Begabung zur Anpassung an neue Mobilitätskonzepte ist eine Fähigkeit, die wir entwicke»
  - «Begabung» (talento innato) es semánticamente incorrecto en este contexto; debería ser «Fähigkeit» (capacidad/habilidad). El uso de «Begabung» suena forzado y antinatural en un discurso sobre movilidad urbana.
- **horen-t2-gemini-023.json** · `passage.text` · «kleine Vorräte für unterwegs einzupacken, besonders wenn man abgelegene Orte besucht»
  - En contexto de viaje turístico B1, 'Vorräte' (provisiones/reservas militares) es forzado; lo natural sería 'Proviant', 'Snacks' o 'Lebensmittel' para comida/bebida de viaje.
- **lesen-t1-gemini-082.json** · `passage.text` · «Ich wollte meine Kochkünste verbessern»
  - El verbo 'verbessern' es correcto pero poco natural en este contexto; lo estándar sería 'verbessern' (mejorar) o mejor aún 'meine Kochfähigkeiten/Kochkenntnisse verbessern'. 'Kochkünste' es algo forzado/literario para B1
- **lesen-t1-gemini-099.json** · `passage.text` · «Diese Erfahrungen sind groß für mich.»
  - El adjetivo 'groß' (grande) es incorrecto en este contexto; debería ser 'bedeutsam', 'wichtig' o 'wertvoll' para expresar que las experiencias son significativas.
- **lesen-t1-gemini-119.json** · `passage.text` · «Ich lerne jeden Tag etwas neues»
  - Falta mayúscula: 'etwas Neues' (sustantivo nominalizado requiere mayúscula en alemán).
- **lesen-t1-gemini-121.json** · `passage.text` · «Keine Gruppe hat hier eine Hegemonie; alle Meinungen zählen»
  - El término 'Hegemonie' es demasiado académico/político para un relato personal sobre experiencias en un club de voleibol; rompe el registro conversacional del texto.
- **lesen-t1-gemini-122.json** · `passage.text` · «Ich habe das Gefühl, dass meine Arbeit einen Positiven Beitrag leistet.»
  - Mayúscula innecesaria en 'Positiven' (adjetivo en acusativo no requiere mayúscula). Además, la construcción 'einen Beitrag leisten' es correcta, pero la repetición de 'Gefühl' en párrafos cercanos es redundante.
- **lesen-t1-gemini-126.json** · `passage.text` · «Mein neues Home ist gemütlicher»
  - Uso de 'Home' (anglicismo) en lugar del término natural alemán 'Wohnung' o 'Zuhause' en contexto B1 de narrativa personal sobre mudanza.
- **lesen-t1-gemini-130.json** · `passage.text` · «Darüber bin ich besonders froh, weil ich so meine Woche präzise planen kann.»
  - El adverbio 'präzise' (preciso/exacto) es demasiado formal/técnico para un relato personal sobre voluntariado. Sería más natural 'gut' o 'besser'.
- **lesen-t1-gemini-136.json** · `passage.text` · «Diese Reflexion über meine eigenen Fähigkeiten und die Freude am Helfen verbessern»
  - El verbo 'verbessern' (mejorar algo externo) es incorrecto aquí; debería ser 'verbessert' (3ª persona singular) o mejor aún 'trägt bei zu' / 'fördert' (contribuye a). La sintaxis es confusa.
- **lesen-t1-gemini-138.json** · `passage.text` · «eine wunderbare Freizeitbeschäftigung und ein schönes Hobby»
  - La redundancia 'Freizeitbeschäftigung und Hobby' es innecesaria; ambos términos significan prácticamente lo mismo en este contexto.
- **lesen-t1-gemini-144.json** · `passage.text` · «Diese Tätigkeit bringt mich im Leben vorne»
  - Expresión forzada/poco natural en alemán; lo correcto sería 'bringt mich voran' o 'hilft mir voranzukommen'.
- **lesen-t2-gemini-097.json** · `passage.text` · «der Lärmpegel des Alltags manchmal dazu führt, dass die Kommunikation in Familien schlecht»
  - Expresión antinatural: «Lärmpegel des Alltags» es una metáfora forzada y poco clara para B1; debería ser directo: «der Stress/die Hektik des Alltags».
- **lesen-t5-gemini-015.json** · `passage.text` · «Eine korrekte Mülltrennung ist ein Wunderbarer Beitrag zum Umweltschutz.»
  - 'Wunderbarer' (maravilloso) es un adjetivo emotivo y poco natural en una Hausordnung formal. Debería ser 'wichtiger' o 'wesentlicher'.

### naturalness/register_break (26)

- **horen-t2-gemini-009.json** · `passage.text` · «Kultur ist keine feste Sache, sie entwickelt sich ständig weiter und lebt von unserer Teil»
  - La metáfora 'Kultur lebt' es aceptable en B1, pero la frase anterior 'keine feste Sache' es algo coloquial para un tono de conferencia formal; podría ser 'nicht statisch' o 'nicht unveränderlich'.
- **horen-t3-gemini-004.json** · `passage.text` · «Es hat einen ziemlich postkolonialen Ansatz»
  - El término 'postkolonialer Ansatz' es académico/especializado para un diálogo casual entre amigos sobre una exposición; en B1 conversacional sería más natural 'kritischer Blick auf die Kolonialzeit' o simplemente 'intere
- **horen-t3-gemini-004.json** · `passage.text` · «Die Stilistik der Präsentation soll auch sehr modern sein»
  - El término 'Stilistik' es muy formal/académico para una conversación casual; sería más natural 'Die Gestaltung' o 'Die Präsentation' (que ya aparece después).
- **horen-t3-gemini-004.json** · `passage.text` · «Das wird tiefgründig.»
  - Uso de 'tiefgründig' (profundo/de gran calado) es poco natural en este contexto; sería más apropiado 'Das wird interessant/spannend' o 'Das wird sehr informativ'.
- **horen-t4-gemini-010.json** · `passage.text` · «Man muss nicht immer etwas "Erreichen".»
  - Las comillas alrededor de 'Erreichen' son innecesarias y rompen la naturalidad del diálogo. Omar está parafraseando el concepto de Zara, no citando literalmente, por lo que las comillas son inapropiadas.
- **horen-t4-gemini-011.json** · `passage.text` · «Ein Interessanter Aspekt.»
  - Mayúscula innecesaria en 'Interessanter' (debería ser 'Ein interessanter Aspekt'). Aunque técnicamente es un error de ortografía, afecta la naturalidad del registro formal de una discusión profesional.
- **horen-t4-gemini-012.json** · `passage.text` · «Manchmal ist das Marketing wichtiger als das Produkt selbst.»
  - El tono de esta frase es demasiado crítico/cínico para Lukas, quien hasta ese momento defiende los beneficios del patrocinio empresarial; rompe la coherencia de su posición.
- **lesen-t1-gemini-090.json** · `passage.text` · «mein Wohlbefinden deutlich verbessert»
  - Uso de 'verbessert' (mejorado) para 'Wohlbefinden' (bienestar) es correcto pero suena algo formal/administrativo en un relato personal de ocio; 'verbessert sich' sería más natural.
- **lesen-t1-gemini-117.json** · `passage.text` · «Meine These ist, dass jeder etwas gutes tun kann, wenn er nur will.»
  - El uso de 'These' (tesis/hipótesis) es demasiado formal y académico para un relato personal sobre voluntariado; sería más natural 'Meine Überzeugung ist' o 'Ich glaube'.
- **lesen-t1-gemini-122.json** · `passage.text` · «die anderen Bewohner, die auch mitmachen»
  - En contexto de voluntariado en biblioteca, 'Bewohner' (habitantes/residentes) es incorrecto; debería ser 'Freiwillige' o 'Kollegen'. Bewohner implica personas que viven en un lugar, no voluntarios.
- **lesen-t1-gemini-125.json** · `passage.text` · «Meine Einstellung zu umweltfragen hat sich in den letzten Jahren stark verändert.»
  - Falta mayúscula en 'umweltfragen' (debe ser 'Umweltfragen'). Aunque es un error tipográfico menor, afecta la naturalidad del texto.
- **lesen-t1-gemini-126.json** · `passage.text` · «Am Wochenende helfe ich oft im Gemeinschaftsgarten mit, der nicht weit von meiner Arbeit e»
  - Salto temático sin transición: se introduce 'Arbeit' (trabajo) sin contexto previo; el pasaje no menciona dónde trabaja la autora.
- **lesen-t1-gemini-135.json** · `passage.text` · «Diese Erfahrung hat mein bisheriges Paradigma, wie man Probleme in der Stadt gemeinsam lös»
  - El término 'Paradigma' es demasiado formal/académico para un relato personal B1 sobre voluntariado comunitario; rompe el registro conversacional del texto.
- **lesen-t1-gemini-135.json** · `passage.text` · «Ich habe auch einen kleinen Bericht über unsere Arbeit geschrieben und dabei besonders auf»
  - El término 'Stilistik' (estilística/análisis de estilo) es demasiado técnico/académico; en contexto B1 sería más natural 'auf den Stil' o simplemente 'darauf geachtet, dass er gut geschrieben ist'.
- **lesen-t1-gemini-136.json** · `passage.text` · «Früher habe ich meine freie Zeit oft damit verbracht, einfach nur Filme zu konsumieren.»
  - El verbo 'konsumieren' (consumir) es demasiado formal/técnico para el contexto de ver películas en tiempo libre. Lo natural sería 'schauen', 'anschauen' o 'gucken'.
- **lesen-t1-gemini-137.json** · `passage.text` · «Manchmal sprechen wir auch über Grammatik, was sehr praktisch ist.»
  - Comentario meta-lingüístico sobre gramática fuera de lugar en un relato personal sobre voluntariado en un parque; rompe la naturalidad del registro conversacional.
- **lesen-t1-gemini-138.json** · `passage.text` · «die alten Pflanzenbestände im Garten erneuern»
  - El término 'Pflanzenbestände' (existencias/stocks de plantas) es demasiado formal/comercial para un contexto de jardinería comunitaria casual; 'alte Pflanzen' o 'Bepflanzung' sería más natural.
- **lesen-t1-gemini-139.json** · `passage.text` · «Besonders spannend finde ich die Unterschiedlichen Geschichten»
  - Mayúscula innecesaria en 'Unterschiedlichen' (adjetivo en posición de atributo no requiere mayúscula en alemán moderno B1).
- **lesen-t1-gemini-155.json** · `passage.text` · «Ich habe auch gelernt, Höflich zu mir selbst zu sein»
  - Mayúscula incorrecta en 'Höflich' (adjetivo predicativo no debe capitalizarse). Debería ser 'höflich'.
- **lesen-t2-gemini-055.json** · `passage.text` · «ihre Umgebung zu verbessern»
  - Typo/error ortográfico: 'verbessern' debe ser 'verbessern' (está escrito 'verbessern' pero falta la 's' correcta). Debería ser 'verbessern'.
- **lesen-t4-gemini-002.json** · `signText` · «Ich finde es gesellschaftskritisch, dass man nur über Gärten spricht.»
  - El término 'gesellschaftskritisch' (crítica social/sociológica) es demasiado formal y académico para un foro de opinión ciudadana sobre un jardín comunitario; rompe el registro conversacional B1 del resto de las opinione
- **lesen-t4-gemini-016.json** · `signText` · «Ohne Plastikverpackungen werden viele Produkte schnell schlecht. Das ist ein großes Proble»
  - «Das ist ein großes Problem für die Lebensmittel» es impreciso; debería ser «für die Haltbarkeit von Lebensmitteln» o «für die Lebensmittelversorgung». La formulación actual es poco natural.
- **lesen-t5-gemini-027.json** · `passage.text` · «Im Gemeinschaftsgarten dürfen keine Chemischen Pflanzenschutzmittel verwendet werden.»
  - La mayúscula en 'Chemischen' es incorrecta; debería ser 'chemischen' (adjetivo en minúscula). Aunque es un error tipográfico menor, rompe la naturalidad del registro formal.
- **lesen-t5-gemini-030.json** · `passage.text` · «Ruhezeiten: Laute Arbeiten oder Partys sind nach 22:00 Uhr und vor 7:00 Uhr nicht gestatte»
  - Inconsistencia lógica: si las Ruhezeiten ya prohíben actividades ruidosas de 22:00 a 7:00, la mención de 'Am Sonntag gilt die Ruhezeit den ganzen Tag' es redundante y confusa (¿solo el domingo o todos los días?).
- **lesen-t5-gemini-034.json** · `passage.text` · «Nutzen Sie Fahrräder für kurze Wege, um Abgase zu vermeiden.»
  - La frase mezcla registro formal (imperativo de cortesía) con una justificación ambiental que suena forzada para un reglamento de vivienda; 'Abgase vermeiden' es más típico de campañas de sostenibilidad que de normas inte
- **lesen-t5-gemini-057.json** · `passage.text` · «zum Beispiel nach einem wichtigen Arztbesuch»
  - La frase 'nach einem wichtigen Arztbesuch' como justificación de dietas especiales es vaga y poco natural; debería ser 'auf ärztliche Anweisung' o 'auf Empfehlung des Arztes'.

### quote_fidelity/fabricated_quote (8)

- **horen-t2-gemini-003.json** · `correct` · «correct: 'a'»
  - La opción 'a)' (Hohe Kosten für Smartphone-Datentarife) nunca aparece en el vortrag. El pasaje no menciona costos ni tarifas. El campo 'correct' apunta a una opción que no tiene base en el texto.
- **horen-t3-gemini-003.json** · `explanation` · «Ich werde es mal probieren.»
  - Max nunca dice 'Ich werde es mal probieren.' en el diálogo. Solo dice 'Vielleicht mache ich das nächstes Wochenende.' La explanation inventa una cita literal que no existe.
- **horen-t4-gemini-010.json** · `explanation` · «Der Moderator fasst am Ende zusammen, dass es nicht den einen richtigen Weg gibt und jeder»
  - La explicación atribuye al Moderador una conclusión que nunca expresó. El Moderador solo dice 'Es geht darum, eine Balance zu finden' (Zara) y 'Und sich nicht unter Druck zu setzen' (Omar). No hay resumen moderador sobre
- **horen-t4-gemini-011.json** · `explanation` · «Der Moderator fasst am Ende die Meinungen zusammen, dass beide Flexibilität befürworten»
  - La explicación afirma que el moderador resume que 'ambos favorecen la flexibilidad', pero Tim nunca dice explícitamente que apoye la flexibilidad. Tim solo dice 'Ich bin für Flexibilität' al final, pero esto no es una sí
- **horen-t4-gemini-013.json** · `explanation` · «Der Moderator fragt Felix direkt nach seiner Meinung zur Rolle der Eltern»
  - La explicación afirma que el Moderador pregunta sobre el rol de los padres, pero la respuesta correcta es 'a) Moderator'. Sin embargo, en el pasaje, Felix (no el Moderador) es quien responde extensamente sobre el rol de 
- **horen-t4-gemini-013.json** · `explanation` · «Der Moderator leitet das Ende der Sendung ein und bittet die Gäste um ihr Fazit.»
  - La explicación describe una acción del Moderador, pero la pregunta pide identificar quién expresa una posición. El Moderator solo formula la pregunta; tanto Felix como Aylin proporcionan sus conclusiones (Fazit). La resp
- **lesen-t4-gemini-016.json** · `explanation` · «Sofia unterstützt die Idee der Plastikreduzierung, hat aber Bedenken bezüglich der Komplex»
  - La explanation afirma que Sofia tiene «Bedenken bezüglich der Komplexität der Mülltrennung», pero en el signText Sofia dice «die Mülltrennung ist schon jetzt kompliziert» (ya es complicada ahora), no que sea compleja en 
- **lesen-t5-gemini-036.json** · `explanation` · «von sechs Uhr morgens bis zehn Uhr abends»
  - La explicación dice '10 Uhr abends' pero el pasaje dice claramente '22:00 Uhr' (10 PM = 22:00, no 10:00). Cita fabricada/inexacta.

## Held non_sequitur (no corregir aún)

55 findings retenidos hasta prompt v1.3. Ver Q3B-NONSEQUITUR-AUDIT-2026-07-10.md.

- **horen-t2-gemini-005.json** · «Viele haben Vorräte an Ausreden, warum sie keinen Sport machen können.»
- **horen-t2-gemini-007.json** · «Manchmal entstehen auch Kommunikationsfehler, wenn wir über Konsumgewohnheiten s»
- **horen-t2-gemini-008.json** · «Vielleicht inspiriert Sie unser kleines Logo auf den Informationsflyern»
- **horen-t2-gemini-009.json** · «Solche Aktivitäten machen nicht nur Spaß, sondern können auch sehr produktiver s»
- **horen-t2-gemini-010.json** · «Es ist wichtig, dass wir aktiv daran werben, dass sich jeder in seiner Stadt zu »
- **horen-t2-gemini-010.json** · «Manchmal gehen uns die kleinen Dinge im Alltag entgangen»
- **horen-t2-gemini-015.json** · «Ein weiterer wichtiger Punkt sind die Inhalte unserer täglichen Entscheidungen.»
- **horen-t2-gemini-016.json** · «Das eigene Home kann ein Ort der Ruhe sein, fernab vom Bildschirm.»
- **horen-t2-gemini-021.json** · «Manchmal wühlen wir uns unnötig durch den Stadtverkehr, obwohl es einfachere Weg»
- **horen-t3-gemini-002.json** · «Eine gute Argumentation ist da wichtig.»
- **horen-t4-gemini-010.json** · «Viele suchen Aktivitäten, die eine gewisse Bekanntheit erlangt haben, weil sie Q»
- **horen-t4-gemini-010.json** · «Welche Indirekte Wirkung hat unsere Freizeitgestaltung auf unser Berufsleben?»
- **horen-t4-gemini-011.json** · «Das führt schnell zu einer Reklamation.»
- **horen-t4-gemini-011.json** · «Jonas, wie kann man die Teamkommunikation in einem Solchen Modell sicherstellen?»
- **horen-t4-gemini-012.json** · «Manchmal ist das Marketing wichtiger als das Produkt selbst.»
- **horen-t4-gemini-013.json** · «Am Ende der Diskussion wird nach einem Resümee gefragt.»
- **lesen-t1-gemini-075.json** · «Es gibt oft ein Programm mit Infoveranstaltungen zu diesem Thema»
- **lesen-t1-gemini-090.json** · «Ich besuche derzeit keinen anderen Kurs, sondern lerne direkt in der Gruppe»
- **lesen-t1-gemini-095.json** · «Wir Bewohner der Siedlung treffen uns danach oft auf einen Kaffee.»
- **lesen-t1-gemini-099.json** · «Ich habe keine Schwäche für Langeweile mehr»
- **lesen-t1-gemini-099.json** · «meine Tage waren nur mal so, mal so»
- **lesen-t1-gemini-099.json** · «Es gibt keine Warteliste für Ehrenamtliche.»
- **lesen-t1-gemini-113.json** · «Das fand ich eine tolle Entscheidung für meine Freizeit.»
- **lesen-t1-gemini-119.json** · «Die Stadt ist viel größer als mein Alter Wohnort»
- **lesen-t1-gemini-119.json** · «Ich kann diese Stadt jedem empfehlen, der etwas neues erleben möchte.»
- **lesen-t1-gemini-122.json** · «Es ist eine regionale Initiative, die den Menschen in der Stadt hilft. Mein pers»
- **lesen-t1-gemini-125.json** · «Schon lange war ich beschaeftigt mit dem Gedanken, etwas Sinnvolles in meiner Fr»
- **lesen-t1-gemini-125.json** · «Manchmal gibt es kleine Details, die man erst durch die Arbeit vor Ort versteht,»
- **lesen-t1-gemini-126.json** · «ich versuche, einen kleinen Rückschritt zu machen und bewusster zu leben»
- **lesen-t1-gemini-130.json** · «Zum Beispiel war ich letztes Mal mit einer Gruppe im Museum.»
- **lesen-t1-gemini-136.json** · «topicTag: 'Technik' pero el texto trata sobre voluntariado social»
- **lesen-t1-gemini-137.json** · «Meine Deutschkenntnisse haben sich auch verbessert, besonders durch unseren info»
- **lesen-t1-gemini-139.json** · «Wir treffen uns regelmaessigen Abständen»
- **lesen-t1-gemini-139.json** · «Kuenftig möchte ich auch andere Bewohner»
- **lesen-t1-gemini-140.json** · «Die Bearbeitung der Anfragen von neuen Freiwilligen und auch die Planung unserer»
- **lesen-t1-gemini-143.json** · «Meine alte Heimat hatte eine große Bekanntheit für ihre lebendige Gemeinschaft»
- **lesen-t1-gemini-144.json** · «Ich merke, wie ich wieder mehr Energie habe, obwohl ich oft müde bin nach der no»
- **lesen-t1-gemini-144.json** · «Sie wollte ihre Freizeit sinnvoll nutzen und etwas neues lernen, was eine bewuss»
- **lesen-t1-gemini-149.json** · «Manchmal erzähle ich ihr von meinen Erfahrungen in der Arbeit und sie von früher»
- **lesen-t1-gemini-155.json** · «Ich koche zu Hause und versuche, nur frische und reine Zutaten zu verwenden. Das»
- **lesen-t1-gemini-165.json** · «Meine Nachbarn haben auch Interesse gezeigt, als ich ihnen von meinen Veränderun»
- **lesen-t2-gemini-096.json** · «Ein einfaches Programm zur Überprüfung des eigenen Verbrauchs kann helfen, Frist»
- **lesen-t3-auto-ma7vt8.json** · «Der Schüler Jan will sein Spanisch vor einem Test verbessern.»
- **lesen-t3-auto-yulvio.json** · «Lenas Verbindung ins Internet bricht ab, weil ein Kästchen defekt scheint.»
- **lesen-t4-gemini-016.json** · «Viele Bewohner finden, dass der Klimawandel und Naturschutz wichtige Themen sind»
- **lesen-t4-gemini-017.json** · «Man muss beides gut planen. Insgesamt finde ich die Idee aber gut für die Umwelt»
- **lesen-t4-gemini-019.json** · «Das Ziel ist, die Nachhaltigkeit und die lokale Umwelt zu verbessern.»
- **lesen-t4-gemini-019.json** · «Das Recycling-System muss auch verbessert werden. Ich finde den Vorschlag sehr g»
- **lesen-t5-gemini-022.json** · «um unnötige Kosten zu vermeiden und Naturschutz zu fördern»
- **lesen-t5-gemini-028.json** · «Laut den Regeln erfolgt die Abholung der Gelben Tonne alle zwei Wochen und Glasf»
- **lesen-t5-gemini-030.json** · «Falsche Trennung kann kosten Verursachen.»
- **lesen-t5-gemini-034.json** · «Diese Regeln helfen uns allen, die Umwelt zu schützen und ein gutes Zusammenlebe»
- **lesen-t5-gemini-053.json** · «Was ist im Schwimmbad und im Fitnessbereich für die Hygiene wichtig?»
- **lesen-t5-gemini-057.json** · «Bei einer Beschwerde über die Qualität des Essens wenden Sie sich bitte direkt a»
- **lesen-t5-gemini-070.json** · «Wenn ein Erwachsener ein Kleinkind bis fünf Jahre begleitet und bezahlt, ist das»
