#!/usr/bin/env node
/**
 * Backfill B1 topicTags on library/de/B1/questions.json for legacy daily_life / unmapped.
 *
 *   node scripts/backfill-bank-topic-tags.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { detectTopic, B1_TOPICS } from './lib/topicRotation.mjs';
import { normalizeB1Topic as normTopic } from './lib/b1Topics.mjs';

const BANK = path.join(ROOT, 'library/de/B1/questions.json');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/bank-topic-backfill.json');
const DRY = process.argv.includes('--dry-run');

function isLegacyOrMissing(tags) {
  if (!tags?.length) return true;
  return tags.every((t) => !normTopic(t));
}

function pickTopic(passage, questions) {
  const blob = [passage.title, passage.text, ...(questions || []).map((q) => q.question)]
    .filter(Boolean)
    .join('\n');
  const hit = detectTopic(blob);
  if (hit && B1_TOPICS.includes(hit)) return hit;
  // fallback: score via detect on passage only
  const pHit = detectTopic(`${passage.title || ''}\n${passage.text || ''}`);
  return pHit && B1_TOPICS.includes(pHit) ? pHit : 'Freizeit';
}

function main() {
  const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
  const byPassage = new Map(bank.passages.map((p) => [p.id, { passage: p, questions: [] }]));
  for (const q of bank.questions) {
    const row = byPassage.get(q.passageId);
    if (row) row.questions.push(q);
  }

  const changes = [];
  let touchedPassages = 0;
  let touchedQuestions = 0;
  const hist = Object.fromEntries(B1_TOPICS.map((t) => [t, 0]));

  for (const [pid, row] of byPassage) {
    const tags = row.questions.flatMap((q) => q.topicTags || []);
    if (!isLegacyOrMissing(tags) && row.questions.every((q) => normTopic((q.topicTags || [])[0]))) {
      // already canonical on all questions
      const t = normTopic(row.questions[0]?.topicTags?.[0]);
      if (t) hist[t] = (hist[t] || 0) + 1;
      continue;
    }
    const topic = pickTopic(row.passage, row.questions);
    hist[topic] = (hist[topic] || 0) + 1;
    touchedPassages++;
    const before = [...new Set(tags)];
    if (!DRY) {
      row.passage.topicTag = topic;
      for (const q of row.questions) {
        q.topicTags = [topic];
        touchedQuestions++;
      }
    } else {
      touchedQuestions += row.questions.length;
    }
    changes.push({
      passageId: pid,
      teil: row.questions[0]?.teil ?? null,
      module: row.passage.module,
      before,
      after: topic,
      questions: row.questions.length,
    });
  }

  if (!DRY) {
    if (bank.meta) {
      bank.meta.version = (Number(bank.meta.version) || 0) + 1;
      bank.meta.updatedAt = new Date().toISOString();
      bank.meta.lastTopicBackfill = new Date().toISOString();
    }
    fs.writeFileSync(BANK, `${JSON.stringify(bank, null, 2)}\n`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: DRY ? 'DRY-RUN' : 'APPLY',
    touchedPassages,
    touchedQuestions,
    histogram: hist,
    changes,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    mode: report.mode,
    touchedPassages,
    touchedQuestions,
    histogram: hist,
    sample: changes.slice(0, 12),
  }, null, 2));
  console.log(DRY ? '\n(dry-run — bank untouched)' : `\nWROTE ${BANK}`);
}

main();
