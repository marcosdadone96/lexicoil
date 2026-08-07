#!/usr/bin/env node
/**
 * LanguageTool audit (report-only) over pool-verified German content.
 *
 * Scopes:
 *   --scope passages  legacy: passage.text / passage only (default for backward compat)
 *   --scope full      passages + questions (question, explanation, options, statement, …)
 *
 * Prerequisites (operator machine with Docker):
 *   docker run -d --name lexicoil-lt -p 8010:8010 erikvl87/languagetool
 *
 * Usage:
 *   node scripts/audit-languagetool-de.mjs --dir batches/ready/pool-verified/B1 --scope full
 *   node scripts/audit-languagetool-de.mjs --limit 5 --scope full
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';

const args = process.argv.slice(2);
function argVal(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : fallback;
}

const BASE = String(argVal('--base', process.env.LT_BASE || 'http://127.0.0.1:8010')).replace(/\/$/, '');
const DELAY_MS = Number(argVal('--delay', process.env.LT_DELAY_MS || '100'));
const CONCURRENCY = Math.max(1, Number(argVal('--concurrency', process.env.LT_CONCURRENCY || '1')) || 1);
const LIMIT = Number(argVal('--limit', '0')) || 0;
const LANGUAGE = String(argVal('--lang', 'de-DE'));
const SCOPE = String(argVal('--scope', process.env.LT_SCOPE || 'passages')).toLowerCase();

function resolveUnderRoot(p) {
  const raw = String(p || '').trim();
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

const POOL_DIR =
  resolveUnderRoot(argVal('--dir', process.env.LT_DIR || '')) ||
  path.join(ROOT, 'batches/ready/pool-verified');
const OUT_PATH =
  resolveUnderRoot(argVal('--out', process.env.LT_OUT || '')) ||
  path.join(ROOT, 'batches/ready/gate-logs/languagetool-audit-2026-07-11.json');
const POOL_DIR_REL = path.relative(ROOT, POOL_DIR).replace(/\\/g, '/');
const OUT_PATH_REL = path.relative(ROOT, OUT_PATH).replace(/\\/g, '/');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mapConcurrent(items, fn, limit) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

/** Legacy passage-only extraction (unchanged shape for --scope passages). */
function extractPassageTexts(data) {
  /** @type {{ passageIndex: number|string, text: string }[]} */
  const out = [];
  if (data?.passage?.text && String(data.passage.text).trim()) {
    out.push({ passageIndex: 'passage', text: String(data.passage.text) });
  }
  if (Array.isArray(data?.passages)) {
    data.passages.forEach((p, i) => {
      const t = p?.text != null ? String(p.text) : '';
      if (t.trim()) out.push({ passageIndex: i, text: t });
    });
  }
  return out;
}

/**
 * Full content audit segments — passages + question fields.
 * Mirrors collectStringsFromBatch (germanCapsGate) + passage transcript.
 */
export function extractAuditableSegments(data, scope = 'full') {
  if (scope !== 'full') {
    return extractPassageTexts(data).map(({ passageIndex, text }) => ({
      segmentType: 'passage',
      field: 'passages.text',
      passageIndex,
      questionIndex: null,
      text,
    }));
  }

  /** @type {{ segmentType: string, field: string, passageIndex: number|string|null, questionIndex: number|null, text: string }[]} */
  const out = [];
  const push = (field, text, meta = {}) => {
    if (typeof text !== 'string' || !text.trim()) return;
    out.push({
      segmentType: field.startsWith('passages.') ? 'passage' : 'question',
      field,
      passageIndex: meta.passageIndex ?? null,
      questionIndex: meta.questionIndex ?? null,
      text,
    });
  };

  if (data?.passage?.text) {
    push('passages.text', String(data.passage.text), { passageIndex: 'passage' });
  }
  if (Array.isArray(data?.passages)) {
    data.passages.forEach((p, i) => {
      const parts = [];
      const add = (t) => {
        if (typeof t === 'string' && t.trim()) parts.push(t.trim());
      };
      add(p?.text);
      add(p?.transcript);
      if (parts.length) push('passages.content', parts.join('\n\n'), { passageIndex: i });
      if (p?.title && String(p.title).trim()) {
        push('passages.title', String(p.title), { passageIndex: i });
      }
      if (Array.isArray(p?.ads)) {
        for (const ad of p.ads) push('passages.ads', ad, { passageIndex: i });
      }
    });
  }
  if (Array.isArray(data?.questions)) {
    data.questions.forEach((q, qi) => {
      const parts = [];
      const add = (t) => {
        if (typeof t === 'string' && t.trim()) parts.push(t.trim());
      };
      add(q?.question);
      add(q?.statement);
      add(q?.signText);
      add(q?.explanation);
      add(q?.transcript);
      if (Array.isArray(q?.matchLabels)) for (const l of q.matchLabels) add(l);
      for (const opt of q?.options || []) {
        if (typeof opt === 'string') add(opt);
        else add(opt?.text);
      }
      if (parts.length) {
        push('questions.content', parts.join('\n'), { questionIndex: qi });
      }
    });
  }
  return out;
}

