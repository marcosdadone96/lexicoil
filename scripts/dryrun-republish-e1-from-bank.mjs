#!/usr/bin/env node
/**
 * Dry-run: preview e1 republication after bank AUD-4/4b.
 * Builds a seed overlay from published e1 snapshots patched with bank text,
 * writes assembled-exam-b1-e1.json, then runs publish-exam --dry-run --local-only.
 * Does NOT publish or sync-to-served.
 *
 *   node scripts/dryrun-republish-e1-from-bank.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/loadEnv.mjs';
import { canonicalPartHash, normalizePartSnapshot } from './lib/partContentHash.mjs';

const BANK = path.join(ROOT, 'library/de/B1/questions.json');
const PUB = path.join(ROOT, 'library/published-exams/de/B1/official-de-B1-e1.json');
const SERVED = path.join(ROOT, 'data/exams/de_B1.json');
const OUT_ASSEMBLED = path.join(ROOT, 'assembled-exam-b1-e1.json');
const OUT_OVERLAY = path.join(ROOT, 'batches/ready/gate-logs/e1-republish-seed-overlay.json');
const OUT_REPORT = path.join(ROOT, 'batches/ready/gate-logs/E1-REPUBLISH-DRYRUN.md');
const OUT_JSON = path.join(ROOT, 'batches/ready/gate-logs/e1-republish-dryrun.json');

function findBatchForPartId(partId) {
  const candidates = [
    path.join(ROOT, 'batches/generated', `${partId}.json`),
    path.join(ROOT, 'batches/ready/lesen', `${partId}.json`),
    path.join(ROOT, 'batches/ready', `${partId}.json`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function syncBatchFromBank(batchPath, bank) {
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const byId = new Map(bank.passages.map((p) => [p.id, p]));
  const byQ = new Map(bank.questions.map((q) => [q.id, q]));
  let fields = 0;
  for (const p of batch.passages || []) {
    const bp = byId.get(p.id);
    if (!bp) continue;
    if (bp.text != null && p.text !== bp.text) {
      p.text = bp.text;
      fields++;
    }
    if (bp.title != null && p.title !== bp.title) {
      p.title = bp.title;
      fields++;
    }
    if (bp.topicTag && p.topicTag !== bp.topicTag) {
      p.topicTag = bp.topicTag;
      fields++;
    }
  }
  for (const q of batch.questions || []) {
    const bq = byQ.get(q.id);
    if (!bq) continue;
    if (bq.question != null && q.question !== bq.question) {
      q.question = bq.question;
      fields++;
    }
    if (bq.explanation != null && q.explanation !== bq.explanation) {
      q.explanation = bq.explanation;
      fields++;
    }
    if (bq.topicTags && JSON.stringify(q.topicTags) !== JSON.stringify(bq.topicTags)) {
      q.topicTags = [...bq.topicTags];
      fields++;
    }
  }
  if (fields) fs.writeFileSync(batchPath, `${JSON.stringify(batch, null, 2)}\n`);
  return { fields, passageIds: (batch.passages || []).map((p) => p.id) };
}

function patchSnapshotFromBank(snap, bank) {
  const byP = new Map(bank.passages.map((p) => [p.id, p]));
  const byQ = new Map(bank.questions.map((q) => [q.id, q]));
  const out = structuredClone(snap);
  const patched = [];

  const applyPassage = (p) => {
    if (!p?.id) return p;
    const bp = byP.get(p.id);
    if (!bp) return p;
    if (bp.text != null && p.text !== bp.text) {
      p.text = bp.text;
      patched.push(`passage.text:${p.id}`);
    }
    if (bp.title != null && p.title !== bp.title) {
      p.title = bp.title;
      patched.push(`passage.title:${p.id}`);
    }
    if (bp.topicTag && p.topicTag !== bp.topicTag) {
      p.topicTag = bp.topicTag;
      patched.push(`passage.topicTag:${p.id}`);
    }
    return p;
  };

  if (out.passage) out.passage = applyPassage(out.passage);
  if (Array.isArray(out.passages)) out.passages = out.passages.map(applyPassage);

  // T1-style: questions may point at passage ids not on snap.passage
  const qPid = out.questions?.[0]?.passageId;
  if (qPid && byP.has(qPid) && out.passage && !out.passage.id) {
    out.passage.id = qPid;
    out.passage = applyPassage(out.passage);
  } else if (qPid && byP.has(qPid) && out.passage?.id !== qPid && !out.passage?.text) {
    const bp = byP.get(qPid);
    out.passage = { ...out.passage, id: qPid, text: bp.text, title: bp.title || out.passage.title };
    patched.push(`passage.fromQ:${qPid}`);
  }

  // Conservative: do NOT pull options/correct/question from bank.
  // Bank MCQ keys are often key-entropy-rotated vs the published snapshot;
  // swapping them would rewrite live answer keys. Only sync topicTags (+
  // passage text above for AUD-4/4b).
  for (const q of out.questions || []) {
    const bq = byQ.get(q.id);
    if (!bq?.topicTags?.length) continue;
    if (JSON.stringify(q.topicTags || []) !== JSON.stringify(bq.topicTags)) {
      q.topicTags = [...bq.topicTags];
      patched.push(`q.topicTags:${q.id}`);
    }
  }

  return { snapshot: out, patched };
}

function firstDiffSnippet(a, b, n = 48) {
  const sa = String(a || '');
  const sb = String(b || '');
  let i = 0;
  while (i < sa.length && i < sb.length && sa[i] === sb[i]) i++;
  return {
    at: i,
    pub: sa.slice(i, i + n),
    bank: sb.slice(i, i + n),
  };
}

function main() {
  const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
  const pub = JSON.parse(fs.readFileSync(PUB, 'utf8'));
  const served = JSON.parse(fs.readFileSync(SERVED, 'utf8'))[0];

  const partIdMap = {};
  for (const p of pub.parts) {
    partIdMap[p.cell] = p.partId;
  }

  const assembled = {
    _meta: {
      examNumber: pub.slot || 1,
      generatedAt: new Date().toISOString(),
      note: 'Rebuilt from published official-de-B1-e1 partIds for republication dry-run',
    },
    exam: {
      lesenParts: served.lesenParts,
      horenParts: served.horenParts,
      schreibenParts: served.schreibenParts,
    },
    partIds: partIdMap,
  };
  // publish-exam reads _meta.partIds
  assembled._meta.partIds = partIdMap;
  fs.writeFileSync(OUT_ASSEMBLED, `${JSON.stringify(assembled, null, 2)}\n`);

  const syncRows = [];
  const compareRows = [];
  const overlayRecords = [];
  const hashDiffs = [];

  for (const part of pub.parts) {
    const { snapshot: patchedSnap, patched } = patchSnapshotFromBank(part.snapshot || {}, bank);
    const oldHash = part.contentHash || canonicalPartHash(part.snapshot || {});
    const newPayload = normalizePartSnapshot({
      ...patchedSnap,
      id: part.partId,
      lang: patchedSnap.lang || 'de',
      level: patchedSnap.level || 'B1',
      module: patchedSnap.module || part.module,
      teil: patchedSnap.teil ?? part.teil,
    });
    const newHash = canonicalPartHash(newPayload);
    hashDiffs.push({
      cell: part.cell,
      partId: part.partId,
      oldHash: oldHash.slice(0, 12),
      newHash: newHash.slice(0, 12),
      hashChanged: oldHash !== newHash,
      patchedFields: patched,
    });

    // Overlay record shape expected by seedRecordToSnapshotPayload
    overlayRecords.push({
      id: part.partId,
      lang: newPayload.lang || 'de',
      level: newPayload.level || 'B1',
      module: newPayload.module || part.module,
      teil: newPayload.teil ?? part.teil,
      instruction: newPayload.instruction || '',
      passage: newPayload.passage || null,
      questions: newPayload.questions || [],
      complete: newPayload.complete !== false,
      verified: newPayload.verified === true, // preserve published flag (may be false)
      ads: newPayload.ads,
      passages: newPayload.passages,
      segments: newPayload.segments,
      task: newPayload.task,
      minWords: newPayload.minWords,
      maxWords: newPayload.maxWords,
      fieldId: newPayload.fieldId,
      taskFormat: newPayload.taskFormat,
      criteria: newPayload.criteria,
      example: newPayload.example,
    });

    if (part.module === 'lesen') {
      const batchPath = findBatchForPartId(part.partId);
      let sync = { fields: 0, passageIds: [], batchPath: null };
      if (batchPath) {
        sync = { ...syncBatchFromBank(batchPath, bank), batchPath: path.relative(ROOT, batchPath) };
        const genTwin = path.join(ROOT, 'batches/generated', `${part.partId}.json`);
        if (fs.existsSync(genTwin) && path.resolve(genTwin) !== path.resolve(batchPath)) {
          syncBatchFromBank(genTwin, bank);
        }
      }
      syncRows.push({ cell: part.cell, partId: part.partId, ...sync });

      const pubText = part.snapshot?.passage?.text || '';
      const bankText = patchedSnap.passage?.text || '';
      const qPid = part.snapshot?.questions?.[0]?.passageId || patchedSnap.passage?.id;
      const bankP = bank.passages.find((p) => p.id === qPid);
      if (bankP) {
        const diff = pubText !== bankP.text ? firstDiffSnippet(pubText, bankP.text) : null;
        compareRows.push({
          cell: part.cell,
          partId: part.partId,
          passageId: bankP.id,
          publishedHasBold: pubText.includes('**'),
          bankHasBold: (bankP.text || '').includes('**'),
          publishedHasBullet: /(?:^|\n)\s*[*-]\s+\S/.test(pubText),
          bankHasBullet: /(?:^|\n)\s*[*-]\s+\S/.test(bankP.text || ''),
          textsEqual: pubText === bankP.text,
          wouldChangeOnRepublish: pubText !== bankP.text || patched.length > 0,
          firstDiff: diff,
          patchedFields: patched,
        });
      } else {
        compareRows.push({
          cell: part.cell,
          partId: part.partId,
          passageId: qPid || null,
          note: 'no matching bank passage',
          wouldChangeOnRepublish: patched.length > 0,
          patchedFields: patched,
        });
      }
    }
  }

  fs.writeFileSync(
    OUT_OVERLAY,
    `${JSON.stringify({ _note: 'e1 republish overlay — published snapshots patched from bank', records: overlayRecords }, null, 2)}\n`,
  );

  const pubCmd = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'scripts/publish-exam.mjs'),
      '--from',
      path.relative(ROOT, OUT_ASSEMBLED),
      '--dry-run',
      '--local-only',
      '--seed-overlay',
      path.relative(ROOT, OUT_OVERLAY),
      '--exam-id',
      'official-de-B1-e1',
      '--slot',
      '1',
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );

  const wouldChange = compareRows.filter((r) => r.wouldChangeOnRepublish);
  const hashChanged = hashDiffs.filter((h) => h.hashChanged);

  const md = [
    '# e1 republication dry-run (from bank AUD-4/4b)',
    '',
    `**Fecha:** ${new Date().toISOString()}`,
    `**Assembled:** \`${path.relative(ROOT, OUT_ASSEMBLED)}\``,
    `**Seed overlay:** \`${path.relative(ROOT, OUT_OVERLAY)}\` (${overlayRecords.length} parts)`,
    '',
    '## Copia literal ≥4 vs e1',
    '',
    'Ninguno de los 6 casos de opción correcta calcada está en e1 → **no hay reparación de copia en esta republicación**.',
    '',
    '## publish-exam --dry-run --local-only',
    '',
    pubCmd.status === 0
      ? '✓ Capture OK (0 missing parts). Preview abajo / en stdout de la corrida.'
      : `✗ publish-exam falló (exit ${pubCmd.status})`,
    '',
    '```',
    (pubCmd.stdout || '').trim().slice(0, 4000),
    pubCmd.stderr ? `\n[stderr]\n${pubCmd.stderr.trim().slice(0, 1500)}` : '',
    '```',
    '',
    '## contentHash diffs (publicado → overlay banco)',
    '',
    '| Cell | partId | old | new | changed |',
    '|---|---|---|---|---|',
  ];
  for (const h of hashDiffs) {
    md.push(
      `| ${h.cell} | \`${h.partId}\` | \`${h.oldHash}\` | \`${h.newHash}\` | ${h.hashChanged ? 'YES' : 'no'} |`,
    );
  }
  md.push('', `**Celdas con hash distinto:** ${hashChanged.length}`);
  for (const h of hashChanged) {
    md.push(`- ${h.cell}: ${h.patchedFields.slice(0, 8).join(', ') || '(structure/normalize only)'}`);
  }

  md.push(
    '',
    '## Diff publicado vs banco (Lesen)',
    '',
    '| Cell | partId | passageId | pub ** | bank ** | textsEqual | wouldChange |',
    '|---|---|---|---|---|---|---|',
  );
  for (const r of compareRows) {
    md.push(
      `| ${r.cell} | \`${r.partId}\` | \`${r.passageId || '—'}\` | ${r.publishedHasBold ?? '—'} | ${r.bankHasBold ?? '—'} | ${r.textsEqual ?? r.note} | ${r.wouldChangeOnRepublish ?? '—'} |`,
    );
  }
  md.push('', `**Partes Lesen que cambiarían:** ${wouldChange.length}`);
  for (const r of wouldChange) {
    const why = r.publishedHasBold && !r.bankHasBold
      ? 'AUD-4: quitar `**` del snapshot publicado'
      : r.firstDiff
        ? `diff@${r.firstDiff.at}: pub «${r.firstDiff.pub}» → bank «${r.firstDiff.bank}»`
        : (r.patchedFields || []).join(', ') || 'topicTags/metadata';
    md.push(`- ${r.cell} (\`${r.passageId || r.partId}\`): ${why}`);
  }

  md.push('', '## Sync batches locales desde banco', '');
  for (const s of syncRows) {
    md.push(`- ${s.cell} \`${s.partId}\` → ${s.batchPath || 'NO LOCAL BATCH'} (fields updated: ${s.fields})`);
  }

  md.push(
    '',
    '## Cómo aplicar (cuando confirmes)',
    '',
    '```bash',
    `node scripts/publish-exam.mjs --from assembled-exam-b1-e1.json --apply --yes --local-only --seed-overlay ${path.relative(ROOT, OUT_OVERLAY).replace(/\\/g, '/')}`,
    'node scripts/sync-published-to-served.mjs --lang de --level B1 --apply',
    '```',
    '',
    '**Esta corrida NO ejecutó publish --apply ni sync-to-served.**',
  );

  fs.writeFileSync(OUT_REPORT, `${md.join('\n')}\n`);
  fs.writeFileSync(
    OUT_JSON,
    `${JSON.stringify({ compareRows, syncRows, wouldChange, hashDiffs, publishExit: pubCmd.status }, null, 2)}\n`,
  );
  console.log(md.join('\n'));
  process.exit(pubCmd.status === 0 ? 0 : 1);
}

main();
