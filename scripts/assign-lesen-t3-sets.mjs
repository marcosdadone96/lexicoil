#!/usr/bin/env node
/** Assign unique Lesen T3 bank sets per curated exam topic (de/B1). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  ROOT,
  loadBlueprint,
  bankPath,
  listCuratedFiles,
  curatedDir,
  loadJsonFile,
} from './lib/examPipeline.mjs';
import { bankToExamQuestion, examTokenFromFile } from './fill-gaps-from-pool.mjs';

const require = createRequire(import.meta.url);
const AdsMatching = require(path.join(ROOT, 'js/library/adsMatching.js'));
const ExamRenumber = require(path.join(ROOT, 'js/engine/examRenumber.js'));
const { validatePartSemanticRules } = require(path.join(ROOT, 'js/engine/validation/blueprintFidelity.js'));

/** Topic → bank set prefix (transport = mobility/services ads). */
const TOPIC_SET = {
  culture: 'de-b1-l-t3-bildungskurse-stadt-01',
  daily_life: 'de-b1-l-t3-bildungskurse-stadt-02',
  education: 'de-b1-l-t3-dienstleistung',
  environment: 'de-b1-l-t3-dienstleistungen-alltag-01',
  health: 'de-b1-l-t3-freizeit-basel',
  technology: 'de-b1-l-t3-kultur-events-03',
  transport: 'de-b1-l-t3-dienstleistungen-alltag-04',
  travel: 'de-b1-l-t3-kultur-events-01',
  work: 'de-b1-l-t3-sport-vereine-01',
};

function adsToPartText(ads) {
  return (ads || [])
    .map((a) => {
      const body = a.title && a.text ? `${a.title} — ${a.text}` : a.text || a.title || '';
      return `${a.key}) ${body}`.trim();
    })
    .join('\n');
}

function parseArgs(argv) {
  const opts = { lang: 'de', level: 'B1', apply: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--lang') opts.lang = argv[++i];
    else if (a === '--level') opts.level = String(argv[++i] || '').toUpperCase();
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv);
  const blueprint = loadBlueprint(opts.lang, opts.level);
  const bpT3 = blueprint.modules.find((m) => m.id === 'lesen')?.parts?.find((p) => p.teil === 3);
  const bank = JSON.parse(fs.readFileSync(bankPath(opts.lang, opts.level), 'utf8'));
  const usedSets = new Set();
  let failed = 0;

  for (const name of listCuratedFiles(opts.lang, opts.level)) {
    const file = path.join(curatedDir(opts.lang, opts.level), name);
    const wrapper = loadJsonFile(file);
    const exam = wrapper.exam || wrapper;
    const topic = wrapper.topic || exam.topic;
    const setKey = TOPIC_SET[topic];
    if (!setKey) {
      console.warn(`Skip ${topic}: no set mapping`);
      continue;
    }
    if (usedSets.has(setKey)) {
      console.error(`Duplicate set ${setKey} for ${topic}`);
      failed++;
      continue;
    }
    usedSets.add(setKey);

    const questions = (bank.questions || [])
      .filter((q) => q.id.startsWith(`${setKey}-q`))
      .sort((a, b) => Number(a.id.match(/-q(\d+)$/)?.[1] || 0) - Number(b.id.match(/-q(\d+)$/)?.[1] || 0));
    if (questions.length < 7) {
      console.error(`${topic}: only ${questions.length} bank items for ${setKey}`);
      failed++;
      continue;
    }

    const t3 = (exam.lesenParts || []).find((p) => Number(p.teil) === 3);
    if (!t3) {
      console.error(`${topic}: missing lesen T3`);
      failed++;
      continue;
    }

    delete t3.items;
    const token = examTokenFromFile(name);
    const built = AdsMatching.buildAdsMatchingLesenPart(
      { teil: 3, slotType: 'ads_matching', instruction: t3.instruction || bpT3?.instruction },
      questions.slice(0, 7),
      (q) => bankToExamQuestion(q, token),
    );
    Object.assign(t3, built);
    t3.passageId = `${setKey}-passage`;
    t3.text = adsToPartText(built.ads);
    t3.blueprintSlot = 'ads_matching';

    ExamRenumber.renumberExam(exam, blueprint);
    const semantic = validatePartSemanticRules(t3, bpT3, 'lesen', 3);
    if (semantic.errors.length) {
      console.error(`${topic}: ${semantic.errors.join('; ')}`);
      failed++;
      continue;
    }

    const keys = t3.questions.map((q) => String(q.correct || q.correctAnswer).toUpperCase()).join(',');
    console.log(`▶ ${topic} → ${setKey} [${keys}]`);

    if (opts.apply) {
      if (wrapper.exam) wrapper.exam = exam;
      fs.writeFileSync(file, `${JSON.stringify(wrapper, null, 2)}\n`, 'utf8');
    }
  }

  if (failed) process.exit(1);
  if (!opts.apply) console.log('\nDry run — pass --apply to write');
}

main();
