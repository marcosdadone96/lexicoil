/**
 * speakingHintMarkup.test.mjs
 *
 * Regression, live in production German: the Sprechen hint read
 *   Ihre Antwort (Format <b>Ich:</b> / <b>Prüfer:</b>)
 * with the tags spelled out. The locale strings in js/i18n/examUiLocale.js mark the literal
 * prefixes the candidate must type, and three places consume them — examRunner renders the
 * string raw (bold works), while speakingFlow and speakingConversation ran it through esc(),
 * which turned the markup into visible text. Found doing the en/B1 QA; it affects de and es
 * the same way.
 *
 * Fix: escKeepBold() escapes everything and then restores <b> alone.
 *
 * Run:  node scripts/lib/__tests__/speakingHintMarkup.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

let passed = 0;
let failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  OK   ${desc}`); passed++; }
  else { console.error(`  FAIL ${desc}`); failed++; }
}

// The real esc/escKeepBold out of examRunner.js.
const runnerSrc = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examRunner.js'), 'utf8');
const helpers = runnerSrc.slice(runnerSrc.indexOf('function esc(s)'), runnerSrc.indexOf('function stashPassageMeta'));
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(helpers, sandbox);
const { esc, escKeepBold } = sandbox;

assert('escKeepBold exists', typeof escKeepBold === 'function');

const de = 'Ihre Antwort (Format <b>Ich:</b> / <b>Prüfer:</b>)';
const out = escKeepBold(de);
assert('the bold survives as real markup', out.includes('<b>Ich:</b>') && out.includes('<b>Prüfer:</b>'));
assert('no tag is left spelled out', !out.includes('&lt;b&gt;'));
assert('the wording is untouched', out.replace(/<\/?b>/g, '') === 'Ihre Antwort (Format Ich: / Prüfer:)');

// Everything that is not <b> must stay escaped.
const nasty = 'a <script>alert(1)</script> b <B>x</B> c <img src=x onerror=y> "q" \'s\' & <b>ok</b>';
const safe = escKeepBold(nasty);
assert('script tags stay escaped', !/<script/i.test(safe) && safe.includes('&lt;script&gt;'));
assert('img tags stay escaped', !/<img/i.test(safe));
assert('quotes and ampersands stay escaped', safe.includes('&quot;') && safe.includes('&#39;') && safe.includes('&amp;'));
assert('only lowercase <b> is restored', (safe.match(/<b>/g) || []).length === 1 && (safe.match(/<\/b>/g) || []).length === 1);
assert('an uppercase <B> is not restored', safe.includes('&lt;B&gt;'));
assert('plain text is unchanged', escKeepBold('sin markup') === esc('sin markup'));
assert('empty input is safe', escKeepBold('') === '' && escKeepBold(null) === '' && escKeepBold(undefined) === '');

// The consumers must go through it, or the bug comes back.
for (const rel of ['js/ui/exam/speakingFlow.js', 'js/ui/exam/speakingConversation.js']) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // Every line that prints the locale string must go through escKeepBold. speakingFlow
  // prints it via the `hint` variable, speakingConversation reads ui.speakFmt inline, and
  // both files also have plain hint lines that need no unescaping.
  const printing = src
    .split('\n')
    .filter((l) => l.includes('speak-path-hint') && /\$\{[^}]*(speakFmt|\bhint\b)/.test(l));
  assert(`${path.basename(rel)} prints the locale hint`, printing.length > 0);
  assert(
    `${path.basename(rel)} renders every locale hint with escKeepBold`,
    printing.every((l) => l.includes('escKeepBold')),
  );
}

// The locale strings this exists for.
const locale = fs.readFileSync(path.join(ROOT, 'js/i18n/examUiLocale.js'), 'utf8');
const withBold = (locale.match(/speakFmt: '[^']*<b>/g) || []).length;
assert(`the speakFmt strings still carry the bold (${withBold} locales)`, withBold >= 3);

console.log(`\nspeaking hint markup: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
