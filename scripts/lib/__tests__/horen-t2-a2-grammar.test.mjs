/**
 * Hören A2 T2 matching — grammar inference for retrieval gate (Cause E gap).
 * Run: node scripts/lib/__tests__/horen-t2-a2-grammar.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  enrichBatchMetadata,
  inferGrammarTagsFromText,
  questionSpecificGrammarBlob,
  isA2MatchingQuestion,
} from '../enrichBatchMetadata.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
let passed = 0;
let failed = 0;

function assert(desc, cond) {
  if (cond) {
    console.log(`  ✅ ${desc}`);
    passed += 1;
  } else {
    console.error(`  ❌ ${desc}`);
    failed += 1;
  }
}

const batch075Path = path.join(
  ROOT,
  'batches/needs-regeneration/A2/horen-t2-gemini-075.json',
);
const batch075 = JSON.parse(fs.readFileSync(batch075Path, 'utf8'));

console.log('\n── horen-t2-075: standard vs A2 matching inference ──');
let stdHits = 0;
let a2Hits = 0;
for (const q of batch075.questions) {
  assert('is A2 matching', isA2MatchingQuestion(q, 'A2'));
  const blob = questionSpecificGrammarBlob(q);
  const std = inferGrammarTagsFromText(blob, 2);
  const a2 = inferGrammarTagsFromText(blob, 2, { a2Matching: true });
  if (std.length) stdHits += 1;
  if (a2.length) a2Hits += 1;
}
assert('BEFORE: 0/5 questions pass standard inference (reproduces missing_grammarTags)', stdHits === 0);
assert('AFTER a2Matching: ≥2/5 questions get grammar tags', a2Hits >= 2);

console.log('\n── enrichBatchMetadata on 075 (finalizePoolReady path) ──');
const { batch: enriched } = enrichBatchMetadata(batch075, {
  forceGrammar: true,
  fillGrammarDefaults: false,
});
const gramQs = enriched.questions.filter((q) => (q.grammarTags || []).length > 0);
assert('enriched batch passes retrieval gate (≥1 Q with grammarTags)', gramQs.length >= 1);
assert('grammar tags are valid g-de-b1-* (not topicTag)', gramQs.every((q) =>
  (q.grammarTags || []).every((t) => /^g-de-b1-[a-z]+$/.test(t)),
));
assert('not all 5 Q share identical grammar (no blind fillDefaults)', new Set(
  enriched.questions.map((q) => JSON.stringify(q.grammarTags || [])),
).size >= 2 || gramQs.length === 1);

console.log('\n── batch 083: bare explanations → passage Q1 fallback ──');
const batch083Path = path.join(ROOT, 'batches/needs-regeneration/A2/horen-t2-gemini-083.json');
if (fs.existsSync(batch083Path)) {
  const batch083 = JSON.parse(fs.readFileSync(batch083Path, 'utf8'));
  const { batch: e83 } = enrichBatchMetadata(batch083, { forceGrammar: true, fillGrammarDefaults: false });
  const g83 = e83.questions.filter((q) => (q.grammarTags || []).length > 0);
  assert('083: gate pass via Q1 passage fallback', g83.length >= 1);
  assert('083: only Q1 tagged (not all 5 cloned)', g83.length === 1);
  assert('083: Q1 tags from dialogue', (e83.questions[0].grammarTags || []).includes('g-de-b1-modalverben'));
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed ? 1 : 0);
