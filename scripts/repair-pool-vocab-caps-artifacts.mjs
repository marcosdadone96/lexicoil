#!/usr/bin/env node
/**
 * Repair historical vocab-lemma + German caps artifacts in pool-verified (B1/A2).
 * Deterministic — normalizeBatch + enrichBatchMetadata (no LLM).
 *
 *   node scripts/repair-pool-vocab-caps-artifacts.mjs --dry-run
 *   node scripts/repair-pool-vocab-caps-artifacts.mjs --apply
 *   node scripts/repair-pool-vocab-caps-artifacts.mjs --apply --sync-seed
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { inferBatchLevel } from './lib/batchPaths.mjs';
import { enrichBatchMetadata } from './lib/enrichBatchMetadata.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';
import { decapitalizeMidSentence } from './lib/capitalizeNouns.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';
import { runGermanContentLanguageGate } from './lib/qualityGates/germanContentLanguageGate.mjs';

const LEVELS = ['B1', 'A2'];
const POOL_ROOT = path.join(ROOT, 'batches/ready/pool-verified');

/** Truncated / bogus lemmas from pre-2026-07-24 lemmatizer. */
const LEMMA_ARTIFACT_RE =
  /\b(direken|interessanen|handelen|behandelen|weiterhi|anstaten|änderen|kaputen|prägnanen|robuen|hinterlässen|vermisen|beeinflusen|direkteen|findeen|arbeiteen)\b/i;

/** Wrong capitalization in vocabularyTags (structured check — no JSON regex FP). */
const BAD_VOCAB_TAG_CAP = /^(Viele|Vielen|Langen|Täglichen|Technischen|Direken|Interessanen|Handelen|Weiterhi|Behandelen|Anstaten|Kaputen|Prägnanen)$/;

const LEMMA_GROUND_TRUTH_REPLACE = {
  interessanen: 'interessieren',
  kaputen: 'kaputt',
  direken: 'direkt',
  handelen: 'handeln',
  behandelen: 'behandeln',
  weiterhi: 'weiterhin',
  anstaten: 'anstatt',
  änderen: 'ändern',
  prägnanen: 'prägnant',
  robuen: 'robust',
  hinterlässen: 'hinterlassen',
  vermisen: 'vermissen',
  beeinflusen: 'beeinflussen',
  direkteen: 'direkt',
  findeen: 'finden',
  arbeiteen: 'arbeiten',
  sophi: 'Sophie',
  podcaen: 'podcast',
  kunen: 'Kunst',
  zukunfen: 'Zukunft',
  zeitschrifen: 'Zeitschrift',
  informationsflün: 'Informationsflut',
  prägnanen: 'prägnant',
};

function lemmaArtifactTokensInBatch(batch) {
  const hits = new Set();
  const checkToken = (tok) => {
    const low = String(tok || '').toLowerCase();
    if (LEMMA_GROUND_TRUTH_REPLACE[low]) hits.add(low);
  };
  for (const q of batch.questions || []) {
    for (const t of q.vocabularyTags || []) checkToken(t);
  }
  const walk = (v) => {
    if (typeof v === 'string') {
      for (const m of v.match(/\b[a-zäöüß]{4,}\b/gi) || []) checkToken(m);
      return;
    }
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(batch);
  return [...hits];
}

function hasLemmaArtifacts(batch) {
  return lemmaArtifactTokensInBatch(batch).length > 0;
}

const VOCAB_CORRUPT_RE =
  /(?:förderen|erweiteren|verhinderen|schlechen|sophi|berli|direken|interessanen|handelen|weiterhi|direkteen|findeen|arbeiteen|täglicht|beruflicht|informiern|passiern|funktioniern|motiviern|podcaen|kunen|zukunfen|zeitschrifen|informationsflün|prägnanen|kaputen)$/i;

const BAD_VOCAB_TAG_TO_LEMMA = {
  Viele: 'viele',
  Vielen: 'vielen',
  Langen: 'lang',
  Täglichen: 'täglich',
  Technischen: 'technisch',
  Direken: 'direkt',
  Interessanen: 'interessieren',
  Handelen: 'handeln',
  Weiterhi: 'weiterhin',
  Behandelen: 'behandeln',
  Anstaten: 'anstatt',
  Kaputen: 'kaputt',
  Prägnanen: 'prägnant',
};

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    dryRun: !argv.includes('--apply'),
    syncSeed: argv.includes('--sync-seed'),
    listOnly: argv.includes('--list-only'),
    preview: argv.includes('--preview'),
    confirm: argv.includes('--confirm'),
    /** Only lemma + vocab-tag artifacts (historical ~25), skip broader cap-only backlog. */
    lemmaClusterOnly: argv.includes('--lemma-cluster-only'),
  };
}

