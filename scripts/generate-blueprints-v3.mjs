#!/usr/bin/env node
/**
 * Generate structureVersion 3 blueprint JSON files for 15 target exams.
 * goethe_B1 and goethe_B2 are already v3 and are not overwritten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBlueprintV3 } from './lib/blueprint-v3-builder.mjs';
import { BLUEPRINT_V3_TARGET_IDS, collectBlueprintV3Todos } from './lib/blueprint-v3-specs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BP_DIR = path.join(ROOT, 'library', 'blueprints');

const SKIP = new Set(['goethe_B1', 'goethe_B2']);

const written = [];

for (const fileId of BLUEPRINT_V3_TARGET_IDS) {
  if (SKIP.has(fileId)) {
    console.log('SKIP (already v3)', fileId);
    continue;
  }
  const bp = buildBlueprintV3(fileId);
  const outPath = path.join(BP_DIR, `${fileId}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(bp, null, 2)}\n`, 'utf8');
  written.push(outPath);
  console.log(
    'Wrote',
    fileId,
    'structureVersion=',
    bp.structureVersion,
    'itemsTotalByModule=',
    JSON.stringify(bp.itemsTotalByModule),
  );
}

const todos = collectBlueprintV3Todos();
console.log(`\n${written.length} blueprint file(s) written to library/blueprints/`);
if (todos.length) {
  console.log('\nTODOs / notes in specs:');
  for (const t of todos) console.log(`  - ${t.fileId}: ${t.reason}`);
}
