import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './loadEnv.mjs';

const POOL = path.join(ROOT, 'batches/ready/pool-verified');

function bucketFile(f, lv) {
  const m = f.match(/^(lesen|horen|schreiben|sprechen)-t(\d+)/i);
  if (m) return { lv, mod: m[1].toLowerCase(), teil: Number(m[2]), f };
  const m2 = f.match(/^(lesen|horen|schreiben|sprechen)/i);
  return { lv, mod: m2?.[1]?.toLowerCase() || 'other', teil: 0, f };
}

function pick(arr, n, seed) {
  const a = [...arr].sort();
  if (a.length <= n) return a;
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = crypto.createHash('sha1').update(`${seed}|${i}`).digest();
    out.push(a[h[0] % a.length]);
  }
  return [...new Set(out)];
}

function extractTexts(batch) {
  const blocks = [];
  for (const p of batch.passages || []) {
    if (p.text) blocks.push({ kind: 'passage', id: p.id, text: p.text.slice(0, 2500) });
    if (p.transcript) blocks.push({ kind: 'transcript', id: p.id, text: p.transcript.slice(0, 2500) });
  }
  for (const q of batch.questions || []) {
    if (q.question) blocks.push({ kind: 'question', id: q.id, text: q.question });
    if (q.statement) blocks.push({ kind: 'statement', id: q.id, text: q.statement });
    if (q.explanation) blocks.push({ kind: 'explanation', id: q.id, text: q.explanation.slice(0, 400) });
    for (const [i, opt] of (q.options || []).entries()) {
      const t = typeof opt === 'string' ? opt : opt?.text;
      if (t) blocks.push({ kind: `option[${i}]`, id: q.id, text: t });
    }
  }
  return blocks;
}

/** English exam-text leak hints (not German exam register). */
const ENGLISH_LEAK_RE =
  /\b(the|and|you|your|should|would|because|however|important|please|click|online course|feedback|checklist|structure|grammar|vocabulary|prosody|example questions?)\b/i;

const buckets = new Map();
for (const lv of ['B1', 'A2']) {
  const dir = path.join(POOL, lv);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const b = bucketFile(f, lv);
    const key = `${b.lv}|${b.mod}|${b.teil}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(b.f);
  }
}

const sample = [];
for (const [key, files] of [...buckets.entries()].sort()) {
  const n = files.length >= 10 ? 3 : files.length >= 4 ? 2 : 1;
  const [lv, mod, teil] = key.split('|');
  for (const f of pick(files, n, key)) {
    sample.push({ lv, mod, teil: Number(teil), file: f });
  }
}
for (const [key, files] of [...buckets.entries()].sort()) {
  if (sample.length >= 55) break;
  const f = files[Math.floor(files.length / 2)];
  const [lv, mod, teil] = key.split('|');
  if (!sample.some((s) => s.lv === lv && s.file === f)) {
    sample.push({ lv, mod, teil: Number(teil), file: f });
  }
}

const reviewed = [];
for (const s of sample) {
  const abs = path.join(POOL, s.lv, s.file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const blocks = extractTexts(batch);
  const hints = [];
  for (const b of blocks) {
    if (ENGLISH_LEAK_RE.test(b.text)) hints.push({ ...b, hint: 'english_token' });
  }
  reviewed.push({
    ...s,
    rel: `batches/ready/pool-verified/${s.lv}/${s.file}`,
    topic: batch.topic || batch.questions?.[0]?.topic,
    blockCount: blocks.length,
    textPreview: blocks.slice(0, 4).map((b) => ({ kind: b.kind, text: b.text.slice(0, 280) })),
    allBlocks: blocks,
    autoHints: hints,
  });
}

const outPath = path.join(ROOT, 'batches/ready/gate-logs/linguistic-audit-sample-2026-07-24.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), sampleSize: reviewed.length, cells: buckets.size, reviewed }, null, 2)}\n`,
);
console.log(`Sample ${reviewed.length} files, ${buckets.size} cells → ${path.relative(ROOT, outPath)}`);
