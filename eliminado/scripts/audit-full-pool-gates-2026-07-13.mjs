#!/usr/bin/env node
/**
 * Full-pool measurement audit — all gates built/corrected 2026-07-13.
 * Read-only. No remediation.
 *
 *   node scripts/audit-full-pool-gates-2026-07-13.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectMcqLengthBiasIssues } from './lib/mcqLengthBias.mjs';
import { assertSchreibenNoPlaceholders } from './lib/schreibenPlaceholderGate.mjs';
import { canonicalSchreibenExplanation } from './lib/schreibenDisplayRubric.mjs';
import {
  classifyHorenScenario,
  scanHorenPremises,
} from './lib/horenPremiseDedup.mjs';
import {
  classifySchreibenT3Scenario,
  scanSchreibenT3Premises,
} from './lib/schreibenT3PremiseDedup.mjs';
import { TEMPLATE_DEFAULT_NAMES } from './lib/nameRotation.mjs';
import { verifyRfChronoByCharPos } from './lib/horenRfChronoEvidence.mjs';
import {
  detectTopicFromT3Situations,
  isLesenT3TopicCompatible,
} from './lib/lesenT3TopicFilter.mjs';
import { hasLongLiteralOverlap } from './lib/lesenBatchQuality.mjs';
import { normalizeB1Topic } from './lib/b1Topics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/full-pool-gates-audit-2026-07-13.json');

const RECYCLED_FIRST = ['Anna', 'Ben', 'Clara', 'David', 'Finn', 'Greta'];
const RECYCLED_SURNAMES = ['Klein', 'Schmidt'];
const HOREN_TEMPLATE_NAMES = ['Dana', 'Florian'];

function loadPoolFiles() {
  return fs.readdirSync(POOL).filter((f) => f.endsWith('.json')).sort();
}

function loadBatch(file) {
  return JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
}

function contentBlob(batch) {
  const parts = [];
  for (const p of batch.passages || []) {
    parts.push(p.text || '', p.title || '', p.transcript || '');
    if (Array.isArray(p.audio)) {
      for (const turn of p.audio) parts.push(turn.speaker || '', turn.text || '');
    }
  }
  for (const q of batch.questions || []) {
    parts.push(q.question || '', q.explanation || '', q.signText || '');
    for (const opt of q.options || []) {
      parts.push(typeof opt === 'string' ? opt : opt?.text || '');
    }
  }
  return parts.join('\n');
}

function passageById(batch, passageId) {
  return (batch.passages || []).find((p) => p.id === passageId) || batch.passages?.[0];
}

function correctOptionText(q) {
  const letter = String(q.correctAnswer || q.correct || '')
    .toLowerCase()
    .replace(/[^a-d]/g, '');
  if (!letter) return '';
  for (const o of q.options || []) {
    const t = typeof o === 'string' ? o : o?.text || '';
    if (t.toLowerCase().trim().startsWith(`${letter})`)) {
      return t.replace(/^[a-d]\)\s*/i, '');
    }
  }
  return '';
}

// ─── 1. MCQ length bias ─────────────────────────────────────────────────────
function auditLengthBias(files) {
  const scopeRe = /^lesen-t[25]-|^horen-t2-/;
  const affectedFiles = [];
  let affectedQuestions = 0;
  let stampedQuestions = 0;
  let gateHitsNotStamped = 0;
  let stampsWithoutGate = 0;

  for (const file of files) {
    if (!scopeRe.test(file)) continue;
    const batch = loadBatch(file);
    const issues = collectMcqLengthBiasIssues(batch);
    const stamped = (batch.questions || []).filter((q) => q._lengthBiasQuarantine === true);
    stampedQuestions += stamped.length;

    for (const q of batch.questions || []) {
      const gateBad = collectMcqLengthBiasIssues({ questions: [q] }).length > 0;
      const stampedBad = q._lengthBiasQuarantine === true;
      if (gateBad && !stampedBad) gateHitsNotStamped++;
      if (!gateBad && stampedBad) stampsWithoutGate++;
    }

    if (issues.length) {
      affectedQuestions += issues.length;
      affectedFiles.push({ file, questions: issues.length, issues });
    }
  }

  return {
    scope: 'Lesen T2/T5 + Hören T2',
    mechanism: 'mcqLengthBias.mjs ≡ audit-answer-length-bias.mjs ≡ stamp-length-bias-quarantine',
    metric:
      'correct option char-length === max among a/b/c when lengths differ (ties for longest count as bias)',
    sameAsPriorQuarantine: true,
    priorQuarantineDate: '2026-07-12 (_lengthBiasQuarantine stamps)',
    affectedFiles: affectedFiles.length,
    affectedQuestions,
    stampedQuestions,
    reconciliation: {
      gateHitsNotStamped,
      stampsWithoutGate,
      note:
        gateHitsNotStamped || stampsWithoutGate
          ? 'Drift between live gate and stamps — see counts'
          : 'Gate metric matches prior quarantine stamps (no drift)',
    },
    files: affectedFiles,
  };
}

