#!/usr/bin/env node
/**
 * Auditoría retroactiva pool-verified/A2 — causas A–F.
 *   node scripts/audit-a2-pool-root-causes.mjs [--json] [--level A2]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { detectDisconnectedVocabSentences } from './lib/vocabNarrativeCoherence.mjs';
import {
  horenT2ActivityKeySignature,
  countSharedFiveGrams,
} from './lib/horenT2ActivityScheduleBank.mjs';
import {
  extractDialogueCastSignature,
  extractDialoguePairs,
  tallyNameFrequency,
} from './lib/dialogueNamesBank.mjs';
import {
  questionSpecificVocabBlob,
  isValidGrammarTag,
  sanitizeGrammarTags,
  extractVocabularyFromText,
} from './lib/enrichBatchMetadata.mjs';

const BROKEN_LEMMAS = new Set(['interessanen', 'kaputen', 'direken', 'hingegangen']);

function walkJson(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJson(abs, out);
    else if (ent.name.endsWith('.json') && !ent.name.startsWith('.')) out.push(abs);
  }
  return out;
}

function loadBatches(dir) {
  return walkJson(dir).map((abs) => {
    try {
      const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
      return { batch, file: path.basename(abs), abs };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function batchMeta(row) {
  const b = row.batch;
  const mod = String(b.module || b.passages?.[0]?.module || b.questions?.[0]?.module || '').toLowerCase();
  const teil = Number(b.teil ?? b.passages?.[0]?.teil ?? b.questions?.[0]?.teil);
  const level = String(b.level || b.passages?.[0]?.level || 'A2').toUpperCase();
  return { mod, teil, level };
}

function tagInBlob(tag, blob) {
  const t = String(tag).toLowerCase();
  const b = String(blob).toLowerCase();
  if (b.includes(t)) return true;
  // stem prefix match (min 5 chars)
  if (t.length >= 5 && b.split(/\s+/).some((w) => w.startsWith(t.slice(0, 5)))) return true;
  return false;
}

function scanCauseA(rows) {
  const affected = [];
  for (const row of rows) {
    const { mod, teil } = batchMeta(row);
    if (mod !== 'lesen' || !row.batch.userVocabFeedback?.used?.length) continue;
    const text = row.batch.passages?.[0]?.text || '';
    const flags = detectDisconnectedVocabSentences(text, row.batch.userVocabFeedback.used);
    if (flags.length) {
      affected.push({ file: row.file, flags });
    }
  }
  return { totalLesenWithVocab: rows.filter((r) => batchMeta(r).mod === 'lesen' && r.batch.userVocabFeedback?.used?.length).length, affectedFiles: affected.length, affected };
}

function scanCauseB(rows) {
  const t2 = rows.filter((r) => batchMeta(r).mod === 'horen' && batchMeta(r).teil === 2);
  const pairs = [];
  for (let i = 0; i < t2.length; i += 1) {
    for (let j = i + 1; j < t2.length; j += 1) {
      const a = t2[i];
      const b = t2[j];
      const textA = a.batch.passages?.[0]?.text || '';
      const textB = b.batch.passages?.[0]?.text || '';
      const shared = countSharedFiveGrams(textA, textB);
      const sigA = horenT2ActivityKeySignature(a.batch);
      const sigB = horenT2ActivityKeySignature(b.batch);
      const sameKeys = sigA && sigB && sigA === sigB;
      if (shared >= 8 || sameKeys) {
        pairs.push({
          fileA: a.file,
          fileB: b.file,
          sharedFiveGrams: shared,
          keySigA: sigA,
          keySigB: sigB,
          sameKeySequence: sameKeys,
        });
      }
    }
  }
  return { totalT2: t2.length, convergentPairs: pairs.length, pairs };
}

function scanCauseC(rows, b1Rows = []) {
  const horenNamed = rows.filter((r) => {
    const { mod, teil } = batchMeta(r);
    return mod === 'horen' && [1, 2, 3].includes(teil);
  });
  const b1Named = b1Rows.filter((r) => {
    const { mod, teil } = batchMeta(r);
    return mod === 'horen' && [1, 2, 3].includes(teil);
  });
  const a2Tally = tallyNameFrequency(horenNamed.map((r) => r.batch));
  const b1Tally = tallyNameFrequency(b1Named.map((r) => r.batch));

  const duplicateCasts = [];
  const castMap = new Map();
  for (const row of horenNamed) {
    const sig = extractDialogueCastSignature(row.batch);
    if (!sig) continue;
    if (!castMap.has(sig)) castMap.set(sig, []);
    castMap.get(sig).push(row.file);
  }
  for (const [sig, files] of castMap) {
    if (files.length > 1) duplicateCasts.push({ cast: sig, files, count: files.length });
  }

  const topNames = [...a2Tally.nameCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([n, c]) => ({ name: n, count: c }));
  const topPairs = [...a2Tally.pairCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([p, c]) => ({ pair: p, count: c }));

  return {
    a2FilesWithDialogue: horenNamed.length,
    duplicateCastGroups: duplicateCasts.length,
    duplicateCasts,
    topNames,
    topPairs,
    b1TopPairs: [...b1Tally.pairCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p, c]) => ({ pair: p, count: c })),
  };
}

function scanCauseD(rows) {
  let totalQ = 0;
  let contaminatedQ = 0;
  const affectedFiles = new Set();
  const samples = [];

  for (const row of rows) {
    const { mod, teil } = batchMeta(row);
    if (mod !== 'lesen' && mod !== 'horen') continue;
    const passagesById = new Map((row.batch.passages || []).map((p) => [p.id, p]));
    for (const q of row.batch.questions || []) {
      totalQ += 1;
      const passage = passagesById.get(q.passageId);
      const blob = questionSpecificVocabBlob(q, passage);
      const tags = q.vocabularyTags || [];
      const bad = tags.filter((t) => !tagInBlob(t, blob));
      if (bad.length) {
        contaminatedQ += 1;
        affectedFiles.add(row.file);
        if (samples.length < 8) {
          samples.push({ file: row.file, qId: q.id, badTags: bad, blobPreview: blob.slice(0, 80) });
        }
      }
    }
  }
  return {
    totalQuestions: totalQ,
    contaminatedQuestions: contaminatedQ,
    affectedFiles: affectedFiles.size,
    pctQuestions: totalQ ? Math.round((contaminatedQ / totalQ) * 1000) / 10 : 0,
    pctFiles: rows.length ? Math.round((affectedFiles.size / rows.length) * 1000) / 10 : 0,
    samples,
  };
}

function scanCauseE(rows) {
  const topicAsGrammar = [];
  const identicalAllQ = [];

  for (const row of rows) {
    const topic = String(row.batch.topicTag || row.batch._requestedTopic || '');
    const qs = row.batch.questions || [];
    if (!qs.length) continue;

    const topicLeak = qs.some((q) => (q.grammarTags || []).some((t) => t === topic && !isValidGrammarTag(t)));
    if (topicLeak && topic) {
      topicAsGrammar.push({ file: row.file, topicTag: topic, grammarTags: qs[0].grammarTags });
    }

    const sigs = qs.map((q) => JSON.stringify(q.grammarTags || []));
    const allSame = sigs.every((s) => s === sigs[0]) && qs.length > 1;
    const validSame = allSame && sanitizeGrammarTags(qs[0].grammarTags).length > 0;
    if (allSame && qs.length >= 3) {
      identicalAllQ.push({
        file: row.file,
        grammarTags: qs[0].grammarTags,
        questionCount: qs.length,
        allValidGrammar: validSame,
      });
    }
  }

  return {
    topicAsGrammarFiles: topicAsGrammar.length,
    topicAsGrammar,
    identicalGrammarAllQuestionsFiles: identicalAllQ.length,
    identicalAllQ,
  };
}

function scanCauseF(rows) {
  const hits = [];
  for (const row of rows) {
    for (const q of row.batch.questions || []) {
      for (const t of q.vocabularyTags || []) {
        if (BROKEN_LEMMAS.has(String(t).toLowerCase())) {
          hits.push({ file: row.file, qId: q.id, lemma: t });
        }
      }
    }
  }
  return { brokenLemmaHits: hits.length, hits };
}

function main() {
  const asJson = process.argv.includes('--json');
  const level = process.argv.find((a, i) => process.argv[i - 1] === '--level') || 'A2';
  const poolDir = path.join(ROOT, 'batches/ready/pool-verified', level);
  const b1Dir = path.join(ROOT, 'batches/ready/pool-verified/B1');

  const rows = loadBatches(poolDir);
  const b1Rows = level === 'A2' ? loadBatches(b1Dir) : [];

  const report = {
    scannedAt: new Date().toISOString(),
    poolDir,
    totalFiles: rows.length,
    A_vocabForced: scanCauseA(rows),
    B_t2Convergence: scanCauseB(rows),
    C_nameRotation: scanCauseC(rows, b1Rows),
    D_vocabTagsContamination: scanCauseD(rows),
    E_grammarTags: scanCauseE(rows),
    F_brokenLemmas: scanCauseF(rows),
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n=== A2 pool root-cause audit (${rows.length} files) ===\n`);
  console.log(`A — Vocab forzado (Lesen+userVocab): ${report.A_vocabForced.affectedFiles}/${report.A_vocabForced.totalLesenWithVocab} archivos`);
  for (const a of report.A_vocabForced.affected) {
    console.log(`  · ${a.file}: ${a.flags.map((f) => f.word).join(', ')}`);
  }
  console.log(`\nB — Hören T2 convergencia: ${report.B_t2Convergence.convergentPairs} pares (${report.B_t2Convergence.totalT2} archivos T2)`);
  for (const p of report.B_t2Convergence.pairs.slice(0, 12)) {
    console.log(`  · ${p.fileA} ↔ ${p.fileB}: ${p.sharedFiveGrams} 5-gramas, keys=${p.keySigA}${p.sameKeySequence ? ' (IGUAL)' : ''}`);
  }
  console.log(`\nC — Elenco duplicado: ${report.C_nameRotation.duplicateCastGroups} grupos`);
  for (const d of report.C_nameRotation.duplicateCasts) {
    console.log(`  · [${d.count}×] ${d.cast}: ${d.files.join(', ')}`);
  }
  console.log(`  Top pares A2: ${report.C_nameRotation.topPairs.map((p) => `${p.pair}(${p.count})`).join(', ')}`);
  const d = report.D_vocabTagsContamination;
  console.log(`\nD — vocabularyTags contaminados: ${d.affectedFiles}/${rows.length} archivos, ${d.contaminatedQuestions}/${d.totalQuestions} preguntas (${d.pctQuestions}%)`);
  console.log(`\nE — grammarTags=topicTag: ${report.E_grammarTags.topicAsGrammarFiles} archivos`);
  for (const t of report.E_grammarTags.topicAsGrammar) console.log(`  · ${t.file}: ${JSON.stringify(t.grammarTags)}`);
  console.log(`E — grammarTags idénticos en todas las Q: ${report.E_grammarTags.identicalGrammarAllQuestionsFiles} archivos`);
  console.log(`\nF — lemas rotos: ${report.F_brokenLemmas.brokenLemmaHits} hits`);
}

main();
