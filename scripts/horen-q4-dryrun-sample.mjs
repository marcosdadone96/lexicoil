/**
 * Dry-run Q4 (metadataSchema) sobre la muestra manual Hören (12 archivos).
 * Solo logging — no modifica archivos ni bloquea.
 *
 *   node scripts/horen-q4-dryrun-sample.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { runMetadataSchemaGate } from './lib/qualityGates/metadataSchemaGate.mjs';

const SAMPLE = [
  'horen-t1-gemini-011.json',
  'horen-t1-gemini-012.json',
  'horen-t1-gemini-013.json',
  'horen-t2-gemini-010.json',
  'horen-t2-gemini-011.json',
  'horen-t2-gemini-012.json',
  'horen-t2-gemini-013.json',
  'horen-t3-gemini-005.json',
  'horen-t3-gemini-006.json',
  'horen-t3-gemini-007.json',
  'horen-t4-gemini-005.json',
  'horen-t4-gemini-006.json',
];

/** Casos de topic_mismatch confirmados en revisión manual. */
const EXPECTED_MISMATCHES = [
  { file: 'horen-t1-gemini-013.json', passageHint: 's1', tag: 'Arbeit' },
  { file: 'horen-t1-gemini-013.json', passageHint: 's2', tag: 'Technik' },
  { file: 'horen-t1-gemini-012.json', passageHint: 's4', tag: 'Wohnen' },
  { file: 'horen-t1-gemini-011.json', passageHint: 's1', tag: 'Konsum' },
  { file: 'horen-t1-gemini-011.json', passageHint: 's4', tag: 'Freizeit' },
];

const GEN = path.join(ROOT, 'batches/generated');

function main() {
  console.log('══ Q4 dry-run Hören (12 archivos muestra) ══\n');
  const allFindings = [];
  let filesWithMismatch = 0;

  for (const name of SAMPLE) {
    const filePath = path.join(GEN, name);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠ missing: ${name}`);
      continue;
    }
    const batch = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const verdict = runMetadataSchemaGate(batch, {
      file: `batches/generated/${name}`,
      profile: 'generated',
      module: 'horen',
    });
    const mismatches = verdict.findings.filter((f) => f.rule === 'topic_mismatch');
    const warns = verdict.findings.filter((f) => f.severity === 'warn');
    if (mismatches.length) filesWithMismatch++;
    allFindings.push(...mismatches.map((f) => ({ file: name, ...f })));

    console.log(
      `${name}: verdict=${verdict.verdict} ` +
        `mismatch=${mismatches.length} warn=${warns.length} total=${verdict.findings.length}`,
    );
    for (const f of mismatches) {
      console.log(`  ✗ ${f.detail}`);
    }
  }

  console.log('\n── Expected manual mismatches (5) ──');
  let hit = 0;
  for (const exp of EXPECTED_MISMATCHES) {
    const found = allFindings.find(
      (f) =>
        f.file === exp.file &&
        f.span === exp.tag &&
        (f.detail.includes(`-${exp.passageHint}`) || f.detail.includes(exp.passageHint)),
    );
    const ok = Boolean(found);
    if (ok) hit++;
    console.log(
      `${ok ? '✓' : '✗'} ${exp.file} ${exp.passageHint} tag=${exp.tag}` +
        (found ? ` → ${found.detail.slice(0, 100)}…` : ' — NO DETECTADO'),
    );
  }

  console.log(`\nResumen: ${filesWithMismatch} archivos con topic_mismatch`);
  console.log(`Expected hits: ${hit}/${EXPECTED_MISMATCHES.length}`);
  console.log('(modo dry-run — sin block, sin escritura)');
}

main();
