#!/usr/bin/env node
/**
 * Cierre Hören T3 e2/e4: retirar 039/040, assembled → 072/073, republicar.
 *   node scripts/close-a2-horen-t3-e2-e4.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { publishVerifiedExamSlots } from './lib/verifiedExamPublishLib.mjs';

const poolA2 = path.join(ROOT, 'batches/ready/pool-verified/A2');
const asmDir = path.join(ROOT, 'batches/ready/assembled-from-verified');
const logDir = path.join(ROOT, 'batches/ready/gate-logs');
const report = { at: new Date().toISOString(), steps: [] };

function step(name, data) {
  report.steps.push({ name, ...data });
}

const RETIRE = ['horen-t3-gemini-039.json', 'horen-t3-gemini-040.json'];
for (const file of RETIRE) {
  const abs = path.join(poolA2, file);
  const exists = fs.existsSync(abs);
  if (exists) fs.unlinkSync(abs);
  const hist = path.join(ROOT, 'batches/needs-regeneration/A2', file);
  step('retire_from_pool_verified', {
    file,
    removedFromPool: exists,
    historicalCopyExists: fs.existsSync(hist),
    retiredReason: fs.existsSync(hist)
      ? JSON.parse(fs.readFileSync(hist, 'utf8'))._poolRetiredReason
      : null,
  });
}

const patches = [
  {
    asm: 'assembled-exam-a2-verified-e2.json',
    slot: 2,
    oldPart: 'horen-t3-gemini-039',
    newPart: 'horen-t3-gemini-072',
    oldFile: 'horen-t3-gemini-039.json',
    newFile: 'horen-t3-gemini-072.json',
  },
  {
    asm: 'assembled-exam-a2-verified-e4.json',
    slot: 4,
    oldPart: 'horen-t3-gemini-040',
    newPart: 'horen-t3-gemini-073',
    oldFile: 'horen-t3-gemini-040.json',
    newFile: 'horen-t3-gemini-073.json',
  },
];

for (const p of patches) {
  const fp = path.join(asmDir, p.asm);
  let text = fs.readFileSync(fp, 'utf8');
  const before = text.includes(p.oldPart);
  text = text.split(p.oldPart).join(p.newPart);
  text = text.split(p.oldFile).join(p.newFile);
  const parsed = JSON.parse(text);
  parsed._meta = parsed._meta || {};
  parsed._meta.horenT3RepairAt = report.at;
  parsed._meta.horenT3RepairNote = `horen_3 ${p.oldPart} → ${p.newPart} (hot-pair successors)`;
  fs.writeFileSync(fp, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  step('patch_assembled', {
    file: p.asm,
    slot: p.slot,
    horen_3: parsed._meta.partIds?.horen_3,
    hadOldPart: before,
  });
}

const publish = await publishVerifiedExamSlots({
  slots: [2, 4],
  lang: 'de',
  level: 'A2',
  dryRun: false,
  syncServed: true,
});
step('publish', { slots: publish.published, liveExams: publish.liveExams });

const out = path.join(logDir, 'a2-horen-t3-e2-e4-close-evidence.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
console.log('Wrote', path.relative(ROOT, out));
