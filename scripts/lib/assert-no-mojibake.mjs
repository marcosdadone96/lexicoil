#!/usr/bin/env node
/**
 * CI guard — fails if tracked content under data/, js/content/, library/ contains mojibake.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOJIBAKE_SIGNATURE,
  scanLineHits,
  walkScanFiles,
  selfTestDetector,
} from './mojibakeLib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function assertNoMojibake({ verbose = true } = {}) {
  selfTestDetector();
  const files = walkScanFiles(ROOT);
  const violations = [];

  for (const { abs, rel } of files) {
    const raw = fs.readFileSync(abs, 'utf8');
    if (!MOJIBAKE_SIGNATURE.test(raw)) continue;
    violations.push(...scanLineHits(raw, rel));
  }

  if (violations.length) {
    if (verbose) {
      console.error(`FAIL: mojibake detected in ${violations.length} line(s):`);
      violations.slice(0, 20).forEach((v) => {
        console.error(`  ${v.file}:${v.line} [${v.tokens.join(', ')}] ${v.preview}`);
      });
      if (violations.length > 20) console.error(`  … and ${violations.length - 20} more`);
      console.error('\nRun: npm run fix:mojibake:apply');
    }
    return { ok: false, violations };
  }

  if (verbose) console.log(`OK   no mojibake in ${files.length} scanned file(s)`);
  return { ok: true, filesScanned: files.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = assertNoMojibake();
  process.exit(result.ok ? 0 : 1);
}
