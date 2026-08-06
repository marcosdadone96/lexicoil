#!/usr/bin/env node
/**
 * Piloto AUD fixes sobre tanda 2026-07-09T09:30:00Z (25 archivos).
 *   node scripts/validate-tanda-aud-fixes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';
import { runMetadataSchemaGate } from './lib/qualityGates/metadataSchemaGate.mjs';
import { runPassageCoherenceGate } from './lib/qualityGates/passageCoherenceGate.mjs';
import { runDuplicateContentGate } from './lib/qualityGates/duplicateContentGate.mjs';
import { buildDedupCorpus, corpusExcludingSource } from './lib/qualityGates/dedupCorpus.mjs';
import { saveDedupIndex } from './lib/qualityGates/dedupIndex.mjs';

const GEN = path.join(ROOT, 'batches/generated');
const READY = path.join(ROOT, 'batches/ready/lesen');
const BANK = path.join(ROOT, 'library/de/B1/questions.json');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/tanda-aud-fix-validation.json');

const REPROCESS = [
  ...[178, 179, 180, 181, 182].map((n) => `lesen-t1-gemini-${n}.json`),
  ...[94, 95, 96, 97, 98].map((n) => `lesen-t2-gemini-${String(n).padStart(3, '0')}.json`),
  ...[38, 39, 40, 41, 42].map((n) => `lesen-t4-gemini-${String(n).padStart(3, '0')}.json`),
  ...[68, 69, 70, 71, 72].map((n) => `lesen-t5-gemini-${String(n).padStart(3, '0')}.json`),
];

const OLD_T3 = [
  'lesen-t3-auto-ztz0q6.json',
  'lesen-t3-auto-0dcsj1.json',
  'lesen-t3-auto-px3otp.json',
  'lesen-t3-auto-x52enh.json',
  'lesen-t3-auto-nnw057.json',
];

function walkDiff(before, after, prefix, rows) {
  if (typeof before === 'string' && typeof after === 'string' && before !== after) {
    let idx = 0;
    while (idx < before.length && before[idx] === after[idx]) idx++;
    const bSnip = before.slice(Math.max(0, idx - 50), idx + 90);
    const aSnip = after.slice(Math.max(0, idx - 50), idx + 90);
    rows.push({ field: prefix, before: bSnip, after: aSnip });
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    before.forEach((item, i) => {
      if (typeof item === 'string') walkDiff(item, after[i], `${prefix}[${i}]`, rows);
      else if (item && typeof item === 'object') walkObj(item, after[i], `${prefix}[${i}]`, rows);
    });
    return;
  }
  if (before && typeof before === 'object') walkObj(before, after, prefix, rows);
}

function walkObj(b, a, prefix, rows) {
  if (!b || !a) return;
  for (const key of ['text', 'title', 'transcript', 'question', 'explanation', 'signText']) {
    if (b[key] != null) walkDiff(b[key], a[key], `${prefix}.${key}`, rows);
  }
}

function reprocessInPlace(files) {
  const report = [];
  for (const file of files) {
    const abs = path.join(GEN, file);
    if (!fs.existsSync(abs)) {
      report.push({ file, error: 'missing' });
      continue;
    }
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const { batch, stats, changes } = applyGermanCapsNormalize(raw);
    const rows = [];
    walkObj(raw, batch, file.replace('.json', ''), rows);
    const changed = JSON.stringify(raw) !== JSON.stringify(batch);
    if (changed) {
      fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    }
    report.push({
      file,
      overwritten: changed,
      stats,
      changes: rows,
      tokenChanges: changes.filter((c) => c.kind === 'token').length,
    });
  }
  return report;
}

function grepLangLower(files) {
  const re = /\bin (chinesisch|arabisch|russisch|deutsch|spanisch|italienisch|englisch|französisch|türkisch|polnisch|japanisch|portugiesisch)\b/g;
  const hits = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(GEN, file), 'utf8');
    let m;
    while ((m = re.exec(text)) !== null) hits.push({ file, match: m[0] });
  }
  return hits;
}

function runGates(files) {
  const corpus = buildDedupCorpus({ dirs: [GEN, READY], bankPath: BANK });
  saveDedupIndex(corpus.index);
  const rows = [];
  for (const file of files) {
    const abs = path.join(GEN, file);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const rel = `batches/generated/${file}`;
    const q4 = runMetadataSchemaGate(batch, { file: rel, profile: 'generated' });
    const q3 = runPassageCoherenceGate(batch, { file: rel });
    const q1 = runDuplicateContentGate(batch, {
      file: rel,
      corpus: corpusExcludingSource(corpus, rel),
      mode: 'shadow',
    });
    rows.push({
      file,
      Q4: q4.verdict,
      Q4_findings: q4.findings?.length ?? 0,
      Q4_rules: [...new Set((q4.findings || []).map((f) => f.rule))],
      Q3: q3.verdict,
      Q3_findings: q3.findings?.length ?? 0,
      Q3_rules: [...new Set((q3.findings || []).map((f) => f.rule))],
      Q1: q1.verdict,
      Q1_wouldReject: q1.wouldReject ?? false,
      Q1_rules: [...new Set((q1.findings || []).map((f) => f.rule))],
    });
  }
  return rows;
}

function checkCases(filesContent) {
  const get = (f) => filesContent[f] || '';
  const checks = [];

  const t2095 = get('lesen-t2-gemini-095.json');
  checks.push({
    case: 't2-095 im freien',
    expect: 'im Freien',
    found: /im Freien/i.test(t2095),
    bad: /im freien/i.test(t2095),
    snippet: (t2095.match(/.{0,40}im [Ff]reien.{0,40}/) || [])[0],
  });

  const t2097 = get('lesen-t2-gemini-097.json');
  checks.push({
    case: 't2-097 im freien',
    expect: 'im Freien',
    found: /im Freien/i.test(t2097),
    bad: /im freien/i.test(t2097),
    snippet: (t2097.match(/.{0,40}im [Ff]reien.{0,40}/) || [])[0],
  });

  for (const f of ['lesen-t5-gemini-068.json', 'lesen-t5-gemini-069.json']) {
    const t = get(f);
    checks.push({
      case: `${f} sin **`,
      expect: 'sin markdown **',
      found: !/\*\*/.test(t),
      bad: /\*\*/.test(t),
      snippet: (t.match(/.{0,30}\*\*.{0,30}/) || ['OK — sin **'])[0],
    });
  }

  const t5070 = get('lesen-t5-gemini-070.json');
  checks.push({
    case: 't5-070 studierenden/Zahlenden',
    expect: 'revisar si persisten',
    found: !/studierenden|Zahlenden/i.test(t5070),
    bad: /studierenden|Zahlenden/i.test(t5070),
    snippet: (t5070.match(/.{0,30}(studierenden|Zahlenden).{0,30}/i) || ['no match in file'])[0],
    note: 'Si no hay match, el hallazgo manual puede estar en otro campo o versión rechazada',
  });

  const t4036ref = get('lesen-t4-gemini-038.json') + get('lesen-t4-gemini-039.json') + get('lesen-t4-gemini-040.json') + get('lesen-t4-gemini-041.json') + get('lesen-t4-gemini-042.json');
  checks.push({
    case: 't4 batch Wichtiger Schritt (ref. t4-036 Clara)',
    expect: 'ein wichtiger Schritt (no ein Wichtiger)',
    found: !/ein Wichtiger Schritt/i.test(t4036ref),
    bad: /ein Wichtiger Schritt/i.test(t4036ref),
    snippet: (t4036ref.match(/.{0,25}ein [Ww]ichtiger Schritt.{0,25}/) || ['no ein Wichtiger in batch T4'])[0],
    note: 'Batch 038–042 no contiene t4-036; se busca patrón equivalente',
  });

  const t4040 = get('lesen-t4-gemini-040.json');
  checks.push({
    case: 't4-040 Automatische Sperre (Ben)',
    expect: 'automatische (minúscula adj)',
    found: /automatische Sperre/i.test(t4040) || /eine automatische/i.test(t4040),
    bad: /Automatische Sperre/i.test(t4040),
    snippet: (t4040.match(/.{0,20}[Aa]utomatische Sperre.{0,20}/) || [])[0],
  });

  const t1179 = get('lesen-t1-gemini-179.json');
  checks.push({
    case: 't1-179 ein paar Monaten',
    expect: 'ein paar Monaten',
    found: /ein paar Monaten/i.test(t1179),
    bad: /ein Paar Monaten/i.test(t1179),
    snippet: (t1179.match(/.{0,30}ein [Pp]aar Monaten.{0,30}/) || [])[0],
  });

  return checks.map((c) => ({
    ...c,
    category: c.bad ? 'INESPERADO' : c.found ? 'CONFIRMADO' : 'INESPERADO',
  }));
}

