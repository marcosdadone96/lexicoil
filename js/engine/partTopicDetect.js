'use strict';

/**
 * B1 topic detection by keyword hits — shared terminal, Netlify, pool index.
 */

const TOPIC_KEYWORDS = Object.freeze({
  Reisen:     ['Urlaub', 'Reise', 'Flug', 'Koffer', 'Hotel', 'Ausland', 'Ticket', 'Bahnhof', 'Zugfahrt', 'Tourist'],
  Gesundheit: ['Arzt', 'Krankenhaus', 'krank', 'Medikament', 'Krankheit', 'Therapie', 'Impfung', 'Fitness', 'Ernährungsberater', 'Schmerz'],
  Arbeit:     ['Beruf', 'Stelle', 'Bewerbung', 'Chef', 'Kollege', 'Gehalt', 'Praktikum', 'Büro', 'Homeoffice', 'Arbeitgeber', 'Weiterbildung', 'Arbeitnehmer'],
  Technik:    ['Smartphone', 'Internet', 'App', 'Computer', 'digitale', 'Gerät', 'Software', 'Handy', 'Bildschirm', 'Technologie'],
  Medien:     ['Medien', 'Nachrichten', 'Zeitung', 'Fernsehen', 'Radio', 'Social', 'Online', 'Blog', 'Podcast', 'Kommunikation'],
  Wohnen:     ['Wohnung', 'Miete', 'Zimmer', 'Haus', 'Umzug', 'Nachbar', 'Küche', 'Schlafzimmer', 'Vermieter', 'Einzug'],
  Konsum:     ['kaufen', 'Einkauf', 'Supermarkt', 'Preis', 'Produkt', 'Angebot', 'Marke', 'Rabatt', 'Laden', 'Bestellung'],
  Bildung:    ['Schule', 'Studium', 'Universität', 'Prüfung', 'Kurs', 'Lehrer', 'Unterricht', 'Lernmaterial', 'Ausbildung', 'Abitur'],
  Familie:    ['Familie', 'Familien', 'Eltern', 'Kind', 'Kinder', 'Tochter', 'Sohn', 'Schwester', 'Bruder', 'Großeltern', 'Großmutter', 'Großvater', 'Mutter', 'Vater', 'Haushalt', 'Erziehung', 'Geschwister', 'Enkel', 'Enkelin', 'Oma', 'Opa', 'Baby'],
  Umwelt:     ['Umwelt', 'Klima', 'Recycling', 'Plastik', 'Nachhaltigkeit', 'CO2', 'Energie', 'erneuerbar', 'Naturschutz', 'Müll'],
  Ernährung:  ['Essen', 'Kochen', 'Rezept', 'vegetarisch', 'vegan', 'Lebensmittel', 'Restaurant', 'Mahlzeit', 'Küche', 'Ernährung'],
  Kultur:     ['Theater', 'Konzert', 'Museum', 'Ausstellung', 'Film', 'Musik', 'Kunst', 'Kino', 'Festival', 'Veranstaltung'],
  Sport:      [
    'Sport', 'Fußball', 'Training', 'Wettkampf', 'Mannschaft', 'Schwimmen', 'Laufen', 'Turnier', 'Spiel', 'Vereinssport',
    // Plurals / agents / race vocabulary (word-boundary scoring misses these via stem «Sport»/«Laufen»)
    'Läufer', 'Läuferin', 'Läuferinnen', 'Sportler', 'Sportlerin', 'Sportlerinnen',
    'Strecke', 'Teilnehmer', 'Teilnehmerin', 'Teilnehmerinnen', 'Stadtlauf', 'Yoga', 'Fitness',
  ],
  Freizeit:   ['Hobby', 'Wochenende', 'Freizeit', 'Freund', 'Party', 'Ausflug', 'Spaziergang', 'Garten', 'Lesen', 'Spielen', 'Freizeitzentrum', 'Klavier', 'Basteln', 'Schnupperkurs', 'Spielzimmer'],
  Verkehr:    ['Bus', 'Fahrrad', 'Auto', 'Straße', 'Stau', 'ÖPNV', 'Bahn', 'Parkplatz', 'Führerschein', 'Fahrt'],
  Stadtleben: ['Stadt', 'Stadtmitte', 'Viertel', 'Bürger', 'Marktplatz', 'Innenstadt', 'öffentlich', 'Gemeinschaft', 'Engagement', 'Infrastruktur'],
});

function detectTopic(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();
  const scores = {};
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    scores[topic] = keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : null;
}

if (typeof module !== 'undefined') {
  module.exports = { TOPIC_KEYWORDS, detectTopic };
}
