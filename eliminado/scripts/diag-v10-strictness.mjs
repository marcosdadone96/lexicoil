/**
 * diag-v10-strictness.mjs — V-10 Policy audit: what each gate blocks.
 *
 * Scans the pool and reports:
 *   1. For each IMPORTANT check advisory in publication but blocking in ingestion:
 *      → how many records have it, and what % of pool
 *   2. A summary table of gate differences
 *
 * Run: node scripts/diag-v10-strictness.mjs
 * Read-only. No LLM calls. No writes.
 */

import { readFileSync } from 'fs';
import { auditExam } from './audit-pass-2.mjs';

// GATE_BLOCK_CHECKS (copy from source — these IMPORTANT checks also block publication)
const GATE_BLOCK_CHECKS = new Set(['CHK-17', 'CHK-21', 'CHK-22']);

// Advisory IMPORTANT checks (block ingestion but NOT publication)
const ADVISORY_CHECKS = [
  'CHK-2',   // IMPORTANT variants: options count, prefix format, RF options
  'CHK-4',   // Balance MC >65% (IMPORTANT), RF 15-85%
  'CHK-5',   // Duplicate passage cross-file
  'CHK-6',   // C1/C2 vocab, grammar errors
  'CHK-7',   // T4: non-affirmative pattern, signText coherence, Ja/Nein balance
  'CHK-10',  // Absolute words in RF
  'CHK-12',  // RF block imbalance >70%
  'CHK-13',  // MC letter distribution (batch-level only)
  'CHK-14',  // Lowercase nouns in German text
  'CHK-15',  // Word count out of range
  'CHK-16',  // Word-matching (verbatim copy from passage)
  'CHK-18',  // Explanation quality: short, trivial, non-German, circular
  'CHK-19',  // Consecutive answer runs ≥4
  'CHK-20',  // H1 segment structure (1RF+1MC per segment)
  // CHK-17, CHK-21 are in GATE_BLOCK_CHECKS → block BOTH gates (excluded from advisory list)
  // CHK-23 is CRITICAL → blocks both (excluded)
];

const MODULE_PARTS_KEY = {
  lesen: 'lesenParts',
  horen: 'horenParts',
  schreiben: 'schreibenParts',
  sprechen: 'sprechenParts',
};

function partRecordToExamPart(record) {
  const module = String(record.module || '').toLowerCase();
  const teil = record.teil ?? 1;
  const part = {
    teil,
    module,
    passages: record.passages || (record.passage ? [record.passage] : []),
    questions: record.questions || [],
    segments: record.segments || [],
    transcript: record.transcript || '',
    text: record.text || '',
    items: record.items || [],
    ads: record.ads,
  };
  return part;
}

function partToExamWrapper(record) {
  const module = String(record.module || '').toLowerCase();
  const partsKey = MODULE_PARTS_KEY[module];
  if (!partsKey) return null;
  const part = partRecordToExamPart(record);
  return { exam: { [partsKey]: [part] } };
}

function getFindings(record) {
  const wrapper = partToExamWrapper(record);
  if (!wrapper) return [];
  const audit = auditExam(wrapper, record.id || 'unknown');
  // Filter: exclude CHK-3 "Teil ausente" and INFO, keep CRITICAL + IMPORTANT
  return audit.findings.filter(f => {
    if (f.severity === 'INFO') return false;
    if (f.id === 'CHK-3' && String(f.message || '').includes('Teil ausente')) return false;
    return f.severity === 'CRITICAL' || f.severity === 'IMPORTANT';
  });
}

// Load pool
const pool = JSON.parse(readFileSync('library/reusable-seed/de_B1.json', 'utf8'));
const records = Array.isArray(pool) ? pool : (pool.records || pool.parts || []);
const TOTAL = records.length;

console.log(`Pool: ${TOTAL} records\n`);

