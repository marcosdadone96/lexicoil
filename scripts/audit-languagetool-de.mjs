/**
 * LanguageTool audit (report-only) over pool-verified passage.text.
 *
 * Prerequisites (operator machine with Docker):
 *   docker run -d --name lexicoil-lt -p 8010:8010 erikvl87/languagetool
 *   # wait until healthy, then:
 *   curl http://127.0.0.1:8010/v2/languages
 *
 * Usage:
 *   node scripts/audit-languagetool-de.mjs
 *   node scripts/audit-languagetool-de.mjs --base http://127.0.0.1:8010 --delay 80
 *   node scripts/audit-languagetool-de.mjs --limit 5   # smoke test
 *   node scripts/audit-languagetool-de.mjs --dir batches/ready/horen-t1-staging-2026-07-11
 *   node scripts/audit-languagetool-de.mjs --dir <path> --out batches/ready/gate-logs/lt-foo.json
 *
 * Does NOT correct anything — writes a JSON report only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const args = process.argv.slice(2);
function argVal(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : fallback;
}

const BASE = String(argVal('--base', process.env.LT_BASE || 'http://127.0.0.1:8010')).replace(/\/$/, '');
const DELAY_MS = Number(argVal('--delay', process.env.LT_DELAY_MS || '100'));
const LIMIT = Number(argVal('--limit', '0')) || 0;
const LANGUAGE = String(argVal('--lang', 'de-DE'));

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

async function ltCheck(text) {
  const body = new URLSearchParams({
    language: LANGUAGE,
    text,
  });
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

async function main() {
  console.log(`[lt-audit] base=${BASE} delay=${DELAY_MS}ms lang=${LANGUAGE}`);
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
  const fileResults = [];
  let filesWithMatches = 0;
  let filesZeroMatches = 0;
  let filesSkippedNoText = 0;
  let filesErrored = 0;
  let totalMatches = 0;
  let totalPassagesChecked = 0;

  for (let fi = 0; fi < selected.length; fi++) {
    const file = selected[fi];
    const abs = path.join(POOL_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      filesErrored++;
      fileResults.push({ file, error: `parse: ${err.message}`, matchCount: 0, passages: [] });
      continue;
    }

    const passages = extractPassageTexts(data);
    if (!passages.length) {
      filesSkippedNoText++;
      fileResults.push({
        file,
        skipped: true,
        reason: 'no_passage_text',
        matchCount: 0,
        passages: [],
      });
      console.log(`[${fi + 1}/${selected.length}] SKIP ${file} (no passage.text)`);
      continue;
    }

    const passageReports = [];
    let fileMatchCount = 0;

    for (const { passageIndex, text } of passages) {
      try {
        if (DELAY_MS > 0) await sleep(DELAY_MS);
        const raw = await ltCheck(text);
        const matches = (raw.matches || []).map(slimMatch);
        for (const m of matches) {
          const id = m.ruleId || '(unknown)';
          byRuleId[id] = (byRuleId[id] || 0) + 1;
        }
        fileMatchCount += matches.length;
        totalMatches += matches.length;
        totalPassagesChecked++;
        passageReports.push({
          passageIndex,
          textLength: text.length,
          text,
          matchCount: matches.length,
          matches,
        });
      } catch (err) {
        filesErrored++;
        passageReports.push({
          passageIndex,
          textLength: text.length,
          text,
          error: err.message,
          matchCount: 0,
          matches: [],
        });
      }
    }

    if (fileMatchCount > 0) filesWithMatches++;
    else filesZeroMatches++;

    fileResults.push({
      file,
      matchCount: fileMatchCount,
      passages: passageReports,
    });

    console.log(
      `[${fi + 1}/${selected.length}] ${file} passages=${passages.length} matches=${fileMatchCount}`,
    );
  }

  const byRuleIdSorted = Object.entries(byRuleId)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([ruleId, count]) => ({ ruleId, count }));

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    language: LANGUAGE,
    delayMs: DELAY_MS,
    poolDir: POOL_DIR_REL,
    ping,
    summary: {
      filesScanned: selected.length,
      filesWithPassageText: selected.length - filesSkippedNoText,
      filesSkippedNoText,
      filesZeroMatches,
      filesWithMatches,
      filesErrored,
      totalPassagesChecked,
      totalMatches,
      uniqueRuleIds: byRuleIdSorted.length,
    },
    byRuleId: byRuleIdSorted,
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
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
