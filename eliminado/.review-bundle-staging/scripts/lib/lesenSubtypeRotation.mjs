/**
 * lesenSubtypeRotation.mjs — Rotación de subtipos estructurales (Teil 5) + exclude molds por celda.
 *
 * Evita monotonía estructural (mismo molde, palabras distintas) dentro de topicTag × teil.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';
import { extractRecordPassageText } from './publishToPool.mjs';
import { pickNextT4DebateSeed } from './t4DebateSeeds.mjs';
import { subtypeMatchesExcludedPremise } from './excludedPremises.mjs';

const require = createRequire(import.meta.url);
const { normalizeB1Topic } = require(path.join(ROOT, 'js/data/b1Topics.js'));

/** Subtipos reales Goethe Lesen T5 — texto normativo B1, dominios distintos. */
export const LESEN_T5_SUBTYPES = Object.freeze([
  {
    id: 'wohnanlage',
    label: 'Wohnanlage-Hausordnung',
    setting: 'Regeln einer Wohnanlage / Mehrfamilienhaus',
    titleExample: 'Regeln in der Wohnanlage …',
    ruleFocus: 'Ruhezeiten, Mülltrennung, Waschküche, Fahrräder im Keller, Gästeparkplätze',
    keywords: /wohnanlage|bewohner|nachbar|hausverwaltung|wohnung/i,
  },
  {
    id: 'schule',
    label: 'Schul-/Ausbildungsordnung',
    setting: 'Ordnung auf dem Schulareal / Berufsbildungszentrum',
    titleExample: 'Hausordnung — Berufsbildungszentrum …',
    ruleFocus: 'Fahrräder, Klassenräume außerhalb Unterricht, Alkohol, Ordnung und Sauberkeit',
    keywords: /schul|berufsbildung|schüler|lernende|klassenraum|unterricht/i,
  },
  {
    id: 'bibliothek',
    label: 'Bibliotheksordnung',
    setting: 'Regeln der Stadtbibliothek / Medienzentrum',
    titleExample: 'Bibliotheksordnung der Stadtbibliothek …',
    ruleFocus: 'Ausleihe, Leihfrist, Ruhe, Medien, Gebühren bei Verspätung, Öffnungszeiten',
    keywords: /bibliothek|ausleihe|medien|leihfrist|bücher/i,
  },
  {
    id: 'sportverein',
    label: 'Sportverein / Fitnessstudio',
    setting: 'Nutzungsordnung eines Sportvereins oder Fitnessstudios',
    titleExample: 'Regeln im Turnverein … / Nutzungsordnung Fitnessstudio …',
    ruleFocus: 'Mitgliedschaft, Hallennutzung, Schließfächer, Sauna/Dusche, Anmeldung Kurse',
    keywords: /sportverein|turnverein|fitness|training|mitglied|halle/i,
  },
  {
    id: 'kantine',
    label: 'Kantinen-/Mensaordnung',
    setting: 'Regeln der Betriebskantine / Mensa / Cafeteria',
    titleExample: 'Hausordnung der Mensa …',
    ruleFocus: 'Essenszeiten, Vorbestellung, Hygiene, Rückgabe Tablett, Gäste, Bezahlung',
    keywords: /mensa|kantine|cafeteria|speise|mittagessen/i,
  },
  {
    id: 'park',
    label: 'Park-/Nutzungsordnung',
    setting: 'Stadtpark, Spielplatz oder öffentliche Grünanlage',
    titleExample: 'Nutzungsordnung Stadtpark …',
    ruleFocus: 'Hunde an der Leine, Grillen, Öffnungszeiten, Spielplatz, Müll, Fahrräder, Parzellenpflege',
    keywords: /stadtpark|spielplatz|grünanlage|parkordnung|hunde|grillen|gemeinschaftsgarten|stadtgarten/i,
  },
  {
    id: 'freizeitzentrum',
    label: 'Freizeitzentrum / Hallenbad',
    setting: 'Regeln eines Freizeitzentrums, Hallenbads oder Bürgerzentrums',
    titleExample: 'Regeln im Freizeitzentrum …',
    ruleFocus: 'Öffnungszeiten, Parkplatz, Ruhezeiten, Schwimmbad-Regeln, Raumnutzung',
    keywords: /freizeitzentrum|hallenbad|schwimmbad|bürgerzentrum|freibad/i,
  },
]);

export function defaultPoolFile(lang, level) {
  return path.join(ROOT, 'library', 'reusable-seed', `${String(lang || 'de').toLowerCase()}_${String(level || 'B1').toUpperCase()}.json`);
}

export function loadPoolRecords(opts = {}) {
  const file = opts.poolFile || defaultPoolFile(opts.lang, opts.level);
  if (!fs.existsSync(file)) return [];
  try {
    const pool = JSON.parse(fs.readFileSync(file, 'utf8'));
    return pool.records || [];
  } catch {
    return [];
  }
}

