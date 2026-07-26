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
 *   node scripts/make-t3.mjs --count 1 --skip-pool-ready   # deja el JSON en --out sin triage
 *
 * Tras cada parte válida, corre finalizePoolReady (→ pool-verified / pool-content-ok-lesen /
 * needs-regeneration) salvo --skip-pool-ready o --out fuera de batches/generated.
 *
 * API (importable):
 *   import { buildValidatedT3Part } from './make-t3.mjs';
 *   const batch = buildValidatedT3Part({ exclude: usedSlugsSet });
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';
import { appendG2FindingsLog } from './lib/g2FindingsLog.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { countReadyT3ForBlueprint, scanReadyT3Stats } from './lib/t3GroupFingerprint.mjs';
import {
  READY_LESEN_DIR,
  generatedDir,
  normalizeLevel,
  GENERATED_DIR,
  ensureLevelStagingDirs,
} from './lib/batchPaths.mjs';
import { finalizePoolReady } from './lib/finalizePoolReady.mjs';
import {
  pickLesenT3SeekerName,
  replaceLesenT3SeekerName,
} from './lib/lesenT3NamesBank.mjs';
import {
  detectTopicFromT3Situations,
  filterBlueprintsForTopic,
  isLesenT3TopicCompatible,
  isBlueprintPreferredForTopic,
  TOPIC_BLUEPRINT_PREFERENCE,
} from './lib/lesenT3TopicFilter.mjs';
import { normalizeB1Topic } from './lib/b1Topics.mjs';
import { checkT3PoolDedup } from './lib/t3PoolDedupGate.mjs';
import {
  T3BlueprintExhaustedError,
  listT3BlueprintStockForTopic,
  loadPassingT3Blueprints,
  validateT3Blueprint,
} from './lib/lesenT3BlueprintStock.mjs';

export { listT3BlueprintStockForTopic, T3BlueprintExhaustedError } from './lib/lesenT3BlueprintStock.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const LETTERS = ['A','B','C','D','E','F','G','H','I','J'];
const BLUEPRINT_DIR = path.join(ROOT, 'scripts', 't3-blueprints');

const rand = (n) => Math.floor(Math.random() * n);
function shuffle(a){ const x=[...a]; for(let i=x.length-1;i>0;i--){const j=rand(i+1);[x[i],x[j]]=[x[j],x[i]];} return x; }
function rid(p){ return `${p}-${Math.random().toString(36).slice(2,8)}`; }

function loadBlueprints() {
  return loadPassingT3Blueprints().map((bp) => ({ ...bp }));
}

function stripLetter(opt){ return String(opt).replace(/^[A-J]\)\s*/, ''); }