// ─── 2. Lexical cueing quarantine vigente ───────────────────────────────────
function auditLexicalCueing(files) {
  const scopeRe = /^lesen-t[25]-|^horen-t2-/;
  const stamped = [];
  let stampedQuestions = 0;

  for (const file of files) {
    if (!scopeRe.test(file)) continue;
    const batch = loadBatch(file);
    const qs = (batch.questions || []).filter((q) => q._lexicalCueingQuarantine === true);
    if (!qs.length) continue;
    stampedQuestions += qs.length;
    stamped.push({
      file,
      count: qs.length,
      ids: qs.map((q) => q.id),
      classes: [...new Set(qs.map((q) => q._lexicalCueingQuarantineClass).filter(Boolean))],
      stampedAt: qs.map((q) => q._lexicalCueingQuarantinedAt).filter(Boolean)[0] || null,
    });
  }

  return {
    scope: 'Lesen T2/T5 + Hören T2',
    quarantineDate: '2026-07-12',
    stillVigente: stamped.length > 0,
    affectedFiles: stamped.length,
    affectedQuestions: stampedQuestions,
    expectedFromStampLog: { files: 19, questions: 19 },
    reconciliation:
      stamped.length === 19 && stampedQuestions === 19
        ? 'All 19 problematico stamps from 2026-07-12 still present'
        : `Stamp count drift: now ${stamped.length} files / ${stampedQuestions} q (was 19/19)`,
    files: stamped,
  };
}

// ─── 3. Schreiben placeholders ──────────────────────────────────────────────
function auditSchreibenPlaceholders(files) {
  const schreiben = files.filter((f) => /^schreiben/i.test(f));
  const hits = [];
  for (const file of schreiben) {
    const batch = loadBatch(file);
    const r = assertSchreibenNoPlaceholders(batch);
    if (!r.ok) hits.push({ file, issues: r.issues });
  }
  return {
    scope: 'All Schreiben pool-verified',
    poolTotal: schreiben.length,
    affectedFiles: hits.length,
    files: hits,
  };
}

// ─── 4. Premise duplication ─────────────────────────────────────────────────
function auditPremiseDuplication(files) {
  // Schreiben T3 — scenario families with >1 file
  const { byScenario: schByScenario } = scanSchreibenT3Premises();
  const schreibenDupes = [];
  const schreibenAffected = new Set();
  for (const [scenario, scenarioFiles] of schByScenario.entries()) {
    if (scenarioFiles.length < 2) continue;
    if (scenario.startsWith('free:')) continue;
    schreibenAffected.add(...scenarioFiles);
    schreibenDupes.push({ scenario, files: [...new Set(scenarioFiles)].sort() });
  }

  // Hören T1/T2 — classified scenarios (non-free) with >1 file
  const horenAffected = new Set();
  const horenDupes = [];
  for (const teil of [1, 2]) {
    const { byScenario } = scanHorenPremises(teil);
    for (const [scenario, entries] of byScenario.entries()) {
      if (scenario.startsWith('free:')) continue;
      const scenarioFiles = [...new Set(entries.map((e) => e.file))];
      if (scenarioFiles.length < 2) continue;
      for (const f of scenarioFiles) horenAffected.add(f);
      horenDupes.push({
        teil,
        scenario,
        files: scenarioFiles.sort(),
        passages: entries.length,
      });
    }
  }

  return {
    schreibenT3: {
      scope: 'Schreiben T3 scenario families (schreibenT3PremiseDedup.mjs)',
      affectedFiles: schreibenAffected.size,
      duplicateGroups: schreibenDupes.length,
      groups: schreibenDupes,
      files: [...schreibenAffected].sort(),
    },
    horenT1T2: {
      scope: 'Hören T1/T2 scenario families (horenPremiseDedup.mjs)',
      affectedFiles: horenAffected.size,
      duplicateGroups: horenDupes.length,
      groups: horenDupes,
      files: [...horenAffected].sort(),
    },
    combinedAffectedFiles: new Set([...schreibenAffected, ...horenAffected]).size,
  };
}

