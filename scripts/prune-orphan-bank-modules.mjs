#!/usr/bin/env node
/**
 * Remove bank questions whose module is not in the level blueprint
 * (e.g. grammatik in de/B1 where goethe-b1 has no grammatik module).
 *
 * Usage:
 *   node scripts/prune-orphan-bank-modules.mjs --lang de --level B1 --dry-run
 *   node scripts/prune-orphan-bank-modules.mjs --lang de --level B1 --apply
 *   node scripts/prune-orphan-bank-modules.mjs --all --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const apply = process.argv.includes('--apply');
const dryRun = !apply || process.argv.includes('--dry-run');
const all = process.argv.includes('--all');

function blueprintModuleIds(lang, level) {
  const id = ExamBlueprint.INDEX[`${lang}_${level}`];
  if (!id) return null;
  const file = path.join(ROOT, 'library', 'blueprints', `${id}.json`);
  if (!fs.existsSync(file)) return null;
  const bp = JSON.parse(fs.readFileSync(file, 'utf8'));
  return new Set((bp.modules || []).map((m) => m.id));
}

function questionMatchesBlueprintModule(q, allowedIds) {
  const m = String(q.module || '').toLowerCase();
  for (const modId of allowedIds) {
    const mod = String(modId).toLowerCase();
    if (mod === 'lesen' || mod === 'reading') {
      if (m === 'lesen' || m === 'reading') return true;
    } else if (mod === 'horen' || mod === 'listening') {
      if (m === 'horen' || m === 'listening') return true;
    } else if (mod === 'grammatik' || mod === 'use_of_english') {
      if (m === 'grammatik' || m === 'grammar' || m === 'use_of_english') return true;
    } else if (mod === 'schreiben' || mod === 'writing') {
      if (m === 'schreiben' || m === 'writing') return true;
    } else if (mod === 'sprechen' || mod === 'speaking') {
      if (m === 'sprechen' || m === 'speaking') return true;
    } else if (m === mod) {
      return true;
    }
  }
  return false;
}

function pruneCombo(lang, level) {
  const bankPath = path.join(ROOT, 'library', lang, level, 'questions.json');
  if (!fs.existsSync(bankPath)) {
    console.log(`⏭  ${lang}/${level}: no bank`);
    return { removed: 0 };
  }
  const allowed = blueprintModuleIds(lang, level);
  if (!allowed) {
    console.log(`⏭  ${lang}/${level}: no blueprint`);
    return { removed: 0 };
  }

  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  const before = bank.questions?.length || 0;
  const orphans = (bank.questions || []).filter((q) => !questionMatchesBlueprintModule(q, allowed));
  if (!orphans.length) {
    console.log(`✅ ${lang}/${level}: no orphan modules (${before} questions)`);
    return { removed: 0 };
  }

  const byModule = {};
  for (const q of orphans) {
    byModule[q.module] = (byModule[q.module] || 0) + 1;
  }
  console.log(`\n${lang}/${level}: ${orphans.length} orphan question(s) — ${JSON.stringify(byModule)}`);
  orphans.slice(0, 5).forEach((q) => console.log(`   - ${q.id}`));
  if (orphans.length > 5) console.log(`   … +${orphans.length - 5} more`);

  if (apply && !dryRun) {
    const orphanIds = new Set(orphans.map((q) => q.id));
    bank.questions = (bank.questions || []).filter((q) => !orphanIds.has(q.id));
    fs.writeFileSync(bankPath, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');
    console.log(`   → removed ${orphans.length} (${before} → ${bank.questions.length})`);
  } else {
    console.log('   → dry-run (use --apply to write)');
  }
  return { removed: orphans.length };
}

const combos = all
  ? Object.keys(ExamBlueprint.INDEX).map((k) => k.split('_'))
  : [[arg('--lang', 'de'), String(arg('--level', 'B1')).toUpperCase()]];

let total = 0;
for (const [lang, level] of combos) {
  total += pruneCombo(lang, level).removed;
}
console.log(`\nDone. ${apply && !dryRun ? 'Removed' : 'Would remove'} ${total} orphan question(s).`);