function inferCtx(filename, batch) {
  const base = filename.replace(/\.json$/, '');
  const m = base.match(/^(lesen|horen|schreiben|sprechen)-t(\d+)/i);
  const module = m
    ? m[1].toLowerCase()
    : String(batch.module || batch.questions?.[0]?.module || 'lesen').toLowerCase();
  const teil = m
    ? Number(m[2])
    : Number(batch.teil ?? batch.questions?.[0]?.teil ?? 1);
  const level = inferBatchLevel(batch);
  return { module, teil, lang: 'de', level: level === 'MIXED' ? 'B1' : level };
}

function collectTextFields(batch) {
  const out = [];
  const push = (field, text) => {
    if (typeof text === 'string' && text.trim()) out.push({ field, text });
  };
  for (const p of batch.passages || []) {
    push('passages.text', p.text);
    push('passages.transcript', p.transcript);
    if (Array.isArray(p.ads)) for (const ad of p.ads) push('passages.ads', ad);
  }
  for (const q of batch.questions || []) {
    push('questions.question', q.question);
    push('questions.signText', q.signText);
    push('questions.explanation', q.explanation);
    push('questions.statement', q.statement);
    for (const opt of q.options || []) {
      if (typeof opt === 'string') push('questions.options', opt);
      else if (opt?.text) push('questions.options', opt.text);
    }
  }
  return out;
}

function hasBadVocabTagCaps(batch) {
  for (const q of batch.questions || []) {
    for (const t of q.vocabularyTags || []) {
      if (BAD_VOCAB_TAG_CAP.test(String(t).trim())) return true;
    }
  }
  return false;
}

function applyBadVocabTagLemmaFix(batch) {
  let changed = false;
  for (const q of batch.questions || []) {
    if (!Array.isArray(q.vocabularyTags)) continue;
    const next = q.vocabularyTags.map((t) => {
      const s = String(t || '').trim();
      const fix = BAD_VOCAB_TAG_TO_LEMMA[s];
      if (fix) {
        changed = true;
        return fix;
      }
      return t;
    });
    q.vocabularyTags = next;
  }
  return changed;
}

function applyLemmaGroundTruthInTree(value) {
  if (typeof value === 'string') {
    let s = value;
    for (const [bad, good] of Object.entries(LEMMA_GROUND_TRUTH_REPLACE)) {
      s = s.replace(new RegExp(`(?<![\\wäöüß])${bad}\\b`, 'gi'), good);
    }
    return s;
  }
  if (Array.isArray(value)) return value.map((v) => applyLemmaGroundTruthInTree(v));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = applyLemmaGroundTruthInTree(v);
    }
    return out;
  }
  return value;
}

/** Residual wrong-case forms from audit 2026-07-24 (excludes «Vielen Dank»). */
const WRONG_AUDIT_CAP_RE =
  /\b(ein Paar|Langen|Täglichen|Technischen)\b|\b(die|der|den|des|einige|einigen) Vielen\b|\bdie Viele\b/;

function bodyHasAuditCapPattern(batch) {
  return collectTextFields(batch).some(({ text }) => {
    const stripped = String(text || '').replace(/Vielen Dank/gi, '___');
    return WRONG_AUDIT_CAP_RE.test(stripped);
  });
}

