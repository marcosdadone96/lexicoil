#!/usr/bin/env node
/**
 * Rebuilds library/de/B1/questions.json and passages.json from scratch
 * using only the clean batches in batches/generated/.
 *
 * Usage:
 *   node scripts/rebuild-pool-from-generated.mjs [--dry-run] [--lang de] [--level B1]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = path.join(ROOT, 'batches', 'generated');

function parseArgs(argv) {
  const o = { lang: 'de', level: 'B1', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lang') o.lang = argv[++i];
    else if (argv[i] === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (argv[i] === '--dry-run') o.dryRun = true;
  }
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const bankPath = path.join(ROOT, 'library', o.lang, o.level, 'questions.json');
  const passPath = path.join(ROOT, 'library', o.lang, o.level, 'passages.json');

  if (!fs.existsSync(bankPath)) {
    console.error('No existe banco:', bankPath);
    process.exit(1);
  }

  // Read all batch files
  const batchFiles = fs.readdirSync(GENERATED)
    .filter(f => f.endsWith('.json') && !f.startsWith('.') && !f.startsWith('_'))
    .sort();

  console.log(`\n=== Rebuild pool de/B1 desde ${batchFiles.length} batches ===\n`);

  const allPassages = new Map(); // id → passage
  const allQuestions = new Map(); // id → question
  const stats = { files: 0, skippedDupQ: 0, skippedDupP: 0, errors: [] };

  for (const f of batchFiles) {
    const filePath = path.join(GENERATED, f);
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      stats.errors.push(`${f}: JSON inválido — ${e.message}`);
      continue;
    }

    // Passages
    for (const p of batch.passages || []) {
      if (!p.id || !p.text) continue;
      if (allPassages.has(p.id)) { stats.skippedDupP++; continue; }
      allPassages.set(p.id, {
        id: p.id,
        lang: p.lang || o.lang,
        level: p.level || o.level,
        module: p.module,
        title: p.title || '',
        text: p.text,
        ...(p.passageVocab ? { passageVocab: p.passageVocab } : {}),
      });
    }

    // Questions
    for (const q of batch.questions || []) {
      if (!q.id || !q.module) continue;
      if (allQuestions.has(q.id)) { stats.skippedDupQ++; continue; }
      allQuestions.set(q.id, q);
    }

    stats.files++;
  }

  const questions = [...allQuestions.values()];
  const passages = [...allPassages.values()];

  // By module/teil breakdown
  const byMT = {};
  questions.forEach(q => {
    const k = `${q.module}-t${q.teil}`;
    byMT[k] = (byMT[k] || 0) + 1;
  });

  console.log(`Batches procesados: ${stats.files}/${batchFiles.length}`);
  console.log(`Pasajes únicos: ${passages.length} (${stats.skippedDupP} duplicados omitidos)`);
  console.log(`Preguntas únicas: ${questions.length} (${stats.skippedDupQ} duplicados omitidos)`);
  console.log('\nDesglose por módulo/teil:');
  Object.entries(byMT).sort().forEach(([k, n]) => console.log(`  ${k}: ${n}`));

  if (stats.errors.length) {
    console.log('\nERRORES:');
    stats.errors.forEach(e => console.log('  ' + e));
  }

  if (o.dryRun) {
    console.log('\n(dry-run: no se escribe nada)');
    return;
  }

  // Backup current pool
  const ts = Date.now();
  if (fs.existsSync(bankPath)) {
    fs.copyFileSync(bankPath, bankPath.replace('.json', `.backup-rebuild-${ts}.json`));
    console.log(`\nBackup guardado: questions.backup-rebuild-${ts}.json`);
  }
  if (fs.existsSync(passPath)) {
    fs.copyFileSync(passPath, passPath.replace('.json', `.backup-rebuild-${ts}.json`));
  }

  // Write new questions.json
  // Include passages inline (required by LibraryLoader/accept-de-b1 passageId integrity check)
  const bank = {
    meta: {
      language: o.lang,
      level: o.level,
      version: 1,
      generatedAt: new Date().toISOString().slice(0, 10),
      rebuiltFrom: `batches/generated/ (${stats.files} archivos)`,
    },
    passages,
    questions,
    vocabulary: {},
  };
  fs.writeFileSync(bankPath, JSON.stringify(bank, null, 2) + '\n', 'utf8');
  console.log(`\n✅ Escrito: ${bankPath}`);
  console.log(`   ${questions.length} preguntas, ${passages.length} pasajes inline`);

  // Write new passages.json (mirror for compatibility)
  fs.writeFileSync(passPath, JSON.stringify(passages, null, 2) + '\n', 'utf8');
  console.log(`✅ Escrito: ${passPath}`);
  console.log(`   ${passages.length} pasajes`);

  console.log('\n=== Reconstrucción completada ===');
}

main();
