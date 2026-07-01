#!/usr/bin/env node
/**
 * Valida esqueletos scripts/t3-blueprints/*.json y copia los OK a batches/generated/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkLesenBatchQuality, formatQualityReport } from './lib/lesenBatchQuality.mjs';
import { checkLesenBatchIngest, formatIngestReport } from './lib/lesenBatchIngestCheck.mjs';
import { nextOutputBasename } from './lib/lesenTemplatePrompt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BP_DIR = path.join(ROOT, 'scripts', 't3-blueprints');
const OUT_DIR = path.join(ROOT, 'batches', 'generated');

function validateBatchFile(relFile) {
  const res = spawnSync(
    process.execPath,
    ['scripts/validate-batch.mjs', '--lang', 'de', '--level', 'B1', '--file', relFile, '--allow-dup'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return { ok: res.status === 0, output: `${res.stdout || ''}${res.stderr || ''}`.trim() };
}

function slugFromName(name) {
  return name.replace(/^bp-/, '').replace(/\.json$/i, '');
}

function normalizeIds(batch, slug) {
  const idp = `bp-${slug.replace(/[^a-z0-9-]/gi, '').slice(0, 12)}-${Date.now().toString(36).slice(-4)}`;
  return {
    passages: [],
    questions: batch.questions.map((q, i) => ({
      ...q,
      id: `gen-q-3-${idp}-${i + 1}`,
      module: 'lesen',
      teil: 3,
      type: 'matching',
      lang: q.lang || 'de',
      level: q.level || 'B1',
      correctAnswer: q.correctAnswer ?? q.correct,
    })),
  };
}

function main() {
  const files = fs.readdirSync(BP_DIR).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) {
    console.error('No hay blueprints en scripts/t3-blueprints/');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ok = [];
  const fail = [];

  for (const file of files) {
    const src = path.join(BP_DIR, file);
    const slug = slugFromName(file);
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(src, 'utf8'));
    } catch (e) {
      fail.push({ file, errors: [`JSON inválido: ${e.message}`] });
      continue;
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(file);
    console.log('═'.repeat(60));

    const quality = checkLesenBatchQuality(batch, 3);
    console.log(formatQualityReport(quality));

    const ingest = checkLesenBatchIngest(batch, {
      lang: 'de',
      level: 'B1',
      batchId: slug,
    });
    console.log(formatIngestReport(ingest));

    const tmpName = `.tmp-bp-${slug}.json`;
    const tmpPath = path.join(OUT_DIR, tmpName);
    fs.writeFileSync(tmpPath, JSON.stringify(batch, null, 2));
    const relTmp = path.join('batches', 'generated', tmpName).replace(/\\/g, '/');
    const fmt = validateBatchFile(relTmp);
    console.log(fmt.output || (fmt.ok ? 'Formato OK' : 'Formato FAIL'));
    try {
      fs.unlinkSync(tmpPath);
    } catch (_) {
      /* ignore */
    }

    const errors = [];
    if (!quality.ok) errors.push(...quality.issues.map((i) => `[calidad] ${i}`));
    if (!ingest.ok) errors.push('[ingest] pre-check falló');
    if (!fmt.ok) errors.push('[formato] validate-batch falló');

    if (errors.length) {
      fail.push({ file, errors });
      continue;
    }

    const normalized = normalizeIds(batch, slug);
    const basename = nextOutputBasename(3, 'claude-bp');
    const outPath = path.join(OUT_DIR, basename);
    fs.writeFileSync(outPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    const relOut = path.relative(ROOT, outPath).replace(/\\/g, '/');
    ok.push({ file, relOut });
    console.log(`✅ Guardado: ${relOut}`);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`RESUMEN: ${ok.length} OK → generated/, ${fail.length} rechazados`);
  if (ok.length) {
    console.log('\nGuardados:');
    for (const r of ok) console.log(`  ${r.file} → ${r.relOut}`);
  }
  if (fail.length) {
    console.log('\nRechazados:');
    for (const r of fail) {
      console.log(`  ${r.file}:`);
      for (const e of r.errors) console.log(`    - ${e}`);
    }
  }

  process.exit(fail.length ? 1 : 0);
}

main();
