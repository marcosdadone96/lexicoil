#!/usr/bin/env node
/**
 * Fix audit-r5 findings 1–3; patch assembled e2/e3; stamp topicTag onto e1–e3 parts.
 *   node scripts/fix-audit-r5-schreiben-topics-2026-07-12.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const ASM = path.join(ROOT, 'batches/ready/assembled-from-verified');

const SIE_006_T1 = `Sie haben gerade eine neue Stadt entdeckt und möchten Ihrem Freund/Ihrer Freundin davon erzählen. Er/Sie hat Sie bei der Reiseplanung unterstützt.
Schreiben Sie eine E-Mail (circa 80 Wörter). Schreiben Sie etwas zu allen drei Punkten. Achten Sie auf Anrede und Gruß.

• Beschreiben Sie kurz Ihre Reise: Was haben Sie dort gemacht?
• Erklären Sie, was Ihnen besonders gut gefallen hat und warum.
• Schlagen Sie vor, wie Sie sich bald treffen können, um zusammen ein neues Hobby zu üben.`;

function patchSchreiben006() {
  const abs = path.join(POOL, 'schreiben-gemini-006.json');
  const b = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const q = (b.questions || []).find((x) => Number(x.teil) === 1);
  if (!q) throw new Error('006 T1 missing');
  const before = q.question;
  if (!/\bDu hast\b/.test(before)) {
    console.log('006: already Sie-form? skipping body replace');
  } else {
    q.question = SIE_006_T1;
  }
  b._auditR5DuFormFixedAt = new Date().toISOString();
  b._auditR5DuFormNote = 'T1 Du-Form → Sie-Form (Goethe B1 standard), audit r5 2026-07-12';
  fs.writeFileSync(abs, `${JSON.stringify(b, null, 2)}\n`);
  return { file: 'schreiben-gemini-006.json', beforeSnippet: before.slice(0, 80), afterSnippet: q.question.slice(0, 80) };
}

function patchSchreiben007() {
  const abs = path.join(POOL, 'schreiben-gemini-007.json');
  const b = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const q = (b.questions || []).find((x) => Number(x.teil) === 1);
  if (!q) throw new Error('007 T1 missing');
  const before = q.question;
  if (!/reisen wünscht/.test(before)) {
    console.log('007: no reisen wünscht — skip');
  } else {
    q.question = before
      .replace(
        'wohin Ihr Freund/Ihre Freundin gerne reisen wünscht und welches Bedürfnis er/sie hat',
        'wohin Ihr Freund/Ihre Freundin gerne reisen möchte und was er/sie sich wünscht',
      )
      .replace('• machen Sie einen Vorschlag', '• Machen Sie einen Vorschlag');
  }
  b._auditR5WuenschtFixedAt = new Date().toISOString();
  b._auditR5WuenschtNote =
    'reisen wünscht → reisen möchte (+ Bedürfnis → was … sich wünscht); bullet Machen Sie',
  fs.writeFileSync(abs, `${JSON.stringify(b, null, 2)}\n`);
  return {
    file: 'schreiben-gemini-007.json',
    hadWuenscht: /reisen wünscht/.test(before),
    afterHasMoechte: /reisen möchte/.test(q.question),
    snippet: (q.question.match(/• Fragen Sie[^\n]+/) || [])[0],
  };
}

function syncAssembledSchreiben(examN, poolFile) {
  const abs = path.join(ASM, `assembled-exam-b1-verified-e${examN}.json`);
  const doc = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const pool = JSON.parse(fs.readFileSync(path.join(POOL, poolFile), 'utf8'));
  const byTeil = new Map((pool.questions || []).map((q) => [Number(q.teil), q]));
  let n = 0;
  for (const part of doc.exam.schreibenParts || []) {
    const t = Number(part.teil);
    const q = byTeil.get(t);
    if (!q) continue;
    if (part.instruction !== q.question) {
      part.instruction = q.question;
      n++;
    }
    if (part.task !== q.question) {
      part.task = q.question;
      n++;
    }
    for (const pq of part.questions || []) {
      if (Number(pq.teil) === t || part.questions.length === 1) {
        if (pq.question !== q.question) {
          pq.question = q.question;
          n++;
        }
      }
    }
  }
  doc._meta = doc._meta || {};
  doc._meta.auditR5SchreibenSyncedAt = new Date().toISOString();
  fs.writeFileSync(abs, `${JSON.stringify(doc, null, 2)}\n`);
  return { exam: `e${examN}`, fieldsUpdated: n };
}

function stampTopicTagsOnAssembled() {
  const out = [];
  for (const n of [1, 2, 3]) {
    const abs = path.join(ASM, `assembled-exam-b1-verified-e${n}.json`);
    const doc = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const topics = doc._meta?.topics || {};
    let stamped = 0;
    const map = [
      ['lesenParts', 'lesen'],
      ['horenParts', 'horen'],
      ['schreibenParts', 'schreiben'],
      ['sprechenParts', 'sprechen'],
    ];
    for (const [arrKey, mod] of map) {
      for (const part of doc.exam[arrKey] || []) {
        const key = `${mod}_${part.teil}`;
        const tag = topics[key];
        if (tag && part.topicTag !== tag) {
          part.topicTag = tag;
          stamped++;
        }
      }
    }
    doc._meta.topicTagStampedOnPartsAt = new Date().toISOString();
    doc._meta.topicTagStampNote =
      'topicTag copied from _meta.topics onto each part (partRecordToExamPart now preserves it going forward)';
    fs.writeFileSync(abs, `${JSON.stringify(doc, null, 2)}\n`);
    out.push({ exam: `e${n}`, stamped });
  }
  return out;
}

const report = {
  generatedAt: new Date().toISOString(),
  schreiben006: patchSchreiben006(),
  schreiben007: patchSchreiben007(),
  assembledSync: [
    syncAssembledSchreiben(2, 'schreiben-gemini-006.json'),
    syncAssembledSchreiben(3, 'schreiben-gemini-007.json'),
  ],
  topicStamp: stampTopicTagsOnAssembled(),
};

const logPath = path.join(ROOT, 'batches/ready/gate-logs/audit-r5-fixes-2026-07-12.json');
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log('Wrote', path.relative(ROOT, logPath));
