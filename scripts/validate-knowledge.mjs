#!/usr/bin/env node
/**
 * Validates all knowledge/ JSON files against schemas.
 * Usage: npm run validate:knowledge
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KNOWLEDGE = path.join(ROOT, 'knowledge');
const SCHEMAS = path.join(KNOWLEDGE, 'schemas');

let Ajv;
try {
  const mod = await import('ajv');
  Ajv = mod.default;
} catch {
  console.error('Missing ajv. Run: npm install --save-dev ajv');
  process.exit(1);
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function validateFile(dataPath, schemaName) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const schema = loadJson(path.join(SCHEMAS, schemaName));
  const validate = ajv.compile(schema);
  const data = loadJson(dataPath);
  const rel = path.relative(ROOT, dataPath);
  if (!validate(data)) {
    console.error(`FAIL ${rel}`);
    for (const err of validate.errors || []) {
      console.error(`  ${err.instancePath || '/'} ${err.message}`);
    }
    return false;
  }
  console.log(`OK   ${rel}`);
  return true;
}

let ok = true;

for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
  ok = validateFile(path.join(KNOWLEDGE, 'cefr', `${level}.json`), 'cefr-level.schema.json') && ok;
}

for (const lang of ['german', 'english', 'spanish']) {
  ok = validateFile(path.join(KNOWLEDGE, 'languages', `${lang}.json`), 'language.schema.json') && ok;
}

for (const prov of ['goethe', 'cambridge', 'dele']) {
  ok = validateFile(path.join(KNOWLEDGE, 'providers', `${prov}.json`), 'provider.schema.json') && ok;
}

// Cross-check: provider languageId matches language file id
const BaseProviderAdapter = require(path.join(ROOT, 'js', 'engine', 'providers', 'baseProviderAdapter.js'));
for (const prov of ['goethe', 'cambridge', 'dele']) {
  const p = loadJson(path.join(KNOWLEDGE, 'providers', `${prov}.json`));
  const langPath = path.join(KNOWLEDGE, 'languages', `${p.languageId}.json`);
  if (!fs.existsSync(langPath)) {
    console.error(`FAIL provider ${prov}: languageId ${p.languageId} has no language file`);
    ok = false;
  }
  try {
    BaseProviderAdapter.assertNoPrompts(p, prov);
    console.log(`OK   knowledge/providers/${prov}.json (no prompt keys)`);
  } catch (e) {
    console.error(`FAIL provider ${prov}: ${e.message}`);
    ok = false;
  }
}

if (!ok) {
  console.error('\nKnowledge validation failed.');
  process.exit(1);
}

console.log('\nAll knowledge files valid.');
