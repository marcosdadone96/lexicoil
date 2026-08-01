#!/usr/bin/env node
/**
 * Post-deploy: A2 Personalizado topic picker uses 5 official axes (not full B1 list).
 *   SMOKE_BASE_URL=https://www.lexicoil.com node scripts/verify-prod-a2-picker-static.mjs
 */
const BASE = (process.env.SMOKE_BASE_URL || 'https://www.lexicoil.com').replace(/\/$/, '');

async function fetchText(path) {
  const url = `${BASE}/${path.replace(/^\//, '')}`;
  const res = await fetch(url);
  const text = await res.text();
  return { status: res.status, text, url };
}

function assert(cond, msg, detail) {
  if (!cond) {
    console.error('FAIL:', msg, detail ?? '');
    process.exit(1);
  }
  console.log('OK:', msg);
}

const app = await fetchText('app.html');
assert(app.status === 200, 'app.html HTTP 200', app.url);
assert(app.text.includes('js/data/a2Topics.js'), 'app.html loads a2Topics.js');

const pts = await fetchText('js/data/personalTopicStock.js');
assert(pts.status === 200, 'personalTopicStock.js HTTP 200');
assert(pts.text.includes('topicsForLevel'), 'personalTopicStock has topicsForLevel');
assert(pts.text.includes('A2_OFFICIAL_TOPICS'), 'personalTopicStock references A2_OFFICIAL_TOPICS');

const a2 = await fetchText('js/data/a2Topics.js');
assert(a2.status === 200, 'a2Topics.js HTTP 200');
assert(a2.text.includes('A2_OFFICIAL_TOPICS'), 'a2Topics defines A2_OFFICIAL_TOPICS');

const b1 = await fetchText('js/data/b1Topics.js');
assert(b1.status === 200, 'b1Topics.js HTTP 200');
const b1Count = (b1.text.match(/B1_TOPICS\s*=\s*\[/g) ? 1 : 0);
const b1TopicsMatch = b1.text.match(/B1_TOPICS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
let b1Len = 0;
if (b1TopicsMatch) {
  b1Len = (b1TopicsMatch[1].match(/'/g) || []).length / 2;
}

// Runtime check (same logic as browser after scripts load)
const { createRequire } = await import('node:module');
const { pathToFileURL } = await import('node:url');
const vm = await import('node:vm');
const path = await import('node:path');
const fs = await import('node:fs');
const os = await import('node:os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a2picker-'));
fs.writeFileSync(path.join(tmp, 'b1Topics.js'), b1.text);
fs.writeFileSync(path.join(tmp, 'a2Topics.js'), a2.text);
fs.writeFileSync(path.join(tmp, 'examLevelLayout.js'), (await fetchText('js/data/examLevelLayout.js')).text);
fs.writeFileSync(path.join(tmp, 'personalTopicStockFactory.js'), (await fetchText('js/data/personalTopicStockFactory.js')).text);
fs.writeFileSync(path.join(tmp, 'personalTopicStock.js'), pts.text);

const sandbox = { module: { exports: {} }, exports: {}, window: {}, console };
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(tmp, 'b1Topics.js'), 'utf8') +
    '\nif(typeof B1Topics!=="undefined"){};' +
    fs.readFileSync(path.join(tmp, 'a2Topics.js'), 'utf8').replace('require(', '/*req*/(') +
    '\nconst A2Topics = typeof window !== "undefined" ? window.A2Topics : null;' +
    fs.readFileSync(path.join(tmp, 'examLevelLayout.js'), 'utf8') +
    '\nconst ExamLevelLayout = window.ExamLevelLayout;' +
    fs.readFileSync(path.join(tmp, 'personalTopicStockFactory.js'), 'utf8') +
    '\nconst PersonalTopicStockFactory = window.PersonalTopicStockFactory;' +
    fs.readFileSync(path.join(tmp, 'personalTopicStock.js'), 'utf8') +
    '\nconst PersonalTopicStock = window.PersonalTopicStock;',
  sandbox,
);

// Simpler: eval manifest via exported buildFallbackManifest
const code = `
  ${fs.readFileSync(path.join(tmp, 'b1Topics.js'), 'utf8')}
  ${fs.readFileSync(path.join(tmp, 'a2Topics.js'), 'utf8')}
  ${fs.readFileSync(path.join(tmp, 'examLevelLayout.js'), 'utf8')}
  ${fs.readFileSync(path.join(tmp, 'personalTopicStockFactory.js'), 'utf8')}
  ${fs.readFileSync(path.join(tmp, 'personalTopicStock.js'), 'utf8')}
  const m = PersonalTopicStock.buildFallbackManifest('de','A2','horen');
  JSON.stringify({ topics: m.topics.map(t => t.topic), count: m.topics.length, b1Len: ${b1Len} });
`;
const out = vm.runInNewContext(code, {
  window: {},
  module: { exports: {} },
});
const parsed = JSON.parse(out);
const official = ['Reisen', 'Gesundheit', 'Stadtleben', 'Medien', 'Umwelt'];
assert(parsed.count === 5, 'A2 fallback manifest has 5 topics', parsed);
assert(
  official.every((t) => parsed.topics.includes(t)),
  'topics are official 5 axes',
  parsed.topics,
);
assert(parsed.count < 10, 'not B1-sized topic list (16)', { count: parsed.count, b1Len });

console.log('\nA2 Personalizado picker static verification passed.');
console.log('INFO manifest topics:', JSON.stringify(parsed.topics));
