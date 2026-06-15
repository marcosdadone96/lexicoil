#!/usr/bin/env node
/**
 * Phase 2 — upgrade library/blueprints/*.json with itemsTotal, wordsPerPassage, taskFormat;
 * fix duplicate modules; apply official part structures where defined.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFICIAL_MODULE_PARTS, enrichPart, taskFormatForPart } from './lib/blueprintOfficialParts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BP_DIR = path.join(ROOT, 'library', 'blueprints');

const DEFAULT_INSTRUCTION = {
  lesen: 'Read the text and answer the questions.',
  horen: 'Listen and answer the questions.',
  grammatik: 'Choose or complete the correct answer.',
  use_of_english: 'Complete the task according to the instructions.',
  schreiben: 'Write your response according to the task.',
  sprechen: 'Prepare for the speaking task.',
};

function dedupeModules(modules) {
  const seen = new Set();
  return (modules || []).filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

function upgradeBlueprint(bp, fileId) {
  const official = OFFICIAL_MODULE_PARTS[fileId] || {};
  bp.modules = dedupeModules(bp.modules);

  const MODULE_ORDER = ['lesen', 'reading', 'use_of_english', 'horen', 'listening', 'grammatik', 'schreiben', 'writing', 'sprechen', 'speaking'];
  if (bp.examType === 'dele' || bp.examType === 'goethe') {
    bp.modules.sort((a, b) => MODULE_ORDER.indexOf(a.id) - MODULE_ORDER.indexOf(b.id));
  }

  bp.modules = bp.modules.map((mod) => {
    const modOfficial = official[mod.id];
    let parts = modOfficial
      ? modOfficial.map((p) =>
          enrichPart({
            instruction: DEFAULT_INSTRUCTION[mod.id] || p.label,
            questionTypes: p.questionTypes || ['multiple_choice', 'multiple'],
            ...p,
          }),
        )
      : (mod.parts || []).map((p) =>
          enrichPart(p, {
            instruction: p.instruction || p.label || DEFAULT_INSTRUCTION[mod.id] || '',
          }),
        );

    return { ...mod, parts };
  });

  bp.structureVersion = fileId === 'goethe_B1' ? 3 : 2;
  if (fileId === 'goethe_B1') {
    bp.modellsatzVersion = 1;
    bp.modellsatzRef = 'Goethe-Zertifikat B1 Modellsatz (Lesen 6/6/7/7/4, Hören 6/6/7/8)';
  }
  bp.itemsTotalByModule = {};
  for (const mod of bp.modules) {
    bp.itemsTotalByModule[mod.id] = (mod.parts || []).reduce((s, p) => s + (p.itemsTotal || 0), 0);
  }
  return bp;
}

const files = fs.readdirSync(BP_DIR).filter((f) => f.endsWith('.json'));
let updated = 0;

for (const file of files) {
  const fileId = file.replace(/\.json$/, '');
  const full = path.join(BP_DIR, file);
  const bp = upgradeBlueprint(JSON.parse(fs.readFileSync(full, 'utf8')), fileId);
  fs.writeFileSync(full, JSON.stringify(bp, null, 2) + '\n', 'utf8');
  console.log('Upgraded', fileId, 'modules=', bp.modules.length, 'itemsTotalByModule=', JSON.stringify(bp.itemsTotalByModule));
  updated++;
}

console.log(`\n${updated} blueprint(s) upgraded.`);