// ── 1. Gate comparison table ──────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════════');
console.log('GATE COMPARISON TABLE');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');
console.log('isPartPoolReady (POOL-2 / ingestión):');
console.log('  Blocks: ALL findings with severity CRITICAL or IMPORTANT');
console.log('  Exceptions: CHK-3 "Teil ausente" (filtered for single-part), INFO severity');
console.log('  Result: strictest gate — 0 CRITICAL, 0 IMPORTANT required');
console.log('');
console.log('isExamPublishable (GATE-1 / publicación):');
console.log('  Blocks: ALL CRITICAL  +  only GATE_BLOCK_CHECKS from IMPORTANT set');
console.log(`  GATE_BLOCK_CHECKS = {${[...GATE_BLOCK_CHECKS].join(', ')}}`);
console.log('  Advisory (logs but does NOT block): all other IMPORTANT findings');
console.log('  Result: 0 CRITICAL + 0 {CHK-17,CHK-21,CHK-22} required');
console.log('');
console.log('CLI (audit-pass-2.mjs direct):');
console.log('  Blocks (exit 1): worst severity >= --fail-on (default: CRITICAL only)');
console.log('  --fail-on=IMPORTANT → matches isExamPublishable partial strictness');
console.log('  --fail-on=CRITICAL  → default, lenient (same as publication for non-structural)');
console.log('');
console.log('IMPORTANT checks advisory in publication, blocking in ingestion:');
const advisoryList = ADVISORY_CHECKS.filter(c => !GATE_BLOCK_CHECKS.has(c));
console.log(`  ${advisoryList.join(', ')}`);
console.log('');

// ── 2. Pool scan ──────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════════');
console.log('POOL IMPACT: records affected by each advisory check');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('(If publication gate were tightened to match ingestion, these records');
console.log(' would become unpublishable until regenerated / fixed.)');
console.log('');

// Scan all records
const findingsByCheck = {};
const recordsByCheck = {}; // chkId → Set of record IDs
let totalScanned = 0;
let totalErrors = 0;

for (const id of ADVISORY_CHECKS) {
  findingsByCheck[id] = 0;
  recordsByCheck[id] = new Set();
}
// Also track CRITICAL and GATE_BLOCK_CHECKS for reference
const criticalRecords = new Set();
const gateBlockRecords = new Set();

for (const record of records) {
  totalScanned++;
  let findings;
  try {
    findings = getFindings(record);
  } catch (e) {
    totalErrors++;
    continue;
  }

  const hasCritical = findings.some(f => f.severity === 'CRITICAL');
  if (hasCritical) criticalRecords.add(record.id);

  for (const f of findings) {
    if (f.severity === 'CRITICAL') continue; // already counted above
    if (GATE_BLOCK_CHECKS.has(f.id)) {
      gateBlockRecords.add(record.id);
    }
    if (ADVISORY_CHECKS.includes(f.id)) {
      findingsByCheck[f.id] = (findingsByCheck[f.id] || 0) + 1;
      recordsByCheck[f.id].add(record.id);
    }
  }
}

// Summary by module+teil for advisory checks
const checkModuleBreakdown = {};
for (const id of ADVISORY_CHECKS) {
  checkModuleBreakdown[id] = {};
}

for (const record of records) {
  let findings;
  try {
    findings = getFindings(record);
  } catch (e) {
    continue;
  }
  for (const f of findings) {
    if (!ADVISORY_CHECKS.includes(f.id)) continue;
    const key = `${record.module}-t${record.teil}`;
    checkModuleBreakdown[f.id][key] = (checkModuleBreakdown[f.id][key] || 0) + 1;
  }
}

console.log(`Scanned ${totalScanned} records (${totalErrors} errors skipped)\n`);
console.log(`Currently BLOCKED by CRITICAL:                  ${criticalRecords.size}/${TOTAL} records (${pct(criticalRecords.size, TOTAL)}%)`);
console.log(`Currently BLOCKED by GATE_BLOCK_CHECKS (pub.):  ${gateBlockRecords.size}/${TOTAL} records (${pct(gateBlockRecords.size, TOTAL)}%)`);
console.log('');

// Advisory check impact table
console.log(`${'CHK'.padEnd(8)} ${'Records'.padEnd(10)} ${'Findings'.padEnd(10)} Module breakdown`);
console.log('─'.repeat(72));

// Sort by record count descending
const sorted = ADVISORY_CHECKS
  .map(id => ({ id, recs: recordsByCheck[id].size, findings: findingsByCheck[id] }))
  .sort((a, b) => b.recs - a.recs);

