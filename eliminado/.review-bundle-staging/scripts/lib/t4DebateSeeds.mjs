// REVISAR HUMANO: validar alemán B1 y alineación temática antes de producción.
/**
 * Premisas de debate T4 fijadas por topicTag — evita anclaje Stadtleben del ejemplo de plantilla.
 * Cada Vorschlag: Ja/Nein para 7 personas; vocabulario B1; inequívoco dentro del topicTag.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeB1Topic, B1_TOPICS } from './b1Topics.mjs';
import { textMatchesExcludedPremise } from './excludedPremises.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { TOPIC_KEYWORDS } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

/** @type {Record<string, string[]>} */
export const T4_DEBATE_SEEDS = Object.freeze({
  Reisen: [
    'Reisende sollen am Bahnhof kostenlose Schließfächer für ihr Gepäck bekommen.',
    'Hotels dürfen Touristen keinen Mindestaufenthalt von drei Nächten mehr verlangen.',
    'Jeder Erwachsene soll einmal pro Jahr ein vergünstigtes Ticket für eine Zugfahrt ins Ausland bekommen.',
    'Am Flughafen sollen Reisende vor dem Flug kostenlose Wasserflaschen bekommen.',
  ],
  Gesundheit: [
    'Alle Erwachsenen sollen einmal pro Jahr kostenlose Vorsorge beim Arzt und eine Impfung bekommen.',
    'Apotheken sollen einfache Medikamente gegen Schmerzen ohne Rezept verkaufen dürfen.',
    'Krankenkassen sollen Fitnesskurse und Therapie für Versicherte bezahlen.',
    'Besuchszeiten im Krankenhaus sollen am Wochenende verlängert werden.',
  ],
  Arbeit: [
    'Alle Kollegen sollen nur vier Tage pro Woche im Büro arbeiten müssen.',
    'Firmen sollen mindestens zwei Tage Homeoffice pro Woche für alle Bürojobs verpflichtend ermöglichen.',
    'Praktikanten sollen vom Arbeitgeber immer ein faires Gehalt bekommen.',
    'Neue Kollegen sollen in den ersten drei Monaten einen festen Mentor im Beruf bekommen.',
  ],
  Technik: [
    'Smartphones sollen nach zwei Stunden Bildschirmzeit pro Tag Apps automatisch sperren.',
    'Alle Haushalte sollen ein digitales Gerät für Behördengänge über das Internet bekommen.',
    'Private Handys sollen in der Schule jede Stunde am Bildschirm gesperrt werden.',
    'Apps sollen für Nutzer unter 18 weniger persönliche Daten über das Internet sammeln dürfen.',
  ],
  Medien: [
    'Die lokale Zeitung soll kostenlos online für alle Bürger verfügbar sein.',
    'Nachrichten im Radio sollen jeden Abend stärker über lokale Themen berichten.',
    'Jugendliche unter 16 sollen Social-Media-Apps und Online-Plattformen nur mit Erlaubnis der Eltern nutzen.',
    'Jeder Bürger soll jeden Morgen einen kostenlosen Nachrichten-Podcast der Stadt hören können.',
  ],
  Wohnen: [
    'Vermieter sollen Mieterhöhungen in der Wohnung nur einmal pro Jahr machen dürfen.',
    'Neue Wohnungen sollen mindestens drei Zimmer für Familien haben.',
    'Beim Umzug in eine neue Wohnung soll die Stadt kostenlose Transporter anbieten.',
    'In Wohngebieten sollen Nachbarn in der Wohnung über laute Musik nach 22 Uhr klagen können.',
  ],
  Konsum: [
    'Der Supermarkt soll am Sonntag für den Einkauf geöffnet sein.',
    'Online-Bestellungen sollen ohne extra Preis kostenlose Rücksendung haben.',
    'Preise in Geschäften sollen auf dem Produkt in großer Schrift stehen.',
    'Rabatt-Aktionen im Laden sollen klar erkennbar und fair sein.',
  ],
  Bildung: [
    'Alle Schüler sollen vor dem Abitur kostenlose Lernmaterialien vom Lehrer bekommen.',
    'Die Universität soll mehr Plätze für ein Studium ohne Numerus clausus anbieten.',
    'Kurse in der Volkshochschule sollen für alle Erwachsenen günstiger werden.',
    'An Schulen soll es mehr Zeit für Prüfungsvorbereitung im Unterricht geben.',
  ],
  Familie: [
    'Eltern sollen zwei Monate bezahlte Elternzeit extra bekommen, wenn sie ein zweites Kind bekommen.',
    'Großeltern sollen kostenlose Fahrtkarten bekommen, wenn sie ihre Enkel regelmäßig betreuen.',
    'Alle Familien mit Kindern sollen einen festen Erziehungsberater von der Stadt bekommen.',
    'Geschwister sollen getrennt werden, damit jedes Kind in der Schule fair startet.',
  ],
  Umwelt: [
    'Haushalte müssen Plastik und Restmüll noch genauer trennen; bei Fehlern drohen Bußgelder.',
    'In der Stadt sollen nur Autos fahren, die wenig CO2 ausstoßen und die Umwelt schützen.',
    'Alle Gebäude sollen bis 2030 nur noch erneuerbare Energie zum Heizen nutzen.',
    'Jeder Bürger soll Pfandflaschen aus Plastik und Recycling-Material beim Einkauf bekommen.',
  ],
  Ernährung: [
    'In Kantinen soll es nur noch vegetarisches Mittagessen geben.',
    'Schulen sollen kostenlose vegane Mahlzeiten für alle Schüler anbieten.',
    'Alle Kitas sollen täglich frisches Essen aus regionalen Lebensmitteln kochen.',
    'Restaurants sollen täglich ein günstiges Essen als Mahlzeit anbieten.',
  ],
  Kultur: [
    'Das Museum soll am Sonntag eine Gratis-Ausstellung für alle Besucher anbieten.',
    'Die Stadt soll ein neues Festival für Musik und Kunst im Sommer organisieren.',
    'Kino-Tickets für Filme sollen für Schüler halb so teuer sein.',
    'Jeder Bürger soll einmal pro Jahr ein Konzert im Theater günstiger besuchen können.',
  ],
  Sport: [
    'In Stadtparks sollen kostenlose Fitnessgeräte für Training und Sport aufgestellt werden.',
    'Schulen sollen mehr Zeit für Mannschaftssport wie Fußball im Unterricht haben.',
    'Kinder sollen gratis Schwimmen und anderen Sport im Hallenbad machen dürfen.',
    'Die Stadt soll jedes Jahr ein großes Turnier für Vereinssport organisieren.',
  ],
  Freizeit: [
    'Die Stadt soll mehr kostenlose Hobby-Kurse am Wochenende anbieten.',
    'Bibliotheken sollen auch sonntags geöffnet sein für Lesen in der Freizeit.',
    'Jeder Bürger soll pro Jahr einen Gutschein für Ausflug und Spaziergang bekommen.',
    'In Parks sollen Plätze zum Spielen und Treffen mit Freunden eingerichtet werden.',
  ],
  Verkehr: [
    'Bus und Bahn in der Stadt sollen für alle kostenlos sein.',
    'Für jeden Erwachsenen soll es einen sicheren Fahrradweg ohne Stau geben.',
    'Parkplätze in der Straße sollen teurer werden, damit weniger Stau entsteht.',
    'Alle Jugendlichen sollen den Führerschein schon mit 17 Jahren für die Fahrt machen dürfen.',
  ],
  Stadtleben: [
    'In jedem Viertel soll es einen Treffpunkt für Engagement in der Gemeinschaft geben.',
    'Die Innenstadt soll an Samstagen autofrei für Fußgänger sein.',
    'Die Stadtmitte soll mehr öffentliche Bänke und Trinkwasser für alle Bürger bekommen.',
    'Der Marktplatz soll am Abend für Veranstaltung und Treffen in der Stadt geöffnet bleiben.',
  ],
});

