/**
 * make-t4.mjs — Generador determinista de Lesen B1 · Teil 4 (forum_opinions, ja_nein).
 * Esqueletos en scripts/t4-blueprints/*.json → perturbación segura → checkLesenBatchQuality(4).
 *
 * Uso CLI:
 *   node scripts/make-t4.mjs --count 5
 *   node scripts/make-t4.mjs --count 3 --words "gebühr,frist,ausleihen"
 *   node scripts/make-t4.mjs --verify-blueprints
 *
 * API (importable):
 *   import { buildValidatedT4Part } from './make-t4.mjs';
 *   const batch = buildValidatedT4Part({ exclude: usedSlugsSet });
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const BLUEPRINT_DIR = path.join(ROOT, 'scripts', 't4-blueprints');

const FIRST_NAMES = [
  'Anna', 'Ben', 'Clara', 'David', 'Elena', 'Felix', 'Greta', 'Hassan', 'Ines', 'Jonas',
  'Klara', 'Lukas', 'Mira', 'Nico', 'Olga', 'Paula', 'Quentin', 'Rosa', 'Stefan', 'Tanja',
  'Uwe', 'Vera', 'Walter', 'Xenia', 'Yusuf', 'Zara', 'Andreas', 'Bianca', 'Carla', 'Daniel',
];

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const rand = (n) => Math.floor(Math.random() * n);
function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
function rid(p) {
  return `${p}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadBlueprints() {
  if (!fs.existsSync(BLUEPRINT_DIR)) return [];
  return fs
    .readdirSync(BLUEPRINT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(BLUEPRINT_DIR, f), 'utf8')));
}

function buildBatchFromBlueprint(bp) {
  const passageId = bp.passageId || `bp-t4-${bp.slug || 'forum'}`;
  return {
    passages: [
      {
        id: passageId,
        module: 'lesen',
        title: bp.title || 'Forum',
        text: bp.forumIntro || '',
        passageVocab: [],
      },
    ],
    questions: (bp.questions || []).map((q) => ({
      ...q,
      module: 'lesen',
      teil: 4,
      type: 'ja_nein',
      options: q.options || [],
      correctAnswer: q.correctAnswer || q.correct,
    })),
  };
}

function replaceAuthorInSignText(signText, oldAuthor, newAuthor) {
  let t = String(signText || '');
  if (oldAuthor && newAuthor && oldAuthor !== newAuthor) {
    t = t.replace(new RegExp(oldAuthor, 'g'), newAuthor);
    t = t.replace(/^Meinung von [^:]+:/, `Meinung von ${newAuthor}:`);
  }
  return t;
}

function injectVocab(signText, targetWords, startIndex) {
  if (!targetWords.length) return signText;
  let t = signText;
  let wi = startIndex;
  if (t.split(/\s+/).length >= 55) return t;
  const w = targetWords[wi % targetWords.length];
  const W = w.charAt(0).toUpperCase() + w.slice(1);
  return `${t} Thema: ${W}.`;
}

function perturb(bp, targetWords) {
  const items = (bp.questions || []).map((q) => ({ ...q }));
  const shuffled = shuffle(items);

  const nameMap = new Map();
  const used = new Set();
  for (const item of shuffled) {
    const oldAuthor = item.author || 'Person';
    if (nameMap.has(oldAuthor)) continue;
    let newName;
    for (let t = 0; t < 20; t++) {
      newName = FIRST_NAMES[rand(FIRST_NAMES.length)];
      if (!used.has(newName)) break;
    }
    used.add(newName);
    nameMap.set(oldAuthor, newName);
  }

  const idp = rid('gen-l4');
  let wi = 0;
  const questions = shuffled.map((q, n) => {
    const oldAuthor = q.author || 'Person';
    const newAuthor = nameMap.get(oldAuthor) || oldAuthor;
    let signText = replaceAuthorInSignText(q.signText, oldAuthor, newAuthor);
    if (targetWords.length) {
      signText = injectVocab(signText, targetWords, wi++);
    }
    return {
      id: `gen-q-4-${idp.slice(-6)}-${n + 1}`,
      module: 'lesen',
      teil: 4,
      type: 'ja_nein',
      question: q.question,
      signText,
      correct: q.correct,
      correctAnswer: q.correctAnswer || q.correct,
      explanation: replaceAuthorInSignText(q.explanation || 'Siehe Meinung.', oldAuthor, newAuthor),
      options: [],
      lang: 'de',
      level: 'B1',
    };
  });

  const passageId = bp.passageId || `bp-t4-${bp.slug || idp}`;
  return {
    passages: [
      {
        id: passageId,
        module: 'lesen',
        title: bp.title || 'Forum',
        text: bp.forumIntro || '',
        passageVocab: [],
      },
    ],
    questions,
  };
}

function hasAntiRun(questions, maxRun = 3) {
  const answers = questions.map((q) => q.correct);
  let run = 1;
  for (let i = 1; i < answers.length; i++) {
    run = answers[i] === answers[i - 1] ? run + 1 : 1;
    if (run > maxRun) return false;
  }
  return true;
}

function isValidBatch(batch) {
  if ((batch.questions || []).length !== 7) return false;
  if (!hasAntiRun(batch.questions)) return false;
  return batch.questions.every(
    (q) =>
      q.type === 'ja_nein' &&
      (q.correct === 'Ja' || q.correct === 'Nein') &&
      String(q.signText || '').trim().length > 20 &&
      String(q.question || '').trim().length > 10 &&
      String(q.explanation || '').trim().split(/\s+/).filter(Boolean).length >= 10,
  );
}

function verifyBlueprints(blueprints) {
  let ok = 0;
  let fail = 0;
  for (const bp of blueprints) {
    const batch = buildBatchFromBlueprint(bp);
    const res = checkLesenBatchQuality(batch, 4);
    const valid = res.ok && isValidBatch(batch);
    const label = bp.slug || bp.title || 'blueprint';
    if (valid) {
      ok++;
      console.log(`✅ ${label} — checker OK (${batch.questions.length} ja_nein)`);
    } else {
      fail++;
      console.log(`❌ ${label} — ${(res.issues || []).join('; ') || 'formato inválido'}`);
    }
  }
  console.log(`\nBlueprints: ${ok} OK, ${fail} FAIL / ${blueprints.length} total`);
  return fail === 0;
}

function getPassingBlueprints(blueprints) {
  return blueprints.filter((bp) => {
    const batch = buildBatchFromBlueprint(bp);
    const res = checkLesenBatchQuality(batch, 4);
    return res.ok && isValidBatch(batch);
  });
}

// ── Coherence check (same criteria as CHK-20 / t4GroupIsCoherent) ─────────────
/**
 * Returns true iff the batch has 7 items with:
 *  - unique authors (extracted from signText prefix)
 *  - all signTexts distinct from each other
 *  - each signText has >= 15 words
 */
