#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { auditSinglePartRecord } from '../../audit-pass-2.mjs';
import { buildValidatedT3Part } from '../../make-t3.mjs';
import { tagBatchWithTopic } from '../topicRotation.mjs';
import {
  detectTopicFromT3Situations,
  filterBlueprintsForTopic,
  isLesenT3TopicCompatible,
  isBlueprintHardExcludedForTopic,
  TOPIC_BLUEPRINT_PREFERENCE,
} from '../lesenT3TopicFilter.mjs';
import { B1_TOPICS } from '../b1Topics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const { detectTopic } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

const sample = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts/t3-blueprints/bp-koffer-brille.json'), 'utf8'),
);

assert.equal(isLesenT3TopicCompatible('Konsum', 'Reisen'), false);
assert.equal(isLesenT3TopicCompatible('Konsum', 'Wohnen'), true);
assert.equal(isLesenT3TopicCompatible('Konsum', 'Stadtleben'), true);

const konsumPool = filterBlueprintsForTopic(
  fs
    .readdirSync(path.join(ROOT, 'scripts/t3-blueprints'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/t3-blueprints', f), 'utf8'));
      bp.slug = f.replace(/\.json$/, '');
      return bp;
    }),
  'Konsum',
);
assert.ok(konsumPool.length > 0, 'some blueprints compatible with Konsum');
assert.ok(
  !konsumPool.some((bp) => bp.slug.includes('koffer-brille')),
  'bp-koffer-brille excluded for Konsum',
);

const arbeitPool = filterBlueprintsForTopic(
  fs
    .readdirSync(path.join(ROOT, 'scripts/t3-blueprints'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/t3-blueprints', f), 'utf8'));
      bp.slug = f.replace(/\.json$/, '');
      return bp;
    }),
  'Arbeit',
);
assert.ok(arbeitPool.some((bp) => bp.slug === 'bp-klima-tanz'), 'bp-klima-tanz available for Arbeit');
assert.ok(
  !arbeitPool.some((bp) => bp.slug === 'bp-schuhe-mode'),
  'bp-schuhe-mode hard-excluded for Arbeit',
);
assert.equal(isBlueprintHardExcludedForTopic('Arbeit', 'bp-schuhe-mode'), true);

const schuhe = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts/t3-blueprints/bp-schuhe-mode.json'), 'utf8'),
);
assert.equal(isLesenT3TopicCompatible('Arbeit', detectTopicFromT3Situations(schuhe.questions)), true,
  'lexical filter alone would keep schuhe-mode (false positive)');

let arbeitChk26Fails = 0;
for (let i = 0; i < 4; i++) {
  const raw = buildValidatedT3Part({ requestedTopic: 'Arbeit', maxAttempts: 12 });
  const batch = tagBatchWithTopic({ ...raw, module: 'lesen', teil: 3 }, 'Arbeit');
  batch._requestedTopic = 'Arbeit';
  const findings = auditSinglePartRecord(batch, `test-arbeit-${i}.json`);
  const hit = findings.filter((f) => f.id === 'CHK-26');
  if (hit.length) arbeitChk26Fails++;
  assert.notEqual(raw._blueprintSlug, 'bp-schuhe-mode', 'Arbeit must not use schuhe-mode');
}
assert.equal(arbeitChk26Fails, 0, `CHK-26 should not fail Arbeit T3 (${arbeitChk26Fails}/4)`);

const fullText = [
  ...sample.questions.map((q) => q.question),
  ...sample.questions.flatMap((q) => q.options || []),
].join(' ');
assert.notEqual(detectTopic(fullText), 'Konsum');

const sitOnly = detectTopicFromT3Situations(sample.questions);
assert.equal(isLesenT3TopicCompatible('Konsum', sitOnly), false);

