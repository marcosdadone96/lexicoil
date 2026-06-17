#!/usr/bin/env node
/**
 * @deprecated Use npm run build:vocab — library/vocab/{lang}/{LEVEL}.json
 * Legacy partial-seed in knowledge/cefr/vocab/ retained for reference only.
 */
 * TODO: replace with full Profile Deutsch / EVP / Plan Curricular inventories.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'knowledge', 'cefr', 'vocab');

const LISTS = {
  de: {
    A1: [
      'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sein', 'haben', 'gehen', 'kommen', 'machen', 'essen', 'trinken',
      'wohnen', 'kaufen', 'familie', 'freund', 'mutter', 'vater', 'kind', 'haus', 'wohnung', 'stadt', 'schule', 'arbeit',
      'tag', 'woche', 'jahr', 'heute', 'morgen', 'gestern', 'gut', 'schlecht', 'groß', 'klein', 'neu', 'alt', 'viel', 'wenig',
      'und', 'oder', 'aber', 'in', 'auf', 'mit', 'von', 'zu', 'der', 'die', 'das', 'ein', 'eine', 'name', 'land', 'sprache',
      'deutsch', 'zeit', 'uhr', 'montag', 'freitag', 'sonntag', 'frühstück', 'mittag', 'abend', 'wasser', 'brot',
      'kaffee', 'tee', 'apfel', 'milch', 'zimmer', 'tür', 'fenster', 'tisch', 'stuhl', 'buch', 'schreiben', 'lesen', 'hören',
      'sprechen', 'fragen', 'antworten', 'ja', 'nein', 'bitte', 'danke', 'entschuldigung', 'supermarkt', 'geld', 'preis',
      'billig', 'teuer', 'kalt', 'warm', 'sonne', 'regen', 'schön', 'wichtig', 'hier', 'dort', 'links', 'rechts', 'geradeaus',
      'mensch', 'menschen', 'mehr', 'immer', 'sich', 'den', 'dem', 'des', 'einen', 'einer', 'einem', 'nicht', 'auch', 'nur',
      'sehr', 'noch', 'schon', 'jetzt', 'dann', 'dort', 'diese', 'dieser', 'dieses', 'viele', 'alle', 'man', 'können', 'möchten',
    ],
    A2: [
      'reisen', 'urlaub', 'zug', 'bus', 'bahnhof', 'flughafen', 'hotel', 'zimmer', 'reservieren', 'ticket', 'koffer', 'pass',
      'gesund', 'krank', 'arzt', 'apotheke', 'sport', 'laufen', 'schwimmen', 'wetter', 'frühling', 'sommer', 'herbst', 'winter',
      'medien', 'fernsehen', 'radio', 'internet', 'email', 'telefon', 'nachricht', 'freizeit', 'kino', 'musik', 'konzert', 'museum',
      'gestern', 'perfekt', 'gekauft', 'gewesen', 'gegangen', 'gemacht', 'gegessen', 'getrunken', 'gekommen', 'gehabt', 'wollen',
      'müssen', 'dürfen', 'sollen', 'können', 'mögen', 'später', 'früher', 'manchmal', 'oft', 'selten', 'nächste', 'letzte',
      'vergleich', 'billiger', 'teurer', 'größer', 'kleiner', 'besser', 'schlechter', 'stadtplan', 'markt', 'restaurant', 'karte',
    ],
    B1: [
      'umwelt', 'nachhaltigkeit', 'energie', 'klima', 'recycling', 'müll', 'stadtgarten', 'garten', 'pflanze', 'gemüse', 'anbauen',
      'nachbar', 'gemeinschaft', 'bewohner', 'projekt', 'trend', 'grund', 'essen', 'produkt', 'frisch', 'ökologisch', 'mikroklima',
      'nachfrage', 'angebot', 'warteliste', 'parzelle', 'bericht', 'empfehlen', 'verbrauch', 'büro', 'messen', 'veröffentlichen',
      'weil', 'dass', 'wenn', 'obwohl', 'während', 'ob', 'damit', 'sodass', 'nachdem', 'bevor', 'meinung', 'plan', 'grund',
      'erfahrung', 'ereignis', 'wunsch', 'brief', 'reise', 'interesse', 'situation', 'reisen', 'gespräch', 'thema', 'verstehen',
      'hauptpunkt', 'programm', 'nachricht', 'artikel', 'beschreibung', 'gefühl', 'persönlich', 'alltag', 'beruf', 'bildung',
      'technologie', 'gesundheit', 'ernährung', 'kultur', 'politik', 'wirtschaft', 'entwicklung', 'verbessern', 'reduzieren', 'transport',
      'entscheiden', 'kennenlernen', 'erfahren', 'wachsen', 'bleiben', 'übersteigen', 'transportieren', 'zusammenarbeiten', 'experte',
      'lokal', 'gemeinde', 'lebensmittel', 'kooperieren', 'erklären', 'schätzen', 'zentrale', 'stadtbewohner', 'begrenzt', 'platz',
      'kritiker', 'trotzdem', 'deutschen', 'städten', 'berlin', 'hamburg', 'münchen', 'sicht', 'kinder', 'sagen', 'wollen', 'helfen',
      'boonen', 'boomen', 'wie', 'für', 'gärten', 'empfiehlt', 'zeigen', 'profitieren', 'praktisch', 'insgesamt', 'starkes', 'stark',
      'zeitung', 'zeitungen', 'familien', 'positive', 'entstehen', 'besser', 'stärken', 'starken',
      'eigen', 'eigenen', 'sogenannte', 'sogenannten', 'urban', 'gardening', 'projekte', 'brachflächen', 'dächern', 'parks',
      'stadtbewohnern', 'kräuter', 'blumen', 'transportiert', 'kritiker', 'wohnungsbau', 'parzellen', 'deutschen', 'städte',
    ],
    B2: [
      'digitalisierung', 'gesellschaft', 'klimawandel', 'innovation', 'wissenschaft', 'migration', 'integration', 'globalisierung',
      'wirtschaft', 'markt', 'unternehmen', 'forschung', 'studie', 'analyse', 'konsequenz', 'herausforderung', 'lösung', 'strategie',
      'diskussion', 'argument', 'beispiel', 'statistik', 'tendenz', 'entwicklung', 'verantwortung', 'demokratie', 'bildungspolitik',
      'nominalisierung', 'indirekte', 'rede', 'konjunktiv', 'zusammenhang', 'zusammenfassung', 'hypothese', 'interpretation',
      'kontrovers', 'aspekt', 'perspektive', 'voraussetzung', 'auswirkung', 'maßnahme', 'implementieren', 'evaluieren', 'priorität',
    ],
    C1: [
      'philosophie', 'ethik', 'identität', 'ungleichheit', 'literatur', 'gesellschaftskritik', 'wissenschaftsethik', 'europäisch',
      'rhetorik', 'register', 'nuance', 'implizit', 'explizit', 'abstrakt', 'konkret', 'diskurs', 'paradigma', 'differenzierung',
      'argumentation', 'these', 'antithese', 'synthese', 'reflexion', 'kontextualisieren', 'problematisieren', 'verhandeln',
      'komplexität', 'ambivalenz', 'legitimation', 'hegemonie', 'postkolonial', 'hermeneutik', 'epistemologie', 'ontologie',
    ],
    C2: [
      'sprachphilosophie', 'ästhetik', 'gesellschaftstheorie', 'deconstruction', 'intertextualität', 'polyphonie', 'metaphorik',
      'stilistik', 'rhetorische', 'figur', 'ironie', 'paradox', 'subtext', 'idiolekt', 'soziolekt', 'pragmatik', 'semantik',
      'morphologie', 'syntax', 'prosodie', 'diskursanalyse', 'kulturwissenschaft', 'literaturtheorie', 'politische', 'theorie',
    ],
  },
  en: {
    A1: [
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'be', 'have', 'go', 'come', 'make', 'eat', 'drink', 'live', 'buy', 'family',
      'friend', 'mother', 'father', 'child', 'house', 'home', 'city', 'school', 'work', 'day', 'week', 'year', 'today', 'tomorrow',
      'yesterday', 'good', 'bad', 'big', 'small', 'new', 'old', 'much', 'little', 'and', 'or', 'but', 'in', 'on', 'with', 'from', 'to',
      'the', 'a', 'an', 'name', 'country', 'language', 'english', 'time', 'clock', 'monday', 'friday', 'sunday', 'breakfast', 'lunch',
      'dinner', 'water', 'bread', 'coffee', 'tea', 'apple', 'milk', 'room', 'door', 'window', 'table', 'chair', 'book', 'write', 'read',
      'listen', 'speak', 'ask', 'answer', 'yes', 'no', 'please', 'thank', 'sorry', 'shop', 'money', 'price', 'cheap', 'expensive',
      'cold', 'warm', 'sun', 'rain', 'nice', 'important', 'here', 'there', 'left', 'right', 'straight',
    ],
    A2: [
      'travel', 'holiday', 'train', 'bus', 'station', 'airport', 'hotel', 'book', 'reserve', 'ticket', 'suitcase', 'passport',
      'healthy', 'ill', 'doctor', 'pharmacy', 'sport', 'run', 'swim', 'weather', 'spring', 'summer', 'autumn', 'winter', 'media',
      'television', 'radio', 'internet', 'email', 'phone', 'message', 'leisure', 'cinema', 'music', 'concert', 'museum', 'past',
      'bought', 'been', 'gone', 'made', 'eaten', 'drunk', 'want', 'must', 'should', 'can', 'like', 'later', 'earlier', 'sometimes',
      'often', 'seldom', 'next', 'last', 'compare', 'cheaper', 'bigger', 'smaller', 'better', 'worse', 'map', 'market', 'restaurant',
      'menu', 'because', 'when', 'before', 'after',
    ],
    B1: [
      'environment', 'sustainability', 'energy', 'climate', 'recycling', 'waste', 'garden', 'community', 'urban', 'project', 'trend',
      'reason', 'food', 'product', 'fresh', 'ecological', 'demand', 'supply', 'report', 'recommend', 'consumption', 'office', 'measure',
      'publish', 'because', 'although', 'while', 'if', 'whether', 'experience', 'event', 'letter', 'travel', 'interest', 'situation',
      'conversation', 'topic', 'understand', 'main', 'point', 'programme', 'news', 'article', 'description', 'feeling', 'personal',
      'everyday', 'job', 'education', 'technology', 'health', 'culture', 'politics', 'economy', 'development', 'improve', 'reduce',
      'transport', 'opinion', 'plan', 'explain', 'describe', 'neighbour', 'resident', 'grow', 'plant', 'vegetable',
    ],
    B2: [
      'digitalisation', 'society', 'climate', 'change', 'innovation', 'science', 'migration', 'integration', 'globalisation',
      'economy', 'market', 'company', 'research', 'study', 'analysis', 'consequence', 'challenge', 'solution', 'strategy',
      'discussion', 'argument', 'example', 'statistic', 'tendency', 'responsibility', 'democracy', 'policy', 'hypothesis',
      'interpretation', 'controversial', 'aspect', 'perspective', 'requirement', 'impact', 'measure', 'implement', 'evaluate',
      'priority', 'nevertheless', 'furthermore', 'whereas', 'consequently', 'notwithstanding',
    ],
    C1: [
      'philosophy', 'ethics', 'identity', 'inequality', 'literature', 'critique', 'european', 'rhetoric', 'register', 'nuance',
      'implicit', 'explicit', 'abstract', 'concrete', 'discourse', 'paradigm', 'differentiation', 'argumentation', 'thesis',
      'reflection', 'contextualise', 'complexity', 'ambivalence', 'legitimacy', 'hegemony', 'hermeneutics', 'epistemology',
    ],
    C2: [
      'philosophy', 'language', 'aesthetics', 'societal', 'theory', 'intertextuality', 'metaphor', 'stylistics', 'rhetorical',
      'irony', 'paradox', 'subtext', 'idiolect', 'sociolect', 'pragmatics', 'semantics', 'morphology', 'syntax', 'prosody',
      'discourse', 'analysis', 'cultural', 'studies', 'literary', 'theory', 'political',
    ],
  },
  es: {
    A1: [
      'yo', 'tú', 'él', 'ella', 'nosotros', 'vosotros', 'ser', 'estar', 'tener', 'ir', 'venir', 'hacer', 'comer', 'beber', 'vivir',
      'comprar', 'familia', 'amigo', 'madre', 'padre', 'hijo', 'casa', 'piso', 'ciudad', 'escuela', 'trabajo', 'día', 'semana', 'año',
      'hoy', 'mañana', 'ayer', 'bueno', 'malo', 'grande', 'pequeño', 'nuevo', 'viejo', 'mucho', 'poco', 'y', 'o', 'pero', 'en', 'con',
      'de', 'a', 'el', 'la', 'un', 'una', 'nombre', 'país', 'idioma', 'español', 'hora', 'lunes', 'viernes', 'domingo', 'desayuno',
      'almuerzo', 'cena', 'agua', 'pan', 'café', 'té', 'manzana', 'leche', 'habitación', 'puerta', 'ventana', 'mesa', 'silla', 'libro',
      'escribir', 'leer', 'escuchar', 'hablar', 'preguntar', 'responder', 'sí', 'no', 'por', 'favor', 'gracias', 'perdón', 'tienda',
      'dinero', 'precio', 'barato', 'caro', 'frío', 'calor', 'sol', 'lluvia', 'bonito', 'importante', 'aquí', 'allí',
    ],
    A2: [
      'viajar', 'vacaciones', 'tren', 'autobús', 'estación', 'aeropuerto', 'hotel', 'reservar', 'billete', 'maleta', 'pasaporte',
      'sano', 'enfermo', 'médico', 'farmacia', 'deporte', 'correr', 'nadar', 'tiempo', 'primavera', 'verano', 'otoño', 'invierno',
      'medios', 'televisión', 'radio', 'internet', 'correo', 'teléfono', 'mensaje', 'ocio', 'cine', 'música', 'concierto', 'museo',
      'comprado', 'ido', 'hecho', 'comido', 'bebido', 'querer', 'deber', 'poder', 'gustar', 'después', 'antes', 'a veces', 'a menudo',
      'mapa', 'mercado', 'restaurante', 'carta', 'cita', 'compras', 'ciudad', 'porque', 'cuando', 'antes', 'después',
    ],
    B1: [
      'medio', 'ambiente', 'sostenibilidad', 'energía', 'clima', 'reciclaje', 'residuo', 'jardín', 'comunidad', 'urbano', 'proyecto',
      'tendencia', 'razón', 'comida', 'producto', 'fresco', 'ecológico', 'demanda', 'oferta', 'informe', 'recomendar', 'consumo',
      'oficina', 'medir', 'publicar', 'porque', 'aunque', 'mientras', 'si', 'experiencia', 'evento', 'carta', 'viaje', 'interés',
      'situación', 'conversación', 'tema', 'entender', 'punto', 'programa', 'noticia', 'artículo', 'descripción', 'sentimiento',
      'personal', 'cotidiano', 'trabajo', 'educación', 'tecnología', 'salud', 'cultura', 'política', 'economía', 'desarrollo',
      'mejorar', 'reducir', 'transporte', 'opinión', 'plan', 'explicar', 'describir', 'vecino', 'habitante', 'cultivar', 'planta',
    ],
    B2: [
      'digitalización', 'sociedad', 'cambio', 'climático', 'innovación', 'ciencia', 'migración', 'integración', 'globalización',
      'economía', 'mercado', 'empresa', 'investigación', 'estudio', 'análisis', 'consecuencia', 'desafío', 'solución', 'estrategia',
      'discusión', 'argumento', 'ejemplo', 'estadística', 'tendencia', 'responsabilidad', 'democracia', 'política', 'hipótesis',
      'interpretación', 'controversia', 'aspecto', 'perspectiva', 'requisito', 'impacto', 'medida', 'implementar', 'evaluar',
      'prioridad', 'sin', 'embargo', 'además', 'mientras', 'que', 'por', 'tanto',
    ],
    C1: [
      'filosofía', 'ética', 'identidad', 'desigualdad', 'literatura', 'crítica', 'europeo', 'retórica', 'registro', 'matiz',
      'implícito', 'explícito', 'abstracto', 'concreto', 'discurso', 'paradigma', 'diferenciación', 'argumentación', 'tesis',
      'reflexión', 'contextualizar', 'complejidad', 'ambivalencia', 'legitimación', 'hegemonía', 'hermenéutica', 'epistemología',
    ],
    C2: [
      'filosofía', 'lenguaje', 'estética', 'teoría', 'social', 'intertextualidad', 'metáfora', 'estilística', 'retórica', 'ironía',
      'paradoja', 'subtexto', 'idiolecto', 'sociolecto', 'pragmática', 'semántica', 'morfología', 'sintaxis', 'prosodia',
      'análisis', 'discursivo', 'cultural', 'literaria', 'política',
    ],
  },
};

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

let written = 0;
for (const [lang, byLevel] of Object.entries(LISTS)) {
  for (const level of LEVELS) {
    const lemmas = [...new Set((byLevel[level] || []).map((w) => w.toLowerCase()))].sort();
    const dir = path.join(OUT, lang);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${level}.json`);
    const payload = {
      level,
      lang,
      source: 'partial-seed',
      todo: 'Replace with full Profile Deutsch / EVP / Plan Curricular inventory',
      lemmaCount: lemmas.length,
      lemmas,
    };
    fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    written++;
    console.log(`Wrote ${path.relative(ROOT, file)} (${lemmas.length} lemmas)`);
  }
}
console.log(`\nSeeded ${written} vocabulary files.`);
