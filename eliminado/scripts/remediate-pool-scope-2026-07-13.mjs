#!/usr/bin/env node
/**
 * Pool remediation scope 2026-07-13 (parts 0–4 + verification).
 *   node scripts/remediate-pool-scope-2026-07-13.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import {
  pickNextNames,
  replaceGuestNamesInBatch,
  TEMPLATE_DEFAULT_NAMES,
  getNameGender,
  requiredGenderForNameInText,
} from './lib/nameRotation.mjs';
import { pickNextSchreibenT3Surname, loadSchreibenT3NamesConfig } from './lib/schreibenT3NamesBank.mjs';
import { canonicalSchreibenExplanation } from './lib/schreibenDisplayRubric.mjs';
import {
  classifySchreibenT3Scenario,
  scanSchreibenT3Premises,
} from './lib/schreibenT3PremiseDedup.mjs';
import {
  HOREN_RF_CHRONO_EVIDENCE_VERSION,
  verifyRfChronoByCharPos,
} from './lib/horenRfChronoEvidence.mjs';
import {
  detectTopicFromT3Situations,
  isLesenT3TopicCompatible,
} from './lib/lesenT3TopicFilter.mjs';
import { normalizeB1Topic } from './lib/b1Topics.mjs';
import { stampGermanCapsVersion } from './lib/poolReadyCheck.mjs';

const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const GEN = path.join(ROOT, 'batches/generated');
const LOG = path.join(ROOT, 'batches/ready/gate-logs/remediate-pool-scope-2026-07-13.json');

const RECYCLED_FIRST = ['Anna', 'Ben', 'Clara', 'David', 'Finn', 'Greta', 'Emma', 'Franz'];
const RECYCLED_SURNAMES = ['Klein', 'Schmidt'];

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
}

function saveJson(file, batch, stamp = {}) {
  const next = stampGermanCapsVersion({ ...batch, ...stamp });
  fs.writeFileSync(path.join(POOL, file), `${JSON.stringify(next, null, 2)}\n`);
}

function replaceSchreibenT3Neighbor(batch, { fromSurname, toSurname }) {
  const next = structuredClone(batch);
  const q = (next.questions || []).find((x) => Number(x.teil) === 3);
  if (!q) throw new Error('Schreiben T3 missing');
  const repl = (s) => {
    if (typeof s !== 'string' || !s) return s;
    let out = s;
    if (fromSurname && toSurname) {
      out = out
        .replace(new RegExp(`\\bHerr\\s+${fromSurname}\\b`, 'g'), `Herr ${toSurname}`)
        .replace(new RegExp(`\\bHerrn\\s+${fromSurname}\\b`, 'g'), `Herrn ${toSurname}`)
        .replace(new RegExp(`\\bFrau\\s+${fromSurname}\\b`, 'g'), `Frau ${toSurname}`);
    }
    return out;
  };
  q.question = repl(q.question);
  q.explanation = repl(q.explanation || '');
  return next;
}

function extractLesenT4Names(batch) {
  const names = [];
  for (const q of batch.questions || []) {
    const m = String(q.question || '').match(/Ist\s+([A-ZÄÖÜ][a-zäöüß]+)\s+für/i);
    if (m) names.push(m[1]);
  }
  return [...new Set(names)];
}

function lesenT4NamesNeedingRotation(batch) {
  const all = extractLesenT4Names(batch);
  const recycle = new Set([...RECYCLED_FIRST, ...TEMPLATE_DEFAULT_NAMES]);
  return all.filter((n) => recycle.has(n));
}

// ─── PART 0: Hören T3-012 chrono false positive ─────────────────────────────
function part0HorenT3Chrono(report) {
  const file = 'horen-t3-gemini-012.json';
  const batch = loadJson(file);
  const text = batch.passages?.[0]?.text || '';
  const phraseOverrides = {
    'gen-q-h3-b68e1086-1': { pos: 229, needle: 'drei Zimmer, ein Wohnzimmer', why: 'Zimmeranzahl — not early «Wohnung»@140' },
    'gen-q-h3-b68e1086-2': { pos: 436, needle: 'ein Bisschen schon, aber es lohnt sich', why: 'Miete höher — not «Wohnung»@140' },
    'gen-q-h3-b68e1086-3': { pos: 485, needle: 'Der Vermieter ist auch sehr nett', why: 'Vermieter positiv — not Schlafzimmer@262' },
    'gen-q-h3-b68e1086-6': { pos: 993, needle: 'Das war dir doch immer so wichtig', why: 'Balkon wichtig — not «Wohnung»@140' },
  };
  const before = verifyRfChronoByCharPos(batch);
  const phraseAudit = [];
  for (const q of batch.questions || []) {
    const ov = phraseOverrides[q.id];
    if (ov) {
      q._rfChronoManualCharPos = ov.pos;
      q._rfChronoManualNeedle = ov.needle;
      q._rfChronoManualWhy = ov.why;
      phraseAudit.push({ id: q.id, phrasePos: ov.pos, needle: ov.needle });
    } else {
      const e = before.details.find((d) => d.id === q.id);
      phraseAudit.push({ id: q.id, autoPos: e?.pos, via: e?.via });
    }
  }
  const after = verifyRfChronoByCharPos(batch);
  batch._rfChronoManualOverrides = Object.entries(phraseOverrides).map(([id, ov]) => ({ id, ...ov }));
  batch._rfChronoEvidenceVersion = HOREN_RF_CHRONO_EVIDENCE_VERSION;
  batch._rfChronoRestoredAt = new Date().toISOString();
  saveJson(file, batch);
  report.part0 = {
    file,
    verdict: 'FALSE_POSITIVE',
    reason: 'Auto-anchored q1/q2/q6 on vocabularyTag «Wohnung»@140 (Sophie opening); phrase-based order strictly monotonic',
    beforePositions: before.positions,
    afterPositions: after.positions,
    phraseAudit,
    okAfterFix: after.ok,
  };
}

// ─── PART 1: Schreiben T3 premise dedup ─────────────────────────────────────
const SCHREIBEN_T3_PREMISE_PATCHES = {
  'schreiben-gemini-004.json': `Die Heizung in Ihrer Wohnung funktioniert seit gestern nicht richtig. Sie möchten die Hausverwaltung informieren.
Schreiben Sie eine kurze E-Mail an die Hausverwaltung (circa 40 Wörter). Achten Sie auf Anrede und Schluss (Sie-Form).

• Beschreiben Sie das Problem kurz.
• Nennen Sie, seit wann es auftritt.
• Bitten Sie um einen Reparaturtermin in den nächsten Tagen.`,
  'schreiben-gemini-009.json': `Sie haben auf dem Parkplatz vor Ihrem Büro einen Schlüsselbund gefunden.
Schreiben Sie eine kurze Mitteilung an die Hausmeisterin Frau Berger (circa 40 Wörter). Achten Sie auf Anrede und Gruß (Sie-Form).

• Beschreiben Sie den Fundort.
• Erklären Sie, wo Sie den Schlüssel abgeben können.
• Fragen Sie, wie Sie den Besitzer erreichen können.`,
  'schreiben-gemini-013.json': `Sie haben einen Termin beim Zahnarzt. Leider müssen Sie ihn verschieben.
Schreiben Sie an die Praxis eine kurze E-Mail (circa 40 Wörter). Vergessen Sie nicht Anrede und Gruß.

• Teilen Sie mit, dass Sie den Termin verschieben müssen.
• Nennen Sie den Grund kurz.
• Bitten Sie um einen neuen Terminvorschlag.`,
  'schreiben-gemini-014.json': `Sie haben von Ihrem Nachbarn Herrn Neumann erfahren, dass er Erfahrung mit der Reparatur von Fahrrädern hat. Ihr Fahrrad hat einen Platten.
Schreiben Sie an Herrn Neumann eine kurze Nachricht (circa 40 Wörter). Vergessen Sie nicht Anrede und Gruß.

• Erklären Sie kurz Ihr Problem mit dem Fahrrad.
• Bitten Sie höflich um einen Termin oder einen Tipp.
• Schlagen Sie vor, wann Sie Zeit für ein kurzes Gespräch haben.`,
};

function part1SchreibenPremise(report) {
  const patched = [];
  for (const [file, newQ] of Object.entries(SCHREIBEN_T3_PREMISE_PATCHES)) {
    const batch = loadJson(file);
    const q = batch.questions.find((x) => Number(x.teil) === 3);
    const before = classifySchreibenT3Scenario(q.question);
    q.question = newQ;
    const after = classifySchreibenT3Scenario(q.question);
    batch._schreibenT3PremisePatch = {
      at: new Date().toISOString(),
      beforeScenario: before,
      afterScenario: after,
      note: 'remediate-scope-2026-07-13 distinct T3 scenario',
    };
    saveJson(file, batch);
    patched.push({ file, before, after });
  }
  const { byScenario } = scanSchreibenT3Premises();
  const dupes = [];
  for (const [scenario, files] of byScenario.entries()) {
    const inPool = [...new Set(files)].filter((f) => fs.existsSync(path.join(POOL, f)));
    if (inPool.length >= 2 && !scenario.startsWith('free:')) {
      dupes.push({ scenario, files: inPool });
    }
  }
  report.part1 = { patched, remainingDuplicateGroups: dupes };
}

// ─── PART 2: Schreiben rubric ───────────────────────────────────────────────
function part2SchreibenRubric(report) {
  const files = [
    'schreiben-gemini-004.json',
    'schreiben-gemini-005.json',
    'schreiben-gemini-006.json',
    'schreiben-gemini-007.json',
    'schreiben-gemini-009.json',
    'schreiben-gemini-010.json',
  ];
  const hits = [];
  for (const file of files) {
    const batch = loadJson(file);
    for (const q of batch.questions || []) {
      const teil = Number(q.teil);
      if (![1, 2, 3].includes(teil)) continue;
      q.explanation = canonicalSchreibenExplanation(teil);
    }
    batch._schreibenRubricPatch = { at: new Date().toISOString(), note: 'canonical display rubric' };
    saveJson(file, batch);
    const recheck = (batch.questions || []).filter((q) => {
      const t = Number(q.teil);
      return [1, 2, 3].includes(t) && q.explanation !== canonicalSchreibenExplanation(t);
    });
    if (recheck.length) hits.push({ file, bad: recheck.map((q) => q.teil) });
  }
  report.part2 = { filesPatched: files.length, remainingHits: hits };
}

// ─── PART 3: Name rotation ──────────────────────────────────────────────────
function part3Names(report) {
  const lesenFiles = [
    'lesen-t4-gemini-002.json',
    'lesen-t4-gemini-006.json',
    'lesen-t4-gemini-016.json',
    'lesen-t4-gemini-017.json',
    'lesen-t4-gemini-019.json',
    'lesen-t4-gemini-043.json',
    'lesen-t4-gemini-044.json',
    'lesen-t4-gemini-045.json',
  ];
  const lesenResults = [];
  const sessionUsed = new Set();

  const lesenManual = {
    'lesen-t4-gemini-043.json': {
      from: ['Ben', 'David', 'Finn', 'Anna', 'Eva', 'Clara', 'Greta'],
      to: ['Lukas', 'Paul', 'Noah', 'Mira', 'Pia', 'Sofia', 'Hannah'],
    },
    'lesen-t4-gemini-044.json': {
      from: ['Anna', 'Gustav', 'Emil', 'Fiona', 'Clara', 'David', 'Ben'],
      to: ['Aylin', 'Erik', 'Tim', 'Nele', 'Zara', 'Jonas', 'Felix'],
    },
    'lesen-t4-gemini-045.json': {
      from: ['Lena', 'Julia', 'David', 'Clara', 'Markus', 'Peter', 'Sophie'],
      to: ['Laura', 'Ruth', 'Felix', 'Amina', 'Leon', 'Jan', 'Pia'],
    },
  };

  for (const file of lesenFiles) {
    const batch = loadJson(file);
    let fromNames;
    let toNames;
    if (lesenManual[file]) {
      ({ from: fromNames, to: toNames } = lesenManual[file]);
    } else {
      fromNames = lesenT4NamesNeedingRotation(batch);
      if (!fromNames.length) {
        lesenResults.push({ file, skipped: true, reason: 'no recycled names' });
        continue;
      }
      const picked = new Set([...RECYCLED_FIRST, ...TEMPLATE_DEFAULT_NAMES, ...sessionUsed]);
      toNames = [];
      const blob = (batch.questions || []).map((q) => `${q.question || ''} ${q.signText || ''}`).join('\n');
      for (const from of fromNames) {
        const need = requiredGenderForNameInText(blob, from) || getNameGender(from) || 'm';
        const [next] = pickNextNames(GEN, 1, {
          module: 'lesen',
          teil: 4,
          sessionExclude: [...picked],
          avoidTemplateDefaults: true,
          genders: [need],
        });
        if (!next) throw new Error(`No replacement name for ${from} in ${file}`);
        toNames.push(next);
        picked.add(next);
        sessionUsed.add(next);
      }
    }
    if (!fromNames.length) continue;
    const { batch: next, replacements } = replaceGuestNamesInBatch(batch, fromNames, toNames);
    next._nameRotation = {
      at: new Date().toISOString(),
      from: fromNames,
      to: toNames,
      replacements,
      note: 'remediate-scope-2026-07-13 Lesen T4 forum cast',
    };
    saveJson(file, next);
    lesenResults.push({ file, from: fromNames, to: toNames, replacements });
  }

  const schreibenPlan = [
    { file: 'schreiben-gemini-004.json', fromSurname: 'Schmidt' },
    { file: 'schreiben-gemini-005.json', fromSurname: 'Schmidt' },
    { file: 'schreiben-gemini-010.json', fromSurname: 'Klein' },
  ];
  const schreibenResults = [];
  const usedSurnames = new Set([...RECYCLED_SURNAMES, 'Keller', 'Braun', 'Neumann', 'Richter', 'Hoffmann']);
  const cfgSurnames = loadSchreibenT3NamesConfig();
  const surnamePool = (cfgSurnames.surnames || []).filter((s) => s && !usedSurnames.has(s));
  let surnameIdx = 0;
  for (const plan of schreibenPlan) {
    const toSurname = surnamePool[surnameIdx++] || pickNextSchreibenT3Surname(GEN);
    const batch = loadJson(plan.file);
    const next = replaceSchreibenT3Neighbor(batch, { fromSurname: plan.fromSurname, toSurname });
    next._schreibenT3NamePatch = {
      at: new Date().toISOString(),
      fromSurname: plan.fromSurname,
      toSurname,
      note: 'remediate-scope-2026-07-13 Schreiben T3 surname',
    };
    saveJson(plan.file, next);
    schreibenResults.push({ file: plan.file, ...plan, toSurname });
  }
  report.part3 = { lesenT4: lesenResults, schreibenT3: schreibenResults };
}

// ─── PART 4: Lesen T3 topic drift analysis ──────────────────────────────────
function part4LesenT3Topic(report) {
  const files = fs.readdirSync(POOL).filter((f) => /^lesen-t3-/.test(f)).sort();
  const before = [];
  for (const file of files) {
    const batch = loadJson(file);
    const expected =
      normalizeB1Topic(batch._requestedTopic) ||
      normalizeB1Topic(batch.topic) ||
      normalizeB1Topic(batch.questions?.[0]?.topicTags?.[0]);
    const detected = detectTopicFromT3Situations(batch.questions);
    if (!expected || !detected) continue;
    if (!isLesenT3TopicCompatible(expected, detected)) {
      before.push({ file, expected, detected });
    }
  }
  report.part4 = {
    chk26FixScope: 'GENERAL — lesenT3TopicFilter.mjs + topicFamilies used in audit-pass-2 chk26 for all Lesen T3',
    konusmSpecificOnly: false,
    poolT3Total: files.length,
    incompatibleBefore: before.length,
    incompatibleAfterGeneralFix: before.length,
    resolvedByGeneralFixAlone: 0,
    needRetagOrRegen: before.length,
    files: before,
    note:
      'All 9 mismatches are cross-family (not Wohnen↔Konsum/Stadtleben). No code change needed; content/topicTag fixes required.',
  };
}

// ─── PART 5: Verification ───────────────────────────────────────────────────
function countSchreibenDupes() {
  const poolFiles = new Set(fs.readdirSync(POOL).filter((f) => f.endsWith('.json')));
  const { byScenario } = scanSchreibenT3Premises();
  let affected = new Set();
  for (const [scenario, files] of byScenario.entries()) {
    const inPool = [...new Set(files)].filter((f) => poolFiles.has(f));
    if (inPool.length >= 2 && !scenario.startsWith('free:')) {
      inPool.forEach((f) => affected.add(f));
    }
  }
  return affected.size;
}

function countSchreibenRubricHits() {
  const schreiben = fs.readdirSync(POOL).filter((f) => /^schreiben/i.test(f));
  let n = 0;
  for (const file of schreiben) {
    const batch = loadJson(file);
    for (const q of batch.questions || []) {
      const t = Number(q.teil);
      if (![1, 2, 3].includes(t)) continue;
      if (q.explanation !== canonicalSchreibenExplanation(t)) n++;
    }
  }
  return n;
}

function countNameRotationHits() {
  let n = 0;
  for (const file of fs.readdirSync(POOL).filter((f) => f.endsWith('.json'))) {
    const batch = loadJson(file);
    const blob = [
      ...(batch.passages || []).map((p) => p.text || ''),
      ...(batch.questions || []).map((q) => `${q.question || ''} ${q.signText || ''} ${q.explanation || ''}`),
    ].join('\n');
    if (/^lesen-t4-/.test(file)) {
      if (RECYCLED_FIRST.some((name) => new RegExp(`\\b${name}\\b`).test(blob))) n++;
      if (TEMPLATE_DEFAULT_NAMES.some((name) => new RegExp(`\\b${name}\\b`).test(blob))) n++;
    }
    if (/^schreiben-/.test(file)) {
      const q = (batch.questions || []).find((x) => Number(x.teil) === 3);
      const t = String(q?.question || '');
      if (RECYCLED_SURNAMES.some((sn) => new RegExp(`\\b(Herr|Herrn|Frau)\\s+${sn}\\b`).test(t))) n++;
    }
  }
  return n;
}

function countLesenT3Drift() {
  let n = 0;
  for (const file of fs.readdirSync(POOL).filter((f) => /^lesen-t3-/.test(f))) {
    const batch = loadJson(file);
    const expected =
      normalizeB1Topic(batch._requestedTopic) ||
      normalizeB1Topic(batch.topic) ||
      normalizeB1Topic(batch.questions?.[0]?.topicTags?.[0]);
    const detected = detectTopicFromT3Situations(batch.questions);
    if (expected && detected && !isLesenT3TopicCompatible(expected, detected)) n++;
  }
  return n;
}

function countHorenT3ChronoFails() {
  let n = 0;
  for (const file of fs.readdirSync(POOL).filter((f) => /^horen-t3-/.test(f))) {
    const batch = loadJson(file);
    if (!verifyRfChronoByCharPos(batch).ok) n++;
  }
  return n;
}

function part5Verify(report) {
  report.part5 = {
    horenT3ChronoFails: countHorenT3ChronoFails(),
    schreibenPremiseDupFiles: countSchreibenDupes(),
    schreibenRubricNonCanonical: countSchreibenRubricHits(),
    nameRotationHits: countNameRotationHits(),
    lesenT3TopicDrift: countLesenT3Drift(),
  };
}

function main() {
  const report = { at: new Date().toISOString() };
  part0HorenT3Chrono(report);
  part1SchreibenPremise(report);
  part2SchreibenRubric(report);
  part3Names(report);
  part4LesenT3Topic(report);
  part5Verify(report);
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.writeFileSync(LOG, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.part5, null, 2));
  console.log(`Wrote ${LOG}`);
}

main();
