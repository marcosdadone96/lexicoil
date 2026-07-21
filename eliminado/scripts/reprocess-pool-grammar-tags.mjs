/**
 * Reprocess grammarTags v2.0 (GRAMMAR-FOCUS + flexible cupo) on pool-verified.
 *
 *   node scripts/reprocess-pool-grammar-tags.mjs --verified-only
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  enrichBatchMetadata,
  GRAMMAR_TAGS_NORMALIZE_VERSION,
  GRAMMAR_TAG_SOFT_MAX,
} from './lib/enrichBatchMetadata.mjs';
import { POOL_VERIFIED_DIR, POOL_CONTENT_OK_LESEN_DIR } from './lib/finalizePoolReady.mjs';

const verifiedOnly = process.argv.includes('--verified-only');
const targets = [{ dir: POOL_VERIFIED_DIR, label: 'pool-verified' }];
if (!verifiedOnly) targets.push({ dir: POOL_CONTENT_OK_LESEN_DIR, label: 'pool-content-ok-lesen' });

const IDS = [
  'g-de-b1-relativ',
  'g-de-b1-nebensatz',
  'g-de-b1-modalverben',
  'g-de-b1-passiv',
  'g-de-b1-konjunktiv',
  'g-de-b1-dativ',
  'g-de-b1-perfekt',
  'g-de-b1-adjektivdeklination',
  'g-de-b1-komparativ',
  'g-de-b1-futur',
  'g-de-b1-genitiv',
];

// Audit original (pre-relevance) tag hits ≈ Q coverage under cupo=2
const AUDIT_Q = {
  'g-de-b1-relativ': 649,
  'g-de-b1-nebensatz': 537,
  'g-de-b1-modalverben': 92,
  'g-de-b1-passiv': 89,
  'g-de-b1-konjunktiv': 26,
  'g-de-b1-dativ': 25,
  'g-de-b1-perfekt': 20,
  'g-de-b1-adjektivdeklination': 14,
  'g-de-b1-komparativ': 10,
  'g-de-b1-futur': 1,
  'g-de-b1-genitiv': 0,
};

// v1.0.1 coverage (unique Q) from diagnostic session
const V101_Q = {
  'g-de-b1-relativ': 2,
  'g-de-b1-nebensatz': 2,
  'g-de-b1-modalverben': 390,
  'g-de-b1-passiv': 122,
  'g-de-b1-konjunktiv': 253,
  'g-de-b1-dativ': 179,
  'g-de-b1-perfekt': 76,
  'g-de-b1-adjektivdeklination': 304,
  'g-de-b1-komparativ': 116,
  'g-de-b1-futur': 7,
  'g-de-b1-genitiv': 15,
};

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}

const qWith = Object.fromEntries(IDS.map((id) => [id, 0]));
const lenDist = { 0: 0, 1: 0, 2: 0, 3: 0, '4+': 0 };
let qTotal = 0;
const examples = [];

for (const { dir, label } of targets) {
  for (const file of listJson(dir)) {
    const abs = path.join(dir, file);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const beforeSnap = (batch.questions || []).slice(0, 3).map((qq) => ({
      id: qq.id,
      before: [...(qq.grammarTags || [])],
    }));

    const { batch: enriched } = enrichBatchMetadata(batch, {
      topic: false,
      vocab: false,
      grammar: true,
      forceGrammar: true,
    });

    for (let i = 0; i < (enriched.questions || []).length; i++) {
      const qq = enriched.questions[i];
      qTotal++;
      const tags = qq.grammarTags || [];
      const n = tags.length;
      if (n >= 4) lenDist['4+']++;
      else lenDist[n] = (lenDist[n] || 0) + 1;
      const set = new Set(tags.map(String));
      for (const id of IDS) if (set.has(id)) qWith[id]++;
    }

    if (label === 'pool-verified' && examples.length < 6) {
      for (let i = 0; i < beforeSnap.length && examples.length < 6; i++) {
        const after = enriched.questions[i]?.grammarTags || [];
        if (JSON.stringify(beforeSnap[i].before) !== JSON.stringify(after)) {
          examples.push({
            file,
            id: beforeSnap[i].id,
            before: beforeSnap[i].before,
            after,
          });
        }
      }
    }

    fs.writeFileSync(abs, `${JSON.stringify(enriched, null, 2)}\n`);
  }
}

const pct = (n) => (qTotal ? Math.round((1000 * n) / qTotal) / 10 : 0);
const over40 = IDS.filter((id) => pct(qWith[id]) > 40);
const over35 = IDS.filter((id) => pct(qWith[id]) > 35);

const report = {
  generatedAt: new Date().toISOString(),
  version: GRAMMAR_TAGS_NORMALIZE_VERSION,
  softMax: GRAMMAR_TAG_SOFT_MAX,
  qTotal,
  coverage: Object.fromEntries(
    IDS.map((id) => [
      id,
      {
        audit_q: AUDIT_Q[id] ?? 0,
        audit_pct: pct(AUDIT_Q[id] ?? 0),
        v101_q: V101_Q[id] ?? 0,
        v101_pct: pct(V101_Q[id] ?? 0),
        v20_q: qWith[id],
        v20_pct: pct(qWith[id]),
      },
    ]),
  ),
  lenDist,
  over35,
  over40,
  examples,
};

const outJson = path.join(ROOT, 'batches/ready/gate-logs/GRAMMAR-V2-FOCUS-FLEXIBLE-2026-07-10.json');
const outMd = path.join(ROOT, 'batches/ready/gate-logs/GRAMMAR-V2-FOCUS-FLEXIBLE-2026-07-10.md');
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# grammarTags v2.0 — GRAMMAR-FOCUS + flexible cupo (2026-07-10)',
  '',
  `**Version:** \`${GRAMMAR_TAGS_NORMALIZE_VERSION}\``,
  `**Soft max:** ${GRAMMAR_TAG_SOFT_MAX}`,
  `**Questions:** ${qTotal}`,
  '',
  '## Coverage (% of questions with tag)',
  '',
  '| Tag | Auditoría | v1.0.1 | **v2.0** |',
  '|-----|----------:|-------:|---------:|',
  ...IDS.map((id) => {
    const r = report.coverage[id];
    return `| \`${id}\` | ${r.audit_pct}% | ${r.v101_pct}% | **${r.v20_pct}%** (${r.v20_q}) |`;
  }),
  '',
  `**Categories >35%:** ${over35.length ? over35.join(', ') : '**none**'}`,
  `**Categories >40%:** ${over40.length ? over40.join(', ') : '**none**'}`,
  '',
  '## Tag array length distribution',
  '',
  '| Length | Questions | % |',
  '|-------:|----------:|--:|',
  ...['0', '1', '2', '3', '4+'].map(
    (k) => `| ${k} | ${lenDist[k] || 0} | ${pct(lenDist[k] || 0)}% |`,
  ),
  '',
  'Empty (0) is acceptable when the item has no relevant grammar (GRAMMAR-FOCUS).',
  '',
  '## Examples',
  '',
  ...examples.map(
    (e) =>
      `- \`${e.file}\` \`${e.id}\`: ${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}`,
  ),
  '',
];
fs.writeFileSync(outMd, md.join('\n'));
console.log(JSON.stringify({ version: GRAMMAR_TAGS_NORMALIZE_VERSION, lenDist, over35, over40, coverage: Object.fromEntries(IDS.map(id => [id, report.coverage[id].v20_pct])) }, null, 2));
console.log('Wrote', outMd);