/** CHK-14b: ordinales en compuestos «Zwei- und …» (idiomas tras «in» no se tocan). */
export function fixT3OptionCaps(text) {
  let s = String(text || '');
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
  const errors = validateT3Blueprint(bp);
  const qs = bp.questions || [];
  const corrects = qs.map((q) => String(q.correct || '0').toUpperCase());
  const nonZero = corrects.filter((c) => c !== '0');
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
  const seekerName = pickLesenT3SeekerName(rand(1000));
  const questions = bp.questions.map((q, n) => {
    let correct = '0';
    if (String(q.correct) !== '0') {
      const oldIdx = q.options.findIndex(o => o.startsWith(`${q.correct})`));
      const newIdx = order.indexOf(oldIdx);
      correct = LETTERS[newIdx];
    }
    let question = q.question;
    // q7 (correct:"0"): rotate seeker + possessives. Legacy Ott elsewhere.
    if (String(q.correct) === '0') {
      question = replaceLesenT3SeekerName(question, seekerName, { replaceAnySeeker: true });
    } else if (/\b(Herr|Frau)\s+Ott\b/.test(String(question))) {
      question = replaceLesenT3SeekerName(question, seekerName);
    }
    return {
      id: `gen-q-3-${idp.slice(-6)}-${n + 1}`,
      module: 'lesen', teil: 3, type: 'matching',
      question,
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
export function buildValidatedT3Part({
  words = [],
  maxAttempts = 8,
  exclude = new Set(),
  requestedTopic = null,
} = {}) {
  const all = loadBlueprints();
  let passing = getPassingBlueprints(all);
  if (!passing.length) throw new Error('T3 generator: no passing blueprints found');

  const stock = listT3BlueprintStockForTopic(requestedTopic, exclude);
  if (requestedTopic && stock.compatibleTotal === 0) {
    throw new T3BlueprintExhaustedError(requestedTopic, { exclude, stock });
  }

  const readyStats = scanReadyT3Stats(READY_LESEN_DIR);

  // Prefer blueprints not already used in this run; sort by fewest copies in ready/
  const pool = passing
    .filter((bp) => stock.availableSlugs.includes(bp.slug || bp.title || ''))
    .sort((a, b) => {
      const ca = readyStats.byBlueprintSlug[a.slug] || 0;
      const cb = readyStats.byBlueprintSlug[b.slug] || 0;
      if (ca !== cb) return ca - cb;
      if (requestedTopic) {
        const pref = TOPIC_BLUEPRINT_PREFERENCE[normalizeB1Topic(requestedTopic)] || [];
        const ia = pref.indexOf(a.slug);
        const ib = pref.indexOf(b.slug);
        const ra = ia === -1 ? 999 : ia;
        const rb = ib === -1 ? 999 : ib;
        if (ra !== rb) return ra - rb;
      }
      return String(a.slug).localeCompare(String(b.slug));
    });

  if (!pool.length) {
    throw new T3BlueprintExhaustedError(requestedTopic || 'any', { exclude, stock });
  }

  const SLUG_STRIKE_LIMIT = 2;
  const slugFailCounts = new Map();
  let lastSlug = null;

  function passesTopicGate(questions, slug) {
    if (!requestedTopic) return true;
    if (isBlueprintPreferredForTopic(requestedTopic, slug)) return true;
    const detected = detectTopicFromT3Situations(questions);
    return isLesenT3TopicCompatible(requestedTopic, detected);
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const activePool = pool.filter((bp) => {
      const slug = bp.slug || bp.title || '';
      return (slugFailCounts.get(slug) || 0) < SLUG_STRIKE_LIMIT;
    });
    if (!activePool.length) break;

    const bp = activePool[attempt % activePool.length];
    const slug = bp.slug || bp.title || '';
    lastSlug = slug;
    const readyCount = countReadyT3ForBlueprint(bp.slug, READY_LESEN_DIR);
    if (attempt === 0) {
      const sitTopic = detectTopicFromT3Situations(bp.questions) || '(sin señal)';
      console.log(
        `T3 blueprint «${bp.slug}»${requestedTopic ? ` · tema pedido «${requestedTopic}» · situaciones≈${sitTopic}` : ''}: ` +
          `${readyCount} parte(s) en ready/ ` +
          `(${readyStats.total} T3 total, ${Object.keys(readyStats.bySituationFp).length} grupos situación)`,
      );
    } else if (activePool.length > 1) {
      console.log(`  T3 reintento ${attempt + 1}/${maxAttempts} · blueprint «${slug}»`);
    }
    const cand = perturb(bp, words);
    const res = checkLesenBatchQuality(cand, 3, { skipG2Log: true });
    const okFmt = cand.questions.length === 7 && cand.questions[0].options.length === 10;
    const ageOk = validateT3AgeRules(cand.questions).length === 0;
    const topicOk = passesTopicGate(cand.questions, slug);
    const poolDedup = checkT3PoolDedup({ ...cand, _blueprintSlug: slug }, { reload: true });
    if (res.ok && okFmt && ageOk && topicOk && poolDedup.ok) {
      const out = normalizeBatch(cand, { module: 'lesen', teil: 3, lang: 'de', level: 'B1' });
      out._blueprintSlug = slug;
      return out;
    }
    if (res.ok && okFmt && ageOk && topicOk && !poolDedup.ok) {
      slugFailCounts.set(slug, (slugFailCounts.get(slug) || 0) + 1);
      const detail = poolDedup.details?.[0]?.detail || poolDedup.reasons?.[0];
      console.log(`  T3 blueprint «${slug}» — pool dedup REJECT: ${detail}`);
      continue;
    }
    slugFailCounts.set(slug, (slugFailCounts.get(slug) || 0) + 1);
    if (!topicOk && requestedTopic) {
      const detected = detectTopicFromT3Situations(cand.questions) || '(sin señal)';
      console.log(
        `  T3 blueprint «${slug}» — tema CHK-26: situaciones≈${detected} ≠ «${requestedTopic}»` +
          ` (fallo ${slugFailCounts.get(slug)}/${SLUG_STRIKE_LIMIT})`,
      );
    } else if (!res.ok || !okFmt || !ageOk) {
      const bits = [];
      if (!okFmt) bits.push('formato');
      if (!ageOk) bits.push(`edad:${validateT3AgeRules(cand.questions).join('; ')}`);
      if (!res.ok) bits.push(`calidad:${(res.issues || []).slice(0, 2).join(' | ')}`);
      console.log(
        `  T3 blueprint «${slug}» — fallo ${slugFailCounts.get(slug)}/${SLUG_STRIKE_LIMIT}: ${bits.join(' · ') || 'unknown'}`,
      );
    }
    if (slugFailCounts.get(slug) >= SLUG_STRIKE_LIMIT && activePool.length > 1) {
      console.log(`  T3 blueprint «${slug}» — ${SLUG_STRIKE_LIMIT} fallos, rotando a otro esqueleto`);
    }
  }
  const postStock = listT3BlueprintStockForTopic(requestedTopic, exclude);
  if (requestedTopic && postStock.availableTotal === 0) {
    throw new T3BlueprintExhaustedError(requestedTopic, { exclude, stock: postStock });
  }
  const err = new Error(`T3 generator exhausted after ${maxAttempts} attempts`);
  err.failedSlugs = [...slugFailCounts.keys()];
  err.lastSlug = lastSlug;
  err.code = 'T3_GENERATION_EXHAUSTED';
  throw err;
}

// ── CLI entry-point ───────────────────────────────────────────────────────────
if (process.argv[1] === __filename) {
  async function main() {
    function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }
    const verifyOnly = process.argv.includes('--verify-blueprints');
    const skipPoolReady = process.argv.includes('--skip-pool-ready');
    const level = normalizeLevel(arg('--level', 'B1'));
    ensureLevelStagingDirs(level);
    const count = Math.max(1, Number(arg('--count', 1)) || 1);
    const defaultOut = generatedDir(level);
    const outDir = path.resolve(ROOT, arg('--out', path.relative(ROOT, defaultOut).replace(/\\/g, '/')));
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
    const generatedAbs = path.resolve(GENERATED_DIR);
    const outIsGenerated = path.resolve(outDir).startsWith(generatedAbs);

    for (let k = 0; k < count; k++) {
      let ok = null;
      try {
        ok = buildValidatedT3Part({ words, maxAttempts: 8, exclude: usedSlugs });
      } catch (_) {}
      if (!ok) { fails++; console.warn(`#${k + 1}: no se pudo generar una válida (raro), saltada.`); continue; }
      if (ok._blueprintSlug) usedSlugs.add(ok._blueprintSlug);
      const file = path.join(outDir, `lesen-t3-auto-${rid('').slice(-6)}.json`);
      const out = normalizeBatch(
        { passages: ok.passages, questions: ok.questions, module: 'lesen', teil: 3 },
        { module: 'lesen', teil: 3, lang: 'de', level },
      );
      fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
      appendG2FindingsLog(out, { file: path.relative(ROOT, file).replace(/\\/g, '/'), teil: 3 });
      made++;
      console.log(`✅ ${path.relative(ROOT, file)}  (respuestas: ${ok.questions.map(q => q.correct).join(',')})`);

      if (!skipPoolReady && outIsGenerated) {
        try {
          const promo = await finalizePoolReady(file, out, {
            sourcePath: path.relative(ROOT, file).replace(/\\/g, '/'),
            level,
          });
          console.log(`  [poolReady] ${promo.verdict} → ${promo.poolPath ? path.relative(ROOT, promo.poolPath) : '(n/a)'}`);
        } catch (err) {
          console.warn(`  [poolReady] aviso: ${err.message}`);
        }
      }
    }
    console.log(`\nGeneradas ${made} parte(s) T3 válidas${fails ? `, ${fails} fallidas` : ''}. Todas pasan el checker.`);
    if (skipPoolReady || !outIsGenerated) {
      console.log(`Siguiente: valida una con  node scripts/check-lesen-batch-quality.mjs --teil 3 --file <archivo>`);
    } else {
      console.log('Pool triage aplicado (finalizePoolReady).');
    }
  }
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
