#!/usr/bin/env node
/**
 * Pre-warm exam pool from question banks (offline, no AI).
 * Writes library/pool-seed/{lang}_{level}.json — run before deploy: npm run seed:pool
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
globalThis.ExamBlueprint = ExamBlueprint;
require(path.join(ROOT, 'js/library/LibraryLoader.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
globalThis.ExamValidator = ExamValidator;
const { synthesize, isProviderConfigured } = require(path.join(ROOT, 'netlify/functions/lib/ttsProvider.js'));

const TARGETS = [
  ['de', 'B1'],
  ['de', 'B2'],
  ['en', 'B2'],
  ['en', 'C1'],
  ['es', 'B2'],
  ['es', 'C1'],
];

const TARGET_COUNT = 15;
const MAX_ATTEMPTS = 300;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeededRandom(seed, fn) {
  const rng = mulberry32(seed);
  const orig = Math.random;
  Math.random = rng;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

function loadBank(lang, level) {
  const file = path.join(ROOT, 'library', lang, level, 'questions.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadBlueprint(lang, level) {
  const id = ExamBlueprint.INDEX[`${lang}_${level}`];
  if (!id) throw new Error(`No blueprint index for ${lang}_${level}`);
  const file = path.join(ROOT, 'library', 'blueprints', `${id}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function examSignature(selected) {
  const ids = selected.map((q) => q.id).sort();
  return crypto.createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 12);
}

function stableId(lang, level, signature) {
  return `seed_${lang}_${level}_${signature}`;
}

function ttsTextHash(text) {
  return crypto.createHash('sha256').update(String(text || '').trim().toLowerCase()).digest('hex').slice(0, 16);
}

async function attachTtsRefs(exam) {
  if (!isProviderConfigured()) return exam;
  const ListeningScript = require(path.join(ROOT, 'js/bootstrap/listeningScript.js'));
  const { resolveVoiceId, defaultVoiceForLang } = require(path.join(ROOT, 'netlify/functions/lib/ttsVoices.js'));
  const cacheDirPath = path.join(ROOT, 'library', 'tts-cache');
  fs.mkdirSync(cacheDirPath, { recursive: true });
  const seen = new Set();

  async function ensureAudio(text, voice) {
    const hash = ttsTextHash(text);
    const resolved = resolveVoiceId(voice, exam.lang);
    const key = `${resolved}:${hash}`;
    if (seen.has(key)) return { hash, voice: resolved };
    seen.add(key);
    const file = path.join(cacheDirPath, `${resolved}_${hash}.mp3`);
    if (!fs.existsSync(file)) {
      const audio = await synthesize(text, resolved, exam.lang);
      if (audio?.length) fs.writeFileSync(file, audio);
    }
    return fs.existsSync(file) ? { hash, voice: resolved } : null;
  }

  for (const part of exam.horenParts || []) {
    const transcript = part.transcript || '';
    if (transcript && ListeningScript.isMultiVoice(transcript)) {
      const segments = ListeningScript.prepare(transcript, exam.lang);
      part.segments = (part.segments || segments).map((seg, i) => {
        const src = segments[i] || seg;
        return { ...seg, transcript: seg.transcript || src.text, voice: src.voice };
      });
      for (const seg of part.segments) {
        if (!seg.transcript) continue;
        const ref = await ensureAudio(seg.transcript, seg.voice || defaultVoiceForLang(exam.lang));
        if (ref) {
          seg.ttsVoice = ref.voice;
          seg.ttsHash = ref.hash;
        }
      }
    } else if (transcript) {
      const ref = await ensureAudio(transcript, part.ttsVoice || defaultVoiceForLang(exam.lang));
      if (ref) {
        part.ttsVoice = ref.voice;
        part.ttsHash = ref.hash;
      }
    }
    for (const seg of part.segments || []) {
      if (!seg.transcript || seg.ttsHash) continue;
      const ref = await ensureAudio(seg.transcript, seg.ttsVoice || defaultVoiceForLang(exam.lang));
      if (ref) {
        seg.ttsVoice = ref.voice;
        seg.ttsHash = ref.hash;
      }
    }
  }
  return exam;
}

const validator = new ExamValidator();
const CEFR_GATE = process.env.CEFR_GATE === '1';

async function warmLevel(lang, level) {
  const bank = loadBank(lang, level);
  const blueprint = loadBlueprint(lang, level);
  ExamBlueprint.cacheBlueprint(lang, level, blueprint);

  const seen = new Set();
  const seeds = [];
  let attempts = 0;

  while (seeds.length < TARGET_COUNT && attempts < MAX_ATTEMPTS) {
    attempts++;
    const seedNum = attempts * 9973 + lang.charCodeAt(0) * 100 + level.charCodeAt(0);

    const result = withSeededRandom(seedNum, () => {
      const assembled = ExamBlueprint.assemble(bank, blueprint);
      const exam = ExamBuilder.buildFromBlueprint(lang, level, bank, blueprint, {
        mode: 'standard',
        assembled,
      });
      return { assembled, exam };
    });

    const sig = examSignature(result.assembled.selected);
    if (seen.has(sig)) continue;

    const validation = validator.validate(result.exam, {
      cefrGate: CEFR_GATE,
      curation: CEFR_GATE,
      strict: CEFR_GATE,
    });
    if (!validation.valid) continue;

    seen.add(sig);
    const exam = await attachTtsRefs(result.exam);
    seeds.push({
      id: stableId(lang, level, sig),
      topic: exam.topic,
      exam,
      contributor: 'seed',
    });
  }

  const outDir = path.join(ROOT, 'library', 'pool-seed');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${lang}_${level}.json`);
  fs.writeFileSync(outFile, JSON.stringify(seeds, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${path.relative(ROOT, outFile)} — ${seeds.length} distinct exams (${attempts} attempts)`);
  return seeds.length;
}

let failed = 0;
for (const [lang, level] of TARGETS) {
  try {
    const n = await warmLevel(lang, level);
    if (n < 1) {
      console.error(`FAIL ${lang}/${level}: no valid seeds`);
      failed++;
    }
  } catch (err) {
    console.error(`FAIL ${lang}/${level}:`, err.message);
    failed++;
  }
}

if (failed) process.exit(1);
console.log('\nPool seed warm complete.');
