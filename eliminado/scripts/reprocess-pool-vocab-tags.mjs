/**
 * Reprocess vocabularyTags on pool-verified + pool-content-ok-lesen (deterministic, $0).
 *
 *   node scripts/reprocess-pool-vocab-tags.mjs --dry-run
 *   node scripts/reprocess-pool-vocab-tags.mjs
 *   node scripts/reprocess-pool-vocab-tags.mjs --validate-only   # sample quality only
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  enrichBatchMetadata,
  extractVocabularyFromText,
  VOCAB_TAGS_NORMALIZE_VERSION,
} from './lib/enrichBatchMetadata.mjs';
import { POOL_VERIFIED_DIR, POOL_CONTENT_OK_LESEN_DIR } from './lib/finalizePoolReady.mjs';

const dryRun = process.argv.includes('--dry-run');
const validateOnly = process.argv.includes('--validate-only');

const CONJUGATED =
  /^(findet|geht|macht|nimmt|gibt|kommt|sieht|hat|ist|sind|war|wird|kann|muss|soll|will|läuft|steht|liegt|fährt|spricht|schreibt|liest|lernt|arbeitet|wohnt|kauft|verkauft|hilft|braucht|denkt|glaubt|weiß|kennt|empfand|empfiehlt|unterstützt|unterstuetzt)$/i;
const LOWER_NOUN =
  /^(alltag|urlaub|arbeit|familie|freund|schule|stadt|land|haus|auto|zug|bus|bahn|geld|zeit|mensch|kind|frau|mann|problem|angebot|termin|umwelt|verkehr|freizeit|gesundheit|bildung|engagement|lebensstil|umzug|hilfe|erfahrung)$/i;
const INFLECTED_ADJ = /^(entspannter|besser|größer|kleiner|neuer|guter|nachhaltiger|anstrengender)$/i;

/** Previous audit sample — exclude from validation set. */
const PREV_SAMPLE = new Set([
  'lesen-t1-gemini-075.json',
  'lesen-t1-gemini-143.json',
  'lesen-t3-auto-zspq8n.json',
  'horen-t1-gemini-016.json',
  'horen-t2-gemini-013.json',
  'horen-t3-gemini-003.json',
  'schreiben-gemini-004.json',
  'schreiben-gemini-006.json',
  'schreiben-gemini-009.json',
  'sprechen-gemini-001.json',
]);

function tagProblems(tags) {
  const problems = [];
  for (const t of tags) {
    const s = String(t);
    if (CONJUGATED.test(s)) problems.push({ t: s, kind: 'conjugated_verb' });
    else if (LOWER_NOUN.test(s) && s === s.toLowerCase()) problems.push({ t: s, kind: 'lowercase_noun' });
    else if (INFLECTED_ADJ.test(s)) problems.push({ t: s, kind: 'inflected_adj' });
    else if (/^(sich|mein|statt|teil|punkt|thema)$/i.test(s)) problems.push({ t: s, kind: 'function_word' });
  }
  return problems;
}

function collectTags(batch) {
  const tags = [];
  for (const q of batch.questions || []) {
    for (const t of q.vocabularyTags || []) tags.push(String(t));
  }
  return [...new Set(tags)];
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}

function pickValidationSample(files, n = 25) {
  const byMod = { lesen: [], horen: [], schreiben: [], sprechen: [], other: [] };
  for (const f of files) {
    if (PREV_SAMPLE.has(f)) continue;
    const m = f.match(/^(lesen|horen|schreiben|sprechen)/i);
    const key = m ? m[1].toLowerCase() : 'other';
    byMod[key].push(f);
  }
  const sample = [];
  const order = ['lesen', 'horen', 'schreiben', 'sprechen', 'other'];
  let i = 0;
  while (sample.length < n) {
    let added = false;
    for (const mod of order) {
      const arr = byMod[mod];
      if (!arr.length) continue;
      const idx = Math.min(arr.length - 1, Math.floor((i * 7 + sample.length * 3) % arr.length));
      const f = arr.splice(idx, 1)[0];
      if (f && !sample.includes(f)) {
        sample.push(f);
        added = true;
        if (sample.length >= n) break;
      }
    }
    if (!added) break;
    i++;
  }
  return sample;
}

function auditFiles(dir, names, label) {
  const rows = [];
  for (const file of names) {
    const abs = path.join(dir, file);
    if (!fs.existsSync(abs)) continue;
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    // Simulate improved tags from text (before write) for validate-only / before
    const blob = [
      ...(batch.passages || []).map((p) => `${p.title || ''} ${p.text || ''}`),
      ...(batch.questions || []).map((q) => `${q.question || ''} ${q.explanation || ''}`),
    ].join(' ');
    const fresh = extractVocabularyFromText(blob, 8);
    const existing = collectTags(batch);
    const beforeP = tagProblems(existing);
    const afterP = tagProblems(fresh);
    rows.push({
      file,
      label,
      beforeTags: existing.slice(0, 10),
      afterTags: fresh.slice(0, 10),
      beforeProblems: beforeP.length,
      afterProblems: afterP.length,
      beforeKinds: beforeP,
      afterKinds: afterP,
    });
  }
  return rows;
}

// ——— validate sample ———
const verifiedFiles = listJson(POOL_VERIFIED_DIR);
const okLesenFiles = listJson(POOL_CONTENT_OK_LESEN_DIR);
const sampleNames = pickValidationSample([...verifiedFiles, ...okLesenFiles], 25);

