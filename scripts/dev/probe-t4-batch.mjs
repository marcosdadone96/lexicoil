import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { miniExamFromCandidate } from '../pipeline/lib/candidateBuilder.mjs';
import { batchToCandidates } from '../pipeline/lib/candidateBuilder.mjs';
import { resolveBlueprint } from '../pipeline/lib/validateCandidate.mjs';

const require = createRequire(import.meta.url);
const CefrGate = require('../../js/engine/validation/CefrGate.js');

const batch = JSON.parse(readFileSync('batches/generated/lesen-t4-gemini-001.json', 'utf8'));
const blueprint = resolveBlueprint('de', 'B1');
const [candidate] = batchToCandidates(batch, { lang: 'de', level: 'B1', blueprint, batchId: 't4', source: 'probe' });
const exam = miniExamFromCandidate(candidate);
const part = exam.lesenParts[0];
const chunks = [part.text];
(part.items || []).forEach((it) => chunks.push(it.signText));
const text = chunks.join(' ');
const r = CefrGate.validatePassage(text, { lang: 'de', level: 'B1' });
console.log('words', r.metrics.wordCount);
console.log('cov', r.metrics.coverageVsLevel);
console.log('avg', r.metrics.avgSentenceLen);
console.log('sub', r.metrics.subordinatePct);
console.log('rare', r.metrics.outOfRangeRareWords?.slice(0, 15));
console.log('reasons', r.reasons);
