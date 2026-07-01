#!/usr/bin/env node
/** Write vocabulary & phrases JSON from bundled seeds (+ optional Gemini). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/loadEnv.mjs';
import { buildPublishedDocs, stubDoc } from './lib/referenceContentBundles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(path.join(ROOT, '.env'));

const TAUGHT = 'de';
const META_LANGS = ['en', 'es'];
const PUBLISHED_LEVELS = ['A2', 'B1'];
const STUB_LEVELS = ['A1', 'B2', 'C1', 'C2'];

function outPath(type, taught, meta, level) {
  return path.join(ROOT, 'content', type, taught, meta, `${level}.json`);
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function writeManifest(type) {
  const published = { [TAUGHT]: {} };
  for (const meta of META_LANGS) {
    published[TAUGHT][meta] = [...PUBLISHED_LEVELS];
  }
  writeJson(path.join(ROOT, 'content', type, 'manifest.json'), {
    metaLanguages: META_LANGS,
    defaultMetaLanguage: 'en',
    published,
    pending: Object.fromEntries(STUB_LEVELS.map((l) => [l, META_LANGS])),
    note: `Reference ${type} for Goethe German. Path: content/${type}/<taughtLang>/<metaLang>/<level>.json`,
  });
}

function main() {
  const types = ['vocabulary', 'phrases'];
  for (const type of types) {
    writeManifest(type);
    for (const level of [...STUB_LEVELS, ...PUBLISHED_LEVELS]) {
      for (const meta of META_LANGS) {
        const filePath = outPath(type, TAUGHT, meta, level);
        const doc = PUBLISHED_LEVELS.includes(level)
          ? buildPublishedDocs(type, level, meta)
          : stubDoc(type, level, meta);
        if (!doc) {
          console.error('Missing doc', type, level, meta);
          process.exit(1);
        }
        writeJson(filePath, doc);
        console.log('Wrote', path.relative(ROOT, filePath), `(${doc.sections?.length || 0} sections, ${doc.status})`);
      }
    }
  }
  console.log('\nReference content files written.');
}

main();
