#!/usr/bin/env node
/**
 * Repair capitalization in batches/ready/lesen/ using bulk POS findings.
 * Default: --dry-run (no writes). Pass --write to apply AUTO fixes only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectBatchItemsFromDir, runPosCapsBulk } from './lib/germanCapsGate.mjs';
import { applyDeterministicFix, isAutoRepairable } from './lib/germanCapsRepair.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const READY_DIR = path.join(ROOT, 'batches', 'ready', 'lesen');

const dryRun = !process.argv.includes('--write');

function inferCtx(batch, file) {
  const teil = Number(batch.teil ?? batch.questions?.[0]?.teil ?? file.match(/t(\d)/i)?.[1]);
  return { module: 'lesen', teil, lang: batch.lang || 'de', level: batch.level || 'B1' };
}

function setFieldText(batch, field, word, newText) {
  if (field === 'passages.text') {
    for (const p of batch.passages || []) {
      if (typeof p.text === 'string' && p.text.includes(word)) {
        p.text = p.text.replace(word, newText);
        return true;
      }
    }
    return false;
  }
  if (field === 'passages.ads') {
    for (const p of batch.passages || []) {
      for (let i = 0; i < (p.ads || []).length; i += 1) {
        if (typeof p.ads[i] === 'string' && p.ads[i].includes(word)) {
          p.ads[i] = p.ads[i].replace(word, newText);
          return true;
        }
      }
    }
    return false;
  }
  for (const q of batch.questions || []) {
    if (field === 'questions.question' && q.question?.includes(word)) {
      q.question = q.question.replace(word, newText);
      return true;
    }
    if (field === 'questions.signText' && q.signText?.includes(word)) {
      q.signText = q.signText.replace(word, newText);
      return true;
    }
    if (field === 'questions.explanation' && q.explanation?.includes(word)) {
      q.explanation = q.explanation.replace(word, newText);
      return true;
    }
    if (field === 'questions.statement' && q.statement?.includes(word)) {
      q.statement = q.statement.replace(word, newText);
      return true;
    }
    if (field === 'questions.options') {
      let changed = false;
      q.options = (q.options || []).map((opt) => {
        const s = typeof opt === 'string' ? opt : opt?.text;
        if (typeof s !== 'string' || !s.includes(word)) return opt;
        const next = s.replace(word, newText);
        changed = true;
        return typeof opt === 'string' ? next : { ...opt, text: next };
      });
      if (changed) return true;
    }
  }
  return false;
}

function getFieldText(batch, field, word) {
  const hits = [];
  if (field === 'passages.text') {
    for (const p of batch.passages || []) {
      if (p.text?.includes(word)) hits.push(p.text);
    }
  } else if (field === 'passages.ads') {
    for (const p of batch.passages || []) {
      for (const ad of p.ads || []) {
        if (ad?.includes(word)) hits.push(ad);
      }
    }
  } else {
    for (const q of batch.questions || []) {
      const key = field.replace('questions.', '');
      const val = q[key];
      if (typeof val === 'string' && val.includes(word)) hits.push(val);
      if (field === 'questions.options') {
        for (const opt of q.options || []) {
          const s = typeof opt === 'string' ? opt : opt?.text;
          if (s?.includes(word)) hits.push(s);
        }
      }
    }
  }
  return hits;
}

function repairBatch(batch, findings) {
  const autoApplied = [];
  const review = [];

  for (const f of findings) {
    const eligibility = isAutoRepairable(f);
    const texts = getFieldText(batch, f.field, f.word);
    if (!texts.length) {
      review.push({ ...f, bucket: 'REVIEW', reviewReason: 'text_not_found' });
      continue;
    }
    if (texts.length > 1) {
      review.push({ ...f, bucket: 'REVIEW', reviewReason: 'multiple_occurrences' });
      continue;
    }

    if (!eligibility.auto) {
      review.push({ ...f, bucket: 'REVIEW', reviewReason: eligibility.reason });
      continue;
    }

    const { text, applied, fix, reason } = applyDeterministicFix(texts[0], f);
    if (!applied) {
      review.push({ ...f, bucket: 'REVIEW', reviewReason: reason || 'apply_failed' });
      continue;
    }

    setFieldText(batch, f.field, f.word, fix);
    autoApplied.push({ ...f, bucket: 'AUTO', fix });
  }

  return { batch, autoApplied, review };
}

const items = collectBatchItemsFromDir(READY_DIR);
const bulk = runPosCapsBulk(items, { timeoutMs: 180_000 });
if (bulk.skipped) {
  console.error(bulk.warning || 'POS gate unavailable');
  process.exit(2);
}

const byFile = new Map();
for (const f of bulk.findings || []) {
  const meta = items.find((m) => m.id === f.id);
  const file = meta?.file;
  if (!file) continue;
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push({ ...f, field: meta.field });
}

console.log(dryRun ? '[dry-run] No se escribirán archivos.' : '[write] Aplicando correcciones AUTO…');
console.log(`Bulk findings: ${bulk.findings.length} en ${byFile.size} archivos\n`);

let totalAuto = 0;
let totalReview = 0;

for (const name of [...byFile.keys()].sort()) {
  const abs = path.join(READY_DIR, name);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const { batch: repaired, autoApplied, review } = repairBatch(batch, byFile.get(name));

  totalAuto += autoApplied.length;
  totalReview += review.length;

  console.log(`=== ${name} ===`);
  console.log(`Findings: ${byFile.get(name).length} · AUTO: ${autoApplied.length} · REVIEW: ${review.length}`);

  for (const a of autoApplied) {
    console.log(`  AUTO ${a.type}: ${a.word} → ${a.fix} (${a.field}, ${a.reason})`);
  }
  for (const r of review) {
    console.log(`  REVIEW ${r.type}: ${r.word} (${r.field}) — ${r.reviewReason}`);
  }

  if (!dryRun && autoApplied.length) {
    const ctx = inferCtx(repaired, name);
    const normalized = normalizeBatch(repaired, ctx);
    fs.writeFileSync(abs, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    console.log(`  Written: ${abs}`);
  }
}

console.log(`\nTotal AUTO: ${totalAuto}, REVIEW: ${totalReview}`);