export function filterCellRecords(records, { lang, level, module = 'lesen', teil, topicTag }) {
  const topic = topicTag != null ? normalizeB1Topic(topicTag) : null;
  return (records || []).filter((r) => {
    if (r.disabled === true) return false;
    if (String(r.lang || '').toLowerCase() !== String(lang || 'de').toLowerCase()) return false;
    if (String(r.level || '').toUpperCase() !== String(level || 'B1').toUpperCase()) return false;
    if (String(r.module || 'lesen').toLowerCase() !== String(module).toLowerCase()) return false;
    if (Number(r.teil) !== Number(teil)) return false;
    if (topic && normalizeB1Topic(r.topicTag) !== topic) return false;
    return r.verified === true || r.complete === true;
  });
}

export function getSubtypeById(id) {
  return LESEN_T5_SUBTYPES.find((s) => s.id === id) || null;
}

/** Infer T5 structural subtype from seed/batch record. */
export function detectT5Subtype(record) {
  const title = String(record?.passage?.title || record?.passages?.[0]?.title || '');
  const fullText = `${title}\n${extractRecordPassageText(record)}`;
  const priority = ['freizeitzentrum', 'bibliothek', 'schule', 'kantine', 'park', 'sportverein', 'wohnanlage'];
  for (const id of priority) {
    if (getSubtypeById(id)?.keywords.test(title)) return id;
  }
  if (record?.textSubtype && getSubtypeById(record.textSubtype)) return record.textSubtype;
  for (const id of priority) {
    if (getSubtypeById(id)?.keywords.test(fullText)) return id;
  }
  if (/regeln|ordnung|hausordnung|richtlinie|satzung/i.test(fullText)) return 'wohnanlage';
  return null;
}

/** Neutral subtypes — coherent fallback when topic-preferred slots are saturated. */
export const T5_NEUTRAL_SUBTYPES = Object.freeze(['bibliothek', 'kantine', 'park']);

/** Last resort — only when preferred + neutral are exhausted (avoid for mismatched topics). */
export const T5_GENERIC_LAST_RESORT = Object.freeze(['wohnanlage', 'schule']);

/**
 * Preferred T5 subtypes per B1 topicTag (first unused wins).
 * Order = thematic fit, not catalog order.
 */
export const T5_TOPIC_SUBTYPE_PREFERENCE = Object.freeze({
  Freizeit: ['sportverein', 'freizeitzentrum', 'bibliothek', 'park', 'kantine'],
  Technik: ['bibliothek', 'schule', 'freizeitzentrum', 'sportverein', 'kantine'],
  Wohnen: ['wohnanlage', 'park', 'kantine', 'bibliothek', 'freizeitzentrum'],
  Bildung: ['schule', 'bibliothek', 'kantine', 'freizeitzentrum', 'sportverein'],
  Ernährung: ['kantine', 'bibliothek', 'park', 'sportverein'],
  Sport: ['sportverein', 'freizeitzentrum', 'park', 'bibliothek', 'kantine'],
  Gesundheit: ['sportverein', 'freizeitzentrum', 'kantine', 'bibliothek', 'park'],
  Arbeit: ['kantine', 'schule', 'bibliothek', 'wohnanlage'],
  Medien: ['bibliothek', 'schule', 'freizeitzentrum', 'kantine'],
  Kultur: ['bibliothek', 'freizeitzentrum', 'park', 'kantine', 'sportverein'],
  Umwelt: ['park', 'bibliothek', 'kantine', 'sportverein'],
  Familie: ['park', 'bibliothek', 'freizeitzentrum', 'sportverein', 'kantine'],
  Reisen: ['bibliothek', 'freizeitzentrum', 'kantine', 'park'],
  Verkehr: ['park', 'schule', 'bibliothek', 'wohnanlage'],
  Konsum: ['kantine', 'bibliothek', 'park', 'sportverein'],
  Stadtleben: ['park', 'bibliothek', 'freizeitzentrum', 'kantine', 'sportverein'],
});

const ALL_T5_IDS = LESEN_T5_SUBTYPES.map((s) => s.id);

/**
 * Candidate order for a topic: preferred → neutral → other non-generic → last resort.
 */
export function buildT5SubtypeCandidateOrder(topicTag) {
  const topic = topicTag ? normalizeB1Topic(topicTag) : null;
  const preferred = topic && T5_TOPIC_SUBTYPE_PREFERENCE[topic]
    ? [...T5_TOPIC_SUBTYPE_PREFERENCE[topic]]
    : [...T5_NEUTRAL_SUBTYPES, ...ALL_T5_IDS.filter((id) => !T5_GENERIC_LAST_RESORT.includes(id))];

  const seen = new Set();
  const ordered = [];
  const add = (id) => {
    if (!id || seen.has(id) || !getSubtypeById(id)) return;
    seen.add(id);
    ordered.push(id);
  };

  for (const id of preferred) add(id);
  for (const id of T5_NEUTRAL_SUBTYPES) add(id);
  for (const id of ALL_T5_IDS) {
    if (!T5_GENERIC_LAST_RESORT.includes(id)) add(id);
  }
  for (const id of T5_GENERIC_LAST_RESORT) add(id);
  return ordered;
}

