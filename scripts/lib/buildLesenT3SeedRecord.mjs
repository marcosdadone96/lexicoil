/**
 * buildLesenT3SeedRecord.mjs — Batch make-t3 → seed record (bank-style dual storage).
 *
 * Canonical seed shape (matches bank-de-B1-lesen-t3-*):
 *   passage.ads[] + record.ads[]  → { key, title, text } parsed from option lines
 *   questions[].options[]           → bare keys A–J + K/"0" (no ad text duplicated)
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const AdsMatching = require(path.join(ROOT, 'js/library/adsMatching.js'));

const AD_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

/** Bare matching options — same pattern as bank-de-B1-lesen-t3-* (K = no-match). */
export const BARE_T3_QUESTION_OPTIONS = [
  ...AD_KEYS.map((key) => ({ key, text: key })),
  { key: 'K', text: '0' },
];

function shortHash(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}

function normalizeMatchingCorrect(raw) {
  return AdsMatching.normalizeMatchingCorrect(raw);
}

/**
 * @param {object} batch - make-t3 output { passages?, questions[] }
 * @param {object} [opts]
 * @param {string} [opts.lang='de']
 * @param {string} [opts.level='B1']
 * @param {string} [opts.idPrefix='pool3'] - e.g. 'pool3' | 'bank'
 * @param {string} [opts.contributorPrefix='pool3']
 * @returns {object} reusable seed record
 */
export function buildLesenT3SeedRecord(
  batch,
  { lang = 'de', level = 'B1', idPrefix = 'pool3', contributorPrefix = 'pool3' } = {},
) {
  const qs = batch.questions || [];
  const passage = batch.passages?.[0] || {};
  const topic = qs[0]?.topicTags?.[0] || 'daily_life';
  const hash = shortHash((passage.text || '') + qs.map((q) => q.id).join(''));

  const ads = AdsMatching.buildAdsFromBankQuestions(qs);
  if (ads.length < 10) {
    throw new Error(
      `buildLesenT3SeedRecord: expected 10 ads A–J, got ${ads.length} (check questions[].options[])`,
    );
  }

  const bareOptions = BARE_T3_QUESTION_OPTIONS.map((o) => ({ ...o }));

  return {
    id: `${idPrefix}-${lang}-${level}-lesen-t3-${hash}`,
    lang,
    level,
    module: 'lesen',
    teil: 3,
    instruction: batch.instruction || '',
    complete: true,
    verified: true,
    contributor: `${contributorPrefix}:${topic}`,
    passage: {
      title: passage.title || '',
      text: passage.text || '',
      ads,
    },
    ads,
    questions: qs.map((q) => {
      const correct = normalizeMatchingCorrect(q.correct ?? q.correctAnswer ?? '');
      return {
        id: q.id,
        type: 'matching',
        question: q.question || '',
        options: bareOptions,
        correct,
        correctAnswer: correct,
        explanation: q.explanation || '',
      };
    }),
    itemCount: qs.length,
    targetCount: qs.length,
    createdAt: Date.now(),
  };
}

/**
 * Structural shape check for comparing pool3 output vs bank reference (read-only QA).
 */
export function describeLesenT3SeedShape(record) {
  const ads = record.passage?.ads || record.ads || [];
  const q0 = record.questions?.[0];
  return {
    id: record.id,
    adsCount: ads.length,
    adsSample: ads.slice(0, 2).map((a) => ({
      key: a.key,
      titleLen: String(a.title || '').length,
      textLen: String(a.text || '').length,
      textPreview: String(a.text || a.title || '').slice(0, 50),
    })),
    adsHaveRealText: ads.filter((a) => String(a.text || a.title || '').length > 10).length,
    questionCount: record.questions?.length ?? 0,
    q0Type: q0?.type,
    q0OptionsCount: q0?.options?.length ?? 0,
    q0OptionsBare: (q0?.options || []).every(
      (o) => typeof o === 'object' && o.key && String(o.text).length <= 2,
    ),
    q0LastOption: q0?.options?.[q0.options.length - 1],
  };
}
