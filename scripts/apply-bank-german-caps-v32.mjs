#!/usr/bin/env node
/**
 * AUD-4/4b dry-run/apply on library/de/B1/questions.json (never touch by hand).
 *
 * Default: SELECTIVE — only passages with **bold** or line-start * / - bullets
 * (the 16 AUD-4 / 4 AUD-4b set), plus their linked questions if those fields
 * also contain markdown.
 *
 *   node scripts/apply-bank-german-caps-v32.mjs              # dry-run selective
 *   node scripts/apply-bank-german-caps-v32.mjs --all        # dry-run full bank
 *   node scripts/apply-bank-german-caps-v32.mjs --apply      # WRITE (requires confirm)
 *
 * Does NOT modify data/exams/de_B1.json (served is republished separately).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';

const BANK = path.join(ROOT, 'library/de/B1/questions.json');
const OUT_JSON = path.join(ROOT, 'batches/ready/gate-logs/bank-aud4-caps-dryrun.json');
const OUT_MD = path.join(ROOT, 'batches/ready/gate-logs/BANK-AUD4-CAPS-DRYRUN.md');

const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');

const BOLD_RE = /\*\*[^*\n]{1,200}\*\*/;
const BULLET_RE = /(?:^|\n)\s*[*-]\s+\S/;

function hasMarkdown(text) {
  return typeof text === 'string' && (BOLD_RE.test(text) || BULLET_RE.test(text));
}

function normalizeViaBatch(fields) {
  // Build a synthetic batch so we use the exact pipeline (markdown + decapOnly).
  const batch = {
    passages: [{ id: 'p', text: fields.text || '', title: fields.title || '', transcript: fields.transcript || '' }],
    questions: (fields.questions || []).map((q, i) => ({
      id: q.id || `q${i}`,
      question: q.question || '',
      explanation: q.explanation || '',
      options: q.options || [],
      signText: q.signText || '',
    })),
  };
  const { batch: out, stats, changes } = applyGermanCapsNormalize(batch, { decapOnly: true });
  return { out, stats, changes };
}

function main() {
  const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
  const affectedPassageIds = new Set();
  for (const p of bank.passages || []) {
    if (ALL || hasMarkdown(p.text) || hasMarkdown(p.title) || hasMarkdown(p.transcript)) {
      affectedPassageIds.add(p.id);
    }
  }

  const changes = [];
  const passageRows = [];

  for (const p of bank.passages || []) {
    if (!affectedPassageIds.has(p.id)) continue;
    const linkedQs = (bank.questions || []).filter((q) => q.passageId === p.id);
    const qFields = linkedQs
      .filter((q) =>
        ALL ||
        hasMarkdown(q.question) ||
        hasMarkdown(q.explanation) ||
        (q.options || []).some((o) => hasMarkdown(typeof o === 'string' ? o : o?.text)),
      )
      .map((q) => ({
        id: q.id,
        question: q.question,
        explanation: q.explanation,
        options: (q.options || []).map((o) => (typeof o === 'string' ? o : o?.text || '')),
        signText: q.signText,
        _ref: q,
      }));

    const { out, stats, changes: ch } = normalizeViaBatch({
      text: p.text,
      title: p.title,
      transcript: p.transcript,
      questions: qFields,
    });

    const beforeText = p.text;
    const afterText = out.passages[0].text;
    const beforeTitle = p.title || '';
    const afterTitle = out.passages[0].title || '';

    if (beforeText !== afterText || beforeTitle !== afterTitle || stats.markdownFixed || stats.decapFixed) {
      passageRows.push({
        id: p.id,
        module: p.module,
        markdownFixed: stats.markdownFixed,
        decapFixed: stats.decapFixed,
        fieldsChanged: stats.fieldsChanged,
        textChanged: beforeText !== afterText,
        titleChanged: beforeTitle !== afterTitle,
        previewBefore: beforeText.slice(0, 120).replace(/\n/g, '\\n'),
        previewAfter: afterText.slice(0, 120).replace(/\n/g, '\\n'),
        tokenChanges: ch.filter((c) => c.kind === 'token').slice(0, 20),
      });
    }

    for (const c of ch) {
      changes.push({ passageId: p.id, ...c });
    }

    if (APPLY) {
      p.text = afterText;
      if (p.title != null) p.title = afterTitle;
      if (p.transcript != null) p.transcript = out.passages[0].transcript;
      for (let i = 0; i < qFields.length; i++) {
        const ref = qFields[i]._ref;
        const nq = out.questions[i];
        if (nq.question != null) ref.question = nq.question;
        if (nq.explanation != null) ref.explanation = nq.explanation;
        if (nq.signText != null && ref.signText != null) ref.signText = nq.signText;
        if (Array.isArray(nq.options) && Array.isArray(ref.options)) {
          for (let oi = 0; oi < ref.options.length; oi++) {
            if (typeof ref.options[oi] === 'string') ref.options[oi] = nq.options[oi];
            else if (ref.options[oi] && typeof ref.options[oi] === 'object') {
              ref.options[oi].text = nq.options[oi];
            }
          }
        }
      }
    }
  }

  if (APPLY) {
    if (bank.meta) {
      bank.meta.version = (Number(bank.meta.version) || 0) + 1;
      bank.meta.updatedAt = new Date().toISOString();
      bank.meta.lastCapsNormalize = 'v3.2-stable-aud4-selective';
    }
    fs.writeFileSync(BANK, `${JSON.stringify(bank, null, 2)}\n`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'APPLY' : 'DRY-RUN',
    scope: ALL ? 'all-passages' : 'selective-aud4',
    affectedPassages: affectedPassageIds.size,
    passagesWithChanges: passageRows.length,
    totalTokenOrFieldChanges: changes.length,
    passageRows,
    sampleChanges: changes.slice(0, 80),
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);

  const md = [
    `# Bank AUD-4/4b caps dry-run`,
    '',
    `**Fecha:** ${report.generatedAt}`,
    `**Modo:** ${report.mode} · scope=${report.scope}`,
    `**Pasajes en scope:** ${report.affectedPassages}`,
    `**Pasajes con cambios:** ${report.passagesWithChanges}`,
    '',
    '| Passage | md | decap | textΔ | preview |',
    '|---|---:|---:|---|---|',
  ];
  for (const r of passageRows) {
    md.push(
      `| \`${r.id}\` | ${r.markdownFixed} | ${r.decapFixed} | ${r.textChanged ? 'yes' : 'no'} | ${r.previewAfter.slice(0, 60)}… |`,
    );
  }
  md.push('', `JSON: \`${path.relative(ROOT, OUT_JSON)}\``);
  if (!APPLY) md.push('', '_Dry-run only — no writes. Re-run with `--apply` to write bank._');
  fs.writeFileSync(OUT_MD, `${md.join('\n')}\n`);

  console.log(md.join('\n'));
  if (APPLY) console.log(`\nWROTE ${BANK}`);
  else console.log('\n(dry-run — bank untouched)');
}

main();
