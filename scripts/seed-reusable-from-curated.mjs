#!/usr/bin/env node
/**
 * Seed reusable-parts store from curated exams (data/exams/{lang}_{level}.json).
 * Each Teil of each curated exam becomes one verified reusable part.
 *
 * Usage:
 *   node scripts/seed-reusable-from-curated.mjs --lang de --level B1 --dry-run
 *   node scripts/seed-reusable-from-curated.mjs --lang en --level B1 --apply --verify
 *   node scripts/seed-reusable-from-curated.mjs --out-json library/reusable-seed/en_B1.json
 *
 * Requires Netlify Blobs credentials for --apply:
 *   NETLIFY_SITE_ID, NETLIFY_API_TOKEN (or NETLIFY_AUTH_TOKEN)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  comboKey,
  defaultSeedOutJson,
  examsFileFor,
  loadBlueprintForCombo,
  minPartsForKey,
  requiredPartKeys,
} from './lib/seedReusableCommon.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { addReusablePart, listPartsIndex } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));
const { partExactTargetFromBlueprint } = require(path.join(
  ROOT,
  'netlify/functions/lib/partQualityGate.js',
));

const STORE_NAME = 'lexicoil-data';

const HELP_TEXT = `
Usage: node scripts/seed-reusable-from-curated.mjs --lang de --level B1 [--apply]

Options:
  --apply       Write files to disk and Netlify Blobs (required to make any changes)
  --dry-run     Show what would be written without touching disk (default)
  --verify      Verify Netlify Blobs inventory after --apply
  --force       Force overwrite even if parts already exist
  --out-json    Override output path (default: library/reusable-seed/{lang}_{level}.json)
  --lang        Language code (default: de)
  --level       Level code (default: B1)

SAFETY: Without --apply this script performs ZERO writes to disk or Netlify Blobs.
`;

function parseArgs(argv) {
  const o = {
    lang: 'de',
    level: 'B1',
    apply: false,
    verify: false,
    outJson: null,
    force: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--verify') o.verify = true;
    else if (a === '--force') o.force = true;
    else if (a === '--out-json') o.outJson = argv[++i];
    else if (a === '--lang') o.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function getStoreForCli() {
  const { getStore } = require('@netlify/blobs');
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name: STORE_NAME, siteID, token });
  return getStore(STORE_NAME);
}

function normPassageId(id) {
  return String(id || '')
    .trim()
    .toUpperCase()
    .replace(/^TEXT\s*/i, '');
}

function flattenLesenQuestions(part) {
  const out = [];
  const push = (q) => {
    if (!q?.question && !q?.signText) return;
    out.push({
      id: q.id,
      type: q.type || q.questionType || 'multiple',
      question: q.question || q.signText || q.statement,
      options: q.options,
      correct: q.correct ?? q.correctAnswer,
      passageId: q.passageId,
      signText: q.signText,
    });
  };
  (part.questions || []).forEach(push);
  (part.items || []).forEach((it) =>
    push({
      ...it,
      question: it.question || it.signText || it.statement,
      type: it.type || 'matching',
    }),
  );
  return out;
}

function lesenPassagePayload(part) {
  const teil = Number(part.teil);
  if (teil === 2 && Array.isArray(part.passages) && part.passages.length >= 2) {
    return {
      title: part.textTitle || 'Lesen Teil 2',
      passages: part.passages.map((p) => ({
        passageId: normPassageId(p.passageId || p.id) || p.passageId,
        textTitle: p.textTitle || p.title || '',
        text: String(p.text || '').trim(),
      })),
    };
  }
  if (teil === 3 && Array.isArray(part.ads) && part.ads.length) {
    return { title: part.textTitle || '', text: part.text || '', ads: part.ads };
  }
  if (teil === 4 && (Array.isArray(part.passages) || Array.isArray(part.ads))) {
    return {
      title: part.instruction || 'Lesen Teil 4',
      passages: (part.passages || []).map((p) => ({
        passageId: normPassageId(p.passageId || p.id) || p.passageId,
        textTitle: p.textTitle || p.title || '',
        text: String(p.text || '').trim(),
      })),
      ads: part.ads || [],
    };
  }
  return {
    title: part.textTitle || part.instruction || '',
    text: String(part.text || '').trim(),
  };
}

function flattenHorenQuestions(part) {
  const out = [];
  for (const seg of part.segments || []) {
    for (const q of seg.questions || []) {
      out.push({
        id: q.id,
        type: q.type || 'multiple',
        question: q.question,
        options: q.options,
        correct: q.correct ?? q.correctAnswer,
        passageId: q.passageId || seg.passageId,
      });
    }
  }
  (part.questions || []).forEach((q) => out.push(q));
  return out;
}

