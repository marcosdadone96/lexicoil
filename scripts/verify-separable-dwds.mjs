/**
 * Verify operator 150-list candidates against DWDS (dwds.de).
 * Heuristic: DWDS conjugation lines for separable verbs show split finite forms
 * (…t ab / …t an / kennt sich aus) or explicit "trennbar".
 *
 * Usage: node scripts/verify-separable-dwds.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import SeparableResolve from '../js/engine/separableResolve.js';
import { classifyDwdsHtml } from './lib/dwdsSeparableClassify.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.join(ROOT, 'batches/ready/gate-logs', `separable-dwds-verify-${stamp}.json`);

const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  if (i >= 0 && process.argv[i + 1]) {
    return process.argv[i + 1].split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return null;
})();

const LIST = ONLY || [
  // ab-
  ...'abbiegen abbrechen abbringen abdanken abfahren abfallen abfertigen abfliegen abgeben abgleichen abgreifen abhalten abhängen abheben abholen abkühlen ablegen abmelden abnehmen abraten abreisen abrufen absagen abschließen abschneiden absehen absteigen abstimmen abwenden abziehen'.split(' '),
  // an-
  ...'anbauen anbeißen anbinden anbieten anbrechen anbrennen anerkennen anfassen anfangen anfühlen angreifen anhaben anhalten anklicken ankommen ankreuzen anlaufen anlegen anleuchten anmelden annehmen anpassen anprobieren anrufen anschließen ansehen ansprechen anstehen anstellen anstrengen antreffen anwenden anziehen'.split(' '),
  // auf-
  ...'aufatmen aufbauen aufbewahren aufbrechen aufdecken aufdrehen auffallen auffangen auffordern aufgeben aufhalten aufhängen aufheben aufhören aufklären aufladen auflaufen auflegen auflesen auflösen aufmachen aufmerksam aufnehmen aufpassen aufräumen aufreizen aufrufen aufstehen aufsteigen auftauchen auftreten aufwachsen aufzählen aufzeigen aufziehen'.split(' '),
  // aus-
  ...'ausarbeiten ausatmen ausbauen ausbilden ausbleiben ausbrechen ausbreiten ausdehnen ausdrücken ausfahren ausfallen ausführbar ausfüllen ausgeben ausgehen ausgleichen aushalten aushelfen auskennen ausladen auslaufen auslegen ausleihen auslösen ausmachen ausnutzen auspacken ausreden ausreichen ausruhen ausschließen aussehen aussprechen aussteigen austauschen austreten ausüben auswandern ausweichen ausziehen'.split(' '),
  // ein-
  ...'einatmen einbauen einbilden einbrechen einbringen einchecken eindringen einfallen einfangen einfärben einfordern einfrieren eingeben eingehen eingießen eingreifen einhalten einhängen einholen einkaufen einladen einlassen einlaufen einlegen einleiten einlesen einlösen einnehmen einpacken einpassen einprägen einrichten einsammeln einschalten einschließen einschreiben einsetzen einstellen einstimmen eintauchen eintippen eintreten einüben einzahlen einziehen'.split(' '),
];

const allow = SeparableResolve.SEPARABLE_INFINITIVES;
const unique = [...new Set(LIST)];
const missing = ONLY ? unique : unique.filter((w) => !allow.has(w));

function isObviousNonVerb(w) {
  return /bar$|sam$|lich$|ig$|isch$|keit$|heit$/.test(w) || !/(?:en|eln|ern|üben)$/i.test(w);
}

async function fetchDwds(lemma) {
  const url = `https://www.dwds.de/wb/${encodeURIComponent(lemma)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'LexiCoil-separable-verify/1.0 (educational)' },
  });
  const html = await res.text();
  return { statusCode: res.status, html, url };
}

const results = {
  generatedAt: new Date().toISOString(),
  allowlistBefore: allow.size,
  listSize: unique.length,
  alreadyInAllowlist: unique.filter((w) => allow.has(w)),
  discardedNonVerb: [],
  accept: [],
  discard: [],
  review: [],
  not_found: [],
};

for (const w of missing) {
  if (isObviousNonVerb(w)) {
    results.discardedNonVerb.push({ lemma: w, reason: 'not an infinitive verb (adj/other)' });
    results.discard.push({ lemma: w, reasons: ['non-verb'] });
  }
}

const toCheck = missing.filter((w) => !isObviousNonVerb(w));
console.log(`DWDS-check ${toCheck.length} missing verbs (skip ${results.discardedNonVerb.length} non-verbs)...`);

for (let i = 0; i < toCheck.length; i++) {
  const w = toCheck[i];
  process.stdout.write(`  [${i + 1}/${toCheck.length}] ${w} `);
  try {
    const { statusCode, html, url } = await fetchDwds(w);
    const c = classifyDwdsHtml(w, html);
    const row = { lemma: w, http: statusCode, url, ...c };
    results[c.status]?.push?.(row);
    if (!results[c.status]) results.review.push(row);
    console.log(c.status, (c.reasons || []).join('; '));
  } catch (e) {
    console.log('ERR', e.message);
    results.review.push({ lemma: w, status: 'review', reasons: [String(e.message)], separable: false });
  }
  await new Promise((r) => setTimeout(r, 120));
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log('\nWrote', OUT);
console.log('accept', results.accept.length, 'discard', results.discard.length, 'review', results.review.length, 'not_found', results.not_found.length);