/** Which tier picked the subtype (for logging). */
export function classifyT5PickTier(subtypeId, topicTag) {
  const topic = topicTag ? normalizeB1Topic(topicTag) : null;
  const preferred = topic && T5_TOPIC_SUBTYPE_PREFERENCE[topic];
  if (preferred?.includes(subtypeId)) return 'preferred';
  if (T5_NEUTRAL_SUBTYPES.includes(subtypeId)) return 'neutral';
  if (T5_GENERIC_LAST_RESORT.includes(subtypeId)) return 'last-resort';
  return 'other';
}

export function collectCellMolds(records, { teil = 5 } = {}) {
  const subtypes = new Set();
  const titles = [];
  for (const r of records || []) {
    if (Number(teil) === 5) {
      const id = detectT5Subtype(r);
      if (id) subtypes.add(id);
    } else if (Number(teil) === 4) {
    if (r._debateSeed) subtypes.add(String(r._debateSeed));
    else if (r.debateSeed) subtypes.add(String(r.debateSeed));
    else {
        const id = detectT4DebateTopic(r);
        if (id) subtypes.add(id);
      }
    }
    const title = r.passage?.title || r.passages?.[0]?.title;
    if (title) titles.push(String(title).trim());
  }
  return { subtypes: [...subtypes], titles };
}

/**
 * Pick next unused subtype: topic-preferred first, then neutral, then last resort.
 */
export function pickNextT5Subtype(excludeIds = [], slotIndex = 0, topicTag = null) {
  const excluded = new Set((excludeIds || []).filter(Boolean));
  const order = buildT5SubtypeCandidateOrder(topicTag);
  for (const id of order) {
    if (excluded.has(id)) continue;
    const def = getSubtypeById(id);
    if (subtypeMatchesExcludedPremise(def)) continue;
    return { id, tier: classifyT5PickTier(id, topicTag), order };
  }
  for (const id of order) {
    const def = getSubtypeById(id);
    if (subtypeMatchesExcludedPremise(def)) continue;
    return { id, tier: 'saturated', order };
  }
  const fallback = order[slotIndex % order.length] || ALL_T5_IDS[0];
  return { id: fallback, tier: 'saturated', order };
}

/**
 * Resolve textSubtype + exclude list for a pool cell (topicTag × T5).
 */
export function resolveT5GenerationMolds(opts = {}) {
  const lang = opts.lang || 'de';
  const level = opts.level || 'B1';
  const topicTag = opts.topicTag;
  const records = loadPoolRecords({ lang, level, poolFile: opts.poolFile });
  const cell = filterCellRecords(records, { lang, level, teil: 5, topicTag });
  const { subtypes, titles } = collectCellMolds(cell, { teil: 5 });

  const excludeSubtypes = [...new Set([...subtypes, ...(opts.extraExcludeSubtypes || [])])];
  const excludeTitles = [...new Set([...titles, ...(opts.extraExcludeTitles || [])])];
  const pick = pickNextT5Subtype(excludeSubtypes, cell.length, topicTag);
  const textSubtype = pick.id;
  const subtypeDef = getSubtypeById(textSubtype);

  return {
    textSubtype,
    subtypeDef,
    pickTier: pick.tier,
    topicTag: topicTag ? normalizeB1Topic(topicTag) : null,
    excludeMolds: { subtypes: excludeSubtypes, titles: excludeTitles },
    cellCount: cell.length,
  };
}

export function buildT5SubtypePromptBlock(subtypeDef) {
  if (!subtypeDef) return '';
  return (
    `\n## SUBTIPO DE TEXTO OBLIGATORIO (Goethe Lesen Teil 5)\n` +
    `Genera **exactamente un texto normativo** de tipo **${subtypeDef.label}**.\n` +
    `- Contexto: ${subtypeDef.setting}.\n` +
    `- Título orientativo (inventa uno **nuevo**, no copies el ejemplo de la plantilla): «${subtypeDef.titleExample}».\n` +
    `- Incluye reglas concretas típicas: ${subtypeDef.ruleFocus}.\n` +
    `- Formato: bullets o párrafos cortos, lenguaje administrativo claro B1.\n` +
    `- **NO** mezcles otro subtipo (p. ej. si es Bibliotheksordnung, NO escribas Hausordnung de Wohnanlage).\n` +
    `- Evita el párrafo de relleno genérico sobre Nachhaltigkeit/Experten/Zeitungen — quédate en reglas concretas.\n`
  );
}