async function main() {
  console.log('=== Paso 1: reprocesar T1/T2/T4/T5 (20 archivos) ===');
  const reprocess = reprocessInPlace(REPROCESS);
  const changedCount = reprocess.filter((r) => r.overwritten).length;
  console.log(`Sobrescritos: ${changedCount}/${REPROCESS.length}`);

  console.log('\n=== Paso 2: regenerar T3 (5 archivos) ===');
  const t3Replacement = { deleted: OLD_T3, generated: [] };
  const existingT3 = fs.readdirSync(GEN).filter((f) => f.startsWith('lesen-t3-auto-') && f.endsWith('.json'));
  const presetNew = ['lesen-t3-auto-5hhflb.json', 'lesen-t3-auto-jhnc6c.json', 'lesen-t3-auto-dfn273.json', 'lesen-t3-auto-n0lt9z.json', 'lesen-t3-auto-sds0gv.json'];
  if (presetNew.every((f) => fs.existsSync(path.join(GEN, f))) && !OLD_T3.some((f) => fs.existsSync(path.join(GEN, f)))) {
    t3Replacement.generated = presetNew;
    console.log('T3 ya regenerados en paso anterior:', presetNew.join(', '));
  } else {
    for (const f of OLD_T3) {
      const abs = path.join(GEN, f);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    }
    const beforeMs = Date.now();
    const { spawnSync } = await import('node:child_process');
    const t3Run = spawnSync(process.execPath, ['scripts/make-t3.mjs', '--count', '5', '--out', 'batches/generated'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    console.log(t3Run.stdout);
    if (t3Run.status !== 0) {
      console.error(t3Run.stderr);
      process.exit(1);
    }
    t3Replacement.generated = fs.readdirSync(GEN)
      .filter((f) => f.startsWith('lesen-t3-auto-') && f.endsWith('.json'))
      .map((f) => ({ f, mtime: fs.statSync(path.join(GEN, f)).mtimeMs }))
      .filter((x) => x.mtime >= beforeMs - 2000)
      .sort((a, b) => a.mtime - b.mtime)
      .map((x) => x.f);
  }
  const newT3 = t3Replacement.generated;

  const langHits = grepLangLower(newT3);

  const all25 = [...REPROCESS, ...newT3];
  const filesContent = Object.fromEntries(
    all25.map((f) => [f, fs.readFileSync(path.join(GEN, f), 'utf8')]),
  );

  console.log('\n=== Paso 3: casos específicos ===');
  const cases = checkCases(filesContent);
  for (const c of cases) console.log(`${c.category}  ${c.case}`);

  console.log('\n=== Paso 4: gates ===');
  const gates = runGates(all25);

  const report = {
    generatedAt: new Date().toISOString(),
    tanda: '2026-07-09T09:30:00Z',
    reprocess,
    t3Replacement,
    langLowerHits: langHits,
    cases,
    gates,
    finalFiles: all25,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nReporte: ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
