/**
 * Scan pool-verified for split separable candidates not in SEPARABLE_INFINITIVES.
 * Usage: node scripts/scan-separable-pool-gaps.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import SeparableResolve from '../js/engine/separableResolve.js';
import { A1_CORE, A2_CORE, B1_CORE } from './lib/de-frequency-tiers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'batches/ready/pool-verified');

const PREFIXES = SeparableResolve.SEPARABLE_PREFIXES;
const allow = SeparableResolve.SEPARABLE_INFINITIVES;
const ARTICLE_AFTER = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
]);
const AFTER_OK = new Set([
  '__sb__', '__cb__',
  'und', 'oder', 'aber', 'denn', 'sondern', 'doch',
  'bitte', 'mal', 'einfach', 'gleich', 'noch', 'auch', 'nicht', 'nur',
  'schon', 'immer', 'oft', 'sofort', 'heute', 'morgen', 'später', 'früher',
  'dass', 'daß', 'weil', 'wenn', 'ob', 'als', 'indem', 'während', 'obwohl',
]);

function particleLooksFinal(tokens, j) {
  const next = j + 1 < tokens.length ? tokens[j + 1] : '';
  if (!next || next === '__sb__' || next === '__cb__') return true;
  if (ARTICLE_AFTER.has(next)) return false;
  if (AFTER_OK.has(next)) return true;
  return false;
}

/** Open scan: any prefix+root looking like a verb, regardless of allowlist */
function findOpenSplits(tokens) {
  const pairs = [];
  const seenRoot = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '__sb__' || t === '__cb__') continue;
    if (seenRoot.has(i)) continue;
    const root = SeparableResolve.rootOfToken(t);
    if (!root) continue;
    for (let j = i + 1; j < Math.min(tokens.length, i + 14); j++) {
      const p = tokens[j];
      if (p === '__sb__' || p === '__cb__') continue;
      if (!PREFIXES.includes(p)) continue;
      const next = j + 1 < tokens.length ? tokens[j + 1] : '';
      if (next && ARTICLE_AFTER.has(next)) continue;
      if (!particleLooksFinal(tokens, j)) continue;
      let broken = false;
      for (let k = i + 1; k < j; k++) {
        if (tokens[k] === '__sb__') {
          broken = true;
          break;
        }
      }
      if (broken) continue;
      if (p === 'zu') {
        const prev = j > 0 ? tokens[j - 1] : '';
        if (prev === 'um') continue;
        if (next && /(?:en|eln|ern)$/.test(next) && next.length >= 4) continue;
      }
      const full = `${p}${root}`;
      if (!/(?:en|eln|ern)$/.test(full) || full.length < 6) continue;
      seenRoot.add(i);
      pairs.push({
        lemma: full,
        rootToken: t,
        particle: p,
        root,
        covered: allow.has(full),
      });
      break;
    }
  }
  return pairs;
}

function collectText(obj, out = []) {
  if (!obj) return out;
  if (typeof obj === 'string') {
    if (obj.length > 15) out.push(obj);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const x of obj) collectText(x, out);
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'options' && Array.isArray(v)) {
        for (const o of v) {
          if (o?.text) out.push(String(o.text));
        }
        continue;
      }
      if (/^(id|_id|hash|fingerprint|passageId|key|module|teil)$/i.test(k)) continue;
      collectText(v, out);
    }
  }
  return out;
}

function rank(map) {
  return [...map.entries()]
    .map(([lemma, v]) => ({
      lemma,
      count: v.count,
      files: v.files.size,
      example: v.examples[0] || '',
    }))
    .sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma));
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
const uncovered = new Map();
const covered = new Map();

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const t of collectText(j)) {
    const pairs = findOpenSplits(SeparableResolve.tokenize(t));
    for (const p of pairs) {
      const map = p.covered ? covered : uncovered;
      const cur = map.get(p.lemma) || { count: 0, examples: [], files: new Set() };
      cur.count += 1;
      cur.files.add(f);
      if (cur.examples.length < 2) {
        cur.examples.push(String(t).replace(/\s+/g, ' ').trim().slice(0, 140));
      }
      map.set(p.lemma, cur);
    }
  }
}

const unc = rank(uncovered);
const cov = rank(covered);

const prefixes = [...PREFIXES].sort((a, b) => b.length - a.length);
function looksSeparableInf(w) {
  const low = String(w || '')
    .toLowerCase()
    .normalize('NFC');
  if (!/(?:en|eln|ern)$/.test(low) || low.length < 6) return false;
  // reject obvious nouns
  if (/(ungen|heiten|keiten|schaften|nisse)$/.test(low)) return false;
  for (const p of prefixes) {
    if (low.startsWith(p) && low.length > p.length + 3) {
      const root = low.slice(p.length);
      if (/(?:en|eln|ern)$/.test(root) && root.length >= 4) return low;
    }
  }
  return false;
}

