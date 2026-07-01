#!/usr/bin/env node
/**
 * Build data/exams/availability.json — single source of truth for served exam levels.
 *
 * live   — file exists, >=1 exam, all pass validate:fidelity
 * beta   — file exists with exams but fidelity fails
 * hidden — no file or empty
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  LANGS,
  LEVELS,
  resolveBlueprintForLangLevel,
  servedExamPath,
  servedExamRel,
  ROOT,
} from './lib/examPipeline.mjs';

const require = createRequire(import.meta.url);
const OUT = path.join(ROOT, 'data/exams/availability.json');

/** Feature flags merged after fidelity assessment (preserved across rebuilds). */
const LEVEL_OVERRIDES = {
  de: {
    A2: {
      personalized: false,
      quickModules: false,
      aiFeatures: false,
      curatedOnly: true,
      poolPreview: 4,
    },
    B1: {
      personalized: true,
    },
  },
};

function mergeLevelOverrides(manifest) {
  for (const [lang, levels] of Object.entries(LEVEL_OVERRIDES)) {
    if (!manifest[lang]) manifest[lang] = {};
    for (const [level, flags] of Object.entries(levels)) {
      manifest[lang][level] = { ...(manifest[lang][level] || {}), ...flags };
    }
  }
  return manifest;
}

const { validateExamAgainstBlueprint } = require(path.join(ROOT, 'js/engine/validation/blueprintFidelity.js'));
function loadExamsFromFile(absPath, relLabel) {
  const raw = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  if (Array.isArray(raw)) {
    return raw.map((exam, i) => ({
      id: exam.id || exam.topic || `${relLabel}#${i + 1}`,
      exam,
    }));
  }
  if (raw.exam) return [{ id: raw.id || relLabel, exam: raw.exam }];
  if (raw.lesenParts || raw.modules) return [{ id: relLabel, exam: raw }];
  return [];
}

function parseArgs(argv) {
  const out = { capStatus: null, capLang: null, capLevel: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cap-status') out.capStatus = String(argv[++i] || '').toLowerCase();
    else if (a === '--cap-lang') out.capLang = String(argv[++i] || '').toLowerCase();
    else if (a === '--cap-level') out.capLevel = String(argv[++i] || '').toUpperCase();
  }
  return out;
}

function assessCombo(lang, level, cap) {
  const rel = servedExamRel(lang, level);
  const file = servedExamPath(lang, level);  if (!fs.existsSync(file)) {
    return { status: 'hidden', exams: 0 };
  }

  let entries;
  try {
    entries = loadExamsFromFile(file, rel);
  } catch (e) {
    console.warn(`  ${lang}_${level}: parse error — ${e.message}`);
    return { status: 'hidden', exams: 0 };
  }

  if (!entries.length) {
    return { status: 'hidden', exams: 0 };
  }

  const blueprint = resolveBlueprintForLangLevel(lang, level);
  if (!blueprint) {
    console.warn(`  ${lang}_${level}: no blueprint — beta`);
    return { status: 'beta', exams: entries.length };
  }

  const allPass = entries.every(({ exam }) => validateExamAgainstBlueprint(exam, blueprint).ok);
  let status = allPass ? 'live' : 'beta';
  if (
    cap?.capStatus &&
    cap.capLang === lang &&
    cap.capLevel === level &&
    status === 'live'
  ) {
    status = cap.capStatus === 'hidden' ? 'hidden' : 'beta';
  }
  return {
    status,
    exams: entries.length,
  };
}

function main() {
  const cap = parseArgs(process.argv);
  const manifest = {};
  const live = [];

  console.log('Building exam availability manifest…\n');

  for (const lang of LANGS) {
    manifest[lang] = {};
    for (const level of LEVELS) {
      const row = assessCombo(lang, level, cap);
      manifest[lang][level] = row;
      const tag = `${lang}_${level}`.padEnd(8);
      console.log(`  ${tag} ${row.status.padEnd(6)} (${row.exams} exam(s))`);
      if (row.status === 'live') live.push(`${lang}/${level}`);
    }
  }

  mergeLevelOverrides(manifest);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
  console.log(`Live: ${live.length ? live.join(', ') : '(none)'}`);
}

main();
