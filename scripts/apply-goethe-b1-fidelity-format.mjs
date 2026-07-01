#!/usr/bin/env node
/**
 * Apply Goethe B1 Modellsatz format fixes to served exams:
 * - Schreiben 80/80/40
 * - Sprechen Teil 2 slides (5 Folien)
 * - Lesen Teil 3 example (Situation 0)
 * - Topic variety: 2nd technology → media, 2nd education → family
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  GOETHE_B1_SCHREIBEN_WORDS,
  GOETHE_B1_PRESENTATION_SLIDES,
  GOETHE_B1_LESEN_T3_EXAMPLE,
} = require(path.join(ROOT, 'js/library/goetheB1Constants.js'));

const TARGET = path.join(ROOT, 'data/exams/de_B1.json');

function patchSchreiben(exam) {
  for (const part of exam.schreibenParts || []) {
    const n = Number(part.aufgabe);
    const spec = GOETHE_B1_SCHREIBEN_WORDS[n];
    if (!spec) continue;
    part.minWords = spec.min;
    part.maxWords = spec.max;
    part.targetWords = spec.target;
    if (part.task) {
      part.task = part.task
        .replace(/\bmin(?:destens|\.?\s*)?\s*70\b/gi, '80')
        .replace(/\b(?:circa|ca\.|etwa)\s*70\s*Wörter/gi, 'circa 80 Wörter')
        .replace(/\b(?:circa|ca\.|etwa)\s*30\s*Wörter/gi, 'circa 40 Wörter')
        .replace(/\b30–50\s*Wörter/gi, '40 Wörter')
        .replace(/\b70–90\s*Wörter/gi, '80 Wörter');
    }
  }
  for (const row of exam.blueprintCoverage || []) {
    if (row.module !== 'schreiben') continue;
    const spec = GOETHE_B1_SCHREIBEN_WORDS[row.teil];
    if (spec) row.wordsPerPassage = { min: spec.min, max: spec.max };
  }
}

function patchSprechen(exam) {
  const t2 = (exam.sprechenParts || []).find((p) => Number(p.teil) === 2);
  if (t2) t2.slides = GOETHE_B1_PRESENTATION_SLIDES.map((s) => ({ ...s }));
}

function patchLesenT3(exam) {
  const t3 = (exam.lesenParts || []).find((p) => Number(p.teil) === 3);
  if (!t3) return;
  if (!t3.example && !t3.solvedExample) {
    t3.example = { ...GOETHE_B1_LESEN_T3_EXAMPLE };
  }
}

function patchTopicVariety(exams) {
  let techCount = 0;
  let eduCount = 0;
  for (const exam of exams) {
    const t = String(exam.topic || '').toLowerCase();
    if (t === 'technology') {
      techCount++;
      if (techCount === 2) exam.topic = 'media';
    }
    if (t === 'education') {
      eduCount++;
      if (eduCount === 2) exam.topic = 'family';
    }
  }
}

function main() {
  const apply = process.argv.includes('--apply');
  if (!apply) {
    console.log('[dry-run] Would patch', path.relative(ROOT, TARGET));
    console.log('Re-run with --apply to write changes to disk.');
    return;
  }

  const exams = JSON.parse(fs.readFileSync(TARGET, 'utf8'));
  if (!Array.isArray(exams)) throw new Error('Expected exam array');

  for (const exam of exams) {
    patchSchreiben(exam);
    patchSprechen(exam);
    patchLesenT3(exam);
  }
  patchTopicVariety(exams);

  fs.writeFileSync(TARGET, JSON.stringify(exams, null, 2) + '\n', 'utf8');
  console.log(`Patched ${exams.length} exams → ${path.relative(ROOT, TARGET)}`);
}

main();
