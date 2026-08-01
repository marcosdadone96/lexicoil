#!/usr/bin/env node
/**
 * One-shot project state snapshot (read-only) for gate-logs audit doc.
 *   node scripts/audit-full-state-snapshot.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPassageContentTopic, scorePassageTopics } from './lib/qualityGates/contentTopicCheck.mjs';
import { loadPoolRecords, countTopicStock } from './lib/poolGapPlanner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = ['B1', 'A2', 'B2'];
const MODULES = ['lesen', 'horen', 'schreiben', 'sprechen'];

function loadBlueprint(level) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints', `goethe_${level}.json`), 'utf8'));
}

function parseCell(filename, level) {
  const m = filename.match(/^(lesen|horen|schreiben|sprechen)(?:-t(\d+))?/i);
  if (!m) return null;
  return { level, module: m[1].toLowerCase(), teil: m[2] ? Number(m[2]) : 1 };
}

function scanPoolVerified() {
  const byCell = {};
  for (const level of LEVELS) {
    const dir = path.join(ROOT, 'batches/ready/pool-verified', level);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const cell = parseCell(f, level);
      if (!cell) continue;
      const key = `${level}:${cell.module}:T${cell.teil}`;
      if (!byCell[key]) byCell[key] = { gemini: 0, curated: 0, other: 0, files: [] };
      if (/-cur-/.test(f)) byCell[key].curated++;
      else if (/-gemini-/.test(f)) byCell[key].gemini++;
      else byCell[key].other++;
      byCell[key].files.push(f);
    }
  }
  return byCell;
}

function classifyB1Tier(key, pool) {
  const p = pool[key] || { gemini: 0, curated: 0 };
  if (p.gemini > 0) return 'PUBLISHED_GEMINI';
  if (p.curated > 0) return 'CURATED_ONLY';
  return 'NEVER_TOUCHED';
}

function scanTopicMismatch(level) {
  const dir = path.join(ROOT, 'batches/ready/pool-verified', level);
  const hits = [];
  if (!fs.existsSync(dir)) return hits;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const fp = path.join(dir, f);
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch {
      continue;
    }
    const requested = batch._requestedTopic || batch.topicTag || batch._resolvedTopic;
    const tag = batch.topicTag || batch.passages?.[0]?.topicTag;
    for (const p of batch.passages || []) {
      const text = String(p.text || p.title || '').trim();
      if (!text) continue;
      const topicForCheck = p.topicTag || tag || requested;
      if (!topicForCheck) continue;
      const r = checkPassageContentTopic(text, topicForCheck, { level, module: batch.passages?.[0]?.module || 'lesen' });
      if (!r.ok) {
        hits.push({ file: `${level}/${f}`, passageId: p.id, topicTag: topicForCheck, reason: r.reason, detail: r.detail || r.issue });
      }
    }
    // batch-level topicTag vs content
    if (requested && tag && String(requested).toLowerCase() !== String(tag).toLowerCase()) {
      hits.push({ file: `${level}/${f}`, kind: 'tag_vs_requested', requested, tag });
    }
  }
  return hits;
}

function scanMetadataStamps(level) {
  const dir = path.join(ROOT, 'batches/ready/pool-verified', level);
  const missing = [];
  if (!fs.existsSync(dir)) return missing;
  const STAMP_FIELDS = ['_poolReadyAt', '_publishedAt', '_qcVersion'];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    if (/-cur-/.test(f)) continue;
    const batch = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const absent = STAMP_FIELDS.filter((k) => batch[k] == null);
    const levelMismatch = (batch.level || batch.questions?.[0]?.level) !== level;
    const qLevelBad = (batch.questions || []).some((q) => q.level && q.level !== level);
    if (absent.length || levelMismatch || qLevelBad) {
      missing.push({
        file: `${level}/${f}`,
        absentStamps: absent,
        levelMismatch: levelMismatch ? { batch: batch.level, expected: level } : null,
        qLevelBad: qLevelBad ? (batch.questions || []).filter((q) => q.level && q.level !== level).length : 0,
      });
    }
  }
  return missing;
}

function aggregateCost(datePrefix = '2026-08-01') {
  const logPath = path.join(ROOT, 'batches/ready/gate-logs/generation-cost.jsonl');
  const byLevel = {};
  let total = 0;
  let ok = 0;
  let fail = 0;
  for (const line of fs.readFileSync(logPath, 'utf8').split('\n')) {
    if (!line.includes(datePrefix)) continue;
    const e = JSON.parse(line);
    total += e.costUsd || 0;
    if (e.ok) ok++;
    else fail++;
    const lv = e.level || (e.file?.match(/\/(B1|A2|B2)\//)?.[1]) || '?';
    if (!byLevel[lv]) byLevel[lv] = { cost: 0, ok: 0, fail: 0 };
    byLevel[lv].cost += e.costUsd || 0;
    if (e.ok) byLevel[lv].ok++;
    else byLevel[lv].fail++;
  }
  return { total, ok, fail, byLevel, calls: ok + fail };
}

function summarizeAuditPass2(jsonPath) {
  if (!fs.existsSync(jsonPath)) return null;
  const raw = fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, '');
  const j = JSON.parse(raw);
  const byChk = {};
  for (const f of j.findings || []) {
    const id = f.id || '?';
    if (!byChk[id]) byChk[id] = { CRITICAL: 0, IMPORTANT: 0, MINOR: 0, INFO: 0 };
    byChk[id][f.severity || 'MINOR'] = (byChk[id][f.severity || 'MINOR'] || 0) + 1;
  }
  const criticalFiles = [...new Set((j.findings || []).filter((f) => f.severity === 'CRITICAL').map((f) => f.file))];
  const importantFiles = (j.fileGroups?.important || []).length;
  return {
    summary: j.summary,
    fileGroups: {
      clean: (j.fileGroups?.clean || []).length,
      cosmeticOnly: (j.fileGroups?.cosmeticOnly || []).length,
      important: importantFiles,
      critical: (j.fileGroups?.critical || []).length,
    },
    topChecks: Object.entries(byChk)
      .map(([id, c]) => ({ id, ...c, total: c.CRITICAL + c.IMPORTANT + c.MINOR + c.INFO }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12),
    criticalFiles: criticalFiles.slice(0, 20),
  };
}

// Build B1 grid from blueprint
const b1Grid = [];
for (const mod of loadBlueprint('B1').modules) {
  for (const part of mod.parts) {
    b1Grid.push({ level: 'B1', module: mod.id, teil: part.teil, key: `B1:${mod.id}:T${part.teil}` });
  }
}

const pool = scanPoolVerified();
const b1Cells = b1Grid.map((c) => ({
  ...c,
  stock: pool[c.key] || { gemini: 0, curated: 0, other: 0 },
  tier: classifyB1Tier(c.key, pool),
}));

const topicMismatch = {
  B1: scanTopicMismatch('B1'),
  A2: scanTopicMismatch('A2'),
  B2: scanTopicMismatch('B2'),
};

const metadataStamps = {
  B1: scanMetadataStamps('B1'),
  A2: scanMetadataStamps('A2'),
  B2: scanMetadataStamps('B2'),
};

const costToday = aggregateCost('2026-08-01');
const costAllTimeLesenT2 = (() => {
  let t = 0;
  for (const line of fs.readFileSync(path.join(ROOT, 'batches/ready/gate-logs/generation-cost.jsonl'), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.module === 'lesen' && Number(e.teil) === 2 && (e.level === 'A2' || e.file?.includes('/A2/'))) t += e.costUsd || 0;
    } catch {}
  }
  return t;
})();

const out = {
  generatedAt: new Date().toISOString(),
  poolByCell: pool,
  b1Cells,
  topicMismatchCounts: {
    B1: topicMismatch.B1.length,
    A2: topicMismatch.A2.length,
    B2: topicMismatch.B2.length,
  },
  topicMismatchSamples: {
    B1: topicMismatch.B1.slice(0, 15),
    A2: topicMismatch.A2.slice(0, 15),
    B2: topicMismatch.B2.slice(0, 15),
  },
  metadataStampIssues: {
    B1: metadataStamps.B1.length,
    A2: metadataStamps.A2.length,
    B2: metadataStamps.B2.length,
  },
  metadataStampSamples: {
    B1: metadataStamps.B1.slice(0, 10),
    A2: metadataStamps.A2.slice(0, 10),
    B2: metadataStamps.B2.slice(0, 10),
  },
  auditPass2: {
    B1: summarizeAuditPass2(path.join(ROOT, 'batches/ready/gate-logs/audit-pass2-pool-B1-2026-08-01.json')),
    A2: summarizeAuditPass2(path.join(ROOT, 'batches/ready/gate-logs/audit-pass2-pool-A2-2026-08-01.json')),
    B2: summarizeAuditPass2(path.join(ROOT, 'batches/ready/gate-logs/audit-pass2-pool-B2-2026-08-01.json')),
  },
  costToday,
  costAllTimeA2LesenT2Usd: Math.round(costAllTimeLesenT2 * 10000) / 10000,
};

const outPath = path.join(ROOT, 'batches/ready/gate-logs/full-state-snapshot-2026-08-01.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('Wrote', outPath);
console.log('Topic mismatch:', out.topicMismatchCounts);
console.log('Metadata stamp issues:', out.metadataStampIssues);
console.log('Cost today:', out.costToday.total.toFixed(4));