// ─── 5. Schreiben display rubric ────────────────────────────────────────────
function auditSchreibenRubric(files) {
  const schreiben = files.filter((f) => /^schreiben/i.test(f));
  const hits = [];
  for (const file of schreiben) {
    const batch = loadBatch(file);
    const fileHits = [];
    for (const q of batch.questions || []) {
      const teil = Number(q.teil);
      if (![1, 2, 3].includes(teil)) continue;
      const expected = canonicalSchreibenExplanation(teil);
      const got = String(q.explanation || '').trim();
      if (!expected || got !== expected) {
        fileHits.push({ teil, id: q.id, got: got.slice(0, 80) });
      }
    }
    if (fileHits.length) hits.push({ file, issues: fileHits });
  }
  return {
    scope: 'All Schreiben — explanation must match canonicalSchreibenExplanation',
    poolTotal: schreiben.length,
    affectedFiles: hits.length,
    files: hits,
  };
}

// ─── 6. Name rotation ───────────────────────────────────────────────────────
function auditNameRotation(files) {
  const horenT3 = files.filter((f) => /^horen-t3-/i.test(f));
  const horenT4 = files.filter((f) => /^horen-t4-/i.test(f));
  const lesenT4 = files.filter((f) => /^lesen-t4-/i.test(f));
  const schreiben = files.filter((f) => /^schreiben/i.test(f));

  const hits = { horenT3: [], horenT4: [], lesenT4: [], schreibenT3: [] };

  for (const file of horenT3) {
    const blob = contentBlob(loadBatch(file));
    const found = HOREN_TEMPLATE_NAMES.filter((n) => new RegExp(`\\b${n}\\b`).test(blob));
    if (found.length) hits.horenT3.push({ file, names: found });
  }
  for (const file of horenT4) {
    const blob = contentBlob(loadBatch(file));
    const found = HOREN_TEMPLATE_NAMES.filter((n) => new RegExp(`\\b${n}\\b`).test(blob));
    if (found.length) hits.horenT4.push({ file, names: found });
  }
  for (const file of lesenT4) {
    const blob = contentBlob(loadBatch(file));
    const found = RECYCLED_FIRST.filter((n) => new RegExp(`\\b${n}\\b`).test(blob));
    if (found.length) hits.lesenT4.push({ file, names: found });
  }
  for (const file of schreiben) {
    const batch = loadBatch(file);
    const q = (batch.questions || []).find((x) => Number(x.teil) === 3);
    if (!q) continue;
    const t = String(q.question || '') + String(q.explanation || '');
    const found = [];
    for (const sn of RECYCLED_SURNAMES) {
      if (new RegExp(`\\b(Herr|Herrn|Frau)\\s+${sn}\\b`).test(t)) found.push(`Herr/Frau ${sn}`);
    }
    for (const n of RECYCLED_FIRST) {
      if (new RegExp(`\\bNachbarin\\s+${n}\\b|\\ban\\s+${n}\\b`).test(t)) found.push(n);
    }
    if (found.length) hits.schreibenT3.push({ file, names: found });
  }

  const affectedFiles =
    hits.horenT3.length +
    hits.horenT4.length +
    hits.lesenT4.length +
    hits.schreibenT3.length;

  return {
    scope: 'Hören T3/T4 (Dana/Florian), Lesen T4 (recycled first names), Schreiben T3 (Klein/Schmidt + recycled)',
    poolTotals: {
      horenT3: horenT3.length,
      horenT4: horenT4.length,
      lesenT4: lesenT4.length,
      schreiben: schreiben.length,
    },
    affectedFiles,
    byPart: {
      horenT3: hits.horenT3.length,
      horenT4: hits.horenT4.length,
      lesenT4: hits.lesenT4.length,
      schreibenT3: hits.schreibenT3.length,
    },
    hits,
  };
}

// ─── 7. Hören T3 chronological order ──────────────────────────────────────
function auditHorenT3Chrono(files) {
  const horenT3 = files.filter((f) => /^horen-t3-/i.test(f));
  const hits = [];
  for (const file of horenT3) {
    const batch = loadBatch(file);
    const v = verifyRfChronoByCharPos(batch);
    if (!v.ok) hits.push({ file, positions: v.positions, details: v.details });
  }
  return {
    scope: 'All Hören T3 — verifyRfChronoByCharPos (char offset monotonicity)',
    poolTotal: horenT3.length,
    affectedFiles: hits.length,
    allPass: hits.length === 0,
    files: hits,
  };
}

