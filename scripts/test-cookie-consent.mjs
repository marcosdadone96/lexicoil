#!/usr/bin/env node
/** Cookie consent i18n + granted hook contract (no DOM). */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { consentStrings, resolveConsentLang } = require(
  path.join(ROOT, 'js/i18n/consentLocale.js'),
);

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
}

const en = consentStrings('en');
const de = consentStrings('de');
assert(en.accept && de.accept, 'locale strings');
assert(en.catNecessaryHint.includes('session') || en.catNecessaryHint.includes('Sign-in'), 'en necessary hint');
assert(resolveConsentLang() === 'en' || ['de', 'es', 'fr', 'en'].includes(resolveConsentLang()), 'resolve lang');

console.log('OK   cookie consent locale');
