#!/usr/bin/env node
/**
 * PASO 8 — Audit generationFeedbackStore (read-only).
 *
 *   node scripts/audit-generation-feedback.mjs
 *   node scripts/audit-generation-feedback.mjs --fixture
 *   node scripts/audit-generation-feedback.mjs --out generation-evaluation/feedback-audit.json
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  auditGenerationFeedbackStore,
  formatAuditReport,
} = require(path.join(ROOT, 'netlify/functions/lib/auditGenerationFeedback.js'));
const { createFeedback } = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackStore.js'));

function parseArgs(argv) {
  const out = { fixture: false, out: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--fixture') out.fixture = true;
    else if (a === '--out' && argv[i + 1]) out.out = argv[++i];
  }
  return out;
}

function memoryStore() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async setJSON(key, val) {
      map.set(key, val);
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

async function seedFixture(store) {
  await createFeedback(store, {
    type: 'naturalness',
    status: 'active',
    reason: 'Avoid translating Spanish structures literally',
    avoid: 'Konsum von Mobilität',
    preferred: 'Nutzung von Verkehrsmitteln',
    module: 'lesen',
    level: 'B1',
    sourceCorrection: 'cc-demo-1',
  });
  await createFeedback(store, {
    type: 'lexical_preference',
    status: 'approved',
    reason: 'Prefer natural verb-preposition collocations',
    avoid: 'eingetreten bei einem Programm',
    use: 'eingeführt',
    module: 'lesen',
    level: 'B1',
    sourceCorrection: 'cc-demo-2',
  });
  await createFeedback(store, {
    type: 'lexical_preference',
    status: 'active',
    reason: 'ban Haus',
    avoid: 'Haus',
    module: 'lesen',
    level: 'B1',
  });
  await createFeedback(store, {
    type: 'grammar_rule',
    status: 'candidate',
    reason: 'Evitar siempre Perfekt',
    avoid: 'Perfekt',
    pattern: 'never use Perfekt',
    module: 'lesen',
    level: 'B1',
  });
  await createFeedback(store, {
    type: 'typo',
    status: 'active',
    reason: 'typo',
    wrong: 'vergisen',
    correct: 'vergessen',
    module: 'lesen',
    level: 'B1',
  });
  await createFeedback(store, {
    type: 'naturalness',
    status: 'approved',
    reason: 'Avoid translating Spanish structures literally',
    avoid: 'Konsum von Mobilität',
    preferred: 'Nutzung von Verkehrsmitteln',
    module: 'lesen',
    level: 'B1',
    sourceCorrection: 'cc-demo-1b',
  });
}

async function openStore(args) {
  if (args.fixture) {
    const store = memoryStore();
    await seedFixture(store);
    return { store, source: 'fixture' };
  }
  try {
    const { getStore } = await import('@netlify/blobs');
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
    if (!siteID || !token) {
      console.warn('No Blobs credentials — using --fixture demo data.');
      const store = memoryStore();
      await seedFixture(store);
      return { store, source: 'fixture-fallback' };
    }
    return { store: getStore({ name: 'lexicoil-data', siteID, token }), source: 'blobs' };
  } catch (_) {
    const store = memoryStore();
    await seedFixture(store);
    return { store, source: 'fixture-fallback' };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  node scripts/audit-generation-feedback.mjs [--fixture] [--out path.json]
`);
    process.exit(0);
  }

  const { store, source } = await openStore(args);
  const audit = await auditGenerationFeedbackStore(store);
  audit.source = source;
  audit.generatedAt = new Date().toISOString();

  console.log(formatAuditReport(audit));
  console.log('\n--- byCategory JSON ---');
  console.log(JSON.stringify(audit.byCategory, null, 2));

  const outPath = args.out
    ? path.resolve(ROOT, args.out)
    : path.join(ROOT, 'generation-evaluation', 'feedback-audit-latest.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${path.relative(ROOT, outPath).replace(/\\/g, '/')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
