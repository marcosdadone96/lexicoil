/**
 * Probe implicit cache after prompt reorder (STATIC_CORE + VARIABLE_SUFFIX).
 * Run: node scripts/probe-cache-reorder-2026-07-13.mjs
 */
import { loadEnvFile } from './lib/loadEnv.mjs';
import { buildLesenPrompt, buildLesenStaticCore } from './lib/lesenTemplatePrompt.mjs';
import { generateContent } from './lib/geminiClient.mjs';
import { parseUsageMetadata, costUsdFromTokens, cachedInputSavingsUsd } from './lib/generationCostLog.mjs';
import { VARIABLE_SUFFIX_MARKER } from './lib/promptAssembly.mjs';

loadEnvFile();

const TOPICS = ['Arbeit', 'Sport', 'Wohnen', 'Bildung', 'Reisen'];
const WORD_SETS = [
  ['arbeit', 'firma', 'kollege', 'programm', 'stadt', 'familie'],
  ['sport', 'training', 'verein', 'fitness', 'mannschaft', 'wettkampf'],
  ['wohnen', 'miete', 'nachbar', 'wohnung', 'haus', 'stadt'],
  ['bildung', 'kurs', 'schule', 'lernen', 'prüfung', 'beruf'],
  ['reisen', 'urlaub', 'hotel', 'zug', 'koffer', 'ticket'],
];

function lcpChars(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

const staticCore = buildLesenStaticCore(2);
console.log('STATIC_CORE lesen T2 chars:', staticCore.length, '≈', Math.ceil(staticCore.length / 4), 'tokens');
console.log('Marker present in assembled prompts:', VARIABLE_SUFFIX_MARKER.trim());

const prompts = TOPICS.map((topic, i) =>
  buildLesenPrompt(2, WORD_SETS[i], { idSuffix: `probe${i}`, topic }),
);

const lcp01 = lcpChars(prompts[0], prompts[1]);
console.log(
  'LCP prompt A vs B (chars):',
  lcp01,
  '≈',
  Math.ceil(lcp01 / 4),
  'tokens — static prefix should match through CHECKLIST',
);

const results = [];
let totalCost = 0;
let totalCached = 0;
let totalPrompt = 0;
let totalSavings = 0;

for (let i = 0; i < prompts.length; i++) {
  const res = await generateContent({
    prompt: prompts[i],
    jsonMode: true,
    maxTokens: 128,
    temperature: 0.3,
  });
  const parsed = parseUsageMetadata(res.usage);
  const cost = costUsdFromTokens(
    parsed.promptTokens,
    parsed.outputTokensBilled,
    parsed.cachedContentTokenCount,
  );
  const savings = cachedInputSavingsUsd(parsed.promptTokens, parsed.cachedContentTokenCount);
  const pct = parsed.promptTokens
    ? Math.round((100 * parsed.cachedContentTokenCount) / parsed.promptTokens)
    : 0;
  results.push({
    call: i + 1,
    topic: TOPICS[i],
    promptTokens: parsed.promptTokens,
    cachedContentTokenCount: parsed.cachedContentTokenCount,
    cachePct: pct,
    costUsd: cost,
    cachedInputSavingsUsd: savings,
  });
  totalCost += cost;
  totalCached += parsed.cachedContentTokenCount;
  totalPrompt += parsed.promptTokens;
  totalSavings += savings;
  console.log(
    `Call ${i + 1} (${TOPICS[i]}): prompt=${parsed.promptTokens} cached=${parsed.cachedContentTokenCount} (${pct}%) savings=$${savings.toFixed(6)}`,
  );
}

const callsWithCache = results.filter((r) => r.cachedContentTokenCount > 0).length;
const avgCachePct =
  results.length > 1
    ? Math.round(
        results.slice(1).reduce((s, r) => s + r.cachePct, 0) / (results.length - 1),
      )
    : 0;

console.log('\n=== SUMMARY ===');
console.log('Calls with cache hit (2-5 expected):', callsWithCache, '/', results.length);
console.log('Avg cache % calls 2-5:', avgCachePct + '%');
console.log('Total cached input savings:', '$' + totalSavings.toFixed(6));
console.log('Total API cost (5 mini gens):', '$' + totalCost.toFixed(6));

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
const out = path.join(ROOT, 'batches/ready/gate-logs/cache-reorder-probe-2026-07-13.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify({ ts: new Date().toISOString(), staticCoreChars: staticCore.length, lcpChars: lcp01, results, totalSavings, avgCachePct }, null, 2),
);
console.log('Written:', out);
