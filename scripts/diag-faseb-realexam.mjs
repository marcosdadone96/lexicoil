/**
 * diag-faseb-realexam.mjs — Validate a real assembled exam through flattenExam after Fase B.
 * Confirms: correct question counts, no duplicates, no missing questions.
 * Run: node scripts/diag-faseb-realexam.mjs
 */
import { readFileSync } from 'fs';
import { auditExam } from './audit-pass-2.mjs';

const pool = JSON.parse(readFileSync('library/reusable-seed/de_B1.json', 'utf8'));
const records = Array.isArray(pool) ? pool : (pool.records || pool.parts || []);

function pickFirst(module, teil) {
  return records.find(r => r.module === module && Number(r.teil) === teil);
}

const lesenT1 = pickFirst('lesen', 1);
const lesenT2 = pickFirst('lesen', 2);
const lesenT3 = pickFirst('lesen', 3);
const lesenT4 = pickFirst('lesen', 4);
const lesenT5 = pickFirst('lesen', 5);
const horenT1 = pickFirst('horen', 1);
const horenT2 = pickFirst('horen', 2);
const horenT3 = pickFirst('horen', 3);
const horenT4 = pickFirst('horen', 4);
const schT1   = pickFirst('schreiben', 1);
const schT2   = pickFirst('schreiben', 2);
const schT3   = pickFirst('schreiben', 3);

const parts = { lesenT1, lesenT2, lesenT3, lesenT4, lesenT5, horenT1, horenT2, horenT3, horenT4, schT1, schT2, schT3 };

console.log('=== Part sources ===');
for (const [k, p] of Object.entries(parts)) {
  if (!p) {
    console.log(`  MISSING: ${k}`);
    continue;
  }
  const segsLen = (p.segments || []).length;
  const qLen = (p.questions || []).length;
  const auth = segsLen > 0 ? '[SEG-AUTH]' : '[Q-AUTH]';
  const segQLen = segsLen > 0
    ? (p.segments || []).reduce((s, seg) => s + (seg.questions || []).length, 0)
    : 0;
  const effective = segsLen > 0 ? segQLen : qLen;
  console.log(`  ${k.padEnd(12)} id=...${(p.id || '?').slice(-16)} segments=${segsLen} questions=${qLen} seg.q=${segQLen} effective=${effective} ${auth}`);
}

const examObj = {
  lesenParts:     [lesenT1, lesenT2, lesenT3, lesenT4, lesenT5].filter(Boolean),
  horenParts:     [horenT1, horenT2, horenT3, horenT4].filter(Boolean),
  schreibenParts: [schT1, schT2, schT3].filter(Boolean),
  sprechenParts:  [],
};

console.log('\n=== auditExam on real assembled exam ===');
const audit = auditExam({ exam: examObj }, 'real-assembled');
console.log(`questionsScanned: ${audit.questionsScanned}`);
console.log(`CRITICAL: ${audit.critical}  IMPORTANT: ${audit.important}  MINOR: ${audit.minor}`);

if (audit.findings.length > 0) {
  console.log('\nFindings:');
  for (const f of audit.findings) {
    console.log(`  [${f.severity}] ${f.id}: ${String(f.msg || '').slice(0, 100)}`);
  }
} else {
  console.log('\n✅ 0 findings — exam is clean.');
}
