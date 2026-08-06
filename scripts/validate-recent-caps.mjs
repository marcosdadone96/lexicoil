#!/usr/bin/env node
/**
 * Validate capitalization normalize + CHK-14 on recent generated batches.
 * Run: node scripts/validate-recent-caps.mjs [--limit 15]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = path.join(ROOT, 'batches', 'generated');
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 15);

function inferCtx(file, batch) {
  const m = file.match(/lesen-t(\d)-/i);
  const teil = m ? Number(m[1]) : Number(batch.questions?.[0]?.teil ?? batch.teil ?? 0);
  const mod = String(batch.module || batch.questions?.[0]?.module || 'lesen').toLowerCase();
  return { module: mod, teil, lang: 'de', level: 'B1' };
}

const files = fs
  .readdirSync(GENERATED)
  .filter((f) => /^lesen-t[1-5]-gemini-\d+\.json$/i.test(f))
  .map((f) => ({ f, mtime: fs.statSync(path.join(GENERATED, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)
  .slice(0, limit)
  .map((x) => x.f);

let ok = 0;
let fail = 0;

console.log(`\n── Capitalization validation (${files.length} recent lesen-gemini batches) ──\n`);

for (const file of files) {
  const p = path.join(GENERATED, file);
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const ctx = inferCtx(file, raw);
  const before = await isPartPoolReady(raw, { semantic: false });
  const chkBefore = (before.blocking || []).filter((f) => f.id === 'CHK-14').length;
  const norm = normalizeBatch(raw, ctx);
  const after = await isPartPoolReady(norm, { semantic: false });
  const chkAfter = (after.blocking || []).filter((f) => f.id === 'CHK-14').length;
  const otherBlock = (after.blocking || []).filter((f) => f.id !== 'CHK-14').length;

  if (chkAfter === 0) {
    console.log(`  ✅  ${file}: CHK-14 ${chkBefore} → 0${otherBlock ? ` (+${otherBlock} other blocks)` : ''}`);
    ok++;
  } else {
    console.log(`  ❌  ${file}: CHK-14 ${chkBefore} → ${chkAfter}`);
    for (const f of (after.blocking || []).filter((x) => x.id === 'CHK-14').slice(0, 3)) {
      console.log(`       ${f.message.slice(0, 100)}`);
    }
    fail++;
  }
}

console.log(`\n── Result: ${ok} clean, ${fail} with CHK-14 after normalize ──\n`);
process.exit(fail > 0 ? 1 : 0);
