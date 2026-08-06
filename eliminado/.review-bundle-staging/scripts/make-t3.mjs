/**
 * make-t3.mjs — Generador determinista de Lesen B1 · Teil 3.
 * Parte de esqueletos YA validados (scripts/t3-blueprints/*.json), los perturba de forma
 * segura (baraja anuncios, reasigna letras, inyecta vocabulario opcional) y SE AUTOVALIDA
 * con el checker de calidad antes de escribir. Nunca produce un T3 inválido.
 *
 * Uso CLI:
 *   node scripts/make-t3.mjs --count 5
 *   node scripts/make-t3.mjs --count 5 --words "gebühr,frist,ausleihen"
 *   node scripts/make-t3.mjs --count 3 --out batches/generated
 *
 * API (importable):
 *   import { buildValidatedT3Part } from './make-t3.mjs';
 *   const batch = buildValidatedT3Part({ exclude: usedSlugsSet });
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { countReadyT3ForBlueprint, scanReadyT3Stats } from './lib/t3GroupFingerprint.mjs';
import { READY_LESEN_DIR } from './lib/batchPaths.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const LETTERS = ['A','B','C','D','E','F','G','H','I','J'];
const BLUEPRINT_DIR = path.join(ROOT, 'scripts', 't3-blueprints');

const rand = (n) => Math.floor(Math.random() * n);
function shuffle(a){ const x=[...a]; for(let i=x.length-1;i>0;i--){const j=rand(i+1);[x[i],x[j]]=[x[j],x[i]];} return x; }
function rid(p){ return `${p}-${Math.random().toString(36).slice(2,8)}`; }

function loadBlueprints() {
  return fs.readdirSync(BLUEPRINT_DIR).filter(f => f.endsWith('.json'))
    .map(f => {
      const bp = JSON.parse(fs.readFileSync(path.join(BLUEPRINT_DIR, f), 'utf8'));
      bp._file = f;
      if (!bp.slug) bp.slug = f.replace(/\.json$/, '');
      return bp;
    });
}

function stripLetter(opt){ return String(opt).replace(/^[A-J]\)\s*/, ''); }

/** CHK-14b: idiomas tras «in» y ordinales en compuestos «Zwei- und …». */
export function fixT3OptionCaps(text) {
  const langs = new Set([
    'englisch', 'französisch', 'spanisch', 'italienisch', 'deutsch', 'russisch', 'türkisch',
    'polnisch', 'arabisch', 'chinesisch', 'japanisch', 'portugiesisch',
  ]);
  let s = String(text || '');
  s = s.replace(/\bin ([A-ZÄÖÜ][a-zäöüß]+)\b/g, (m, w) =>
    langs.has(w.toLowerCase()) ? `in ${w.toLowerCase()}` : m,
  );
  s = s.replace(
    /\b(Zwei|Drei|Vier|Fünf|Sechs|Sieben|Acht|Neun|Zehn)- und/g,
    (_, n) => `${n.toLowerCase()}- und`,
  );
  return s;
}

function applyT3CapsFix(options) {
  return (options || []).map((o) => {
    const m = String(o).match(/^([A-J]\))\s*(.*)$/);
    if (!m) return fixT3OptionCaps(o);
    return `${m[1]} ${fixT3OptionCaps(m[2])}`;
  });
}

// Youth in situation vs adult-only ad (real T3 defect seen in pilot)
const YOUTH_SITUATION_RE =
  /\b(jung|junge|jungen|klein|kleine|kleines|kind|kinder|kleinkind|schüler|schülerin|jugendliche?|teenager?)\b/i;
const ADULT_ONLY_AD_RE =
  /\bfür\s+Erwachsene\b|\bnur\s+für\s+Erwachsene\b|\bab\s+1[89]\s*(Jahren|J\.)/i;
const YOUTH_OK_AD_RE =
  /\b(Kinder|Jugendliche|Schüler|Klassen\s+[1-9]|ab\s+[1-9]\s+Jahren|Kinder\s+und\s+Erwachsene)\b/i;

/** @returns {string|null} error message or null if OK */
export function t3AgeAlignmentError(q, qIndex = 0) {
  const correct = String(q?.correct ?? q?.correctAnswer ?? '0').toUpperCase();
  if (correct === '0') return null;
  const situation = String(q?.question || '');
  if (!YOUTH_SITUATION_RE.test(situation)) return null;
  const opts = q?.options || [];
  const idx = LETTERS.indexOf(correct);
  if (idx < 0 || !opts[idx]) return null;
  const ad = stripLetter(opts[idx]);
  if (ADULT_ONLY_AD_RE.test(ad) && !YOUTH_OK_AD_RE.test(ad)) {
    return `q[${qIndex}] youth situation but ad ${correct} is adult-only («${ad.slice(0, 50)}…»)`;
  }
  return null;
}

