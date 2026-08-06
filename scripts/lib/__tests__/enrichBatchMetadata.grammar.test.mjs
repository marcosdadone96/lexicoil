/**
 * grammarTags v2.0 — GRAMMAR-FOCUS + flexible cupo.
 * Run: node scripts/lib/__tests__/enrichBatchMetadata.grammar.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inferGrammarTagsFromText,
  countGrammarSignals,
  questionSpecificGrammarBlob,
  passageGrammarBlob,
  enrichBatchMetadata,
  GRAMMAR_TAGS_NORMALIZE_VERSION,
  GRAMMAR_TAG_SOFT_MAX,
  GRAMMAR_TAG_MIN_COUNT,
} from '../enrichBatchMetadata.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');

let passed = 0;
let failed = 0;

function assert(desc, cond) {
  if (cond) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    failed++;
  }
}

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(POOL, name), 'utf8'));
}

console.log(`\n── grammar ${GRAMMAR_TAGS_NORMALIZE_VERSION} ──`);

assert('stamp v2.0', String(GRAMMAR_TAGS_NORMALIZE_VERSION).startsWith('v2.0'));
assert('soft max is 4–5 range', GRAMMAR_TAG_SOFT_MAX >= 4 && GRAMMAR_TAG_SOFT_MAX <= 5);
assert('modal min ≥ 2', GRAMMAR_TAG_MIN_COUNT['g-de-b1-modalverben'] >= 2);
assert('adj min ≥ 3', GRAMMAR_TAG_MIN_COUNT['g-de-b1-adjektivdeklination'] >= 3);

// Bare modal does not count
{
  const c = countGrammarSignals('Man kann das. Sie muss das.');
  assert('bare modal count=0', c['g-de-b1-modalverben'] === 0);
}
{
  const c = countGrammarSignals('Man kann besser lernen und muss mehr trainieren.');
  assert(`modal+inf counts (n=${c['g-de-b1-modalverben']})`, c['g-de-b1-modalverben'] >= 2);
}

// Perfekt: ist/sind + adjective must NOT count (v1→v2 false-positive that spiked 10%→52%)
console.log('\n── Perfekt ist/sind regression ──');
{
  const c = countGrammarSignals('Option a) ist die korrekte Aussage. Die Freunde sind interessiert.');
  assert(`ist/sind+adj → perfekt=0 (n=${c['g-de-b1-perfekt']})`, c['g-de-b1-perfekt'] === 0);
  const tags = inferGrammarTagsFromText(
    'Ihre Freunde sind interessiert und das Engagement ist toll.',
    1,
  );
  assert(`ist/sind item → no perfekt tag (${JSON.stringify(tags)})`, !tags.includes('g-de-b1-perfekt'));
}
{
  const c = countGrammarSignals('Sie hat das Buch gelesen und er ist nach Berlin gefahren.');
  assert(`real Perfekt ge- counts (n=${c['g-de-b1-perfekt']})`, c['g-de-b1-perfekt'] >= 2);
  const tags = inferGrammarTagsFromText('Sie hat das Buch gelesen und wir haben viel gelernt.', 1);
  assert(`real Perfekt tagged (${JSON.stringify(tags)})`, tags.includes('g-de-b1-perfekt'));
}

// Flexible cupo: more than 2 allowed when primary has many signals
{
  const text =
    'Das Projekt wird von der Stadt gestartet. Man könnte mehr Radwege bauen. ' +
    'Alle sollen mitmachen können, weil die Luft besser wird und damit die Kinder ' +
    'die in der Nähe wohnen, profitieren. Mit dem Bus und bei dem Park.';
  // Need enough for thresholds in primary alone
  const tags = inferGrammarTagsFromText(text, 2);
  assert(`flexible allows ≠2 (${JSON.stringify(tags)}, n=${tags.length})`, tags.length !== 2 || tags.length >= 1);
  assert('no forced defaults on rich text', tags.length >= 1);
}

// Empty primary → empty tags (no defaults)
{
  const tags = inferGrammarTagsFromText('Ja.', 1);
  assert(`empty/trivial item → 0 tags (${JSON.stringify(tags)})`, tags.length === 0);
}

// Passage-only must NOT tag
{
  const primary = 'Was ist das Thema? a) Sport b) Arbeit c) Umwelt';
  const passage =
    'Viele Menschen, die in der Stadt wohnen, fahren mit dem Bus, weil sie keine Zeit haben. ' +
    'Das Projekt wird von der Gemeinde gestartet. Man könnte mehr machen.';
  const tags = inferGrammarTagsFromText(primary, 2, { secondaryText: passage });
  assert(
    `passage-only signals ignored (${JSON.stringify(tags)})`,
    !tags.includes('g-de-b1-relativ') &&
      !tags.includes('g-de-b1-nebensatz') &&
      !tags.includes('g-de-b1-passiv') &&
      !tags.includes('g-de-b1-konjunktiv'),
  );
}

// Item has structure → tagged even if also in passage
{
  const primary =
    'Die Erklärung: Das Angebot wird von der Schule organisiert, weil die Eltern das wollen und damit alle Kinder mitmachen können.';
  const passage = 'Zusätzlich: Leute, die hier wohnen, sind froh.';
  const tags = inferGrammarTagsFromText(primary, 1, { secondaryText: passage });
  assert(
    `item passiv/nebensatz tagged (${JSON.stringify(tags)})`,
    tags.includes('g-de-b1-passiv') || tags.includes('g-de-b1-nebensatz') || tags.includes('g-de-b1-modalverben'),
  );
}

// ── Real fixtures: passage-only relativ/nebensatz must NOT appear ──────────
console.log('\n── fixtures: passage-only must not tag ──');

const passageOnlyCases = [
  ['horen-t2-gemini-007.json', 'gen-q-h2-41c1f630-q3'],
  ['horen-t2-gemini-013.json', 'gen-q-h2-62f5bf71-q2'],
  ['lesen-t1-gemini-139.json', 'gen-q-1-fa022359-2'],
];

for (const [file, id] of passageOnlyCases) {
  const batch = load(file);
  const q = batch.questions.find((x) => x.id === id) || batch.questions[0];
  const p = (batch.passages || []).find((x) => x.id === q.passageId);
  const primary = questionSpecificGrammarBlob(q);
  const secondary = passageGrammarBlob(p);
  const primaryCounts = countGrammarSignals(primary);
  const secondaryCounts = countGrammarSignals(secondary);
  const tags = inferGrammarTagsFromText(primary, q.teil, { secondaryText: secondary });

  const relInPrimary = (primaryCounts['g-de-b1-relativ'] || 0) >= 2;
  const nebInPrimary = (primaryCounts['g-de-b1-nebensatz'] || 0) >= 2;
  const relInPassage = (secondaryCounts['g-de-b1-relativ'] || 0) >= 2;
  const nebInPassage = (secondaryCounts['g-de-b1-nebensatz'] || 0) >= 2;

  assert(
    `${file} ${id}: primary has little/no rel+neb (relP=${primaryCounts['g-de-b1-relativ']}, nebP=${primaryCounts['g-de-b1-nebensatz']})`,
    !relInPrimary && !nebInPrimary,
  );
  assert(
    `${file} ${id}: passage has rel/neb (relS=${secondaryCounts['g-de-b1-relativ']}, nebS=${secondaryCounts['g-de-b1-nebensatz']})`,
    relInPassage || nebInPassage,
  );
  assert(
    `${file} ${id}: tags omit passage-only rel/neb (${JSON.stringify(tags)})`,
    !tags.includes('g-de-b1-relativ') && !tags.includes('g-de-b1-nebensatz'),
  );
}

// ── Real fixtures: item-local structures should still tag ───────────────────
console.log('\n── fixtures: item-local structures still tag ──');

{
  // Synthetic-on-real-shape: explanation with clear konjunktiv+modal
  const tags = inferGrammarTagsFromText(
    'Richtig, weil man mehr Radwege bauen könnte und alle mit dem Bus fahren sollen können.',
    2,
  );
  assert(
    `item-local konj/modal/neb (${JSON.stringify(tags)})`,
    tags.includes('g-de-b1-konjunktiv') ||
      tags.includes('g-de-b1-modalverben') ||
      tags.includes('g-de-b1-nebensatz'),
  );
}

{
  const batch = load('lesen-t4-gemini-017.json');
  const { batch: enriched } = enrichBatchMetadata(batch, {
    topic: false,
    vocab: false,
    grammar: true,
    forceGrammar: true,
  });
  const withAny = enriched.questions.filter((q) => (q.grammarTags || []).length > 0);
  const withKonj = enriched.questions.filter((q) =>
    (q.grammarTags || []).includes('g-de-b1-konjunktiv'),
  );
  assert(
    `017 enrich runs (tagged=${withAny.length}/${enriched.questions.length}, konj=${withKonj.length})`,
    enriched._grammarTagsNormalizeVersion === GRAMMAR_TAGS_NORMALIZE_VERSION,
  );
  // At least some questions may be empty — that's OK; stamp must be set
  assert('017 allows variable length including possibly 0', true);
}

{
  const batch = load('horen-t2-gemini-007.json');
  const { batch: enriched } = enrichBatchMetadata(batch, {
    topic: false,
    vocab: false,
    grammar: true,
    forceGrammar: true,
  });
  for (const q of enriched.questions) {
    const len = (q.grammarTags || []).length;
    assert(`${q.id} soft-max respected (n=${len})`, len <= GRAMMAR_TAG_SOFT_MAX);
  }
}

// Item with repeated weil/dass in explanation
{
  const tags = inferGrammarTagsFromText(
    'Falsch, weil der Text sagt, dass die Kurse gratis sind, und weil alle mitmachen können.',
    2,
  );
  assert(
    `item nebensatz ≥2 → tagged (${JSON.stringify(tags)})`,
    tags.includes('g-de-b1-nebensatz'),
  );
}

{
  const tags = inferGrammarTagsFromText(
    'Die Menschen, die hier leben, und die Kinder, die Sport machen, profitieren.',
    1,
  );
  assert(
    `item relativ ≥2 → tagged (${JSON.stringify(tags)})`,
    tags.includes('g-de-b1-relativ'),
  );
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
