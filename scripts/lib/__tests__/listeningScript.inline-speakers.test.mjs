/**
 * listeningScript.inline-speakers.test.mjs
 * Regression: a speaker label written inline (no newline between turns) must
 * split into one segment per turn. The old pattern allowed "." and spaces
 * inside the name, so a match could start mid-sentence and swallow the tail of
 * the previous turn ("...keep going. Interviewer"); segmentsLookBroken then saw
 * a >30 char speaker and collapsed the whole dialogue to a single narrator
 * voice. Cambridge B1 Listening Part 4 (interview) was read by one voice, with
 * the labels spoken aloud.
 * Run:  node scripts/lib/__tests__/listeningScript.inline-speakers.test.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ListeningScript = require(path.join(ROOT, 'js/bootstrap/listeningScript.js'));

let passed = 0, failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  OK   ${desc}`); passed++; }
  else { console.error(`  FAIL ${desc}`); failed++; }
}

const speakersOf = (segs) => [...new Set(segs.map((s) => s.speaker))];

// 1) Cambridge Part 4 shape: whole interview on one line, turns ending in a
//    period — the period is what let the old class reach back across it.
const enT4 = "Interviewer: Was it always your dream to be a chef? Sarah: Actually, no. "
  + "I wanted to be a musician, but I loved cooking for friends. I almost gave up once, "
  + "but my mentor encouraged me to keep going. Interviewer: What is the most popular dish "
  + "on your menu? Sarah: Definitely the stew. I learned the spice mix from my grandmother.";
const en = ListeningScript.prepare(enT4, 'en');
assert('EN inline interview splits into 2 speakers', speakersOf(en).length === 2);
assert('EN speakers are Interviewer/Sarah', speakersOf(en).sort().join(',') === 'Interviewer,Sarah');
assert('EN no speaker absorbs previous sentence', en.every((s) => s.speaker.length <= 25));
assert('EN labels stripped from spoken text', en.every((s) => !/^(Interviewer|Sarah):/.test(s.text)));

// 2) A monologue that merely contains a colon must NOT be split into speakers.
const deMono = 'Herzlich willkommen zu unserem heutigen Beitrag über das Thema Wohnen. '
  + 'Überlegen Sie genau, welche Kriterien Ihre neue Wohnung erfüllen muss: Brauchen Sie '
  + 'ein großes Schlafzimmer? Ist eine moderne Küche wichtig? Achten Sie auf Ihren '
  + 'Energieverbrauch. Kleine Dinge wie Licht sparen schon viel Geld.';
const mono = ListeningScript.prepare(deMono, 'de');
assert('DE monologue with mid-sentence colon stays single voice', mono.length === 1);

// 3) Guillemet-wrapped turns (de/B1 pool shape) keep splitting.
const deQuoted = '«Moderator: Ist nachhaltiges Leben wirklich so einfach?»\n'
  + '«Lena: Für mich bedeutet es, bewusste Entscheidungen zu treffen.»\n'
  + '«Thomas: Das klingt gut, aber in der Realität ist es oft schwierig.»';
const quoted = ListeningScript.prepare(deQuoted, 'de');
assert('DE guillemet turns split into 3 speakers', speakersOf(quoted).length === 3);

// 4) Marker-separated turns (de/A2 served shape) keep splitting.
const deMarker = '■ Tochter: Mama, meine neue Schule ist zu weit weg! '
  + '■ Mutter: Nein, es sind nur 15 Minuten mit dem Bus. '
  + '■ Tochter: Aber meine Freundinnen bleiben in der alten Schule!';
const marker = ListeningScript.prepare(deMarker, 'de');
assert('DE marker turns split into 2 speakers', speakersOf(marker).length === 2);

// 5) One speaker per line (the common shape) is unaffected by the inline path.
const deLines = 'Anna: Hast du schon gepackt?\nBen: Noch nicht, ich suche meinen Pass.';
const lines = ListeningScript.prepare(deLines, 'de');
assert('DE one-per-line still splits into 2 speakers', speakersOf(lines).length === 2);

// 6) Plain prose with no labels stays a single narrator.
const plain = 'The museum opens at nine and closes at five. Tickets cost eight pounds.';
assert('prose without labels stays single voice', ListeningScript.prepare(plain, 'en').length === 1);

console.log(`\nlisteningScript inline-speakers: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
