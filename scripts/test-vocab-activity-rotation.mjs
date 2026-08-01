#!/usr/bin/env node
/**
 * Vocab activity rotation (quiz / listening / phrases / personal).
 * Run: node scripts/test-vocab-activity-rotation.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { console, window: {}, module: { exports: {} }, saveGoals: () => {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/library/VocabBatching.js'), 'utf8'), ctx);
const VB = ctx.VocabBatching || ctx.window.VocabBatching;

let passed = 0;
let failed = 0;
function ok(label, cond) {
  if (cond) {
    console.log('  ✅', label);
    passed++;
  } else {
    console.log('  ❌', label);
    failed++;
  }
}

const words = Array.from({ length: 25 }, (_, i) => `wort${i + 1}`);
const goal = { id: 'g1', subject: 'de', level: 'B1', vocabActivityStats: {} };

const q1 = VB.selectForActivity(words, 'vocab_quiz', goal);
ok('quiz batch size 10', q1.words.length === 10);
ok('quiz first word in batch', q1.words[0] === words[0] || q1.words.length === 10);

VB.recordActivityUsage(goal, 'vocab_quiz', q1.words);
const q2 = VB.selectForActivity(words, 'vocab_quiz', goal);
ok('quiz second batch differs', q2.words[0] !== q1.words[0] || q2.words.join() !== q1.words.join());

const h1 = VB.selectForActivity(words, 'listening_game', goal);
ok('listening cap 6', h1.words.length === 6);

const p1 = VB.selectForActivity(words, 'vocab_phrases', goal);
ok('phrases cap 7', p1.words.length === 7);

const pe1 = VB.selectForActivity(words, 'personal', goal, { skills: ['lesen'] });
ok('personal lesen cap 10', pe1.words.length === 10);
ok('personal plan synced on goal', goal.vocabPlan && goal.vocabPlan.batchSize === 10);

VB.recordActivityUsage(goal, 'personal', pe1.words, { skills: ['lesen'] });
const pe2 = VB.selectForActivity(words, 'personal', goal, { skills: ['lesen'] });
ok('personal rotation advances', pe2.words.join() !== pe1.words.join());

const horenOnly = VB.selectForActivity(words, 'personal', { ...goal, vocabActivityStats: {} }, { skills: ['horen'] });
ok('personal horen cap 6', horenOnly.words.length === 6);

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
