#!/usr/bin/env node
/**
 * Re-scan published bank + served exam with current tools (read-only).
 *   node scripts/scan-bank-current-gates.mjs
 *
 * Covers: topic_mismatch (improved), literal copy ≥4, verb_census V2.
 * Also refreshes AUD-4/4b counts for context.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { normalizeB1Topic } from './lib/b1Topics.mjs';
import {
  checkPassageContentTopic,
  scorePassageTopics,
} from './lib/qualityGates/contentTopicCheck.mjs';
import { hasLongLiteralOverlap } from './lib/lesenBatchQuality.mjs';
import {
  decapitalizeMidSentence,
} from './lib/capitalizeNouns.mjs';

const BANK = path.join(ROOT, 'library/de/B1/questions.json');
const SERVED = path.join(ROOT, 'data/exams/de_B1.json');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/bank-current-gates-scan.json');
const OUT_MD = path.join(ROOT, 'batches/ready/gate-logs/BANK-CURRENT-GATES-SCAN.md');

const BOLD_RE = /\*\*[^*\n]{1,200}\*\*/g;
const BULLET_RE = /(?:^|\n)(\s*)[*-]\s+(?=\S)/g;

const V2_LEMMAS = new Set([
  'essen', 'kochen', 'wissen', 'besuchen', 'unternehmen', 'spielen', 'berichten',
  'arbeiten', 'glauben', 'glaube', 'glaubst', 'glaubt', 'folgen', 'stellen', 'raten',
  'gärtnern', 'waschen', 'zahlen',
]);

function modeTopic(tags) {
  const counts = new Map();
  for (const t of tags) {
    const n = normalizeB1Topic(t);
    if (!n) continue;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  let best = null;
  let n = 0;
  for (const [k, v] of counts) {
    if (v > n) {
      best = k;
      n = v;
    }
  }
  return best;
}

function correctOptionText(q) {
  const letter = String(q.correctAnswer || q.correct || '')
    .toLowerCase()
    .replace(/[^a-d]/g, '');
  if (!letter) return '';
  const opts = q.options || [];
  for (const o of opts) {
    if (typeof o === 'string') {
      if (o.toLowerCase().trim().startsWith(`${letter})`)) {
        return o.replace(/^[a-d]\)\s*/i, '');
      }
    } else if (o && typeof o === 'object') {
      const key = String(o.key || o.letter || '').toLowerCase();
      if (key === letter || key === letter.toUpperCase()) return String(o.text || o.body || '');
      const t = String(o.text || '');
      if (t.toLowerCase().trim().startsWith(`${letter})`)) return t.replace(/^[a-d]\)\s*/i, '');
    }
  }
  // served format sometimes uses A/B/C keys with correct 'b'
  for (const o of opts) {
    if (o && typeof o === 'object') {
      const key = String(o.key || '').toLowerCase();
      if (key === letter) return String(o.text || '');
    }
  }
  return '';
}

function scanV2InText(text, ctx) {
  const hits = [];
  if (typeof text !== 'string' || !text) return hits;
  // Use normalize dry-run: if decap changes a V2 lemma, count it
  const { result, count } = decapitalizeMidSentence(text);
  if (!count || result === text) return hits;
  // Find token-level V2 changes by comparing
  const a = text.match(/[A-Za-zÄÖÜäöüß]+/g) || [];
  const b = result.match(/[A-Za-zÄÖÜäöüß]+/g) || [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) continue;
    const lc = b[i].toLowerCase();
    if (!V2_LEMMAS.has(lc)) continue;
    if (a[i][0] === a[i][0].toUpperCase() && b[i] === lc) {
      hits.push({
        ...ctx,
        from: a[i],
        to: b[i],
        snippet: text.slice(Math.max(0, text.indexOf(a[i]) - 30), text.indexOf(a[i]) + a[i].length + 30).replace(/\n/g, '\\n'),
      });
    }
  }
  return hits;
}

