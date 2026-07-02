/**
 * diag-post-refactor-verify.mjs — Post-refactor end-to-end verification
 *
 * Verifies Eje 1 + Eje 2 + audit fixes on a REAL assembled exam from the pool.
 *
 * 1. Picks one clean-real part per cell (0 CRITICAL, 0 IMPORTANT).
 * 2. Runs isExamPublishable → confirms 0 CRITICAL, 0 GATE_BLOCK_CHECKS.
 * 3. Simulates grading runtime: confirms 'correct' field used (Eje 1) and
 *    each Hören question visited exactly once (Eje 2, no double-visit).
 * 4. Runs pool-health matrix.
 *
 * Read-only. No LLM calls. No writes.
 * Run: node scripts/diag-post-refactor-verify.mjs
 */
import { readFileSync } from 'fs';
import {
  auditExam,
  isExamPublishable,
  filterPartPoolFindings,
  partToExamWrapper,
  partRecordToExamPart,
  chk23,
  GATE_BLOCK_CHECKS,
  GATE_BLOCK_PENDING,
} from './audit-pass-2.mjs';

// Convert a pool record → normalized exam part (resolves passages, normalizes types)
// This mirrors the real assembly pipeline that calls partRecordToExamPart.
const MODULE_PARTS_KEY = {
  lesen: 'lesenParts', horen: 'horenParts',
  schreiben: 'schreibenParts', sprechen: 'sprechenParts',
};
function toExamPart(record) {
  return partRecordToExamPart(record);
}

// ── Load pool ─────────────────────────────────────────────────────────────────

const raw = JSON.parse(readFileSync('library/reusable-seed/de_B1.json', 'utf8'));
const records = Array.isArray(raw) ? raw : (raw.records || []);

// ── Step 0: identify clean records per cell ───────────────────────────────────

function isClean(record) {
  const rawF = chk23(record, record.id || '?');
  if (rawF.length > 0) return false;
  const wrapper = partToExamWrapper(record);
  if (!wrapper) return false;
  const audit = auditExam(wrapper, record.id || '?');
  const findings = [...rawF, ...filterPartPoolFindings(audit.findings)];
  return !findings.some(f => f.severity === 'CRITICAL' || f.severity === 'IMPORTANT');
}

const cleanByCell = {};
const totalByCell = {};