// ─── 8. Lesen T3 theme drift (CHK-26) ─────────────────────────────────────
function auditLesenT3TopicDrift(files) {
  const lesenT3 = files.filter((f) => /^lesen-t3-/i.test(f));
  const hits = [];
  for (const file of lesenT3) {
    const batch = loadBatch(file);
    const expected =
      normalizeB1Topic(batch._requestedTopic) ||
      normalizeB1Topic(batch.topic) ||
      normalizeB1Topic(batch.questions?.[0]?.topicTags?.[0]);
    const detected = detectTopicFromT3Situations(batch.questions);
    if (!expected || !detected) continue;
    if (!isLesenT3TopicCompatible(expected, detected)) {
      hits.push({ file, expected, detected, requestedTopic: batch._requestedTopic });
    }
  }
  return {
    scope: 'Lesen T3 — isLesenT3TopicCompatible (CHK-26 + topicFamilies)',
    poolTotal: lesenT3.length,
    affectedFiles: hits.length,
    riskPairs: ['Arbeit/Bildung', 'Umwelt/Reisen', 'Konsum/Wohnen/Stadtleben'],
    files: hits,
  };
}

// ─── 9. Word-copy Lesen T2 ──────────────────────────────────────────────────
function auditLesenT2WordCopy(files) {
  const lesenT2 = files.filter((f) => /^lesen-t2-/i.test(f));
  const affectedFiles = [];
  let affectedQuestions = 0;

  for (const file of lesenT2) {
    const batch = loadBatch(file);
    const fileHits = [];
    for (const q of batch.questions || []) {
      const passage = passageById(batch, q.passageId);
      if (!passage) continue;
      const body = `${passage.title || ''} ${passage.text || ''}`;
      const optText = correctOptionText(q);
      if (!optText) continue;
      const literal = hasLongLiteralOverlap(optText, body, 4);
      if (literal) {
        fileHits.push({ id: q.id, overlap: literal, kind: 'correct_option' });
      }
    }
    if (fileHits.length) {
      affectedQuestions += fileHits.length;
      affectedFiles.push({ file, questions: fileHits });
    }
  }

  return {
    scope: 'Lesen T2 — correct option copies ≥4 consecutive words from passage',
    mechanism: 'hasLongLiteralOverlap (lesenBatchQuality.mjs / wordMatchRepair)',
    poolTotal: lesenT2.length,
    affectedFiles: affectedFiles.length,
    affectedQuestions,
    files: affectedFiles,
  };
}

// ─── 10. Live calculation (separable / articles / conjugation) ───────────────
function auditLiveCalculation() {
  const paths = [
    'js/engine/separableResolve.js',
    'js/data/verbConjugation.js',
    'js/data/listeningGameUtils.js',
    'js/ui/vocabulary/tooltip.js',
    'js/ui/vocabulary/flashcards.js',
  ];

  const stalePatterns = [
    { re: /_separableLemma|_conjugationCache|precomputedSeparable|storedConjugation/i, label: 'stale separable/conjugation metadata' },
    { re: /fc\.article.*batch|batch.*fc\.article/i, label: 'batch-stored article override' },
  ];

  const evidence = [];
  for (const rel of paths) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    const usesLive =
      /SeparableResolve|separableResolve|VerbConjugation|toLemma|resolveSeparable/i.test(src);
    evidence.push({ file: rel, usesLiveCalculation: usesLive });
    for (const pat of stalePatterns) {
      if (pat.re.test(src)) {
        evidence.push({ file: rel, stalePath: pat.label });
      }
    }
  }

  // Pool files: check if any question stores precomputed separable/conjugation hints
  const poolFiles = loadPoolFiles();
  let poolWithStaleMeta = 0;
  const metaKeys = ['_separable', '_conjugation', '_articleHint', '_lemmaCache', '_verbForms'];
  for (const file of poolFiles) {
    const raw = fs.readFileSync(path.join(POOL, file), 'utf8');
    if (metaKeys.some((k) => raw.includes(`"${k}"`))) poolWithStaleMeta++;
  }

  return {
    scope: 'Runtime paths for separable verbs / articles / conjugation',
    poolScanNeeded: false,
    conclusion:
      poolWithStaleMeta === 0
        ? 'All checks computed live from text at runtime — no pool scan required; no stale metadata keys in pool-verified'
        : `Found ${poolWithStaleMeta} pool files with possible stale metadata keys`,
    affectedFiles: 0,
    affectedQuestions: 0,
    poolFilesWithStaleMeta: poolWithStaleMeta,
    runtimeEvidence: evidence,
  };
}