function scanBank(bank) {
  const byPassage = new Map();
  for (const p of bank.passages || []) {
    byPassage.set(p.id, {
      passage: p,
      questions: [],
      topicTags: [],
    });
  }
  for (const q of bank.questions || []) {
    const row = byPassage.get(q.passageId);
    if (!row) continue;
    row.questions.push(q);
    for (const t of q.topicTags || []) row.topicTags.push(t);
  }

  const topic = [];
  const copy = [];
  const v2 = [];
  const aud4 = [];
  const aud4b = [];

  for (const [pid, row] of byPassage) {
    const p = row.passage;
    const tag = modeTopic(row.topicTags);
    const teil = row.questions[0]?.teil ?? null;
    const text = p.text || '';

    // AUD-4/4b
    BOLD_RE.lastIndex = 0;
    let m;
    let boldN = 0;
    while ((m = BOLD_RE.exec(text)) !== null) boldN++;
    if (boldN) aud4.push({ id: pid, teil, module: p.module, boldCount: boldN });
    BULLET_RE.lastIndex = 0;
    let bulletN = 0;
    while ((m = BULLET_RE.exec(text)) !== null) bulletN++;
    if (bulletN) aud4b.push({ id: pid, teil, module: p.module, bulletCount: bulletN });

    // Topic
    if (tag) {
      const check = checkPassageContentTopic({ ...p, topicTag: tag });
      if (check.mismatch) {
        const scored = scorePassageTopics({ ...p, topicTag: tag }, tag);
        topic.push({
          id: pid,
          teil,
          tag,
          detected: check.detected,
          reason: check.reason,
          scores: scored.scores,
          detail: check.detail,
        });
      }
    } else {
      topic.push({ id: pid, teil, tag: null, reason: 'no_topicTag', detail: 'sin topicTags en preguntas enlazadas' });
    }

    // Copy ≥4 on MCQ correct options / RF statements
    for (const q of row.questions) {
      if (q.type === 'richtig_falsch' || q.type === 'true_false') {
        const lit = hasLongLiteralOverlap(q.question, text, 4);
        if (lit) {
          copy.push({
            passageId: pid,
            questionId: q.id,
            teil: q.teil,
            kind: 'statement',
            overlap: lit,
            text: q.question,
          });
        }
      } else {
        const opt = correctOptionText(q);
        if (opt) {
          const lit = hasLongLiteralOverlap(opt, text, 4);
          if (lit) {
            copy.push({
              passageId: pid,
              questionId: q.id,
              teil: q.teil,
              kind: 'correct_option',
              overlap: lit,
              text: opt,
            });
          }
        }
        const qLit = hasLongLiteralOverlap(q.question, text, 4);
        if (qLit) {
          copy.push({
            passageId: pid,
            questionId: q.id,
            teil: q.teil,
            kind: 'question',
            overlap: qLit,
            text: q.question,
          });
        }
      }
    }

    // V2
    v2.push(...scanV2InText(text, { id: pid, field: 'passage.text', teil }));
    v2.push(...scanV2InText(p.title, { id: pid, field: 'passage.title', teil }));
    for (const q of row.questions) {
      v2.push(...scanV2InText(q.question, { id: q.id, field: 'question', teil: q.teil, passageId: pid }));
      v2.push(...scanV2InText(q.explanation, { id: q.id, field: 'explanation', teil: q.teil, passageId: pid }));
      for (const [oi, opt] of (q.options || []).entries()) {
        const t = typeof opt === 'string' ? opt : opt?.text || '';
        v2.push(...scanV2InText(t, { id: q.id, field: `options[${oi}]`, teil: q.teil, passageId: pid }));
      }
    }
  }

  return {
    passages: bank.passages.length,
    questions: bank.questions.length,
    aud4_passages: aud4.length,
    aud4b_passages: aud4b.length,
    aud4,
    aud4b,
    topic_mismatch: topic.filter((t) => t.reason !== 'no_topicTag'),
    topic_missing_tag: topic.filter((t) => t.reason === 'no_topicTag'),
    copy_literal: copy,
    verb_census_v2: v2,
  };
}

function scanServed(exams) {
  const topic = [];
  const copy = [];
  const v2 = [];
  const aud4 = [];
  const aud4b = [];

  for (const exam of exams) {
    for (const part of exam.lesenParts || []) {
      const text = part.text || '';
      const title = part.textTitle || '';
      const pid = part.passageId || `served-t${part.teil}`;
      const tag = modeTopic(
        (part.questions || []).flatMap((q) => q.topicTags || part.topicTags || []),
      ) || normalizeB1Topic(part.topicTag) || normalizeB1Topic(exam.topic);

      BOLD_RE.lastIndex = 0;
      let m;
      let boldN = 0;
      while ((m = BOLD_RE.exec(text)) !== null) boldN++;
      if (boldN) aud4.push({ examId: exam.examId, teil: part.teil, passageId: pid, boldCount: boldN });
      BULLET_RE.lastIndex = 0;
      let bulletN = 0;
      while ((m = BULLET_RE.exec(text)) !== null) bulletN++;
      if (bulletN) aud4b.push({ examId: exam.examId, teil: part.teil, passageId: pid, bulletCount: bulletN });

      if (tag) {
        const check = checkPassageContentTopic({ id: pid, title, text, topicTag: tag });
        if (check.mismatch) {
          topic.push({
            examId: exam.examId,
            teil: part.teil,
            passageId: pid,
            tag,
            detected: check.detected,
            reason: check.reason,
            detail: check.detail,
          });
        }
      }

      for (const q of part.questions || []) {
        const opt = correctOptionText(q);
        if (opt) {
          const lit = hasLongLiteralOverlap(opt, text, 4);
          if (lit) {
            copy.push({
              examId: exam.examId,
              teil: part.teil,
              questionId: q.id,
              kind: 'correct_option',
              overlap: lit,
              text: opt,
            });
          }
        }
        const qLit = hasLongLiteralOverlap(q.question, text, 4);
        if (qLit && (q.type === 'richtig_falsch' || q.type === 'true_false' || !opt)) {
          copy.push({
            examId: exam.examId,
            teil: part.teil,
            questionId: q.id,
            kind: q.type === 'richtig_falsch' ? 'statement' : 'question',
            overlap: qLit,
            text: q.question,
          });
        } else if (qLit && opt) {
          // still record question copy for MCQ
          copy.push({
            examId: exam.examId,
            teil: part.teil,
            questionId: q.id,
            kind: 'question',
            overlap: qLit,
            text: q.question,
          });
        }
        v2.push(...scanV2InText(q.question, { examId: exam.examId, id: q.id, field: 'question', teil: part.teil }));
        v2.push(...scanV2InText(q.explanation, { examId: exam.examId, id: q.id, field: 'explanation', teil: part.teil }));
        for (const [oi, o] of (q.options || []).entries()) {
          const t = typeof o === 'string' ? o : o?.text || '';
          v2.push(...scanV2InText(t, { examId: exam.examId, id: q.id, field: `options[${oi}]`, teil: part.teil }));
        }
      }
      v2.push(...scanV2InText(text, { examId: exam.examId, id: pid, field: 'text', teil: part.teil }));
      v2.push(...scanV2InText(title, { examId: exam.examId, id: pid, field: 'textTitle', teil: part.teil }));
    }
  }

  return { topic_mismatch: topic, copy_literal: copy, verb_census_v2: v2, aud4, aud4b };
}

