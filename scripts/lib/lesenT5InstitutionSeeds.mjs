/**
 * lesenT5InstitutionSeeds.mjs — Seed institucional + perfiles de variante (Lesen T5).
 *
 * Perfil de variante = dominio de reglas distinto dentro del mismo subtipo
 * (p. ej. freizeitzentrum: hallenbad vs fitness vs veranstaltungen).
 * CHK-29 usa subtipo:perfil como molde → varias partes genuinas por subtipo/celda.
 */
import crypto from 'node:crypto';

const SEED_PARTS = Object.freeze({
  park: {
    prefixes: ['Stadtpark', 'Grünanlage', 'Stadtgarten', 'Erholungspark'],
    suffixes: ['Westend', 'Nordbogen', 'Südpark', 'Hafenviertel', 'Lindenallee', 'Rosenquartier'],
    ruleTemplates: [
      'Hunde müssen in diesem Park immer an der Leine geführt werden.',
      'Grillen ist nur an den markierten Plätzen erlaubt.',
      'Der Spielplatz ist täglich von 8:00 bis 20:00 Uhr geöffnet.',
      'Fahrräder dürfen nur auf den ausgewiesenen Wegen gefahren werden.',
    ],
  },
  wohnanlage: {
    prefixes: ['Wohnanlage', 'Mehrfamilienhaus', 'Siedlung', 'Wohnkomplex'],
    suffixes: ['Sonnenhof', 'Lindenquartier', 'Parkblick', 'Am Bach', 'Westhang', 'Gartenstraße'],
    ruleTemplates: [
      'Ruhezeiten gelten werktags von 22:00 bis 7:00 Uhr.',
      'Müll muss in die farbigen Tonnen im Kellerabteil sortiert werden.',
      'Fahrräder sind nur im abschließbaren Fahrradkeller zu parken.',
      'Gästeparkplätze dürfen maximal {N} Stunden genutzt werden.',
    ],
  },
  bibliothek: {
    prefixes: ['Stadtbibliothek', 'Medienzentrum', 'Bücherei', 'Stadtbücherei'],
    suffixes: ['Westend', 'Kulturpunkt Mitte', 'Am Markt', 'Neustadt', 'Rathausviertel', 'Universitätsnähe'],
    ruleTemplates: [
      'Ausgeliehene Medien können maximal zweimal verlängert werden.',
      'In den Lesesälen ist absolute Ruhe zu wahren.',
      'Laptops dürfen nur an Steckplätzen im Erdgeschoss genutzt werden.',
      'Gruppenarbeit ist nur in den reservierten Räumen {N} und {M} erlaubt.',
    ],
  },
  kantine: {
    prefixes: ['Betriebskantine', 'Mensa', 'Cafeteria', 'Speisesaal'],
    suffixes: ['Am Campus', 'Werk Nord', 'Stadtzentrum', 'Technikpark', 'Klinikum Mitte', 'Forum'],
    ruleTemplates: [
      'Tabletts und Geschirr müssen nach dem Essen zur Rückgabestation gebracht werden.',
      'Vorbestellungen für Gruppen ab fünf Personen sind bis 10:00 Uhr möglich.',
      'Externe Gäste benötigen einen Besucherausweis an der Kasse.',
      'Die Mittagsausgabe endet werktags pünktlich um {N}:00 Uhr.',
    ],
  },
  freizeitzentrum: {
    prefixes: ['Freizeitzentrum', 'Bürgerzentrum', 'Stadthalle', 'Vitalpark'],
    suffixes: ['Am Flussufer', 'Südspitze', 'Westbad', 'Kulturinsel', 'Teamhaus', 'Aktivpark'],
    ruleTemplates: [
      'Für Kurse ist eine Anmeldung mindestens 48 Stunden vor Beginn nötig.',
      'Schwimmbadbesucher müssen vor dem Becken duschen.',
      'Parkplätze stehen nur für die Dauer des Aufenthalts zur Verfügung.',
      'In Ruhebereichen ist lautes Telefonieren nicht gestattet.',
    ],
  },
  sportverein: {
    prefixes: ['Sportverein', 'Turnverein', 'Fitnessstudio', 'Sportzentrum'],
    suffixes: ['Grünfeld', 'Am Stadion', 'Nordwest', 'Active Park', 'Vitalia', 'Teamhaus Mitte'],
    ruleTemplates: [
      'Mitglieder müssen beim Betreten ihren Ausweis an der Rezeption vorzeigen.',
      'Sportschuhe mit heller Sohle sind in der Halle Pflicht.',
      'Gäste können nach vorheriger Anmeldung gegen Tagesgebühr trainieren.',
      'Schließfächer sind nach jeder Nutzung zu leeren.',
    ],
  },
  schule: {
    prefixes: ['Berufsbildungszentrum', 'Berufsschule', 'Gymnasium', 'Schulzentrum'],
    suffixes: ['Mitte', 'Nord', 'Am Park', 'West', 'Technikcampus', 'Stadtteilschule Ost'],
    ruleTemplates: [
      'Fahrräder dürfen nur auf den markierten Stellplätzen im Hof abgestellt werden.',
      'Rauchen ist auf dem gesamten Schulgelände verboten.',
      'Klassenräume außerhalb der Unterrichtszeit nur mit Erlaubnis der Lehrkraft nutzbar.',
      'Besucherparkplätze sind maximal {N} Stunden kostenlos.',
    ],
  },
  markthalle: {
    prefixes: ['Wochenmarkt', 'Markthalle', 'Flohmarkt', 'Regionalmarkt'],
    suffixes: ['Am Ring', 'Zentrum', 'Hafen', 'West', 'Rathausplatz', 'Grünmarkt'],
    ruleTemplates: [
      'Standgebühren sind spätestens am Markttag um 7:00 Uhr an der Kasse zu entrichten.',
      'Probestand und Verkostung sind nur an genehmigten Ständen erlaubt.',
      'Leergut und Pfandflaschen können am Marktausgang zurückgegeben werden.',
      'Fahrzeuge der Verkäufer dürfen höchstens {N} Minuten zum Be- und Entladen halten.',
    ],
  },
  einkaufszentrum: {
    prefixes: ['Einkaufszentrum', 'Shopping-Center', 'City-Galerie', 'Passage'],
    suffixes: ['Mitte', 'Nord', 'Am Bahnhof', 'Riverside', 'Forum', 'City-Oase'],
    ruleTemplates: [
      'Das Parkhaus darf maximal {N} Stunden kostenlos genutzt werden.',
      'Fotografieren in Geschäften ist nur mit Erlaubnis des jeweiligen Ladens gestattet.',
      'Kinderwagen und Rollstühle haben Vorrang an den Aufzügen.',
      'Rauchen ist im gesamten Center einschließlich der Tiefgarage verboten.',
    ],
  },
});

