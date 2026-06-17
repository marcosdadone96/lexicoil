'use strict';

/**
 * Lee exámenes de la pool-seed (library/pool-seed/de_B1.json si existe),
 * los normaliza al formato del banco y los añade a library/de/B1/questions.json.
 *
 * Uso: node scripts/pipeline/ingestAiExamsToBank.js
 *
 * Solo ingesta exámenes con fuente 'ai_generated' que tengan al menos 3 preguntas.
 * No duplica preguntas: comprueba por id antes de añadir.
 *
 * Guarda un backup de questions.json antes de modificarlo.
 */

const fs = require('fs');
const path = require('path');
const { normalizeAiExamToBank } = require('./lib/normalizeAiExamToBank.js');

const BANK_PATH = path.join(__dirname, '../../library/de/B1/questions.json');
const POOL_SEED_DIR = path.join(__dirname, '../../library/pool-seed');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function backupBank(bankPath) {
  const backup = bankPath.replace('.json', `.backup-${Date.now()}.json`);
  fs.copyFileSync(bankPath, backup);
  console.log(`Backup: ${backup}`);
  return backup;
}

function main() {
  const bank = loadJson(BANK_PATH);
  const existingIds = new Set(bank.questions.map((q) => q.id));
  const existingPassageIds = new Set(bank.passages.map((p) => p.id));

  const poolSeedFiles = fs.existsSync(POOL_SEED_DIR)
    ? fs.readdirSync(POOL_SEED_DIR).filter((f) => f.endsWith('.json'))
    : [];

  if (!poolSeedFiles.length) {
    console.log('No pool-seed files found. Nothing to ingest.');
    return;
  }

  let totalPassages = 0;
  let totalQuestions = 0;

  poolSeedFiles.forEach((file) => {
    const filePath = path.join(POOL_SEED_DIR, file);
    let entries;
    try {
      const raw = loadJson(filePath);
      entries = Array.isArray(raw) ? raw : [raw];
    } catch (e) {
      console.warn(`Skip ${file}: ${e.message}`);
      return;
    }

    entries.forEach((entry) => {
      const exam = entry.exam || entry;
      if (!exam?.lang || !exam?.level) return;

      let normalized;
      try {
        normalized = normalizeAiExamToBank(exam);
      } catch (e) {
        console.warn(`Skip exam ${exam.id || '?'}: ${e.message}`);
        return;
      }

      if (normalized.questions.length < 3) return;

      normalized.passages.forEach((p) => {
        if (!existingPassageIds.has(p.id)) {
          bank.passages.push(p);
          existingPassageIds.add(p.id);
          totalPassages++;
        }
      });

      normalized.questions.forEach((q) => {
        if (!existingIds.has(q.id)) {
          bank.questions.push(q);
          existingIds.add(q.id);
          totalQuestions++;
        }
      });
    });
  });

  if (totalPassages + totalQuestions > 0) {
    backupBank(BANK_PATH);
    bank.meta.version = (bank.meta.version || 1) + 1;
    bank.meta.generatedAt = new Date().toISOString().slice(0, 10);
    saveJson(BANK_PATH, bank);
    console.log(`Ingested: ${totalPassages} passages, ${totalQuestions} questions.`);
    console.log(`Bank now: ${bank.passages.length} passages, ${bank.questions.length} questions.`);
  } else {
    console.log('No new content to ingest.');
  }
}

main();
