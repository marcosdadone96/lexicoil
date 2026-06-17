#!/usr/bin/env node
/** Smoke test for LexiCoilDomain — Phase 03 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const domainPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'engine', 'domain', 'lexicoilDomain.js');
const LexiCoilDomain = require(domainPath);

const spec = LexiCoilDomain.createContentSpecification({
  language: 'german',
  level: 'B1',
  provider: 'goethe',
  contentType: 'Exam',
  topic: 'Umwelt und Nachhaltigkeit',
});

if (spec.language !== 'german' || spec.level !== 'B1' || spec.provider !== 'goethe') {
  console.error('Domain smoke test failed:', spec);
  process.exit(1);
}

try {
  LexiCoilDomain.createContentSpecification({
    language: 'english',
    level: 'B1',
    provider: 'goethe',
    contentType: 'Exam',
  });
  console.error('Expected provider/language mismatch to throw');
  process.exit(1);
} catch (e) {
  if (e.code !== 'invalid_content_spec') {
    console.error('Unexpected error:', e);
    process.exit(1);
  }
}

console.log('OK   LexiCoilDomain smoke test passed');
