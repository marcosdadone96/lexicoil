#!/usr/bin/env node
/** Sprechen module-tag heading — no duplicate «Teil N: Teil N». */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Mirror speakingFlow.js (browser bundle) — keep in sync with sprechenPartModuleTag
function isRedundantSprechenPartTitle(title, teilNum) {
  const t = String(title || '').trim();
  const n = String(teilNum ?? '').trim();
  if (!t || !n) return false;
  return new RegExp(`^(teil|sprechen|speaking|part)\\s*${n}\\s*$`, 'i').test(t);
}

function sprechenPartModuleTag(part, ui) {
  const modLabel = ui?.speaking || 'Sprechen';
  const teilLabel = ui?.teil || 'Teil';
  const teilNum = part?.teil ?? '';
  let line = `${modLabel} — ${teilLabel} ${teilNum}`;
  const title = String(part?.title || '').trim();
  if (title && !isRedundantSprechenPartTitle(title, teilNum)) {
    line += `: ${title}`;
  }
  return line;
}

const ui = { speaking: 'SPRECHEN', teil: 'Teil' };

assert.equal(
  sprechenPartModuleTag({ teil: 1, title: 'Teil 1' }, ui),
  'SPRECHEN — Teil 1',
);
assert.equal(
  sprechenPartModuleTag({ teil: 2, title: 'Präsentation' }, ui),
  'SPRECHEN — Teil 2: Präsentation',
);
assert.equal(
  sprechenPartModuleTag({ teil: 1, title: 'Sprechen 1' }, ui),
  'SPRECHEN — Teil 1',
);

console.log('PASS: sprechen part heading (no duplicate Teil)');
