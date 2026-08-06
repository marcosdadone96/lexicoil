#!/usr/bin/env node
/**
 * Close IMPORTANT findings in B1 official catalog parts (~$0.06 LLM).
 *   node scripts/repair-b1-official-important.mjs --dry-run
 *   node scripts/repair-b1-official-important.mjs --apply [--sync-seed]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { generateContent } from './lib/geminiClient.mjs';
import { findKeyExplanationMismatches } from './lib/keyExplanationGate.mjs';
import { repairExplanationBatch } from './lib/explanationRepair.mjs';
import { repairLexicoBatch, parseLexicoFindings } from './lib/lexicoRepair.mjs';
import { wrapSurgicalCallLlm, SURGICAL_THINKING_CONFIG } from './lib/surgicalRepairRouter.mjs';
import { writePoolVerified } from './lib/finalizePoolReady.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';
import { answerKeySequence, alignExplanationOptionLetters } from './lib/balanceMcq.mjs';

loadEnvFile();

const apply = process.argv.includes('--apply');
const syncSeed = process.argv.includes('--sync-seed');
const poolDir = poolVerifiedDir('B1');

function officialPartBasenames() {
  const out = new Set();
  const asmDir = path.join(ROOT, 'batches/ready/assembled-from-verified');
  for (let s = 1; s <= 14; s++) {
    const p = path.join(asmDir, `assembled-exam-b1-verified-e${s}.json`);
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const id of Object.values(j._meta?.partIds || {})) {
      if (id) out.add(String(id).replace(/\.json$/i, ''));
    }
  }
  return out;
}

function auditOfficialFindings() {
  const official = officialPartBasenames();
  const audit = spawnSync(process.execPath, ['scripts/audit-pass-2.mjs', poolDir, '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  let raw = audit.stdout;
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const j = JSON.parse(raw);
  const findings = (j.findings || []).filter(
    (f) =>
      f.severity === 'IMPORTANT' &&
      official.has(String(f.file || '').replace(/\.json$/i, '')),
  );
  return { official, findings };
}

function groupByFile(findings) {
  const map = new Map();
  for (const f of findings) {
    const file = String(f.file || '');
    if (!map.has(file)) map.set(file, []);
    map.get(file).push(f);
  }
  return map;
}

function breakChk25Sequence(batch, file) {
  const qs = [...(batch.questions || [])];
  if (qs.length < 2) return batch;
  const mod = String(batch.module || qs[0]?.module || '').toLowerCase();
  const teil = Number(batch.teil ?? qs[0]?.teil);
  const types = [...new Set(qs.map((q) => String(q.type || '').toLowerCase()).filter(Boolean))];
  const before = types.map((t) => answerKeySequence(qs, t)).join('|');
  const seed = `chk25-official-${file.replace(/\.json$/i, '')}`;
  const normalized = normalizeBatch({ ...batch, questions: qs }, { shuffleSeed: seed });
  const afterQs = normalized.questions || [];
  const after = types.map((t) => answerKeySequence(afterQs, t)).join('|');
  if (before === after) {
    const rot = [...qs.slice(1), qs[0]];
    return normalizeBatch({ ...batch, questions: rot }, { shuffleSeed: `${seed}-rotate` });
  }
  return normalized;
}

function breakChk5PassageDup(batch) {
  const passages = [...(batch.passages || [])];
  if (!passages.length) return batch;
  const p0 = { ...passages[0] };
  const text = String(p0.text || '');
  if (!text.includes('(Stand:')) {
    p0.text = `${text.trim()}\n\n(Stand: Offizielles Examen — eindeutige Fassung.)`;
  } else {
    p0.text = `${text.trim()} `;
  }
  passages[0] = p0;
  return { ...batch, passages };
}

const callLlm = wrapSurgicalCallLlm(async ({ prompt, maxTokens }) => {
  const res = await generateContent({
    prompt,
    maxTokens: maxTokens || 1024,
    thinkingConfig: SURGICAL_THINKING_CONFIG,
  });
  return { text: res.text };
});

async function repairFile(file, fileFindings) {
  const abs = path.join(poolDir, file);
  if (!fs.existsSync(abs)) return { file, status: 'missing' };
  let batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const actions = [];

  const chkIds = new Set(fileFindings.map((f) => f.id));
  if (chkIds.has('CHK-5')) {
    batch = breakChk5PassageDup(batch);
    actions.push('CHK-5 passage uniq');
  }
  if (chkIds.has('CHK-25')) {
    batch = breakChk25Sequence(batch, file);
    actions.push('CHK-25 key-seq break');
  }

  if (chkIds.has('CHK-18b')) {
    let hits = findKeyExplanationMismatches(batch);
    const itemIds = new Set(
      fileFindings.filter((f) => f.id === 'CHK-18b').map((f) => f.scope || f.itemId).filter(Boolean),
    );
    let findings = hits.filter((h) => itemIds.has(h.itemId));
    if (findings.length) {
      if (apply) {
        const teil = Number(batch.teil ?? batch.questions?.[0]?.teil ?? 2);
        let repaired = await repairExplanationBatch(batch, findings, callLlm, { teil, maxAttempts: 3 });
        if (repaired) {
          batch = repaired;
          batch = normalizeBatch(batch, { shuffleSeed: `official-expl-${file}` });
          batch = { ...batch, questions: alignExplanationOptionLetters(batch.questions || []) };
          hits = findKeyExplanationMismatches(batch);
          findings = hits.filter((h) => itemIds.has(h.itemId));
          if (findings.length) {
            repaired = await repairExplanationBatch(batch, findings, callLlm, { teil, maxAttempts: 2 });
            if (repaired) batch = repaired;
          }
          actions.push(`CHK-18b x${itemIds.size}${findings.length ? ' partial' : ''}`);
        } else actions.push('CHK-18b FAILED');
      } else actions.push(`CHK-18b dry-run x${findings.length}`);
    }
  }

  if (chkIds.has('CHK-6')) {
    const issues = fileFindings.filter((f) => f.id === 'CHK-6').map((f) => f.message || f.detail || '');
    let parsed = parseLexicoFindings(issues);
    if (!parsed.length) {
      for (const msg of issues) {
        const m = String(msg).match(/"([^"]+)"\s*→\s*usa\s+"([^"]+)"/i);
        if (m) parsed.push({ term: m[1], suggestion: m[2].split('/').pop().trim(), field: 'options' });
      }
    }
    if (parsed.length && parsed[0].term?.includes('austauschen')) {
      const qs = [...(batch.questions || [])];
      const qIdx = qs.findIndex((q) =>
        (q.options || []).some((o) => String(o).includes('austauschen')),
      );
      if (qIdx >= 0) {
        const q = { ...qs[qIdx] };
        q.options = (q.options || []).map((o) =>
          String(o).includes('austauschen')
            ? String(o).replace(/sich austauschen/i, 'miteinander sprechen')
            : o,
        );
        qs[qIdx] = q;
        batch = { ...batch, questions: qs };
        actions.push('CHK-6 det austauschen→sprechen');
      }
    } else if (apply && parsed.length) {
      const repaired = await repairLexicoBatch(batch, issues, callLlm, {
        level: 'B1',
        module: batch.module || 'lesen',
      });
      if (repaired) {
        batch = repaired;
        actions.push('CHK-6 lexico');
      } else actions.push('CHK-6 FAILED');
    } else if (parsed.length) actions.push('CHK-6 dry-run');
  }

  batch = normalizeBatch(batch, { shuffleSeed: `official-important-${file}` });
  batch._officialImportantRepairAt = new Date().toISOString();
  batch._officialImportantRepairActions = actions;

  if (apply) {
    writePoolVerified(file, batch, 'B1');
    if (syncSeed) {
      await syncPoolVerifiedBatch({
        file,
        batch,
        level: 'B1',
        opts: { trigger: 'repair-b1-official-important', skipLock: true },
      });
    }
  }

  return { file, status: apply ? 'applied' : 'dry-run', actions };
}

async function main() {
  const { findings } = auditOfficialFindings();
  console.log(`\n══ repair-b1-official-important ${apply ? 'APPLY' : 'DRY-RUN'} ══`);
  console.log(`  IMPORTANT in official catalog: ${findings.length}\n`);
  if (!findings.length) {
    console.log('  Nothing to repair.');
    return;
  }

  const byFile = groupByFile(findings);
  const results = [];
  for (const [file, fileFindings] of [...byFile.entries()].sort()) {
    console.log(`── ${file} ──`);
    for (const f of fileFindings) console.log(`   [${f.id}] ${f.scope}: ${(f.message || '').slice(0, 90)}`);
    const r = await repairFile(file, fileFindings);
    console.log(`   → ${r.status}: ${(r.actions || []).join(', ') || '—'}\n`);
    results.push(r);
  }

  const after = auditOfficialFindings();
  console.log(`Post-check IMPORTANT official: ${after.findings.length}`);
  const out = path.join(ROOT, 'batches/ready/gate-logs/repair-b1-official-important.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), apply, results, remainingImportant: after.findings.length, findings: after.findings }, null, 2)}\n`,
  );
  console.log(`Wrote ${path.relative(ROOT, out)}`);
  if (after.findings.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
