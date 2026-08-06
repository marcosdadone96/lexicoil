/**
 * Refresh specific cells in assembled review e2/e3/e4 from corrected source JSON.
 * Preserves exam composition (same source filenames in _meta.sources).
 *
 *   node scripts/refresh-assembled-review-sources.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { isExamPublishable, partRecordToExamPart } from './audit-pass-2.mjs';
import { normalizeB1Topic } from './lib/b1Topics.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = path.join(ROOT, 'batches/generated');
const OUT_DIR = path.join(ROOT, 'batches/ready/assembled-review');

function extractTopic(rec, batch) {
  const fromQ = (batch?.questions || rec?.questions || [])
    .flatMap((q) => q.topicTags || [])
    .find(Boolean);
  const raw =
    fromQ ||
    batch?.topicTag ||
    batch?._requestedTopic ||
    rec?.topicTag ||
    batch?.passages?.[0]?.topicTag ||
    null;
  return normalizeB1Topic(raw) || raw || null;
}

function batchToRecord(batch, file, module, teil) {
  const base = buildLesenSeedRecordFromBatch(batch, {
    module,
    teil,
    lang: 'de',
    level: 'B1',
    id: file.replace(/\.json$/i, ''),
  });
  const passages = batch.passages || [];
  const mod = String(module).toLowerCase();
  const rec = {
    ...base,
    id: file.replace(/\.json$/i, ''),
    module: mod,
    teil: Number(teil),
    lang: 'de',
    level: 'B1',
    questions: batch.questions || [],
    passages,
    ads: batch.ads || base.ads,
    topicTag: extractTopic(base, batch),
    complete: true,
    verified: true,
  };
  if (mod === 'horen') {
    if (passages.length > 1) {
      rec.segments = passages.map((p, i) => ({
        passageId: p.id,
        label: p.title || `Aufnahme ${i + 1}`,
        text: p.text || p.transcript || '',
        transcript: p.transcript || p.text || '',
        questions: (batch.questions || []).filter((q) => q.passageId === p.id),
      }));
      rec.questions = batch.questions || [];
    }
    rec.passage = passages[0]
      ? {
          title: passages[0].title,
          text: passages[0].text,
          transcript: passages[0].transcript || passages[0].text,
          topicTag: passages[0].topicTag,
        }
      : null;
    if (!rec.topicTag && passages[0]?.topicTag) rec.topicTag = passages[0].topicTag;
  }
  return rec;
}

function loadPart(file, module, teil) {
  let batch = JSON.parse(fs.readFileSync(path.join(GENERATED, file), 'utf8'));
  batch = normalizeBatch(batch, { module, teil, lang: 'de', level: 'B1' });
  const record = batchToRecord(batch, file, module, teil);
  return partRecordToExamPart(record);
}

const CELL_INDEX = {
  lesen_1: ['lesenParts', 0],
  lesen_2: ['lesenParts', 1],
  lesen_3: ['lesenParts', 2],
  lesen_4: ['lesenParts', 3],
  lesen_5: ['lesenParts', 4],
  horen_1: ['horenParts', 0],
  horen_2: ['horenParts', 1],
  horen_3: ['horenParts', 2],
  horen_4: ['horenParts', 3],
};

async function main() {
  const checks = [
    ['einen Jungen und ein Mädchen', 'Sportlichen', 'ähnlichen', 'Angeboten', 'Verkehrsbehinderungen', 'Lesewelt', 'Gesund und Lecker'],
  ];
  for (const slot of [2, 3, 4]) {
    const outPath = path.join(OUT_DIR, `assembled-exam-b1-review-e${slot}.json`);
    const doc = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const sources = doc._meta.sources || {};
    let refreshed = 0;
    for (const [cell, file] of Object.entries(sources)) {
      if (!file || file === 'seed' || !file.endsWith('.json')) continue;
      // Only refresh cells whose source we touched this wave
      const touch = /lesen-t1-gemini-175|lesen-t2-gemini-09[23]|lesen-t5-gemini-06[75]|lesen-t5-gemini-075|horen-t1-gemini-001/.test(file);
      if (!touch) continue;
      const [module, teilStr] = cell.split('_');
      const teil = Number(teilStr);
      const [arrKey, idx] = CELL_INDEX[cell];
      const part = loadPart(file, module, teil);
      doc.exam[arrKey][idx] = part;
      refreshed++;
      console.log(`e${slot} ${cell} ← ${file}`);
    }
    doc._meta.refreshedAt = new Date().toISOString();
    doc._meta.refreshNote = 'caps v3.3 + Gesund und Lecker rename (sources in-place)';
    const gate = await isExamPublishable(doc.exam, { semantic: false, skipSem2: true });
    doc._meta.gate1 = { ok: gate.ok, blocking: (gate.blocking || []).slice(0, 8) };
    fs.writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`✓ e${slot} refreshed=${refreshed} GATE-1=${gate.ok ? 'PASS' : 'FAIL'}`);
  }

  // Verify target strings
  for (const slot of [2, 3, 4]) {
    const s = fs.readFileSync(path.join(OUT_DIR, `assembled-exam-b1-review-e${slot}.json`), 'utf8');
    const probes = {
      Jungen: (s.match(/einen Jungen und/g) || []).length,
      sportlichen: (s.match(/sportlichen Aktivitäten/g) || []).length,
      Sportlichen: (s.match(/Sportlichen Aktivitäten/g) || []).length,
      ähnlichen: (s.match(/ähnlichen Fortbewegung/g) || []).length,
      Angeboten: (s.match(/solchen Angeboten/g) || []).length,
      angeboten: (s.match(/solchen angeboten/g) || []).length,
      Verkehrsbehinderungen: (s.match(/Verkehrsbehinderungen/g) || []).length,
      'Gesund und Lecker': (s.match(/Gesund und Lecker/g) || []).length,
      Lesewelt: (s.match(/Lesewelt/g) || []).length,
    };
    console.log(`verify e${slot}`, probes);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
