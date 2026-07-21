#!/usr/bin/env node
/**
 * Sync an applied content correction to runtime sources (PASO 13 P0-1).
 *
 * Usage:
 *   node scripts/sync-correction-to-runtime.mjs --dry-run --sourceFile lesen-t5-gemini-039
 *   node scripts/sync-correction-to-runtime.mjs --dry-run --id cc-xxx
 *   node scripts/sync-correction-to-runtime.mjs --confirm --id cc-xxx
 *   node scripts/sync-correction-to-runtime.mjs --confirm --confirm-publish --id cc-xxx
 *
 * Default is always dry-run. Seed/Blob writes need --confirm.
 * Published snapshot updates also need --confirm-publish.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import { syncCorrectionToRuntime } from './lib/syncCorrectionToRuntime.mjs';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const {
  loadCorrection,
  listCorrections,
} = require(path.join(ROOT, 'netlify/functions/lib/contentCorrectionsStore.js'));
const { tryLoadSourceBatch } = require(path.join(ROOT, 'netlify/functions/lib/contentCorrectionsStore.js'));

function parseArgs(argv) {
  const out = {
    dryRun: true,
    confirm: false,
    confirmPublish: false,
    id: null,
    sourceFile: null,
    localOnly: false,
    skipBlob: false,
    skipSeed: false,
    skipPublished: false,
    lang: 'de',
    level: 'B1',
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--confirm') {
      out.confirm = true;
      out.dryRun = false;
    } else if (a === '--confirm-publish') out.confirmPublish = true;
    else if (a === '--local-only') out.localOnly = true;
    else if (a === '--skip-blob') out.skipBlob = true;
    else if (a === '--skip-seed') out.skipSeed = true;
    else if (a === '--skip-published') out.skipPublished = true;
    else if (a === '--id' && argv[i + 1]) out.id = argv[++i];
    else if (a === '--sourceFile' && argv[i + 1]) out.sourceFile = argv[++i];
    else if (a === '--lang' && argv[i + 1]) out.lang = argv[++i];
    else if (a === '--level' && argv[i + 1]) out.level = argv[++i];
  }
  return out;
}

async function openStore(args) {
  if (process.env.CONTENT_CORRECTIONS_STORE === 'memory' || args.localOnly) {
    const map = new Map();
    return {
      async get(key, opts) {
        if (!map.has(key)) return null;
        const v = map.get(key);
        return opts?.type === 'json' ? JSON.parse(v) : v;
      },
      async setJSON(key, val) {
        map.set(key, JSON.stringify(val));
      },
      async set(key, val) {
        map.set(key, typeof val === 'string' ? val : JSON.stringify(val));
      },
    };
  }
  try {
    return getStore({ name: 'lexicoil-data', consistency: 'strong' });
  } catch (err) {
    if (args.sourceFile && !args.id) {
      console.warn(`(Blobs unavailable — continuing with sourceFile locate only: ${err.message})`);
      return openStore({ ...args, localOnly: true });
    }
    throw err;
  }
}

function printReport(report) {
  console.log('');
  console.log('═'.repeat(64));
  console.log(`sourceFile:  ${report.sourceFile}`);
  console.log(`partId:      ${report.partId || '(none)'}`);
  console.log(`syncStatus:  ${report.syncStatus}`);
  console.log(`dryRun:      ${report.dryRun}`);
  console.log('─'.repeat(64));
  for (const t of report.targets || []) {
    const extra = t.partId ? ` partId=${t.partId}` : '';
    const note = t.note ? ` (${t.note})` : '';
    const err = t.error ? ` err=${t.error}` : '';
    console.log(`  [${t.type}] ${t.status}${extra}${note}${err}`);
  }
  if (report.publishedExams?.length) {
    console.log('─'.repeat(64));
    console.log('Published hits:');
    for (const h of report.publishedExams) {
      console.log(`  ${h.examId} slot=${h.slot} ${h.cell} → ${h.partId}`);
    }
  }
  if (report.backups?.length) {
    console.log('Backups:', report.backups.join(', '));
  }
  if (report.errors?.length) {
    console.log('Errors:', report.errors.join(' | '));
  }
  console.log('═'.repeat(64));
  console.log(JSON.stringify({
    sourceFile: report.sourceFile,
    partId: report.partId,
    targets: (report.targets || []).map((t) => ({
      type: t.type,
      status: t.status,
      ...(t.partId ? { partId: t.partId } : {}),
      ...(t.note ? { note: t.note } : {}),
    })),
    syncStatus: report.syncStatus,
  }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  node scripts/sync-correction-to-runtime.mjs --dry-run --sourceFile <base>
  node scripts/sync-correction-to-runtime.mjs --dry-run --id <cc-id>
  node scripts/sync-correction-to-runtime.mjs --confirm [--confirm-publish] --id <cc-id>

Default: dry-run. --confirm writes seed/blob. --confirm-publish also patches published.`);
    process.exit(0);
  }

  const store = await openStore(args);
  let correction = null;

  if (args.id) {
    correction = await loadCorrection(store, args.id);
    if (!correction) {
      console.error(`Correction not found: ${args.id}`);
      process.exit(1);
    }
  } else if (args.sourceFile) {
    // Synthetic correction stub for destination discovery (no field patch needed for dry locate)
    const listed = await listCorrections(store, {
      sourceFile: args.sourceFile,
      status: 'applied',
      limit: 5,
    });
    correction = listed.corrections?.[0] || {
      id: null,
      sourceFile: args.sourceFile,
      module: 'lesen',
      teil: 1,
      targetId: '_locate_',
      targetType: 'question',
      fieldPath: 'text',
      newValue: null,
      status: 'applied',
    };
    if (!listed.corrections?.length) {
      const disk = tryLoadSourceBatch(args.sourceFile, ROOT);
      if (disk.ok && disk.batch) {
        correction.module = disk.batch.module || correction.module;
        correction.teil = disk.batch.teil || correction.teil;
        const q = disk.batch.questions?.[0];
        if (q?.id) {
          correction.targetId = q.id;
          correction.newValue = q.text ?? q.question ?? null;
        }
      }
      console.warn('(no applied correction in store — locating destinations from sourceFile only)');
    }
  } else {
    console.error('Provide --id or --sourceFile');
    process.exit(2);
  }

  const result = await syncCorrectionToRuntime(correction, {
    projectRoot: ROOT,
    dryRun: args.dryRun,
    confirm: args.confirm,
    confirmPublish: args.confirmPublish,
    localOnly: args.localOnly,
    skipBlob: args.skipBlob,
    skipSeed: args.skipSeed,
    skipPublished: args.skipPublished,
    lang: args.lang,
    level: args.level,
    persistSyncStatus: args.confirm && !!correction.id,
    correctionsStore: store,
    email: process.env.USER || 'cli',
    store: args.localOnly ? null : undefined,
  });

  printReport(result.report);
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
