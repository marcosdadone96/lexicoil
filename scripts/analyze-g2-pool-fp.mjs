#!/usr/bin/env node
/**
 * Structural FP analysis — pool v6.1-B-G2 (88 findings).
 * Run: node scripts/analyze-g2-pool-fp.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyTextRegime, REGIME } from './lib/textRegime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GT = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts/lib/__tests__/germanCapsGate.groundtruth.json'), 'utf8'),
);
const REPORT = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/ready/german-caps-gate-report-v6.1-B-G2.json'), 'utf8'),
);

const norm = (s) => String(s || '').toLowerCase().normalize('NFC');

function flat(report) {
  const out = [];
  for (const [file, findings] of Object.entries(report.byFile || {})) {
    for (const f of findings) out.push({ file, ...f });
  }
  return out;
}

function isMustCatch(f) {
  for (const c of GT.MUST_CATCH) {
    if (c.file === f.file && norm(c.token) === norm(f.word) && c.field === f.field) return true;
  }
  return false;
}

function regimeOf(f) {
  return classifyTextRegime({ text: f.context || '', field: f.field || '', file: f.file || '' }).regime;
}

function teilOf(file) {
  const m = String(file || '').match(/t(\d)/i);
  return m ? Number(m[1]) : 0;
}

/** Conservative real-error detector (MUST_CATCH + known prose patterns). */
function isConfirmedReal(f) {
  if (isMustCatch(f)) return true;
  const ctx = f.context || '';
  const patterns = [
    /\bIch\s+Glaube\b/i, /\bWir\s+Essen\b/i, /\bSie\s+(Berichten|Folgen|Stellen)\b/,
    /\bWas\s+Raten\b/i, /\bUnternehmen\s+wir\b/i, /\bFamilien\s+Wissen\b/i,
    /\bZeitungen\s+Spielen\b/i, /\bJahre\s+Zahlen\b/i,
    /\bkosten\s+für\s+die\s+Familie\s+Verursachen\b/i, /\bkostenlos\s+Arbeiten\b/i,
    /\bGemeinschaft\s+Stärken\b/i, /\bfrisch\s+Kochen\b/i, /\bExperten\s+Glauben\b/i,
    /\bRedaktionen\s+Arbeiten\b/i, /\bGärtnern\s+Viele\b/i, /\bMitschülern\s+Posten\b/i,
    /\bZonen\s+Erfolgen\b/i, /\bden\s+Ganzen\s+Tag\b/i, /\bGemüse\s+Essen\b/i,
    /\bIch\s+Stimme\b/i, /\bÖffentlicher\s+Verkehr/i, /\bin\s+Bessere\s+Fahrrad/i,
    /\bMorgens\s+online\b/i, /\bVielen\s+Städten\b/i, /\bViele\s+Kinder\b/i,
    /\bVielen\s+Medieninhalte\b/i, /\bInitiativen\s+Konsumenten\b/i,
    /\bBeispiel\s+Bewerbungsgespräche\b/i, /\bBitte\s+Waschen\b/i,
    /\bUhr\s+Besuchen\b/i, /\bpersönlich\s+Erfolgen\b/i,
  ];
  if (patterns.some((re) => re.test(ctx))) return true;
  const tok = norm(f.word);
  if (['geräten', 'schulaktivitäten', 'geräteschäden', 'kosten'].includes(tok) && f.type === 'noun_lowercase') {
    if (tok === 'kosten' && !/Verursachen/i.test(ctx)) return false;
    return true;
  }
  if (f.word === 'Spät' && /zu\s+Spät\s+zurückgibt/i.test(ctx)) return true;
  return false;
}

/** Conservative FP detector — only high-confidence structural FPs. */
function isClearFp(f) {
  if (isConfirmedReal(f)) return false;
  const ctx = f.context || '';
  const tok = norm(f.word);
  const r = f.reason || '';
  const reg = regimeOf(f);

  // B1 residuals already handled in calibration — remaining lexicon FPs
  if (r === 'lexicon_override_tag' || r === 'lexicon_nn' || r === 'lexicon_after_adj') {
    if (['machen', 'buchen', 'suchen', 'treffen', 'laufen', 'wissen', 'zwischen', 'medien'].includes(tok)) return true;
  }
  if (r === 'modal_noun_object' && ['machen', 'buchen'].includes(tok)) return true;

  // verb_census: coordinated V1 false positives (noun parsed as verb position)
  if (r === 'verb_census_no_finite') {
    if (/Wissen\s+sammeln|Informationen\s+Sicher|Teamarbeit|Verspätung|Euro\s+Kosten|Ausschließlich\s+Kurse|Nur\s+Kurse/i.test(ctx)) {
      return true;
    }
  }

  // Homograph Besuchen as noun in list context
  if (tok === 'besuchen' && r === 'verb_census_no_finite' && /Supermärkte\s+zu\s+Besuchen|Kurse\s+Besuchen/i.test(ctx)) {
    return true;
  }

  // Rasenflächen — noun after ADP, mis-tagged
  if (f.word === 'Rasenflächen' && r === 'adj_before_noun') return true;

  // TITLE signText — Ich Stimme/Glaube pattern is real in ground truth; others ambiguous
  if (reg === REGIME.TITLE_HEADING && r === 'verb_census_no_finite') return false;

  return false;
}