export function countSeedTopicKeywordHits(seed, topic) {
  const keywords = TOPIC_KEYWORDS[topic];
  if (!keywords || !seed) return 0;
  const lower = String(seed).toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
}

export function getSeedsForTopic(topicTag) {
  const topic = normalizeB1Topic(topicTag);
  if (!topic) return [];
  return T4_DEBATE_SEEDS[topic] || [];
}

/**
 * Rota entre seeds del topicTag, excluyendo los ya usados (pool + sesión CHK-29).
 * @returns {{ seed: string, index: number, tier: 'fresh'|'saturated' }}
 */
export function pickNextT4DebateSeed(excludeSeeds = [], slotIndex = 0, topicTag = null) {
  const topic = normalizeB1Topic(topicTag);
  const seeds = topic ? getSeedsForTopic(topic) : [];
  if (!seeds.length) {
    return { seed: null, index: -1, tier: 'missing', topic };
  }

  const excluded = new Set((excludeSeeds || []).filter(Boolean));
  for (let i = 0; i < seeds.length; i += 1) {
    if (excluded.has(seeds[i])) continue;
    if (textMatchesExcludedPremise(seeds[i])) continue;
    return { seed: seeds[i], index: i, tier: 'fresh', topic };
  }

  for (let i = 0; i < seeds.length; i += 1) {
    if (textMatchesExcludedPremise(seeds[i])) continue;
    return { seed: seeds[i], index: i, tier: 'saturated', topic };
  }

  const idx = slotIndex % seeds.length;
  return { seed: seeds[idx], index: idx, tier: 'saturated', topic };
}

/** Dev-only: validar ≥2 keywords TOPIC_KEYWORDS por seed. */
export function validateT4DebateSeeds() {
  const errors = [];
  for (const topic of B1_TOPICS) {
    const seeds = T4_DEBATE_SEEDS[topic];
    if (!seeds?.length) {
      errors.push(`${topic}: sin seeds`);
      continue;
    }
    for (const seed of seeds) {
      const hits = countSeedTopicKeywordHits(seed, topic);
      if (hits < 2) errors.push(`${topic}: «${seed}» solo ${hits} keyword(s)`);
    }
  }
  return { ok: errors.length === 0, errors };
}
