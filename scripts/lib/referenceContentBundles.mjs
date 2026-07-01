const VALID_TYPES = new Set(["vocabulary", "phrases"]);
const PUBLISHED_LEVELS = new Set(["A2", "B1"]);
const STUB_LEVELS = new Set(["A1", "B2", "C1", "C2"]);
const VALID_META = new Set(["en", "es"]);

const PUBLISHED_DATA = {
  vocabulary: {
    A2: {
      title: {
        en: "German A2 Vocabulary Reference Bundle",
        es: "Paquete de referencia de vocabulario de aleman A2",
      },
      scope: {
        en: "Core Goethe A2 vocabulary for everyday communication in common private and public situations. Includes practical nouns, verbs, and expressions with simple model sentences in German.",
        es: "Vocabulario central de Goethe A2 para la comunicacion cotidiana en situaciones privadas y publicas frecuentes. Incluye sustantivos, verbos y expresiones practicas con oraciones modelo sencillas en aleman.",
      },
      sections: [
        {
          id: "familie",
          title: { en: "Family", es: "Familia" },
          items: [
            {
              word: "die Eltern",
              translation: { en: "parents", es: "padres" },
              example: "Meine Eltern wohnen in einer kleinen Stadt.",
              category: "family members",
            },
            {
              word: "der Bruder",
              translation: { en: "brother", es: "hermano" },
              example: "Mein Bruder studiert in Berlin.",
              category: "family members",
            },
            {
              word: "die Schwester",
              translation: { en: "sister", es: "hermana" },
              example: "Meine Schwester spielt gern Tennis.",
              category: "family members",
            },
            {
              word: "der Sohn",
              translation: { en: "son", es: "hijo" },
              example: "Ihr Sohn geht schon in die Schule.",
              category: "family members",
            },
            {
              word: "die Tochter",
              translation: { en: "daughter", es: "hija" },
              example: "Unsere Tochter malt sehr gern.",
              category: "family members",
            },
            {
              word: "verheiratet",
              translation: { en: "married", es: "casado/a" },
              example: "Meine Tante ist seit zehn Jahren verheiratet.",
              category: "relationships",
            },
            {
              word: "ledig",
              translation: { en: "single", es: "soltero/a" },
              example: "Er ist noch ledig und wohnt allein.",
              category: "relationships",
            },
            {
              word: "sich verstehen",
              translation: { en: "to get along", es: "llevarse bien" },
              example: "Ich verstehe mich gut mit meiner Cousine.",
              category: "family life",
            },
          ],
        },
        {
          id: "einkaufen",
          title: { en: "Shopping", es: "Compras" },
          items: [
            {
              word: "der Supermarkt",
              translation: { en: "supermarket", es: "supermercado" },
              example: "Wir kaufen im Supermarkt Obst und Brot.",
              category: "places",
            },
            {
              word: "das Angebot",
              translation: { en: "special offer", es: "oferta" },
              example: "Heute gibt es ein gutes Angebot fuer Kaese.",
              category: "shopping terms",
            },
            {
              word: "die Kasse",
              translation: { en: "checkout", es: "caja" },
              example: "An der Kasse muss ich kurz warten.",
              category: "shopping terms",
            },
            {
              word: "bar bezahlen",
              translation: { en: "to pay in cash", es: "pagar en efectivo" },
              example: "Kann ich bar bezahlen oder nur mit Karte?",
              category: "payment",
            },
            {
              word: "die Rechnung",
              translation: { en: "bill", es: "cuenta" },
              example: "Entschuldigung, ich moechte bitte die Rechnung.",
              category: "payment",
            },
            {
              word: "umtauschen",
              translation: { en: "to exchange", es: "cambiar" },
              example: "Ich moechte die Hose umtauschen.",
              category: "customer service",
            },
            {
              word: "teuer",
              translation: { en: "expensive", es: "caro/a" },
              example: "Diese Jacke ist mir zu teuer.",
              category: "price",
            },
            {
              word: "guenstig",
              translation: { en: "affordable", es: "economico/a" },
              example: "Auf dem Markt ist das Gemuese guenstig.",
              category: "price",
            },
          ],
        },
        {
          id: "gesundheit",
          title: { en: "Health", es: "Salud" },
          items: [
            {
              word: "krank",
              translation: { en: "ill", es: "enfermo/a" },
              example: "Ich bin heute krank und bleibe zu Hause.",
              category: "symptoms",
            },
            {
              word: "der Arzt",
              translation: { en: "doctor", es: "medico" },
              example: "Morgen habe ich einen Termin beim Arzt.",
              category: "medical care",
            },
            {
              word: "die Apotheke",
              translation: { en: "pharmacy", es: "farmacia" },
              example: "Die Apotheke ist gleich um die Ecke.",
              category: "medical care",
            },
            {
              word: "das Medikament",
              translation: { en: "medicine", es: "medicamento" },
              example: "Dieses Medikament nehme ich zweimal am Tag.",
              category: "treatment",
            },
            {
              word: "Husten",
              translation: { en: "cough", es: "tos" },
              example: "Seit drei Tagen habe ich starken Husten.",
              category: "symptoms",
            },
            {
              word: "Fieber",
              translation: { en: "fever", es: "fiebre" },
              example: "Bei Fieber sollst du viel Wasser trinken.",
              category: "symptoms",
            },
            {
              word: "sich ausruhen",
              translation: { en: "to rest", es: "descansar" },
              example: "Am Wochenende will ich mich ausruhen.",
              category: "wellness",
            },
            {
              word: "gesund",
              translation: { en: "healthy", es: "saludable" },
              example: "Obst und Gemuese sind gesund.",
              category: "wellness",
            },
          ],
        },
        {
          id: "freizeit",
          title: { en: "Free Time", es: "Tiempo libre" },
          items: [
            {
              word: "das Hobby",
              translation: { en: "hobby", es: "aficion" },
              example: "Mein Hobby ist Fotografieren.",
              category: "activities",
            },
            {
              word: "spazieren gehen",
              translation: { en: "to go for a walk", es: "pasear" },
              example: "Am Abend gehe ich oft spazieren.",
              category: "activities",
            },
            {
              word: "das Kino",
              translation: { en: "cinema", es: "cine" },
              example: "Wir treffen uns heute im Kino.",
              category: "places",
            },
            {
              word: "das Schwimmbad",
              translation: { en: "swimming pool", es: "piscina" },
              example: "Im Sommer gehe ich ins Schwimmbad.",
              category: "places",
            },
            {
              word: "lesen",
              translation: { en: "to read", es: "leer" },
              example: "Am Wochenende lese ich gern Romane.",
              category: "activities",
            },
            {
              word: "Musik hoeren",
              translation: { en: "to listen to music", es: "escuchar musica" },
              example: "Beim Kochen hoere ich oft Musik.",
              category: "activities",
            },
            {
              word: "sich treffen",
              translation: { en: "to meet up", es: "quedar" },
              example: "Wir treffen uns am Samstag im Park.",
              category: "social life",
            },
            {
              word: "langweilig",
              translation: { en: "boring", es: "aburrido/a" },
              example: "Der Film war leider etwas langweilig.",
              category: "opinions",
            },
          ],
        },
        {
          id: "arbeit",
          title: { en: "Work", es: "Trabajo" },
          items: [
            {
              word: "der Beruf",
              translation: { en: "profession", es: "profesion" },
              example: "Welchen Beruf moechtest du lernen?",
              category: "career",
            },
            {
              word: "arbeiten",
              translation: { en: "to work", es: "trabajar" },
              example: "Ich arbeite von Montag bis Freitag.",
              category: "work routine",
            },
            {
              word: "der Chef",
              translation: { en: "boss", es: "jefe" },
              example: "Mein Chef ist heute nicht im Buero.",
              category: "people at work",
            },
            {
              word: "die Kollegin",
              translation: { en: "female colleague", es: "companera de trabajo" },
              example: "Meine Kollegin hilft mir oft.",
              category: "people at work",
            },
            {
              word: "die Pause",
              translation: { en: "break", es: "pausa" },
              example: "Um zwoelf Uhr machen wir Pause.",
              category: "work routine",
            },
            {
              word: "das Buero",
              translation: { en: "office", es: "oficina" },
              example: "Unser Buero ist im dritten Stock.",
              category: "workplace",
            },
            {
              word: "der Termin",
              translation: { en: "appointment", es: "cita" },
              example: "Ich habe morgen einen wichtigen Termin.",
              category: "planning",
            },
            {
              word: "frueh",
              translation: { en: "early", es: "temprano" },
              example: "Ich stehe frueh auf und fahre zur Arbeit.",
              category: "time at work",
            },
          ],
        },
        {
          id: "wohnen",
          title: { en: "Housing", es: "Vivienda" },
          items: [
            {
              word: "die Wohnung",
              translation: { en: "apartment", es: "apartamento" },
              example: "Unsere Wohnung hat drei Zimmer.",
              category: "home",
            },
            {
              word: "das Zimmer",
              translation: { en: "room", es: "habitacion" },
              example: "Mein Zimmer ist nicht sehr gross.",
              category: "home",
            },
            {
              word: "die Miete",
              translation: { en: "rent", es: "alquiler" },
              example: "Die Miete ist in der Innenstadt hoch.",
              category: "costs",
            },
            {
              word: "der Balkon",
              translation: { en: "balcony", es: "balcon" },
              example: "Auf dem Balkon stehen viele Blumen.",
              category: "apartment features",
            },
            {
              word: "moebliert",
              translation: { en: "furnished", es: "amueblado/a" },
              example: "Das Zimmer ist schon moebliert.",
              category: "apartment features",
            },
            {
              word: "einziehen",
              translation: { en: "to move in", es: "mudarse a" },
              example: "Wir ziehen naechsten Monat ein.",
              category: "moving",
            },
            {
              word: "ausziehen",
              translation: { en: "to move out", es: "mudarse de" },
              example: "Mein Nachbar zieht am Freitag aus.",
              category: "moving",
            },
            {
              word: "die Nachbarn",
              translation: { en: "neighbors", es: "vecinos" },
              example: "Unsere Nachbarn sind sehr freundlich.",
              category: "community",
            },
          ],
        },
      ],
    },
    B1: {
      title: {
        en: "German B1 Vocabulary Reference Bundle",
        es: "Paquete de referencia de vocabulario de aleman B1",
      },
      scope: {
        en: "Goethe B1 vocabulary for discussing social, professional, and civic topics in more detail. Includes thematic lexicon with contextual examples for intermediate communication tasks.",
        es: "Vocabulario Goethe B1 para hablar con mas detalle sobre temas sociales, profesionales y civicos. Incluye lexico tematico con ejemplos contextuales para tareas comunicativas intermedias.",
      },
      sections: [
        {
          id: "umwelt",
          title: { en: "Environment", es: "Medio ambiente" },
          items: [
            {
              word: "der Klimawandel",
              translation: { en: "climate change", es: "cambio climatico" },
              example: "Der Klimawandel betrifft alle Laender.",
              category: "global issues",
            },
            {
              word: "recyceln",
              translation: { en: "to recycle", es: "reciclar" },
              example: "Bei uns zu Hause recyceln wir Papier und Glas.",
              category: "sustainability",
            },
            {
              word: "die Umweltverschmutzung",
              translation: { en: "environmental pollution", es: "contaminacion ambiental" },
              example: "Die Umweltverschmutzung in grossen Staedten nimmt zu.",
              category: "problems",
            },
            {
              word: "erneuerbare Energie",
              translation: { en: "renewable energy", es: "energia renovable" },
              example: "Deutschland investiert in erneuerbare Energie.",
              category: "energy",
            },
            {
              word: "der Muell",
              translation: { en: "waste", es: "basura" },
              example: "Bitte wirf den Muell in die richtige Tonne.",
              category: "waste management",
            },
            {
              word: "sparen",
              translation: { en: "to save", es: "ahorrar" },
              example: "Wir sollten mehr Wasser sparen.",
              category: "resources",
            },
            {
              word: "die Natur",
              translation: { en: "nature", es: "naturaleza" },
              example: "Am Wochenende fahren wir in die Natur.",
              category: "ecosystems",
            },
            {
              word: "umweltfreundlich",
              translation: { en: "eco-friendly", es: "ecologico/a" },
              example: "Ich benutze oft umweltfreundliche Produkte.",
              category: "sustainability",
            },
          ],
        },
        {
          id: "arbeit_beruf",
          title: { en: "Work and Career", es: "Trabajo y carrera" },
          items: [
            {
              word: "die Bewerbung",
              translation: { en: "job application", es: "solicitud de empleo" },
              example: "Ich habe gestern meine Bewerbung abgeschickt.",
              category: "job search",
            },
            {
              word: "der Lebenslauf",
              translation: { en: "resume", es: "curriculum" },
              example: "Im Lebenslauf stehen meine Berufserfahrungen.",
              category: "job search",
            },
            {
              word: "das Vorstellungsgespraech",
              translation: { en: "job interview", es: "entrevista de trabajo" },
              example: "Morgen habe ich ein Vorstellungsgespraech.",
              category: "job search",
            },
            {
              word: "die Erfahrung",
              translation: { en: "experience", es: "experiencia" },
              example: "Fuer diese Stelle braucht man Erfahrung.",
              category: "qualifications",
            },
            {
              word: "die Verantwortung",
              translation: { en: "responsibility", es: "responsabilidad" },
              example: "In meinem Team habe ich viel Verantwortung.",
              category: "work roles",
            },
            {
              word: "befristet",
              translation: { en: "fixed-term", es: "temporal" },
              example: "Mein Vertrag ist befristet bis Dezember.",
              category: "contracts",
            },
            {
              word: "die Gehaltserhoehung",
              translation: { en: "salary raise", es: "aumento de sueldo" },
              example: "Nach zwei Jahren bekam sie eine Gehaltserhoehung.",
              category: "salary",
            },
            {
              word: "kuendigen",
              translation: { en: "to resign", es: "renunciar" },
              example: "Er will kuendigen und etwas Neues machen.",
              category: "career moves",
            },
          ],
        },
        {
          id: "technologie",
          title: { en: "Technology", es: "Tecnologia" },
          items: [
            {
              word: "das Geraet",
              translation: { en: "device", es: "dispositivo" },
              example: "Dieses Geraet braucht ein Update.",
              category: "hardware",
            },
            {
              word: "herunterladen",
              translation: { en: "to download", es: "descargar" },
              example: "Du kannst die Datei kostenlos herunterladen.",
              category: "digital actions",
            },
            {
              word: "hochladen",
              translation: { en: "to upload", es: "subir" },
              example: "Bitte lade das Formular online hoch.",
              category: "digital actions",
            },
            {
              word: "die Verbindung",
              translation: { en: "connection", es: "conexion" },
              example: "Die Verbindung ist heute sehr langsam.",
              category: "internet",
            },
            {
              word: "die Nachricht",
              translation: { en: "message", es: "mensaje" },
              example: "Ich habe dir eine Nachricht geschickt.",
              category: "communication",
            },
            {
              word: "speichern",
              translation: { en: "to save", es: "guardar" },
              example: "Vergiss nicht, das Dokument zu speichern.",
              category: "digital actions",
            },
            {
              word: "das Passwort",
              translation: { en: "password", es: "contrasena" },
              example: "Mein Passwort ist sehr sicher.",
              category: "security",
            },
            {
              word: "zuverlaessig",
              translation: { en: "reliable", es: "fiable" },
              example: "Diese App ist einfach und zuverlaessig.",
              category: "evaluation",
            },
          ],
        },
        {
          id: "gesundheit",
          title: { en: "Health and Lifestyle", es: "Salud y estilo de vida" },
          items: [
            {
              word: "die Untersuchung",
              translation: { en: "check-up", es: "revision medica" },
              example: "Die Untersuchung dauert nur zehn Minuten.",
              category: "medical care",
            },
            {
              word: "die Behandlung",
              translation: { en: "treatment", es: "tratamiento" },
              example: "Die Behandlung hat gut geholfen.",
              category: "medical care",
            },
            {
              word: "sich ernahren",
              translation: { en: "to eat nutritiously", es: "alimentarse" },
              example: "Ich versuche, mich gesund zu ernaehren.",
              category: "nutrition",
            },
            {
              word: "die Bewegung",
              translation: { en: "physical activity", es: "actividad fisica" },
              example: "Regelmaessige Bewegung ist wichtig fuer den Ruecken.",
              category: "fitness",
            },
            {
              word: "der Stress",
              translation: { en: "stress", es: "estres" },
              example: "Zu viel Stress macht auf Dauer krank.",
              category: "mental health",
            },
            {
              word: "entspannen",
              translation: { en: "to relax", es: "relajarse" },
              example: "Am Abend entspanne ich mit Musik.",
              category: "wellbeing",
            },
            {
              word: "die Krankenkasse",
              translation: { en: "health insurance", es: "seguro medico" },
              example: "Die Krankenkasse bezahlt einen Teil der Kosten.",
              category: "health system",
            },
            {
              word: "vorbeugen",
              translation: { en: "to prevent", es: "prevenir" },
              example: "Mit Sport kann man vielen Problemen vorbeugen.",
              category: "prevention",
            },
          ],
        },
        {
          id: "reisen",
          title: { en: "Travel", es: "Viajes" },
          items: [
            {
              word: "die Unterkunft",
              translation: { en: "accommodation", es: "alojamiento" },
              example: "Wir haben eine guenstige Unterkunft gefunden.",
              category: "planning",
            },
            {
              word: "buchen",
              translation: { en: "to book", es: "reservar" },
              example: "Ich buche den Flug heute Abend.",
              category: "planning",
            },
            {
              word: "der Fahrplan",
              translation: { en: "timetable", es: "horario" },
              example: "Der Fahrplan hat sich kurzfristig geaendert.",
              category: "transport",
            },
            {
              word: "die Verspaetung",
              translation: { en: "delay", es: "retraso" },
              example: "Wegen einer Verspaetung kamen wir spaet an.",
              category: "transport",
            },
            {
              word: "umsteigen",
              translation: { en: "to change trains", es: "hacer transbordo" },
              example: "In Koeln muessen wir umsteigen.",
              category: "transport",
            },
            {
              word: "die Sehenswuerdigkeit",
              translation: { en: "sight", es: "lugar de interes" },
              example: "Die Altstadt ist eine bekannte Sehenswuerdigkeit.",
              category: "tourism",
            },
            {
              word: "die Reiseleitung",
              translation: { en: "tour guide service", es: "guia turistico" },
              example: "Die Reiseleitung erklaert die Geschichte der Stadt.",
              category: "tourism",
            },
            {
              word: "erkunden",
              translation: { en: "to explore", es: "explorar" },
              example: "Wir wollen die Insel mit dem Fahrrad erkunden.",
              category: "travel activities",
            },
          ],
        },
        {
          id: "gesellschaft",
          title: { en: "Society", es: "Sociedad" },
          items: [
            {
              word: "die Gleichberechtigung",
              translation: { en: "equal rights", es: "igualdad de derechos" },
              example: "Viele Menschen setzen sich fuer Gleichberechtigung ein.",
              category: "social values",
            },
            {
              word: "die Integration",
              translation: { en: "integration", es: "integracion" },
              example: "Sprache ist wichtig fuer die Integration.",
              category: "community",
            },
            {
              word: "die Nachbarschaft",
              translation: { en: "neighborhood", es: "vecindario" },
              example: "In unserer Nachbarschaft kennt man sich gut.",
              category: "community",
            },
            {
              word: "das Ehrenamt",
              translation: { en: "volunteering", es: "voluntariado" },
              example: "Sie engagiert sich im Ehrenamt fuer Kinder.",
              category: "civic life",
            },
            {
              word: "respektieren",
              translation: { en: "to respect", es: "respetar" },
              example: "Wir sollten andere Meinungen respektieren.",
              category: "social behavior",
            },
            {
              word: "die Pflicht",
              translation: { en: "duty", es: "deber" },
              example: "Wahlen sind ein wichtiges Recht und eine Pflicht.",
              category: "civic life",
            },
            {
              word: "diskutieren",
              translation: { en: "to discuss", es: "debatir" },
              example: "Im Kurs diskutieren wir oft aktuelle Themen.",
              category: "communication",
            },
            {
              word: "vielfaeltig",
              translation: { en: "diverse", es: "diverso/a" },
              example: "Berlin ist eine vielfaeltige Stadt.",
              category: "social description",
            },
          ],
        },
      ],
    },
  },
  phrases: {
    A2: {
      title: {
        en: "German A2 Phrases Reference Bundle",
        es: "Paquete de referencia de frases en aleman A2",
      },
      scope: {
        en: "Useful Goethe A2 phrase patterns for routine interactions in shops, travel, health, and daily life. Includes short functional expressions with clear usage context and register.",
        es: "Patrones utiles de frases Goethe A2 para interacciones rutinarias en compras, viajes, salud y vida diaria. Incluye expresiones funcionales breves con contexto de uso y registro claro.",
      },
      sections: [
        {
          id: "alltag",
          title: { en: "Daily Life", es: "Vida cotidiana" },
          items: [
            {
              phrase: "Wie spaet ist es?",
              translation: { en: "What time is it?", es: "Que hora es?" },
              usage: "Asking for the time in a neutral everyday context.",
              register: "neutral",
            },
            {
              phrase: "Ich habe heute keine Zeit.",
              translation: { en: "I have no time today.", es: "Hoy no tengo tiempo." },
              usage: "Saying you are unavailable.",
              register: "neutral",
            },
            {
              phrase: "Kannst du mir helfen?",
              translation: { en: "Can you help me?", es: "Me puedes ayudar?" },
              usage: "Asking someone for practical help.",
              register: "informal",
            },
            {
              phrase: "Entschuldigung, ich komme zu spaet.",
              translation: { en: "Sorry, I am late.", es: "Perdon, llego tarde." },
              usage: "Apologizing for lateness.",
              register: "neutral",
            },
            {
              phrase: "Ich bin gleich da.",
              translation: { en: "I will be there in a moment.", es: "Llego enseguida." },
              usage: "Informing someone of your imminent arrival.",
              register: "informal",
            },
            {
              phrase: "Was machst du heute Abend?",
              translation: { en: "What are you doing tonight?", es: "Que haces esta noche?" },
              usage: "Starting casual plans with a friend.",
              register: "informal",
            },
            {
              phrase: "Das passt mir gut.",
              translation: { en: "That works well for me.", es: "Me viene bien." },
              usage: "Agreeing on time or arrangement.",
              register: "neutral",
            },
            {
              phrase: "Ich melde mich spaeter.",
              translation: { en: "I will get back to you later.", es: "Te escribo mas tarde." },
              usage: "Ending a conversation with follow-up later.",
              register: "neutral",
            },
          ],
        },
        {
          id: "einkaufen",
          title: { en: "Shopping", es: "Compras" },
          items: [
            {
              phrase: "Ich suche eine Jacke in Groesse M.",
              translation: { en: "I am looking for a jacket in size M.", es: "Busco una chaqueta en talla M." },
              usage: "Asking for a specific item in a store.",
              register: "neutral",
            },
            {
              phrase: "Haben Sie das auch in Blau?",
              translation: { en: "Do you also have this in blue?", es: "Lo tiene tambien en azul?" },
              usage: "Asking staff for another color option.",
              register: "formal",
            },
            {
              phrase: "Kann ich das bitte anprobieren?",
              translation: { en: "Can I try this on, please?", es: "Me lo puedo probar, por favor?" },
              usage: "Requesting to use a fitting room.",
              register: "neutral",
            },
            {
              phrase: "Wie viel kostet das zusammen?",
              translation: { en: "How much is that altogether?", es: "Cuanto cuesta todo junto?" },
              usage: "Asking for total price.",
              register: "neutral",
            },
            {
              phrase: "Kann ich mit Karte zahlen?",
              translation: { en: "Can I pay by card?", es: "Puedo pagar con tarjeta?" },
              usage: "Checking payment options at checkout.",
              register: "neutral",
            },
            {
              phrase: "Ich moechte das umtauschen.",
              translation: { en: "I would like to exchange this.", es: "Quiero cambiar esto." },
              usage: "Requesting exchange of an item.",
              register: "neutral",
            },
            {
              phrase: "Das ist mir zu teuer.",
              translation: { en: "That is too expensive for me.", es: "Eso es demasiado caro para mi." },
              usage: "Reacting to a high price.",
              register: "neutral",
            },
            {
              phrase: "Haben Sie eine guenstigere Alternative?",
              translation: { en: "Do you have a cheaper alternative?", es: "Tiene una alternativa mas barata?" },
              usage: "Asking for a lower-cost option.",
              register: "formal",
            },
          ],
        },
        {
          id: "gesundheit",
          title: { en: "Health", es: "Salud" },
          items: [
            {
              phrase: "Ich habe seit gestern Halsschmerzen.",
              translation: { en: "I have had a sore throat since yesterday.", es: "Desde ayer tengo dolor de garganta." },
              usage: "Describing a symptom to doctor or pharmacist.",
              register: "neutral",
            },
            {
              phrase: "Ich brauche einen Termin beim Arzt.",
              translation: { en: "I need an appointment with the doctor.", es: "Necesito una cita con el medico." },
              usage: "Requesting an appointment by phone or at reception.",
              register: "neutral",
            },
            {
              phrase: "Soll ich dieses Medikament morgens nehmen?",
              translation: { en: "Should I take this medicine in the morning?", es: "Debo tomar este medicamento por la manana?" },
              usage: "Clarifying medication instructions.",
              register: "neutral",
            },
            {
              phrase: "Mir ist schwindelig.",
              translation: { en: "I feel dizzy.", es: "Me siento mareado/a." },
              usage: "Reporting acute physical discomfort.",
              register: "neutral",
            },
            {
              phrase: "Ich fuehle mich heute besser.",
              translation: { en: "I feel better today.", es: "Hoy me siento mejor." },
              usage: "Giving a short health update.",
              register: "neutral",
            },
            {
              phrase: "Ich sollte mich mehr ausruhen.",
              translation: { en: "I should rest more.", es: "Deberia descansar mas." },
              usage: "Talking about recovery plan.",
              register: "neutral",
            },
            {
              phrase: "Kann ich eine Krankmeldung bekommen?",
              translation: { en: "Can I get a sick note?", es: "Puedo obtener un justificante medico?" },
              usage: "Requesting a sick note for work or school.",
              register: "formal",
            },
            {
              phrase: "Wo ist die naechste Apotheke?",
              translation: { en: "Where is the nearest pharmacy?", es: "Donde esta la farmacia mas cercana?" },
              usage: "Asking for directions when you need medicine.",
              register: "neutral",
            },
          ],
        },
        {
          id: "reisen",
          title: { en: "Travel", es: "Viajes" },
          items: [
            {
              phrase: "Wann faehrt der naechste Zug nach Hamburg?",
              translation: { en: "When does the next train to Hamburg leave?", es: "Cuando sale el proximo tren a Hamburgo?" },
              usage: "Asking for departure information.",
              register: "neutral",
            },
            {
              phrase: "Ich moechte ein Ticket nach Muenchen.",
              translation: { en: "I would like a ticket to Munich.", es: "Quiero un billete a Munich." },
              usage: "Buying a transport ticket.",
              register: "neutral",
            },
            {
              phrase: "Ist dieser Platz noch frei?",
              translation: { en: "Is this seat still free?", es: "Este asiento esta libre?" },
              usage: "Asking before taking a seat.",
              register: "neutral",
            },
            {
              phrase: "Wo kann ich einchecken?",
              translation: { en: "Where can I check in?", es: "Donde puedo hacer el check-in?" },
              usage: "At airport, hotel, or reception desk.",
              register: "neutral",
            },
            {
              phrase: "Wie komme ich zum Stadtzentrum?",
              translation: { en: "How do I get to the city center?", es: "Como llego al centro?" },
              usage: "Asking for directions in a new city.",
              register: "neutral",
            },
            {
              phrase: "Der Zug hat zwanzig Minuten Verspaetung.",
              translation: { en: "The train is twenty minutes late.", es: "El tren lleva veinte minutos de retraso." },
              usage: "Informing others about delay.",
              register: "neutral",
            },
            {
              phrase: "Kann ich hier eine Nacht bleiben?",
              translation: { en: "Can I stay here for one night?", es: "Puedo quedarme aqui una noche?" },
              usage: "Asking availability in accommodation.",
              register: "neutral",
            },
            {
              phrase: "Ich habe eine Reservierung auf den Namen Weber.",
              translation: { en: "I have a reservation under the name Weber.", es: "Tengo una reserva a nombre de Weber." },
              usage: "Checking in with booked reservation.",
              register: "formal",
            },
          ],
        },
        {
          id: "freizeit",
          title: { en: "Free Time", es: "Tiempo libre" },
          items: [
            {
              phrase: "Hast du Lust auf einen Film?",
              translation: { en: "Do you feel like watching a movie?", es: "Te apetece ver una pelicula?" },
              usage: "Inviting a friend to a casual activity.",
              register: "informal",
            },
            {
              phrase: "Lass uns am See spazieren gehen.",
              translation: { en: "Let us go for a walk by the lake.", es: "Vamos a pasear por el lago." },
              usage: "Suggesting a shared leisure activity.",
              register: "informal",
            },
            {
              phrase: "Ich spiele am Wochenende Fussball.",
              translation: { en: "I play football on the weekend.", es: "Juego al futbol el fin de semana." },
              usage: "Talking about routine hobbies.",
              register: "neutral",
            },
            {
              phrase: "Das Konzert war wirklich toll.",
              translation: { en: "The concert was really great.", es: "El concierto fue realmente genial." },
              usage: "Giving positive feedback on an event.",
              register: "neutral",
            },
            {
              phrase: "Heute bleibe ich lieber zu Hause.",
              translation: { en: "Today I would rather stay home.", es: "Hoy prefiero quedarme en casa." },
              usage: "Declining plans politely.",
              register: "neutral",
            },
            {
              phrase: "Wir koennen zusammen kochen.",
              translation: { en: "We can cook together.", es: "Podemos cocinar juntos." },
              usage: "Proposing an easy social plan.",
              register: "informal",
            },
            {
              phrase: "Ich interessiere mich fuer Fotografie.",
              translation: { en: "I am interested in photography.", es: "Me interesa la fotografia." },
              usage: "Stating personal interest during conversation.",
              register: "neutral",
            },
            {
              phrase: "Wann treffen wir uns?",
              translation: { en: "When shall we meet?", es: "Cuando quedamos?" },
              usage: "Fixing time for social plans.",
              register: "informal",
            },
          ],
        },
      ],
    },
    B1: {
      title: {
        en: "German B1 Phrases Reference Bundle",
        es: "Paquete de referencia de frases en aleman B1",
      },
      scope: {
        en: "Functional Goethe B1 phrase sets for giving opinions, making formal requests, handling complaints, and collaborating at work. Supports clearer argumentation and socially appropriate interaction.",
        es: "Conjuntos funcionales de frases Goethe B1 para dar opiniones, hacer solicitudes formales, gestionar quejas y colaborar en el trabajo. Ayuda a una argumentacion mas clara y a una interaccion social adecuada.",
      },
      sections: [
        {
          id: "meinung",
          title: { en: "Opinions", es: "Opiniones" },
          items: [
            {
              phrase: "Meiner Meinung nach ist das eine gute Loesung.",
              translation: { en: "In my opinion, this is a good solution.", es: "En mi opinion, esta es una buena solucion." },
              usage: "Introducing a personal opinion in discussion.",
              register: "neutral",
            },
            {
              phrase: "Ich bin nicht ganz damit einverstanden.",
              translation: { en: "I do not completely agree with that.", es: "No estoy del todo de acuerdo con eso." },
              usage: "Expressing partial disagreement politely.",
              register: "neutral",
            },
            {
              phrase: "Aus meiner Sicht gibt es bessere Alternativen.",
              translation: { en: "From my point of view, there are better alternatives.", es: "Desde mi punto de vista, hay mejores alternativas." },
              usage: "Presenting an alternative perspective.",
              register: "neutral",
            },
            {
              phrase: "Ich kann Ihren Standpunkt gut verstehen.",
              translation: { en: "I can understand your point of view well.", es: "Puedo entender bien su punto de vista." },
              usage: "Showing empathy before response.",
              register: "formal",
            },
            {
              phrase: "Dafuer spricht vor allem die hohe Qualitaet.",
              translation: { en: "What mainly speaks for it is the high quality.", es: "Lo que mas lo favorece es la alta calidad." },
              usage: "Supporting an argument with key reason.",
              register: "neutral",
            },
            {
              phrase: "Dagegen spricht jedoch der hohe Preis.",
              translation: { en: "However, what speaks against it is the high price.", es: "Sin embargo, lo que va en contra es el precio alto." },
              usage: "Adding a counter-argument.",
              register: "neutral",
            },
            {
              phrase: "Ich sehe das etwas anders.",
              translation: { en: "I see that a bit differently.", es: "Yo lo veo un poco diferente." },
              usage: "Soft disagreement in conversation.",
              register: "neutral",
            },
            {
              phrase: "Letztlich haengt es von der Situation ab.",
              translation: { en: "Ultimately, it depends on the situation.", es: "En ultima instancia, depende de la situacion." },
              usage: "Concluding with balanced position.",
              register: "neutral",
            },
          ],
        },
        {
          id: "vorschlaege",
          title: { en: "Suggestions", es: "Sugerencias" },
          items: [
            {
              phrase: "Ich schlage vor, dass wir frueher anfangen.",
              translation: { en: "I suggest that we start earlier.", es: "Propongo que empecemos antes." },
              usage: "Making a concrete proposal in group setting.",
              register: "neutral",
            },
            {
              phrase: "Wie waere es, wenn wir online teilnehmen?",
              translation: { en: "How about taking part online?", es: "Que tal si participamos en linea?" },
              usage: "Offering an alternative format.",
              register: "neutral",
            },
            {
              phrase: "Wir koennten die Aufgaben aufteilen.",
              translation: { en: "We could divide the tasks.", es: "Podriamos repartir las tareas." },
              usage: "Suggesting practical team organization.",
              register: "neutral",
            },
            {
              phrase: "Vielleicht waere ein kurzer Test sinnvoll.",
              translation: { en: "Perhaps a short test would make sense.", es: "Quiza una prueba corta seria util." },
              usage: "Careful recommendation in planning discussion.",
              register: "neutral",
            },
            {
              phrase: "Darf ich einen Vorschlag machen?",
              translation: { en: "May I make a suggestion?", es: "Puedo hacer una sugerencia?" },
              usage: "Politely entering discussion with idea.",
              register: "formal",
            },
            {
              phrase: "Es waere besser, zuerst die wichtigsten Punkte zu klaeren.",
              translation: { en: "It would be better to clarify the key points first.", es: "Seria mejor aclarar primero los puntos principales." },
              usage: "Structuring a meeting process.",
              register: "neutral",
            },
            {
              phrase: "Lassen Sie uns einen Kompromiss finden.",
              translation: { en: "Let us find a compromise.", es: "Busquemos un compromiso." },
              usage: "Encouraging consensus in disagreement.",
              register: "formal",
            },
            {
              phrase: "Ein gemeinsamer Termin waere am praktischsten.",
              translation: { en: "A shared appointment would be most practical.", es: "Una cita conjunta seria lo mas practico." },
              usage: "Suggesting logistical solution.",
              register: "neutral",
            },
          ],
        },
        {
          id: "beschwerden",
          title: { en: "Complaints", es: "Quejas" },
          items: [
            {
              phrase: "Ich moechte mich ueber dieses Produkt beschweren.",
              translation: { en: "I would like to complain about this product.", es: "Quiero presentar una queja sobre este producto." },
              usage: "Opening a complaint in customer service.",
              register: "formal",
            },
            {
              phrase: "Leider funktioniert das Geraet nicht wie beschrieben.",
              translation: { en: "Unfortunately, the device does not work as described.", es: "Lamentablemente, el dispositivo no funciona como se describe." },
              usage: "Explaining product defect.",
              register: "formal",
            },
            {
              phrase: "Ich erwarte eine schnelle Loesung.",
              translation: { en: "I expect a quick solution.", es: "Espero una solucion rapida." },
              usage: "Clearly stating expectation.",
              register: "formal",
            },
            {
              phrase: "Die Lieferung ist deutlich spaeter angekommen.",
              translation: { en: "The delivery arrived significantly later.", es: "La entrega llego claramente mas tarde." },
              usage: "Reporting delayed shipment.",
              register: "formal",
            },
            {
              phrase: "Koennten Sie mir bitte den Betrag erstatten?",
              translation: { en: "Could you please refund the amount?", es: "Podria devolverme el importe, por favor?" },
              usage: "Requesting refund politely.",
              register: "formal",
            },
            {
              phrase: "Ich habe bereits zweimal angerufen.",
              translation: { en: "I have already called twice.", es: "Ya he llamado dos veces." },
              usage: "Indicating repeated failed contact.",
              register: "neutral",
            },
            {
              phrase: "So kann das Problem nicht bleiben.",
              translation: { en: "This problem cannot remain unresolved.", es: "Este problema no puede quedarse asi." },
              usage: "Applying pressure for resolution.",
              register: "neutral",
            },
            {
              phrase: "Bitte bestaetigen Sie den Eingang meiner Nachricht.",
              translation: { en: "Please confirm receipt of my message.", es: "Por favor, confirme la recepcion de mi mensaje." },
              usage: "Closing formal complaint email.",
              register: "formal",
            },
          ],
        },
        {
          id: "formell",
          title: { en: "Formal Communication", es: "Comunicacion formal" },
          items: [
            {
              phrase: "Sehr geehrte Damen und Herren,",
              translation: { en: "Dear Sir or Madam,", es: "Estimados senores:" },
              usage: "Standard opening in formal letters.",
              register: "formal",
            },
            {
              phrase: "Hiermit moechte ich mich fuer den Kurs anmelden.",
              translation: { en: "I would like to register for the course.", es: "Por la presente quisiera inscribirme en el curso." },
              usage: "Making a formal written request.",
              register: "formal",
            },
            {
              phrase: "Ich waere Ihnen fuer eine Rueckmeldung dankbar.",
              translation: { en: "I would be grateful for a reply.", es: "Le agradeceria una respuesta." },
              usage: "Polite closing request in email.",
              register: "formal",
            },
            {
              phrase: "Anbei sende ich Ihnen die erforderlichen Unterlagen.",
              translation: { en: "Attached I am sending you the required documents.", es: "Adjunto le envio la documentacion requerida." },
              usage: "Referring to attachments in formal email.",
              register: "formal",
            },
            {
              phrase: "Koennten Sie mir bitte weitere Informationen zukommen lassen?",
              translation: { en: "Could you please send me further information?", es: "Podria enviarme mas informacion, por favor?" },
              usage: "Requesting additional details politely.",
              register: "formal",
            },
            {
              phrase: "Mit freundlichen Gruessen",
              translation: { en: "Kind regards", es: "Atentamente" },
              usage: "Common formal email closing.",
              register: "formal",
            },
            {
              phrase: "Ich nehme Bezug auf Ihr Schreiben vom 12. Mai.",
              translation: { en: "I refer to your letter of May 12.", es: "Hago referencia a su carta del 12 de mayo." },
              usage: "Connecting to earlier correspondence.",
              register: "formal",
            },
            {
              phrase: "Fuer Rueckfragen stehe ich gern zur Verfuegung.",
              translation: { en: "I am available for any questions.", es: "Quedo a su disposicion para cualquier consulta." },
              usage: "Offering further contact in formal context.",
              register: "formal",
            },
          ],
        },
        {
          id: "arbeit",
          title: { en: "Workplace Communication", es: "Comunicacion laboral" },
          items: [
            {
              phrase: "Koennen wir die Aufgaben kurz abstimmen?",
              translation: { en: "Can we quickly coordinate the tasks?", es: "Podemos coordinar brevemente las tareas?" },
              usage: "Aligning responsibilities with colleagues.",
              register: "neutral",
            },
            {
              phrase: "Ich uebernehme den ersten Teil des Projekts.",
              translation: { en: "I will take the first part of the project.", es: "Yo me encargo de la primera parte del proyecto." },
              usage: "Volunteering for responsibility.",
              register: "neutral",
            },
            {
              phrase: "Bis wann brauchen Sie das Ergebnis?",
              translation: { en: "By when do you need the result?", es: "Para cuando necesita el resultado?" },
              usage: "Clarifying deadline with supervisor or client.",
              register: "formal",
            },
            {
              phrase: "Ich komme mit dieser Software noch nicht gut zurecht.",
              translation: { en: "I am not handling this software well yet.", es: "Todavia no manejo bien este software." },
              usage: "Asking for support in workplace learning.",
              register: "neutral",
            },
            {
              phrase: "Vielen Dank fuer Ihre Unterstuetzung.",
              translation: { en: "Thank you very much for your support.", es: "Muchas gracias por su apoyo." },
              usage: "Expressing appreciation in professional setting.",
              register: "formal",
            },
            {
              phrase: "Ich informiere Sie, sobald ich fertig bin.",
              translation: { en: "I will inform you as soon as I am done.", es: "Le informare en cuanto termine." },
              usage: "Giving progress commitment.",
              register: "formal",
            },
            {
              phrase: "Diesen Punkt sollten wir im Team besprechen.",
              translation: { en: "We should discuss this point in the team.", es: "Este punto deberiamos tratarlo en equipo." },
              usage: "Escalating topic for team discussion.",
              register: "neutral",
            },
            {
              phrase: "Heute schaffe ich das leider nicht mehr.",
              translation: { en: "Unfortunately I cannot finish that today.", es: "Por desgracia hoy ya no llego a hacerlo." },
              usage: "Communicating delay transparently.",
              register: "neutral",
            },
          ],
        },
      ],
    },
  },
};

