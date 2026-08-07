#!/usr/bin/env node
/**
 * Retira los 10 batches publicados por fire-a2-horen-dialogue-names-live.mjs
 * (2026-07-27 post-barrido) — generados con --skip-quality, no productivos.
 *
 *   node scripts/retire-a2-horen-live-fire-batches.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const EVIDENCE = path.join(
  ROOT,
  'batches/ready/gate-logs/a2-dialogue-name-rotation-live-fire.json',
);
const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const destDir = path.join(ROOT, 'batches/needs-regeneration/A2');

if (!fs.existsSync(EVIDENCE)) {
  console.error(`Missing ${EVIDENCE}`);
  process.exit(1);
}

const fire = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));
const files = (fire.runs || [])
  .map((r) => r.file?.replace(/^.*\//, ''))
  .filter(Boolean);

if (!files.length) {
  console.error('No files in live-fire evidence');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

const log = {
  at: new Date().toISOString(),
  decision: 'retire-not-productive',
  rationale:
    'Generados con --skip-quality en fire-a2-horen-dialogue-names-live.mjs: pasaron formato, dialogue-names y poolReady, pero NO calidad pedagógica ni gate léxico (runDualGates skipQuality). No cumplen barra pool-verified productivo.',
  fireEvidenceAt: fire.at,
  skipQuality: fire.skipQuality === true,
  retired: [],
  missing: [],
  notInPool: [],
};

for (const file of files) {
  const src = path.join(poolDir, file);
  if (!fs.existsSync(src)) {
    log.missing.push(file);
    console.log(`skip (not in pool): ${file}`);
    continue;
  }
  const batch = JSON.parse(fs.readFileSync(src, 'utf8'));
  batch._poolRetiredAt = log.at;
  batch._poolRetiredReason = 'live-fire-dialogue-names-skip-quality-2026-07-27';
  batch._poolRetiredFrom = `pool-verified/A2/${file}`;
  batch._poolRetiredNote =
    'Artefacto de prueba operador; no tratar como stock productivo hasta re-validar calidad sin --skip-quality.';
  const dest = path.join(destDir, file);
  fs.writeFileSync(dest, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  fs.unlinkSync(src);
  log.retired.push(file);
  console.log(`retired: ${file} → needs-regeneration/A2/`);
}

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-horen-live-fire-retire-evidence.json');
fs.writeFileSync(out, `${JSON.stringify(log, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(log, null, 2));