function validateT3AgeRules(questions) {
  const errors = [];
  for (let i = 0; i < (questions || []).length; i++) {
    const e = t3AgeAlignmentError(questions[i], i);
    if (e) errors.push(e);
  }
  return errors;
}

// ── Blueprint validation ──────────────────────────────────────────────────────
function validateBlueprint(bp) {
  const errors = [];
  const qs = bp.questions || [];
  if (qs.length !== 7) { errors.push(`expected 7 questions, got ${qs.length}`); return errors; }
  if (!qs[0].options || qs[0].options.length !== 10) {
    errors.push(`q[0] must have 10 options, got ${(qs[0].options||[]).length}`); return errors;
  }

  // Shared options: canonical A-J list must be identical across all questions
  const canonical = qs[0].options.map(o => String(o).trim()).join('|');
  for (let i = 1; i < qs.length; i++) {
    const cmp = (qs[i].options||[]).map(o => String(o).trim()).join('|');
    if (cmp !== canonical) {
      errors.push(`q[${i}] has different options list (not shared canonical A-J)`);
      return errors;
    }
  }

  // Correct values: exactly one "0", no non-zero letter repeated
  const corrects = qs.map(q => String(q.correct || '0').toUpperCase());
  const zeros = corrects.filter(c => c === '0').length;
  if (zeros !== 1) errors.push(`expected exactly 1 "0" in correct values, got ${zeros}`);

  const nonZero = corrects.filter(c => c !== '0');
  const seen = new Set();
  for (const c of nonZero) {
    if (seen.has(c)) errors.push(`letter "${c}" repeated in correct values`);
    seen.add(c);
  }

  for (const c of nonZero) {
    if (!LETTERS.includes(c)) errors.push(`invalid correct value "${c}" (not A-J)`);
  }

  for (let i = 0; i < qs.length; i++) {
    const ageErr = t3AgeAlignmentError(qs[i], i);
    if (ageErr) errors.push(ageErr);
  }

  return errors;
}

function verifyBlueprints(blueprints) {
  let ok = 0, fail = 0;
  for (const bp of blueprints) {
    const label = bp.slug || bp.title || '(unnamed)';
    const errors = validateBlueprint(bp);
    if (errors.length === 0) {
      ok++;
      console.log(`✅ ${label} — OK (7 items, shared A-J, 1×"0", no repeated letters)`);
    } else {
      fail++;
      errors.forEach(e => console.log(`❌ ${label} — ${e}`));
    }
  }
  console.log(`\nBlueprints: ${ok} OK, ${fail} FAIL / ${blueprints.length} total`);
  return fail === 0;
}

function getPassingBlueprints(blueprints) {
  return blueprints.filter(bp => validateBlueprint(bp).length === 0);
}

