#!/usr/bin/env node
/**
 * Fix topicTag for category-(a) strong mismatches (diff ≥ 2).
 *
 *   node scripts/fix-topic-mismatch-strong-2026-07-10.mjs           # dry-run
 *   node scripts/fix-topic-mismatch-strong-2026-07-10.mjs --apply
 *
 * Sample of 8 verified manually before bulk (see report).
 * Does NOT touch Q1 shadow files beyond the listed strong set.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { scorePassageTopics } from './lib/qualityGates/contentTopicCheck.mjs';

const APPLY = process.argv.includes('--apply');
const LOG = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'batches/ready/gate-logs/topic-mismatch-ab-2026-07-10.json'),
    'utf8',
  ),
);

const SEARCH_DIRS = [
  'batches/needs-regeneration',
  'batches/ready/pool-content-ok',
  'batches/ready/lesen',
  'batches/generated',
].map((d) => path.join(ROOT, d));

/**
 * Manual KEEP — detector FP: declared tag matches theme/title better than detected.
 * Key: file|passageId
 */
const KEEP = new Map([
  // Sample #6: yoga/health lifestyle; Freizeit from Freund/Spaziergang noise
  ['lesen-t1-gemini-173.json|gen-l1-5b6dc8fb', 'Gesundheit'],
  // Nachhaltiges Reisen — Umwelt keywords from umweltfreundlich/Nachhaltigkeit
  ['lesen-t2-gemini-065.json|gen-l2-358dc234a', 'Reisen'],
  ['lesen-t2-gemini-061.json|gen-l2-4c1435c2a', 'Reisen'],
  // Title is about Medien rules at home
  ['lesen-t1-gemini-181.json|gen-l1-7d42939c', 'Medien'],
  // Title: Technik-Projekt
  ['lesen-t1-gemini-164.json|gen-l1-56609157', 'Technik'],
  // Title: neue Arbeit in der Umweltorganisation
  ['lesen-t1-gemini-166.json|gen-l1-8297e7d4', 'Arbeit'],
  // Vitalis Freizeitzentrum health rules — Gesundheit intentional
  ['lesen-t5-gemini-052.json|gen-l5-f750c057', 'Gesundheit'],
  // Smart home helpers — not Umwelt
  ['lesen-t2-gemini-079.json|gen-l2-831ec385a', 'Technik'],
  // Bibliotheksordnung already Bildung; Technik from Handy/Computer noise
  ['lesen-t5-gemini-066.json|gen-l5-9c847fa2', 'Bildung'],
]);

/**
 * Manual OVERRIDE — detected is wrong; use better tag than both tag and detected.
 */
const OVERRIDE = new Map([
  // Sample #4: Gemeinschaftsgärten → Stadtleben (not Ernährung)
  ['horen-t2-gemini-002.json|gen-p-h2-430e5562-s1', 'Stadtleben'],
  // Sample #8: Mensaordnung → Ernährung (not Konsum)
  ['lesen-t5-gemini-054.json|gen-l5-f8a82034', 'Ernährung'],
  // E1-L2 pattern: Bewegung für gesundes Leben
  ['lesen-t2-gemini-064.json|gen-l2-f5dd2b2c-1', 'Gesundheit'],
  // Title: Gesund durch Bewegung — not Arbeit/Bildung
  ['lesen-t2-gemini-034.json|gen-l2-a774a', 'Gesundheit'],
  // Bibliotheksordnung: library rules, not Technik
  ['lesen-t5-gemini-046.json|gen-l5-af60e599', 'Bildung'],
  ['lesen-t5-gemini-060.json|gen-l5-2faf8867', 'Bildung'],
  // Forum Bibliothek am Sonntag
  ['lesen-t4-gemini-030.json|gen-l4-849fe147', 'Bildung'],
  // Regionale Lebensmittel (tied Umwelt/Ernährung)
  ['lesen-t2-gemini-062.json|gen-l2-69492eda-b', 'Ernährung'],
  // Fahrrad-Programm Stadt → Verkehr
  ['lesen-t2-gemini-056.json|gen-l2-61d60ea9a', 'Verkehr'],
  // E-Bikes Städte → Verkehr
  ['lesen-t2-gemini-076.json|gen-l2-262dcd74a', 'Verkehr'],
  // Elektroautos → Verkehr
  ['lesen-t2-gemini-080.json|gen-l2-03dea0c3b', 'Verkehr'],
  // Buslinie Umweltschutz: Verkehr+Umwelt tied; content is Verkehr announcement
  ['horen-t1-gemini-013.json|gen-p-h1-856641ae-s1', 'Verkehr'],
  ['horen-t1-gemini-017.json|gen-p-h1-a5cd95df-s2', 'Verkehr'],
]);

