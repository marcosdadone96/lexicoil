#!/usr/bin/env node
/**
 * Comparative caps pool analysis — v5 / v6 / v6.1-A.
 * Run: node scripts/analyze-caps-pool-compare.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyTextRegime, REGIME } from './lib/textRegime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GT = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts/lib/__tests__/germanCapsGate.groundtruth.json'), 'utf8'),
);

const REPORTS = {
  v5: path.join(ROOT, 'batches/ready/german-caps-gate-report-v5.json'),
  v6: path.join(ROOT, 'batches/ready/german-caps-gate-report-v6.json'),
  'v6.1-A': path.join(ROOT, 'batches/ready/german-caps-gate-report-v6.1-A.json'),
  'v6.1-B': path.join(ROOT, 'batches/ready/german-caps-gate-report-v6.1-B.json'),
};

const GROUPED = {
  v5: path.join(ROOT, 'batches/ready/caps-findings-v5-grouped.tsv'),
  v6: path.join(ROOT, 'batches/ready/caps-findings-v6-grouped.tsv'),
  'v6.1-A': path.join(ROOT, 'batches/ready/caps-findings-v6.1-A-grouped.tsv'),
  'v6.1-B': path.join(ROOT, 'batches/ready/caps-findings-v6.1-B-grouped.tsv'),
};

function flat(report) {
  const out = [];
  for (const [file, findings] of Object.entries(report.byFile || {})) {
    for (const f of findings) out.push({ file, ...f });
  }
  return out;
}

function teilOf(file) {
  const m = file.match(/t(\d)/i);
  return m ? Number(m[1]) : 0;
}

function pct(n, t) {
  return t ? `${((n / t) * 100).toFixed(1)}%` : '0%';
}

function countGroupedTsv(p) {
  if (!fs.existsSync(p)) return { patterns: 0, occurrences: 0 };
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n').slice(1);
  let occ = 0;
  for (const line of lines) {
    occ += Number(line.split('\t')[6] || 0);
  }
  return { patterns: lines.length, occurrences: occ };
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFC');
const realSigs = new Set(GT.MUST_CATCH.map((c) => `${c.file}|${norm(c.token)}|${c.field || ''}`));

function isMustCatch(f) {
  const sig = `${f.file}|${norm(f.word)}|${f.field}`;
  if (realSigs.has(sig)) return true;
  for (const c of GT.MUST_CATCH) {
    if (c.file === f.file && norm(c.token) === norm(f.word) && c.field === f.field) return true;
  }
  return false;
}

function isConfirmedReal(f) {
  if (isMustCatch(f)) return true;
  const ctx = f.context || '';
  const prosePatterns = [
    /\bIch\s+Glaube\b/i, /\bWir\s+Essen\b/i, /\bSie\s+(Berichten|Folgen|Stellen)\b/,
    /\bWas\s+Raten\b/i, /\bUnternehmen\s+wir\b/i, /\bFamilien\s+Wissen\b/i,
    /\bZeitungen\s+Spielen\b/i, /\bJahre\s+Zahlen\b/i,
    /\bkosten\s+für\s+die\s+Familie\s+Verursachen\b/i, /\bkostenlos\s+Arbeiten\b/i,
    /\bGemeinschaft\s+Stärken\b/i, /\bfrisch\s+Kochen\b/i, /\bKurs\s+Besuchen\b/i,
    /\bzusammen\s+Kochen\b/i, /\bExperten\s+Glauben\b/i, /\bRedaktionen\s+Arbeiten\b/i,
    /\bGärtnern\s+Viele\b/i, /\bMitschülern\s+Posten\b/i, /\bZonen\s+Erfolgen\b/i,
    /\bden\s+Ganzen\s+Tag\b/i, /\bGemüse\s+Essen\b/i, /\bIch\s+Stimme\b/i,
    /\bÖffentlicher\s+Verkehr/i, /\bin\s+Bessere\s+Fahrrad/i, /\bMorgens\s+online\b/i,
  ];
  if (prosePatterns.some((re) => re.test(ctx))) return true;
  const tok = norm(f.word);
  if (['geräten', 'geraeten', 'schulaktivitäten', 'schulaktivitaeten', 'geräteschäden', 'geraeteschaeden'].includes(tok) && f.type === 'noun_lowercase') {
    return true;
  }
  if (tok === 'kosten' && f.type === 'noun_lowercase' && /Verursachen/i.test(ctx)) return true;
  if (f.word === 'Spät' && f.field === 'questions.question' && /zu\s+Spät\s+zurückgibt/i.test(ctx)) return true;
  return false;
}

function regimeOf(f) {
  return classifyTextRegime({ text: f.context || '', field: f.field || '', file: f.file || '' }).regime;
}

const PROSE_FP_LEX = new Set(['viele', 'zwischen', 'machen', 'buchen', 'suchen', 'treffen', 'welchen', 'medien', 'laufen']);
const PROSE_FP_ADJ = new Set(['Junge', 'Deutschen', 'Freie', 'Vielen', 'Niedrigen', 'Rasenflächen', 'Hamburger', 'Yogalehrer', 'Erste']);

function isTelegraphicFp(f) {
  if (isConfirmedReal(f)) return false;
  if (regimeOf(f) !== REGIME.TELEGRAPHIC_AD) return false;
  const ctx = f.context || '';
  if (/auch\s+Schrift/i.test(ctx)) return true;
  if (norm(f.word) === 'treff' && /—/.test(ctx)) return true;
  if (/Professioneller\s+Ton/i.test(ctx)) return true;
  if (/Probestunde\s+Nachhilfe/i.test(ctx)) return true;
  if (/FlexDrive\s+Tagesmiete/i.test(ctx)) return true;
  if (f.reason === 'prose_strict_homograph' && teilOf(f.file) === 3) return true;
  return false;
}

function isProseFp(f) {
  if (isConfirmedReal(f)) return false;
  if (regimeOf(f) !== REGIME.PROSE) return false;
  const ctx = f.context || '';
  const tok = norm(f.word);
  if (['lexicon_override_tag', 'lexicon_nn', 'lexicon_after_adj', 'modal_noun_object'].includes(f.reason) && PROSE_FP_LEX.has(tok)) {
    return true;
  }
  if (f.reason === 'adj_before_noun' && PROSE_FP_ADJ.has(f.word)) return true;
  if (f.reason === 'verb_census_no_finite') {
    if (/Wissen\s+sammeln|Informationen\s+Sicher|Initiativen\s+Konsumenten|Beispiel\s+Bewerbungsgespräche|Ausschließlich\s+Kurse|Nur\s+Kurse|Teamarbeit|Verspätung|Euro\s+Kosten/i.test(ctx)) {
      return true;
    }
  }
  if (f.reason === 'adv_capitalized' && f.word === 'Sicher') return true;
  if (f.reason === 'zu_adv_capitalized' && f.word === 'Spät' && /zu\s+Spät\s+ist/i.test(ctx)) return true;
  if (f.reason === 'modal_final_infinitive' && /Uhr\s+Besuchen|persönlich\s+Erfolgen|Fenstern\s+nicht\s+Laufen|Bitte\s+Waschen/i.test(ctx)) return true;
  return false;
}

function classify(f) {
  if (isConfirmedReal(f)) return 'real_error';
  if (isTelegraphicFp(f)) return 'fp_telegraphic';
  if (isProseFp(f)) return 'fp_prose';
  return 'ambiguous';
}

function analyzeVersion(label, reportPath, groupedPath) {
  if (!fs.existsSync(reportPath)) {
    console.error(`Missing report: ${reportPath}`);
    return null;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const findings = flat(report);
  const total = findings.length;
  const g = countGroupedTsv(groupedPath);

  const byRegime = {};
  const byTeil = {};
  const byField = {};
  const byClass = {};
  const byReason = {};

  for (const f of findings) {
    const r = regimeOf(f);
    byRegime[r] = (byRegime[r] || 0) + 1;
    byTeil[teilOf(f.file)] = (byTeil[teilOf(f.file)] || 0) + 1;
    byField[f.field] = (byField[f.field] || 0) + 1;
    byClass[classify(f)] = (byClass[classify(f)] || 0) + 1;
    byReason[f.reason] = (byReason[f.reason] || 0) + 1;
  }

  return {
    label,
    total,
    filesWithFindings: report.filesWithFindings || Object.keys(report.byFile || {}).length,
    totalFiles: report.totalFiles,
    observations: report.totalObservations || 0,
    groupedPatterns: g.patterns,
    groupedOccurrences: g.occurrences,
    byRegime,
    byTeil,
    byField,
    byClass,
    byReason,
    findings,
  };
}

function countPattern(findings, pred) {
  return findings.filter(pred).length;
}

const versions = ['v5', 'v6', 'v6.1-A'];
const data = {};
for (const v of versions) {
  data[v] = analyzeVersion(v, REPORTS[v], GROUPED[v]);
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  INFORME CUANTITATIVO — caps pool v5 → v6 → v6.1-A');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('── Métricas principales ──\n');
console.log('| Métrica | v5 | v6 | v6.1-A | v6→v6.1-A |');
console.log('|---|---:|---:|---:|---:|');
const m = (fn) => versions.map((v) => (data[v] ? fn(data[v]) : '—'));
console.log(`| Findings bloqueantes | ${m((d) => d.total).join(' | ')} | ${data.v6 && data['v6.1-A'] ? data.v6.total - data['v6.1-A'].total : '—'} |`);
console.log(`| Archivos afectados | ${m((d) => d.filesWithFindings).join(' | ')} | ${data.v6 && data['v6.1-A'] ? data.v6.filesWithFindings - data['v6.1-A'].filesWithFindings : '—'} |`);
console.log(`| Patrones agrupados (TSV) | ${m((d) => d.groupedPatterns).join(' | ')} | ${data.v6 && data['v6.1-A'] ? data.v6.groupedPatterns - data['v6.1-A'].groupedPatterns : '—'} |`);
console.log(`| Observations relajadas | ${m((d) => d.observations || '—').join(' | ')} | — |`);

const d61 = data['v6.1-A'];
if (!d61) {
  console.error('\nRun calibration first: node scripts/calibrate-german-caps-gate.mjs --json-out batches/ready/german-caps-gate-report-v6.1-A.json');
  process.exit(1);
}

console.log('\n── Distribución por régimen (v6.1-A) ──');
for (const r of [REGIME.PROSE, REGIME.TELEGRAPHIC_AD, REGIME.TITLE_HEADING]) {
  console.log(`  ${r}: ${d61.byRegime[r] || 0} (${pct(d61.byRegime[r] || 0, d61.total)})`);
}

console.log('\n── Distribución por Teil (v6.1-A) ──');
for (const t of [1, 2, 3, 4, 5]) {
  console.log(`  t${t}: ${d61.byTeil[t] || 0} (${pct(d61.byTeil[t] || 0, d61.total)})`);
}

console.log('\n── Distribución por field (v6.1-A) ──');
for (const [k, n] of Object.entries(d61.byField).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${n} (${pct(n, d61.total)})`);
}

console.log('\n── Clasificación v6.1-A ──');
for (const [k, label] of [
  ['real_error', 'Errores reales confirmados'],
  ['fp_telegraphic', 'FP telegráfico residual'],
  ['fp_prose', 'FP prosa'],
  ['ambiguous', 'Ambiguos'],
]) {
  console.log(`  ${label}: ${d61.byClass[k] || 0} (${pct(d61.byClass[k] || 0, d61.total)})`);
}
const real = d61.byClass.real_error || 0;
const noise = d61.total - real;
console.log(`  Ratio ruido/real: ${(noise / Math.max(real, 1)).toFixed(1)}:1`);

console.log('\n── Atención especial: patrones prioritarios ──\n');
const checks = [
  { name: 'auch Schrift', pred: (f) => /auch\s+Schrift/i.test(f.context || '') },
  { name: 'NachbarSchatz Treff', pred: (f) => /NachbarSchatz\s+Treff/i.test(f.context || '') },
  { name: 'Professioneller Ton', pred: (f) => /Professioneller\s+Ton/i.test(f.context || '') },
  { name: 'Probestunde Nachhilfe', pred: (f) => /Probestunde\s+Nachhilfe/i.test(f.context || '') },
  { name: 'FlexDrive Tagesmiete', pred: (f) => /FlexDrive\s+Tagesmiete/i.test(f.context || '') },
];
console.log('| Patrón | v5 | v6 | v6.1-A |');
console.log('|---|---:|---:|---:|');
for (const c of checks) {
  const counts = versions.map((v) => (data[v] ? countPattern(data[v].findings, c.pred) : '—'));
  console.log(`| ${c.name} | ${counts.join(' | ')} |`);
}

console.log('\n── Reason codes (v5 → v6 → v6.1-A) ──');
const allReasons = new Set();
for (const v of versions) {
  if (data[v]) Object.keys(data[v].byReason).forEach((r) => allReasons.add(r));
}
for (const r of [...allReasons].sort()) {
  const counts = versions.map((v) => data[v]?.byReason[r] || 0);
  console.log(`  ${r}: ${counts.join(' → ')}`);
}

console.log('\n── Clasificación comparada ──');
console.log('| Categoría | v5 | v6 | v6.1-A |');
console.log('|---|---:|---:|---:|');
for (const k of ['real_error', 'fp_telegraphic', 'fp_prose', 'ambiguous']) {
  console.log(`| ${k} | ${versions.map((v) => data[v]?.byClass[k] || 0).join(' | ')} |`);
}

// New patterns in v6.1-A vs v6
if (data.v6) {
  const sig = (f) => `${f.word}|${f.type}|${f.reason}|${f.prevWord}|${f.field}`;
  const v6sigs = new Set(data.v6.findings.map(sig));
  const v61only = d61.findings.filter((f) => !v6sigs.has(sig(f)));
  const v6only = data.v6.findings.filter((f) => !new Set(d61.findings.map(sig)).has(sig(f)));

  console.log('\n── Patrones eliminados v6 → v6.1-A (top 15 por token) ──');
  const elimGroups = new Map();
  for (const f of v6only) {
    const k = `${f.word} | ${f.reason} | ${f.prevWord}+${f.prevPos}`;
    elimGroups.set(k, (elimGroups.get(k) || 0) + 1);
  }
  for (const [k, n] of [...elimGroups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${n}x  ${k}`);
  }

  console.log('\n── Patrones nuevos en v6.1-A (vs v6) ──');
  if (!v61only.length) {
    console.log('  (ninguno — solo reducción)');
  } else {
    const newG = new Map();
    for (const f of v61only) {
      const k = `${f.word} | ${f.reason} | ${f.prevWord}+${f.prevPos}`;
      newG.set(k, (newG.get(k) || 0) + 1);
    }
    for (const [k, n] of [...newG.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`  ${n}x  ${k}`);
    }
  }

  console.log('\n── Top 20 patrones agrupados v6.1-A ──');
  if (fs.existsSync(GROUPED['v6.1-A'])) {
    const lines = fs.readFileSync(GROUPED['v6.1-A'], 'utf8').trim().split('\n').slice(1);
    const rows = lines
      .map((line) => {
        const c = line.split('\t');
        return { token: c[0], pattern: c[2], reason: c[5], count: Number(c[6]), ex: c[7] };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    for (const r of rows) {
      console.log(`  ${String(r.count).padStart(3)}x  ${r.token} | ${r.pattern} | ${r.reason}`);
    }
  }
}

console.log('\n── Resumen ejecutivo ──');
console.log(`  v5→v6:     ${data.v5?.total} → ${data.v6?.total} (−${(data.v5?.total || 0) - (data.v6?.total || 0)})`);
console.log(`  v6→v6.1-A: ${data.v6?.total} → ${d61.total} (−${(data.v6?.total || 0) - d61.total})`);
console.log(`  v5→v6.1-A: ${data.v5?.total} → ${d61.total} (−${(data.v5?.total || 0) - d61.total}, −${pct((data.v5?.total || 0) - d61.total, data.v5?.total || 1)})`);
console.log(`  FP telegráfico: v6 ${data.v6?.byClass.fp_telegraphic || 0} → v6.1-A ${d61.byClass.fp_telegraphic || 0}`);
console.log(`  Real confirmado: v6 ${data.v6?.byClass.real_error || 0} → v6.1-A ${d61.byClass.real_error || 0}`);