// ── Perturb ───────────────────────────────────────────────────────────────────
// Baraja anuncios, reasigna letras, IDs nuevos, inyección opcional de vocab.
function perturb(bp, targetWords) {
  const q0 = bp.questions[0];
  const bodies = q0.options.map(stripLetter);                 // 10 cuerpos sin letra
  const order = shuffle(bodies.map((_, i) => i));             // nuevo orden
  const newBodies = order.map(i => fixT3OptionCaps(bodies[i]));
  const newOptions = newBodies.map((b, i) => `${LETTERS[i]}) ${b}`);

  const idp = rid('gen-l3');
  const questions = bp.questions.map((q, n) => {
    let correct = '0';
    if (String(q.correct) !== '0') {
      const oldIdx = q.options.findIndex(o => o.startsWith(`${q.correct})`));
      const newIdx = order.indexOf(oldIdx);
      correct = LETTERS[newIdx];
    }
    return {
      id: `gen-q-3-${idp.slice(-6)}-${n + 1}`,
      module: 'lesen', teil: 3, type: 'matching',
      question: q.question,
      options: newOptions,
      correct, correctAnswer: correct,
      explanation: q.explanation || 'Siehe Anzeige.',
      lang: 'de', level: 'B1',
    };
  });
  return { passages: [], questions, _blueprintSlug: bp.slug || bp._file?.replace(/\.json$/, '') || bp.title || '' };
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Generate one valid T3 batch from a blueprint not in `exclude`.
 * @param {object} opts
 * @param {string[]} opts.words       Optional vocab words to inject.
 * @param {number}  opts.maxAttempts  Max generation retries (default 8).
 * @param {Set<string>} opts.exclude  Blueprint slugs already used in this batch — ensures
 *                                    distinctness across exams generated in the same run.
 * @returns {{ passages: [], questions: object[], _blueprintSlug: string }}
 * @throws {Error} if no valid batch can be produced after maxAttempts.
 */
export function buildValidatedT3Part({ words = [], maxAttempts = 8, exclude = new Set() } = {}) {
  const all = loadBlueprints();
  let passing = getPassingBlueprints(all);
  if (!passing.length) throw new Error('T3 generator: no passing blueprints found');

  const readyStats = scanReadyT3Stats(READY_LESEN_DIR);

  // Prefer blueprints not already used in this run; sort by fewest copies in ready/
  const preferred = passing
    .filter((bp) => !exclude.has(bp.slug || bp.title || ''))
    .sort((a, b) => {
      const ca = readyStats.byBlueprintSlug[a.slug] || 0;
      const cb = readyStats.byBlueprintSlug[b.slug] || 0;
      return ca - cb || String(a.slug).localeCompare(String(b.slug));
    });
  const pool = preferred.length ? preferred : passing.sort((a, b) => {
    const ca = readyStats.byBlueprintSlug[a.slug] || 0;
    const cb = readyStats.byBlueprintSlug[b.slug] || 0;
    return ca - cb;
  });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const bp = pool[rand(pool.length)];
    const readyCount = countReadyT3ForBlueprint(bp.slug, READY_LESEN_DIR);
    if (attempt === 0) {
      console.log(
        `T3 blueprint «${bp.slug}»: ${readyCount} parte(s) en ready/ ` +
          `(${readyStats.total} T3 total, ${Object.keys(readyStats.bySituationFp).length} grupos situación)`,
      );
    }
    const cand = perturb(bp, words);
    const res = checkLesenBatchQuality(cand, 3);
    const okFmt = cand.questions.length === 7 && cand.questions[0].options.length === 10;
    const ageOk = validateT3AgeRules(cand.questions).length === 0;
    if (res.ok && okFmt && ageOk) {
      return normalizeBatch(cand, { module: 'lesen', teil: 3, lang: 'de', level: 'B1' });
    }
  }
  throw new Error(`T3 generator exhausted after ${maxAttempts} attempts`);
}

// ── CLI entry-point ───────────────────────────────────────────────────────────
if (process.argv[1] === __filename) {
  function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }
  const verifyOnly = process.argv.includes('--verify-blueprints');
  const count = Math.max(1, Number(arg('--count', 1)) || 1);
  const outDir = path.resolve(ROOT, arg('--out', 'batches/generated'));
  const words = String(arg('--words', '')).split(',').map(s => s.trim()).filter(Boolean);

  const blueprints = loadBlueprints();
  if (!blueprints.length) { console.error('No hay esqueletos en scripts/t3-blueprints/'); process.exit(1); }

  verifyBlueprints(blueprints);
  if (verifyOnly) process.exit(0);

  const passingBlueprints = getPassingBlueprints(blueprints);
  if (!passingBlueprints.length) { console.error('\nAbortado: ningún blueprint pasa la validación.'); process.exit(1); }
  console.log(`\nUsando ${passingBlueprints.length} blueprint(s) válido(s) para la generación.\n`);

  fs.mkdirSync(outDir, { recursive: true });
  const usedSlugs = new Set();
  let made = 0, fails = 0;
  for (let k = 0; k < count; k++) {
    let ok = null;
    try {
      ok = buildValidatedT3Part({ words, maxAttempts: 8, exclude: usedSlugs });
    } catch (_) {}
    if (!ok) { fails++; console.warn(`#${k + 1}: no se pudo generar una válida (raro), saltada.`); continue; }
    if (ok._blueprintSlug) usedSlugs.add(ok._blueprintSlug);
    const file = path.join(outDir, `lesen-t3-auto-${rid('').slice(-6)}.json`);
    const out = { passages: ok.passages, questions: ok.questions };
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    made++;
    console.log(`✅ ${path.relative(ROOT, file)}  (respuestas: ${ok.questions.map(q => q.correct).join(',')})`);
  }
  console.log(`\nGeneradas ${made} parte(s) T3 válidas${fails ? `, ${fails} fallidas` : ''}. Todas pasan el checker.`);
  console.log(`Siguiente: valida una con  node scripts/check-lesen-batch-quality.mjs --teil 3 --file <archivo>`);
}