async function ltCheck(text, { retries = 3 } = {}) {
  const body = new URLSearchParams({
    language: LANGUAGE,
    text,
  });
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${BASE}/v2/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`LT HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      return res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries - 1) await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr;
}

function slimMatch(m) {
  return {
    ruleId: m?.rule?.id || null,
    category: m?.rule?.category?.id || m?.rule?.category?.name || null,
    issueType: m?.rule?.issueType || null,
    message: m?.message || null,
    shortMessage: m?.shortMessage || null,
    offset: m?.offset ?? null,
    length: m?.length ?? null,
    context: m?.context?.text || null,
    contextOffset: m?.context?.offset ?? null,
    replacements: (m?.replacements || []).slice(0, 5).map((r) => r.value),
  };
}

async function pingLanguages() {
  const res = await fetch(`${BASE}/v2/languages`);
  if (!res.ok) throw new Error(`ping /v2/languages HTTP ${res.status}`);
  const langs = await res.json();
  const de = Array.isArray(langs) ? langs.filter((l) => String(l.code || '').startsWith('de')) : [];
  return { ok: true, languageCount: Array.isArray(langs) ? langs.length : 0, deCodes: de.map((l) => l.code) };
}

function segmentReportRow(seg, matches, err = null) {
  const row = {
    segmentType: seg.segmentType,
    field: seg.field,
    passageIndex: seg.passageIndex,
    questionIndex: seg.questionIndex,
    textLength: seg.text.length,
    text: seg.text,
    matchCount: matches.length,
    matches,
  };
  if (err) row.error = err;
  // Legacy alias: passage.text rows also expose passageIndex-only shape
  if (seg.segmentType === 'passage' && seg.field === 'passages.text') {
    row.passageIndex = seg.passageIndex;
  }
  return row;
}

async function main() {
  console.log(`[lt-audit] base=${BASE} delay=${DELAY_MS}ms concurrency=${CONCURRENCY} lang=${LANGUAGE} scope=${SCOPE}`);
  console.log(`[lt-audit] dir=${POOL_DIR_REL}`);
  console.log(`[lt-audit] out=${OUT_PATH_REL}`);

  if (!fs.existsSync(POOL_DIR) || !fs.statSync(POOL_DIR).isDirectory()) {
    console.error(`[lt-audit] directory not found: ${POOL_DIR}`);
    process.exit(1);
  }

  let ping;
  try {
    ping = await pingLanguages();
    console.log(`[lt-audit] LT OK — ${ping.languageCount} languages, de=${ping.deCodes.join(',') || '(none)'}`);
  } catch (err) {
    console.error(`[lt-audit] LanguageTool not reachable at ${BASE}`);
    console.error(`[lt-audit] ${err.message}`);
    console.error(`[lt-audit] Start with: docker run -d --name lexicoil-lt -p 8010:8010 erikvl87/languagetool`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(POOL_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const selected = LIMIT > 0 ? files.slice(0, LIMIT) : files;

  /** @type {Record<string, number>} */
  const byRuleId = {};
  /** @type {Record<string, number>} */
  const byField = {};
  const fileResults = [];
  let filesWithMatches = 0;
  let filesZeroMatches = 0;
  let filesSkippedNoText = 0;
  let filesErrored = 0;
  let segmentErrors = 0;
  let totalMatches = 0;
  let totalSegmentsChecked = 0;
  let totalPassagesChecked = 0;
  let totalQuestionSegmentsChecked = 0;

  for (let fi = 0; fi < selected.length; fi++) {
    const file = selected[fi];
    const abs = path.join(POOL_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      filesErrored++;
      fileResults.push({ file, error: `parse: ${err.message}`, matchCount: 0, segments: [], passages: [] });
      continue;
    }

    const segments = extractAuditableSegments(data, SCOPE);
    if (!segments.length) {
      filesSkippedNoText++;
      fileResults.push({
        file,
        skipped: true,
        reason: SCOPE === 'full' ? 'no_auditable_segments' : 'no_passage_text',
        matchCount: 0,
        segments: [],
        passages: [],
      });
      console.log(`[${fi + 1}/${selected.length}] SKIP ${file} (no segments)`);
      continue;
    }

    const segmentReports = [];
    let fileMatchCount = 0;

    const checked = await mapConcurrent(
      segments,
      async (seg) => {
        try {
          if (DELAY_MS > 0) await sleep(DELAY_MS);
          const raw = await ltCheck(seg.text);
          return { seg, matches: (raw.matches || []).map(slimMatch), err: null };
        } catch (err) {
          segmentErrors++;
          return { seg, matches: [], err: err.message };
        }
      },
      CONCURRENCY,
    );

    for (const { seg, matches, err } of checked) {
      for (const m of matches) {
        const id = m.ruleId || '(unknown)';
        byRuleId[id] = (byRuleId[id] || 0) + 1;
        byField[`${seg.field}:match`] = (byField[`${seg.field}:match`] || 0) + 1;
      }
      fileMatchCount += matches.length;
      totalMatches += matches.length;
      totalSegmentsChecked++;
      if (seg.segmentType === 'passage' && (seg.field === 'passages.text' || seg.field === 'passages.content')) {
        totalPassagesChecked++;
      }
      if (seg.segmentType === 'question') totalQuestionSegmentsChecked++;
      segmentReports.push(segmentReportRow(seg, matches, err));
    }

    const segErrCount = segmentReports.filter((s) => s.error).length;
    if (segErrCount > 0) {
      segmentErrors += segErrCount;
      if (segErrCount === segmentReports.length) {
        console.error(`[lt-audit] WARN: all ${segErrCount} segments failed for ${file} — pausing 15s for LT recovery`);
        await sleep(15000);
        try {
          await pingLanguages();
        } catch (_) {
          console.error('[lt-audit] LT still down after pause — aborting scan');
          process.exit(1);
        }
      }
    }

    if (fileMatchCount > 0) filesWithMatches++;
    else filesZeroMatches++;

    // Legacy passages array (passage content only) for downstream tools
    const passages = segmentReports.filter((s) => s.field === 'passages.content' || s.field === 'passages.text');

    fileResults.push({
      file,
      matchCount: fileMatchCount,
      segments: segmentReports,
      passages,
    });

    console.log(
      `[${fi + 1}/${selected.length}] ${file} segments=${segments.length} matches=${fileMatchCount}`,
    );
  }

  const byRuleIdSorted = Object.entries(byRuleId)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([ruleId, count]) => ({ ruleId, count }));

  const byFieldSorted = Object.entries(byField)
    .filter(([k]) => k.endsWith(':match'))
    .map(([k, count]) => ({ field: k.replace(/:match$/, ''), count }))
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field));

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    language: LANGUAGE,
    delayMs: DELAY_MS,
    concurrency: CONCURRENCY,
    scope: SCOPE,
    poolDir: POOL_DIR_REL,
    ping,
    summary: {
      filesScanned: selected.length,
      filesWithAuditableContent: selected.length - filesSkippedNoText,
      filesSkippedNoText,
      filesZeroMatches,
      filesWithMatches,
      filesErrored,
      segmentErrors,
      totalSegmentsChecked,
      totalPassagesChecked,
      totalQuestionSegmentsChecked,
      totalMatches,
      uniqueRuleIds: byRuleIdSorted.length,
    },
    byRuleId: byRuleIdSorted,
    byField: byFieldSorted,
    files: fileResults,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log('\nTop ruleIds:');
  for (const row of byRuleIdSorted.slice(0, 30)) {
    console.log(`  ${String(row.count).padStart(4)}  ${row.ruleId}`);
  }
  if (SCOPE === 'full' && byFieldSorted.length) {
    console.log('\nMatches by field:');
    for (const row of byFieldSorted.slice(0, 15)) {
      console.log(`  ${String(row.count).padStart(4)}  ${row.field}`);
    }
  }
  console.log(`\nWrote ${OUT_PATH}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