for (const { id, recs, findings } of sorted) {
  if (recs === 0) {
    console.log(`${id.padEnd(8)} ${'0'.padEnd(10)} ${'0'.padEnd(10)} (none)`);
    continue;
  }
  const breakdown = Object.entries(checkModuleBreakdown[id])
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}×${n}`)
    .join(' ');
  console.log(`${id.padEnd(8)} ${String(recs).padEnd(10)} ${String(findings).padEnd(10)} ${breakdown}`);
}

// ── 3. Would-be-blocked count ─────────────────────────────────────────────────
const advisoryUnionRecords = new Set();
for (const id of ADVISORY_CHECKS) {
  for (const r of recordsByCheck[id]) advisoryUnionRecords.add(r);
}
console.log('');
console.log(`Records with ANY advisory IMPORTANT check: ${advisoryUnionRecords.size}/${TOTAL} (${pct(advisoryUnionRecords.size, TOTAL)}%)`);
console.log(`→ If publication were tightened to 0-IMPORTANT, these ${advisoryUnionRecords.size} records`);
console.log(`  would need to be excluded from exam assembly until regenerated.`);
console.log('');

// Cells breakdown
const cellMap = {};
for (const r of records) {
  const key = `${r.module}-t${r.teil}`;
  if (!cellMap[key]) cellMap[key] = { total: 0, affected: 0 };
  cellMap[key].total++;
  if (advisoryUnionRecords.has(r.id)) cellMap[key].affected++;
}

console.log('By cell (affected / total):');
for (const [k, v] of Object.entries(cellMap).sort()) {
  const clean = v.total - v.affected;
  console.log(`  ${k.padEnd(16)} ${v.affected}/${v.total} affected  (${clean} clean)`);
}

// ── 4. For-each check: legitimate advisory reason analysis ────────────────────
console.log('');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('LEGITIMACY ANALYSIS: is the advisory status justified?');
console.log('═══════════════════════════════════════════════════════════════════');

const ANALYSIS = {
  'CHK-2': {
    desc: 'IMPORTANT variants: options count, prefix format, RF options array',
    note: 'CRITICAL variants (null correct, wrong format) DO block publication. Only IMPORTANT subvariant (minor format) is advisory. Arguably these format nitpicks are safe to serve.',
    verdict: 'PARTIAL CONSISTENCY — CRITICAL branch correctly blocks; IMPORTANT subvariants are genuinely minor.',
  },
  'CHK-4': {
    desc: 'MC balance >65% (IMPORTANT), RF balance 15-85%; ≥75% with n≥5 is CRITICAL',
    note: 'CRITICAL branch (≥75%) blocks both gates. IMPORTANT branch (65-75%) is advisory in publication. An imbalanced exam is guessable but arguably still valid for a single serving.',
    verdict: 'LEGITIMATE — CRITICAL threshold already protects against blatant cheating. IMPORTANT range is debatable.',
  },
  'CHK-5': {
    desc: 'Duplicate passage across files (cross-file hash match)',
    note: 'Batch-level check. Pool records are individual — cross-file duplicates can only be detected when scanning multiple files. isPartPoolReady scans a single record; CHK-5 fires against batch directories.',
    verdict: 'STRUCTURAL LIMITATION — CHK-5 cannot fire meaningfully on single pool records. Advisory gap is a non-issue.',
  },
  'CHK-6': {
    desc: 'C1/C2 vocabulary or grammar errors in passages',
    note: 'Pre-existing content in the pool was generated before CHK-6 existed. Applying it retroactively would block many existing records that are semantically fine and are already being served.',
    verdict: 'HISTORICAL INCONSISTENCY — new content is blocked, existing content is not. Grandfathering is intentional.',
  },
  'CHK-7': {
    desc: 'Lesen T4: non-affirmative pattern, signText/correct coherence, Ja/Nein balance',
    note: 'The coherence sub-check (signText stance vs correct) is heuristic and has false positives. The comment in source says "IMPORTANT, heuristic". Blocking publication on a heuristic is risky.',
    verdict: 'LEGITIMATE for heuristic sub-checks — SEM-1 covers correctness semantically with higher precision.',
  },
  'CHK-10': {
    desc: 'Absolute words in RF items (über-use, or correlates perfectly with Falsch)',
    note: 'Advisory because it catches stylistic patterns that are common in legitimate items (e.g. one "nie" in an item is MINOR/ok, over-use is IMPORTANT). Single occurrence is MINOR, not IMPORTANT.',
    verdict: 'LEGITIMATE — CHK-10 IMPORTANT fires only on systematic over-use; a valid teaching item can have "nie".',
  },
  'CHK-12': {
    desc: 'RF block imbalance >70% same answer',
    note: 'Similar to CHK-4 for RF. A 70% threshold is already set high. Blocking publication means many legitimate exams would be blocked for a ratio that is statistically acceptable.',
    verdict: 'LEGITIMATE advisory — same reasoning as CHK-4 IMPORTANT branch.',
  },
  'CHK-13': {
    desc: 'MC letter distribution per batch (batch-level check)',
    note: 'Fires on the BATCH level (all questions in a file). Pool records are individual parts — a single Lesen T2 part with 6 MCQ might legitimately have letter distribution skew. CHK-4 covers per-Teil balance at publication.',
    verdict: 'STRUCTURAL LIMITATION — CHK-13 is designed for batch QA, not single-record pool gates. Advisory is correct.',
  },
  'CHK-14': {
    desc: 'Lowercase nouns in German text',
    note: 'Grammar error. Should be fixed before serving, but may be in legacy content that is otherwise correct. The renderer serves the text as-is; the student sees the typo.',
    verdict: 'INCONSISTENCY — a grammar error in the exam text is a quality defect. However, false-positive rate is non-zero (compound words, code-switching). Needs calibration before making it a hard gate.',
  },
  'CHK-15': {
    desc: 'Passage word count out of blueprint range',
    note: 'Official Goethe blueprint specifies word count ranges. Outside range = deviation from official format. However, +/- 10-15% is accepted in practice.',
    verdict: 'LEGITIMATE — the check already has min/max; texts slightly outside range are serviceable. Hard-blocking is too strict.',
  },
  'CHK-16': {
    desc: 'Word-matching: verbatim 4+ word copy from passage in question',
    note: 'Makes items trivially resolvable without reading (just scan for matching phrase). This is a real pedagogy flaw. However, false positives exist when the term is a proper noun or technical term.',
    verdict: 'INCONSISTENCY — word-matching is a real defect that benefits from blocking. False-positive risk is the main concern.',
  },
  'CHK-18': {
    desc: 'Explanation quality: short (<10 words), trivial, non-German, circular',
    note: 'Explanations are shown in the correction screen. Short/trivial/circular ones degrade UX. The source comment confirms this as the main advisory in GATE_BLOCK_CHECKS comment block.',
    verdict: 'INCONSISTENCY — explanation quality directly affects what the student sees post-exam. Should be blocking.',
  },
  'CHK-19': {
    desc: 'Consecutive answer runs ≥4 same answer',
    note: 'A run of 4 identical answers is predictable but not outright wrong. Statistically occurs in legitimate exams. Advisory is appropriate for a probability-based concern.',
    verdict: 'LEGITIMATE advisory — 4-run is at the edge; 5+ would be more clearly problematic.',
  },
  'CHK-20': {
    desc: 'Hören T1 segment structure: each segment must have exactly 1RF+1MC',
    note: 'This IS the structural invariant of H1. Violating it means the exam has wrong question distribution. CHK-3 catches total count; CHK-20 catches per-segment distribution. Both are structural.',
    verdict: 'INCONSISTENCY — CHK-20 is structural (same category as CHK-17/CHK-21). Should be in GATE_BLOCK_CHECKS.',
  },
};

for (const { id, recs } of sorted) {
  const a = ANALYSIS[id];
  if (!a) continue;
  console.log('');
  console.log(`${id} — ${a.desc}`);
  console.log(`  Impact:  ${recs}/${TOTAL} records`);
  console.log(`  Context: ${a.note}`);
  console.log(`  Verdict: ${a.verdict}`);
}

function pct(n, total) { return total ? Math.round(n / total * 100) : 0; }
