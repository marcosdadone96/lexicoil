#!/usr/bin/env node
/**
 * Backlog + holdout regression for verb_census V2 guard only.
 * FP isolated strings must stay intact; REAL strings must fix.
 *
 *   node scripts/run-german-caps-v32-backlog-regression.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import { normalizeGermanCapsInText } from './lib/capitalizeNouns.mjs';

const GENERATED_DIR = path.join(ROOT, 'batches/generated');
const READY_DIR = path.join(ROOT, 'batches/ready/lesen');
const INVENTORY = path.join(ROOT, 'batches/ready/gate-logs/backlog-reprocess-inventory.json');
const OUT_JSON = path.join(ROOT, 'batches/ready/gate-logs/V32-BACKLOG-REGRESSION.json');
const OUT_MD = path.join(ROOT, 'batches/ready/gate-logs/V32-BACKLOG-REGRESSION.md');

const FP_ISOLATED = [
  'alten Dächern pflanzen Nachbarn Gemüse und Obst.',
  'dass besonders junge Menschen Interesse an Smart-Home-Lösungen haben.',
  'ist, dass man Kosten für Miete oder Instandhaltung teilen.',
  'a) Ausschließlich Kurse für das Kochen.',
  'c) Nur Kurse für Sport und Fitness',
  'Viele Menschen suchen Familien und Freunde Erholung draußen.',
  'dass nicht alle Lernenden Zugang zu Internet oder passenden Geräten haben.',
  'Aktion, indem sie Sammelboxen in öffentlichen Gebäuden aufstellen.',
  'b) Nur Musikkonzerte für ein ausgewähltes Publikum',
  'Arbeitsplatz, zum Beispiel Bewerbungsgespräche, in Rollenspielen geübt',
  'das Gefühl der Gemeinschaft Stärken. Die Zeitungen sind',
  'Jugendliche und junge Erwachsene Nachrichten oft über Instagram,',
  'Was empfehlen Experten Familien bezüglich der Nutzung sozialer Medien?',
  'c) Unternehmungen draußen, wie zum Beispiel Radfahren oder Parkbesuche.',
  'Plan, weil sie Teamarbeit und die Organisation im Verein verbessert.',
  'Schlüssel: 15 Euro Gebühr.',
  'Kinder dabei nicht nur Wissen sammeln, sondern auch',
  ', dass Anwohner selbst Pflanzen anbauen können.',
  'und Wassersparen:\n    Schalten Sie das Licht aus,',
  'c) Fünfundvierzig Euro.',
];

const V2_LEMMAS = new Set([
  'essen', 'kochen', 'wissen', 'besuchen', 'unternehmen', 'spielen', 'berichten',
  'arbeiten', 'glauben', 'folgen', 'stellen', 'raten', 'gärtnern', 'waschen', 'zahlen',
]);

function norm(text) {
  return normalizeGermanCapsInText(text).result;
}

function listBacklogFiles() {
  if (fs.existsSync(INVENTORY)) {
    const inv = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
    const files = [];
    for (const teil of Object.values(inv.byTeil || {})) {
      for (const f of teil.files || []) {
        const base = f.pool === 'ready' ? READY_DIR : GENERATED_DIR;
        files.push({ file: f.file, abs: path.join(base, f.file), pool: f.pool });
      }
    }
    return files.filter((e) => fs.existsSync(e.abs));
  }
  const out = [];
  for (const dir of [GENERATED_DIR, READY_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      out.push({ file: f, abs: path.join(dir, f), pool: dir === READY_DIR ? 'ready' : 'generated' });
    }
  }
  return out;
}

function collectStrings(obj, out = []) {
  if (typeof obj === 'string') out.push(obj);
  else if (Array.isArray(obj)) obj.forEach((x) => collectStrings(x, out));
  else if (obj && typeof obj === 'object') Object.values(obj).forEach((x) => collectStrings(x, out));
  return out;
}

/** Token-level diff: only allow decap of V2 verb lemmas. */
function unexpectedTokens(before, after) {
  const re = /\b([A-ZÄÖÜ][a-zäöüß]+)\b/g;
  const bad = [];
  const bMap = new Map();
  let m;
  while ((m = re.exec(before)) !== null) {
    bMap.set(m[1].toLowerCase(), m[1]);
  }
  re.lastIndex = 0;
  while ((m = re.exec(after)) !== null) {
    const lc = m[1].toLowerCase();
    const prev = bMap.get(lc);
    if (prev && prev !== m[1]) {
      const wasCap = /^[A-ZÄÖÜ]/.test(prev);
      const nowLow = m[1] === lc;
      if (wasCap && nowLow && !V2_LEMMAS.has(lc)) {
        bad.push({ from: prev, to: m[1], lemma: lc });
      }
      if (!wasCap && /^[A-ZÄÖÜ]/.test(m[1]) && !V2_LEMMAS.has(lc)) {
        bad.push({ from: prev, to: m[1], lemma: lc, kind: 'cap' });
      }
    }
  }
  return bad;
}

async function main() {
  const v32 = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/germanCapsNormalize.mjs')).href);
  const unexpected = [];

  for (const snippet of FP_ISOLATED) {
    const result = norm(snippet);
    if (result !== snippet) {
      unexpected.push({ reason: 'FP isolated changed', snippet, result });
    }
  }

  const files = listBacklogFiles();
  const changedFiles = [];

  for (const { file, abs, pool } of files) {
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const beforeStrings = collectStrings(batch);
    const r = v32.applyGermanCapsNormalize(structuredClone(batch));
    const afterStrings = collectStrings(r.batch);
    if (!r.stats.fieldsChanged) continue;
    changedFiles.push({ file, pool, stats: r.stats });
    for (let i = 0; i < beforeStrings.length; i++) {
      const b = beforeStrings[i];
      const a = afterStrings[i];
      if (b === a) continue;
      const bad = unexpectedTokens(b, a);
      if (bad.length) unexpected.push({ file, pool, reason: 'non-V2 token change', before: b.slice(0, 120), bad });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    files: files.length,
    fpIsolatedTests: FP_ISOLATED.length,
    changedFiles: changedFiles.length,
    unexpected,
    changedFiles,
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  const md = [
    '# verb_census V2 guard — backlog regression (587)',
    '',
    `**Fecha:** ${report.generatedAt}`,
    `**Archivos:** ${files.length}`,
    `**FP aislados:** ${FP_ISOLATED.length} — violaciones: ${unexpected.filter((u) => u.reason === 'FP isolated changed').length}`,
    `**Archivos con cambios normalize:** ${changedFiles.length}`,
    `**Inesperados:** ${unexpected.length}`,
    '',
    unexpected.length ? 'Ver JSON para detalle.' : 'Ninguno — FP intactos; solo decap V2 en corpus.',
  ].join('\n');
  fs.writeFileSync(OUT_MD, `${md}\n`);

  console.log(md);
  console.log(`\nEscrito: ${path.relative(ROOT, OUT_JSON)}`);
  if (unexpected.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
