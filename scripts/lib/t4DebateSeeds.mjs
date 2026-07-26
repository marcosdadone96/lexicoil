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
import { checkPassageContentTopic } from './qualityGates/contentTopicCheck.mjs';
import { topicsAreCompatible } from './qualityGates/topicFamilies.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { TOPIC_KEYWORDS } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

/** Anclas escolares en la semilla → intro pesimista (LLM suele reforzarlas). */
const T4_SEED_SCHOOL_ANCHOR_RE =
  /\b(Schulen?|Unterricht|Schüler|Lehrer|Abitur|Universität|Prüfungsvorbereitung|Volkshochschule)\b/i;

/** Intro pesimista: refleja enriquecimiento típico del LLM (Schule/Lehrer/Kinder). */
export function wrapT4SeedPessimisticIntro(seed) {
  return (
    `In unserer Stadt diskutieren viele Eltern und Lehrer über einen neuen Vorschlag: ${seed} ` +
    `Viele Schüler und Kinder sind betroffen. Lesen Sie die Meinungen im Forum.`
  );
}

/** Intro mínima para semillas sin anclas escolares. */
export function wrapT4SeedMinimalIntro(seed) {
  return `In unserer Stadt diskutieren viele: ${seed} Lesen Sie die Meinungen im Forum.`;
}

export function wrapT4SeedPreflightIntro(seed) {
  return T4_SEED_SCHOOL_ANCHOR_RE.test(String(seed || ''))
    ? wrapT4SeedPessimisticIntro(seed)
    : wrapT4SeedMinimalIntro(seed);
}

/**
 * Preflight semilla T4 antes de llamar a la API (mismo criterio que poolReady intro).
 * @returns {{ ok: boolean, reason?: string, detected?: string|null, detail?: string }}
 */
export function checkT4DebateSeedPreflight(seed, topicTag) {
  const topic = normalizeB1Topic(topicTag);
  if (!topic || !seed) return { ok: false, reason: 'missing', detail: 'semilla o tema vacío' };

  const passage = {
    id: 't4-seed-preflight',
    title: 'Forum: Diskussion',
    text: wrapT4SeedPreflightIntro(seed),
    topicTag: topic,
  };
  const ct = checkPassageContentTopic(passage);
  if (ct.mismatch) {
    return {
      ok: false,
      reason: 'intro_topic_mismatch',
      detected: ct.detected,
      detail: ct.detail || ct.reason,
    };
  }

  let bestOther = null;
  let bestOtherHits = 0;
  const tagHits = countSeedTopicKeywordHits(seed, topic);
  for (const other of B1_TOPICS) {
    if (other === topic) continue;
    const otherHits = countSeedTopicKeywordHits(seed, other);
    if (otherHits > bestOtherHits) {
      bestOtherHits = otherHits;
      bestOther = other;
    }
    if (otherHits >= 2 && otherHits > tagHits) {
      const compat = topicsAreCompatible(topic, other);
      if (!compat.match) {
        return {
          ok: false,
          reason: 'seed_cross_topic_anchor',
          detected: other,
          detail: `semilla «${seed.slice(0, 60)}…» ancla «${other}» (${otherHits} kw) > «${topic}» (${tagHits})`,
        };
      }
    }
  }

  return { ok: true, tagHits, bestOther, bestOtherHits };
}

