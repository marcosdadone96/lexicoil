#!/usr/bin/env node
/**
 * P3 verification — debate T4 alineado al tema pedido.
 * Run: node scripts/verify-p3-gates.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assessT4TopicAlignment, formatT4TopicAlignmentFailure } from './lib/t4TopicAlign.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'batches/generated');

function load(name) {
  const p = path.join(GEN, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function report(label, batch, overrides = {}) {
  const merged = { ...batch, ...overrides };
  const a = assessT4TopicAlignment(merged);
  const gate = assessT4TopicAlignment(merged);
  const chk27 = gate.ok ? 'PASS' : `BLOCK (${gate.reason})`;
  const line = [
    label,
    `expected=${a.expected}`,
    `debate=${a.debateId || '?'}`,
    `affinity=[${(a.affinity || []).join(',')}]`,
    `introDet=${a.introDetected || '—'}`,
    `fullDet=${a.detected || '—'}`,
    `CHK-27=${chk27}`,
  ].join(' | ');
  console.log(`  ${line}`);
  if (!gate.ok) console.log(`    → ${formatT4TopicAlignmentFailure(gate)}`);
  return a;
}

console.log('=== P3 unit tests ===');
const testRun = spawnSync(process.execPath, ['scripts/lib/__tests__/t4TopicAlign.test.mjs'], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (testRun.status !== 0) process.exit(1);

console.log('\n=== Casos límite (sintéticos) ===');
report('Homeoffice×Technik', load('lesen-t4-gemini-029.json') || {}, { topicTag: 'Technik' });
report('Homeoffice×Arbeit', load('lesen-t4-gemini-029.json') || {}, { topicTag: 'Arbeit' });
report('4-Tage×Bildung', {
  topicTag: 'Bildung',
  debateTopic: 'vier_tage_woche',
  passages: [{ title: 'Forum: Vier-Tage-Woche?', text: 'Vier-Tage-Woche mit vollem Gehalt.' }],
  questions: [{ module: 'lesen', teil: 4, signText: 'Weniger Arbeitstage wären gut für alle.' }],
});
report('Handy-Schule×Technik', {
  topicTag: 'Technik',
  debateTopic: 'handy_schule',
  passages: [{ title: 'Forum: Smartphones in der Schule?', text: 'Smartphones und Apps im Unterricht.' }],
  questions: [{ module: 'lesen', teil: 4, signText: 'Digitale Geräte und Apps sind wichtig.' }],
});

console.log('\n=== Batches reales ===');
const b028 = load('lesen-t4-gemini-028.json');
const b029 = load('lesen-t4-gemini-029.json');
const b030 = load('lesen-t4-gemini-030.json');

if (b029) {
  report('029 tal cual (Technik+Homeoffice → debe bloquear)', b029);
  report('029 relabel Arbeit (debate OK)', b029, { topicTag: 'Arbeit' });
}
if (b030) {
  report('030 tal cual (Technik → debe bloquear)', b030);
  report('030 relabel Freizeit (OK)', b030, { topicTag: 'Freizeit' });
}
if (b028) report('028 Freizeit/Sport (positivo)', b028);

console.log('\n=== isPartPoolReady (estructural, sin semantic) ===');
async function poolGate(label, batch) {
  if (!batch) return;
  const r = await isPartPoolReady(batch, { semantic: false });
  const chk27hit = r.blocking.filter((f) => f.id === 'CHK-27');
  console.log(
    `  ${label}: ok=${r.ok} CHK-27=${chk27hit.length ? 'BLOCK' : 'PASS'}` +
      (chk27hit[0] ? ` — ${chk27hit[0].message}` : ''),
  );
}

await poolGate('029 tal cual Technik', b029);
await poolGate('029 relabel Arbeit', b029 ? { ...b029, topicTag: 'Arbeit' } : null);
await poolGate('030 tal cual Technik', b030);
await poolGate('030 relabel Freizeit', b030 ? { ...b030, topicTag: 'Freizeit' } : null);
await poolGate('028 Freizeit', b028);

console.log('\nP3 verify: OK');
