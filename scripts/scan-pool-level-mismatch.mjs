#!/usr/bin/env node
/**
 * Scan pool-verified + official exams for folder vs JSON level mismatch.
 * Moves cross-level pool files to the correct pool-verified/{level}/ dir.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT,
} from './lib/loadEnv.mjs';
import {
  inferBatchLevel,
  normalizeLevel,
  poolVerifiedDir,
  POOL_VERIFIED_DIR,
  needsRegenerationDir,
  NEEDS_REGEN_ROOT,
} from './lib/batchPaths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry-run');
const REPORT = path.join(ROOT, 'batches/ready/gate-logs/pool-level-mismatch-scan.json');

function walkJson(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJson(abs, out);
    else if (ent.name.endsWith('.json') && !ent.name.startsWith('.')) out.push(abs);
  }
  return out;
}

function folderLevel(absPath) {
  const rel = path.relative(POOL_VERIFIED_DIR, absPath).replace(/\\/g, '/');
  const m = rel.match(/^(B1|A2|B2|C1)\//);
  if (m) return m[1];
  const m2 = rel.match(/^(B1|A2|B2|C1)\//);
  if (m2) return m2[1];
  const parts = rel.split('/');
  if (['B1', 'A2', 'B2', 'C1'].includes(parts[0])) return parts[0];
  return null; // legacy flat pool-verified/
}

function scanBatchFile(absPath, folderLv) {
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (e) {
    return { absPath, error: e.message, action: 'skip_unreadable' };
  }
  const inferred = inferBatchLevel(batch);
  const rel = path.relative(ROOT, absPath).replace(/\\/g, '/');
  const base = path.basename(absPath);

  if (inferred === 'MIXED') {
    return {
      rel,
      folderLevel: folderLv,
      inferred,
      action: 'needs_regeneration',
      reason: 'mixed_levels_in_json',
    };
  }

  if (!folderLv) {
    // legacy flat — relocate if inferred differs from implicit B1 assumption
    if (inferred !== 'B1') {
      return { rel, folderLevel: '(flat)', inferred, action: 'move', destLevel: inferred };
    }
    return null;
  }

  if (inferred !== folderLv) {
    return { rel, folderLevel: folderLv, inferred, action: 'move', destLevel: inferred };
  }
  return null;
}

function movePoolFile(absPath, destLevel) {
  const base = path.basename(absPath);
  const destDir = poolVerifiedDir(destLevel);
  fs.mkdirSync(destDir, { recursive: true });
  let dest = path.join(destDir, base);
  if (fs.existsSync(dest)) {
    dest = path.join(destDir, `${Date.now()}-${base}`);
  }
  if (!DRY) fs.renameSync(absPath, dest);
  return path.relative(ROOT, dest).replace(/\\/g, '/');
}

function moveToNeedsRegen(absPath, level, reason) {
  const base = path.basename(absPath);
  const destDir = needsRegenerationDir(level || 'B1');
  fs.mkdirSync(destDir, { recursive: true });
  let dest = path.join(destDir, base);
  if (fs.existsSync(dest)) dest = path.join(destDir, `${Date.now()}-${base}`);
  if (!DRY) {
    const batch = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    fs.writeFileSync(dest, `${JSON.stringify({ _poolLevelMismatch: reason, ...batch }, null, 2)}\n`);
    fs.unlinkSync(absPath);
  }
  return path.relative(ROOT, dest).replace(/\\/g, '/');
}

function scanOfficialExams() {
  const findings = [];
  for (const lv of ['B1', 'A2']) {
    const dir = path.join(ROOT, 'library/published-exams/de', lv);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
      const abs = path.join(dir, f);
      let exam;
      try {
        exam = JSON.parse(fs.readFileSync(abs, 'utf8'));
      } catch {
        continue;
      }
      for (const part of exam.parts || []) {
        const snap = part.snapshot || part;
        const mini = {
          level: snap.level,
          questions: snap.questions || [],
          passages: snap.passages || (snap.passage ? [snap.passage] : []),
        };
        const inferred = inferBatchLevel(mini);
        const src = part.sourceFile || part.file || part.cell || '?';
        if (inferred !== lv && inferred !== 'B1' && inferred !== 'MIXED') {
          findings.push({
            exam: `library/published-exams/de/${lv}/${f}`,
            cell: part.cell,
            sourceFile: src,
            examLevel: lv,
            partInferred: inferred,
          });
        } else if (inferred === 'MIXED') {
          findings.push({
            exam: `library/published-exams/de/${lv}/${f}`,
            cell: part.cell,
            sourceFile: src,
            examLevel: lv,
            partInferred: 'MIXED',
          });
        } else if (inferred === 'A2' && lv === 'B1') {
          findings.push({
            exam: `library/published-exams/de/${lv}/${f}`,
            cell: part.cell,
            sourceFile: src,
            examLevel: lv,
            partInferred: 'A2',
          });
        } else if (inferred === 'B1' && lv === 'A2' && batchHasExplicitA2(mini)) {
          findings.push({
            exam: `library/published-exams/de/${lv}/${f}`,
            cell: part.cell,
            sourceFile: src,
            examLevel: lv,
            partInferred: 'B1',
          });
        }
      }
    }
  }
  return findings;
}

function batchHasExplicitA2(batch) {
  for (const q of batch.questions || []) {
    if (normalizeLevel(q.level) === 'A2') return true;
  }
  for (const p of batch.passages || []) {
    if (normalizeLevel(p.level) === 'A2') return true;
  }
  return normalizeLevel(batch.level) === 'A2';
}

function scanNeedsRegen() {
  const mismatches = [];
  if (!fs.existsSync(NEEDS_REGEN_ROOT)) return mismatches;
  for (const abs of walkJson(NEEDS_REGEN_ROOT)) {
    const rel = path.relative(NEEDS_REGEN_ROOT, abs).replace(/\\/g, '/');
    const folderLv = rel.split('/')[0];
    if (!['B1', 'A2'].includes(folderLv)) continue;
    const m = scanBatchFile(abs, folderLv);
    if (m) mismatches.push({ ...m, pool: 'needs-regeneration' });
  }
  return mismatches;
}

// ── main ──
const poolFiles = walkJson(POOL_VERIFIED_DIR);
const mismatches = [];
const moved = [];

for (const abs of poolFiles) {
  const folderLv = folderLevel(abs);
  const m = scanBatchFile(abs, folderLv);
  if (!m) continue;
  mismatches.push(m);

  if (m.action === 'move' && m.destLevel) {
    const dest = movePoolFile(abs, m.destLevel);
    moved.push({ from: m.rel, to: dest, inferred: m.inferred });
  } else if (m.action === 'needs_regeneration') {
    const dest = moveToNeedsRegen(abs, m.folderLevel, m.reason);
    moved.push({ from: m.rel, to: dest, action: 'needs_regeneration' });
  }
}

const needsRegenMismatches = scanNeedsRegen();
const examFindings = scanOfficialExams();

const report = {
  scannedAt: new Date().toISOString(),
  dryRun: DRY,
  poolVerifiedScanned: poolFiles.length,
  mismatchesFound: mismatches.length,
  mismatches,
  moved,
  needsRegenerationMismatches: needsRegenMismatches,
  officialExamFindings: examFindings,
  summary: {
    b1FolderWithA2Content: mismatches.filter((m) => m.folderLevel === 'B1' && m.inferred === 'A2').length,
    a2FolderWithB1Content: mismatches.filter((m) => m.folderLevel === 'A2' && m.inferred === 'B1').length,
    flatLegacy: mismatches.filter((m) => m.folderLevel === '(flat)').length,
    mixed: mismatches.filter((m) => m.inferred === 'MIXED').length,
    officialExamsCrossLevel: examFindings.length,
  },
};

fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report.summary, null, 2));
console.log(`mismatches: ${mismatches.length}, moved: ${moved.length}, exam issues: ${examFindings.length}`);
console.log(`report: ${path.relative(ROOT, REPORT)}`);
if (mismatches.length) {
  for (const m of mismatches.slice(0, 40)) {
    console.log(`  ${m.rel} folder=${m.folderLevel} json=${m.inferred} → ${m.action}${m.destLevel ? ' ' + m.destLevel : ''}`);
  }
  if (mismatches.length > 40) console.log(`  ... +${mismatches.length - 40} more`);
}
if (examFindings.length) {
  console.log('OFFICIAL EXAM CROSS-LEVEL:');
  for (const e of examFindings) console.log(`  ${e.exam} ${e.cell} inferred=${e.partInferred}`);
}