function detectIssues(batch, rel = '') {
  const issues = [];
  if (hasLemmaArtifacts(batch)) issues.push('lemma_artifact');
  if (hasBadVocabTagCaps(batch)) issues.push('bad_vocab_tag_cap');
  if (bodyHasAuditCapPattern(batch)) issues.push('audit_cap_pattern');
  for (const q of batch.questions || []) {
    for (const t of q.vocabularyTags || []) {
      if (VOCAB_CORRUPT_RE.test(String(t))) issues.push('vocab_corruption');
    }
  }
  const langVerdict = runGermanContentLanguageGate(batch, {
    file: rel || batch._sourceFile || '',
    lang: 'de',
  });
  if ((langVerdict.findings || []).length) issues.push('language_leak');
  return [...new Set(issues)];
}

function previewTagDiffs(before, after) {
  const diffs = [];
  const bqs = before.questions || [];
  const aqs = after.questions || [];
  for (let i = 0; i < Math.max(bqs.length, aqs.length); i++) {
    const bt = (bqs[i]?.vocabularyTags || []).join('|');
    const at = (aqs[i]?.vocabularyTags || []).join('|');
    if (bt !== at) diffs.push({ qIndex: i, before: bqs[i]?.vocabularyTags || [], after: aqs[i]?.vocabularyTags || [] });
  }
  return diffs;
}

function repairBatch(batch) {
  let next = applyLemmaGroundTruthInTree(structuredClone(batch));
  ({ batch: next } = applyGermanCapsNormalize(next, { log: false }));
  applyBadVocabTagLemmaFix(next);
  ({ batch: next } = enrichBatchMetadata(next, {
    vocab: true,
    grammar: false,
    topic: false,
    vocabRepairOnly: true,
  }));
  next._poolArtifactRepairAt = new Date().toISOString();
  next._poolArtifactRepairNote = 'repair-pool-vocab-caps-artifacts.mjs (germanCapsNormalize + enrich vocab)';
  return next;
}