export function buildExcludeMoldsPromptBlock(excludeMolds, teil = 5, lookup = getSubtypeById) {
  if (!excludeMolds) return '';
  const { subtypes = [], titles = [] } = excludeMolds;
  if (!subtypes.length && !titles.length) return '';
  const lines = [
    `\n## MOLDES PROHIBIDOS (ya existen en el pool para este tema×Teil ${teil})\n`,
    `NO repitas estos dominios ni títulos:\n`,
  ];
  for (const id of subtypes) {
    const def = lookup(id);
    lines.push(`- Subtipo **${def?.label || id}** — PROHIBIDO repetir este tipo de institución/reglas.\n`);
  }
  for (const t of titles.slice(0, 10)) {
    lines.push(`- Título ya usado: «${t}»\n`);
  }
  lines.push(
    `Elige un **dominio institucional distinto** al subtipo obligatorio de arriba, con reglas y vocabulario acordes.\n`,
  );
  return lines.join('');
}

function injectBeforeMarker(prompt, block, markers) {
  if (!block) return prompt;
  for (const marker of markers) {
    const idx = prompt.indexOf(marker);
    if (idx >= 0) return prompt.slice(0, idx) + block + prompt.slice(idx);
  }
  return prompt + block;
}

export function injectT5PromptVariants(prompt, { subtypeDef, excludeMolds }) {
  const block = buildT5SubtypePromptBlock(subtypeDef) + buildExcludeMoldsPromptBlock(excludeMolds, 5, getSubtypeById);
  return injectBeforeMarker(prompt, block, ['## PALABRAS OBJETIVO', '## AUTORREVISIÓN']);
}

// ─── Lesen Teil 4 — debateTopic rotation ─────────────────────────────────────

