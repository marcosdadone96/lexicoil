#!/usr/bin/env node
/** Sync library bank → Netlify reusable pool + vocab tags. */
import { loadEnvFile } from './lib/loadEnv.mjs';
import { syncLesenPool } from './lib/pasteLesenBatchLib.mjs';

loadEnvFile();

const args = { lang: 'de', level: 'B1' };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--lang') args.lang = process.argv[++i];
  else if (a === '--level') args.level = String(process.argv[++i]).toUpperCase();
}

syncLesenPool(args);