function structuralGroup(f) {
  const prev = `${f.prevWord || '?'}|${f.prevPos || f.prevTag || '?'}`;
  const reg = regimeOf(f);
  const r = f.reason || '?';
  const tok = f.word || '?';

  if (r === 'verb_census_no_finite') {
    return `verb_census | ${reg} | prev=${prev} | token~${tok}`;
  }
  if (r === 'adj_before_noun') {
    return `adj_before_noun | ${reg} | prev=${prev} | tag=${f.tag || '?'}`;
  }
  if (r.startsWith('lexicon') || r === 'modal_noun_object') {
    return `lexicon_lowercase | ${reg} | prev=${prev} | ${r}`;
  }
  if (r === 'quantifier_capitalized') {
    return `quantifier | ${reg} | prev=${prev}`;
  }
  if (reg === REGIME.TITLE_HEADING) {
    return `TITLE | ${r} | prev=${prev}`;
  }
  return `${r} | ${reg} | prev=${prev} | ${f.tag || '?'}`;
}

function structuralFamily(groupKey) {
  if (groupKey.startsWith('verb_census')) return 'verb_census_no_finite';
  if (groupKey.startsWith('adj_before_noun')) return 'adj_before_noun';
  if (groupKey.startsWith('lexicon_lowercase')) return 'lexicon_noun_lowercase';
  if (groupKey.startsWith('quantifier')) return 'quantifier_capitalized';
  if (groupKey.startsWith('TITLE')) return 'title_heading';
  return 'other';
}

const findings = flat(REPORT);
const byReason = {};
const byClass = { real_error: [], fp_clear: [], ambiguous: [] };
const byFamily = {};
const fpByPattern = new Map();

for (const f of findings) {
  byReason[f.reason] = (byReason[f.reason] || 0) + 1;
  let cls = 'ambiguous';
  if (isConfirmedReal(f)) cls = 'real_error';
  else if (isClearFp(f)) cls = 'fp_clear';
  byClass[cls].push(f);

  const gk = structuralGroup(f);
  const fam = structuralFamily(gk);
  if (!byFamily[fam]) byFamily[fam] = { real: 0, fp: 0, amb: 0, total: 0 };
  byFamily[fam].total += 1;
  byFamily[fam][cls === 'real_error' ? 'real' : cls === 'fp_clear' ? 'fp' : 'amb'] += 1;

  if (cls === 'fp_clear') {
    const coarse = `${fam} :: ${f.reason} :: ${regimeOf(f)} :: prev=${f.prevWord}+${f.prevPos}`;
    fpByPattern.set(coarse, (fpByPattern.get(coarse) || 0) + 1);
  }
}

// Aggregate FP families (merge similar verb_census)
const fpFamilies = {};
for (const f of byClass.fp_clear) {
  const fam = structuralFamily(structuralGroup(f));
  fpFamilies[fam] = (fpFamilies[fam] || 0) + 1;
}

const fpPatternsSorted = [...fpByPattern.entries()].sort((a, b) => b[1] - a[1]);
const fpFamiliesSorted = Object.entries(fpFamilies).sort((a, b) => b[1] - a[1]);

const report = {
  pool: 'v6.1-B-G2',
  total: findings.length,
  byReason,
  byClass: {
    real_error: byClass.real_error.length,
    fp_clear: byClass.fp_clear.length,
    ambiguous: byClass.ambiguous.length,
  },
  byFamily,
  fpFamilies,
  fpPatternsSorted: fpPatternsSorted.map(([k, n]) => ({ pattern: k, count: n })),
  groupsGte5Fp: fpFamiliesSorted.filter(([, n]) => n >= 5).map(([k, n]) => ({ family: k, fp: n })),
  mustCatchInPool: byClass.real_error.filter(isMustCatch).length,
  ambiguousByReason: {},
};

for (const f of byClass.ambiguous) {
  report.ambiguousByReason[f.reason] = (report.ambiguousByReason[f.reason] || 0) + 1;
}

const outJson = path.join(ROOT, 'batches/ready/g2-pool-fp-analysis.json');
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log('══════════════════════════════════════════════════');
console.log('  Pool G2 — análisis estructural FP (88 findings)');
console.log('══════════════════════════════════════════════════\n');
console.log(`Total: ${findings.length}`);
console.log(`Real confirmado: ${byClass.real_error.length}`);
console.log(`FP claro:        ${byClass.fp_clear.length}`);
console.log(`Ambiguo:         ${byClass.ambiguous.length}`);
console.log(`MUST_CATCH en pool: ${report.mustCatchInPool}\n`);

console.log('── Por reason code ──');
for (const [k, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${n}`);
}

console.log('\n── Por familia estructural ──');
for (const [fam, v] of Object.entries(byFamily).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${fam}: total=${v.total} real=${v.real} fp=${v.fp} amb=${v.amb}`);
}

console.log('\n── Familias FP (conservador) ──');
for (const [k, n] of fpFamiliesSorted) {
  console.log(`  ${k}: ${n}${n >= 5 ? '  ← ≥5' : ''}`);
}

console.log('\n── Top patrones FP ──');
for (const { pattern, count } of report.fpPatternsSorted.slice(0, 15)) {
  console.log(`  ${count}x  ${pattern}`);
}

console.log('\n── Grupos con ≥5 FP ──');
if (report.groupsGte5Fp.length) {
  for (const g of report.groupsGte5Fp) console.log(`  ${g.family}: ${g.fp} FP`);
} else {
  console.log('  (ninguno)');
}

console.log(`\nJSON: ${outJson}`);
