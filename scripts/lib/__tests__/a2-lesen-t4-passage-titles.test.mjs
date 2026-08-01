/**
 * Lesen A2 T4 — title backfill + CHK-27 skip for gen-l4-*.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBatch } from '../normalizeBatch.mjs';
import {
  backfillLesenA2T4PassageTitles,
  deriveAnzeigeTitleFromText,
} from '../lesenA2T4Passages.mjs';
import { extractStructuralMold, checkStructuralMoldDuplicate } from '../structuralMoldDedup.mjs';
import { assessT4TopicAlignment } from '../t4TopicAlign.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const STADTLEBEN_REJECT = path.join(
  ROOT,
  'batches/generated/.rejected/lesen-t4-gemini-099-2026-07-31T19-16-45-542Z.json',
);

// derive title from first sentence
{
  const t = deriveAnzeigeTitleFromText(
    'Entdecken Sie täglich die Geheimnisse unserer Stadt! Unsere erfahrenen Stadtführer…',
  );
  assert.match(t, /Geheimnisse unserer Stadt/i);
}

// backfill → CHK-29 mold not incomplete
{
  const batch = JSON.parse(fs.readFileSync(STADTLEBEN_REJECT, 'utf8'));
  assert.equal(batch.passages.every((p) => !String(p.title || '').trim()), true);

  const norm = normalizeBatch(batch, { module: 'lesen', teil: 4, lang: 'de', level: 'A2' });
  assert.ok(norm.passages.every((p) => String(p.title || '').trim().length >= 3));

  const mold = extractStructuralMold(norm, 4, { level: 'A2' });
  assert.notEqual(mold.key, 'a2_anzeigen:incomplete', mold.key);
  assert.ok(mold.key.startsWith('a2_anzeigen:'), mold.key);

  const corpus = [
    {
      ...norm,
      id: 'other',
      passages: norm.passages.map((p, i) => ({
        ...p,
        title: `Anderer Titel ${i}`,
      })),
    },
  ];
  const dup = checkStructuralMoldDuplicate(norm, corpus, { teil: 4, level: 'A2' });
  assert.equal(dup.ok, true, dup.issue);
}

// CHK-27 skip for gen-l4-* (A2 Anzeigen, not B1 debate)
{
  const batch = JSON.parse(fs.readFileSync(STADTLEBEN_REJECT, 'utf8'));
  batch.topicTag = 'Medien';
  batch._requestedTopic = 'Medien';
  const align = assessT4TopicAlignment(batch);
  assert.equal(align.skip, true, JSON.stringify(align));
  assert.equal(align.reason, 'a2_anzeigen_t4');
}

console.log('a2-lesen-t4-passage-titles.test.mjs: OK');