const sampleRows = [];
for (const f of sampleNames) {
  const dir = verifiedFiles.includes(f) ? POOL_VERIFIED_DIR : POOL_CONTENT_OK_LESEN_DIR;
  sampleRows.push(...auditFiles(dir, [f], path.basename(dir)));
}

const beforeBad = sampleRows.filter((r) => r.beforeProblems > 0).length;
const afterBad = sampleRows.filter((r) => r.afterProblems > 0).length;
const beforePct = sampleRows.length ? Math.round((100 * beforeBad) / sampleRows.length) : 0;
const afterPct = sampleRows.length ? Math.round((100 * afterBad) / sampleRows.length) : 0;

console.log(
  JSON.stringify(
    {
      validateSample: sampleRows.length,
      beforeBad,
      afterBad,
      beforePct,
      afterPct,
      baselinePrevAuditPct: 60,
      sampleFiles: sampleRows.map((r) => r.file),
    },
    null,
    2,
  ),
);

if (validateOnly) {
  const out = path.join(ROOT, 'batches/ready/gate-logs/VOCAB-TAGS-VALIDATE-SAMPLE-2026-07-10.json');
  fs.writeFileSync(out, `${JSON.stringify({ sampleRows, beforePct, afterPct }, null, 2)}\n`);
  console.log('Wrote', out);
  process.exit(0);
}

// ——— reprocess pools ———
const targets = [
  { dir: POOL_VERIFIED_DIR, label: 'pool-verified' },
  { dir: POOL_CONTENT_OK_LESEN_DIR, label: 'pool-content-ok-lesen' },
];

const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  version: VOCAB_TAGS_NORMALIZE_VERSION,
  validation: {
    sampleSize: sampleRows.length,
    beforeBad,
    afterBad,
    beforePct,
    afterPct,
    baselinePrevAuditPct: 60,
    rows: sampleRows,
  },
  byDir: {},
  filesChanged: 0,
  filesScanned: 0,
};

for (const { dir, label } of targets) {
  const files = listJson(dir);
  const dirStats = { scanned: 0, changed: 0, examples: [] };
  for (const file of files) {
    report.filesScanned++;
    dirStats.scanned++;
    const abs = path.join(dir, file);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const before = JSON.stringify((batch.questions || []).map((q) => q.vocabularyTags || []));
    const { batch: enriched, stats } = enrichBatchMetadata(batch, {
      topic: false,
      grammar: false,
      vocab: true,
      forceVocab: true,
    });
    const after = JSON.stringify((enriched.questions || []).map((q) => q.vocabularyTags || []));
    const changed = before !== after;
    if (changed) {
      dirStats.changed++;
      report.filesChanged++;
      if (dirStats.examples.length < 5) {
        dirStats.examples.push({
          file,
          before: collectTags(batch).slice(0, 8),
          after: collectTags(enriched).slice(0, 8),
        });
      }
    }
    if (!dryRun && (changed || enriched._vocabTagsNormalizeVersion !== batch._vocabTagsNormalizeVersion)) {
      fs.writeFileSync(abs, `${JSON.stringify(enriched, null, 2)}\n`);
    }
  }
  report.byDir[label] = dirStats;
}

const outJson = path.join(ROOT, 'batches/ready/gate-logs/VOCAB-TAGS-REPROCESS-2026-07-10.json');
const outMd = path.join(ROOT, 'batches/ready/gate-logs/VOCAB-TAGS-REPROCESS-2026-07-10.md');
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# vocabularyTags reprocess (2026-07-10)',
  '',
  `**Version:** \`${VOCAB_TAGS_NORMALIZE_VERSION}\``,
  `**Dry-run:** ${dryRun}`,
  '',
  '## Extractor',
  '',
  '- Verbos → infinitivo (`findet` → `finden`)',
  '- Sustantivos → mayúscula (`alltag` → `Alltag`)',
  '- Adjetivos → forma base (`entspannter` → `entspannt`)',
  '- Filtro de partículas / pronombres de bajo valor de búsqueda',
  '',
  '## Validación (muestra nueva, n=' + sampleRows.length + ', excluye los 10 del audit 60%)',
  '',
  `| Métrica | Antes | Después |`,
  `|--------|------:|--------:|`,
  `| Archivos con ≥1 problema | ${beforeBad} (${beforePct}%) | **${afterBad} (${afterPct}%)** |`,
  `| Baseline audit previo | 60% | — |`,
  '',
  '## Reproceso',
  '',
  `| Pool | Escaneados | Cambiados |`,
  `|------|----------:|----------:|`,
  ...Object.entries(report.byDir).map(
    ([k, v]) => `| ${k} | ${v.scanned} | ${v.changed} |`,
  ),
  '',
  `**Total cambiados:** ${report.filesChanged} / ${report.filesScanned}`,
  '',
  `Datos: \`${path.basename(outJson)}\``,
  '',
];
fs.writeFileSync(outMd, md.join('\n'));

console.log(
  JSON.stringify(
    {
      dryRun,
      filesScanned: report.filesScanned,
      filesChanged: report.filesChanged,
      byDir: report.byDir,
      validation: { beforePct, afterPct, beforeBad, afterBad, sampleSize: sampleRows.length },
    },
    null,
    2,
  ),
);
console.log('Wrote', outMd);