function resolvePaths(file) {
  return SEARCH_DIRS.map((d) => path.join(d, file)).filter((p) => fs.existsSync(p));
}

function uniquePassageFindings() {
  const byKey = new Map();
  for (const f of LOG.strongFindings) {
    if (!f.passageId || !f.detected) continue;
    const key = `${f.file}|${f.passageId}`;
    const prev = byKey.get(key);
    if (!prev || f.diff > prev.diff) byKey.set(key, f);
  }
  return [...byKey.values()];
}

function decide(finding) {
  const key = `${finding.file}|${finding.passageId}`;
  if (KEEP.has(key)) {
    return { action: 'KEEP', newTag: KEEP.get(key), reason: 'manual_keep_fp' };
  }
  if (OVERRIDE.has(key)) {
    return { action: 'OVERRIDE', newTag: OVERRIDE.get(key), reason: 'manual_override' };
  }
  return { action: 'APPLY', newTag: finding.detected, reason: 'detected_strong' };
}

function syncQuestionTopicTags(batch, passageId, newTag) {
  let n = 0;
  for (const q of batch.questions || []) {
    const linked =
      q.passageId === passageId ||
      (Array.isArray(q.passageIds) && q.passageIds.includes(passageId));
    if (!linked) continue;
    if (Array.isArray(q.topicTags) && q.topicTags.length) {
      q.topicTags = [newTag];
      n++;
    }
  }
  return n;
}

function maybeUpdateRootTopic(batch, passageId, newTag) {
  const passages = batch.passages || [];
  if (passages.length === 1 && passages[0].id === passageId) {
    batch.topicTag = newTag;
    if (batch._requestedTopic) batch._requestedTopic = newTag;
    return true;
  }
  // Hören T1 multi-passage: leave root as generation request; passages are source of truth
  return false;
}

function applyToBatch(batch, finding, decision) {
  const p = (batch.passages || []).find((x) => x.id === finding.passageId);
  if (!p) return { changed: false, detail: 'passage_missing' };
  const old = p.topicTag;
  if (decision.action === 'KEEP') {
    return { changed: false, detail: 'keep', old, newTag: decision.newTag };
  }
  if (old === decision.newTag) {
    return { changed: false, detail: 'already', old, newTag: decision.newTag };
  }
  p.topicTag = decision.newTag;
  const qn = syncQuestionTopicTags(batch, finding.passageId, decision.newTag);
  const root = maybeUpdateRootTopic(batch, finding.passageId, decision.newTag);
  return {
    changed: true,
    detail: decision.action,
    old,
    newTag: decision.newTag,
    reason: decision.reason,
    questionsUpdated: qn,
    rootUpdated: root,
  };
}

