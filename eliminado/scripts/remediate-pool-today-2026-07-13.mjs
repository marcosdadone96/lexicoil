#!/usr/bin/env node
/**
 * Remediation 2026-07-13 — nombres (6), MCQ Lesen (4 Q), retiro Hören dup, auditoría final.
 *
 *   node scripts/remediate-pool-today-2026-07-13.mjs --patch          # PART 1+2
 *   node scripts/remediate-pool-today-2026-07-13.mjs --retire-horen   # PART 3+4 prep
 *   node scripts/remediate-pool-today-2026-07-13.mjs --audit          # PART 5
 *   node scripts/remediate-pool-today-2026-07-13.mjs --all
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import {
  pickNextNames,
  replaceGuestNamesInBatch,
  TEMPLATE_DEFAULT_NAMES,
} from './lib/nameRotation.mjs';
import { loadSchreibenT3NamesConfig } from './lib/schreibenT3NamesBank.mjs';
import { collectMcqLengthBiasIssues, checkMcqQuestionLengthBias } from './lib/mcqLengthBias.mjs';
import { classifyHorenScenario } from './lib/horenPremiseDedup.mjs';
import { stampGermanCapsVersion } from './lib/poolReadyCheck.mjs';

const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const GEN = path.join(ROOT, 'batches/generated');
const NEEDS = path.join(ROOT, 'batches/needs-regeneration');
const LOG = path.join(ROOT, 'batches/ready/gate-logs/remediate-pool-today-2026-07-13.json');

const TODAY = '2026-07-13';
const RECYCLED_FIRST = ['Anna', 'Ben', 'Clara', 'David', 'Finn', 'Greta'];
const RECYCLED_SURNAMES = ['Klein', 'Schmidt'];
const HOREN_T1_RETIRE = [
  'horen-t1-gemini-018.json',
  'horen-t1-gemini-019.json',
  'horen-t1-gemini-020.json',
  'horen-t1-gemini-021.json',
  'horen-t1-gemini-022.json',
  'horen-t1-gemini-023.json',
];
const HOREN_T2_RETIRE = [
  'horen-t2-gemini-024.json',
  'horen-t2-gemini-025.json',
  'horen-t2-gemini-026.json',
  'horen-t2-gemini-027.json',
];

const MCQ_PATCHES = {
  'lesen-t2-gemini-107.json': {
    'gen-q-2-3e69c368-1': [
      'a) Nur ältere Menschen schalten Radio ein; junge Leute meiden es meist.',
      'b) Es ist die einzige Quelle für Musik und Nachrichten ohne ein extra Gerät.',
      'c) Es bietet aktuelle Meldungen und Unterhaltung für den Alltag.',
    ],
    'gen-q-2-3e69c368-2': [
      'a) Sie informieren über Geschehnisse und regionale Angelegenheiten.',
      'b) Sie senden ausschließlich am Wochenende spezielle Programme für die Region.',
      'c) Sie spielen fast nur internationale Popmusik und ignorieren lokale Themen.',
    ],
  },
  'lesen-t5-gemini-079.json': {
    'gen-q-5-b7f628e2-3': [
      'a) Besucher parken gratis vorn; Busse und Wohnmobile müssen hinten parken.',
      'b) Für alle Fahrzeugtypen gibt es nur kostenpflichtige Plätze hinter dem Gebäude.',
      'c) Jedes Fahrzeug darf gratis direkt vor dem Eingang parken, auch Reisebusse.',
    ],
    'gen-q-5-b7f628e2-4': [
      'a) 20 Euro pro Stunde für den Raum; die Kochmöglichkeit ist ohne Aufpreis enthalten.',
      'b) 30 Euro insgesamt, und die Anmeldung für Seminarräume erfolgt nur online über das Portal.',
      'c) 30 Euro, und man muss sich an der Rezeption melden.',
    ],
  },
};

function loadJson(dir, file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

function saveJson(dir, file, batch, stamp = {}) {
  const next = stampGermanCapsVersion({ ...batch, ...stamp });
  fs.writeFileSync(path.join(dir, file), `${JSON.stringify(next, null, 2)}\n`);
}

function dirsFor(file) {
  const out = [POOL];
  if (fs.existsSync(path.join(GEN, file))) out.push(GEN);
  return out;
}

function replaceSchreibenT3Neighbor(batch, { fromSurname, toSurname, fromFirst, toFirst }) {
  const next = structuredClone(batch);
  const q = (next.questions || []).find((x) => Number(x.teil) === 3);
  if (!q) throw new Error('Schreiben T3 question missing');

  const repl = (s) => {
    if (typeof s !== 'string' || !s) return s;
    let out = s;
    if (fromSurname && toSurname) {
      out = out
        .replace(new RegExp(`\\bHerr\\s+${fromSurname}\\b`, 'g'), `Herr ${toSurname}`)
        .replace(new RegExp(`\\bHerrn\\s+${fromSurname}\\b`, 'g'), `Herrn ${toSurname}`)
        .replace(new RegExp(`\\bFrau\\s+${fromSurname}\\b`, 'g'), `Frau ${toSurname}`);
    }
    if (fromFirst && toFirst) {
      out = out
        .replace(new RegExp(`\\bNachbarin\\s+${fromFirst}\\b`, 'g'), `Nachbarin ${toFirst}`)
        .replace(new RegExp(`\\ban\\s+${fromFirst}\\b`, 'g'), `an ${toFirst}`)
        .replace(new RegExp(`\\b${fromFirst}\\b`, 'g'), toFirst);
    }
    return out;
  };

  q.question = repl(q.question);
  q.explanation = repl(q.explanation || '');
  return next;
}

function pickSchreibenSurnames(n, used = new Set()) {
  const cfg = loadSchreibenT3NamesConfig();
  const banned = new Set([...RECYCLED_SURNAMES, ...(cfg.excludeSurnames || [])]);
  const pool = (cfg.surnames || []).filter((s) => s && !banned.has(s) && !used.has(s));
  if (pool.length < n) throw new Error(`Not enough Schreiben T3 surnames (${pool.length} < ${n})`);
  return pool.slice(0, n);
}

function patchNames(report) {
  // Lesen T4-046
  const lesenFile = 'lesen-t4-gemini-046.json';
  const existing = loadJson(POOL, lesenFile);
  if (!existing._nameRotation?.note?.includes('remediate-2026-07-13')) {
    const fromT4 = RECYCLED_FIRST;
    const toT4 = pickNextNames(GEN, 6, {
      module: 'lesen',
      teil: 4,
      sessionExclude: ['Emilia'],
      genders: ['f', 'm', 'f', 'm', 'm', 'f'],
    });
    for (const dir of dirsFor(lesenFile)) {
      const batch = loadJson(dir, lesenFile);
      const { batch: next, replacements } = replaceGuestNamesInBatch(batch, fromT4, toT4);
      next._nameRotation = {
        at: new Date().toISOString(),
        from: fromT4,
        to: toT4,
        replacements,
        note: 'remediate-2026-07-13 Lesen T4 forum cast',
      };
      saveJson(dir, lesenFile, next);
    }
    report.names.lesenT4 = { file: lesenFile, from: fromT4, to: toT4 };
  } else {
    report.names.lesenT4 = { file: lesenFile, skipped: true, prior: existing._nameRotation };
  }

  const schreibenPlan = [
    { file: 'schreiben-gemini-012.json', fromSurname: 'Klein' },
    { file: 'schreiben-gemini-013.json', fromSurname: 'Schmidt' },
    { file: 'schreiben-gemini-014.json', fromSurname: 'Schmidt' },
    { file: 'schreiben-gemini-015.json', fromSurname: 'Klein' },
    { file: 'schreiben-gemini-016.json', fromFirst: 'Anna', toFirst: 'Mira' },
  ];
  const surnames = pickSchreibenSurnames(4);
  let si = 0;
  for (const plan of schreibenPlan) {
    const existingSch = loadJson(POOL, plan.file);
    if (existingSch._schreibenT3NamePatch?.note?.includes('remediate-2026-07-13')) {
      report.names.schreiben.push({ file: plan.file, skipped: true });
      continue;
    }
    const patch = { ...plan };
    if (plan.fromSurname) {
      patch.toSurname = surnames[si++];
    }
    for (const dir of dirsFor(plan.file)) {
      const batch = loadJson(dir, plan.file);
      const next = replaceSchreibenT3Neighbor(batch, patch);
      next._schreibenT3NamePatch = {
        at: new Date().toISOString(),
        ...patch,
        note: 'remediate-2026-07-13 Schreiben T3 neighbor name',
      };
      saveJson(dir, plan.file, next);
    }
    report.names.schreiben.push({ file: plan.file, patch });
  }
}

function patchMcqLength(report) {
  for (const [file, byQ] of Object.entries(MCQ_PATCHES)) {
    for (const dir of dirsFor(file)) {
      const batch = loadJson(dir, file);
      for (const q of batch.questions || []) {
        const opts = byQ[q.id];
        if (!opts) continue;
        q.options = opts;
        delete q._lengthBiasQuarantine;
      }
      batch._mcqLengthPatch = {
        at: new Date().toISOString(),
        questionIds: Object.keys(byQ),
        note: 'remediate-2026-07-13 length-bias distractor balance',
      };
      saveJson(dir, file, batch);
    }
    const verify = loadJson(POOL, file);
    const issues = [];
    for (const qid of Object.keys(byQ)) {
      const q = verify.questions.find((x) => x.id === qid);
      const r = checkMcqQuestionLengthBias(q);
      if (r.bad) issues.push(r.detail);
    }
    report.mcq[file] = { patched: Object.keys(byQ), remainingIssues: issues };
    if (issues.length) throw new Error(`${file} still has length bias: ${issues.join('; ')}`);
  }
}

function retireHoren(report) {
  const all = [...HOREN_T1_RETIRE, ...HOREN_T2_RETIRE];
  for (const file of all) {
    const fromPool = path.join(POOL, file);
    if (!fs.existsSync(fromPool)) {
      report.retired.push({ file, status: 'missing_in_pool' });
      continue;
    }
    const dest = path.join(NEEDS, file);
    fs.mkdirSync(NEEDS, { recursive: true });
    const batch = loadJson(POOL, file);
    batch._poolRetired = {
      at: new Date().toISOString(),
      reason: 'remediate-2026-07-13 horen premise/length dup batch',
      from: 'pool-verified',
    };
    fs.writeFileSync(dest, `${JSON.stringify(batch, null, 2)}\n`);
    fs.unlinkSync(fromPool);
    const genPath = path.join(GEN, file);
    if (fs.existsSync(genPath)) fs.unlinkSync(genPath);
    report.retired.push({ file, status: 'moved_to_needs-regeneration' });
  }
}

function isTodayPromoted(file) {
  const abs = path.join(POOL, file);
  if (!fs.existsSync(abs)) return false;
  const m = fs.statSync(abs).mtime.toISOString().slice(0, 10);
  return m === TODAY;
}

function listTodayPoolFiles(extra = []) {
  const fromMtime = fs
    .readdirSync(POOL)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => fs.statSync(path.join(POOL, f)).mtime.toISOString().slice(0, 10) === TODAY);
  return [...new Set([...fromMtime, ...extra])].sort();
}

function contentBlob(batch) {
  const parts = [];
  for (const p of batch.passages || []) {
    parts.push(p.text || '', p.title || '', p.transcript || '');
  }
  for (const q of batch.questions || []) {
    parts.push(q.question || '', q.explanation || '', q.signText || '');
    for (const opt of q.options || []) {
      parts.push(typeof opt === 'string' ? opt : opt?.text || '');
    }
  }
  return parts.join('\n');
}

function batchHasRecycledNames(batch, file) {
  const blob = contentBlob(batch);
  const hits = [];
  if (/lesen-t4-/.test(file)) {
    for (const n of RECYCLED_FIRST) {
      if (new RegExp(`\\b${n}\\b`).test(blob)) hits.push(n);
    }
  }
  if (/^schreiben-/.test(file)) {
    const q = (batch.questions || []).find((x) => Number(x.teil) === 3);
    const t = String(q?.question || '') + String(q?.explanation || '');
    for (const sn of RECYCLED_SURNAMES) {
      if (new RegExp(`\\b(Herr|Herrn|Frau)\\s+${sn}\\b`).test(t)) hits.push(`Herr/Frau ${sn}`);
    }
    for (const n of RECYCLED_FIRST) {
      if (new RegExp(`\\bNachbarin\\s+${n}\\b|\\ban\\s+${n}\\b`).test(t)) hits.push(n);
    }
  }
  return hits;
}

function auditHorenPremise(files) {
  const horen = files.filter((f) => /^horen-t[12]-/.test(f));
  const dupes = [];
  for (const file of horen) {
    const batch = loadJson(POOL, file);
    for (const p of batch.passages || []) {
      const teil = Number(p.teil || batch.questions?.[0]?.teil || 1);
      const scenario = classifyHorenScenario(p.text || p.transcript || '', teil);
      if (scenario.startsWith('free:')) continue;
      const others = horen.filter((f) => f !== file);
      for (const other of others) {
        const ob = loadJson(POOL, other);
        for (const op of ob.passages || []) {
          const ot = Number(op.teil || ob.questions?.[0]?.teil || 1);
          if (classifyHorenScenario(op.text || op.transcript || '', ot) === scenario) {
            dupes.push({ file, other, scenario, passageId: p.id });
          }
        }
      }
    }
  }
  return dupes;
}

function runAudit(extraFiles = []) {
  const files = listTodayPoolFiles(extraFiles);
  const report = {
    at: new Date().toISOString(),
    date: TODAY,
    files,
    lengthBias: { affectedFiles: 0, files: [] },
    names: { affectedFiles: 0, files: [] },
    horenPremise: { duplicatePairs: [] },
    ok: false,
  };

  for (const file of files) {
    const batch = loadJson(POOL, file);
    if (/^lesen-t[25]-|^horen-t2-/.test(file)) {
      const issues = collectMcqLengthBiasIssues(batch);
      if (issues.length) {
        report.lengthBias.affectedFiles++;
        report.lengthBias.files.push({ file, issues });
      }
    }
    const nameHits = batchHasRecycledNames(batch, file);
    if (nameHits.length) {
      report.names.affectedFiles++;
      report.names.files.push({ file, hits: nameHits });
    }
  }

  report.horenPremise.duplicatePairs = auditHorenPremise(files);
  report.ok =
    report.lengthBias.affectedFiles === 0 &&
    report.names.affectedFiles === 0 &&
    report.horenPremise.duplicatePairs.length === 0;
  return report;
}

function verifyNamePatch(report) {
  const targets = [
    'lesen-t4-gemini-046.json',
    'schreiben-gemini-012.json',
    'schreiben-gemini-013.json',
    'schreiben-gemini-014.json',
    'schreiben-gemini-015.json',
    'schreiben-gemini-016.json',
  ];
  for (const file of targets) {
    const hits = batchHasRecycledNames(loadJson(POOL, file), file);
    if (hits.length) throw new Error(`${file} still has recycled names: ${hits.join(', ')}`);
  }
  report.namesVerified = targets;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const doPatch = args.has('--patch') || args.has('--all');
  const doRetire = args.has('--retire-horen') || args.has('--all');
  const doAudit = args.has('--audit') || args.has('--all');

  const report = {
    at: new Date().toISOString(),
    names: { lesenT4: null, schreiben: [] },
    mcq: {},
    retired: [],
    audit: null,
  };

  if (doPatch) {
    patchNames(report);
    verifyNamePatch(report);
    patchMcqLength(report);
    console.log('PATCH OK — names (6) + MCQ Lesen (4 questions)');
  }

  if (doRetire) {
    retireHoren(report);
    console.log(`RETIRED ${report.retired.length} Hören files → needs-regeneration`);
  }

  if (doAudit) {
    report.audit = runAudit();
    console.log(JSON.stringify(report.audit, null, 2));
    if (!report.audit.ok) process.exitCode = 1;
  }

  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.writeFileSync(LOG, `${JSON.stringify(report, null, 2)}\n`);
}

main();
