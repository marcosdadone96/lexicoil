#!/usr/bin/env node
/**
 * Compara 5-gramas de apertura en batches Hören T2 (detección duplicados).
 *   node scripts/audit-horen-t2-opening-ngrams.mjs [dir...]
 *   node scripts/audit-horen-t2-opening-ngrams.mjs --json batches/generated/B1
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  horenT2OpeningFiveGrams,
  isHorenT2BannedOpening,
  HOREN_T2_BANNED_OPENING_RES,
} from './lib/horenOpeningsBank.mjs';

function walkJson(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJson(abs, out);
    else if (/horen-t2.*\.json$/i.test(ent.name)) out.push(abs);
  }
  return out;
}

function passageText(batch) {
  const p = batch.passages?.[0] || {};
  return String(p.text || p.transcript || '').trim();
}

function main() {
  const asJson = process.argv.includes('--json');
  const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const roots = dirs.length
    ? dirs.map((d) => path.resolve(d))
    : [
        path.join(ROOT, 'batches/generated/B1'),
        path.join(ROOT, 'batches/ready/pool-verified/B1'),
      ];

  const files = [...new Set(roots.flatMap((d) => walkJson(d)))];
  const rows = [];
  const gramIndex = new Map();

  for (const abs of files) {
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    const text = passageText(batch);
    if (!text) continue;
    const grams = horenT2OpeningFiveGrams(text);
    const topic = batch.topicTag || batch._requestedTopic || '?';
    const banned = isHorenT2BannedOpening(text);
    rows.push({
      file: path.basename(abs),
      topic,
      openingPreview: text.slice(0, 120).replace(/\s+/g, ' '),
      banned,
      fiveGramCount: grams.length,
      firstFiveGram: grams[0] || null,
    });
    for (const g of grams.slice(0, 8)) {
      if (!gramIndex.has(g)) gramIndex.set(g, []);
      gramIndex.get(g).push(path.basename(abs));
    }
  }

  const sharedGrams = [...gramIndex.entries()]
    .filter(([, files]) => files.length >= 2)
    .map(([gram, files]) => ({ gram, files: [...new Set(files)], count: new Set(files).size }))
    .sort((a, b) => b.count - a.count);

  const report = {
    generatedAt: new Date().toISOString(),
    filesScanned: rows.length,
    bannedOpeningCount: rows.filter((r) => r.banned).length,
    sharedFiveGrams: sharedGrams.slice(0, 20),
    duplicatePairCount: sharedGrams.filter((g) => g.count >= 2).length,
    rows,
    bannedPatterns: HOREN_T2_BANNED_OPENING_RES.map((re) => re.source),
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Hören T2 aperturas — ${rows.length} archivos\n`);
  console.log(`Aperturas prohibidas detectadas: ${report.bannedOpeningCount}`);
  console.log(`5-gramas compartidos (≥2 archivos): ${report.duplicatePairCount}\n`);
  if (sharedGrams.length) {
    console.log('Top 5-gramas duplicados:');
    for (const g of sharedGrams.slice(0, 10)) {
      console.log(`  «${g.gram}» → ${g.count} archivos: ${g.files.join(', ')}`);
    }
  } else {
    console.log('Sin 5-gramas compartidos entre archivos escaneados.');
  }
}

main();
