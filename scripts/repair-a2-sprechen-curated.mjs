#!/usr/bin/env node
/**
 * Fase 0 A2: repair 4 curated Sprechen bundles (strings + topics + metadata), verify, publish.
 *
 *   node scripts/repair-a2-sprechen-curated.mjs --dry-run
 *   node scripts/repair-a2-sprechen-curated.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { poolVerifiedDir, normalizeLevel } from './lib/batchPaths.mjs';
import { enrichBatchMetadata } from './lib/enrichBatchMetadata.mjs';
import { stripPoolRejectMeta } from './lib/finalizePoolReady.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { poolReadyCheckWithRepair } from './lib/poolReadyCheck.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';
import { normalizeB1Topic } from './lib/b1Topics.mjs';

loadEnvFile();

const LEVEL = 'A2';
const SLUGS = ['health', 'education', 'society', 'work'];

const TOPIC_BY_SLUG = {
  health: { topicTag: 'Gesundheit', topicTags: ['Ernährung', 'Ernährung', 'Ernährung'] },
  education: { topicTag: 'Sport', topicTags: ['Sport', 'Sport', 'Sport'] },
  society: { topicTag: 'Freizeit', topicTags: ['Freizeit', 'Kultur', 'Kultur'] },
  work: { topicTag: 'Reisen', topicTags: ['Reisen', 'Reisen', 'Reisen'] },
};

function applyStringFixes(batch, slug) {
  const qs = batch.questions || [];
  if (slug === 'education') {
    const t3 = qs.find((q) => Number(q.teil) === 3);
    if (t3?.question) {
      t3.question = t3.question
        .replace(
          'Haben Sie noch Fragen zum Thema? (Beispielfragen:',
          'Möchten Sie noch etwas zum Thema wissen? (Beispiele:',
        )
        .replace('stellen Sie 2-3 Fragen dazu', 'stellen Sie zwei bis drei Nachfragen dazu');
    }
  }
  if (slug === 'society') {
    const t1 = qs.find((q) => Number(q.teil) === 1);
    if (t1?.question) {
      t1.question = t1.question.replace(
        'Benötigte Ressourcen und Materialien',
        'Benötigte Mittel und Materialien',
      );
    }
  }
  if (slug === 'work') {
    const t2 = qs.find((q) => Number(q.teil) === 2);
    if (t2?.question) {
      t2.question = t2.question.replace(
        'Präsentieren Sie Reisen und Verkehr in Ihrem Heimatland',
        'Halten Sie eine Präsentation über Reisen und Verkehr in Ihrem Heimatland',
      );
    }
  }
  return batch;
}

function applyTopicFixes(batch, slug) {
  const cfg = TOPIC_BY_SLUG[slug];
  batch.topicTag = cfg.topicTag;
  const qs = [...(batch.questions || [])].sort((a, b) => Number(a.teil) - Number(b.teil));
  qs.forEach((q, i) => {
    q.topicTags = [cfg.topicTags[i] || cfg.topicTag];
    q.topicTag = cfg.topicTags[i] || cfg.topicTag;
  });
  return batch;
}

function repairBatch(raw, slug) {
  let batch = stripPoolRejectMeta(JSON.parse(JSON.stringify(raw)));
  batch = applyStringFixes(batch, slug);
  batch = applyTopicFixes(batch, slug);
  ({ batch } = enrichBatchMetadata(batch, {
    forceVocab: true,
    forceGrammar: true,
    fillGrammarDefaults: true,
    fallbackTopic: TOPIC_BY_SLUG[slug].topicTag,
  }));
  batch.level = LEVEL;
  batch.lang = batch.lang || 'de';
  batch._a2SprechenCuratedRepairAt = new Date().toISOString();
  batch._a2SprechenCuratedRepairNote =
    'Fase0: CHK-14/6c strings + canonical topicTag + retrieval metadata (no LLM)';
  return batch;
}

async function verifyBundle(file, batch) {
  const pool2 = await isPartPoolReady(batch, { semantic: false, skipSem2: true });
  const ready = await poolReadyCheckWithRepair(batch, {
    file,
    skipQ1: false,
    skipQ2: true,
    skipMetadata: false,
    dryRun: true,
  });
  return { pool2, ready };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply || process.argv.includes('--dry-run');
  const dir = poolVerifiedDir(LEVEL);
  const report = { at: new Date().toISOString(), level: LEVEL, bundles: [], llmCostUsd: 0 };

  console.log(`\n=== A2 Sprechen curated repair (${dryRun ? 'DRY-RUN' : 'APPLY'}) ===\n`);

  for (const slug of SLUGS) {
    const file = `sprechen-cur-${slug}.json`;
    const fp = path.join(dir, file);
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const batch = repairBatch(raw, slug);

    const { pool2, ready } = await verifyBundle(file, batch);
    const entry = {
      file,
      slug,
      topicTag: batch.topicTag,
      topicCanonical: normalizeB1Topic(batch.topicTag),
      pool2: { ok: pool2.ok, blocking: pool2.blocking.map((f) => `${f.severity}:${f.id}:${f.message?.slice(0, 120)}`) },
      poolReady: {
        ok: ready.ok,
        reasons: ready.reasons || [],
        gates: ready.gates || {},
      },
      metadata: (batch.questions || []).map((q) => ({
        id: q.id,
        grammarTags: q.grammarTags?.length || 0,
        vocabularyTags: q.vocabularyTags?.length || 0,
      })),
    };
    report.bundles.push(entry);

    const status = pool2.ok && ready.ok ? 'READY' : 'FAIL';
    console.log(`${status}  ${file}  topicTag=${batch.topicTag}  POOL-2=${pool2.ok}  pool-ready=${ready.ok}`);
    if (!pool2.ok) {
      for (const b of pool2.blocking.slice(0, 5)) {
        console.log(`  POOL-2: [${b.severity}] ${b.id} — ${b.message}`);
      }
    }
    if (!ready.ok && ready.reasons?.length) {
      console.log(`  pool-ready: ${ready.reasons.join(', ')}`);
    }

    if (apply && !dryRun) {
      fs.writeFileSync(fp, `${JSON.stringify(batch, null, 2)}\n`);
      const sync = await syncPoolVerifiedBatch({
        file: fp,
        batch,
        level: LEVEL,
        opts: { lang: 'de', module: 'sprechen', syncBlobs: false },
      });
      entry.sync = sync;
      console.log(`  synced: ${sync.results?.map((r) => r.id).join(', ') || sync.skipped || sync.error}`);
    }
  }

  const allOk = report.bundles.every((b) => b.pool2.ok && b.poolReady.ok);
  report.allOk = allOk;
  const outReport = path.join(ROOT, 'batches/ready/gate-logs/a2-sprechen-curated-repair.json');
  fs.mkdirSync(path.dirname(outReport), { recursive: true });
  fs.writeFileSync(outReport, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\nReport: ${path.relative(ROOT, outReport)}`);
  console.log(allOk ? '\n✓ All 4 bundles POOL-2 + pool-ready (no LLM)\n' : '\n✗ Some bundles still failing\n');
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
