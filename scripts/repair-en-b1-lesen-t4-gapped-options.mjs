#!/usr/bin/env node
/**
 * Cambridge B1 Reading Part 4 (gapped text) — restore the missing A–H sentence pool.
 *
 * The generator produced `food-market-02` and `-03` with the eight candidate sentences
 * never written: every option was its own key ("a) A" … "h) H"), so the task could not be
 * answered at all. `library/en/B1/passages.json` carries no `ads[]` for these passages
 * either, which is why validateLetteredPoolHasText() flags them (blueprintFidelity.js:550)
 * and both exams fail validate-exam-fidelity with options_without_text.
 *
 * The passages, the answer keys and the explanations were fine, so only the option pools are
 * rewritten here — keyed to the answers already committed:
 *   -02  gaps 1..5 → E, C, A, F, D
 *   -03  gaps 1..5 → H, B, C, E, A
 *
 * The stub propagated to five files (batch, library questions, pool seed, curated cell and
 * the served exams), so the replacement walks each tree by question id instead of assuming
 * one shape. Idempotent: options already carrying text are left alone.
 *
 *   node scripts/repair-en-b1-lesen-t4-gapped-options.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = path.resolve(import.meta.dirname, '..');

/** Eight candidates per passage: five keyed to the gaps, three distractors. */
const POOLS = {
  '02': [
    'A) In the end I bought a warm vegetable pie from a stall near the entrance.',
    'B) Unfortunately, the rain started before I could finish my coffee.',
    'C) There was far more choice than I had expected from such a small market.',
    'D) Several of my neighbours have told me they now shop there every week.',
    'E) I decided to go early so that I could see everything before the crowds arrived.',
    'F) The music made the whole square feel even more welcoming.',
    'G) The market is only open on the last Sunday of every month.',
    'H) I had never bought anything directly from a farmer before.',
  ],
  '03': [
    'A) It had been a much better morning than I had imagined.',
    'B) He seemed pleased that someone was interested in his work.',
    'C) I went to look for somewhere to have lunch.',
    'D) The market has been part of the town for over fifty years.',
    'E) The pastry was still warm and the filling tasted of fresh herbs.',
    'F) Sadly, most of the stalls had already sold out by the time I arrived.',
    'G) I usually do all my shopping at the supermarket outside town.',
    'H) Even so, I was surprised by how early the traders began setting up.',
  ],
};

const TARGETS = [
  'batches/merged/lesen-t4-gapped-food-market-02.json',
  'batches/merged/lesen-t4-gapped-food-market-03.json',
  'library/en/B1/questions.json',
  'library/pool-seed/en_B1.json',
  'library/curated/en/B1/curated_en_B1_265a91d95c9d.json',
  'data/exams/en_B1.json',
];

const QUESTION_ID = /en-b1-r-t4-gapped-food-market-(02|03)-q[1-5]$/;
/** An option that is nothing but its own key: "a) A", "H) H", "C". */
const isStub = (o) => /^([a-jA-J])\)?\s*\1$/i.test(String(o ?? '').trim());

function repairNode(node, counter) {
  if (Array.isArray(node)) {
    for (const child of node) repairNode(child, counter);
    return;
  }
  if (!node || typeof node !== 'object') return;

  const match = QUESTION_ID.exec(String(node.id ?? ''));
  if (match && Array.isArray(node.options) && node.options.length && node.options.every(isStub)) {
    node.options = [...POOLS[match[1]]];
    counter.count += 1;
  }
  for (const value of Object.values(node)) repairNode(value, counter);
}

let total = 0;
for (const rel of TARGETS) {
  const file = path.join(ROOT, rel);
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  const counter = { count: 0 };
  repairNode(data, counter);

  if (counter.count && !DRY_RUN) {
    const trailing = raw.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}${trailing}`);
  }
  total += counter.count;
  console.log(`  ${counter.count === 0 ? '·' : '✔'} ${rel} — ${counter.count} ocurrencia(s)`);
}

// 10 ids distintos, pero cada fichero lleva su copia y pool-seed repite celdas: 50 en total.
console.log(`\n${DRY_RUN ? '[dry-run] ' : ''}Ocurrencias reparadas: ${total} (0 al volver a pasarlo)`);