function renderMd(report) {
  const b = report.bank;
  const s = report.served;
  const lines = [
    '# Bank + served — current gates scan (dry-run)',
    '',
    `**Fecha:** ${report.generatedAt}`,
    '',
    '## Banco `library/de/B1/questions.json`',
    '',
    `| Métrica | Valor |`,
    `|---|---:|`,
    `| Pasajes / preguntas | ${b.passages} / ${b.questions} |`,
    `| AUD-4 bold (pasajes) | ${b.aud4_passages} |`,
    `| AUD-4b bullets (pasajes) | ${b.aud4b_passages} |`,
    `| topic_mismatch | ${b.topic_mismatch.length} |`,
    `| sin topicTag derivable | ${b.topic_missing_tag.length} |`,
    `| copia literal ≥4 | ${b.copy_literal.length} |`,
    `| verb_census V2 | ${b.verb_census_v2.length} |`,
    '',
    '### topic_mismatch (muestra)',
    '',
  ];
  for (const t of b.topic_mismatch.slice(0, 15)) {
    lines.push(`- \`${t.id}\` T${t.teil} tag=${t.tag} → ${t.detected || t.reason}`);
  }
  if (!b.topic_mismatch.length) lines.push('_Ninguno_');
  lines.push('', '### copia literal ≥4 (muestra)', '');
  for (const c of b.copy_literal.slice(0, 20)) {
    lines.push(`- \`${c.questionId}\` T${c.teil} [${c.kind}] «${c.overlap}»`);
  }
  if (!b.copy_literal.length) lines.push('_Ninguno_');
  lines.push('', '### verb_census V2 (muestra)', '');
  for (const v of b.verb_census_v2.slice(0, 15)) {
    lines.push(`- \`${v.id}\` ${v.field}: ${v.from}→${v.to}`);
  }
  if (!b.verb_census_v2.length) lines.push('_Ninguno_');

  lines.push('', '## Servido `data/exams/de_B1.json`', '');
  lines.push(`| Métrica | Valor |`);
  lines.push(`|---|---:|`);
  lines.push(`| AUD-4 bold parts | ${s.aud4.length} |`);
  lines.push(`| AUD-4b bullets | ${s.aud4b.length} |`);
  lines.push(`| topic_mismatch | ${s.topic_mismatch.length} |`);
  lines.push(`| copia literal ≥4 | ${s.copy_literal.length} |`);
  lines.push(`| verb_census V2 | ${s.verb_census_v2.length} |`);
  lines.push('');
  for (const c of s.copy_literal.slice(0, 15)) {
    lines.push(`- \`${c.questionId}\` T${c.teil} [${c.kind}] «${c.overlap}»`);
  }
  if (!s.copy_literal.length) lines.push('_Ninguna copia literal_');
  lines.push('');
  for (const t of s.topic_mismatch) {
    lines.push(`- topic: T${t.teil} ${t.tag}→${t.detected} (${t.reason})`);
  }
  return lines.join('\n');
}

function main() {
  const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
  const served = JSON.parse(fs.readFileSync(SERVED, 'utf8'));
  const report = {
    generatedAt: new Date().toISOString(),
    bank: scanBank(bank),
    served: scanServed(served),
  };
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(OUT_MD, `${renderMd(report)}\n`);
  console.log(renderMd(report));
  console.log(`\nJSON: ${path.relative(ROOT, OUT)}`);
}

main();
