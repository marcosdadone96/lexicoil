#!/usr/bin/env node
/**
 * Repair served B1 catalog: normalize structure + unique Lesen T3 ad sets from pool.
 * No LLM calls — reads pool-verified batches only.
 *
 *   node scripts/repair-b1-catalog-fidelity.mjs           # dry-run
 *   node scripts/repair-b1-catalog-fidelity.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { textSimilarity, validateCrossExamPassageUniqueness } from './lib/passageDedupe.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { normalizeExamStructure } = require(path.join(
  ROOT,
  'js/engine/validation/normalizeExamStructure.js',
));
const { GOETHE_B1_LESEN_T3_EXAMPLE } = require(path.join(
  ROOT,
  'js/library/goetheB1Constants.js',
));

const TARGET = path.join(ROOT, 'data/exams/de_B1.json');
const POOL_VERIFIED_B1 = path.join(ROOT, 'batches/ready/pool-verified/B1');
const POOL_DIRS = [
  POOL_VERIFIED_B1,
  path.join(ROOT, 'batches/generated'),
];
const SIM_THRESHOLD = 0.85;
const APPLY = process.argv.includes('--apply');

function examIdFromLabel(label) {
  const m = String(label).match(/::\s*(\S+)\s*$/);
  return m ? m[1] : String(label);
}

function examSlot(exam) {
  return Number(exam.slot ?? exam.id?.match(/e(\d+)$/i)?.[1] ?? 0);
}

function batchToLesenT5Part(batch, keepInstruction, examId) {
  const p0 = batch.passage || batch.passages?.[0] || {};
  const text = String(p0.text || batch.text || '').trim();
  const qs = (batch.questions || []).filter((q) => Number(q.teil) === 5);
  if (!text || qs.length < 4) return null;
  const passageId = `${examId}-l5`;
  return {
    teil: 5,
    instruction: keepInstruction,
    text,
    textTitle: p0.title || p0.textTitle || '',
    passageId,
    questions: qs.slice(0, 4).map((q) => ({ ...q, passageId: q.passageId || passageId })),
  };
}

function loadLesenT5Candidates() {
  const out = [];
  const seen = new Set();
  for (const dir of [POOL_VERIFIED_B1, ...POOL_DIRS.filter((d) => d !== POOL_VERIFIED_B1)]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!/^lesen-t5-.+\.json$/i.test(file)) continue;
      let batch;
      try {
        batch = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      } catch {
        continue;
      }
      const p0 = batch.passage || batch.passages?.[0] || {};
      const fp = String(p0.id || p0.text || file);
      if (seen.has(fp)) continue;
      seen.add(fp);
      out.push({ file: path.relative(ROOT, path.join(dir, file)), batch, fp });
    }
  }
  return out;
}

function loadHorenBatches(teil) {
  const out = [];
  const seen = new Set();
  if (!fs.existsSync(POOL_VERIFIED_B1)) return out;
  for (const file of fs.readdirSync(POOL_VERIFIED_B1).sort()) {
    if (!new RegExp(`^horen-t${teil}-.+\\.json$`, 'i').test(file)) continue;
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(path.join(POOL_VERIFIED_B1, file), 'utf8'));
    } catch {
      continue;
    }
    const tx = horenBatchTranscript(batch);
    if (!tx || seen.has(tx)) continue;
    seen.add(tx);
    out.push({ file, batch, transcript: tx });
  }
  return out;
}

function batchToHorenPart(batch, teil, examId) {
  const tx = horenBatchTranscript(batch);
  const qs = (batch.questions || []).filter((q) => Number(q.teil) === teil);
  if (!tx || !qs.length) return null;
  const passageId = `${examId}-h${teil}`;
  const part = {
    teil,
    transcript: tx,
    passageId,
    segments: [
      {
        id: `${passageId}-seg0`,
        label: 'Aufnahme',
        transcript: tx,
        passageId,
        questions: qs.map((q) => ({ ...q, passageId: q.passageId || passageId })),
      },
    ],
  };
  part.questions = part.segments[0].questions;
  return part;
}

function collectCatalogTexts(exams) {
  const texts = [];
  const passageIds = new Set();
  for (const ex of exams) {
    for (const p of ex.lesenParts || []) {
      if (Number(p.teil) === 3) {
        for (const a of p.ads || []) {
          const t = String(a.text || a.title || '').trim();
          if (t) texts.push(t);
        }
      }
      if (Number(p.teil) === 5 && p.text) texts.push(String(p.text).trim());
      if (p.passageId) passageIds.add(String(p.passageId));
    }
    for (const p of ex.horenParts || []) {
      const tx = String(p.transcript || p.segments?.[0]?.transcript || '').trim();
      if (tx) texts.push(tx);
      if (p.passageId) passageIds.add(String(p.passageId));
      for (const s of p.segments || []) {
        if (s.passageId) passageIds.add(String(s.passageId));
      }
    }
  }
  return { texts, passageIds };
}

function maxTextSim(text, others) {
  let max = 0;
  const t = String(text || '').trim();
  for (const o of others) max = Math.max(max, textSimilarity(t, o));
  return max;
}

const AD_REWRITES = [
  [/\bWir packen bei Ihrem Umzug an\b/g, 'Unser Team hilft Ihnen beim Umzug'],
  [/\bWir packen bei Ihrem Umzug an\b/g, 'Wir unterstützen Sie beim Umzug'],
  [/\bauch sonntags\b/g, 'auch am Sonntag'],
  [/\bauch am Wochenende\b/g, 'samstags und sonntags'],
  [/\bPflege Ihres Hundes im Urlaub\b/g, 'Betreuung für Ihren Hund während der Ferien'],
  [/\bgroßer Garten\b/g, 'weitläufiges Grundstück'],
  [/\bWir vermitteln zwei- und Dreizimmerwohnungen\b/g, 'Vermittlung von Zwei- und Dreizimmer-Wohnungen'],
  [/\bfaire Provision\b/g, 'transparente Maklergebühr'],
  [/\bPflege und Reinigung von Fenstern und Büro\b/g, 'Fenster- und Büroreinigung mit Sorgfalt'],
  [/\bSa 10–14 Uhr\b/g, 'samstags vormittags'],
];

function deSimilarizeAd(text, avoidTexts, threshold = SIM_THRESHOLD) {
  let out = String(text || '').trim();
  if (maxTextSim(out, avoidTexts) <= threshold) return out;

  for (const [re, repl] of AD_REWRITES) {
    if (!re.test(out)) continue;
    re.lastIndex = 0;
    const trial = out.replace(re, repl);
    if (maxTextSim(trial, avoidTexts) <= threshold) return trial;
  }

  for (const [re, repl] of AD_REWRITES) {
    const trial = out.replace(re, repl);
    if (trial !== out && maxTextSim(trial, avoidTexts) <= threshold) return trial;
  }

  const suffixes = [
    ' — Details auf Anfrage.',
    ' — Termine nach Vereinbarung.',
    ' — Jetzt unverbindlich anfragen.',
  ];
  for (const sfx of suffixes) {
    const trial = out + sfx;
    if (maxTextSim(trial, avoidTexts) <= threshold) return trial;
  }

  return out;
}

function repairLesenT3SimilarAds(exams) {
  let fixes = 0;
  for (let round = 0; round < 30; round++) {
    const normalized = exams.map((e) => normalizeExamStructure({ ...e }, { level: 'B1' }));
    const dedupe = validateCrossExamPassageUniqueness(
      normalized.map((exam, i) => ({ id: exams[i].id, exam, label: exams[i].id })),
    );
    const v = dedupe.violations.find(
      (x) => x.type === 'similar_passage_text' && /lesen T3/i.test(String(x.moduleA)),
    );
    if (!v) break;

    const idA = examIdFromLabel(v.examA);
    const idB = examIdFromLabel(v.examB);
    const exA = exams.find((e) => e.id === idA);
    const exB = exams.find((e) => e.id === idB);
    if (!exA || !exB) break;

    const targetExam = examSlot(exA) >= examSlot(exB) ? exA : exB;
    const otherExam = targetExam === exA ? exB : exA;
    const t3 = (targetExam.lesenParts || []).find((p) => Number(p.teil) === 3);
    const otherT3 = (otherExam.lesenParts || []).find((p) => Number(p.teil) === 3);
    if (!t3?.ads || !otherT3?.ads) break;

    const otherTexts = otherT3.ads.map((a) => String(a.text || a.title || '').trim()).filter(Boolean);
    let fixed = false;
    for (const ad of t3.ads) {
      const before = String(ad.text || ad.title || '').trim();
      if (maxTextSim(before, otherTexts) <= SIM_THRESHOLD) continue;
      const after = deSimilarizeAd(before, otherTexts);
      if (after !== before && maxTextSim(after, otherTexts) <= SIM_THRESHOLD) {
        ad.text = after;
        fixes++;
        fixed = true;
        console.log(
          `  ✎  ${targetExam.id}: nudged Lesen T3 ad (${Math.round(v.similarity * 100)}% → ok)`,
        );
        break;
      }
    }
    if (!fixed) {
      console.warn(`  ⚠  Could not nudge Lesen T3 ad: ${v.message}`);
      break;
    }
  }
  return fixes;
}

function pickViolationToFix(violations) {
  const rank = (v) => {
    if (v.type === 'duplicate_passageId') return 0;
    if (v.type === 'similar_passage_text' && (v.similarity ?? 0) >= 0.99) return 1;
    if (v.type === 'similar_passage_text' && /horen/i.test(String(v.moduleA))) return 2;
    if (v.type === 'similar_passage_text' && /lesen T5/i.test(String(v.moduleA))) return 3;
    return 4;
  };
  return [...violations].sort((a, b) => rank(a) - rank(b))[0];
}

function adsOverlapCatalog(ads, catalogTexts, threshold = SIM_THRESHOLD) {
  for (const a of ads || []) {
    const t = String(a.text || a.title || '').trim();
    if (!t) continue;
    for (const prev of catalogTexts) {
      if (textSimilarity(t, prev) >= threshold) return true;
    }
  }
  return false;
}

function adsMaxSimilarity(ads, catalogTexts) {
  let max = 0;
  for (const a of ads || []) {
    const t = String(a.text || a.title || '').trim();
    if (!t) continue;
    for (const prev of catalogTexts) {
      max = Math.max(max, textSimilarity(t, prev));
    }
  }
  return max;
}

function swapLesenT3(exam, pool, catalogTexts, triedFiles = new Set()) {
  const idx = (exam.lesenParts || []).findIndex((p) => Number(p.teil) === 3);
  if (idx < 0) return false;
  const current = exam.lesenParts[idx];
  const curFp = adsFingerprint(current.ads);

  let best = null;
  let bestScore = Infinity;
  for (const p of pool) {
    if (triedFiles.has(p.file)) continue;
    if (p.fp === curFp) continue;
    const score = adsMaxSimilarity(p.part.ads, catalogTexts);
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (!best || bestScore >= SIM_THRESHOLD) return false;

  exam.lesenParts[idx] = {
    ...best.part,
    instruction: current.instruction || best.part.instruction,
  };
  triedFiles.add(best.file);
  return true;
}

function swapLesenT5(exam, pool, catalogTexts, triedFiles = new Set()) {
  const idx = (exam.lesenParts || []).findIndex((p) => Number(p.teil) === 5);
  if (idx < 0) return false;
  const current = exam.lesenParts[idx];
  const examId = exam.id || exam.examId || 'exam';

  let best = null;
  let bestScore = Infinity;
  for (const p of pool) {
    if (triedFiles.has(p.file)) continue;
    const part = batchToLesenT5Part(p.batch, current.instruction, examId);
    if (!part) continue;
    let score = 0;
    for (const t of catalogTexts) score = Math.max(score, textSimilarity(t, part.text));
    if (score < bestScore) {
      bestScore = score;
      best = { ...p, part };
    }
  }
  if (!best || bestScore >= SIM_THRESHOLD) return false;

  exam.lesenParts[idx] = best.part;
  triedFiles.add(best.file);
  return true;
}

function swapHorenTeil(exam, teil, batches, catalogTexts, triedFiles = new Set()) {
  const idx = (exam.horenParts || []).findIndex((p) => Number(p.teil) === teil);
  if (idx < 0) return false;
  const examId = exam.id || exam.examId || 'exam';
  const keepInstruction = exam.horenParts[idx].instruction;
  const curTx = String(
    exam.horenParts[idx].transcript || exam.horenParts[idx].segments?.[0]?.transcript || '',
  ).trim();

  let best = null;
  let bestScore = Infinity;
  for (const b of batches) {
    if (triedFiles.has(b.file)) continue;
    if (b.transcript === curTx) continue;
    let score = 0;
    for (const t of catalogTexts) score = Math.max(score, textSimilarity(t, b.transcript));
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  if (!best || bestScore >= SIM_THRESHOLD) return false;

  const part = batchToHorenPart(best.batch, teil, examId);
  if (!part) return false;
  exam.horenParts[idx] = { ...part, instruction: keepInstruction || part.instruction };
  triedFiles.add(best.file);
  return true;
}

function tryFixViolation(exam, mod, teil, poolT3, poolT5, h2Batches, h3Batches, catTexts, tried) {
  const key = `${exam.id}::${mod}::${teil}`;
  if (!tried.has(key)) tried.set(key, new Set());
  const triedFiles = tried.get(key);
  if (mod === 'lesen' && teil === 3) return swapLesenT3(exam, poolT3, catTexts, triedFiles);
  if (mod === 'lesen' && teil === 5) return swapLesenT5(exam, poolT5, catTexts, triedFiles);
  if (mod === 'horen' && teil === 2) return swapHorenTeil(exam, 2, h2Batches, catTexts, triedFiles);
  if (mod === 'horen' && teil === 3) return swapHorenTeil(exam, 3, h3Batches, catTexts, triedFiles);
  return false;
}

function resolveCrossExamViolations(exams, poolT3, poolT5) {
  const h2Batches = loadHorenBatches(2);
  const h3Batches = loadHorenBatches(3);
  const tried = new Map();
  let swaps = 0;

  for (let round = 0; round < 40; round++) {
    const normalized = exams.map((e) => normalizeExamStructure({ ...e }, { level: 'B1' }));
    const dedupe = validateCrossExamPassageUniqueness(
      normalized.map((exam, i) => ({
        id: exams[i].id,
        exam,
        label: exams[i].id,
      })),
    );
    if (dedupe.ok) return swaps;

    const v = pickViolationToFix(dedupe.violations);
    const idA = examIdFromLabel(v.examA);
    const idB = examIdFromLabel(v.examB);
    const exA = exams.find((e) => e.id === idA);
    const exB = exams.find((e) => e.id === idB);
    if (!exA || !exB) break;

    const m = String(v.moduleA || '').match(/(\w+) T(\d+)/i);
    if (!m) break;
    const mod = m[1].toLowerCase();
    const teil = Number(m[2]);

    const candidates = examSlot(exA) >= examSlot(exB) ? [exA, exB] : [exB, exA];
    let ok = false;
    let fixed = null;
    for (const target of candidates) {
      const catTexts = collectCatalogTexts(exams.filter((e) => e.id !== target.id)).texts;
      ok = tryFixViolation(target, mod, teil, poolT3, poolT5, h2Batches, h3Batches, catTexts, tried);
      if (ok) {
        fixed = target;
        const idx = exams.indexOf(target);
        exams[idx] = normalizeExamStructure(target, { level: 'B1' });
        break;
      }
    }
    if (!ok) {
      console.warn(`  ⚠  Stuck on: ${v.message}`);
      break;
    }
    swaps++;
    console.log(`  ↻  ${fixed.id}: fixed ${mod} T${teil} (${v.type})`);
  }
  return swaps;
}

function adsFingerprint(ads) {
  return (ads || [])
    .map((a) => String(a.text || a.title || '').trim())
    .filter(Boolean)
    .join('\n');
}

function optionsToAds(options) {
  return (options || [])
    .slice(0, 10)
    .map((o, i) => {
      const raw = String(o);
      const m = raw.match(/^([a-jA-J])\)\s*(.+)$/s);
      return {
        key: m ? m[1].toUpperCase() : String.fromCharCode(65 + i),
        title: '',
        text: m ? m[2].trim() : raw,
      };
    });
}

function batchToLesenT3Part(batch, keepInstruction) {
  const qs = (batch.questions || []).filter((q) => Number(q.teil) === 3);
  if (qs.length < 7) return null;
  const ads = optionsToAds(qs[0].options);
  if (ads.length < 10) return null;
  const text = batch.passage?.text || batch.text || batch.intro || batch.context || '';
  return {
    teil: 3,
    instruction: keepInstruction,
    text,
    textTitle: batch.passage?.title || batch.textTitle || '',
    ads,
    questions: qs.slice(0, 7).map((q) => ({ ...q })),
    example: { ...GOETHE_B1_LESEN_T3_EXAMPLE },
    _t3HasNoMatch: true,
  };
}

function loadPoolT3Candidates() {
  const out = [];
  const seenFp = new Set();
  for (const dir of POOL_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!/^lesen-t3-.+\.json$/i.test(file)) continue;
      let batch;
      try {
        batch = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      } catch {
        continue;
      }
      const part = batchToLesenT3Part(batch, null);
      if (!part) continue;
      const fp = adsFingerprint(part.ads);
      if (seenFp.has(fp)) continue;
      seenFp.add(fp);
      out.push({ file: path.relative(ROOT, path.join(dir, file)), part, fp });
    }
  }
  return out;
}

function diversifyLesenT3(exams, pool) {
  const usedFp = new Set();
  const usedFiles = new Set();
  const usedAdTexts = [];
  let swaps = 0;

  const hasCrossExamAdOverlap = (ads) => {
    for (const a of ads || []) {
      const t = String(a.text || a.title || '').trim();
      if (!t) continue;
      for (const prev of usedAdTexts) {
        if (textSimilarity(t, prev) >= 0.85) return true;
      }
    }
    return false;
  };

  const registerAds = (ads) => {
    for (const a of ads || []) {
      const t = String(a.text || a.title || '').trim();
      if (t) usedAdTexts.push(t);
    }
  };

  const pickCandidate = (ads) => {
    let best = null;
    let bestOverlap = Infinity;
    for (const p of pool) {
      if (usedFp.has(p.fp) || usedFiles.has(p.file)) continue;
      let overlap = 0;
      for (const a of p.part.ads || []) {
        const t = String(a.text || a.title || '').trim();
        if (!t) continue;
        for (const prev of usedAdTexts) {
          if (textSimilarity(t, prev) >= 0.85) overlap++;
        }
      }
      if (overlap === 0) return p;
      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        best = p;
      }
    }
    return bestOverlap <= 2 ? best : null;
  };

  const pickCandidateForced = () => {
    for (const p of pool) {
      if (!usedFp.has(p.fp) && !usedFiles.has(p.file)) return p;
    }
    return null;
  };

  for (const exam of exams.sort((a, b) => Number(a.slot || 0) - Number(b.slot || 0))) {
    const parts = exam.lesenParts || [];
    const idx = parts.findIndex((p) => Number(p.teil) === 3);
    if (idx < 0) continue;
    const current = parts[idx];
    const curFp = adsFingerprint(current.ads);
    const dup = (curFp && usedFp.has(curFp)) || hasCrossExamAdOverlap(current.ads);

    if (!dup && curFp) {
      usedFp.add(curFp);
      registerAds(current.ads);
      continue;
    }

    let candidate = pickCandidate(current.ads);
    if (!candidate) candidate = pickCandidateForced();
    if (!candidate) {
      console.warn(`  ⚠  No low-overlap pool T3 for ${exam.id || exam.examId} — keeping current`);
      if (curFp) usedFp.add(curFp);
      registerAds(current.ads);
      continue;
    }

    parts[idx] = {
      ...candidate.part,
      instruction: current.instruction || candidate.part.instruction,
    };
    usedFp.add(candidate.fp);
    usedFiles.add(candidate.file);
    registerAds(candidate.part.ads);
    swaps++;
    console.log(`  ↔  ${exam.id || exam.examId}: Lesen T3 ← ${candidate.file}`);
  }
  return swaps;
}

function countCrossExamDupes(exams) {
  const ads = [];
  for (const ex of exams) {
    const t3 = (ex.lesenParts || []).find((p) => Number(p.teil) === 3);
    for (const a of t3?.ads || []) {
      ads.push(String(a.text || '').trim());
    }
  }
  let pairs = 0;
  for (let i = 0; i < ads.length; i++) {
    for (let j = i + 1; j < ads.length; j++) {
      if (ads[i] && textSimilarity(ads[i], ads[j]) >= 0.85) pairs++;
    }
  }
  return pairs;
}

function horenBatchTranscript(batch) {
  const p0 = batch.passage || batch.passages?.[0] || {};
  return String(p0.transcript || p0.text || batch.transcript || '').trim();
}

function diversifyHorenTeils(exams, teil, poolDir) {
  if (!fs.existsSync(poolDir)) return 0;
  const batches = fs
    .readdirSync(poolDir)
    .filter((f) => new RegExp(`^horen-t${teil}-.+\\.json$`, 'i').test(f))
    .map((file) => {
      try {
        return { file, batch: JSON.parse(fs.readFileSync(path.join(poolDir, file), 'utf8')) };
      } catch {
        return null;
      }
    })
    .filter((b) => b && horenBatchTranscript(b.batch));

  const usedTranscripts = new Set();
  const usedFiles = new Set();
  let swaps = 0;

  for (const exam of exams.sort((a, b) => Number(a.slot || 0) - Number(b.slot || 0))) {
    const part = (exam.horenParts || []).find((p) => Number(p.teil) === teil);
    if (!part) continue;
    const tx = String(part.transcript || part.segments?.[0]?.transcript || '').trim();
    if (tx && !usedTranscripts.has(tx)) {
      usedTranscripts.add(tx);
      continue;
    }

    const candidate = batches.find(({ file, batch }) => {
      if (usedFiles.has(file)) return false;
      const btx = horenBatchTranscript(batch);
      return btx && !usedTranscripts.has(btx);
    });
    if (!candidate) continue;

    const btx = horenBatchTranscript(candidate.batch);
    const qs = (candidate.batch.questions || []).filter((q) => Number(q.teil) === teil);
    part.transcript = btx;
    part.segments = [
      {
        id: `${exam.id || 'exam'}-h${teil}-seg0`,
        label: 'Aufnahme',
        transcript: btx,
        passageId: `${exam.id || 'exam'}-h${teil}`,
        questions: qs.map((q) => ({ ...q })),
      },
    ];
    part.questions = part.segments[0].questions;
    part.passageId = part.segments[0].passageId;
    usedTranscripts.add(btx);
    usedFiles.add(candidate.file);
    swaps++;
    console.log(`  ↔  ${exam.id}: Hören T${teil} ← ${candidate.file}`);
  }
  return swaps;
}

function main() {
  if (!fs.existsSync(TARGET)) {
    console.error('Missing', TARGET);
    process.exit(1);
  }

  const pool = loadPoolT3Candidates();
  console.log(`Pool Lesen T3 candidates: ${pool.length}`);

  const exams = JSON.parse(fs.readFileSync(TARGET, 'utf8'));
  if (!Array.isArray(exams)) throw new Error('Expected exam array');

  const dupBefore = countCrossExamDupes(exams);
  console.log(`Cross-exam T3 ad dup pairs (before): ${dupBefore}`);

  const swaps = diversifyLesenT3(exams, pool);
  const hSwaps = diversifyHorenTeils(exams, 3, POOL_VERIFIED_B1);

  for (let i = 0; i < exams.length; i++) {
    exams[i] = normalizeExamStructure(exams[i], { level: 'B1' });
  }

  const poolT5 = loadLesenT5Candidates();
  console.log(`Pool Lesen T5 candidates: ${poolT5.length}`);
  console.log('Resolving cross-exam dedupe violations…');
  const crossSwaps = resolveCrossExamViolations(exams, pool, poolT5);
  console.log('Nudging similar Lesen T3 ads…');
  const adFixes = repairLesenT3SimilarAds(exams);

  for (let i = 0; i < exams.length; i++) {
    exams[i] = normalizeExamStructure(exams[i], { level: 'B1' });
  }

  const dupAfter = countCrossExamDupes(exams);
  const finalDedupe = validateCrossExamPassageUniqueness(
    exams.map((exam) => ({ id: exam.id, exam, label: exam.id })),
  );
  console.log(`Lesen T3 swaps: ${swaps}`);
  console.log(`Hören T3 swaps: ${hSwaps}`);
  console.log(`Cross-exam iterative swaps: ${crossSwaps}`);
  console.log(`Lesen T3 ad nudges: ${adFixes}`);
  console.log(`Cross-exam T3 ad dup pairs (after): ${dupAfter}`);
  console.log(
    `Cross-exam dedupe: ${finalDedupe.ok ? 'OK' : `FAIL (${finalDedupe.violations.length} left)`}`,
  );
  if (!finalDedupe.ok) {
    for (const v of finalDedupe.violations.slice(0, 8)) {
      console.log(`       - ${v.message}`);
    }
  }

  if (!APPLY) {
    console.log('\n[dry-run] Re-run with --apply to write', path.relative(ROOT, TARGET));
    return;
  }

  fs.writeFileSync(TARGET, `${JSON.stringify(exams, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${exams.length} exams → ${path.relative(ROOT, TARGET)}`);
}

main();