let chk26Fails = 0;
for (let i = 0; i < 6; i++) {
  const raw = buildValidatedT3Part({ requestedTopic: 'Konsum', maxAttempts: 12 });
  const batch = tagBatchWithTopic({ ...raw, module: 'lesen', teil: 3 }, 'Konsum');
  batch._requestedTopic = 'Konsum';
  const findings = auditSinglePartRecord(batch, `test-konsum-${i}.json`);
  const hit = findings.filter((f) => f.id === 'CHK-26');
  if (hit.length) chk26Fails++;
}
assert.equal(chk26Fails, 0, `CHK-26 should not fail Konsum T3 (${chk26Fails}/6)`);

const allBps = fs
  .readdirSync(path.join(ROOT, 'scripts/t3-blueprints'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/t3-blueprints', f), 'utf8'));
    bp.slug = f.replace(/\.json$/, '');
    return bp;
  });

for (const topic of Object.keys(TOPIC_BLUEPRINT_PREFERENCE)) {
  const pool = filterBlueprintsForTopic(allBps, topic);
  assert.ok(pool.length > 0, `${topic} T3 pool must not be empty after preference map`);
}

let familieChk26Fails = 0;
for (let i = 0; i < 4; i++) {
  const raw = buildValidatedT3Part({ requestedTopic: 'Familie', maxAttempts: 12 });
  const batch = tagBatchWithTopic({ ...raw, module: 'lesen', teil: 3 }, 'Familie');
  batch._requestedTopic = 'Familie';
  const findings = auditSinglePartRecord(batch, `test-familie-${i}.json`);
  const hit = findings.filter((f) => f.id === 'CHK-26');
  if (hit.length) familieChk26Fails++;
  assert.equal(raw._blueprintSlug, 'bp-familie', 'Familie should use bp-familie');
  assert.equal(detectTopicFromT3Situations(batch.questions), 'Familie', 'situations should detect Familie');
}
assert.equal(familieChk26Fails, 0, `CHK-26 should not fail Familie T3 (${familieChk26Fails}/4)`);

const FIVE_THEME_CASES = [
  { topic: 'Gesundheit', slug: 'bp-gesundheit', runs: 4 },
  { topic: 'Ernährung', slug: 'bp-ernaehrung', runs: 4 },
  { topic: 'Umwelt', slug: 'bp-umwelt', runs: 4 },
  { topic: 'Kultur', slug: 'bp-musik', runs: 4 },
  { topic: 'Freizeit', slug: null, runs: 4 },
];

const fiveThemeSummary = [];
for (const { topic, slug, runs } of FIVE_THEME_CASES) {
  let fails = 0;
  for (let i = 0; i < runs; i++) {
    const raw = buildValidatedT3Part({ requestedTopic: topic, maxAttempts: 12 });
    const batch = tagBatchWithTopic({ ...raw, module: 'lesen', teil: 3 }, topic);
    batch._requestedTopic = topic;
    const findings = auditSinglePartRecord(batch, `test-${topic}-${i}.json`);
    const hit = findings.filter((f) => f.id === 'CHK-26');
    if (hit.length) fails++;
    if (slug) {
      assert.equal(raw._blueprintSlug, slug, `${topic} should use ${slug}`);
    } else {
      assert.ok(
        ['bp-freizeit-garten', 'bp-reparatur-kurse'].includes(raw._blueprintSlug),
        `${topic} should use a Freizeit blueprint`,
      );
    }
    assert.equal(
      isLesenT3TopicCompatible(topic, detectTopicFromT3Situations(batch.questions)),
      true,
      `${topic} situations must pass CHK-26 gate`,
    );
  }
  assert.equal(fails, 0, `CHK-26 should not fail ${topic} T3 (${fails}/${runs})`);
  fiveThemeSummary.push(`${topic} ${runs}/${runs}`);
}

console.log(
  'lesen-t3-topic-chk26.test.mjs OK — Konsum 6/6 + Arbeit 4/4 + Familie 4/4 + ' +
    fiveThemeSummary.join(' + ') +
    ' sin CHK-26',
);
