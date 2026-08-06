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

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/separable-dwds-verify-2026-07-12.json');

const LIST = [
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
const missing = unique.filter((w) => !allow.has(w));

function isObviousNonVerb(w) {
  return /bar$|sam$|lich$|ig$|isch$|keit$|heit$/.test(w) || !/(?:en|eln|ern|üben)$/i.test(w);
}

function classifyDwdsHtml(lemma, html) {
  const h = String(html || '');
  const low = lemma.toLowerCase();
  const reasons = [];

  if (/Seite nicht gefunden|kein Eintrag|nicht gefunden/i.test(h) && h.length < 5000) {
    return { status: 'not_found', reasons: ['DWDS 404/empty'], separable: false };
  }

  // Adjective / non-verb grammar line
  if (/Grammatik\s*Adjektiv/i.test(h) || /class="[^"]*dwdswb-ft-wortart[^"]*"[^>]*>\s*Adjektiv/i.test(h)) {
    reasons.push('DWDS Wortart Adjektiv');
    return { status: 'discard', reasons, separable: false };
  }

  // Explicit inseparable
  if (/untrennbar/i.test(h) && !/trennbar/i.test(h.replace(/untrennbar/gi, ''))) {
    reasons.push('DWDS mentions untrennbar without trennbar');
  }

  // Separable conjugation patterns: "kennt sich aus", "erkannte an", "fährt ab"
  const prefixes = ['ab', 'an', 'auf', 'aus', 'ein', 'mit', 'vor', 'zu', 'nach', 'bei', 'weg', 'los'];
  let pref = prefixes.find((p) => low.startsWith(p) && low.length > p.length + 2);
  // anerkennen special: particle is an
  if (low === 'anerkennen') pref = 'an';

  const root = pref ? low.slice(pref.length) : '';
  let sepHit = /trennbar/i.test(h) && !/untrennbar/i.test(h);

  // DWDS often shows: "kennt sich aus" / "erkannte an" / "hat … abgegeben"
  if (pref) {
    const particleAtEnd = new RegExp(
      `\\b[a-zäöüß]+(?:t|te|ten|st)?\\s+(?:sich\\s+)?${pref}\\b`,
      'i',
    );
    const partizipGe = new RegExp(`\\b${pref}ge[a-zäöüß]+\\b`, 'i');
    const anzuerkennen = /anzuerkennen/i.test(h);
    if (particleAtEnd.test(h) || partizipGe.test(h) || anzuerkennen) {
      sepHit = true;
      reasons.push('split finite / ge-participle / zu-infinitive pattern');
    }
  }

  // Known dual: abhängen — both exist; accept as separable (B1 "hängt … ab")
  if (low === 'abhängen') {
    sepHit = true;
    reasons.push('dual accent; B1 separable sense accepted (hängt … ab)');
  }

  // anerkennen is separable (erkennt … an) per DWDS/grammars
  if (low === 'anerkennen') {
    sepHit = true;
    reasons.push('anerkennen: erkennt … an (trennbar)');
  }

  if (sepHit) return { status: 'accept', reasons, separable: true };

  // If page exists as Verb but no clear split evidence → review
  if (/Grammatik\s*Verb/i.test(h) || />Verb</i.test(h)) {
    return { status: 'review', reasons: reasons.length ? reasons : ['verb page but weak split evidence'], separable: false };
  }

  return { status: 'review', reasons: reasons.length ? reasons : ['unclear'], separable: false };
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
