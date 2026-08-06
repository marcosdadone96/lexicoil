#!/usr/bin/env node
/**
 * Fix pool-verified: Herr Lang + double MCQ letter prefix (2026-07-13 defects).
 * Run: node scripts/fix-defects-honorific-mcq-2026-07-13.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGermanCapsNormalize, GERMAN_CAPS_NORMALIZE_VERSION } from './lib/germanCapsNormalize.mjs';
import { dedupeMcqOptionLetterPrefix, normalizeMcqOptions } from './lib/normalizeMcq.mjs';
import { stampGermanCapsVersion } from './lib/poolReadyCheck.mjs';
import { loadSchreibenT3NamesConfig } from './lib/schreibenT3NamesBank.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const dryRun = process.argv.includes('--dry-run');

const SURNAME_ADJECTIVE_HOMOGRAPHS = new Set([
  'lang', 'kurz', 'gross', 'groß', 'jung', 'alt', 'braun', 'weiss', 'weiß',
  'schwarz', 'hart', 'stark', 'arm', 'reich', 'frei', 'klug', 'stolz',
]);

function surnameFixLexicon() {
  const cfg = loadSchreibenT3NamesConfig();
  const set = new Set(SURNAME_ADJECTIVE_HOMOGRAPHS);
  for (const s of cfg.surnames || []) set.add(String(s).toLowerCase());
  return set;
}

const SURNAME_FIX = surnameFixLexicon();

const DOUBLE_RE = /^[a-c]\)\s*[a-c]\)\s/i;
const HONORIFIC_SURNAME_RE = /\b(Herr|Herrn|Frau)\s+([a-zäöüß]{2,})\b/g;

function fixTextHonorifics(text) {
  if (typeof text !== 'string' || !text) return { text, fixes: 0 };
  let fixes = 0;
  const out = text.replace(HONORIFIC_SURNAME_RE, (full, title, surname) => {
    if (!SURNAME_FIX.has(surname.toLowerCase())) return full;
    fixes++;
    return `${title} ${surname.charAt(0).toUpperCase()}${surname.slice(1)}`;
  });
  return { text: out, fixes };
}

function fixBatch(file, batch) {
  let honorificFixes = 0;
  let doubleLetterFixes = 0;
  const next = structuredClone(batch);

  for (const q of next.questions || []) {
    if (Array.isArray(q.options)) {
      q.options = q.options.map((opt) => {
        const raw = typeof opt === 'string' ? opt : opt?.text || '';
        const hadDouble = DOUBLE_RE.test(raw);
        let text = raw;
        if (typeof opt === 'string' || !opt?.text) {
          text = normalizeMcqOptions([raw])[0];
          ({ text } = dedupeMcqOptionLetterPrefix(text));
        } else {
          const normalized = normalizeMcqOptions([opt])[0];
          text = typeof normalized === 'string' ? normalized : normalized;
          ({ text } = dedupeMcqOptionLetterPrefix(text));
        }
        if (hadDouble) doubleLetterFixes++;
        return text;
      });
    }
    for (const field of ['question', 'explanation', 'signText']) {
      if (typeof q[field] === 'string') {
        const r = fixTextHonorifics(q[field]);
        q[field] = r.text;
        honorificFixes += r.fixes;
      }
    }
  }
  for (const p of next.passages || []) {
    for (const field of ['text', 'title', 'transcript']) {
      if (typeof p[field] === 'string') {
        const r = fixTextHonorifics(p[field]);
        p[field] = r.text;
        honorificFixes += r.fixes;
      }
    }
  }

  const capped = applyGermanCapsNormalize(next, { log: false });
  const stamped = stampGermanCapsVersion(capped.batch);
  stamped._germanCapsNormalizeVersion = GERMAN_CAPS_NORMALIZE_VERSION;

  return { batch: stamped, honorificFixes, doubleLetterFixes, caps: capped.stats };
}

const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  version: GERMAN_CAPS_NORMALIZE_VERSION,
  files: [],
  scanBefore: { doubleLetter: [], honorificLower: [] },
  scanAfter: { doubleLetter: 0, honorificLower: 0 },
};

for (const f of fs.readdirSync(POOL).filter((x) => x.endsWith('.json'))) {
  const batch = JSON.parse(fs.readFileSync(path.join(POOL, f), 'utf8'));
  for (const q of batch.questions || []) {
    for (const o of q.options || []) {
      const t = typeof o === 'string' ? o : o?.text || '';
      if (DOUBLE_RE.test(t)) report.scanBefore.doubleLetter.push({ file: f, qid: q.id, opt: t.slice(0, 60) });
    }
  }
  const blob = JSON.stringify(batch);
  let m;
  const re = /\b(Herr|Herrn|Frau)\s+([a-zäöüß]{2,})\b/g;
  while ((m = re.exec(blob))) {
    if (SURNAME_FIX.has(m[2].toLowerCase())) {
      report.scanBefore.honorificLower.push({ file: f, match: m[0] });
    }
  }
}

for (const f of fs.readdirSync(POOL).filter((x) => x.endsWith('.json'))) {
  const abs = path.join(POOL, f);
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const { batch, honorificFixes, doubleLetterFixes } = fixBatch(f, raw);
  if (honorificFixes || doubleLetterFixes) {
    report.files.push({ file: f, honorificFixes, doubleLetterFixes });
    if (!dryRun) fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`);
  }
}

for (const f of fs.readdirSync(POOL).filter((x) => x.endsWith('.json'))) {
  const batch = JSON.parse(fs.readFileSync(path.join(POOL, f), 'utf8'));
  for (const q of batch.questions || []) {
    for (const o of q.options || []) {
      const t = typeof o === 'string' ? o : o?.text || '';
      if (DOUBLE_RE.test(t)) report.scanAfter.doubleLetter++;
    }
  }
  const blob = JSON.stringify(batch);
  let m;
  const re = /\b(Herr|Herrn|Frau)\s+([a-zäöüß]{2,})\b/g;
  while ((m = re.exec(blob))) {
    if (SURNAME_FIX.has(m[2].toLowerCase())) report.scanAfter.honorificLower++;
  }
}

const out = path.join(ROOT, 'batches/ready/gate-logs/fix-defects-honorific-mcq-2026-07-13.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
