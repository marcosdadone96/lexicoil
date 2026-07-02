/**
 * diag-caps-scan.mjs
 * Scans batches for incorrectly capitalised adjectives/adverbs mid-sentence.
 * Usage: node scripts/diag-caps-scan.mjs
 */
import fs from 'fs';

// Words that are NEVER nouns — if capitalised mid-sentence it's an error
const ALWAYS_ADJECTIVE = new Set([
  'viele','viel','vielleicht',
  'lange','lang',
  'schwierig','schwierige','schwierigen','schwieriges','schwierigem',
  'eher',
  'möglich','mögliche','möglichen','mögliches','möglichem',
  'gerne','gern',
  'eigene','eigenen','eigenes','eigenem','eigener',
  'kleine','kleinen','kleines','kleinem','kleiner',
  'große','großen','großes','großem','großer',
  'gute','guten','gutes','gutem','guter',
  'neue','neuen','neues','neuem','neuer',
  'alte','alten','altes','altem','alter',
  'schöne','schönen','schönes','schönem','schöner',
  'wichtige','wichtigen','wichtiges','wichtigem','wichtiger',
  'richtige','richtigen','richtiges','richtigem','richtiger',
  'falsche','falschen','falsches','falschem','falscher',
  'einfache','einfachen','einfaches','einfachem','einfacher',
  'interessante','interessanten',
  'letzte','letzten','letztes','letztem',
  'erste','ersten','erstes','erstem',
  'beste','besten','bestes','bestem',
  'andere','anderen','anderes','anderem',
  'nächste','nächsten',
  // Adverbs/quantifiers
  'sehr','auch','noch','schon','nur','immer','nie','oft','ganz',
  'bereits','leider','natürlich','eigentlich','vielleicht',
]);

const files = [
  'batches/generated/lesen-t4-gemini-011.json',
  'batches/generated/lesen-t4-gemini-013.json',
  'batches/generated/lesen-t2-058.json',
  'batches/generated/lesen-t2-059.json',
];

// Sentence-end chars: after these a capital is OK (new sentence)
const SENTENCE_END = /[.!?:;]\s*$/;

let totalHits = 0;

for (const f of files) {
  let b;
  try { b = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }

  const texts = [];
  for (const p of b.passages || []) {
    if (p.text)  texts.push({ t: p.text,  src: f + ' → passage.text' });
    if (p.title) texts.push({ t: p.title, src: f + ' → passage.title' });
  }
  for (const q of b.questions || []) {
    if (q.signText)   texts.push({ t: q.signText,   src: f + ' → q.signText[' + q.id + ']' });
    if (q.question)   texts.push({ t: q.question,   src: f + ' → q.question[' + q.id + ']' });
    if (q.explanation) texts.push({ t: q.explanation, src: f + ' → q.explanation[' + q.id + ']' });
  }

  for (const { t, src } of texts) {
    // Split on word boundaries while keeping position info
    const tokenRe = /([A-Za-zÄÖÜäöüß]+)|(\s+)|([^A-Za-zÄÖÜäöüß\s])/g;
    const tokens = [];
    let m;
    while ((m = tokenRe.exec(t)) !== null) {
      tokens.push({ val: m[0], isWord: !!m[1], pos: m.index });
    }

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (!tok.isWord) continue;
      if (!/^[A-ZÄÖÜ]/.test(tok.val)) continue; // not capitalised, skip

      // Check if at sentence start: look backward for content
      let prevContent = '';
      for (let j = i - 1; j >= 0; j--) {
        prevContent = tokens[j].val + prevContent;
        if (tokens[j].isWord || /\S/.test(tokens[j].val)) break;
      }
      // If nothing before or sentence-ender before → legitimate capital
      if (!prevContent || SENTENCE_END.test(prevContent)) continue;

      // Check if the lowercase form is in our adjective list
      const lc = tok.val.toLowerCase();
      if (!ALWAYS_ADJECTIVE.has(lc)) continue;

      // Get context
      const start = Math.max(0, tok.pos - 40);
      const end = Math.min(t.length, tok.pos + tok.val.length + 40);
      const ctx = t.slice(start, end).replace(/\n/g, ' ');
      console.log(`[${tok.val}] ${src}`);
      console.log(`  "...${ctx}..."`);
      totalHits++;
    }
  }
}

if (totalHits === 0) {
  console.log('No incorrect mid-sentence capitals found in these batches.');
} else {
  console.log(`\nTotal: ${totalHits} incorrect mid-sentence capitals found.`);
}
