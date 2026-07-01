#!/usr/bin/env node
/**
 * Fix Hören T4 speaker-matching bank items: options "a) M, b) A, c) B" use option-letter
 * keys (A/B/C) while correct stores speaker labels (M/A/B). Rewrites to M)/A)/B) keys.
 *
 *   node scripts/fix-horen-t4-match-keys.mjs --lang de --level B1 [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const o = { lang: 'de', level: 'B1', apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') o.lang = argv[++i];
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--apply') o.apply = true;
  }
  return o;
}

function parseOpt(o) {
  if (typeof o !== 'string') return { key: null, label: '' };
  const m = o.match(/^([A-Za-z0-9]+)\)\s*(.*)$/s);
  if (!m) return { key: o.trim().toUpperCase(), label: o.trim() };
  return { key: m[1].toUpperCase(), label: m[2].trim() };
}

function isSpeakerLetterForm(options) {
  if (!Array.isArray(options) || options.length !== 3) return false;
  const parsed = options.map(parseOpt);
  if (!parsed.every((p) => ['A', 'B', 'C'].includes(p.key))) return false;
  const labels = parsed.map((p) => p.label.toUpperCase());
  return labels[0] === 'M' && labels[1] === 'A' && labels[2] === 'B';
}

function rewriteSpeakerOptions(options) {
  const labels = ['Moderator', 'Gast A', 'Gast B'];
  const keys = ['M', 'A', 'B'];
  return keys.map((k, i) => `${k}) ${labels[i]}`);
}

function optionKeys(options) {
  return (options || []).map(parseOpt).map((p) => p.key).filter(Boolean);
}

function correctMatchesOptions(q) {
  const keys = optionKeys(q.options);
  const c = String(q.correct ?? q.correctAnswer ?? '').toUpperCase();
  if (c === '0') return true;
  return keys.includes(c);
}

function fixQuestion(q) {
  if (q.module !== 'horen' || Number(q.teil) !== 4) return { q, changed: false };
  const type = String(q.type || '').toLowerCase();
  if (!type.includes('match')) return { q, changed: false };
  if (!isSpeakerLetterForm(q.options)) return { q, changed: false };

  const out = { ...q, options: rewriteSpeakerOptions(q.options) };
  out.correctAnswer = out.correctAnswer ?? out.correct;
  if (!correctMatchesOptions(out)) return { q, changed: false };
  return { q: out, changed: true };
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const bankPath = path.join(ROOT, 'library', o.lang, o.level, 'questions.json');
  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  let changed = 0;
  const questions = (bank.questions || []).map((q) => {
    const { q: fixed, changed: c } = fixQuestion(q);
    if (c) changed++;
    return fixed;
  });
  console.log(`fix-horen-t4-match-keys: ${changed} question(s) updated`);
  if (o.apply && changed) {
    fs.writeFileSync(bankPath, `${JSON.stringify({ ...bank, questions }, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${bankPath}`);
  } else if (!o.apply) {
    console.log('Dry-run — pass --apply to write');
  }
}

main();