export function isCoherentT4Batch(questions) {
  if (!Array.isArray(questions) || questions.length < 7) return false;
  const texts = questions.map(q => String(q.signText || '').trim());
  // All signTexts distinct
  if (new Set(texts).size !== texts.length) return false;
  // Each has >= 15 words
  if (texts.some(t => t.split(/\s+/).filter(Boolean).length < 15)) return false;
  // Unique authors — extract from "Meinung von NAME:" or "Sagt NAME:" or first capitalized word
  const authors = questions.map(q => {
    const t = String(q.signText || '');
    const m = t.match(/^(?:Meinung von|Sagt)\s+([A-ZÄÖÜ][a-zäöüß]+)/);
    return m ? m[1] : (t.match(/^([A-ZÄÖÜ][a-zäöüß]+)/)?.[1] || '');
  });
  return new Set(authors.filter(Boolean)).size === authors.filter(Boolean).length;
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Generate one valid T4 batch from a blueprint not in `exclude`.
 * @param {object} opts
 * @param {string[]} opts.words       Optional vocab words to inject.
 * @param {number}  opts.maxAttempts  Max generation retries (default 8).
 * @param {Set<string>} opts.exclude  Blueprint slugs already used — ensures distinctness.
 * @returns {{ passages: object[], questions: object[], _blueprintSlug: string }}
 * @throws {Error} if no valid batch can be produced after maxAttempts.
 */
export function buildValidatedT4Part({ words = [], maxAttempts = 8, exclude = new Set() } = {}) {
  const all = loadBlueprints();
  let passing = getPassingBlueprints(all);
  if (!passing.length) throw new Error('T4 generator: no passing blueprints found');

  const preferred = passing.filter(bp => !exclude.has(bp.slug || bp.title || ''));
  const pool = preferred.length ? preferred : passing;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const bp = pool[rand(pool.length)];
    const cand = perturb(bp, attempt < Math.floor(maxAttempts / 2) ? words : []);
    const res = checkLesenBatchQuality(cand, 4);
    if (res.ok && isValidBatch(cand) && isCoherentT4Batch(cand.questions)) {
      return { ...cand, _blueprintSlug: bp.slug || bp.title || '' };
    }
  }
  throw new Error(`T4 generator exhausted after ${maxAttempts} attempts`);
}

// ── CLI entry-point ───────────────────────────────────────────────────────────
if (process.argv[1] === __filename) {
  const verifyOnly = process.argv.includes('--verify-blueprints');
  const count = Math.max(1, Number(arg('--count', 1)) || 1);
  const outDir = path.resolve(ROOT, arg('--out', 'batches/generated'));
  const words = String(arg('--words', '')).split(',').map((s) => s.trim()).filter(Boolean);

  const blueprints = loadBlueprints();
  if (!blueprints.length) {
    console.error('No hay esqueletos en scripts/t4-blueprints/');
    process.exit(1);
  }

  if (verifyOnly) {
    process.exit(verifyBlueprints(blueprints) ? 0 : 1);
  }

  verifyBlueprints(blueprints);
  const passingBlueprints = getPassingBlueprints(blueprints);
  if (!passingBlueprints.length) {
    console.error('\nAbortado: ningún blueprint pasa la validación.');
    process.exit(1);
  }
  console.log(`Usando ${passingBlueprints.length} blueprint(s) válido(s) para la generación.\n`);

  fs.mkdirSync(outDir, { recursive: true });
  const usedSlugs = new Set();
  let made = 0;
  let fails = 0;
  for (let k = 0; k < count; k++) {
    let ok = null;
    try {
      ok = buildValidatedT4Part({ words, maxAttempts: 8, exclude: usedSlugs });
    } catch (_) {}
    if (!ok) {
      fails++;
      console.warn(`#${k + 1}: no se pudo generar una T4 válida, saltada.`);
      continue;
    }
    if (ok._blueprintSlug) usedSlugs.add(ok._blueprintSlug);
    const file = path.join(outDir, `lesen-t4-auto-${rid('').slice(-6)}.json`);
    const out = { passages: ok.passages, questions: ok.questions };
    fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    made++;
    console.log(
      `✅ ${path.relative(ROOT, file)}  (${ok.questions.map((q) => q.correct).join(',')})`,
    );
  }
  console.log(`\nGeneradas ${made} parte(s) T4 válidas${fails ? `, ${fails} fallidas` : ''}.`);
  console.log('Siguiente: node scripts/validate-batch.mjs --lang de --level B1 --file <archivo>');
}
