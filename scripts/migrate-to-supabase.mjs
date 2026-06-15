#!/usr/bin/env node
/**
 * Migrate question bank JSON files → Supabase (lc_passages + lc_questions tables).
 *
 * Prerequisites:
 *   1. Run the SQL in supabase/migrations/001_initial_schema.sql in Supabase SQL editor
 *   2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or environment)
 *
 * Usage:
 *   node scripts/migrate-to-supabase.mjs [--lang de] [--level B1] [--dry-run]
 *
 * Without flags, migrates ALL languages and levels in library/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load .env if present
const dotenvPath = path.join(ROOT, '.env');
if (fs.existsSync(dotenvPath)) {
  fs.readFileSync(dotenvPath, 'utf8').split('\n').forEach((line) => {
    const [k, ...rest] = line.split('=');
    if (k && !k.startsWith('#') && rest.length && !process.env[k.trim()]) {
      process.env[k.trim()] = rest.join('=').trim();
    }
  });
}

const { createClient } = require('@supabase/supabase-js');

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name) { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; }
const filterLang  = arg('--lang');
const filterLevel = arg('--level');
const dryRun = args.includes('--dry-run');

// ── Supabase client ───────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const LANGS  = ['de', 'en', 'es'];
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const BATCH  = 100; // upsert batch size

async function upsertBatch(table, rows) {
  if (dryRun) { console.log(`  [dry] would upsert ${rows.length} rows into ${table}`); return; }
  const { error } = await sb.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────
let totalPassages = 0, totalQuestions = 0, totalSkipped = 0;

for (const lang of LANGS) {
  if (filterLang && lang !== filterLang) continue;
  for (const level of LEVELS) {
    if (filterLevel && level !== filterLevel) continue;

    const bankPath = path.join(ROOT, 'library', lang, level, 'questions.json');
    if (!fs.existsSync(bankPath)) continue;

    const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
    const questions = bank.questions || [];
    const passages  = bank.passages  || [];

    // Also load standalone passages.json if exists
    const passagesPath = path.join(ROOT, 'library', lang, level, 'passages.json');
    if (fs.existsSync(passagesPath)) {
      const extra = JSON.parse(fs.readFileSync(passagesPath, 'utf8'));
      (extra.passages || []).forEach((p) => {
        if (!passages.find((x) => x.id === p.id)) passages.push(p);
      });
    }

    console.log(`\n── ${lang}/${level}: ${passages.length} passages, ${questions.length} questions`);

    // Upsert passages
    if (passages.length) {
      const rows = passages.map((p) => ({
        id:         p.id,
        lang,
        level,
        module:     p.module || 'lesen',
        title:      p.title  || null,
        body:       p.text   || p.body || '',
        vocab:      p.passageVocab || p.vocab || [],
        topic_tags: p.topicTags   || [],
        word_count: p.text ? p.text.split(/\s+/).length : null,
      }));
      for (const batch of chunks(rows, BATCH)) await upsertBatch('lc_passages', batch);
      totalPassages += passages.length;
      console.log(`  ✓ passages: ${passages.length}`);
    }

    // Upsert questions
    if (questions.length) {
      const rows = questions.map((q) => ({
        id:              q.id,
        lang,
        level,
        module:          q.module       || 'lesen',
        teil:            q.teil         || null,
        type:            q.type         || 'multiple_choice',
        question:        q.question     || null,
        correct:         q.correct      || q.correctAnswer || null,
        explanation:     q.explanation  || null,
        passage_id:      q.passageId    || null,
        options:         Array.isArray(q.options) ? q.options : [],
        grammar_tags:    q.grammarTags     || [],
        topic_tags:      q.topicTags       || [],
        vocabulary_tags: q.vocabularyTags  || [],
        difficulty:      q.difficulty      || 5,
        skills:          q.skills          || [],
        exam_type:       q.examType        || null,
      }));
      for (const batch of chunks(rows, BATCH)) await upsertBatch('lc_questions', batch);
      totalQuestions += questions.length;
      console.log(`  ✓ questions: ${questions.length}`);
    }
  }
}

// Migrate pool seeds
const poolSeedDir = path.join(ROOT, 'library', 'pool-seed');
if (fs.existsSync(poolSeedDir)) {
  for (const file of fs.readdirSync(poolSeedDir).filter((f) => f.endsWith('.json'))) {
    const [lang, level] = file.replace('.json', '').split('_');
    const seeds = JSON.parse(fs.readFileSync(path.join(poolSeedDir, file), 'utf8'));
    if (!Array.isArray(seeds) || !seeds.length) continue;
    console.log(`\n── pool-seed ${lang}/${level}: ${seeds.length} exams`);
    const rows = seeds.map((s) => ({
      id:             s.id,
      lang,
      level,
      topic:          s.topic || null,
      exam_data:      s.exam,
      source:         s.contributor === 'seed' ? 'seed' : 'library',
      coverage_ratio: s.coverageRatio || null,
      is_valid:       true,
      served_count:   0,
    }));
    for (const batch of chunks(rows, BATCH)) await upsertBatch('lc_pool_exams', batch);
    console.log(`  ✓ pool seeds: ${seeds.length}`);
  }
}

console.log(`\n═══════════════════════════════════`);
console.log(`Migration ${dryRun ? '(DRY RUN) ' : ''}complete:`);
console.log(`  Passages : ${totalPassages}`);
console.log(`  Questions: ${totalQuestions}`);
if (dryRun) console.log(`\n  Nothing was written (--dry-run). Remove flag to apply.`);
