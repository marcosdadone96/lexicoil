#!/usr/bin/env node
/**
 * Validates frozen demo content v3: 54 variants + 9 base files for realistic demo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_DIR = path.join(ROOT, 'data', 'demo');
const MANIFEST = path.join(DEMO_DIR, 'manifest.json');
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const BASE_LEVELS = ['B1', 'B2', 'C1'];
const LANGS = ['de', 'en', 'es'];
const FORMATS = new Set(['multiple_choice', 'true_false']);
const MODULE_IDS = {
  de: ['lesen', 'horen', 'schreiben', 'sprechen'],
  en: ['reading', 'listening', 'writing', 'speaking'],
  es: ['reading', 'listening', 'writing', 'speaking'],
};
const INTERACTIVE_IDS = {
  de: ['lesen', 'horen'],
  en: ['reading', 'listening'],
  es: ['reading', 'listening'],
};
const READING_IDS = { de: 'lesen', en: 'reading', es: 'reading' };
const BROKEN_UTF = /\uFFFD/;
const LEGACY_KEYS = ['reading', 'listening', 'writing', 'speaking'];

function fail(msg) {
  console.error('FAIL:', msg);
  process.exitCode = 1;
}

function validateFormatField(fmt, ctx) {
  if (fmt == null) return;
  if (!FORMATS.has(fmt)) fail(`${ctx}: format must be multiple_choice or true_false`);
}

function validateOptions(opts, ctx) {
  if (!Array.isArray(opts) || opts.length < 2) {
    fail(`${ctx}: needs at least 2 options`);
    return;
  }
  const correct = opts.filter((o) => o.correct);
  if (correct.length !== 1) fail(`${ctx}: must have exactly one correct option`);
  for (const o of opts) {
    if (!o.key || o.text == null || o.text === '') fail(`${ctx}: option missing key/text`);
  }
}

function validateMarkableWords(words, text, ctx, { min = 0, exact = null } = {}) {
  if (!Array.isArray(words)) {
    fail(`${ctx}: markableWords must be an array`);
    return;
  }
  if (exact != null && words.length !== exact) {
    fail(`${ctx}: expected exactly ${exact} markableWords, got ${words.length}`);
  }
  if (words.length < min) fail(`${ctx}: needs at least ${min} markableWords`);
  for (const w of words) {
    if (!w.word) fail(`${ctx}: markable word missing word`);
    if (!text || !text.includes(w.word)) fail(`${ctx}: markable "${w.word}" must appear in passage/transcript`);
    if (!w.translations || typeof w.translations !== 'object') fail(`${ctx}: markable "${w.word}" needs translations`);
  }
}

function validateItem(item, part, ctx) {
  if (!item.id) fail(`${ctx}: item missing id`);
  if (!item.question) fail(`${ctx}: item missing question`);
  validateFormatField(item.format, `${ctx}: item.format`);
  validateOptions(item.options, ctx);
  const fmt = item.format || part.format || (part.type === 'true_false' ? 'true_false' : 'multiple_choice');
  if (fmt === 'true_false' && item.options.length !== 2) {
    fail(`${ctx}: true_false item needs exactly 2 options`);
  }
  if (fmt === 'multiple_choice' && item.options.length < 3) {
    fail(`${ctx}: multiple_choice item needs at least 3 options`);
  }
}

function validatePart(part, moduleId, examId, { strictReading = false } = {}) {
  const ctx = `${examId} · ${moduleId} · ${part.label || part.type}`;
  if (!part.type) fail(`${ctx}: part missing type`);
  validateFormatField(part.format, `${ctx}: part.format`);

  const writingTypes = ['writing_task', 'opinion_email', 'essay', 'form', 'short_text', 'email'];
  const speakingTypes = ['speaking_task', 'presentation', 'monologue', 'dialogue'];

  if (writingTypes.includes(part.type) || speakingTypes.includes(part.type)) {
    if (!part.task) fail(`${ctx}: task required`);
    return;
  }

  const text = part.passage || part.transcript;
  if (!text) fail(`${ctx}: passage or transcript required`);
  if (part.passage && part.transcript) fail(`${ctx}: part cannot have both passage and transcript`);

  const markOpts = strictReading ? { exact: 3 } : {};
  validateMarkableWords(part.markableWords || [], text, ctx, markOpts);

  if (!Array.isArray(part.items) || !part.items.length) fail(`${ctx}: at least one item required`);
  for (const item of part.items) validateItem(item, part, `${ctx} · ${item.id || '?'}`);

  if (strictReading) {
    if (text.length < 120) fail(`${ctx}: passage should be at least ~120 characters for realistic demo`);
    const mc = part.items.filter(
      (it) => (it.format || part.format || (part.type === 'true_false' ? 'true_false' : 'multiple_choice')) === 'multiple_choice',
    );
    const tf = part.items.filter((it) => (it.format || 'multiple_choice') === 'true_false');
    if (mc.length < 2) fail(`${ctx}: reading part needs at least 2 multiple_choice items`);
    if (tf.length < 1) fail(`${ctx}: reading part needs at least 1 true_false item (item.format)`);
  }
}

function validateModule(mod, lang, examId, opts = {}) {
  const ctx = `${examId} · module ${mod.id}`;
  if (!mod.id || !mod.title) fail(`${ctx}: missing id/title`);
  if (typeof mod.interactive !== 'boolean') fail(`${ctx}: interactive flag required`);
  if (!Array.isArray(mod.parts) || !mod.parts.length) fail(`${ctx}: parts required`);

  const shouldBeInteractive = INTERACTIVE_IDS[lang].includes(mod.id);
  if (mod.interactive !== shouldBeInteractive) {
    fail(`${ctx}: interactive should be ${shouldBeInteractive}`);
  }

  mod.parts.forEach((part, idx) => {
    const strict = opts.strictReadingPart && idx === 0 && mod.id === READING_IDS[lang];
    validatePart(part, mod.id, examId, { strictReading: strict });
  });
}

function validateLoop(exam) {
  const ctx = `${exam.id} · loop`;
  if (!exam.loop?.passage || !exam.loop.question) fail(`${ctx}: passage and question required`);
  if (!exam.loop.passage.includes(exam.hookWord.word)) {
    fail(`${ctx}: hook word must appear in loop.passage`);
  }
  validateOptions(exam.loop.options, ctx);
}

function validateMini(exam) {
  const ctx = `${exam.id} · miniPractice`;
  const m = exam.miniPractice;
  if (!m?.answer || m.answer !== exam.hookWord.word) fail(`${ctx}: answer must match hookWord`);
  if (!m.label) fail(`${ctx}: label required`);
}

function validateHook(exam) {
  const h = exam.hookWord;
  if (!h?.word || !h.translations) fail(`${exam.id}: hookWord incomplete`);
}

function loadExam(id) {
  const file = path.join(DEMO_DIR, `${id}.json`);
  if (!fs.existsSync(file)) {
    fail(`missing file ${id}.json`);
    return null;
  }
  const raw = fs.readFileSync(file, 'utf8');
  if (BROKEN_UTF.test(raw)) fail(`${id}: broken UTF-8 characters`);
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`${id}: invalid JSON — ${e.message}`);
    return null;
  }
}

function validateVariantExam(exam, id) {
  if (exam.id !== id) fail(`${id}: id mismatch`);
  const m = id.match(/^(de|en|es)_(A1|A2|B1|B2|C1|C2)_v([123])$/);
  if (!m) fail(`${id}: invalid id format`);
  const [, lang, level, variant] = m;
  if (exam.lang !== lang || exam.level !== level) fail(`${id}: lang/level mismatch`);
  if (exam.variant !== Number(variant)) fail(`${id}: variant field mismatch`);
  if (LEGACY_KEYS.some((k) => exam[k] && !exam.modules)) {
    fail(`${id}: legacy flat schema`);
  }
  if (!Array.isArray(exam.modules) || exam.modules.length !== 4) {
    fail(`${id}: must have exactly 4 modules`);
  }
  const ids = exam.modules.map((mod) => mod.id);
  for (const mid of MODULE_IDS[lang]) {
    if (!ids.includes(mid)) fail(`${id}: missing module ${mid}`);
  }
  if (typeof exam.passPercent !== 'number') fail(`${id}: passPercent required`);
  validateHook(exam);
  validateLoop(exam);
  validateMini(exam);
  for (const mod of exam.modules) validateModule(mod, lang, id);
}

function validateBaseExam(exam, id) {
  if (exam.id !== id) fail(`${id}: id mismatch`);
  const m = id.match(/^(de|en|es)_(B1|B2|C1)$/);
  if (!m) fail(`${id}: invalid base id format`);
  const [, lang, level] = m;
  if (exam.lang !== lang || exam.level !== level) fail(`${id}: lang/level mismatch`);
  if (exam.loop || exam.hookWord || exam.miniPractice) {
    fail(`${id}: base file must not include loop/hookWord/miniPractice`);
  }
  if (!Array.isArray(exam.modules) || exam.modules.length !== 4) {
    fail(`${id}: must have exactly 4 modules`);
  }
  const ids = exam.modules.map((mod) => mod.id);
  for (const mid of MODULE_IDS[lang]) {
    if (!ids.includes(mid)) fail(`${id}: missing module ${mid}`);
  }
  if (typeof exam.passPercent !== 'number') fail(`${id}: passPercent required`);
  for (const mod of exam.modules) {
    validateModule(mod, lang, id, { strictReadingPart: true });
  }
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const expected = new Set(
  LANGS.flatMap((lang) => LEVELS.flatMap((level) => [1, 2, 3].map((v) => `${lang}_${level}_v${v}`))),
);
const baseExpected = LANGS.flatMap((lang) => BASE_LEVELS.map((level) => `${lang}_${level}`));

if (manifest.exams.length !== 54) fail(`manifest must list 54 exams, got ${manifest.exams.length}`);
if (manifest.version !== 3) fail('manifest.version must be 3');

for (const id of expected) {
  if (!manifest.exams.includes(id)) fail(`manifest missing ${id}`);
}

let okVariants = 0;
for (const id of manifest.exams) {
  const exam = loadExam(id);
  if (!exam) continue;
  validateVariantExam(exam, id);
  okVariants++;
}

let okBase = 0;
for (const id of baseExpected) {
  const exam = loadExam(id);
  if (!exam) continue;
  validateBaseExam(exam, id);
  okBase++;
}

if (process.exitCode) {
  console.error(`\nValidated ${okVariants}/54 variants, ${okBase}/9 base files — errors found.`);
  process.exit(1);
}
console.log(`OK: ${okVariants}/54 demo variants + ${okBase}/9 base files validated (v3).`);
