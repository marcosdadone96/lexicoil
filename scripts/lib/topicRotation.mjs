/**
 * topicRotation.mjs — Variedad temática para generación masiva.
 *
 * Proporciona:
 *  - TOPICS: lista canónica de 15 temas B1
 *  - detectTopic(text): detecta el tema de un pasaje por palabras clave
 *  - pickNextTopic(generatedDir, module, teil): devuelve el tema menos usado en el banco
 *  - getTopicStats(generatedDir): estadísticas de uso por tema
 *  - injectTopicIntoPrompt(prompt, topic): añade la línea de tema obligatorio al prompt
 */

import fs from 'node:fs';
import path from 'node:path';

export const TOPICS = [
  'Reisen',
  'Gesundheit',
  'Arbeit',
  'Technik',
  'Wohnen',
  'Konsum',
  'Bildung',
  'Familie',
  'Umwelt',
  'Ernährung',
  'Kultur',
  'Sport',
  'Freizeit',
  'Verkehr',
  'Stadtleben',
];

/** Palabras clave → tema (orden importa: más específico primero) */
const TOPIC_KEYWORDS = {
  Reisen:     ['Urlaub', 'Reise', 'Flug', 'Koffer', 'Hotel', 'Ausland', 'Ticket', 'Bahnhof', 'Zugfahrt', 'Tourist'],
  Gesundheit: ['Arzt', 'Krankenhaus', 'krank', 'Medikament', 'Krankheit', 'Therapie', 'Impfung', 'Fitness', 'Ernährungsberater', 'Schmerz'],
  Arbeit:     ['Beruf', 'Stelle', 'Bewerbung', 'Chef', 'Kollege', 'Gehalt', 'Praktikum', 'Büro', 'Homeoffice', 'Arbeitgeber'],
  Technik:    ['Smartphone', 'Internet', 'App', 'Computer', 'digitale', 'Gerät', 'Software', 'Handy', 'Bildschirm', 'Technologie'],
  Wohnen:     ['Wohnung', 'Miete', 'Zimmer', 'Haus', 'Umzug', 'Nachbar', 'Küche', 'Schlafzimmer', 'Vermieter', 'Einzug'],
  Konsum:     ['kaufen', 'Einkauf', 'Supermarkt', 'Preis', 'Produkt', 'Angebot', 'Marke', 'Rabatt', 'Laden', 'Bestellung'],
  Bildung:    ['Schule', 'Studium', 'Universität', 'Prüfung', 'Kurs', 'Lehrer', 'Unterricht', 'Lernmaterial', 'Ausbildung', 'Abitur'],
  Familie:    ['Eltern', 'Kind', 'Schwester', 'Bruder', 'Großeltern', 'Mutter', 'Vater', 'Haushalt', 'Erziehung', 'Geschwister'],
  Umwelt:     ['Umwelt', 'Klima', 'Recycling', 'Plastik', 'Nachhaltigkeit', 'CO2', 'Energie', 'erneuerbar', 'Naturschutz', 'Müll'],
  Ernährung:  ['Essen', 'Kochen', 'Rezept', 'vegetarisch', 'vegan', 'Lebensmittel', 'Restaurant', 'Mahlzeit', 'Küche', 'Ernährung'],
  Kultur:     ['Theater', 'Konzert', 'Museum', 'Ausstellung', 'Film', 'Musik', 'Kunst', 'Kino', 'Festival', 'Veranstaltung'],
  Sport:      ['Sport', 'Fußball', 'Training', 'Wettkampf', 'Mannschaft', 'Schwimmen', 'Laufen', 'Turnier', 'Spiel', 'Vereinssport'],
  Freizeit:   ['Hobby', 'Wochenende', 'Freizeit', 'Freund', 'Party', 'Ausflug', 'Spaziergang', 'Garten', 'Lesen', 'Spielen'],
  Verkehr:    ['Bus', 'Fahrrad', 'Auto', 'Straße', 'Stau', 'ÖPNV', 'Bahn', 'Parkplatz', 'Führerschein', 'Fahrt'],
  Stadtleben: ['Stadt', 'Stadtmitte', 'Viertel', 'Bürger', 'Marktplatz', 'Innenstadt', 'öffentlich', 'Gemeinschaft', 'Engagement', 'Infrastruktur'],
};

/**
 * Detecta el tema dominante de un texto de pasaje.
 * Devuelve el topic con más hits, o null si empate vacío.
 */
export function detectTopic(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();
  const scores = {};
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    scores[topic] = keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : null;
}

/**
 * Lee todos los archivos generados y cuenta cuántas veces aparece cada topic.
 * Filtra por module y teil si se proporcionan.
 */
export function getTopicStats(generatedDir, { module = null, teil = null } = {}) {
  const counts = Object.fromEntries(TOPICS.map(t => [t, 0]));
  if (!fs.existsSync(generatedDir)) return counts;

  for (const filename of fs.readdirSync(generatedDir)) {
    if (!filename.endsWith('.json') || filename.startsWith('.')) continue;
    if (module) {
      const modMatch = filename.toLowerCase().startsWith(module.toLowerCase());
      if (!modMatch) continue;
    }
    if (teil != null) {
      const teilMatch = new RegExp(`-t${teil}-`).test(filename);
      if (!teilMatch) continue;
    }
    try {
      const batch = JSON.parse(fs.readFileSync(path.join(generatedDir, filename), 'utf8'));
      for (const p of batch.passages || []) {
        const tag = p.topicTag || detectTopic(p.text || p.title || '');
        if (tag && counts[tag] !== undefined) counts[tag]++;
      }
    } catch (_) { /* skip corrupt files */ }
  }
  return counts;
}

/**
 * Devuelve el tema menos usado en el banco para el módulo/teil dado.
 * En caso de empate, escoge aleatoriamente entre los menos usados.
 */
export function pickNextTopic(generatedDir, { module = null, teil = null } = {}) {
  const stats = getTopicStats(generatedDir, { module, teil });
  const minCount = Math.min(...Object.values(stats));
  const candidates = TOPICS.filter(t => stats[t] === minCount);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Inyecta la línea de tema obligatorio en un prompt ya construido.
 * Busca la sección PALABRAS OBJETIVO y añade TEMA antes de ella.
 */
export function injectTopicIntoPrompt(prompt, topic) {
  if (!topic) return prompt;
  const topicLine = `\n## TEMA OBLIGATORIO\nDesarrolla el contenido EXCLUSIVAMENTE en torno a: **${topic}**\nEl pasaje, los personajes y las preguntas deben girar en torno a este tema.\n`;

  // Insertar antes de PALABRAS OBJETIVO si existe, o al principio de AUTORREVISIÓN, o al final
  const marker = prompt.indexOf('## PALABRAS OBJETIVO');
  if (marker >= 0) return prompt.slice(0, marker) + topicLine + prompt.slice(marker);

  const marker2 = prompt.indexOf('## AUTORREVISIÓN');
  if (marker2 >= 0) return prompt.slice(0, marker2) + topicLine + prompt.slice(marker2);

  return prompt + topicLine;
}

/**
 * Añade topicTag a cada passage de un batch.
 * Si el pasaje ya tiene topicTag, lo respeta.
 */
export function tagBatchWithTopic(batch, topic) {
  if (!batch || !topic) return batch;
  const tagged = { ...batch };
  tagged.passages = (batch.passages || []).map(p => {
    if (p.topicTag) return p;
    const detected = detectTopic(p.text || p.title || '');
    return { ...p, topicTag: detected || topic };
  });
  return tagged;
}
