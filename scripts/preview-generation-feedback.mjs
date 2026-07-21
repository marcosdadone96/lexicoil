#!/usr/bin/env node
/**
 * Preview generation feedback against a base prompt (PASO 6 observation mode).
 * Does NOT call the LLM and does NOT change production prompts.
 *
 * Usage:
 *   node scripts/preview-generation-feedback.mjs --module lesen --level B1 --topic Umwelt
 *   node scripts/preview-generation-feedback.mjs --module lesen --base-file path/to/prompt.txt
 *   node scripts/preview-generation-feedback.mjs --fixture  # in-memory demo rules
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  generationFeedbackPreview,
  getActiveGenerationFeedback,
  buildGenerationFeedbackContext,
} = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackResolver.js'));
const { createFeedback } = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackStore.js'));

function parseArgs(argv) {
  const out = {
    module: 'lesen',
    level: 'B1',
    topic: '',
    teil: null,
    baseFile: null,
    fixture: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--fixture') out.fixture = true;
    else if (a === '--module' && argv[i + 1]) out.module = argv[++i];
    else if (a === '--level' && argv[i + 1]) out.level = argv[++i];
    else if (a === '--topic' && argv[i + 1]) out.topic = argv[++i];
    else if (a === '--teil' && argv[i + 1]) out.teil = Number(argv[++i]);
    else if (a === '--base-file' && argv[i + 1]) out.baseFile = argv[++i];
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
    reason: 'Avoid artificial newspaper openers',
    avoid: 'Ein Bericht zeigt',
    preferred: 'natural B1 opening without meta-source phrases',
    module: 'lesen',
    level: 'B1',
  });
  await createFeedback(store, {
    type: 'lexical_preference',
    status: 'approved',
    reason: 'Prefer einführen over incorrect Programm collocation',
    avoid: 'eingetreten bei einem Programm',
    use: 'eingeführt',
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
    type: 'grammar_rule',
    status: 'candidate',
    reason: 'Should not appear — candidate only',
    pattern: 'verbs after pronouns lowercase',
    module: 'lesen',
    level: 'B1',
  });
  await createFeedback(store, {
    type: 'naturalness',
    status: 'active',
    reason: 'Hören-only rule',
    avoid: 'lautsprechertechnisch',
    preferred: 'einfache Hörsprache',
    module: 'horen',
    level: 'B1',
  });
}

async function openStore(args) {
  if (args.fixture) {
    const store = memoryStore();
    await seedFixture(store);
    return store;
  }
  try {
    const { getStore } = await import('@netlify/blobs');
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
    if (!siteID || !token) {
      console.warn('No Blobs credentials — using --fixture demo store.');
      const store = memoryStore();
      await seedFixture(store);
      return store;
    }
    return getStore({ name: 'lexicoil-data', siteID, token });
  } catch (_) {
    const store = memoryStore();
    await seedFixture(store);
    return store;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  node scripts/preview-generation-feedback.mjs --fixture --module lesen --topic Umwelt
  node scripts/preview-generation-feedback.mjs --module lesen --level B1 --topic Umwelt
`);
    process.exit(0);
  }

  const topic = args.topic || 'Umwelt';
  let basePrompt = args.baseFile
    ? fs.readFileSync(path.resolve(args.baseFile), 'utf8')
    : `Generate a Goethe ${args.level} ${args.module} passage about ${topic}.`;

  const store = await openStore(args);
  const preview = await generationFeedbackPreview({
    basePrompt,
    store,
    query: {
      module: args.module,
      level: args.level,
      topic,
      teil: args.teil,
    },
  });

  console.log(preview.report);
  console.log('\n--- JSON summary ---');
  console.log(
    JSON.stringify(
      {
        ok: preview.ok,
        ruleCount: preview.ruleCount,
        rules: preview.activeFeedback,
        skippedCount: (preview.skipped || []).length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