function localizeSections(rawSections, meta, type) {
  if (!Array.isArray(rawSections)) {
    return [];
  }

  return rawSections.map((section) => {
    const mappedItems = Array.isArray(section.items)
      ? section.items.map((item) => {
          if (type === "vocabulary") {
            return {
              word: item.word,
              translation: item.translation[meta],
              example: item.example,
              category: item.category,
            };
          }

          return {
            phrase: item.phrase,
            translation: item.translation[meta],
            usage: item.usage,
            register: item.register,
          };
        })
      : [];

    return {
      id: section.id,
      title: section.title[meta],
      items: mappedItems,
    };
  });
}

export const PUBLISHED_COMBOS = ["vocabulary", "phrases"].flatMap((type) =>
  ["A2", "B1"].flatMap((level) =>
    ["en", "es"].map((meta) => ({
      type,
      level,
      meta,
      lang: "de",
      status: "published",
    })),
  ),
);

export function buildPublishedDocs(type, level, meta) {
  if (!VALID_TYPES.has(type) || !PUBLISHED_LEVELS.has(level) || !VALID_META.has(meta)) {
    return null;
  }

  const bundle = PUBLISHED_DATA[type]?.[level];
  if (!bundle) {
    return null;
  }

  return {
    lang: "de",
    level,
    status: "published",
    title: bundle.title[meta],
    metaLanguage: meta,
    scope: bundle.scope[meta],
    sections: localizeSections(bundle.sections, meta, type),
  };
}

export function stubDoc(type, level, meta) {
  if (!VALID_TYPES.has(type) || !STUB_LEVELS.has(level) || !VALID_META.has(meta)) {
    return null;
  }

  const titleByMeta = {
    en: `German ${level} ${type === "vocabulary" ? "Vocabulary" : "Phrases"} Draft`,
    es: `Borrador de ${type === "vocabulary" ? "vocabulario" : "frases"} de aleman ${level}`,
  };

  const scopeByMeta = {
    en: "Draft reference bundle not yet published. Content scope and sections will be defined in a future release.",
    es: "Paquete de referencia en borrador aun no publicado. El alcance y las secciones se definiran en una version futura.",
  };

  return {
    lang: "de",
    level,
    status: "draft",
    title: titleByMeta[meta],
    metaLanguage: meta,
    scope: scopeByMeta[meta],
    sections: [],
  };
}