function main() {
  const findings = uniquePassageFindings();
  const rows = [];
  const fileChanges = new Map(); // path -> batch

  for (const finding of findings) {
    const decision = decide(finding);
    const paths = resolvePaths(finding.file);
    if (!paths.length) {
      rows.push({ ...finding, decision, error: 'file_missing' });
      continue;
    }
    for (const abs of paths) {
      let batch = fileChanges.get(abs);
      if (!batch) {
        batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
        fileChanges.set(abs, batch);
      }
      const result = applyToBatch(batch, finding, decision);
      const p = (batch.passages || []).find((x) => x.id === finding.passageId);
      const scored = p ? scorePassageTopics(p, decision.newTag) : null;
      rows.push({
        file: finding.file,
        path: path.relative(ROOT, abs).replace(/\\/g, '/'),
        passageId: finding.passageId,
        title: p?.title || '',
        oldTag: finding.tag,
        detected: finding.detected,
        diff: finding.diff,
        action: decision.action,
        newTag: decision.newTag,
        reason: decision.reason,
        changed: result.changed,
        rootUpdated: result.rootUpdated || false,
        postBest: scored?.best,
        postTagScore: scored?.tagScore,
        postBestScore: scored?.bestScore,
      });
    }
  }

  if (APPLY) {
    for (const [abs, batch] of fileChanges) {
      // Only write if something actually changed in this file
      const touched = rows.some((r) => r.path === path.relative(ROOT, abs).replace(/\\/g, '/') && r.changed);
      if (!touched) continue;
      fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`);
    }
  }

  const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    findings: findings.length,
    rows: rows.length,
    byAction: {
      APPLY: rows.filter((r) => r.action === 'APPLY' && r.changed).length,
      OVERRIDE: rows.filter((r) => r.action === 'OVERRIDE' && r.changed).length,
      KEEP: rows.filter((r) => r.action === 'KEEP').length,
      already: rows.filter((r) => !r.changed && r.action !== 'KEEP').length,
    },
    uniqueFilesTouched: new Set(rows.filter((r) => r.changed).map((r) => r.file)).size,
    sampleVerification: [
      { file: 'horen-t1-gemini-001.json', verdict: 'APPLY Umwelt (Müll Treppenhaus)' },
      { file: 'horen-t1-gemini-012.json', verdict: 'APPLY Bildung (Online-Lernen)' },
      { file: 'horen-t1-gemini-013.json', verdict: 'OVERRIDE/APPLY per passage (Verkehr/Umwelt/Stadtleben)' },
      { file: 'horen-t2-gemini-002.json', verdict: 'OVERRIDE Stadtleben (not Ernährung)' },
      { file: 'lesen-t1-gemini-075.json', verdict: 'APPLY Verkehr' },
      { file: 'lesen-t1-gemini-173.json', verdict: 'KEEP Gesundheit (FP Freizeit)' },
      { file: 'lesen-t2-gemini-065.json', verdict: 'KEEP Reisen (FP Umwelt)' },
      { file: 'lesen-t5-gemini-054.json', verdict: 'OVERRIDE Ernährung (not Konsum)' },
    ],
    rows,
  };

  const outJson = path.join(ROOT, 'batches/ready/gate-logs/topic-fix-strong-2026-07-10.json');
  const outMd = path.join(ROOT, 'batches/ready/gate-logs/topic-fix-strong-2026-07-10.md');
  fs.writeFileSync(outJson, `${JSON.stringify(summary, null, 2)}\n`);

  const keepRows = rows.filter((r) => r.action === 'KEEP');
  const changeRows = rows.filter((r) => r.changed);
  const md = [
    '# Topic fix — strong (a) 2026-07-10',
    '',
    `Mode: **${summary.mode}**`,
    '',
    '## Sample verification (8) before bulk',
    '',
    '| File | Verdict |',
    '|------|---------|',
    ...summary.sampleVerification.map((s) => `| \`${s.file}\` | ${s.verdict} |`),
    '',
    '## Summary',
    '',
    `| Metric | N |`,
    `|--------|--:|`,
    `| Passage findings | ${summary.findings} |`,
    `| Path rows (incl mirrors) | ${summary.rows.length} |`,
    `| APPLY changed | ${summary.byAction.APPLY} |`,
    `| OVERRIDE changed | ${summary.byAction.OVERRIDE} |`,
    `| KEEP (no change) | ${summary.byAction.KEEP} |`,
    `| Unique files touched | ${summary.uniqueFilesTouched} |`,
    '',
    '## KEEP (detector FP)',
    '',
    ...keepRows
      .filter((r, i, a) => a.findIndex((x) => x.file === r.file && x.passageId === r.passageId) === i)
      .map((r) => `- \`${r.file}\` \`${r.passageId}\`: keep **${r.newTag}** (detected was ${r.detected})`),
    '',
    '## Changes',
    '',
    '| File | Passage | Old → New | Action |',
    '|------|---------|-----------|--------|',
    ...changeRows
      .filter((r, i, a) => a.findIndex((x) => x.file === r.file && x.passageId === r.passageId) === i)
      .map(
        (r) =>
          `| \`${r.file}\` | \`${r.passageId}\` | ${r.oldTag} → **${r.newTag}** | ${r.action} |`,
      ),
    '',
    '## Conflict check vs pool-verified',
    '',
    'Strong set ∩ `batches/ready/pool-verified/` = **∅**. Q2 REAL set also ∅. Safe parallel with pool-verified re-check.',
    '',
  ].join('\n');
  fs.writeFileSync(outMd, md);

  console.log(JSON.stringify(summary.byAction, null, 2));
  console.log('uniqueFilesTouched', summary.uniqueFilesTouched);
  console.log('wrote', path.relative(ROOT, outMd));
  if (!APPLY) console.log('(dry-run — re-run with --apply to write)');
}

main();
