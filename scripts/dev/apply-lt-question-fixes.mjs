#!/usr/bin/env node
/**
 * Apply vetted category-A fixes to question fields (pool-verified).
 * Usage: node scripts/dev/apply-lt-question-fixes.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRealLanguageToolMatch } from '../lib/qualityGates/languageToolGate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DRY = process.argv.includes('--dry-run');
const STAMP = '2026-08-05';

/** Deterministic manual fixes (override bad LT suggestions). Applied in all question text. */
const MANUAL = [
  ['die technischen Teil', 'die technischen Teile'],
  ['ins Tennisverein', 'in den Tennisverein'],
  ['In der Radiointerview', 'Im Radiointerview'],
  ['eine Probleme', 'ein Problem'],
  ['Eine Problem', 'Ein Problem'],
  ['ihren reduzierten Eigentum', 'ihr reduziertes Eigentum'],
  ['Welche positiven Teil', 'Welchen positiven Teil'],
  ['einen günstigen Unterkunft', 'einer günstigen Unterkunft'],
  ['wird das Teurer', 'wird das teurer'],
  ['statt zu frieden', 'statt zum Frieden'],
];

const BLOCK_WORDS = new Set([
  'thema-passend',
  'restentleert',
  'abholbar',
  'geschütztere',
  'pflanzlichere',
  'frieden', // use manual phrase statt zu frieden → statt zum Frieden only
]);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BLOCK_REPLACEMENT = new Set([
  'geschützter',
  'pflanzlicher',
  'erst-entleert',
  'einem Probleme',
  'dem Radiointerview', // use Im Radiointerview manual
]);

function wordFrom(m) {
  return (m.context || '').slice(m.contextOffset || 0, (m.contextOffset || 0) + (m.length || 0));
}

function isMcqOptionNoise(m) {
  const w = wordFrom(m);
  const ctx = m.context || '';
  if (m.ruleId === 'DE_CASE' && /^[a-c]\)$/i.test(w)) return true;
  if (m.ruleId === 'UPPERCASE_SENTENCE_START' && /\)\s/.test(ctx)) return true;
  return false;
}

function resolveReplacement(word, rep, ruleId) {
  if (!word || BLOCK_WORDS.has(word)) return null;
  if (rep && BLOCK_REPLACEMENT.has(rep)) return null;

  for (const [from, to] of MANUAL) {
    if (word === from) return to;
  }

  if (ruleId === 'GERMAN_SPELLER_RULE' && rep) {
    const cap = word.charAt(0).toUpperCase() + word.slice(1);
    if (rep === cap && /^[a-zäöüß]/.test(word) && word.length >= 4) return rep;
    if (word === 'dAmit') return 'damit';
  }

  if (['DE_AGREEMENT', 'DE_AGREEMENT2', 'DE_SUBJECT_VERB_AGREEMENT'].includes(ruleId)) {
    if (rep && rep !== word && !BLOCK_REPLACEMENT.has(rep)) {
      if (!MANUAL.some(([f]) => f === word)) return rep;
    }
  }

  return null;
}

function collectAutoFixes(level) {
  const j = JSON.parse(
    fs.readFileSync(path.join(ROOT, `batches/ready/gate-logs/preventive-lt-full-${level}-${STAMP}.json`), 'utf8'),
  );
  /** @type {Map<string, string>} */
  const global = new Map();
  for (const f of j.files || []) {
    for (const seg of f.segments || []) {
      if (!seg.field?.startsWith('questions')) continue;
      for (const m of seg.matches || []) {
        if (!isRealLanguageToolMatch(m)) continue;
        if (isMcqOptionNoise(m)) continue;
        const word = wordFrom(m);
        const rep = resolveReplacement(word, (m.replacements || [])[0], m.ruleId);
        if (!rep || rep === word) continue;
        if (!global.has(word)) global.set(word, rep);
      }
    }
  }
  return global;
}

function applyReplacements(text, replacements) {
  let s = String(text);
  let n = 0;
  const ordered = [...replacements.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of ordered) {
    const re = new RegExp(`(?<![a-zA-ZäöüßÄÖÜ])${escapeRegex(from)}(?![a-zA-ZäöüßÄÖÜ])`, 'g');
    const hits = [...s.matchAll(re)];
    if (hits.length === 0) continue;
    s = s.replace(re, to);
    n += hits.length;
  }
  return { text: s, n };
}

function patchQuestionFields(batch, replacements) {
  let changes = 0;
  for (const q of batch.questions || []) {
    for (const key of ['question', 'explanation', 'statement', 'signText', 'transcript']) {
      if (typeof q[key] !== 'string') continue;
      const { text, n } = applyReplacements(q[key], replacements);
      if (n > 0) {
        q[key] = text;
        changes += n;
      }
    }
    if (Array.isArray(q.options)) {
      q.options = q.options.map((opt) => {
        if (typeof opt === 'string') {
          const { text, n } = applyReplacements(opt, replacements);
          if (n > 0) changes += n;
          return text;
        }
        if (opt?.text && typeof opt.text === 'string') {
          const { text, n } = applyReplacements(opt.text, replacements);
          if (n > 0) {
            opt.text = text;
            changes += n;
          }
        }
        return opt;
      });
    }
    if (Array.isArray(q.matchLabels)) {
      q.matchLabels = q.matchLabels.map((l) => {
        const { text, n } = applyReplacements(l, replacements);
        if (n > 0) changes += n;
        return text;
      });
    }
  }
  return changes;
}

const report = { dryRun: DRY, manual: MANUAL, levels: {} };

for (const level of ['B2', 'A2', 'B1']) {
  const auto = collectAutoFixes(level);
  const replacements = new Map([...MANUAL, ...auto]);
  const poolDir = path.join(ROOT, 'batches/ready/pool-verified', level);
  const files = fs.readdirSync(poolDir).filter((f) => f.endsWith('.json'));
  let filesChanged = 0;
  let totalSubs = 0;
  const changed = [];

  for (const file of files) {
    const abs = path.join(poolDir, file);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const n = patchQuestionFields(batch, replacements);
    if (n > 0) {
      filesChanged += 1;
      totalSubs += n;
      changed.push({ file, subs: n });
      if (!DRY) fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`);
    }
  }

  report.levels[level] = {
    autoFixWords: [...auto.entries()],
    filesChanged,
    totalSubs,
    changed: changed.slice(0, 50),
  };
  console.log(`${level}: ${filesChanged} files, ${totalSubs} replacements, ${auto.size} auto words`);
}

const out = path.join(ROOT, 'batches/ready/gate-logs/preventive-lt-question-fixes-applied-2026-08-07.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
