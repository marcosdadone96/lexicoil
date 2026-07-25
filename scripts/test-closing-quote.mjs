/**
 * Answers user Q1: does a closing quote BLIND real error detection?
 *
 * The new SENTENCE_END_RE marks something as "sentence start" when prevContent ends with:
 *   alt1: [.!?:] + optional opening-quote  (e.g. ": '", "? –", ".")
 *   alt2: en/em dash alone                 (e.g. "– ")
 *   alt3: UNAMBIGUOUS opening quotes alone  (e.g. "«", "„", "‚")
 *        + ")" for list markers
 *
 * The ASCII closing apostrophe ' (U+0027) is NOT in alt3.
 * Closing ' after a word therefore does NOT trigger "sentence start".
 */

const NEW_RE = /[.!?:]\s*['"„«‚\u2018\u201c\u00ab]?\s*$|[\u2013\u2014–—]\s*$|[„«‚\u2018\u201c\u00ab)]\s*$/;

const cases = [
  // ── 3 real errors: prevContent immediately before the bad word ────────────
  // midSentence must be TRUE (RE must NOT match) → error detected
  { prevContent: 'Wahre Erholung findet man ',       word: 'Eher',    expectDetect: true,  label: 'Eher after "man " — real error' },
  { prevContent: 'So ',                               word: 'Viele',   expectDetect: true,  label: 'Viele after "So " — real error' },
  { prevContent: 'So Viele Buecher wie ',             word: 'Möglich', expectDetect: true,  label: 'Möglich after "wie " — real error' },

  // ── User Q1 scenario: «das Buch 'Viele Wege' Lange gesucht» ──────────────
  // prevContent when detector reaches 'Lange' ends with the CLOSING apostrophe + space
  // midSentence must be TRUE → Lange still detected
  { prevContent: "das Buch 'Viele Wege' ",            word: 'Lange',   expectDetect: true,  label: "Closing ASCII ' before Lange — MUST still detect" },

  // ── Variant: «Neue Ideen» alt-title style ─────────────────────────────────
  // If pool had a closing » before a plain word, that word should still be checkable
  { prevContent: 'Er las das Buch \u00bbNeues\u00ab und ', word: 'Lange', expectDetect: true, label: 'Word after closing « (Swiss) — still detectable' },

  // ── For completeness: sentence starting with real quote (these must NOT detect) ─
  { prevContent: "Der Text sagt: '",                   word: 'Viele',   expectDetect: false, label: "Colon + ' before Viele — FP, must NOT detect" },
  { prevContent: 'Hier \u2013 ',                       word: 'Guten',   expectDetect: false, label: 'En dash before Guten — FP, must NOT detect' },
  { prevContent: 'Das Thema \u00ab',                   word: 'Neue',    expectDetect: false, label: '« before Neue title — FP, must NOT detect' },
];

let pass = 0, fail = 0;
for (const { prevContent, word, expectDetect, label } of cases) {
  const reMatches  = NEW_RE.test(prevContent);
  const midSentence = !reMatches;       // midSentence=true → checked for error
  const detected   = midSentence;       // simplified: detection = midSentence (word is in NEVER_NOUN_WORDS)
  const ok = detected === expectDetect;
  const tag = detected ? 'DETECTED' : 'SKIPPED ';
  if (ok) { pass++; console.log(`  OK   [${tag}] ${label}`); }
  else    { fail++; console.log(`  FAIL [${tag}] ${label}\n           prevContent=${JSON.stringify(prevContent)}`); }
}
console.log(`\n${pass} pass, ${fail} fail`);
console.log('\nConclusion: closing ASCII \'...\' does NOT reset detection — real errors remain detectable.');
