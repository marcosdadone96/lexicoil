#!/usr/bin/env node
/** Full A2 pool deterministic normalize (CHK-14/13/19 caps) — $0 LLM. */
import fs from 'node:fs';
import path from 'node:path';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';

const apply = !process.argv.includes('--dry-run');
const dir = poolVerifiedDir('A2');
let touched = 0;

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const abs = path.join(dir, file);
  try {
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const base = file.replace(/\.json$/, '');
    const m = base.match(/^(lesen|horen|schreiben|sprechen)-t(\d+)/i);
    const module = m ? m[1].toLowerCase() : String(raw.questions?.[0]?.module || 'lesen').toLowerCase();
    const teil = m ? Number(m[2]) : Number(raw.questions?.[0]?.teil || 1);
    let batch = normalizeBatch(raw, { module, teil, lang: 'de', level: 'A2' });
    batch = applyGermanCapsNormalize(batch, { log: false }).batch;
    if (JSON.stringify(raw) !== JSON.stringify(batch)) {
      touched++;
      if (apply) fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    }
  } catch (err) {
    console.warn(`  skip ${file}: ${err.message}`);
  }
}
console.log(`repair-a2-pool-full-deterministic: ${touched} files ${apply ? 'updated' : 'would update'}`);