export const LESEN_T4_DEBATE_TOPICS = Object.freeze([
  {
    id: 'autofrei',
    label: 'Autofreie Innenstadt',
    vorschlag: 'Autos sollen an normalen Wochentagen aus dem Stadtzentrum verbannt werden.',
    titleExample: 'Forum: Autofreie Innenstadt — ja oder nein?',
    keywords: /autofrei|autofreie|verkehrsarm|stadtzentrum.*auto|autos.*zentrum/i,
  },
  {
    id: 'handy_schule',
    label: 'Handyverbot an Schulen',
    vorschlag: 'Smartphones sollen während des gesamten Unterrichts an Schulen verboten sein.',
    titleExample: 'Forum: Handyverbot in der Schule?',
    keywords: /handy|smartphone|mobiltelefon|schule.*verbot/i,
  },
  {
    id: 'vier_tage_woche',
    label: '4-Tage-Woche',
    vorschlag: 'Alle Beschäftigten sollen nur vier Tage pro Woche arbeiten müssen.',
    titleExample: 'Forum: Vier-Tage-Woche für alle?',
    keywords: /vier.?tag|4.?tag|wochenende.*länger|arbeitszeit.*kürz/i,
  },
  {
    id: 'muelltrennung',
    label: 'Strengere Mülltrennung',
    vorschlag: 'Haushalte müssen Abfall noch genauer trennen; bei Fehlern drohen Bußgelder.',
    titleExample: 'Forum: Strengere Mülltrennung?',
    keywords: /müll|abfall|trennung|biotonne|recycling/i,
  },
  {
    id: 'homeoffice',
    label: 'Mehr Homeoffice-Pflicht',
    vorschlag: 'Firmen sollen mindestens zwei Tage Homeoffice pro Woche verpflichtend ermöglichen.',
    titleExample: 'Forum: Homeoffice für alle?',
    keywords: /homeoffice|home.?office|remote|zu hause arbeit/i,
  },
  {
    id: 'oepnv_kostenlos',
    label: 'Kostenloser ÖPNV',
    vorschlag: 'Bus und Bahn in der Stadt sollen für alle kostenlos sein.',
    titleExample: 'Forum: Gratis Bus und Bahn?',
    keywords: /öpnv|bus.*kostenlos|bahn.*kostenlos|gratis.*fahr/i,
  },
  {
    id: 'vereinsfoerderung',
    label: 'Mehr Geld für Vereine',
    vorschlag: 'Die Stadt soll Sport- und Freizeitvereine stärker finanziell fördern.',
    titleExample: 'Forum: Mehr Geld für Vereine?',
    keywords: /verein|sportverein|förderung.*verein|subvention/i,
  },
  {
    id: 'schwimmbad_gratis',
    label: 'Gratis Schwimmbad für Jugendliche',
    vorschlag: 'Eintritt ins Hallenbad soll für alle unter 18 Jahren kostenlos sein.',
    titleExample: 'Forum: Gratis Schwimmbad für Jugendliche?',
    keywords: /schwimmbad|hallenbad|eintritt.*frei|jugendliche.*bad/i,
  },
  {
    id: 'bibliothek_sonntag',
    label: 'Bibliotheken sonntags geöffnet',
    vorschlag: 'Stadtbibliotheken sollen auch sonntags geöffnet sein.',
    titleExample: 'Forum: Bibliothek am Sonntag?',
    keywords: /bibliothek|sonntag.*offen|mediathek|ausleihe/i,
  },
  {
    id: 'sport_in_parks',
    label: 'Mehr Sportflächen in Parks',
    vorschlag: 'In Stadtparks sollen mehr kostenlose Sport- und Fitnessgeräte aufgestellt werden.',
    titleExample: 'Forum: Sportgeräte in Parks?',
    keywords: /sport.*park|fitnessgerät|stadtpark|outdoor.*sport/i,
  },
  {
    id: 'hobby_kurse',
    label: 'Günstigere Hobby-Kurse',
    vorschlag: 'Kurse in Volkshochschule und Bürgerzentrum sollen deutlich billiger werden.',
    titleExample: 'Forum: Günstigere Kurse?',
    keywords: /kurs|volkshochschule|vhs|hobby|bürgerzentrum/i,
  },
  {
    id: 'mensa_vegetarisch',
    label: 'Vegetarisches Mittagessen in der Mensa',
    vorschlag: 'In Kantinen soll es nur noch vegetarisches Mittagessen geben.',
    titleExample: 'Forum: Nur vegetarisch in der Mensa?',
    keywords: /mensa|kantine|vegetarisch|fleisch.*verbot/i,
  },
  {
    id: 'nachtruhe',
    label: 'Frühere Nachtruhe',
    vorschlag: 'In Wohngebieten soll ab 22 Uhr absolute Ruhe gelten (statt 23 Uhr).',
    titleExample: 'Forum: Frühere Nachtruhe?',
    keywords: /nachtruhe|ruhezeit|22 uhr|lärm.*wohn/i,
  },
  {
    id: 'hunde_spielplatz',
    label: 'Hunde vom Spielplatz verbieten',
    vorschlag: 'Hunde sollen nicht mehr auf Spielplätze mitgebracht werden dürfen.',
    titleExample: 'Forum: Keine Hunde auf dem Spielplatz?',
    keywords: /hund|spielplatz|leine|haustier/i,
  },
  {
    id: 'social_media_16',
    label: 'Weniger Social Media für Jugendliche',
    vorschlag: 'Apps sollen für Jugendliche unter 16 automatisch weniger Benachrichtigungen senden.',
    titleExample: 'Forum: Social Media für Jugendliche einschränken?',
    keywords: /social media|soziale medien|benachrichtigung|smartphone.*jugend|app.*jugend/i,
  },
  {
    id: 'ki_regulierung',
    label: 'Strengere Regeln für KI',
    vorschlag: 'Apps mit künstlicher Intelligenz sollen klar gekennzeichnet und stärker kontrolliert werden.',
    titleExample: 'Forum: KI im Alltag regulieren?',
    keywords: /künstliche intelligenz|\bki\b|chatbot|algorithmus|automatisch.*text/i,
  },
  {
    id: 'online_unterricht',
    label: 'Mehr Online-Unterricht',
    vorschlag: 'An Schulen soll es mindestens einen Tag pro Woche mit Online-Unterricht von zu Hause geben.',
    titleExample: 'Forum: Pflicht-Online-Tag an Schulen?',
    keywords: /online.?unterricht|online.?tag|digital.*schule|videokonferenz|lernplattform/i,
  },
  {
    id: 'video_ueberwachung',
    label: 'Mehr Videoüberwachung',
    vorschlag: 'In öffentlichen Plätzen sollen mehr Überwachungskameras installiert werden.',
    titleExample: 'Forum: Mehr Kameras in der Stadt?',
    keywords: /überwachung|kamera|video.*überwach|sicherheit.*kamera/i,
  },
  {
    id: 'smart_home',
    label: 'Smart-Home-Geräte in Mietwohnungen',
    vorschlag: 'Vermieter sollen Smart-Meter und vernetzte Heizungssteuerung in allen Wohnungen installieren dürfen.',
    titleExample: 'Forum: Smart Home für alle Wohnungen?',
    keywords: /smart.?home|smart.?meter|vernetzt|sensor|heizung.*app|digital.*wohn/i,
  },
  {
    id: 'datenschutz_jugend',
    label: 'Strengerer Datenschutz bei Apps',
    vorschlag: 'Apps und Plattformen sollen für Nutzer unter 18 weniger persönliche Daten sammeln dürfen.',
    titleExample: 'Forum: Weniger Datensammlung in Apps?',
    keywords: /datenschutz|personenbezogen|daten.*sammeln|tracking|cookie|profil.*app/i,
  },
  {
    id: 'ki_hausaufgaben',
    label: 'KI-Tools für Hausaufgaben verbieten',
    vorschlag: 'Schüler sollen bei Hausaufgaben keine KI-Programme wie Chatbots benutzen dürfen.',
    titleExample: 'Forum: Chatbots bei Hausaufgaben verbieten?',
    keywords: /ki.*hausaufg|chatbot.*schule|hausaufgaben.*ki|künstliche intelligenz.*schüler|ki.?tool/i,
  },
  {
    id: 'bildschirmzeit',
    label: 'Tägliches Bildschirmzeit-Limit',
    vorschlag: 'Smartphones sollen nach zwei Stunden Bildschirmzeit pro Tag Apps automatisch sperren.',
    titleExample: 'Forum: Bildschirmzeit begrenzen?',
    keywords: /bildschirmzeit|screen.?time|zeitlimit|apps.*sperr|handy.*limit|digital.*pause/i,
  },
]);

