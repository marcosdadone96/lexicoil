#!/usr/bin/env node
/**
 * BUG B (canary 2026-07-11): CHK-27 falsos positivos Autofreie/Vereine
 * cuando isPartPoolReady perdía _debateSeed en splitInputIntoPartRecords.
 *
 * Corrida: node scripts/lib/__tests__/t4-chk27-debateSeed-propagation.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPartPoolReady } from '../../audit-pass-2.mjs';
import { detectT4DebateTopic } from '../lesenSubtypeRotation.mjs';
import { pickNextT4DebateSeed, getSeedsForTopic } from '../t4DebateSeeds.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const REJECTED = path.join(ROOT, 'batches/generated/.rejected');

function loadRejected(name) {
  const p = path.join(REJECTED, name);
  const b = JSON.parse(fs.readFileSync(p, 'utf8'));
  delete b._rejectedReason;
  delete b._rejectedGate;
  delete b._rejectedAt;
  return b;
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

console.log('t4 CHK-27 debateSeed propagation (BUG B)');

test('T4_DEBATE_SEEDS ya filtra por topic (Familie/Gesundheit tienen seeds)', () => {
  assert.equal(getSeedsForTopic('Familie').length, 4);
  assert.equal(getSeedsForTopic('Gesundheit').length, 4);
  const f = pickNextT4DebateSeed([], 0, 'Familie');
  const g = pickNextT4DebateSeed([], 0, 'Gesundheit');
  assert.match(f.seed, /Elternzeit|Familie|Enkel|Kind/i);
  assert.match(g.seed, /Vorsorge|Arzt|Impfung|Apotheke|Krankenkasse|Krankenhaus/i);
  assert.equal(f.topic, 'Familie');
  assert.equal(g.topic, 'Gesundheit');
});

test('detectT4DebateTopic: vereinbaren ≠ vereinsfoerderung', () => {
  const id = detectT4DebateTopic({
    passages: [{
      title: 'Forum: Mehr Elternzeit?',
      text: 'Viele Familien wollen Beruf und Familie besser vereinbaren.',
    }],
    questions: [{ signText: 'Ich bin dafür wegen der Familie.', module: 'lesen', teil: 4 }],
  });
  assert.notEqual(id, 'vereinsfoerderung');
});

test('detectT4DebateTopic: Forum genérico ≠ autofrei fallback', () => {
  const id = detectT4DebateTopic({
    passages: [{
      title: 'Forum: Kostenlose Vorsorge?',
      text: 'Die Stadt diskutiert einen Vorschlag zur Gesundheit der Bewohner.',
    }],
    questions: [{ signText: 'Vorsorge beim Arzt ist wichtig.', module: 'lesen', teil: 4 }],
  });
  assert.notEqual(id, 'autofrei');
  assert.equal(id, null);
});

await testAsync('canary Gesundheit reject: con _debateSeed → sin CHK-27', async () => {
  const b = loadRejected('lesen-t4-gemini-002-2026-07-11T16-29-58-548Z.json');
  assert.ok(b._debateSeed, 'fixture must keep _debateSeed');
  const r = await isPartPoolReady(b, { skipSem2: true });
  const chk27 = (r.blocking || []).filter((f) => f.id === 'CHK-27');
  assert.equal(chk27.length, 0, chk27[0]?.message || 'unexpected CHK-27');
});

await testAsync('canary Familie reject: con _debateSeed → sin CHK-27', async () => {
  const b = loadRejected('lesen-t4-gemini-003-2026-07-11T16-48-43-104Z.json');
  assert.ok(b._debateSeed, 'fixture must keep _debateSeed');
  const r = await isPartPoolReady(b, { skipSem2: true });
  const chk27 = (r.blocking || []).filter((f) => f.id === 'CHK-27');
  assert.equal(chk27.length, 0, chk27[0]?.message || 'unexpected CHK-27');
});

await testAsync('sin _debateSeed: Gesundheit reproduce mensaje Autofreie (regresión documentada)', async () => {
  const b = loadRejected('lesen-t4-gemini-002-2026-07-11T16-29-58-548Z.json');
  delete b._debateSeed;
  delete b.debateSeed;
  // Tras quitar fallback autofrei, ya no debe inventar Autofreie;
  // el punto de esta aserción es que CON seed propagado no falla.
  // Si aún hubiera mold FP, CHK-27 podría aparecer por otra vía.
  const r = await isPartPoolReady(b, { skipSem2: true });
  const chk27 = (r.blocking || []).filter((f) => f.id === 'CHK-27');
  // Contenido es Gesundheit real → sin seed y sin fallback autofrei, CHK-27 no debe bloquear por mold.
  assert.equal(chk27.length, 0, `unexpected CHK-27 without seed: ${chk27[0]?.message}`);
});

console.log(`\n${passed} tests passed`);
