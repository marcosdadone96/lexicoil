#!/usr/bin/env node
/**
 * Benchmark Gemini der/die/das accuracy vs DWDS ground truth.
 * Run (Windows): $env:NODE_OPTIONS="--use-system-ca"; node scripts/benchmark-gemini-gender-accuracy.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { resolveGermanGender, geminiApiKey } = require(path.join(ROOT, 'netlify/functions/lib/freeTranslate.js'));

/**
 * Ground truth from DWDS (checked 2026-07-13).
 * dual: both articles accepted in standard usage.
 */
const SAMPLE = [
  // simple — unambiguous
  { word: 'Haus', category: 'simple', dwds: ['das'], dwdsNote: 'Substantiv (Neutrum)' },
  { word: 'Schule', category: 'simple', dwds: ['die'], dwdsNote: 'Substantiv (Femininum)' },
  { word: 'Mann', category: 'simple', dwds: ['der'], dwdsNote: 'Substantiv (Maskulinum)' },
  { word: 'Kind', category: 'simple', dwds: ['das'], dwdsNote: 'Substantiv (Neutrum)' },
  { word: 'Freund', category: 'simple', dwds: ['der'], dwdsNote: 'Substantiv (Maskulinum)' },
  { word: 'Problem', category: 'simple', dwds: ['das'], dwdsNote: 'Substantiv (Neutrum)' },
  { word: 'Information', category: 'simple', dwds: ['die'], dwdsNote: 'Substantiv (Femininum)' },
  { word: 'Mädchen', category: 'simple', dwds: ['das'], dwdsNote: 'Substantiv (Neutrum) — -chen rule' },
  { word: 'Fenster', category: 'simple', dwds: ['das'], dwdsNote: 'Substantiv (Neutrum)' },

  // compound — gender from last component
  { word: 'Haustür', category: 'compound', dwds: ['die'], dwdsNote: 'die Tür → die Haustür' },
  { word: 'Arbeitsplatz', category: 'compound', dwds: ['der'], dwdsNote: 'der Platz → der Arbeitsplatz' },
  { word: 'Hauptstadt', category: 'compound', dwds: ['die'], dwdsNote: 'die Stadt → die Hauptstadt' },
  { word: 'Kindergarten', category: 'compound', dwds: ['der'], dwdsNote: 'der Garten → der Kindergarten' },
  { word: 'Fußballplatz', category: 'compound', dwds: ['der'], dwdsNote: 'der Platz → der Fußballplatz' },
  { word: 'Wochenende', category: 'compound', dwds: ['das'], dwdsNote: 'das Ende → das Wochenende' },

  // loan / less predictable
  { word: 'Pizza', category: 'loan', dwds: ['die'], dwdsNote: 'Substantiv (Femininum)' },
  { word: 'E-Mail', category: 'loan', dwds: ['die'], dwdsNote: 'DWDS: die E-Mail (Femininum)' },
  { word: 'Laptop', category: 'loan', dwds: ['der'], dwdsNote: 'Substantiv (Maskulinum)' },
  { word: 'Team', category: 'loan', dwds: ['das'], dwdsNote: 'Substantiv (Neutrum)' },
  { word: 'Meeting', category: 'loan', dwds: ['das'], dwdsNote: 'Substantiv (Neutrum)' },
  { word: 'Restaurant', category: 'loan', dwds: ['das'], dwdsNote: 'Substantiv (Neutrum)' },
  { word: 'Smartphone', category: 'loan', dwds: ['das'], dwdsNote: 'Substantiv (Neutrum)' },

  // dual / regional / genuinely ambiguous
  { word: 'Joghurt', category: 'dual', dwds: ['der', 'das'], dwdsNote: 'DWDS: der Joghurt, das Joghurt (beide üblich)' },
  { word: 'Liter', category: 'dual', dwds: ['der', 'das'], dwdsNote: 'DWDS: der Liter, das Liter (beide)' },
  { word: 'Virus', category: 'dual', dwds: ['der', 'das'], dwdsNote: 'DWDS: der Virus (häufig), das Virus (Medizin/Biologie)' },
  { word: 'Butter', category: 'dual', dwds: ['die', 'der'], dwdsNote: 'Standard: die Butter; regional auch der Butter (Süd)' },
  { word: 'Nutella', category: 'dual', dwds: ['die', 'das'], dwdsNote: 'Standard: die Nutella; umg. auch das Nutella' },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function verdict(ai, dwds, category) {
  if (!ai) return { ok: false, label: 'NO_RESPONSE' };
  if (dwds.includes(ai)) return { ok: true, label: 'OK' };
  if (category === 'dual' && dwds.length > 1) return { ok: false, label: 'DUAL_MISS' };
  return { ok: false, label: 'ERROR' };
}

async function main() {
  if (!geminiApiKey()) {
    console.error('GEMINI_API_KEY missing — cannot benchmark.');
    process.exit(1);
  }

  const rows = [];
  for (const item of SAMPLE) {
    const result = await resolveGermanGender(item.word);
    const v = verdict(result.article, item.dwds, item.category);
    rows.push({
      word: item.word,
      category: item.category,
      ai: result.article,
      dwds: item.dwds.join('/'),
      dwdsNote: item.dwdsNote,
      result: v.label,
      ok: v.ok,
      reason: result.reason,
    });
    await sleep(650);
  }

  const nonDual = rows.filter((r) => r.category !== 'dual');
  const dual = rows.filter((r) => r.category === 'dual');
  const nonDualOk = nonDual.filter((r) => r.ok).length;
  const dualOk = dual.filter((r) => r.ok).length;
  const totalOk = rows.filter((r) => r.ok).length;
  const errors = rows.filter((r) => !r.ok);

  const byCategory = {};
  for (const r of rows) {
    if (!byCategory[r.category]) byCategory[r.category] = { total: 0, ok: 0 };
    byCategory[r.category].total += 1;
    if (r.ok) byCategory[r.category].ok += 1;
  }

  const outPath = path.join(ROOT, 'batches/ready/gate-logs/gemini-gender-benchmark-2026-07-13.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        sampleSize: SAMPLE.length,
        nonDualAccuracyPct: Math.round((nonDualOk / nonDual.length) * 1000) / 10,
        overallAccuracyPct: Math.round((totalOk / rows.length) * 1000) / 10,
        dualAccuracyPct: dual.length ? Math.round((dualOk / dual.length) * 1000) / 10 : null,
        byCategory,
        rows,
        errors,
      },
      null,
      2,
    ),
  );

  console.log('\n── Gemini gender benchmark (DWDS ground truth) ──\n');
  console.log('word'.padEnd(16), 'cat'.padEnd(10), 'AI'.padEnd(6), 'DWDS'.padEnd(12), 'result');
  console.log('-'.repeat(62));
  for (const r of rows) {
    const mark = r.ok ? '✅' : '❌';
    console.log(
      `${mark} ${r.word.padEnd(14)} ${r.category.padEnd(10)} ${String(r.ai || '—').padEnd(6)} ${r.dwds.padEnd(12)} ${r.result}`,
    );
  }

  console.log('\n── Summary ──');
  console.log(`Non-dual accuracy: ${nonDualOk}/${nonDual.length} = ${Math.round((nonDualOk / nonDual.length) * 1000) / 10}%`);
  console.log(`Dual/ambiguous:      ${dualOk}/${dual.length} = ${dual.length ? Math.round((dualOk / dual.length) * 1000) / 10 : 0}%`);
  console.log(`Overall:             ${totalOk}/${rows.length} = ${Math.round((totalOk / rows.length) * 1000) / 10}%`);
  console.log('\nBy category:');
  for (const [cat, stat] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${stat.ok}/${stat.total} (${Math.round((stat.ok / stat.total) * 1000) / 10}%)`);
  }
  if (errors.length) {
    console.log('\nErrors:');
    for (const e of errors) {
      console.log(`  ${e.word} (${e.category}): AI=${e.ai || '—'} vs DWDS=${e.dwds} — ${e.dwdsNote}`);
    }
  }
  console.log(`\nReport: ${path.relative(ROOT, outPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