export const T4_NEUTRAL_DEBATES = Object.freeze(['bibliothek_sonntag', 'muelltrennung', 'oepnv_kostenlos']);

export const T4_LAST_RESORT_DEBATES = Object.freeze(['autofrei', 'homeoffice']);

export const T4_TOPIC_DEBATE_PREFERENCE = Object.freeze({
  Freizeit: ['vereinsfoerderung', 'schwimmbad_gratis', 'sport_in_parks', 'hobby_kurse', 'bibliothek_sonntag'],
  Technik: [
    'handy_schule',
    'social_media_16',
    'ki_regulierung',
    'online_unterricht',
    'video_ueberwachung',
    'smart_home',
    'datenschutz_jugend',
    'ki_hausaufgaben',
    'bildschirmzeit',
  ],
  Wohnen: ['nachtruhe', 'muelltrennung', 'hunde_spielplatz', 'autofrei'],
  Bildung: ['handy_schule', 'bibliothek_sonntag', 'hobby_kurse'],
  Ernährung: ['mensa_vegetarisch', 'muelltrennung', 'oepnv_kostenlos'],
  Sport: ['sport_in_parks', 'vereinsfoerderung', 'schwimmbad_gratis', 'oepnv_kostenlos'],
  Gesundheit: ['schwimmbad_gratis', 'sport_in_parks', 'mensa_vegetarisch', 'oepnv_kostenlos'],
  Arbeit: ['vier_tage_woche', 'homeoffice', 'mensa_vegetarisch'],
  Medien: ['handy_schule', 'bibliothek_sonntag', 'oepnv_kostenlos'],
  Kultur: ['vereinsfoerderung', 'bibliothek_sonntag', 'hobby_kurse', 'oepnv_kostenlos'],
  Umwelt: ['muelltrennung', 'autofrei', 'oepnv_kostenlos', 'mensa_vegetarisch'],
  Familie: ['handy_schule', 'schwimmbad_gratis', 'sport_in_parks', 'nachtruhe'],
  Reisen: ['oepnv_kostenlos', 'autofrei', 'bibliothek_sonntag'],
  Verkehr: ['autofrei', 'oepnv_kostenlos', 'hunde_spielplatz'],
  Konsum: ['mensa_vegetarisch', 'muelltrennung', 'oepnv_kostenlos'],
  Stadtleben: ['autofrei', 'sport_in_parks', 'oepnv_kostenlos', 'muelltrennung'],
});

const ALL_T4_IDS = LESEN_T4_DEBATE_TOPICS.map((d) => d.id);

export function getDebateById(id) {
  return LESEN_T4_DEBATE_TOPICS.find((d) => d.id === id) || null;
}

export function detectT4DebateTopic(record) {
  const title = String(record?.passage?.title || record?.passages?.[0]?.title || '');
  const intro = String(record?.passage?.text || record?.passages?.[0]?.text || '');
  const qText = (record?.questions || []).map((q) => `${q.signText || ''} ${q.question || ''}`).join('\n');
  const fullText = `${title}\n${intro}\n${qText}`;

  if (record?.debateTopic && getDebateById(record.debateTopic)) return record.debateTopic;

  for (const d of LESEN_T4_DEBATE_TOPICS) {
    if (d.keywords.test(title)) return d.id;
  }
  if (record?.debateTopic && getDebateById(record.debateTopic)) return record.debateTopic;
  for (const d of LESEN_T4_DEBATE_TOPICS) {
    if (d.keywords.test(fullText)) return d.id;
  }
  if (/forum|vorschlag|meinung|debatte/i.test(fullText)) return 'autofrei';
  return null;
}