function horenPayload(part) {
  const segments = (part.segments || []).map((seg, i) => ({
    id: seg.id || `seg_${i}`,
    label: seg.label || `Aufnahme ${i + 1}`,
    transcript: String(seg.transcript || seg.text || '').trim(),
    passageId: seg.passageId || seg.id,
    questions: (seg.questions || []).map((q) => ({ ...q })),
  }));
  const text =
    String(part.transcript || '').trim() ||
    segments.map((s) => s.transcript).filter(Boolean).join('\n\n');
  return { segments, passage: { title: part.context || part.instruction || '', text, transcript: text } };
}

function contentHash(module, teil, part) {
  const h = crypto.createHash('sha256');
  h.update(`${module}:${teil}:`);
  if (module === 'lesen') {
    h.update(JSON.stringify(lesenPassagePayload(part)));
    h.update(JSON.stringify(flattenLesenQuestions(part).map((q) => q.id)));
  } else if (module === 'schreiben') {
    h.update(String(part.task || ''));
    h.update(String(part.minWords || ''));
  } else {
    h.update(String(part.transcript || ''));
    h.update(JSON.stringify(flattenHorenQuestions(part).map((q) => q.id)));
  }
  return h.digest('hex').slice(0, 16);
}

function buildReusableRecord(exam, examIdx, module, part, blueprint, lang, level) {
  const teil = Number(part.teil ?? part.aufgabe);
  const topic = exam.topic || `exam-${examIdx}`;
  const hash = contentHash(module, teil, part);
  const id = `cur-${lang}-${level}-e${String(examIdx).padStart(2, '0')}-${module}-t${teil}-${hash}`;

  const payload = {
    id,
    lang: exam.lang || lang,
    level: exam.level || level,
    module,
    teil,
    instruction: part.instruction || '',
    complete: true,
    verified: true,
    contributor: `curated:${topic}`,
  };

  if (module === 'lesen') {
    payload.passage = lesenPassagePayload(part);
    payload.questions = flattenLesenQuestions(part);
    if (teil === 4 && (part.passages?.length || part.ads?.length)) {
      payload.passages = part.passages || [];
      payload.ads = part.ads || [];
    }
    if (part.example) payload.example = part.example;
  } else if (module === 'horen') {
    const hp = horenPayload(part);
    payload.passage = hp.passage;
    payload.segments = hp.segments;
    payload.questions = flattenHorenQuestions(part);
  } else if (module === 'schreiben') {
    const teilN = Number(part.teil ?? part.aufgabe ?? teil);
    const task = String(part.task || part.instruction || '').trim();
    if (!task) return null;
    payload.teil = teilN;
    payload.task = task;
    payload.minWords = Number(part.minWords ?? part.targetWords) || (teilN === 3 ? 40 : 80);
    payload.maxWords = Number(part.maxWords) || payload.minWords;
    payload.fieldId = part.fieldId || `write_bp_${teilN}`;
    payload.taskFormat = part.taskType || part.taskFormat || null;
    payload.passage = { text: task, title: part.taskType || '' };
    payload.questions = [{ id: '1', type: 'short_answer', question: task }];
  } else {
    return null;
  }

  const target = blueprint ? partExactTargetFromBlueprint(blueprint, module, teil) : payload.questions.length;
  payload.itemCount = payload.questions.length;
  payload.targetCount = target;
  if (target && payload.questions.length !== target) {
    payload.complete = false;
    console.warn(`  warn ${id}: item count ${payload.questions.length} != target ${target}`);
  }

  if (!payload.questions.length) return null;
  return payload;
}

function extractAllParts(exams, blueprint, lang, level) {
  const records = [];
  const seenHash = new Set();

  exams.forEach((exam, examIdx) => {
    for (const part of exam.lesenParts || []) {
      const rec = buildReusableRecord(exam, examIdx, 'lesen', part, blueprint, lang, level);
      if (!rec) continue;
      const hk = `${rec.module}:${rec.teil}:${contentHash('lesen', rec.teil, part)}`;
      if (seenHash.has(hk)) continue;
      seenHash.add(hk);
      records.push(rec);
    }
    for (const part of exam.horenParts || []) {
      const rec = buildReusableRecord(exam, examIdx, 'horen', part, blueprint, lang, level);
      if (!rec) continue;
      const hk = `${rec.module}:${rec.teil}:${contentHash('horen', rec.teil, part)}`;
      if (seenHash.has(hk)) continue;
      seenHash.add(hk);
      records.push(rec);
    }
    for (const part of exam.schreibenParts || []) {
      const rec = buildReusableRecord(exam, examIdx, 'schreiben', part, blueprint, lang, level);
      if (!rec) continue;
      const hk = `${rec.module}:${rec.teil}:${contentHash('schreiben', rec.teil, part)}`;
      if (seenHash.has(hk)) continue;
      seenHash.add(hk);
      records.push(rec);
    }
  });
  return records;
}

