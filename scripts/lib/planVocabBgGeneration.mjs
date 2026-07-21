/**
 * planVocabBgGeneration.mjs — pick cell + words combining user vocab and pool gaps.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';
import { foldLemma, loadVocabBankLemmaSet } from './vocabBank.mjs';
import { normalizeB1Topic } from './b1Topics.mjs';
import { pickScarcestTopic, loadPoolRecords, rankTopicGaps } from './poolGapPlanner.mjs';
import {
  pickTopicAlignedWeakWords,
  loadCoverageRegistry,
  refreshCoverageRegistry,
} from './coverageRegistry.mjs';

const require = createRequire(import.meta.url);
const { TOPIC_KEYWORDS } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

const MODULE_TEILS = {
  lesen: [1, 2, 3, 4, 5],
  horen: [1, 2, 3, 4],
};

function topicOverlapScore(userLemmas, topic) {
  const pool = new Set((TOPIC_KEYWORDS[topic] || []).map((w) => foldLemma(w)));
  let n = 0;
  for (const l of userLemmas) {
    if (pool.has(l)) n++;
  }
  return n;
}

function normalizeUserLemmas(pendingWords, lang = 'de', level = 'B1') {
  const bank = loadVocabBankLemmaSet(lang, level);
  const out = [];
  const seen = new Set();
  for (const p of pendingWords || []) {
    const raw = typeof p === 'string' ? p : p?.word;
    const lw = foldLemma(raw);
    if (!lw || !bank.has(lw) || seen.has(lw)) continue;
    seen.add(lw);
    out.push(lw);
  }
  return out;
}

function candidateTopics(userLemmas) {
  const scores = [];
  for (const topic of Object.keys(TOPIC_KEYWORDS)) {
    const overlap = topicOverlapScore(userLemmas, topic);
    if (overlap > 0) scores.push({ topic, overlap });
  }
  scores.sort((a, b) => b.overlap - a.overlap);
  // Prefer topics where ≥2 user lemmas align (bg anchor guarantee).
  const withTwo = scores.filter((s) => s.overlap >= 2);
  if (withTwo.length) return withTwo.map((s) => s.topic);
  if (scores.length) return scores.map((s) => s.topic);
  return Object.keys(TOPIC_KEYWORDS);
}

/** Pick ≥2 user anchor lemmas; topic-aligned pending words first. */
function pickUserAnchors(pendingLemmas, userSlice, topic, lang, level, min = 2) {
  const topicFromPending = wordsInTopic(
    pendingLemmas.map((w) => ({ word: w })),
    topic,
    lang,
    level,
    5,
  );
  const seen = new Set();
  const out = [];
  for (const w of [...topicFromPending, ...userSlice, ...pendingLemmas]) {
    const lw = foldLemma(w);
    if (!lw || seen.has(lw)) continue;
    seen.add(lw);
    out.push(lw);
    if (out.length >= min) break;
  }
  return out;
}

function weakBonus(registry, lemma) {
  const parts = registry?.globalCounts?.[lemma];
  if (parts == null) return 0;
  return parts < 3 ? 3 : 0;
}

function scoreCell({ module, teil, topic, userLemmas, registry, records, targetPerCell = 3 }) {
  const gaps = rankTopicGaps(records, module, teil, targetPerCell);
  const row = gaps.find((g) => g.topic === topic);
  const deficit = row?.deficit ?? 0;
  const overlap = topicOverlapScore(userLemmas, topic);
  let bonus = 0;
  for (const l of userLemmas) bonus += weakBonus(registry, l);
  return deficit * 10 + overlap * 5 + bonus;
}

function wordsInTopic(userLemmas, topic, lang, level, max = 5) {
  const pool = new Set((TOPIC_KEYWORDS[topic] || []).map((w) => foldLemma(w)));
  return userLemmas.filter((l) => pool.has(l)).slice(0, max);
}

/**
 * @param {{ pendingWords: object[], preferredModule?: string, lang?: string, level?: string }} ctx
 */
export function planVocabBgGeneration(ctx = {}) {
  const lang = ctx.lang || 'de';
  const level = ctx.level || 'B1';
  const userLemmas = normalizeUserLemmas(ctx.pendingWords, lang, level);
  const pendingLemmas = (ctx.pendingWords || [])
    .map((p) => foldLemma(typeof p === 'string' ? p : p?.word))
    .filter(Boolean);
  const topics = candidateTopics(userLemmas.length ? userLemmas : pendingLemmas);

  let registry = loadCoverageRegistry(lang, level);
  if (!registry?.weakDetail?.length) {
    registry = refreshCoverageRegistry(lang, level);
  }
  const records = loadPoolRecords(lang, level);

  const modules = ctx.preferredModule
    ? [ctx.preferredModule]
    : ['lesen', 'horen'];

  let best = null;
  for (const module of modules) {
    const teils = MODULE_TEILS[module] || [];
    for (const teil of teils) {
      for (const topic of topics.slice(0, 12)) {
        const score = scoreCell({
          module,
          teil,
          topic,
          userLemmas,
          registry,
          records,
        });
        if (!best || score > best.score) {
          best = { module, teil, topic, score };
        }
      }
    }
  }

  if (!best) {
    const module = ctx.preferredModule || 'lesen';
    const teil = module === 'horen' ? 2 : 2;
    best = {
      module,
      teil,
      topic: pickScarcestTopic(records, module, teil, { targetPerCell: 3 }),
      score: 0,
    };
  }

  const topic = normalizeB1Topic(best.topic);
  const userSlice = wordsInTopic(userLemmas, topic, lang, level, 5);
  const goal = 8;
  const gapCount = Math.max(0, goal - userSlice.length);
  let gapWords = [];
  if (gapCount > 0) {
    const picked = pickTopicAlignedWeakWords({
      lang,
      level,
      topic,
      count: gapCount,
      cursor: ctx.vocabCursor || 0,
    });
    gapWords = picked.words || [];
  }

  const merged = [];
  const used = new Set();
  for (const w of userSlice) {
    if (!used.has(w)) {
      merged.push(w);
      used.add(w);
    }
  }
  for (const w of gapWords) {
    if (!used.has(w) && merged.length < goal) {
      merged.push(w);
      used.add(w);
    }
  }

  if (userSlice.length < 3 && pendingLemmas.length >= 2) {
    const anchor = pickUserAnchors(pendingLemmas, userSlice, topic, lang, level, 2);
    const rest = merged.filter((w) => !anchor.includes(w));
    const final = [...anchor, ...rest].slice(0, goal);
    return {
      module: best.module,
      teil: best.teil,
      topic,
      words: final,
      userAnchor: anchor,
      score: best.score,
      vocabCursor: (ctx.vocabCursor || 0) + gapWords.length,
    };
  }

  const anchorFromSlice = pickUserAnchors(pendingLemmas, userSlice, topic, lang, level, 2);
  return {
    module: best.module,
    teil: best.teil,
    topic,
    words: merged.slice(0, goal),
    userAnchor: anchorFromSlice.length >= 2 ? anchorFromSlice : userSlice,
    score: best.score,
    vocabCursor: (ctx.vocabCursor || 0) + gapWords.length,
  };
}
