#!/usr/bin/env node
/** No stale hardcoded pricing in app UI; PlanPricing matches landing PLAN_PRICING. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const STALE_PATTERNS = [
  { re: /9\.99/, label: '9.99' },
  { re: /3\.99/, label: '3.99' },
  { re: /100 AI credits/i, label: '100 AI credits (Pro)' },
];

function walkJs(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkJs(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

function assertNoStalePricingInFile(relPath, content) {
  for (const { re, label } of STALE_PATTERNS) {
    assert.ok(!re.test(content), `${relPath} must not contain stale price copy "${label}"`);
  }
}

for (const rel of ['index.html']) {
  const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  assert.match(content, /planPricing\.js/, `${rel} loads planPricing.js`);
  assert.match(content, /id="upgradeModalIntro"/, `${rel} upgrade modal uses PlanPricing placeholders`);
  assert.match(content, /id="upgradeCreditPacksSection"/, `${rel} upgrade modal includes credit pack purchase`);
  assertNoStalePricingInFile(rel, content);
}

for (const file of walkJs(path.join(ROOT, 'js'))) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  assertNoStalePricingInFile(rel, fs.readFileSync(file, 'utf8'));
}

function loadPlanPricing() {
  const sandbox = { window: {}, document: { readyState: 'complete', addEventListener() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/bootstrap/state.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/lib/planPricing.js'), 'utf8'), sandbox);
  return sandbox.window.PlanPricing;
}

const pp = loadPlanPricing();
assert.equal(pp.proSubscriptionEur, 13);
assert.equal(pp.proMaxSubscriptionEur, 24);
assert.equal(pp.aiCreditsPro, 40);
assert.equal(pp.aiCreditsProMax, 150);
assert.equal(pp.aiCreditsFree, 6);
assert.equal(pp.proRolloverMax, 50);
assert.equal(pp.minPackPriceEur(), 6);
assert.equal(pp.packOffers().map((o) => o.priceEur).join(','), '6,14,30');

const toast = pp.proActivatedToast();
assert.match(toast, /40 AI credits/);
assert.match(toast, /€13\/month/);
assert.match(toast, /packs from €6/);
assert.match(toast, /roll over up to 50/);

const intro = pp.upgradeIntroHtml();
assert.match(intro, /40 AI credits/);
assert.match(intro, /Pro Max/);
assert.match(intro, /150 AI credits/);
assert.match(intro, /from <b>€6<\/b>/);

const landingConstants = fs.readFileSync(path.join(ROOT, 'landing/src/lib/constants.ts'), 'utf8');
assert.match(landingConstants, /priceLabel: 'EUR 13'/);
assert.match(landingConstants, /aiCreditsPerMonth: 40/);
assert.match(landingConstants, /priceLabel: 'EUR 24'/);
assert.match(landingConstants, /aiCreditsPerMonth: 150/);

console.log('test-plan-pricing-ui: ok');