/**
 * Perfiles de variante: reglas/ángulo distinto → molde CHK-29 distinto (subtipo:perfil).
 * @type {Record<string, Array<{id:string,label:string,ruleFocus:string,ruleTemplates?:string[],topicAffinity?:string[]}>>}
 */
export const T5_VARIANT_PROFILES = Object.freeze({
  park: [
    {
      id: 'standard',
      label: 'Park allgemein',
      ruleFocus: 'Hunde, Grillen, Spielplatz, Müll, Fahrräder',
    },
    {
      id: 'wochenmarkt',
      label: 'Wochenmarkt im Park',
      ruleFocus: 'Marktstände, Standgebühren, Pfandflaschen, Proben, Öffnungszeiten Markt',
      ruleTemplates: [
        'Der Wochenmarkt findet samstags von 7:00 bis 14:00 Uhr statt.',
        'Standplätze müssen spätestens eine Stunde vor Marktbeginn geräumt sein.',
        'Pfandflaschen und Leergut können am Marktausgang zurückgegeben werden.',
        'Proben und Verkostung sind nur an Ständen mit grünem Schild erlaubt.',
      ],
      topicAffinity: ['Konsum', 'Ernährung', 'Stadtleben'],
    },
    {
      id: 'gemeinschaftsgarten',
      label: 'Gemeinschaftsgarten',
      ruleFocus: 'Parzellen, Bewässerung, Kompost, Werkzeug, Saison',
      ruleTemplates: [
        'Parzellen dürfen nur von registrierten Mitgliedern betreten werden.',
        'Bewässerung ist werktags von 6:00 bis 21:00 Uhr erlaubt.',
        'Kompost darf nur in die dafür vorgesehenen Behälter gegeben werden.',
        'Gemeinschaftswerkzeug ist nach Gebrauch im Schuppen {N} zurückzulegen.',
      ],
      topicAffinity: ['Umwelt', 'Familie', 'Wohnen'],
    },
  ],
  freizeitzentrum: [
    {
      id: 'hallenbad',
      label: 'Hallenbad / Schwimmbad',
      ruleFocus: 'Duschen, Badekappen, Kinderbegleitung, Beckenregeln',
      ruleTemplates: [
        'Vor dem Betreten des Beckens ist eine Dusche Pflicht.',
        'Badekappen sind für alle Schwimmer im Sportbecken vorgeschrieben.',
        'Kinder unter zehn Jahren dürfen nur in Begleitung eines Erwachsenen schwimmen.',
        'Springen vom Beckenrand ist nur an markierten Stellen erlaubt.',
      ],
    },
    {
      id: 'fitness',
      label: 'Fitness & Kurse (ohne Schwimmbad)',
      ruleFocus: 'Mitgliedskarte, Gerätehygiene, Kursanmeldung, Sauna — KEIN Schwimmbad',
      ruleTemplates: [
        'Mitglieder müssen bei jedem Besuch ihre Chipkarte an der Rezeption scannen.',
        'Trainingsgeräte sind nach Benutzung mit dem bereitgestellten Spray zu reinigen.',
        'Kursplätze müssen mindestens 24 Stunden vor Beginn online reserviert werden.',
        'Die Sauna ist werktags von 16:00 bis 21:00 Uhr geöffnet.',
      ],
      topicAffinity: ['Sport', 'Gesundheit', 'Konsum'],
    },
    {
      id: 'veranstaltungen',
      label: 'Veranstaltungssaal / Bürgerhaus',
      ruleFocus: 'Raumvermietung, Lautstärke, Auf- und Abbau, Catering',
      ruleTemplates: [
        'Raumvermietungen sind mindestens zwei Wochen im Voraus schriftlich zu beantragen.',
        'Nach Veranstaltungen muss der Saal bis {N}:00 Uhr geräumt sein.',
        'Eigene Getränke sind nur mit Genehmigung der Leitung erlaubt.',
        'Technische Geräte dürfen nur vom Hausmeister angeschlossen werden.',
      ],
      topicAffinity: ['Kultur', 'Freizeit', 'Stadtleben'],
    },
  ],
  kantine: [
    {
      id: 'standard',
      label: 'Mensa allgemein',
      ruleFocus: 'Tabletts, Mittagszeiten, Gäste, Hygiene',
    },
    {
      id: 'prepaid',
      label: 'Prepaid / Aufladekarte',
      ruleFocus: 'Aufladekarte, Mindestguthaben, Rabatt, Rückerstattung',
      ruleTemplates: [
        'Das Mittagessen wird nur mit der personalisierten Aufladekarte bezahlt.',
        'Ein Mindestguthaben von {N} Euro muss auf der Karte verbleiben.',
        'Rückerstattungen des Restguthabens sind nur zum Semesterende möglich.',
        'Studierende erhalten werktags {M} Prozent Rabatt auf das Tagesgericht.',
      ],
      topicAffinity: ['Konsum', 'Bildung', 'Arbeit'],
    },
  ],
  markthalle: [
    {
      id: 'standard',
      label: 'Marktordnung',
      ruleFocus: 'Standgebühren, Hygiene, Proben, Lieferzeiten',
    },
  ],
  einkaufszentrum: [
    {
      id: 'standard',
      label: 'Center-Ordnung',
      ruleFocus: 'Parkhaus, Öffnungszeiten, Kinderwagen, Fotografieren',
    },
    {
      id: 'sonntagsverkauf',
      label: 'Verkaufsoffener Sonntag',
      ruleFocus: 'Sonderöffnung, Lärmschutz, Sicherheitsdienst, Müll',
      ruleTemplates: [
        'Am verkaufsoffenen Sonntag gelten verkürzte Öffnungszeiten von 13:00 bis 18:00 Uhr.',
        'Lautstarke Werbeaktionen sind an diesem Tag nicht gestattet.',
        'Der Sicherheitsdienst kontrolliert Taschen stichprobenartig am Ausgang.',
        'Müll und Verpackungen bitte in den markierten Sammelstationen entsorgen.',
      ],
      topicAffinity: ['Konsum', 'Stadtleben'],
    },
  ],
});