export function buildT4DebateCandidateOrder(topicTag) {
  const topic = topicTag ? normalizeB1Topic(topicTag) : null;
  const preferred = topic && T4_TOPIC_DEBATE_PREFERENCE[topic]
    ? [...T4_TOPIC_DEBATE_PREFERENCE[topic]]
    : [...T4_NEUTRAL_DEBATES, ...ALL_T4_IDS.filter((id) => !T4_LAST_RESORT_DEBATES.includes(id))];

  const seen = new Set();
  const ordered = [];
  const add = (id) => {
    if (!id || seen.has(id) || !getDebateById(id)) return;
    seen.add(id);
    ordered.push(id);
  };

  for (const id of preferred) add(id);
  for (const id of T4_NEUTRAL_DEBATES) add(id);
  for (const id of ALL_T4_IDS) {
    if (!T4_LAST_RESORT_DEBATES.includes(id)) add(id);
  }
  for (const id of T4_LAST_RESORT_DEBATES) add(id);
  return ordered;
}

export function classifyT4PickTier(debateId, topicTag) {
  const topic = topicTag ? normalizeB1Topic(topicTag) : null;
  const preferred = topic && T4_TOPIC_DEBATE_PREFERENCE[topic];
  if (preferred?.includes(debateId)) return 'preferred';
  if (T4_NEUTRAL_DEBATES.includes(debateId)) return 'neutral';
  if (T4_LAST_RESORT_DEBATES.includes(debateId)) return 'last-resort';
  return 'other';
}

export function pickNextT4DebateTopic(excludeIds = [], slotIndex = 0, topicTag = null) {
  const excluded = new Set((excludeIds || []).filter(Boolean));
  const order = buildT4DebateCandidateOrder(topicTag);
  for (const id of order) {
    if (!excluded.has(id)) {
      return { id, tier: classifyT4PickTier(id, topicTag), order };
    }
  }
  const fallback = order[slotIndex % order.length] || ALL_T4_IDS[0];
  return { id: fallback, tier: 'saturated', order };
}

export function resolveT4GenerationMolds(opts = {}) {
  const lang = opts.lang || 'de';
  const level = opts.level || 'B1';
  const topicTag = opts.topicTag;
  const records = loadPoolRecords({ lang, level, poolFile: opts.poolFile });
  const cell = filterCellRecords(records, { lang, level, teil: 4, topicTag });
  const { subtypes: usedSeeds, titles } = collectCellMolds(cell, { teil: 4 });

  const excludeSeeds = [...new Set([...usedSeeds, ...(opts.extraExcludeSubtypes || [])])];
  const excludeTitles = [...new Set([...titles, ...(opts.extraExcludeTitles || [])])];
  const forcedSeed = opts.forceDebateSeed || null;
  const pick = forcedSeed
    ? { seed: forcedSeed, tier: 'forced', index: 0, topic: normalizeB1Topic(topicTag) }
    : pickNextT4DebateSeed(excludeSeeds, cell.length, topicTag);

  return {
    debateSeed: pick.seed,
    pickTier: pick.tier,
    topicTag: topicTag ? normalizeB1Topic(topicTag) : null,
    excludeMolds: { subtypes: excludeSeeds, titles: excludeTitles },
    cellCount: cell.length,
  };
}

export function buildT4TopicAlignmentPromptBlock(topicTag) {
  const topic = topicTag ? normalizeB1Topic(topicTag) : null;
  if (!topic) return '';
  const preferred = (T4_TOPIC_DEBATE_PREFERENCE[topic] || [])
    .map((id) => getDebateById(id)?.label)
    .filter(Boolean)
    .slice(0, 4);
  const examples = preferred.length ? preferred.join('; ') : 'debate acorde al tema';
  return (
    `\n## TEMA B1 OBLIGATORIO (topicTag = ${topic})\n` +
    `El examen pide tema **${topic}**. El foro NO puede ser un debate genérico desconectado.\n` +
    `- El Vorschlag y las 7 opiniones deben tratar de **${topic}** (p. ej. ocio/deporte si Freizeit; ` +
    `tecnología digital/apps si Technik; trabajo solo si Arbeit).\n` +
    `- Debates coherentes con ${topic} (orientación): ${examples}.\n` +
    `- **PROHIBIDO** Homeoffice / 4-Tage-Woche / Büro-Themen si el tema NO es Arbeit.\n` +
    `- \`topicTag\` en el JSON raíz y coherencia del contenido: **${topic}**.\n`
  );
}