function countByTeil(records) {
  const counts = {};
  for (const r of records) {
    const k = `${r.module}:t${r.teil}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

async function verifyInventory(store, lang, level) {
  const modules = ['lesen', 'horen', 'schreiben'];
  const report = {};
  for (const module of modules) {
    const entries = await listPartsIndex(store, lang, level, module);
    const byTeil = {};
    for (const e of entries.filter((x) => x.complete && x.verified && !x.disabled)) {
      const t = Number(e.teil);
      byTeil[t] = (byTeil[t] || 0) + 1;
    }
    report[module] = byTeil;
  }
  return report;
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));

  // --help must never touch disk
  if (opts.help) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  const examsFile = examsFileFor(opts.lang, opts.level);
  if (!fs.existsSync(examsFile)) {
    console.error('Missing curated exams file:', examsFile);
    console.error(
      `Run build-level first: node scripts/build-level.mjs --lang ${opts.lang} --level ${opts.level} --target 12 --apply`,
    );
    process.exit(1);
  }

  let blueprint;
  try {
    blueprint = loadBlueprintForCombo(opts.lang, opts.level);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const exams = JSON.parse(fs.readFileSync(examsFile, 'utf8'));
  const records = extractAllParts(exams, blueprint, opts.lang, opts.level);
  const counts = countByTeil(records);
  const required = requiredPartKeys(blueprint);
  const examCount = exams.length;

  console.log(`Curated source: ${comboKey(opts.lang, opts.level)} → ${examsFile}`);
  console.log(`Blueprint: ${blueprint.id || `${blueprint.examType}_${opts.level}`}`);
  console.log(`${exams.length} exams → ${records.length} reusable parts`);
  console.log('Extracted counts:', counts);

  for (const k of required) {
    const n = counts[k] || 0;
    const min = minPartsForKey(k, examCount);
    if (n < min) console.warn(`WARN: ${k} has only ${n} parts (expected >= ${min})`);
    else console.log(`OK: ${k} → ${n} parts`);
  }

  const outJson = opts.outJson || defaultSeedOutJson(opts.lang, opts.level);
  const outPath = path.isAbsolute(outJson) ? outJson : path.join(ROOT, outJson);

  if (!opts.apply) {
    console.log(`\nDRY-RUN — would write ${records.length} parts to ${outPath}`);
    console.log('Re-run with --apply to write to disk and Netlify Blobs.');
    process.exit(0);
  }

  // --apply: write JSON to disk, then upload to Netlify Blobs
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({ lang: opts.lang, level: opts.level, records }, null, 2)}\n`,
  );
  console.log('Wrote', outPath);

  let store;
  try {
    store = getStoreForCli();
  } catch (err) {
    console.error('Could not connect to Netlify Blobs. Set NETLIFY_SITE_ID and NETLIFY_API_TOKEN.');
    console.error(err.message);
    process.exit(1);
  }

  let added = 0;
  let skipped = 0;
  for (const rec of records) {
    try {
      await addReusablePart(store, rec);
      added++;
    } catch (err) {
      skipped++;
      console.warn(`skip ${rec.id}:`, err.message);
    }
  }
  console.log(`\nApplied: ${added} parts added, ${skipped} skipped.`);

  if (opts.verify) {
    const inv = await verifyInventory(store, opts.lang, opts.level);
    console.log('\nStore inventory (complete && verified):');
    console.log(JSON.stringify(inv, null, 2));
    for (const k of required) {
      const [mod, tLabel] = k.split(':');
      const teil = Number(tLabel.replace('t', ''));
      const n = inv[mod]?.[teil] || 0;
      const min = minPartsForKey(k, examCount);
      if (n < min) {
        console.error(`FAIL verify: ${k} has ${n} in store (need >= ${min})`);
        process.exit(1);
      }
    }
    console.log('Verify OK: all teile meet minimum part counts in store.');
  }
})();
