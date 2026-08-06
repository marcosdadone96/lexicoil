#!/usr/bin/env node
/**
 * Full generation-pipeline audit — pool-verified B1+A2.
 *   node scripts/audit-generation-pipeline-full.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { KNOWN_LEVELS, listPoolVerifiedJson } from './lib/batchPaths.mjs';
import { runGermanContentLanguageGate } from './lib/qualityGates/germanContentLanguageGate.mjs';
import { checkPassageContentTopic } from './lib/qualityGates/contentTopicCheck.mjs';
import { runDateWeekdayGate } from './lib/qualityGates/dateWeekdayGate.mjs';
import { measureMcqPositionDistribution } from './lib/manualPublishNormalize.mjs';
import { validatePart } from './lib/partGate.mjs';

const OUT = path.join(ROOT, 'batches/ready/gate-logs/audit-generation-pipeline-full.json');

function rfBalanceShare(questions) {
  const rf = (questions || []).filter((q) => /richtig_falsch/i.test(String(q.type || '')));
  if (rf.length < 4) return null;
  const r = rf.filter((q) => /^richtig$/i.test(String(q.correctAnswer || q.correct || ''))).length;
  const share = Math.max(r, rf.length - r) / rf.length;
  return { n: rf.length, r, f: rf.length - r, sharePct: Math.round(share * 1000) / 10 };
}

function jaNeinShare(questions) {
  const jn = (questions || []).filter((q) => /ja_nein/i.test(String(q.type || '')));
  if (jn.length < 5) return null;
  const ja = jn.filter((q) => /^ja$/i.test(String(q.correctAnswer || q.correct || ''))).length;
  const share = Math.max(ja, jn.length - ja) / jn.length;
  return { n: jn.length, ja, nein: jn.length - ja, sharePct: Math.round(share * 1000) / 10 };
}

const report = {
  generatedAt: new Date().toISOString(),
  filesScanned: 0,
  language: { q5Blocks: [], totalFiles: 0, totalFindings: 0 },
  horenT1TopicAudit: { files: 0, filesWithMismatch: 0, totalMismatches: 0, hits: [] },
  q3DateWeekday: { filesWithHits: 0, totalFindings: 0, hits: [] },
  chk12RfBalance: { hits: [] },
  mcqPositionBias: { hits: [] },
  jaNeinBias: { hits: [] },
  repairPromptLanguageFix: {
    note: 'All surgical repair prompts now append germanExamRepairOutputRulesBlock()',
    fixedKinds: ['word_match', 'mcq_length_bias', 'explanation', 'passage_length', 'mcq_distinct', 'lexico', 'fixRetry Lesen', 'fixRetry Exam'],
  },
};

const seen = new Set();

for (const level of KNOWN_LEVELS) {
  for (const abs of listPoolVerifiedJson(level)) {
    if (seen.has(abs)) continue;
    seen.add(abs);
    report.filesScanned += 1;
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const mod = String(batch.questions?.[0]?.module || batch.passages?.[0]?.module || '').toLowerCase();
    const teil = Number(batch.questions?.[0]?.teil ?? batch.passages?.[0]?.teil ?? 0);

    const q5 = runGermanContentLanguageGate(batch, { file: rel, lang: 'de' });
    if (!q5.ok && q5.findings?.length) {
      report.language.totalFiles += 1;
      report.language.totalFindings += q5.findings.length;
      report.language.q5Blocks.push({
        file: rel,
        level,
        module: mod,
        teil,
        findings: q5.findings.map((f) => f.detail || f.message),
      });
    }

    if (mod === 'horen' && teil === 1) {
      report.horenT1TopicAudit.files += 1;
      const tag = batch.topicTag || batch.passages?.[0]?.topicTag;
      const mismatches = [];
      for (const p of batch.passages || []) {
        const ct = checkPassageContentTopic({ ...p, topicTag: p.topicTag || tag });
        if (ct.mismatch) {
          mismatches.push({
            passageId: p.id,
            declared: tag || p.topicTag,
            detected: ct.detected,
            detail: ct.detail || ct.reason,
          });
        }
      }
      if (mismatches.length) {
        report.horenT1TopicAudit.filesWithMismatch += 1;
        report.horenT1TopicAudit.totalMismatches += mismatches.length;
        report.horenT1TopicAudit.hits.push({ file: rel, level, topicTag: tag, mismatches });
      }
    }

    const q3 = runDateWeekdayGate(batch, { file: rel });
    if (q3.findings?.length) {
      report.q3DateWeekday.filesWithHits += 1;
      report.q3DateWeekday.totalFindings += q3.findings.length;
      report.q3DateWeekday.hits.push({
        file: rel,
        level,
        module: mod,
        teil,
        findings: q3.findings.map((f) => f.detail || f.message),
      });
    }

    const rf = rfBalanceShare(batch.questions);
    if (rf && rf.sharePct > 70) {
      report.chk12RfBalance.hits.push({ file: rel, level, module: mod, teil, ...rf });
    }

    const dist = measureMcqPositionDistribution(batch);
    if (dist.n >= 3 && dist.maxPct > 0.55) {
      report.mcqPositionBias.hits.push({
        file: rel,
        level,
        module: mod,
        teil,
        seq: dist.seq,
        maxPct: Math.round(dist.maxPct * 1000) / 10,
        maxLetter: dist.maxLetter,
      });
    }

    const jn = jaNeinShare(batch.questions);
    if (jn && jn.sharePct > 62) {
      report.jaNeinBias.hits.push({ file: rel, level, module: mod, teil, ...jn });
    }
  }
}

report.summary = {
  filesScanned: report.filesScanned,
  languageBlockedFiles: report.language.totalFiles,
  horenT1TopicMismatchRate:
    report.horenT1TopicAudit.files > 0
      ? `${report.horenT1TopicAudit.filesWithMismatch}/${report.horenT1TopicAudit.files} files`
      : 'n/a',
  q3DateWeekdayFiles: report.q3DateWeekday.filesWithHits,
  chk12RfHits: report.chk12RfBalance.hits.length,
  mcqPositionHits: report.mcqPositionBias.hits.length,
  jaNeinHits: report.jaNeinBias.hits.length,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log('=== audit-generation-pipeline-full ===');
console.log(JSON.stringify(report.summary, null, 2));
console.log(`Wrote ${path.relative(ROOT, OUT)}`);