export function listT5VariantProfiles(textSubtype) {
  return T5_VARIANT_PROFILES[textSubtype] || [{ id: 'standard', label: 'Standard', ruleFocus: '' }];
}

function hashPick(key, mod) {
  const h = crypto.createHash('sha256').update(String(key), 'utf8').digest();
  return mod > 0 ? h.readUInt32BE(0) % mod : 0;
}

function fillRuleTemplate(tpl, n, m) {
  return String(tpl || '')
    .replaceAll('{N}', String(n))
    .replaceAll('{M}', String(m));
}

function pickProfile(textSubtype, { topicTag, entropy = '', excludeProfiles = [] } = {}) {
  const profiles = listT5VariantProfiles(textSubtype);
  const excluded = new Set(excludeProfiles || []);
  const topic = topicTag ? String(topicTag) : '';

  const scored = profiles.map((p, i) => {
    let score = hashPick(`${entropy}:prof:${p.id}`, 1000);
    if (topic && p.topicAffinity?.includes(topic)) score += 500;
    if (excluded.has(p.id)) score -= 10000;
    return { p, i, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored.find((x) => !excluded.has(x.p.id)) || scored[0];
  return best?.p || profiles[0];
}

function pickRules(parts, profile, entropy) {
  const templates = profile.ruleTemplates?.length ? profile.ruleTemplates : parts.ruleTemplates;
  const n = 10 + hashPick(`${entropy}:n`, 8);
  const m = 11 + hashPick(`${entropy}:m`, 7);
  const tIdx1 = hashPick(`${entropy}:r1`, templates.length);
  let tIdx2 = hashPick(`${entropy}:r2`, templates.length);
  if (tIdx2 === tIdx1) tIdx2 = (tIdx2 + 1) % templates.length;
  return {
    rule1: fillRuleTemplate(templates[tIdx1], n, m),
    rule2: fillRuleTemplate(templates[tIdx2], n + 1, m + 1),
  };
}

/**
 * @param {string} textSubtype
 * @param {string|object} entropyOrOpts — string entropy or { entropy, topicTag, excludeProfiles }
 */
export function pickT5InstitutionSeed(textSubtype, entropyOrOpts = '') {
  const opts = typeof entropyOrOpts === 'object' ? entropyOrOpts : { entropy: entropyOrOpts };
  const entropy = opts.entropy || '';
  const parts = SEED_PARTS[textSubtype] || SEED_PARTS.park;
  const profile = pickProfile(textSubtype, opts);
  const prefix = parts.prefixes[hashPick(`${entropy}:p`, parts.prefixes.length)];
  const suffix = parts.suffixes[hashPick(`${entropy}:s`, parts.suffixes.length)];
  const institutionName = `${prefix} ${suffix}`;
  const { rule1, rule2 } = pickRules(parts, profile, entropy);

  return {
    institutionName,
    rule1,
    rule2,
    textSubtype,
    variantProfile: profile.id,
    variantLabel: profile.label,
    ruleFocus: profile.ruleFocus || '',
  };
}

export function buildT5InstitutionSeedPromptBlock(seed) {
  if (!seed?.institutionName) return '';
  const focus = seed.ruleFocus
    ? `\n- **Enfoque obligatorio de reglas (${seed.variantLabel || seed.variantProfile})**: ${seed.ruleFocus}.\n`
    : '';
  const noPool =
    seed.variantProfile === 'fitness'
      ? '- **NO** beschreibst du ein Schwimmbad oder Hallenbad — nur Fitness, Kurse und Sauna.\n'
      : '';
  return (
    `\n## INSTITUCIÓN OBLIGATORIA (Lesen Teil 5 — inventa reglas NUEVAS)\n` +
    `El texto normativo debe referirse a **${seed.institutionName}** (nombre propio único).\n` +
    `- **NO** copies textos de otras Bibliotheken/Mensen/Parks ya publicados — este nombre es exclusivo de esta generación.\n` +
    focus +
    noPool +
    `- Incluye **obligatoriamente** estas dos reglas concretas (puedes reformular levemente, pero mismo sentido):\n` +
    `  1. ${seed.rule1}\n` +
    `  2. ${seed.rule2}\n` +
    `- Añade 3–5 reglas adicionales propias de ${seed.institutionName}, acorde al enfoque de arriba.\n` +
    `- El título del pasaje debe contener «${seed.institutionName}» o una variante clara del nombre.\n`
  );
}

export function buildT5BankDuplicateEscalationBlock(match) {
  if (!match) return '';
  const title = match.title || match.passageId || 'texto publicado';
  return (
    `\n## REINTENTO — REGURGITACIÓN DETECTADA\n` +
    `Tu pasaje anterior era **idéntico** al ya publicado «${title}» (${match.source || 'banco'}).\n` +
    `Genera un texto **completamente nuevo**: otro nombre de institución, otras reglas, otro orden de párrafos.\n` +
    `**PROHIBIDO** reproducir frases enteras del banco ni reutilizar IDs gen-l5-* existentes.\n`
  );
}

export function collectUsedVariantProfiles(records, textSubtype) {
  const out = new Set();
  for (const r of records || []) {
    if (r._textSubtype !== textSubtype) continue;
    if (r._t5VariantProfile) out.add(r._t5VariantProfile);
  }
  return [...out];
}
