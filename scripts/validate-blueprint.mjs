#!/usr/bin/env node
/**
 * Validates exam blueprint JSON files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLUEPRINTS = ['goethe_B1', 'goethe_B2', 'cambridge_B2', 'cambridge_C1'];

let errors = 0;

function req(obj, keys, label) {
  for (const k of keys) {
    if (obj[k] == null || obj[k] === '') {
      console.error(`MISSING ${label}.${k}`);
      errors++;
    }
  }
}

for (const id of BLUEPRINTS) {
  const file = path.join(ROOT, 'library', 'blueprints', `${id}.json`);
  if (!fs.existsSync(file)) {
    console.error('MISSING', file);
    errors++;
    continue;
  }
  const bp = JSON.parse(fs.readFileSync(file, 'utf8'));
  req(bp, ['id', 'examType', 'language', 'level', 'modules'], id);
  if (bp.principle !== 'fixed_structure_dynamic_content') {
    console.error('INVALID principle', id);
    errors++;
  }
  const modIds = new Set();
  for (const mod of bp.modules || []) {
    if (modIds.has(mod.id)) {
      console.error('DUPLICATE module', id, mod.id);
      errors++;
    }
    modIds.add(mod.id);
    req(mod, ['id', 'title', 'parts'], `${id}.${mod.id}`);
    for (const part of mod.parts || []) {
      req(part, ['teil', 'slotType', 'label', 'questionsTotal'], `${id}.${mod.id}.teil${part.teil}`);
      if (!part.layout) {
        console.error('WARN no layout', id, mod.id, part.teil);
      }
    }
  }
  const isCambridge = bp.examType === 'cambridge';
  const reading = bp.modules?.find((m) => m.id === 'lesen' || m.id === 'reading');
  const listening = bp.modules?.find((m) => m.id === 'horen' || m.id === 'listening');
  const uoe = bp.modules?.find((m) => m.id === 'use_of_english');
  if (isCambridge) {
    if (!uoe) {
      console.error('MISSING use_of_english module', id);
      errors++;
    }
    if (!listening) {
      console.error('MISSING listening module', id);
      errors++;
    }
    if (uoe && listening) {
      console.log(
        'OK',
        id,
        `modules=${bp.modules.length}`,
        `UoE parts=${uoe.parts.length}`,
        `listening parts=${listening.parts.length}`,
        reading ? `reading parts=${reading.parts.length}` : 'reading=embedded',
      );
    }
  } else if (!reading || !listening) {
    console.error('MISSING lesen/horen module', id);
    errors++;
  } else {
    console.log('OK', id, `modules=${bp.modules.length}`, `lesen parts=${reading.parts.length}`, `horen parts=${listening.parts.length}`);
  }
}

if (errors) {
  console.error(`\n${errors} blueprint error(s)`);
  process.exit(1);
}
console.log('\nAll blueprints valid.');
