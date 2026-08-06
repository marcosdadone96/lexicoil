#!/usr/bin/env node
/**
 * Quantitative noise analysis for caps-findings v5.
 * Does NOT modify the detector.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'batches/ready/german-caps-gate-report-v5.json');
const GROUPED = path.join(ROOT, 'batches/ready/caps-findings-v5-grouped.tsv');
const GT = path.join(ROOT, 'scripts/lib/__tests__/germanCapsGate.groundtruth.json');

const gt = JSON.parse(fs.readFileSync(GT, 'utf8'));
const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));

const flat = [];
for (const [file, findings] of Object.entries(report.byFile || {})) {
  for (const f of findings) flat.push({ file, ...f });
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFC');

// ── Known real errors (MUST_CATCH + user-confirmed homograph errors in prose) ──
const realSignatures = new Set();
for (const c of gt.MUST_CATCH) {
  realSignatures.add(`${c.file}|${norm(c.token)}|${c.field || ''}`);
}

const REAL_HOMOGRAPH_IN_PROSE = new Set([
  'spielen', 'berichten', 'folgen', 'stellen', 'glauben', 'arbeiten', 'essen', 'wissen',
  'zahlen', 'verursachen', 'posten', 'kosten', 'stärken', 'staerken', 'raten', 'kochen',
  'besuchen', 'unternehmen', 'erfolgen', 'geräten', 'geraeten', 'schulaktivitäten',
  'schulaktivitaeten', 'geräteschäden', 'geraeteschaeden', 'morgens', 'spät', 'spat',
  'ganzen', 'bessere', 'öffentlicher', 'oeffentlicher', 'vielen',
]);

const AD_STRUCTURAL_PREV = new Set([
  'anfängerkurs', 'anfaengerkurs', 'probestunde', 'professioneller', 'abholung', 'horizont',
  'nachbarschatz', 'flexdrive', 'lichtwerk', 'strickkurs', 'lebensretter', 'spitzentanz',
  'erdreich', 'stimmraum', 'grünkurs', 'gruenkurs', 'tastenwelt', 'bühnenluft', 'buehnenluft',
]);

const AD_STRUCTURAL_PATTERNS = [
  /^[A-Z]\)\s/,
  /—/,
  /\bAnfängerkurs\b/i,
  /\bProbestunde\b/i,
  /\bProfessioneller\b/i,
  /\bAbholung\b/i,
  /\bMo\s+\d/i,
  /\bDi\s+\d/i,
  /online oder daheim/i,
  /\d+\s*-\s*\d+\s*Uhr/i,
];

function teilOf(file) {
  const m = file.match(/t(\d)/i);
  return m ? Number(m[1]) : 0;
}

function isCamelCaseBrand(word) {
  return /^[A-ZÄÖÜ][a-zäöüß]+[A-Z]/.test(word) || /^[A-Z][a-z]+[A-Z]/.test(word);
}

function isAdTelegraphic(f) {
  const ctx = f.context || '';
  const prev = norm(f.prevWord);
  const file = f.file;

  if (file.includes('t3-auto') && f.field === 'questions.options') return true;
  if (file.includes('t3-gemini') && f.field === 'questions.options') return true;
  if (AD_STRUCTURAL_PREV.has(prev)) return true;
  if (prev === ')' || prev === '(') return true;
  if (AD_STRUCTURAL_PATTERNS.some((re) => re.test(ctx))) return true;
  if (f.reason === 'verb_census_no_finite' && f.field === 'questions.options' && teilOf(file) === 3) {
    return true;
  }
  return false;
}

function isCommercialName(f) {
  if (isCamelCaseBrand(f.word)) return true;
  if (isCamelCaseBrand(f.prevWord || '')) return true;
  const brands = ['horizont', 'flexdrive', 'lichtwerk', 'tastenwelt', 'bühnenluft', 'buehnenluft',
    'nachbarschatz', 'strickkurs', 'spitzentanz', 'erdreich', 'stimmraum', 'lebensretter', 'grünkurs'];
  if (brands.includes(norm(f.prevWord))) return true;
  if (brands.includes(norm(f.word))) return true;
  return false;
}

function isTitleOrHeader(f) {
  if (f.field === 'questions.signText') return true;
  if (f.field === 'passages.title') return true;
  const ctx = (f.context || '').trim();
  if (/^[A-Z]\)\s/.test(ctx)) return true;
  if (/^Endlich\s|^Bitte\s/.test(ctx)) return true;
  if (f.prevWord === ')' && f.field === 'questions.options') return true;
  return false;
}

function isProseField(f) {
  return ['passages.text', 'questions.explanation', 'questions.question'].includes(f.field);
}

function isRealError(f) {
  const sig = `${f.file}|${norm(f.word)}|${f.field}`;
  if (realSignatures.has(sig)) return true;

  // Same token+file as MUST_CATCH even if field differs slightly (explanation dup)
  for (const c of gt.MUST_CATCH) {
    if (c.file === f.file && norm(c.token) === norm(f.word)) {
      if (c.field === f.field) return true;
      // Essen appears in both passage and explanation
      if (norm(c.token) === 'essen' && f.field.includes('passages')) return true;
    }
  }

  // Prose homograph errors (gemini t1/t2/t4/t5, not t3-auto ads)
  if (f.file.includes('t3-auto')) return false;
  const tok = norm(f.word);
  if (!REAL_HOMOGRAPH_IN_PROSE.has(tok)) return false;
  if (!isProseField(f) && !(f.field === 'questions.options' && !isAdTelegraphic(f))) return false;

  // Strong prose error patterns from user review
  const ctx = f.context || '';
  const prosePatterns = [
    /\bIch\s+Glaube\b/i,
    /\bWir\s+Essen\b/i,
    /\bSie\s+(Berichten|Folgen|Stellen)\b/,
    /\bWas\s+Raten\b/i,
    /\bUnternehmen\s+wir\b/i,
    /\bFamilien\s+Wissen\b/i,
    /\bZeitungen\s+Spielen\b/i,
    /\bJahre\s+Zahlen\b/i,
    /\bkosten\s+für\s+die\s+Familie\s+Verursachen\b/i,
    /\bkostenlos\s+Arbeiten\b/i,
    /\bGemeinschaft\s+Stärken\b/i,
    /\bfrisch\s+Kochen\b/i,
    /\bKurs\s+Besuchen\b/i,
    /\bzusammen\s+Kochen\b/i,
    /\bExperten\s+Glauben\b/i,
    /\bRedaktionen\s+Arbeiten\b/i,
    /\bGärtnern\s+Viele\b/i,
    /\bwas\s+sie\s+Essen\b/i,
    /\bMitschülern\s+Posten\b/i,
    /\bZonen\s+Erfolgen\b/i,
    /\bden\s+Ganzen\s+Tag\b/i,
  ];
  if (prosePatterns.some((re) => re.test(ctx))) return true;

  if (f.file.includes('gemini') && teilOf(f.file) !== 3 && REAL_HOMOGRAPH_IN_PROSE.has(tok)) {
    if (['verb_census_no_finite', 'modal_final_infinitive', 'adv_before_verb', 'quantifier_capitalized',
      'adv_after_pronoun', 'zu_adv_capitalized'].includes(f.reason)) {
      if (f.prevPos === 'PRON' || f.prevWord === 'Sie' || f.prevWord === 'Wir' || f.prevWord === 'Ich') return true;
    }
  }
  return false;
}

function isProseCompleteSentenceFp(f) {
  if (isRealError(f)) return false;
  if (isAdTelegraphic(f) || isTitleOrHeader(f)) return false;
  if (!f.file.includes('gemini') || f.file.includes('t3-')) return false;
  if (!isProseField(f)) return false;

  // Lexicon / adj false positives in running text
  if (['lexicon_override_tag', 'lexicon_nn', 'lexicon_after_adj', 'modal_noun_object'].includes(f.reason)) {
    return true;
  }
  if (f.reason === 'adj_before_noun' && ['Junge', 'Deutschen', 'Freie', 'Vielen', 'Niedrigen', 'Rasenflächen'].includes(f.word)) {
    return true;
  }
  // Prose with finite verb nearby wrongly flagged (Wissen sammeln, Konsumenten with verb, etc.)
  if (f.reason === 'verb_census_no_finite') {
    const ctx = f.context || '';
    if (/\b(sammeln|haben|zeigt|gibt|muss|sind|ist|kann|werden|bietet|empfiehlt)\b/i.test(ctx)) return true;
  }
  return true; // remaining gemini prose non-real
}

function classify(f) {
  if (isRealError(f)) return 'real_error';
  if (isAdTelegraphic(f)) return 'ad_listing_t3';
  if (isTitleOrHeader(f)) return 'title_header';
  if (isCommercialName(f)) return 'commercial_name';
  if (isProseCompleteSentenceFp(f)) return 'prose_fp';
  return 'other';
}

const counts = {};
const byCategory = {};
for (const f of flat) {
  const cat = classify(f);
  counts[cat] = (counts[cat] || 0) + 1;
  if (!byCategory[cat]) byCategory[cat] = [];
  byCategory[cat].push(f);
}

const total = flat.length;
const pct = (n) => `${((n / total) * 100).toFixed(1)}%`;

// Overlap analysis (non-exclusive tags)
const tags = {
  t3_file: flat.filter((f) => teilOf(f.file) === 3).length,
  options_field: flat.filter((f) => f.field === 'questions.options').length,
  verb_census: flat.filter((f) => f.reason === 'verb_census_no_finite').length,
  camelCase: flat.filter((f) => isCamelCaseBrand(f.word) || isCamelCaseBrand(f.prevWord)).length,
};

// Grouped TSV pattern analysis
const groupedLines = fs.readFileSync(GROUPED, 'utf8').trim().split('\n').slice(1);
let groupedTotal = 0;
const groupedCat = {};
for (const line of groupedLines) {
  const cols = line.split('\t');
  const count = Number(cols[6] || 0);
  groupedTotal += count;
  const fake = {
    word: cols[0],
    type: cols[1],
    prevWord: cols[3],
    prevPos: cols[4],
    reason: cols[5],
    field: cols[5]?.includes('options') ? 'questions.options' : 'questions.options',
    context: cols[7] || '',
    file: (cols[7] || '').split(':')[0] || '',
  };
  // infer field from example
  if (cols[7]?.includes('passages.text')) fake.field = 'passages.text';
  else if (cols[7]?.includes('questions.explanation')) fake.field = 'questions.explanation';
  else fake.field = 'questions.options';
  const cat = classify({ ...fake, file: fake.file || 'lesen-t3-auto-001.json' });
  groupedCat[cat] = (groupedCat[cat] || 0) + count;
}

// Real errors list in pool
const realInPool = byCategory.real_error || [];

console.log('=== INFORME CUANTITATIVO — caps-findings v5 ===\n');
console.log(`Total findings individuales: ${total}`);
console.log(`Patrones agrupados (TSV): ${groupedLines.length} patrones / ${groupedTotal} ocurrencias\n`);

console.log('── Clasificación primaria (excluyente, jerárquica) ──');
const order = ['ad_listing_t3', 'commercial_name', 'title_header', 'prose_fp', 'real_error', 'other'];
const labels = {
  ad_listing_t3: 'Anuncios / listados (Teil 3 telegráfico)',
  commercial_name: 'Nombres comerciales / marcas (estructural)',
  title_header: 'Títulos / encabezados / ítems de lista',
  prose_fp: 'Frases completas — FP en prosa gemini (t1/t2/t4/t5)',
  real_error: 'Errores reales (MUST_CATCH + homógrafos confirmados)',
  other: 'Otros / ambiguos',
};
for (const k of order) {
  const n = counts[k] || 0;
  console.log(`  ${labels[k]}: ${n}  (${pct(n)})`);
}

console.log('\n── Desglose estructural (no excluyente) ──');
console.log(`  Teil 3 (cualquier campo): ${tags.t3_file} (${pct(tags.t3_file)})`);
console.log(`  Campo questions.options: ${tags.options_field} (${pct(tags.options_field)})`);
console.log(`  reason=verb_census_no_finite: ${tags.verb_census} (${pct(tags.verb_census)})`);
console.log(`  CamelCase (token o prev): ${tags.camelCase} (${pct(tags.camelCase)})`);

console.log('\n── Por Teil ──');
for (const t of [1, 2, 3, 4, 5]) {
  const n = flat.filter((f) => teilOf(f.file) === t).length;
  console.log(`  t${t}: ${n} (${pct(n)})`);
}

console.log('\n── Por campo ──');
for (const [field, n] of Object.entries(
  flat.reduce((a, f) => { a[f.field] = (a[f.field] || 0) + 1; return a; }, {}),
).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${field}: ${n} (${pct(n)})`);
}

console.log('\n── Errores reales detectados en pool (muestra) ──');
console.log(`  Count: ${realInPool.length} (${pct(realInPool.length)})`);
for (const f of realInPool.slice(0, 25)) {
  console.log(`    ${f.file} | ${f.word} | ${f.field} | ${f.reason}`);
}
if (realInPool.length > 25) console.log(`    … +${realInPool.length - 25} más`);

console.log('\n── Top 10 patrones agrupados por categoría ──');
for (const k of ['ad_listing_t3', 'prose_fp', 'real_error']) {
  console.log(`\n  [${labels[k]}]`);
  const patterns = groupedLines
    .map((line) => {
      const c = line.split('\t');
      const count = Number(c[6]);
      const fake = {
        word: c[0], prevWord: c[3], prevPos: c[4], reason: c[5],
        field: 'questions.options', context: c[7] || '',
        file: (c[7] || '').split(':')[0] || 'lesen-t3-auto-001.json',
      };
      return { line: `${c[0]} | ${c[2]} | ${count}`, cat: classify(fake), count };
    })
    .filter((p) => p.cat === k)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  for (const p of patterns) console.log(`    ${p.count}x  ${p.line}`);
}

// Summary ratio
const noise = total - (counts.real_error || 0);
console.log('\n── Resumen ejecutivo ──');
console.log(`  Ruido estimado (no error real): ${noise} (${pct(noise)})`);
console.log(`  Errores reales en pool: ${counts.real_error || 0} (${pct(counts.real_error || 0)})`);
console.log(`  Ratio ruido/error: ${(noise / Math.max(counts.real_error || 1, 1)).toFixed(1)}:1`);