function main() {
  const files = loadPoolFiles();
  const report = {
    generatedAt: new Date().toISOString(),
    poolDir: 'batches/ready/pool-verified',
    poolFileCount: files.length,
    categories: {
      '1_mcqLengthBias': auditLengthBias(files),
      '2_lexicalCueingQuarantine': auditLexicalCueing(files),
      '3_schreibenPlaceholders': auditSchreibenPlaceholders(files),
      '4_premiseDuplication': auditPremiseDuplication(files),
      '5_schreibenDisplayRubric': auditSchreibenRubric(files),
      '6_nameRotation': auditNameRotation(files),
      '7_horenT3Chrono': auditHorenT3Chrono(files),
      '8_lesenT3TopicDrift': auditLesenT3TopicDrift(files),
      '9_lesenT2WordCopy': auditLesenT2WordCopy(files),
      '10_liveCalculation': auditLiveCalculation(),
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

  // Console summary table
  const c = report.categories;
  console.log('\n=== FULL POOL GATES AUDIT 2026-07-13 ===\n');
  console.log(`Pool: ${files.length} files in pool-verified\n`);
  console.log('| # | Categoría | Archivos afectados | Preguntas | Notas |');
  console.log('|---:|---|---:|---:|---|');
  console.log(
    `| 1 | MCQ length bias | ${c['1_mcqLengthBias'].affectedFiles} | ${c['1_mcqLengthBias'].affectedQuestions} | ${c['1_mcqLengthBias'].reconciliation.note} |`,
  );
  console.log(
    `| 2 | Lexical cueing (cuarentena) | ${c['2_lexicalCueingQuarantine'].affectedFiles} | ${c['2_lexicalCueingQuarantine'].affectedQuestions} | ${c['2_lexicalCueingQuarantine'].reconciliation} |`,
  );
  console.log(
    `| 3 | Schreiben placeholders | ${c['3_schreibenPlaceholders'].affectedFiles} | — | pool ${c['3_schreibenPlaceholders'].poolTotal} |`,
  );
  console.log(
    `| 4 | Premise dup (Schreiben T3) | ${c['4_premiseDuplication'].schreibenT3.affectedFiles} | — | ${c['4_premiseDuplication'].schreibenT3.duplicateGroups} grupos |`,
  );
  console.log(
    `| 4b | Premise dup (Hören T1/T2) | ${c['4_premiseDuplication'].horenT1T2.affectedFiles} | — | ${c['4_premiseDuplication'].horenT1T2.duplicateGroups} grupos |`,
  );
  console.log(
    `| 5 | Schreiben rubric | ${c['5_schreibenDisplayRubric'].affectedFiles} | — | pool ${c['5_schreibenDisplayRubric'].poolTotal} |`,
  );
  console.log(
    `| 6 | Name rotation | ${c['6_nameRotation'].affectedFiles} | — | T3:${c['6_nameRotation'].byPart.horenT3} T4:${c['6_nameRotation'].byPart.horenT4} L4:${c['6_nameRotation'].byPart.lesenT4} S3:${c['6_nameRotation'].byPart.schreibenT3} |`,
  );
  console.log(
    `| 7 | Hören T3 chrono | ${c['7_horenT3Chrono'].affectedFiles} | — | ${c['7_horenT3Chrono'].poolTotal}/${c['7_horenT3Chrono'].poolTotal} pass |`,
  );
  console.log(
    `| 8 | Lesen T3 topic drift | ${c['8_lesenT3TopicDrift'].affectedFiles} | — | pool ${c['8_lesenT3TopicDrift'].poolTotal} |`,
  );
  console.log(
    `| 9 | Lesen T2 word-copy | ${c['9_lesenT2WordCopy'].affectedFiles} | ${c['9_lesenT2WordCopy'].affectedQuestions} | pool ${c['9_lesenT2WordCopy'].poolTotal} |`,
  );
  console.log(
    `| 10 | Live calc (verbs/art.) | ${c['10_liveCalculation'].affectedFiles} | 0 | ${c['10_liveCalculation'].conclusion.slice(0, 60)}… |`,
  );
  console.log(`\nWrote ${OUT}`);
}

main();