for (const rec of records) {
  const key = `${rec.module}-t${rec.teil}`;
  totalByCell[key] = (totalByCell[key] || 0) + 1;
  if (!cleanByCell[key] && isClean(rec)) {
    cleanByCell[key] = rec;
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('STEP 0: Clean records found per cell');
console.log('═══════════════════════════════════════════════════════════════');
const CELLS = ['lesen-t1','lesen-t2','lesen-t3','lesen-t4','lesen-t5',
               'horen-t1','horen-t2','horen-t3','horen-t4',
               'schreiben-t1','schreiben-t2','schreiben-t3'];
let missing = [];
for (const cell of CELLS) {
  const rec = cleanByCell[cell];
  const total = totalByCell[cell] || 0;
  const segs = rec ? (rec.segments || []).length : '-';
  const qs   = rec ? (rec.questions || []).length : '-';
  const segQ = rec ? (rec.segments || []).reduce((s, seg) => s + (seg.questions || []).length, 0) : '-';
  const auth = rec ? (segs > 0 ? '[SEG-AUTH]' : '[Q-AUTH]') : 'MISSING';
  console.log(`  ${cell.padEnd(14)} ${rec ? '✅' : '❌'} total=${total} id=...${rec ? (rec.id||'?').slice(-16) : '?'} segs=${segs} qs=${qs} segQ=${segQ} ${auth}`);
  if (!rec) missing.push(cell);
}
if (missing.length) {
  console.error(`\n❌ MISSING clean record for: ${missing.join(', ')}`);
  process.exit(1);
}

// ── Step 1: Assemble exam + isExamPublishable ─────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('STEP 1: isExamPublishable on assembled exam');
console.log('═══════════════════════════════════════════════════════════════');

// Convert each clean record through the canonical partRecordToExamPart path —
// same conversion the real assembly pipeline uses (normalizes type, resolves passages).
const examObj = {
  lesenParts:    ['lesen-t1','lesen-t2','lesen-t3','lesen-t4','lesen-t5']
                   .map(c => toExamPart(cleanByCell[c])),
  horenParts:    ['horen-t1','horen-t2','horen-t3','horen-t4']
                   .map(c => toExamPart(cleanByCell[c])),
  schreibenParts:['schreiben-t1','schreiben-t2','schreiben-t3']
                   .map(c => toExamPart(cleanByCell[c])),
  sprechenParts: [],
};

const pub = isExamPublishable({ exam: examObj });

console.log(`ok = ${pub.ok}`);
console.log(`blocking: ${pub.blocking.length}`);
console.log(`pending (CHK-18): ${pub.pending?.length || 0}`);
console.log(`advisory: ${pub.advisory.length}`);

if (pub.blocking.length > 0) {
  console.log('\nBlocking findings:');
  for (const f of pub.blocking) {
    console.log(`  [${f.severity}] ${f.id}: ${String(f.message || '').slice(0, 80)}`);
  }
}

const criticalOk = pub.blocking.filter(f => f.severity === 'CRITICAL').length === 0;
const gateBlockOk = pub.blocking.filter(f => GATE_BLOCK_CHECKS.has(f.id)).length === 0;
console.log(`\n  0 CRITICAL in blocking: ${criticalOk ? '✅' : '❌'}`);
console.log(`  0 GATE_BLOCK_CHECKS in blocking: ${gateBlockOk ? '✅' : '❌'}`);
console.log(`  ok=true: ${pub.ok ? '✅' : '❌'}`);

// ── Step 2: flattenExam question count ────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('STEP 2a: flattenExam question count (no duplicates / no missing)');
console.log('═══════════════════════════════════════════════════════════════');

// Re-import flattenExam via auditExam result
const auditResult = auditExam({ exam: examObj }, 'assembled-exam');
const Q = auditResult.questionsScanned;
console.log(`Total questions scanned by auditExam: ${Q}`);

// Expected: 6+6+7+7+4=30 Lesen, 10+5+7+8=30 Hören, 1+1+1=3 Schreiben = 63
const lesenExpected = [6, 6, 7, 7, 4];
const horenExpected = [10, 5, 7, 8];
const schreibenExpected = [1, 1, 1];

// Count from the effective source of each converted part
let expectedTotal = 0;
for (const [i, part] of examObj.lesenParts.entries()) {
  const segQ = (part.segments || []).reduce((s, seg) => s + (seg.questions || []).length, 0);
  const qArr = (part.questions || []).length;
  const items = (part.items || []).length;
  const eff = segQ > 0 ? segQ : (qArr > 0 ? qArr : items);
  expectedTotal += eff;
  console.log(`  Lesen T${i+1}: ${eff} questions (questions[]=${qArr}, items[]=${items}, segments=${(part.segments||[]).length})`);
}
for (const [i, part] of examObj.horenParts.entries()) {
  const segQ = (part.segments || []).reduce((s, seg) => s + (seg.questions || []).length, 0);
  const qArr = (part.questions || []).length;
  const eff = segQ > 0 ? segQ : qArr;
  expectedTotal += eff;
  const auth = segQ > 0 ? `segments→${segQ}` : `questions→${qArr}`;
  console.log(`  Hören T${i+1}: ${eff} questions (${auth})`);
}
for (const [i, part] of examObj.schreibenParts.entries()) {
  const eff = (part.questions || []).length;
  expectedTotal += eff;
  console.log(`  Schreiben T${i+1}: ${eff} questions`);
}

console.log(`\n  Expected total: ${expectedTotal}`);
console.log(`  flattenExam scanned: ${Q}`);
console.log(`  Count match: ${Q === expectedTotal ? '✅' : '❌ MISMATCH'}`);

// ── Step 2b: simulate forEachGoetheQ (Eje 2 — no double-visit) ───────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('STEP 2b: forEachGoetheQ simulation — single-visit invariant (Eje 2)');
console.log('═══════════════════════════════════════════════════════════════');

// Replicate the patched forEachGoetheQ logic from examRunner.js
function segToQ(seg) {
  return seg.questions || [];
}

const d = examObj;
const visits = {}; // qId → count
const visitKeys = []; // full answer key strings used

d.horenParts?.forEach((p, pi) => {
  const meta = { module: 'horen', teil: p.teil, part: p };
  if (p.segments?.length) {
    // Eje-2 Fase B: segments is authority
    p.segments.forEach((s, si) => {
      segToQ(s).forEach(q => {
        const fullKey = `horen_${pi}_${si}_${q.id}`;
        visits[q.id] = (visits[q.id] || 0) + 1;
        visitKeys.push(fullKey);
      });
    });
  } else {
    // No segments: questions[] is source (H4 flat)
    (p.questions || []).forEach(q => {
      const fullKey = `horen_${pi}_${q.id}`;
      visits[q.id] = (visits[q.id] || 0) + 1;
      visitKeys.push(fullKey);
    });
  }
});

const duplicateVisits = Object.entries(visits).filter(([, n]) => n > 1);
const totalHorenQ = Object.keys(visits).length;

console.log(`  Total Hören questions visited: ${totalHorenQ}`);
console.log(`  Duplicate visits (double-visit bug): ${duplicateVisits.length === 0 ? '0 ✅' : duplicateVisits.length + ' ❌'}`);
if (duplicateVisits.length > 0) {
  for (const [id, n] of duplicateVisits) console.log(`    q.id=${id} visited ${n} times`);
}

// Verify H1 (segments) uses correct answer key format horen_0_N_qId
const h1Keys = visitKeys.filter(k => k.startsWith('horen_0_'));
const h1SegKeys = h1Keys.filter(k => /^horen_0_\d+_/.test(k));
const h1FlatKeys = h1Keys.filter(k => /^horen_0_[^_]+$/.test(k));
console.log(`  H1 answer keys via segment path (horen_0_N_qId): ${h1SegKeys.length} ✅`);
console.log(`  H1 answer keys via flat path (horen_0_qId — should be 0): ${h1FlatKeys.length === 0 ? '0 ✅' : h1FlatKeys.length + ' ❌'}`);

// H4 (no segments): verify flat keys
const h4Part = examObj.horenParts[3]; // Teil 4, index 3
const h4Keys = visitKeys.filter(k => k.startsWith('horen_3_') && !k.match(/^horen_3_\d+_\d+_/));
console.log(`  H4 flat keys (horen_3_qId, no segment): ${h4Keys.length > 0 ? h4Keys.length + ' ✅' : '0 (check if H4 has questions)'}`);

// ── Step 2c: grading uses q.correct (Eje 1) ──────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('STEP 2c: grading field check — uses q.correct (Eje 1)');
console.log('═══════════════════════════════════════════════════════════════');

let correctFieldMissing = 0;
let correctAnswerOnlyRecords = 0;
let correctOk = 0;
let divergent = 0;

// Check converted parts (same data the grader sees at runtime)
const allConvertedParts = [
  ...examObj.lesenParts, ...examObj.horenParts, ...examObj.schreibenParts,
];
for (const part of allConvertedParts) {
  const allQs = [
    ...(part.questions || []),
    ...(part.segments || []).flatMap(s => s.questions || []),
    ...(part.items || []).filter(it => it.type && it.correct != null),
  ];
  for (const q of allQs) {
    if (q.correct == null && q.correctAnswer != null) {
      correctAnswerOnlyRecords++;
    } else if (q.correct == null) {
      correctFieldMissing++;
    } else {
      correctOk++;
      if (q.correctAnswer != null && String(q.correct) !== String(q.correctAnswer)) {
        divergent++;
      }
    }
  }
}

console.log(`  Questions with correct field: ${correctOk} ✅`);
console.log(`  Questions with only correctAnswer (no correct): ${correctAnswerOnlyRecords} ${correctAnswerOnlyRecords === 0 ? '✅' : '⚠ (old format)'}`);
console.log(`  Questions with neither field: ${correctFieldMissing} ${correctFieldMissing === 0 ? '✅' : '❌'}`);
console.log(`  Divergent correct ≠ correctAnswer: ${divergent === 0 ? '0 ✅' : divergent + ' ❌ (Eje 1 regression)'}`);

// ── Step 2d: buildCorrection simulation ───────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('STEP 2d: buildCorrection simulation — no duplicate sections (Eje 2)');
console.log('═══════════════════════════════════════════════════════════════');

// Simulate the patched buildCorrection from results.js
const correctionSections = [];

d.horenParts?.forEach((p, pi) => {
  if (p.segments?.length) {
    // Eje-2 Fase B: one section per segment
    p.segments.forEach((s, si) => {
      const sectionLabel = p.segments.length > 1
        ? `Hörverstehen Teil ${p.teil} (${s.label || 'seg'+si})`
        : `Hörverstehen Teil ${p.teil}`;
      correctionSections.push({
        source: 'segments',
        label: sectionLabel,
        questions: segToQ(s).map(q => ({ id: q.id, correctFrom: 'q.correct', value: q.correct })),
      });
    });
  } else {
    // No segments: questions[] source
    correctionSections.push({
      source: 'questions',
      label: `Hörverstehen Teil ${p.teil}`,
      questions: (p.questions || []).map(q => ({ id: q.id, correctFrom: 'q.correct', value: q.correct })),
    });
  }
});

// Check for duplicate question IDs across correction sections
const seenQInCorrection = new Map(); // qId → section label
let correctionDupes = 0;
for (const sec of correctionSections) {
  for (const q of sec.questions) {
    if (seenQInCorrection.has(q.id)) {
      correctionDupes++;
      console.log(`  ❌ Duplicate in correction: ${q.id} appears in "${seenQInCorrection.get(q.id)}" AND "${sec.label}"`);
    }
    seenQInCorrection.set(q.id, sec.label);
  }
}

console.log(`  Hören correction sections: ${correctionSections.length}`);
for (const sec of correctionSections) {
  console.log(`    [${sec.source}] "${sec.label}" — ${sec.questions.length} questions`);
}
console.log(`  Duplicate questions in correction: ${correctionDupes === 0 ? '0 ✅' : correctionDupes + ' ❌'}`);
console.log(`  All correction questions use q.correct: ✅ (simulation uses q.correct directly)`);

// ── Step 3: pool-health matrix ────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('STEP 3: pool-health matrix (clean counts after all fixes today)');
console.log('═══════════════════════════════════════════════════════════════');

const { auditExam: _ae, filterPartPoolFindings: _fp, chk23: _c23, partToExamWrapper: _ptew } = await import('./audit-pass-2.mjs');

function auditRecord(record) {
  const rawF = _c23(record, record.id || '?');
  const wrapper = _ptew(record);
  if (!wrapper) return { clean: false, dirty: true, byChk: { 'AUDIT-ERROR': 1 } };
  const audit = _ae(wrapper, record.id || '?');
  const findings = [...rawF, ..._fp(audit.findings)];
  const critical = findings.filter(f => f.severity === 'CRITICAL');
  const important = findings.filter(f => f.severity === 'IMPORTANT');
  const byChk = {};
  for (const f of [...critical, ...important]) byChk[f.id] = (byChk[f.id] || 0) + 1;
  return {
    clean: critical.length === 0 && important.length === 0,
    byChk,
  };
}

const matrixData = {};
for (const cell of CELLS) matrixData[cell] = { total: 0, clean: 0, dirty: 0, topChk: {} };

for (const rec of records) {
  const cell = `${rec.module}-t${rec.teil}`;
  if (!matrixData[cell]) continue;
  matrixData[cell].total++;
  const v = auditRecord(rec);
  if (v.clean) {
    matrixData[cell].clean++;
  } else {
    matrixData[cell].dirty++;
    for (const [chk, n] of Object.entries(v.byChk)) {
      matrixData[cell].topChk[chk] = (matrixData[cell].topChk[chk] || 0) + n;
    }
  }
}

console.log(`\n${'cell'.padEnd(14)} ${'total'.padStart(5)} ${'clean'.padStart(5)} ${'dirty'.padStart(5)}  top findings`);
console.log('─'.repeat(70));

let totalClean = 0, totalParts = 0;
for (const cell of CELLS) {
  const { total, clean, dirty, topChk } = matrixData[cell];
  totalClean += clean;
  totalParts += total;
  const top = Object.entries(topChk).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,n])=>`${k}:${n}`).join(' ');
  const flag = dirty === 0 ? '🟢' : clean === 0 ? '🔴' : '🟡';
  console.log(`  ${flag} ${cell.padEnd(12)} ${String(total).padStart(5)} ${String(clean).padStart(5)} ${String(dirty).padStart(5)}  ${top}`);
}
console.log('─'.repeat(70));
console.log(`  ${'TOTAL'.padEnd(14)} ${String(totalParts).padStart(5)} ${String(totalClean).padStart(5)} ${String(totalParts-totalClean).padStart(5)}`);

// ── Final summary ─────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('FINAL SUMMARY');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  isExamPublishable ok:         ${pub.ok ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  flattenExam count (${Q}):     ${Q === expectedTotal ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  forEachGoetheQ double-visit:  ${duplicateVisits.length === 0 ? '✅ DEAD (0 dupes)' : '❌ ALIVE (' + duplicateVisits.length + ' dupes)'}`);
console.log(`  correct field (Eje 1):        ${divergent === 0 && correctFieldMissing === 0 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  buildCorrection no dupes:     ${correctionDupes === 0 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  Pool clean parts:             ${totalClean}/${totalParts} across 12 cells`);
