#!/usr/bin/env node
/** One-shot: classify regimes for pool items (stdin JSON array). */
import { classifyTextRegime } from './lib/textRegime.mjs';

const items = JSON.parse(await new Promise((r) => {
  let s = '';
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => r(s));
}));

for (const it of items) {
  const { regime } = classifyTextRegime({ text: it.text, field: it.field, file: it.file });
  console.log(JSON.stringify({ key: it.key, regime }));
}
