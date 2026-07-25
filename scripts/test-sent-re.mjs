// Validate new SENTENCE_END_RE before applying it.
//
// New regex has three alternatives:
//   alt1: standard [.!?:] + optional unambiguous opening-quote after it
//   alt2: em/en dash alone (dialogue turns)
//   alt3: unambiguous opening quotes alone (never closing: „ « ‚ ' " — all LEFT forms)
//         + ')' for list-option markers like "a) "
//
// Character notes:
//   '  = U+0027 ASCII apostrophe (ambiguous: opening OR closing) — only in alt1 after :
//   „  = U+201E low-9 double (German opening) — always opening → safe in alt3
//   «  = U+00AB left angle guillemet — opening in German context → safe in alt3
//   ‚  = U+201A low-9 single (German opening) — always opening → safe in alt3
//   '  = U+2018 left single quotation mark — always opening → safe in alt3
//   "  = U+201C left double quotation mark — always opening → safe in alt3
//   –  = U+2013 en dash   (dialogue)
//   —  = U+2014 em dash   (dialogue)

const NEW_RE = /[.!?:]\s*['"„«‚\u2018\u201c\u00ab]?\s*$|[\u2013\u2014–—]\s*$|[„«‚\u2018\u201c\u00ab)]\s*$/;

const cases = [
  // ── FPs that must now be PROTECTED (wantMatch=true → midSentence=false → no lowercase) ─
  { prev: "sagt: '",              wantMatch: true,  label: "colon + ASCII ' (most common FP)" },
  { prev: "sagt: \u201a",         wantMatch: true,  label: "colon + ‚  (low-9 single open)" },
  { prev: "sagt: \u00ab",         wantMatch: true,  label: "colon + «" },
  { prev: "das Thema \u00ab",     wantMatch: true,  label: "« guillemet alone mid-sent (title)" },
  { prev: "helfen? \u2013 ",      wantMatch: true,  label: "en dash after ?  (dialogue turn)" },
  { prev: "sagt \u2013 ",         wantMatch: true,  label: "en dash after word (dialogue)" },
  { prev: "a) ",                  wantMatch: true,  label: "list option 'a) ' before first word" },
  { prev: "b) ",                  wantMatch: true,  label: "list option 'b) '" },

  // ── True errors that must NOT be protected (wantMatch=false → midSentence=true → checked) ─
  { prev: "man ",                 wantMatch: false, label: "plain prev word 'man' (Eher case)" },
  { prev: "So ",                  wantMatch: false, label: "plain prev word 'So' (Viele case)" },
  { prev: "wie ",                 wantMatch: false, label: "plain prev word 'wie' (Möglich case)" },
  { prev: "Praxis ",              wantMatch: false, label: "plain prev word (Schwierig mid-sent)" },

  // ── CLOSING quote must NOT protect the next word ──────────────────────────────────────────
  // User's scenario: «das Buch 'Viele Wege' Lange gesucht»
  // When detector reaches 'Lange', prevContent = "Buch 'Viele Wege' "
  // The trailing ' is ASCII (closing) — must NOT match alt3 → Lange still detected
  { prev: "Buch 'Viele Wege' ",   wantMatch: false, label: "closing ASCII ' — Lange must still be detected" },
  // German closing »
  { prev: "das Buch \u00bbgut\u00ab ", wantMatch: false, label: "closing » alone — must NOT block" },
  // Right single quotation mark U+2019 (closing)
  { prev: "sagt \u2018gut\u2019 ", wantMatch: false, label: "U+2019 closing ' — must NOT block" },

  // ── Sentence ends with period then opens quote ────────────────────────────────────────────
  { prev: "Ende. '",              wantMatch: true,  label: ". then ASCII '  (new sentence + quote)" },
  { prev: "Ende. ",              wantMatch: true,  label: ". alone → midSentence false (sentence start)" },
];

let pass = 0, fail = 0;
for (const { prev, wantMatch, label } of cases) {
  const got = NEW_RE.test(prev);
  const ok  = got === wantMatch;
  if (ok) { pass++; console.log("  OK   [" + (got ? "MATCH" : "    ") + "] " + label); }
  else    { fail++; console.log("  FAIL [" + (got ? "MATCH" : "    ") + "] " + label + "  prev=" + JSON.stringify(prev)); }
}
console.log("\n" + pass + " pass, " + fail + " fail");
