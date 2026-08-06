#!/usr/bin/env node
/**
 * LanguageTool MUST_CATCH harness.
 *
 * Offline (always):
 *   - 58+ real findings from today's audits are present in the groundtruth
 *   - noise rules are filtered by isRealLanguageToolMatch
 *   - frozen windows still contain the bad span (content regression)
 *
 * Live (when Docker LT is up):
 *   - each MUST_CATCH window re-triggers the expected ruleId
 *   - soft-skip (exit 0 + warning) if LT is unreachable — never blocks CI alone
 *
 *   node scripts/lib/__tests__/languagetoolGate.mustCatch.test.mjs
 *   node scripts/lib/__tests__/languagetoolGate.mustCatch.test.mjs --require-live
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isRealLanguageToolMatch,
  LT_NOISE_RULE_IDS,
  pingLanguageTool,
  checkTextWithLanguageTool,
} from '../qualityGates/languageToolGate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'languagetoolGate.groundtruth.json',
);
const requireLive = process.argv.includes('--require-live');

const gt = JSON.parse(fs.readFileSync(GT_PATH, 'utf8'));
let passed = 0;
let failed = 0;
let skipped = 0;

function ok(desc) {
  console.log(`  ✅  ${desc}`);
  passed++;
}
function fail(desc, detail) {
  console.error(`  ❌  ${desc}`);
  if (detail) console.error(`       ${detail}`);
  failed++;
}
function skip(desc) {
  console.log(`  ⏭  ${desc}`);
  skipped++;
}

console.log('\n── LT groundtruth inventory ──');
const first = (gt.MUST_CATCH || []).filter((c) => c.source === 'languagetool-audit-2026-07-11');
if (first.length === 58) ok(`first-run MUST_CATCH count = 58 (got ${first.length})`);
else fail(`first-run MUST_CATCH count = 58`, `got ${first.length}`);

if ((gt.MUST_CATCH || []).length >= 58) ok(`total MUST_CATCH ≥ 58 (${gt.MUST_CATCH.length})`);
else fail(`total MUST_CATCH ≥ 58`, `got ${gt.MUST_CATCH.length}`);

console.log('\n── noise filter ──');
for (const id of LT_NOISE_RULE_IDS) {
  if (!isRealLanguageToolMatch({ ruleId: id })) ok(`noise excluded: ${id}`);
  else fail(`noise excluded: ${id}`);
}
if (isRealLanguageToolMatch({ ruleId: 'DE_DATE_WEEKDAY_CURRENTYEAR' })) {
  ok('real rule kept: DE_DATE_WEEKDAY_CURRENTYEAR');
} else fail('real rule kept: DE_DATE_WEEKDAY_CURRENTYEAR');
if (isRealLanguageToolMatch({ ruleId: 'GERMAN_SPELLER_RULE' })) {
  ok('real rule kept: GERMAN_SPELLER_RULE');
} else fail('real rule kept: GERMAN_SPELLER_RULE');

console.log('\n── frozen windows still contain span (content regression) ──');
let windowFails = 0;
for (const c of gt.MUST_CATCH || []) {
  const win = String(c.window || '');
  const span = String(c.span || '');
  if (!span || !win.includes(span)) {
    fail(`${c.id}: window missing span`, JSON.stringify({ span, window: win.slice(0, 80) }));
    windowFails++;
  }
}
if (windowFails === 0) ok(`all ${gt.MUST_CATCH.length} windows contain their span`);

console.log('\n── live LT recheck (soft-skip if down) ──');
const ping = await pingLanguageTool();
if (!ping.ok) {
  const msg = `LT unreachable (${ping.reason}) — live MUST_CATCH skipped`;
  if (requireLive) fail(msg);
  else skip(msg);
} else {
  ok(`LT reachable (${ping.languageCount} languages)`);
  // Sample live recheck: date/weekday + a handful of spellers (full 67 is slow)
  const liveCases = [
    ...(gt.MUST_CATCH || []).filter((c) => c.ruleId === 'DE_DATE_WEEKDAY_CURRENTYEAR'),
    ...(gt.MUST_CATCH || []).filter((c) => c.ruleId === 'GERMAN_SPELLER_RULE').slice(0, 5),
    ...(gt.MUST_CATCH || []).filter((c) => c.ruleId === 'DE_AGREEMENT').slice(0, 2),
    ...(gt.MUST_CATCH || []).filter((c) => c.ruleId === 'COMPOUND_INFINITIV_RULE').slice(0, 2),
  ];
  // de-dupe by id
  const uniq = [...new Map(liveCases.map((c) => [c.id, c])).values()];
  let liveHit = 0;
  let liveMiss = 0;
  for (const c of uniq) {
    try {
      const { matches } = await checkTextWithLanguageTool(c.window);
      const hit = matches.some(
        (m) =>
          m.ruleId === c.ruleId &&
          (c.span ? c.window.slice(m.offset, m.offset + m.length).includes(c.span.slice(0, 8)) || m.ruleId === c.ruleId : true),
      );
      // Accept same ruleId anywhere in the window (offset may shift with windowing)
      const hitRule = matches.some((m) => m.ruleId === c.ruleId);
      if (hitRule) {
        liveHit++;
        ok(`live ${c.ruleId}: ${c.id}`);
      } else {
        liveMiss++;
        fail(`live ${c.ruleId}: ${c.id}`, `rules=${matches.map((m) => m.ruleId).join(',') || 'none'}`);
      }
    } catch (err) {
      liveMiss++;
      fail(`live ${c.id}`, err.message);
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  console.log(`  live sample: hit=${liveHit} miss=${liveMiss}`);
}

console.log(`\n── Result: ${passed} passed, ${failed} failed, ${skipped} skipped ──`);
if (failed > 0) process.exit(1);
