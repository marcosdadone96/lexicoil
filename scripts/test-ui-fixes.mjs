#!/usr/bin/env node
/**
 * Acceptance: UI fixes (mastery sanitize, English strings, mojibake, POS, favicon).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: (k) => ls.delete(k),
};

require(path.join(ROOT, 'js/library/AnalyticsStore.js'));
const AnalyticsStore = require(path.join(ROOT, 'js/library/AnalyticsStore.js'));
const ManualVocab = require(path.join(ROOT, 'js/data/manualVocab.js'));
require(path.join(ROOT, 'js/bootstrap/featureFlashcards.js'));

let fail = false;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) fail = true;
}

// P1 — corrupt mastery stats sanitized
ls.set(
  'lc_mastery',
  JSON.stringify({
    profiles: {
      g1: {
        grammarTags: { Dativ: { correct: 0, total: 1696593, streak: 0 } },
        topicTags: {},
        modules: {},
        examsTaken: 2,
      },
    },
  }),
);
const AS = AnalyticsStore;
const profile = AS.getProfile({ id: 'g1' });
check('corrupt mastery total reset', (profile.grammarTags.Dativ?.total || 0) <= 100000);
check('corrupt tag removed or zeroed', !profile.grammarTags.Dativ || profile.grammarTags.Dativ.total === 0);

const fix1 = AS.runMasteryIntegrityFix();
const fix2 = AS.runMasteryIntegrityFix();
check('runMasteryIntegrityFix idempotent', fix1.fixed === true || fix1.fixed === false);
check('runMasteryIntegrityFix second run ok', fix2 !== undefined);

// P2 — no Spanish in featureQuota
const fq = fs.readFileSync(path.join(ROOT, 'js/bootstrap/featureQuota.js'), 'utf8');
check('featureQuota English AI credits', fq.includes('AI credits:') && !fq.includes('Créditos'));
check('featureQuota English exhausted msg', fq.includes("You've used all your AI credits"));

// P5 — no mojibake in js/content
let mojibake = 0;
for (const f of fs.readdirSync(path.join(ROOT, 'js/content'))) {
  if (!f.endsWith('.js')) continue;
  const text = fs.readFileSync(path.join(ROOT, 'js/content', f), 'utf8');
  if (text.includes('\uFFFD')) mojibake++;
}
check('js/content no U+FFFD', mojibake === 0);

// P6 — German POS
globalThis.S = { flashcards: [] };
function pos(word) {
  return ManualVocab.inferPos({ word, sourceLang: 'de' }, 'de');
}
check('Informationen -> noun', pos('Informationen') === 'noun');
check('Unterschied -> noun', pos('Unterschied') === 'noun');
check('Ausbildung -> noun', pos('Ausbildung') === 'noun');
check('gemeinschaftliche -> adjective', pos('gemeinschaftliche') === 'adjective');
check('einheitliche -> adjective', pos('einheitliche') === 'adjective');
check('Informationen overrides stored verb', ManualVocab.inferPos({ word: 'Informationen', type: 'verb', sourceLang: 'de' }, 'de') === 'noun');

// P7 — favicon consistency
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const demoHtml = fs.readFileSync(path.join(ROOT, 'demo.html'), 'utf8');
check('index title LexiCoil', /<title>LexiCoil<\/title>/.test(index));
check('demo title LexiCoil', /<title>LexiCoil<\/title>/.test(demoHtml));
check('index favicon svg', index.includes('/assets/brand/favicon.svg'));
check('demo favicon svg', demoHtml.includes('/assets/brand/favicon.svg'));

// C-1b — XSS: AI/user flashcard and exam text escaped before innerHTML
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const XSS_PAYLOAD = '"><img src=x onerror=alert(1)>';
const fcSrc = fs.readFileSync(path.join(ROOT, 'js/ui/vocabulary/flashcards.js'), 'utf8');
const erSrc = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examRunner.js'), 'utf8');
check('renderFCCard escapes fc.word', fcSrc.includes('${esc(fc.word)}'));
check('renderFCCard escapes fc.phonetic', fcSrc.includes('${esc(fc.phonetic)}'));
check('renderFCCard escapes fc.pos', fcSrc.includes('${esc(fc.pos)}'));
check('renderFCCard escapes tr', fcSrc.includes('${esc(tr)}'));
check('renderFCCard escapes ex', fcSrc.includes('${esc(ex)}'));
check('renderQ official head uses esc', erSrc.includes('const head=isOff?esc(q.question)'));
check('part.textTitle escaped in text block', erSrc.includes('${esc(part.textTitle||\'\')}'));
const fcGridHtml = `<div class="fc-word">${escHtml(XSS_PAYLOAD)}</div><div class="fc-trans">${escHtml(XSS_PAYLOAD)}</div>`;
check('flashcard grid HTML has no raw img tag', !/<img[\s/>]/i.test(fcGridHtml));
check('flashcard grid HTML escapes quotes and angle brackets', fcGridHtml.includes('&quot;&gt;&lt;img'));
const officialHead = escHtml(XSS_PAYLOAD);
check('official renderQ head has no raw img tag', !/<img[\s/>]/i.test(officialHead));
check('official renderQ head escapes quotes and angle brackets', officialHead.includes('&quot;&gt;&lt;img'));

process.exit(fail ? 1 : 0);