function listPoolFiles() {
  const files = [];
  for (const lv of LEVELS) {
    const dir = path.join(POOL_ROOT, lv);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.json') && !f.startsWith('.')) files.push({ level: lv, file: f, abs: path.join(dir, f) });
    }
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = listPoolFiles();
  const affected = [];

  for (const e of entries) {
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(e.abs, 'utf8'));
    } catch (err) {
      console.warn(`skip corrupt ${e.file}: ${err.message}`);
      continue;
    }
    const rel = `batches/ready/pool-verified/${e.level}/${e.file}`;
    const issues = detectIssues(batch, rel);
    if (issues.length) affected.push({ ...e, issues, batch });
  }

  let repairList = affected;
  if (args.lemmaClusterOnly) {
    repairList = affected.filter((a) =>
      a.issues.some((i) => i === 'lemma_artifact' || i === 'bad_vocab_tag_cap'),
    );
  }

  console.log(`\n── pool-verified scan (${LEVELS.join('+')}) ──`);
  console.log(`Total JSON: ${entries.length}`);
  console.log(`Affected (pre-repair): ${affected.length}`);
  console.log(`Repair queue: ${repairList.length}${args.lemmaClusterOnly ? ' (--lemma-cluster-only)' : ''}\n`);
  for (const a of repairList) {
    console.log(`  ${a.level}/${a.file}  [${a.issues.join(', ')}]`);
  }

  if (args.listOnly) return;

  if (args.apply && !args.confirm && !args.preview) {
    console.error('\n[repair] BLOCKED: bulk pool repair requires --preview review and --confirm.');
    console.error('  node scripts/repair-pool-vocab-caps-artifacts.mjs --preview');
    console.error('  node scripts/repair-pool-vocab-caps-artifacts.mjs --apply --confirm [--sync-seed]\n');
    process.exit(2);
  }

  const previewReport = [];
  if (args.preview || (args.apply && args.confirm)) {
    for (const a of repairList) {
      const fixed = repairBatch(a.batch);
      const tagDiffs = previewTagDiffs(a.batch, fixed);
      if (tagDiffs.length) {
        previewReport.push({ file: `${a.level}/${a.file}`, tagDiffs: tagDiffs.slice(0, 5) });
      }
    }
    const previewPath = path.join(
      ROOT,
      'batches/ready/gate-logs',
      `pool-vocab-caps-repair-preview-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`,
    );
    fs.mkdirSync(path.dirname(previewPath), { recursive: true });
    fs.writeFileSync(
      previewPath,
      `${JSON.stringify({ at: new Date().toISOString(), files: previewReport.length, previewReport }, null, 2)}\n`,
    );
    console.log(`\n── Preview (tag diffs) ──`);
    console.log(`Files with tag changes: ${previewReport.length}`);
    for (const p of previewReport.slice(0, 12)) {
      console.log(`  ${p.file}`);
      console.log(`    ${JSON.stringify(p.tagDiffs[0])}`);
    }
    console.log(`Log: ${path.relative(ROOT, previewPath).replace(/\\/g, '/')}`);
    if (args.preview && !args.apply) return;
  }

  const report = {
    repaired: [],
    verifyFailed: [],
    sync: [],
    at: new Date().toISOString(),
  };

  for (const a of repairList) {
    const rel = `batches/ready/pool-verified/${a.level}/${a.file}`;
    if (a.issues.includes('language_leak')) {
      report.verifyFailed.push({ file: `${a.level}/${a.file}`, remaining: ['language_leak'] });
      continue;
    }
    const fixed = repairBatch(a.batch);
    const post = detectIssues(fixed, rel);
    if (post.length) {
      report.verifyFailed.push({ file: `${a.level}/${a.file}`, remaining: post });
      continue;
    }
    report.repaired.push(`${a.level}/${a.file}`);
    if (args.apply) {
      fs.writeFileSync(a.abs, `${JSON.stringify(fixed, null, 2)}\n`, 'utf8');
      if (args.syncSeed) {
        const rel = `batches/ready/pool-verified/${a.level}/${a.file}`;
        const sync = await syncPoolVerifiedBatch({
          file: a.file,
          batch: fixed,
          level: a.level,
          opts: { sourceFile: rel, trigger: 'repair-pool-vocab-caps-artifacts', syncBlobs: false },
        });
        report.sync.push({ file: a.file, ok: sync.ok, skipped: sync.skipped, error: sync.error });
      }
    }
  }

  // Final full-pool scan
  const finalHits = [];
  for (const e of listPoolFiles()) {
    const batch = JSON.parse(fs.readFileSync(e.abs, 'utf8'));
    const rel = `batches/ready/pool-verified/${e.level}/${e.file}`;
    const issues = detectIssues(batch, rel);
    if (issues.length) finalHits.push({ file: `${e.level}/${e.file}`, issues });
  }

  const logPath = path.join(
    ROOT,
    'batches/ready/gate-logs',
    `pool-vocab-caps-repair-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`,
  );
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(
    logPath,
    `${JSON.stringify({ args, affected: affected.map((a) => `${a.level}/${a.file}`), report, finalHits }, null, 2)}\n`,
  );

  console.log(`\n── Repair ${args.apply ? 'APPLIED' : 'DRY-RUN'} ──`);
  console.log(`Repaired OK: ${report.repaired.length}`);
  console.log(`Verify failed: ${report.verifyFailed.length}`);
  if (report.verifyFailed.length) {
    for (const f of report.verifyFailed) console.log(`  FAIL ${f.file}: ${f.remaining.join(', ')}`);
  }
  console.log(`\n── Final pool scan (all ${entries.length} files) ──`);
  console.log(`Remaining issues: ${finalHits.length}`);
  if (finalHits.length) {
    for (const h of finalHits.slice(0, 30)) console.log(`  ${h.file}: ${h.issues.join(', ')}`);
  }
  console.log(`\nLog: ${path.relative(ROOT, logPath).replace(/\\/g, '/')}`);

  if (report.verifyFailed.length || (args.apply && finalHits.length)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
