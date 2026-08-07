/**
 * B2 Lesen T1 — banco de textos desacoplado (Fase A: solo pasajes, Fase B: preguntas sobre texto fijo).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';
import { GOETHE_B2_INSTRUCTIONS } from './goethe-b2-modellsatz.mjs';

export const B2_LESEN_TEXT_BANK_DIR = path.join(ROOT, 'batches/ready/lesen-text-bank/B2');

export function ensureB2LesenTextBankDir() {
  fs.mkdirSync(B2_LESEN_TEXT_BANK_DIR, { recursive: true });
}

export function textBankPathForBasename(basename) {
  return path.join(B2_LESEN_TEXT_BANK_DIR, basename.endsWith('.json') ? basename : `${basename}.json`);
}

export function saveB2ForumTextBank(batch, opts = {}) {
  ensureB2LesenTextBankDir();
  const slug = opts.slug || batch._textBankSlug || batch.topicTag || 'forum';
  const base = opts.basename || `lesen-t1-forum-${slug}-${batch._textBankId || Date.now()}.json`;
  const fp = textBankPathForBasename(base);
  const payload = {
    schemaVersion: 1,
    level: 'B2',
    module: 'lesen',
    teil: 1,
    format: 'forum_matching',
    instruction: GOETHE_B2_INSTRUCTIONS.lesen[0],
    topicTag: batch.topicTag || batch._requestedTopic || opts.topic || null,
    passages: batch.passages || [],
    questions: [],
    _textBankPhase: 'passage',
    _savedAt: new Date().toISOString(),
    _sourceFile: batch._sourceFile || null,
  };
  fs.writeFileSync(fp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return fp;
}

export function loadB2ForumTextBank(filePath) {
  const fp = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(fp)) throw new Error(`Text bank no encontrado: ${fp}`);
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  if (!Array.isArray(data.passages) || data.passages.length !== 4) {
    throw new Error(`Text bank B2 T1: se esperan 4 passages (tiene ${data.passages?.length ?? 0})`);
  }
  return { ...data, _textBankPath: fp };
}

export function remapB2ForumQuestionPassageIds(passages, questions) {
  const byKey = new Map(
    (passages || []).map((p) => [String(p.personKey || '').toUpperCase(), p.id]),
  );
  return (questions || []).map((q) => {
    const ans = String(q.correctAnswer ?? q.correct ?? '').toUpperCase();
    const pid = byKey.get(ans);
    if (pid && /^[ABCD]$/.test(ans)) {
      return { ...q, passageId: pid };
    }
    return q;
  });
}

export function mergeB2ForumQuestions(textBank, questionsBatch, opts = {}) {
  const passages = textBank.passages;
  const rawQs = questionsBatch.questions || [];
  const remapped = remapB2ForumQuestionPassageIds(passages, rawQs);
  const qs = remapped.map((q, i) => ({
    ...q,
    module: 'lesen',
    teil: 1,
    level: 'B2',
    lang: q.lang || 'de',
    type: q.type || 'matching',
    question:
      i === 0 && !String(q.question || '').includes('Lesen Sie in einem Forum')
        ? `${GOETHE_B2_INSTRUCTIONS.lesen[0]}\n\n${q.question || ''}`.trim()
        : q.question,
  }));
  return {
    passages,
    questions: qs,
    topicTag: textBank.topicTag || questionsBatch.topicTag,
    _requestedTopic: textBank.topicTag || questionsBatch._requestedTopic,
    _textBankPath: textBank._textBankPath,
    _textBankPhase: 'merged',
    _mergedAt: new Date().toISOString(),
    ...opts.meta,
  };
}

export function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Validación determinista Fase A (sin preguntas). */
export function validateB2ForumPassageBank(batch) {
  const issues = [];
  const ps = batch.passages || [];
  if (ps.length !== 4) issues.push(`Fase A: se esperan 4 passages (tiene ${ps.length})`);
  const labels = ['A', 'B', 'C', 'D'];
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const w = countWords(p.text);
    if (w < 80 || w > 180) {
      issues.push(`Person ${labels[i]}: ${w} Wörter (zulässig 80–180)`);
    }
    const blob = `${p.title || ''} ${p.text || ''}`;
    if (!/\b(ich|mir|meine|mich|mein)\b/i.test(blob) && !/\b(sie|er|man)\b/i.test(blob)) {
      issues.push(`Person ${labels[i]}: Foro-Beitrag ohne erkennbare Perspektive`);
    }
  }
  if ((batch.questions || []).length > 0) {
    issues.push('Fase A: questions debe estar vacío');
  }
  return { ok: issues.length === 0, issues };
}
