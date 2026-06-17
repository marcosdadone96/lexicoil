#!/usr/bin/env node
/**
 * Phase 2 — derive knowledge/providers/{goethe,cambridge,dele}.json from library/blueprints/*.json
 * Single source of truth: blueprints → provider chunk plans.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const LibraryCatalog = require(path.join(ROOT, 'js/library/libraryCatalog.js'));

const PROVIDER_LANG = { goethe: 'german', cambridge: 'english', dele: 'spanish' };
const PROVIDER_NAME = {
  goethe: 'Goethe-Institut',
  cambridge: 'Cambridge Assessment English',
  dele: 'Instituto Cervantes',
};

function parseMinutes(time) {
  if (!time) return 0;
  const m = String(time).match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function buildProvider(examType) {
  const langId = PROVIDER_LANG[examType];
  const levels = {};
  const prefix = `${examType}_`;

  for (const file of fs.readdirSync(path.join(ROOT, 'library/blueprints'))) {
    if (!file.startsWith(prefix) || !file.endsWith('.json')) continue;
    const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints', file), 'utf8'));
    const level = bp.level;
    if (!level) continue;

    const modules = (bp.modules || []).map((mod) => ({
      id: mod.id,
      title: mod.title,
      minutes: parseMinutes(mod.time),
      parts: (mod.parts || []).length,
    }));
    const taskTypes = {};
    (bp.modules || []).forEach((mod) => {
      taskTypes[mod.id] = [
        ...new Set((mod.parts || []).flatMap((p) => (p.taskFormat ? [p.taskFormat] : p.questionTypes || []))),
      ];
    });

    levels[level] = {
      certificate: bp.certificate,
      totalMinutes: modules.reduce((s, m) => s + (m.minutes || 0), 0) || undefined,
      modules: modules.map((m) => ({ ...m, minutes: m.minutes ?? 0 })),
      taskTypes,
      scoring: examType === 'cambridge'
        ? { passPercent: 70, scale: 'Cambridge English Scale' }
        : { passPercent: 60, perModule: true },
    };
  }

  return {
    id: examType,
    name: PROVIDER_NAME[examType],
    languageId: langId,
    levels,
  };
}

for (const examType of ['goethe', 'cambridge', 'dele']) {
  const provider = buildProvider(examType);
  const out = path.join(ROOT, 'knowledge/providers', `${examType}.json`);
  fs.writeFileSync(out, JSON.stringify(provider, null, 2) + '\n', 'utf8');
  console.log('Wrote', path.relative(ROOT, out), `levels=${Object.keys(provider.levels).length}`);
}

console.log('\nProvider JSON derived from blueprints.');