/** @type {Record<string, string[]>} */
export const T4_DEBATE_SEEDS = Object.freeze({
  Reisen: [
    'Reisende sollen am Bahnhof kostenlose Schließfächer für ihr Gepäck bekommen.',
    'Sollen Touristen in Hotels bei jeder Reise ins Ausland kostenloses Frühstück und WLAN ohne Mindestaufenthalt bekommen?',
    'Jeder Erwachsene soll einmal pro Jahr ein vergünstigtes Ticket für eine Zugfahrt ins Ausland bekommen.',
    'Am Flughafen sollen Reisende vor dem Flug kostenlose Wasserflaschen bekommen.',
    'Sollen Reisende mit dem Zug ins Ausland bis 23 Kilo Gepäck ohne Zuschlag mitnehmen dürfen?',
    'Soll am Bahnhof eine kostenlose Beratung für Urlaub, Ticket und Flug buchen für alle Touristen geben?',
  ],
  Gesundheit: [
    'Alle Erwachsenen sollen einmal pro Jahr kostenlose Vorsorge beim Arzt und eine Impfung bekommen.',
    'Apotheken sollen einfache Medikamente gegen Schmerzen ohne Rezept verkaufen dürfen.',
    'Krankenkassen sollen Fitnesskurse und Therapie für Versicherte bezahlen.',
    'Sollen Angehörige im Krankenhaus Patienten mit Schmerzen auch am Sonntag bis 20 Uhr besuchen dürfen?',
    'Sollen Hausärzte abends länger Sprechstunde für Erwachsene mit Schmerzen und Krankheit anbieten?',
    'Soll die Krankenkasse einmal pro Jahr einen Termin beim Ernährungsberater für jeden Versicherten bezahlen?',
  ],
  Arbeit: [
    'Alle Kollegen sollen nur vier Tage pro Woche im Büro arbeiten müssen.',
    'Firmen sollen mindestens zwei Tage Homeoffice pro Woche für alle Bürojobs verpflichtend ermöglichen.',
    'Praktikanten sollen vom Arbeitgeber immer ein faires Gehalt bekommen.',
    'Neue Kollegen sollen in den ersten drei Monaten einen festen Mentor im Beruf bekommen.',
    'Sollen Arbeitnehmer nach der Elternzeit garantiert dieselbe Stelle im Beruf behalten?',
    'Sollen Firmen für jede Bewerbung und Stellenanzeige innerhalb von zwei Wochen eine klare Antwort schicken?',
  ],
  Technik: [
    'Sollen Smartphones und Apps nach zwei Stunden Bildschirmzeit am Handy automatisch für Jugendliche sperren?',
    'Alle Haushalte sollen ein digitales Gerät für Behördengänge über das Internet bekommen.',
    'Sollen Jugendliche unter 16 Handys und Apps am Bildschirm nur mit Eltern-Code entsperren dürfen?',
    'Apps sollen für Nutzer unter 18 weniger persönliche Daten über das Internet sammeln dürfen.',
    'Sollen alle Haushalte kostenloses Internet und WLAN von der Stadt für Computer und digitale Geräte bekommen?',
    'Soll jeder Haushalt einmal pro Jahr kostenlosen Support für Computer, Internet und digitale Geräte bekommen?',
  ],
  Medien: [
    'Die lokale Zeitung soll kostenlos online für alle Bürger verfügbar sein.',
    'Nachrichten im Radio sollen jeden Abend stärker über lokale Themen berichten.',
    'Jugendliche unter 16 sollen Social-Media-Apps und Online-Plattformen nur mit Erlaubnis der Eltern nutzen.',
    'Jeder Bürger soll jeden Morgen einen kostenlosen Nachrichten-Podcast der Stadt hören können.',
    'Sollen Werbung und Pop-ups auf Online-Seiten der lokalen Zeitung und Medien der Stadt deaktivierbar sein?',
    'Soll es eine Pflicht geben, dass Nachrichten im Radio Fake-News und Fehlinformation klar kennzeichnen?',
  ],
  Wohnen: [
    'Vermieter sollen Mieterhöhungen in der Wohnung nur einmal pro Jahr machen dürfen.',
    'Neue Wohnungen sollen mindestens drei Zimmer für Familien haben.',
    'Beim Umzug in eine neue Wohnung soll die Stadt kostenlose Transporter anbieten.',
    'In Wohngebieten sollen Nachbarn in der Wohnung über laute Musik nach 22 Uhr klagen können.',
    'Sollen Mieter in der Wohnung eine Kündigungsfrist von mindestens sechs Monaten haben?',
    'Sollen Vermieter leere Wohnung und Zimmer mit niedriger Miete schneller an neue Mieter vermitteln?',
  ],
  Konsum: [
    'Der Supermarkt soll am Sonntag für den Einkauf geöffnet sein.',
    'Online-Bestellungen sollen ohne extra Preis kostenlose Rücksendung haben.',
    'Preise in Geschäften sollen auf dem Produkt in großer Schrift stehen.',
    'Rabatt-Aktionen im Laden sollen klar erkennbar und fair sein.',
    'Sollen Geschäfte Pfand auf alle Plastikflaschen beim Einkauf im Laden erheben?',
    'Soll es ein gesetzliches Rückgaberecht von vierzehn Tagen für jedes Online-Produkt beim Einkauf geben?',
  ],
  Bildung: [
    'Alle Schüler sollen vor dem Abitur kostenlose Lernmaterialien vom Lehrer bekommen.',
    'Die Universität soll mehr Plätze für ein Studium ohne Numerus clausus anbieten.',
    'Kurse in der Volkshochschule sollen für alle Erwachsenen günstiger werden.',
    'An Schulen soll es mehr Zeit für Prüfungsvorbereitung im Unterricht geben.',
    'Auszubildende sollen in der Berufsschule mehr praktische Übungen für die Prüfung machen dürfen.',
    'Berufsschüler sollen kostenlosen Zugang zu Online-Kursen für Prüfungsvorbereitung bekommen.',
    'Erwachsene sollen einmal pro Jahr einen Rabatt auf Sprachkurse in der Volkshochschule erhalten.',
    'Sollen alle Auszubildenden in der Ausbildung einen festen Prüfungsmentor von der Berufsschule bekommen?',
    'Soll die Universität mehr Online-Kurse für Erwachsene mit Beruf und Studium parallel anbieten?',
  ],
  Familie: [
    'Eltern sollen zwei Monate bezahlte Elternzeit extra bekommen, wenn sie ein zweites Kind bekommen.',
    'Großeltern sollen kostenlose Fahrtkarten bekommen, wenn sie ihre Enkel regelmäßig betreuen.',
    'Alle Familien mit Kindern sollen einen festen Erziehungsberater von der Stadt bekommen.',
    'Geschwister sollen getrennt werden, damit jedes Kind in der Schule fair startet.',
    'Sollen Alleinerziehende monatlich einen Zuschuss für Kinderbetreuung und Haushalt von der Stadt bekommen?',
    'Soll es in jedem Viertel einen Familien-Treff mit Beratung zu Erziehung und Alltag geben?',
  ],
  Umwelt: [
    'Haushalte müssen Plastik und Restmüll noch genauer trennen; bei Fehlern drohen Bußgelder.',
    'In der Stadt sollen nur Autos fahren, die wenig CO2 ausstoßen und die Umwelt schützen.',
    'Alle Gebäude sollen bis 2030 nur noch erneuerbare Energie zum Heizen nutzen.',
    'Jeder Bürger soll Pfandflaschen aus Plastik und Recycling-Material beim Einkauf bekommen.',
    'Sollen Supermärkte beim Einkauf keine Einweg-Plastiktüten mehr ausgeben, um Plastik und Umwelt zu schützen?',
    'Soll die Stadt mehr Bäume pflanzen, damit weniger CO2 in der Luft bleibt und die Umwelt geschützt wird?',
  ],
  Ernährung: [
    'Sollen Kantinen in Betrieben nur noch vegetarische Mahlzeiten und frisches Essen aus Lebensmitteln anbieten?',
    'Sollen Betriebskantinen veganes Essen und vegetarische Mahlzeiten aus regionalen Lebensmitteln anbieten?',
    'Alle Kitas sollen täglich frisches Essen aus regionalen Lebensmitteln kochen.',
    'Restaurants sollen täglich ein günstiges Essen als Mahlzeit anbieten.',
    'Sollen Lebensmittel mit viel Zucker teurer sein, um gesunde Ernährung und gutes Essen zu fördern?',
    'Soll die Stadt jeden Samstag einen Markt für regionale Lebensmittel und frisches Essen organisieren?',
  ],
  Kultur: [
    'Das Museum soll am Sonntag eine Gratis-Ausstellung für alle Besucher anbieten.',
    'Die Stadt soll ein neues Festival für Musik und Kunst im Sommer organisieren.',
    'Sollen Kino-Tickets für Filme und Ausstellungen im Museum für junge Besucher günstiger sein?',
    'Jeder Bürger soll einmal pro Jahr ein Konzert im Theater günstiger besuchen können.',
    'Sollen Bibliotheken kostenlose Eintrittskarten für Konzert, Theater und Museum vermitteln?',
    'Soll die Stadt jedes Jahr ein Stadtfest mit Musik, Kunst und Film im Freien finanzieren?',
  ],
  Sport: [
    'In Stadtparks sollen kostenlose Fitnessgeräte für Training und Sport aufgestellt werden.',
    'Sportvereine sollen mehr Trainingseinheiten für Mannschaftssport wie Fußball anbieten.',
    'Kinder sollen gratis Schwimmen und anderen Sport im Hallenbad machen dürfen.',
    'Die Stadt soll jedes Jahr ein großes Turnier für Vereinssport organisieren.',
    'Sollen Sportvereine abends ihre Hallen für Mannschaftssport, Fußball und Training kostenlos öffnen?',
    'Soll die Stadt mehr Laufstrecken und Fitnessgeräte in Parks für Sport und Training einrichten?',
  ],
  Freizeit: [
    'Die Stadt soll mehr kostenlose Hobby-Kurse am Wochenende anbieten.',
    'Bibliotheken sollen auch sonntags geöffnet sein für Lesen in der Freizeit.',
    'Jeder Bürger soll pro Jahr einen Gutschein für Ausflug und Spaziergang bekommen.',
    'In Parks sollen Plätze zum Spielen und Treffen mit Freunden eingerichtet werden.',
    'Sollen Jugendliche unter 18 freien Eintritt in das Freizeitzentrum am Wochenende bekommen?',
    'Soll die Stadt mehr Gratis-Plätze für Garten, Basteln und Hobby im Viertel einrichten?',
  ],
  Verkehr: [
    'Bus und Bahn in der Stadt sollen für alle kostenlos sein.',
    'Für jeden Erwachsenen soll es einen sicheren Fahrradweg ohne Stau geben.',
    'Parkplätze in der Straße sollen teurer werden, damit weniger Stau entsteht.',
    'Alle Jugendlichen sollen den Führerschein schon mit 17 Jahren für die Fahrt machen dürfen.',
    'Sollen E-Autos und Fahrräder mehr kostenlose Parkplätze in der Straße bekommen als andere Autos?',
    'Soll der Nachtbus und die Bahn am Wochenende bis 2 Uhr fahren, damit die Fahrt mit ÖPNV sicher ist?',
  ],
  Stadtleben: [
    'In jedem Viertel soll es einen Treffpunkt für Engagement in der Gemeinschaft geben.',
    'Die Innenstadt soll an Samstagen autofrei für Fußgänger sein.',
    'Die Stadtmitte soll mehr öffentliche Bänke und Trinkwasser für alle Bürger bekommen.',
    'Der Marktplatz soll am Abend für Veranstaltung und Treffen in der Stadt geöffnet bleiben.',
    'Sollen Bürger in der Stadtmitte nachts mehr Licht und Sicherheit auf dem Marktplatz bekommen?',
    'Soll jedes Viertel einen monatlichen Markt für Handwerk, Essen und Treffen in der Gemeinschaft haben?',
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
 * Salta semillas que fallen preflight intro (deriva temática).
 * @returns {{ seed: string, index: number, tier: 'fresh'|'saturated', topic?: string, preflightSkipped?: object[] }}
 */
export function pickNextT4DebateSeed(excludeSeeds = [], slotIndex = 0, topicTag = null) {
  const topic = normalizeB1Topic(topicTag);
  const seeds = topic ? getSeedsForTopic(topic) : [];
  if (!seeds.length) {
    return { seed: null, index: -1, tier: 'missing', topic };
  }

  const excluded = new Set((excludeSeeds || []).filter(Boolean));
  const preflightSkipped = [];

  function seedUsable(seed) {
    if (textMatchesExcludedPremise(seed)) return false;
    const pf = checkT4DebateSeedPreflight(seed, topic);
    if (!pf.ok) {
      preflightSkipped.push({ seed, ...pf });
      return false;
    }
    return true;
  }

  for (let i = 0; i < seeds.length; i += 1) {
    if (excluded.has(seeds[i])) continue;
    if (!seedUsable(seeds[i])) continue;
    return { seed: seeds[i], index: i, tier: 'fresh', topic, preflightSkipped };
  }

  for (let i = 0; i < seeds.length; i += 1) {
    if (!seedUsable(seeds[i])) continue;
    return { seed: seeds[i], index: i, tier: 'saturated', topic, preflightSkipped };
  }

  const idx = slotIndex % seeds.length;
  const fallback = seeds[idx];
  if (fallback && seedUsable(fallback)) {
    return { seed: fallback, index: idx, tier: 'saturated', topic, preflightSkipped };
  }
  return { seed: null, index: -1, tier: 'exhausted', topic, preflightSkipped };
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
