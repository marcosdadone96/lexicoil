import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const CefrGate = require('../../js/engine/validation/CefrGate.js');

const texts = JSON.parse(readFileSync(new URL('./cefr-probe-texts.json', import.meta.url), 'utf8'));
for (const [name, text] of Object.entries(texts)) {
  const r = CefrGate.validatePassage(text, { lang: 'de', level: 'B1' });
  console.log(name, r.withinRange ? 'OK' : 'FAIL', r.metrics.wordCount, 'cov', r.metrics.coverageVsLevel, r.reasons.join(' | '));
}