const B1_REF = [
  'aufstehen', 'anrufen', 'anfangen', 'ankommen', 'einkaufen', 'einladen', 'ausgehen', 'mitkommen',
  'mitmachen', 'mitnehmen', 'mitbringen', 'aufhören', 'aufpassen', 'aufräumen', 'anmachen', 'ausmachen',
  'einschalten', 'ausschalten', 'anziehen', 'ausziehen', 'anbieten', 'vorschlagen', 'vorstellen',
  'vorbereiten', 'teilnehmen', 'stattfinden', 'kennenlernen', 'abholen', 'abfahren', 'absagen',
  'zurückkommen', 'weggehen', 'losgehen', 'losfahren', 'nachdenken', 'zumachen', 'aufmachen', 'aussehen',
  'ausfüllen', 'einsteigen', 'aussteigen', 'umsteigen', 'abmelden', 'anmelden', 'zunehmen', 'abnehmen',
  'ausgeben', 'einnehmen', 'aufgeben', 'weitergehen', 'weitermachen', 'zusammenfassen', 'unterschreiben',
  'überweisen', 'ausprobieren', 'auswählen', 'aufschreiben', 'einpacken', 'einschlafen', 'aufwachen',
  'einfallen', 'auffallen', 'herstellen', 'feststellen', 'festhalten', 'beitragen', 'beibringen',
  'ankündigen', 'anschauen', 'ansehen', 'nachfragen', 'nachschauen', 'vorhaben', 'vorlesen', 'vorkommen',
  'zuhören', 'zugeben', 'zubereiten', 'mitteilen', 'mitspielen', 'aufnehmen', 'aufbauen', 'eintragen',
  'einziehen', 'ausdenken', 'zurückgeben', 'wegfahren', 'herkommen', 'abschließen', 'abgeben', 'anbauen',
  'anwenden', 'anfragen', 'einsparen', 'umziehen', 'aufklären', 'aufregen', 'anprobieren', 'ausdrucken',
  'einreichen', 'auflegen', 'ablehnen', 'zustimmen', 'durchführen', 'übernehmen', 'anklicken', 'ankreuzen',
  'ausschneiden', 'einräumen',
];

const tierGaps = [...new Set([...A1_CORE, ...A2_CORE, ...B1_CORE].map(looksSeparableInf).filter(Boolean))]
  .filter((w) => !allow.has(w))
  .filter((w) => !/(abendessen|mittagessen|anlagen|antworten|ausgaben|auswirkungen|einkommen|unterlagen|unternehmen|unterstützen|zufrieden|zusammen|übersetzen|überzeugen|anforderungen|ausgefallen)/.test(w));

const refMissing = B1_REF.filter((w) => !allow.has(w));

/** Real adds: pool-uncovered hits + curated B1 gaps that are true separables */
const NOUNISH = new Set([
  'anforderungen', 'anlagen', 'antworten', 'ausgaben', 'auswirkungen', 'einkommen',
  'unterlagen', 'unternehmen', 'mittagessen', 'abendessen', 'zusammen', 'zufrieden',
]);

const poolLemmas = unc.map((x) => x.lemma).filter((l) => !NOUNISH.has(l));
const toAdd = [...new Set([...poolLemmas, ...refMissing])]
  .filter((w) => !allow.has(w) && !NOUNISH.has(w))
  .filter((w) => looksSeparableInf(w) || B1_REF.includes(w))
  .sort();

const report = {
  poolFiles: files.length,
  allowlistCount: allow.size,
  coveredUnique: cov.length,
  coveredHits: cov.reduce((s, x) => s + x.count, 0),
  uncoveredUnique: unc.length,
  uncoveredHits: unc.reduce((s, x) => s + x.count, 0),
  uncovered: unc,
  coveredTop: cov.slice(0, 25),
  tierGaps,
  refMissing,
  toAdd,
};

const outPath = path.join(ROOT, 'batches/ready/gate-logs/separable-pool-gaps-2026-07-12.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(`allowlist: ${allow.size}`);
console.log(`pool files: ${files.length}`);
console.log(`covered split hits: ${report.coveredHits} unique=${cov.length}`);
console.log(`UNCOVERED split hits: ${report.uncoveredHits} unique=${unc.length}`);
if (unc.length) {
  console.log('\nUncovered (pool impact):');
  for (const x of unc) {
    console.log(`  ${x.count}x ${x.files}f  ${x.lemma}  | ${x.example.slice(0, 100)}`);
  }
}
console.log('\nB1-ref missing:', refMissing.join(', '));
console.log('\nRecommended ADD (' + toAdd.length + '):');
console.log(toAdd.join(', '));
console.log('\nwrote', outPath);