export function buildT4DebatePromptBlock(debateDef, topicTag = null) {
  if (!debateDef) return '';
  const topicLine = topicTag
    ? `- El debate elegido debe encajar con el tema B1 **${normalizeB1Topic(topicTag)}** (ver sección TEMA B1 arriba).\n`
    : '';
  return (
    `\n## TEMA DE DEBATE OBLIGATORIO (Goethe Lesen Teil 4)\n` +
    `El foro debate **exactamente este Vorschlag**: **${debateDef.label}**\n` +
    `- Vorschlag concreto (todas las opiniones giran en torno a esto): «${debateDef.vorschlag}»\n` +
    `- Título orientativo (inventa uno **nuevo**): «${debateDef.titleExample}»\n` +
    `- Intro (\`passages[0].text\`): presenta el debate sobre este Vorschlag (50–70 palabras).\n` +
    `- Las 7 opiniones en \`signText\` deben referirse a **este** Vorschlag — no a otro tema.\n` +
    `- Enunciado fijo de las 7 preguntas: «Ist [Vorname] für den Vorschlag?» — «der Vorschlag» = el de arriba.\n` +
    topicLine +
    `- **NO** reutilices el debate del ejemplo (Autofreie Innenstadt) ni debates ya prohibidos abajo.\n`
  );
}

export function buildT4FixedSeedPromptBlock(debateSeed, topicTag = null) {
  if (!debateSeed) return '';
  const topic = topicTag ? normalizeB1Topic(topicTag) : null;
  const topicLine = topic
    ? `- \`topicTag\` en el JSON raíz: **${topic}** — coherente con el Vorschlag fijo.\n`
    : '';
  return (
    `\n## PREMISA FIJA DEL DEBATE (no la cambies, no la reformules)\n` +
    `El foro debate EXACTAMENTE este Vorschlag: «${debateSeed}».\n` +
    `El título del pasaje y la intro deben referirse a este Vorschlag.\n` +
    `Las 7 opiniones responden a este Vorschlag y a ningún otro.\n` +
    `- Intro (\`passages[0].text\`): presenta el debate sobre este Vorschlag (50–70 palabras).\n` +
    `- Las 7 opiniones en \`signText\` deben referirse a **este** Vorschlag — no a otro tema.\n` +
    `- Enunciado fijo de las 7 preguntas: «Ist [Vorname] für den Vorschlag?» — «der Vorschlag» = el de arriba.\n` +
    topicLine +
    `- **NO** reutilices el debate del ejemplo (Autofreie Innenstadt) ni Vorschläge ya prohibidos abajo.\n`
  );
}

export function buildT4ExcludeMoldsPromptBlock(excludeMolds, { seedMode = false } = {}) {
  if (!excludeMolds) return '';
  const { subtypes = [], titles = [] } = excludeMolds;
  if (!subtypes.length && !titles.length) return '';
  const lines = [
    `\n## MOLDES PROHIBIDOS (ya existen en el pool para este tema×Teil 4)\n`,
    `NO repitas estos debates ni títulos:\n`,
  ];
  for (const id of subtypes) {
    if (seedMode) {
      lines.push(`- Vorschlag ya usado: «${id}» — PROHIBIDO repetir.\n`);
    } else {
      const def = getDebateById(id);
      lines.push(`- Debate **${def?.label || id}** — PROHIBIDO repetir este Vorschlag.\n`);
    }
  }
  for (const t of titles.slice(0, 10)) {
    lines.push(`- Título ya usado: «${t}»\n`);
  }
  lines.push(
    seedMode
      ? `El Vorschlag fijo de arriba es el único permitido; no copies los prohibidos.\n`
      : `Elige un **Vorschlag distinto** al debate obligatorio de arriba.\n`,
  );
  return lines.join('');
}

export function injectT4PromptVariants(prompt, { debateDef, debateSeed, excludeMolds, topicTag }) {
  const seedMode = Boolean(debateSeed);
  const debateBlock = seedMode
    ? buildT4FixedSeedPromptBlock(debateSeed, topicTag)
    : buildT4DebatePromptBlock(debateDef, topicTag);
  const block =
    buildT4TopicAlignmentPromptBlock(topicTag)
    + debateBlock
    + buildT4ExcludeMoldsPromptBlock(excludeMolds, { seedMode });
  return injectBeforeMarker(prompt, block, ['## PALABRAS OBJETIVO', '## AUTORREVISIÓN']);
}

/** Resolve generation molds for Lesen T4/T5 when topicTag is fixed (cell fill). */
export function resolveLesenGenerationMolds(teil, opts = {}) {
  const topicTag = opts.topicTag ?? opts.topic;
  if (!topicTag) return null;
  const base = {
    lang: opts.lang || 'de',
    level: opts.level || 'B1',
    topicTag,
    poolFile: opts.poolFile,
    extraExcludeSubtypes: opts.extraExcludeSubtypes,
    extraExcludeTitles: opts.extraExcludeTitles,
    forceDebateTopic: opts.forceDebateTopic,
  };
  if (Number(teil) === 5) return resolveT5GenerationMolds(base);
  if (Number(teil) === 4) return resolveT4GenerationMolds(base);
  return null;
}
