#!/usr/bin/env node
/**
 * Replace transport exam Lesen Teil 3 with bank set dienstleistungen-alltag-04
 * (unique keys F,C,A,D,H,B + one 0 — transport/mobility-adjacent services).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ROOT, loadBlueprint, bankPath } from './lib/examPipeline.mjs';
import { bankToExamQuestion } from './fill-gaps-from-pool.mjs';

const require = createRequire(import.meta.url);
const AdsMatching = require(path.join(ROOT, 'js/library/adsMatching.js'));
const ExamRenumber = require(path.join(ROOT, 'js/engine/examRenumber.js'));
const { validatePartSemanticRules } = require(path.join(ROOT, 'js/engine/validation/blueprintFidelity.js'));
const { validateAdsUnique } = require(path.join(ROOT, 'js/engine/prompts/partPostprocess.js'));

const CURATED = path.join(ROOT, 'library/curated/de/B1/curated_de_B1_a67630f4ebd9.json');
const SET_KEY = 'de-b1-l-t3-dienstleistungen-alltag-04';
const TOKEN = 'de-b1-l-t3-dienstleistungen-alltag-04';

function adsToPartText(ads) {
  return (ads || [])
    .map((a) => {
      const body = a.title && a.text ? `${a.title} — ${a.text}` : a.text || a.title || '';
      return `${a.key}) ${body}`.trim();
    })
    .join('\n');
}

function main() {
  const blueprint = loadBlueprint('de', 'B1');
  const bpT3 = blueprint.modules.find((m) => m.id === 'lesen')?.parts?.find((p) => p.teil === 3);
  const bank = JSON.parse(fs.readFileSync(bankPath('de', 'B1'), 'utf8'));
  const questions = (bank.questions || [])
    .filter((q) => q.id.startsWith(`${SET_KEY}-q`))
    .sort((a, b) => Number(a.id.match(/-q(\d+)$/)?.[1] || 0) - Number(b.id.match(/-q(\d+)$/)?.[1] || 0));

  if (questions.length < 7) {
    console.error(`Need 7 bank items for ${SET_KEY}, found ${questions.length}`);
    process.exit(1);
  }

  const wrapper = JSON.parse(fs.readFileSync(CURATED, 'utf8'));
  const exam = wrapper.exam || wrapper;
  const partIdx = (exam.lesenParts || []).findIndex((p) => Number(p.teil) === 3);
  if (partIdx < 0) {
    console.error('transport lesen teil 3 not found');
    process.exit(1);
  }

  const part = exam.lesenParts[partIdx];
  delete part.items;

  const built = AdsMatching.buildAdsMatchingLesenPart(
    { teil: 3, slotType: 'ads_matching', instruction: part.instruction || bpT3?.instruction },
    questions.slice(0, 7),
    (q, i) => {
      const row = bankToExamQuestion(q, TOKEN);
      row.topicTags = [...new Set([...(row.topicTags || []), 'transport'])];
      return row;
    },
  );

  Object.assign(part, built);
  part.passageId = `${SET_KEY}-passage`;
  part.text = adsToPartText(built.ads);
  part.blueprintSlot = 'ads_matching';

  ExamRenumber.renumberExam(exam, blueprint);

  const semantic = validatePartSemanticRules(part, bpT3, 'lesen', 3);
  const uniq = validateAdsUnique(part.questions);
  if (semantic.errors.length || !uniq.ok) {
    console.error('Validation failed after patch:', semantic.errors, uniq.conflicts);
    process.exit(1);
  }

  const keys = part.questions.map((q) => String(q.correct || q.correctAnswer).toUpperCase());
  console.log('New correct keys:', keys.join(', '));

  if (wrapper.exam) wrapper.exam = exam;
  fs.writeFileSync(CURATED, `${JSON.stringify(wrapper, null, 2)}\n`, 'utf8');
  console.log(`Updated ${path.relative(ROOT, CURATED)}`);
}

main();
