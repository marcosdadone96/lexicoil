#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CefrGate = require('../../js/engine/validation/CefrGate.js');

const text = process.argv[2];
if (!text) {
  console.error('Usage: node scripts/dev/probe-cefr-passage.mjs "text..."');
  process.exit(1);
}
const r = CefrGate.validatePassage(text, { lang: 'de', level: 'B1' });
console.log(JSON.stringify({ withinRange: r.withinRange, metrics: r.metrics, reasons: r.reasons }, null, 2));
