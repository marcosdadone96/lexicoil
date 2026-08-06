#!/usr/bin/env node
/**
 * Apply approved content corrections to pool JSON (PASO 5).
 *
 * Usage:
 *   node scripts/apply-content-corrections.mjs --dry-run
 *   node scripts/apply-content-corrections.mjs --dry-run --id cc-xxx
 *   node scripts/apply-content-corrections.mjs --confirm --id cc-xxx
 *   node scripts/apply-content-corrections.mjs --confirm --all
 *   node scripts/apply-content-corrections.mjs --dry-run --sourceFile lesen-t1-gemini-160
 *   node scripts/apply-content-corrections.mjs --dry-run --module lesen
 *
 * Requires Netlify Blobs credentials (same as other admin scripts) OR
 * CONTENT_CORRECTIONS_STORE=memory for local fixture tests.
 *
 * Default is always dry-run. Real writes need --confirm.
 */
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { getStore } from '@netlify/blobs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  applyCorrection,
  applyApprovedCorrections,
} = require(path.join(ROOT, 'netlify/functions/lib/applyContentCorrections.js'));

function parseArgs(argv) {
  const out = {
    dryRun: true,
    confirm: false,
    all: false,
    id: null,
    ids: [],
    sourceFile: null,
    module: null,
    strict: false,
    skipLearning: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--confirm') {
      out.confirm = true;
      out.dryRun = false;
    }
    else if (a === '--all') out.all = true;
    else if (a === '--strict') out.strict = true;
    else if (a === '--skip-learning') out.skipLearning = true;
    else if (a === '--id' && argv[i + 1]) out.id = argv[++i];
    else if (a === '--ids' && argv[i + 1]) out.ids = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--sourceFile' && argv[i + 1]) out.sourceFile = argv[++i];
    else if (a === '--module' && argv[i + 1]) out.module = argv[++i];
  }
  return out;
}

function printSummary(summary) {
  console.log('');
  console.log('Correcciones:           ', summary.corrections ?? '—');
  console.log('Archivos afectados:     ', summary.filesAffected ?? '—');
  console.log('Preguntas/targets:      ', summary.questionsAffected ?? summary.targetsAffected ?? '—');
  console.log('Conflictos:             ', summary.conflicts ?? '—');
  console.log('Learning rules (est.):  ', summary.learningRulesGenerated ?? summary.learningRulesEstimated ?? '—');
  if (summary.wouldApply != null) console.log('Aplicables:             ', summary.wouldApply);
  if (summary.applied != null) console.log('Aplicadas:              ', summary.applied);
  if (summary.failed != null) console.log('Fallidas:               ', summary.failed);
  console.log('');
}

async function openStore() {
  if (process.env.CONTENT_CORRECTIONS_STORE === 'memory') {
    const map = new Map();
    return {
      async get(key, opts) {
        if (!map.has(key)) return null;
        return map.get(key);
      },
      async setJSON(key, val) {
        map.set(key, val);
      },
      async delete(key) {
        map.delete(key);
      },
    };
  }
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
  if (!siteID || !token) {
    throw new Error(
      'Missing NETLIFY_SITE_ID + NETLIFY_AUTH_TOKEN (or CONTENT_CORRECTIONS_STORE=memory).',
    );
  }
  return getStore({ name: 'lexicoil-data', siteID, token });
}

async function maybeStrictValidate(batch) {
  try {
    const { isPartPoolReady } = await import('./audit-pass-2.mjs');
    const gate = await isPartPoolReady(batch, { semantic: false });
    if (!gate.ok) {
      return { ok: false, errors: (gate.errors || gate.reasons || ['isPartPoolReady_failed']).map(String) };
    }
  } catch (err) {
    return { ok: false, errors: [`strict_gate:${err.message}`] };
  }
  return { ok: true };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  node scripts/apply-content-corrections.mjs --dry-run [--id ID] [--all] [--module lesen] [--sourceFile NAME]
  node scripts/apply-content-corrections.mjs --confirm --id ID
  node scripts/apply-content-corrections.mjs --confirm --all

Flags:
  --dry-run        Plan only (default)
  --confirm        Actually write JSON + mark applied
  --strict         Run isPartPoolReady after each apply
  --skip-learning  Do not create generation_feedback records
`);
    process.exit(0);
  }

  const store = await openStore();
  const ctx = {
    email: process.env.ADMIN_EMAIL || 'cli@local',
    projectRoot: ROOT,
    skipLearning: args.skipLearning,
    postValidate: args.strict ? maybeStrictValidate : undefined,
  };

  if (args.id && !args.all) {
    const r = await applyCorrection(store, args.id, {
      ...ctx,
      dryRun: !args.confirm,
    });
    if (r.dryRun) {
      console.log(r.ok ? 'Dry-run OK — would apply:' : 'Dry-run issue:');
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
    }
    console.log(r.ok ? 'Applied:' : 'Failed:');
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }

  const result = await applyApprovedCorrections(store, {
    ...ctx,
    dryRun: !args.confirm,
    confirm: args.confirm,
    sourceFile: args.sourceFile || undefined,
    module: args.module || undefined,
    ids: args.ids.length ? args.ids : undefined,
  });

  printSummary(result.summary || {});
  if (result.dryRun) {
    console.log(result.message || 'Dry run complete.');
    if ((result.summary?.conflicts || 0) > 0) {
      console.log('Conflict details:', JSON.stringify(result.conflictDetails || [], null, 2));
    }
    if (!args.confirm) {
      console.log('¿Continuar? Re-ejecuta con --confirm para aplicar.');
    }
    process.exit(0);
  }

  console.log(JSON.stringify({ ok: result.ok, summary: result.summary }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
