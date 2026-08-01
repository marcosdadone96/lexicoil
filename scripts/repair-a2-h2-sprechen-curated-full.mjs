#!/usr/bin/env node
/**
 * A2 critical repair: Hören T2 align + Sprechen A2 content + Schreiben cur sync + reassemble e1.
 *   node scripts/repair-a2-h2-sprechen-curated-full.mjs           # dry-run
 *   node scripts/repair-a2-h2-sprechen-curated-full.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { buildExamPartsFromPicked, oralTeilsForLevel } from './lib/examLevelCells.mjs';
import { auditExam, isExamPublishable, partRecordToExamPart } from './audit-pass-2.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';
import { publishVerifiedExamSlots } from './lib/verifiedExamPublishLib.mjs';
import { checkHorenBatchQuality } from './lib/horenBatchQuality.mjs';
import { checkPromptBatchQuality } from './lib/promptBatchQuality.mjs';
import { servedExamPath } from './lib/examPipeline.mjs';
import { localCatalogPath } from './lib/publishedExamLib.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const HPM = require(path.join(ROOT, 'js/engine/horenPictureMatching.js'));

const apply = process.argv.includes('--apply');
const LEVEL = 'A2';
const SLOT = 1;
const POOL = poolVerifiedDir(LEVEL);
const ASM = path.join(ROOT, 'batches/ready/assembled-from-verified/assembled-exam-a2-verified-e1.json');
const LIB_Q = path.join(ROOT, 'library/de/A2/questions.json');

const STANDARD_PICTURES = [
  { key: 'a', icon: '🚴‍♂️', label: 'Fahrrad fahren' },
  { key: 'b', icon: '🇩🇪', label: 'Deutschkurs' },
  { key: 'c', icon: '👫', label: 'Freunde treffen' },
  { key: 'd', icon: '🏋️‍♀️', label: 'Sport machen' },
  { key: 'e', icon: '🏛️', label: 'Museum' },
  { key: 'f', icon: '🎬', label: 'Kino' },
  { key: 'g', icon: '📚', label: 'Lernen' },
  { key: 'h', icon: '🛒', label: 'Einkaufen' },
  { key: 'i', icon: '🍳', label: 'Kochen' },
];

const SPRECHEN_T1 =
  'Sie bekommen vier Karten und stellen mit diesen Karten vier Fragen. Ihr Partner/Ihre Partnerin antwortet. Dann stellt Ihr Partner/Ihre Partnerin vier Fragen und Sie antworten. Sie haben keine Vorbereitungszeit.\n\nIhre Karten:\n1. Geburtstag — Wann haben Sie Geburtstag? Wie feiern Sie?\n2. Wohnort — Wo wohnen Sie? Wie gefällt Ihnen Ihr Wohnort?\n3. Beruf — Was ist Ihr Beruf? Oder: Was möchten Sie gern arbeiten?\n4. Hobby — Was machen Sie gern in Ihrer Freizeit?\n\nStellen Sie zu jeder Karte eine Frage und antworten Sie dann auf die Fragen Ihres Partners/Ihrer Partnerin.';

const SPRECHEN_BY_TOPIC = {
  education: {
    topicTag: 'Sport',
    topicTags: ['Sport'],
    t2: {
      question:
        'Sie bekommen eine Karte und erzählen etwas über Ihr Leben.\n\nIhre Karte:\n«Welchen Sport machen Sie gern?»\n\nErzählen Sie: Wann? Wo? Mit wem?',
      grammarTags: ['g-de-a2-praesens', 'g-de-a2-komparativ'],
    },
    t3: {
      question:
        'Sie möchten mit Ihrem Partner/Ihrer Partnerin ein Geburtstagsgeschenk für einen Sportfreund kaufen und einen Termin dafür finden. Planen Sie gemeinsam, was Sie kaufen und wann Sie einkaufen gehen.\n\nIhre Woche:\nMontag 14–16 Uhr: Deutschkurs\nDienstag 10–12 Uhr: frei\nMittwoch 15–17 Uhr: Arzt\nDonnerstag 9–11 Uhr: frei\nFreitag 16–18 Uhr: Sport\n\nWoche Ihres Partners/Ihrer Partnerin:\nMontag 10–12 Uhr: Arbeit\nDienstag 14–16 Uhr: frei\nMittwoch 11–13 Uhr: frei\nDonnerstag 15–17 Uhr: Meeting\nFreitag 10–12 Uhr: frei\n\nEinigen Sie sich auf ein Geschenk und einen Termin zum Einkaufen.',
      grammarTags: ['g-de-a2-modal', 'g-de-a2-nebensatz'],
    },
    t1Grammar: ['g-de-a2-praesens', 'g-de-a2-modal'],
  },
  health: {
    topicTag: 'Gesundheit',
    topicTags: ['Gesundheit'],
    t2: {
      question:
        'Sie bekommen eine Karte und erzählen etwas über Ihr Leben.\n\nIhre Karte:\n«Was essen Sie gern?»\n\nErzählen Sie: Was? Wann? Mit wem?',
      grammarTags: ['g-de-a2-praesens', 'g-de-a2-perfekt'],
    },
    t3: {
      question:
        'Sie möchten mit Ihrem Partner/Ihrer Partnerin gesundes Essen einkaufen und einen Termin dafür finden. Planen Sie gemeinsam, was Sie kaufen und wann Sie einkaufen gehen.\n\nIhre Woche:\nMontag 9–11 Uhr: Yoga\nDienstag 14–16 Uhr: frei\nMittwoch 10–12 Uhr: Arzt\nDonnerstag 15–17 Uhr: frei\nFreitag 11–13 Uhr: Sport\n\nWoche Ihres Partners/Ihrer Partnerin:\nMontag 14–16 Uhr: Arbeit\nDienstag 14–16 Uhr: frei\nMittwoch 11–13 Uhr: frei\nDonnerstag 9–11 Uhr: Meeting\nFreitag 14–16 Uhr: frei\n\nEinigen Sie sich auf eine Einkaufsliste und einen Termin.',
      grammarTags: ['g-de-a2-modal', 'g-de-a2-dat-akk'],
    },
    t1Grammar: ['g-de-a2-praesens', 'g-de-a2-modal'],
  },
  society: {
    topicTag: 'Gesellschaft',
    topicTags: ['Gesellschaft'],
    t2: {
      question:
        'Sie bekommen eine Karte und erzählen etwas über Ihr Leben.\n\nIhre Karte:\n«Was machen Sie am Wochenende?»\n\nErzählen Sie: Was machen Sie gern? Mit wem? Wo?',
      grammarTags: ['g-de-a2-praesens', 'g-de-a2-komparativ'],
    },
    t3: {
      question:
        'Sie möchten mit Ihrem Partner/Ihrer Partnerin ins Kino gehen und einen Termin finden. Planen Sie gemeinsam, welchen Film Sie sehen und wann Sie gehen.\n\nIhre Woche:\nMontag 18–20 Uhr: Deutschkurs\nDienstag 10–12 Uhr: frei\nMittwoch 15–17 Uhr: Verein\nDonnerstag 9–11 Uhr: frei\nFreitag 19–21 Uhr: frei\n\nWoche Ihres Partners/Ihrer Partnerin:\nMontag 10–12 Uhr: Arbeit\nDienstag 14–16 Uhr: frei\nMittwoch 11–13 Uhr: frei\nDonnerstag 15–17 Uhr: Meeting\nFreitag 18–20 Uhr: frei\n\nEinigen Sie sich auf einen Film und einen Termin.',
      grammarTags: ['g-de-a2-modal', 'g-de-a2-nebensatz'],
    },
    t1Grammar: ['g-de-a2-praesens', 'g-de-a2-modal'],
  },
  work: {
    topicTag: 'Arbeit',
    topicTags: ['Arbeit'],
    t2: {
      question:
        'Sie bekommen eine Karte und erzählen etwas über Ihr Leben.\n\nIhre Karte:\n«Wohin reisen Sie gern und warum?»\n\nErzählen Sie: Wann reisen Sie? Mit wem? Was machen Sie dort?',
      grammarTags: ['g-de-a2-praesens', 'g-de-a2-perfekt'],
    },
    t3: {
      question:
        'Sie möchten mit Ihrem Partner/Ihrer Partnerin eine Fahrradtour planen, um die Stadt zu erkunden. Besprechen Sie gemeinsam, wohin Sie fahren möchten und wann Sie die Tour machen können.\n\nIhre Woche:\nMontag 9–11 Uhr: Deutschkurs\nDienstag 14–16 Uhr: frei\nMittwoch 10–12 Uhr: Arzttermin\nDonnerstag 15–17 Uhr: frei\nFreitag 11–13 Uhr: Sport\n\nWoche Ihres Partners/Ihrer Partnerin:\nMontag 14–16 Uhr: Arbeit\nDienstag 14–16 Uhr: frei\nMittwoch 14–16 Uhr: frei\nDonnerstag 9–11 Uhr: Meeting\nFreitag 14–16 Uhr: frei\n\nEinigen Sie sich auf ein Ziel und einen Termin für Ihre Fahrradtour.',
      grammarTags: ['g-de-a2-modal', 'g-de-a2-nebensatz'],
    },
    t1Grammar: ['g-de-a2-praesens', 'g-de-a2-modal'],
  },
};

const HOREN_T2_FIXES = {
  'horen-t2-cur-society.json': {
    text:
      'Julia: Hi Paul! Was machst du diese Woche?\nPaul: Gute Frage! Erzähl du zuerst — ich höre gern zu.\nJulia: Am Montag gehe ich in die Bibliothek und lerne für die Schule.\nPaul: Das ist fleißig! Am Dienstag mache ich Sport im Park.\nJulia: Super! Am Mittwoch koche ich für den Verein „Nachbarschaft hilft“. Wir machen Suppe für ältere Nachbarn.\nPaul: Toll! Am Donnerstag fahre ich mit dem Fahrrad an den See. Das Wetter soll schön werden.\nJulia: Klingt gut! Am Freitag gehe ich ins Kino mit meiner Schwester. Wir mögen Komödien.\nPaul: Viel Spaß! Ich bleibe am Freitagabend zu Hause und lese.',
    rows: [
      { speaker: 'Julia', day: 'Montag', key: 'g', expl: 'Julia geht am Montag in die Bibliothek und lernt.' },
      { speaker: 'Paul', day: 'Dienstag', key: 'd', expl: 'Paul macht am Dienstag Sport im Park.' },
      { speaker: 'Julia', day: 'Mittwoch', key: 'i', expl: 'Julia kocht am Mittwoch für den Verein.' },
      { speaker: 'Paul', day: 'Donnerstag', key: 'a', expl: 'Paul fährt am Donnerstag mit dem Fahrrad an den See.' },
      { speaker: 'Julia', day: 'Freitag', key: 'f', expl: 'Julia geht am Freitag ins Kino mit ihrer Schwester.' },
    ],
  },
  'horen-t2-cur-health.json': {
    text:
      'Anna: Hallo Tom! Was machst du diese Woche?\nTom: Hallo Anna! Montag gehe ich ins Fitnessstudio — ich brauche Bewegung nach dem Büro.\nAnna: Sehr gut! Am Dienstag kaufe ich frisches Gemüse auf dem Markt. Ich koche gern gesund.\nTom: Lecker! Am Mittwoch besuche ich ein Museum. Es gibt eine neue Ausstellung über Essen.\nAnna: Interessant! Am Donnerstag treffe ich meine Freundin zum Spaziergang im Park.\nTom: Schön! Am Freitag koche ich eine gesunde Gemüsesuppe für meine Familie.\nAnna: Das klingt toll. Ich ruhe mich am Freitagabend aus.',
    rows: [
      { speaker: 'Tom', day: 'Montag', key: 'd', expl: 'Tom geht am Montag ins Fitnessstudio.' },
      { speaker: 'Anna', day: 'Dienstag', key: 'h', expl: 'Anna kauft am Dienstag Gemüse auf dem Markt.' },
      { speaker: 'Tom', day: 'Mittwoch', key: 'e', expl: 'Tom besucht am Mittwoch ein Museum.' },
      { speaker: 'Anna', day: 'Donnerstag', key: 'c', expl: 'Anna trifft am Donnerstag ihre Freundin.' },
      { speaker: 'Tom', day: 'Freitag', key: 'i', expl: 'Tom kocht am Freitag eine gesunde Suppe.' },
    ],
  },
  'horen-t2-cur-work.json': {
    text:
      'Sara: Hallo Felix! Was machst du diese Woche?\nFelix: Hallo Sara! Montag habe ich einen Deutschkurs nach der Arbeit in der Volkshochschule.\nSara: Prima! Am Dienstagabend treffe ich Kollegen im Café. Wir sprechen über das neue Projekt.\nFelix: Klingt gut! Am Mittwoch gehe ich ins Museum mit meiner Tochter. Sie lernt in der Schule Kunst.\nSara: Schön! Am Donnerstag kaufe ich Bücher für meinen Abendkurs. Der Kurs beginnt nächste Woche.\nFelix: Viel Erfolg! Am Freitag koche ich das Abendessen für meine Familie.\nSara: Guten Appetit! Am Wochenende habe ich endlich frei.',
    rows: [
      { speaker: 'Felix', day: 'Montag', key: 'b', expl: 'Felix hat am Montag einen Deutschkurs.' },
      { speaker: 'Sara', day: 'Dienstag', key: 'c', expl: 'Sara trifft am Dienstagabend Kollegen im Café.' },
      { speaker: 'Felix', day: 'Mittwoch', key: 'e', expl: 'Felix geht am Mittwoch ins Museum.' },
      { speaker: 'Sara', day: 'Donnerstag', key: 'h', expl: 'Sara kauft am Donnerstag Bücher für den Kurs.' },
      { speaker: 'Felix', day: 'Freitag', key: 'i', expl: 'Felix kocht am Freitag das Abendessen.' },
    ],
  },
  'horen-t2-cur-education.json': {
    text:
      'Nina: Guten Tag Lukas! Wie ist dein Stundenplan diese Woche?\nLukas: Guten Tag Nina! Am Montag habe ich Deutschkurs in der Volkshochschule. Der Kurs ist sehr interessant.\nNina: Toll! Am Dienstag treffe ich mich mit Lernpartnern im Café. Wir üben Dialoge für die Prüfung.\nLukas: Gut! Am Mittwoch gehe ich ins Museum — wir haben ein Projekt über Geschichte.\nNina: Spannend! Am Donnerstag kaufe ich Bücher für den Kurs. Ich brauche ein neues Wörterbuch.\nLukas: Sehr gut! Am Freitag lerne ich in der Bibliothek für die Prüfung nächste Woche.\nNina: Viel Erfolg! Ich lese am Freitagabend ein Buch auf Deutsch.',
    rows: [
      { speaker: 'Lukas', day: 'Montag', key: 'b', expl: 'Lukas hat am Montag Deutschkurs in der VHS.' },
      { speaker: 'Nina', day: 'Dienstag', key: 'c', expl: 'Nina trifft am Dienstag Lernpartner im Café.' },
      { speaker: 'Lukas', day: 'Mittwoch', key: 'e', expl: 'Lukas geht am Mittwoch ins Museum.' },
      { speaker: 'Nina', day: 'Donnerstag', key: 'h', expl: 'Nina kauft am Donnerstag Bücher für den Kurs.' },
      { speaker: 'Lukas', day: 'Freitag', key: 'g', expl: 'Lukas lernt am Freitag in der Bibliothek für die Prüfung.' },
    ],
  },
  'horen-t2-gemini-040.json': {
    text:
      'Lena: Hallo Max! Hast du Pläne für die Woche?\nMax: Hallo Lena! Ja, ich habe schon ein paar Ideen. Am Montag fahre ich mit dem Fahrrad in den Park.\nLena: Sportlich! Am Dienstag gehe ich ins Fitnessstudio. Ich möchte fit bleiben.\nMax: Sehr gut! Am Mittwoch treffe ich Freunde im Café. Wir reden über den Sommerurlaub.\nLena: Klingt gemütlich! Am Donnerstag besuche ich ein Museum in der Innenstadt.\nMax: Interessant! Am Freitag gehe ich einkaufen — ich brauche noch Geschenke.\nLena: Viel Erfolg! Am Wochenende möchte ich ausruhen.',
    rows: [
      { speaker: 'Max', day: 'Montag', key: 'a', expl: 'Max fährt am Montag mit dem Fahrrad in den Park.' },
      { speaker: 'Lena', day: 'Dienstag', key: 'd', expl: 'Lena geht am Dienstag ins Fitnessstudio.' },
      { speaker: 'Max', day: 'Mittwoch', key: 'c', expl: 'Max trifft am Mittwoch Freunde im Café.' },
      { speaker: 'Lena', day: 'Donnerstag', key: 'e', expl: 'Lena besucht am Donnerstag ein Museum.' },
      { speaker: 'Max', day: 'Freitag', key: 'h', expl: 'Max geht am Freitag einkaufen.' },
    ],
  },
};

const SCHREIBEN_FIXES = {
  'schreiben-cur-health.json': {
    t1Id: 'de-a2-s-t1-krankmeldung-01-q1',
    t2Id: 'de-a2-s-t2-gesundheit-feier-01-q1',
  },
  'schreiben-cur-work.json': {
    t1Id: 'de-a2-s-t1-arbeit-alltag-01-q1',
    t2Id: 'de-a2-s-t2-arbeit-feier-01-q1',
  },
  'schreiben-cur-society.json': {
    t1Id: 'de-a2-s-t1-nachbarschaft-01-q1',
    t2Id: 'de-a2-s-t2-gesellschaft-feier-01-q1',
  },
};

function loadLibraryQuestions() {
  const raw = JSON.parse(fs.readFileSync(LIB_Q, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.questions || [];
  return new Map(list.filter((q) => q?.id).map((q) => [q.id, q]));
}

function writeJson(fp, obj) {
  fs.writeFileSync(fp, `${JSON.stringify(obj, null, 2)}\n`);
}

function fixSprechenCur(topic, file) {
  const spec = SPRECHEN_BY_TOPIC[topic];
  const fp = path.join(POOL, file);
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const before = (batch.questions || []).map((q) => ({
    teil: q.teil,
    hasB1: /\bpr[äa]sentation\b|feedback|sportkurs planen|80 wörter/i.test(String(q.question || '')),
    grammar: q.grammarTags || [],
  }));
  const qs = [
    {
      id: `sp-${topic}-t1`,
      module: 'sprechen',
      teil: 1,
      level: LEVEL,
      lang: 'de',
      type: 'personal_questions',
      question: SPRECHEN_T1,
      correct: 'rubric',
      correctAnswer: 'rubric',
      options: [],
      topicTags: spec.topicTags,
      topicTag: spec.topicTag,
      grammarTags: spec.t1Grammar,
      explanation:
        'Bewertung: vier passende Fragen zu den Karten; verständliche Antworten; einfacher Wortschatz auf A2-Niveau.',
    },
    {
      id: `sp-${topic}-t2`,
      module: 'sprechen',
      teil: 2,
      level: LEVEL,
      lang: 'de',
      type: 'about_self',
      question: spec.t2.question,
      correct: 'rubric',
      correctAnswer: 'rubric',
      options: [],
      topicTags: spec.topicTags,
      topicTag: spec.topicTag,
      grammarTags: spec.t2.grammarTags,
      explanation:
        'Bewertung: verständlicher kurzer Bericht zum Kartenthema; einfacher Wortschatz und Satzstruktur auf A2-Niveau.',
    },
    {
      id: `sp-${topic}-t3`,
      module: 'sprechen',
      teil: 3,
      level: LEVEL,
      lang: 'de',
      type: 'plan_together',
      question: spec.t3.question,
      correct: 'rubric',
      correctAnswer: 'rubric',
      options: [],
      topicTags: spec.topicTags,
      topicTag: spec.topicTag,
      grammarTags: spec.t3.grammarTags,
      explanation:
        'Bewertung: gemeinsame Planung mit passendem Termin; einfache Verhandlung; verständlicher Wortschatz auf A2-Niveau.',
    },
  ];
  batch.level = LEVEL;
  batch.lang = 'de';
  batch.topicTag = spec.topicTag;
  batch.questions = qs;
  batch.passages = [];
  if (apply) writeJson(fp, batch);
  const quality = qs.map((q) =>
    checkPromptBatchQuality({ questions: [q], passages: [] }, 'sprechen', q.teil, { level: LEVEL }),
  );
  return { file, before, afterOk: quality.every((r) => r.ok), qualityIssues: quality.flatMap((r) => r.issues) };
}

function fixHorenT2(file, spec) {
  const fp = path.join(POOL, file);
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const passage = batch.passages?.[0];
  if (!passage) throw new Error(`No passage in ${file}`);
  passage.text = spec.text;
  passage.pictures = STANDARD_PICTURES.map((p) => ({ ...p }));
  if (passage.transcript) passage.transcript = spec.text;
  delete passage.audio;
  const qs = batch.questions || [];
  for (let i = 0; i < spec.rows.length; i++) {
    const row = spec.rows[i];
    const q = qs[i];
    if (!q) continue;
    q.question = `Was macht ${row.speaker} am ${row.day}?`;
    q.correct = row.key;
    q.correctAnswer = row.key;
    q.explanation = row.expl;
    q.type = 'matching';
    delete q.options;
    q._keyOnlyMatch = true;
  }
  const norm = normalizeBatch(batch, { module: 'horen', teil: 2, lang: 'de', level: LEVEL });
  const align = HPM.validatePictureMatchingAlign(norm, { module: 'horen', teil: 2, level: LEVEL });
  const quality = checkHorenBatchQuality(norm, 2, { level: LEVEL });
  if (apply) writeJson(fp, batch);
  return { file, alignIssues: align, qualityOk: quality.ok, qualityIssues: quality.issues };
}

function fixSchreibenCur(file, ids, libById) {
  const fp = path.join(POOL, file);
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const before = (batch.questions || []).map((q) => ({
    teil: q.teil,
    words: q.question?.match(/80|20.?30|30.?40/)?.[0] || '?',
    informal: /\bdu\b|\bdein\b|\bdeine\b/i.test(String(q.question || '')),
  }));
  const t1 = libById.get(ids.t1Id);
  const t2 = libById.get(ids.t2Id);
  if (!t1 || !t2) throw new Error(`Missing library questions for ${file}`);
  batch.questions = [
    {
      id: t1.id,
      module: 'schreiben',
      teil: 1,
      level: LEVEL,
      lang: 'de',
      type: 'short_answer',
      question: t1.question,
      correct: 'rubric',
      correctAnswer: 'rubric',
      topicTags: t1.topicTags || [path.basename(file, '.json').replace('schreiben-cur-', '')],
      options: [],
      grammarTags: t1.grammarTags || ['g-de-a2-praesens'],
    },
    {
      id: t2.id,
      module: 'schreiben',
      teil: 2,
      level: LEVEL,
      lang: 'de',
      type: 'short_answer',
      question: t2.question,
      correct: 'rubric',
      correctAnswer: 'rubric',
      topicTags: t2.topicTags || t1.topicTags,
      options: [],
      grammarTags: t2.grammarTags || ['g-de-a2-modal', 'g-de-a2-nebensatz'],
    },
  ];
  if (apply) writeJson(fp, batch);
  return { file, before, after: batch.questions.map((q) => ({ teil: q.teil, id: q.id })) };
}

function scanCuratedFiles() {
  const files = fs.readdirSync(POOL).filter((f) => f.includes('-cur-') && f.endsWith('.json'));
  const issues = [];
  for (const file of files) {
    const fp = path.join(POOL, file);
    const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const text = JSON.stringify(batch);
    if (/g-de-b1-/.test(text)) issues.push({ file, kind: 'b1-grammar-tags' });
    if (/\bpr[äa]sentation\b.*einleitung|feedback.*pr[äa]sentation|80 wörter|circa 80/i.test(text)) {
      issues.push({ file, kind: 'b1-content-stale' });
    }
    if (file.startsWith('horen-t2')) {
      const align = HPM.validatePictureMatchingAlign(batch, { module: 'horen', teil: 2, level: LEVEL });
      if (align.length) issues.push({ file, kind: 'h2-align', details: align });
    }
    if (file.startsWith('sprechen-cur')) {
      for (const q of batch.questions || []) {
        const r = checkPromptBatchQuality({ questions: [q], passages: [] }, 'sprechen', q.teil, { level: LEVEL });
        if (!r.ok) issues.push({ file, kind: 'sprechen-a2', teil: q.teil, details: r.issues });
      }
    }
  }
  return { files: files.length, issues };
}

function ensureWithdrawnServed() {
  const catalog = JSON.parse(fs.readFileSync(localCatalogPath('de', LEVEL), 'utf8'));
  const live = (catalog.exams || []).filter((e) => e.status === 'live');
  const withdrawn = (catalog.exams || []).filter((e) => e.status === 'withdrawn');
  const served = servedExamPath('de', LEVEL);
  let servedCleared = false;
  if (!live.length && withdrawn.length && fs.existsSync(served)) {
    const cur = JSON.parse(fs.readFileSync(served, 'utf8'));
    if (Array.isArray(cur) && cur.length > 0 && apply) {
      writeJson(served, []);
      servedCleared = true;
      spawnSync('npm', ['run', 'build:availability'], { cwd: ROOT, shell: true, encoding: 'utf8' });
    }
  }
  return {
    catalogStatus: withdrawn[0]?.status || live[0]?.status || 'unknown',
    withdrawnReason: withdrawn[0]?.withdrawnReason || null,
    liveCount: live.length,
    servedCleared,
  };
}

function batchToRecord(batch, file, module, teil) {
  const mod = String(module).toLowerCase();
  const t = Number(teil);
  if (mod === 'lesen') {
    const rec = buildLesenSeedRecordFromBatch(batch, { lang: 'de', level: LEVEL, teil: t, idPrefix: 'pv' });
    rec.id = file.replace(/\.json$/i, '');
    return rec;
  }
  const passages = batch.passages || [];
  const rec = {
    id: file.replace(/\.json$/i, ''),
    module: mod,
    teil: t,
    lang: 'de',
    level: LEVEL,
    questions: batch.questions || [],
    topicTag: batch.topicTag || passages[0]?.topicTag,
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
    }
    rec.passage = passages[0]
      ? {
          title: passages[0].title,
          text: passages[0].text,
          transcript: passages[0].transcript || passages[0].text,
          topicTag: passages[0].topicTag,
          pictures: passages[0].pictures,
        }
      : null;
  }
  return rec;
}

function oralBundleToParts(batch, file, module) {
  const base = file.replace(/\.json$/i, '');
  const schreibenWords = { 1: { min: 20, max: 30 }, 2: { min: 30, max: 40 } };
  const parts = [];
  for (const teil of oralTeilsForLevel(module, LEVEL)) {
    const qs = (batch.questions || []).filter((q) => Number(q.teil) === teil);
    if (!qs.length) continue;
    const rec = {
      id: `${base}-t${teil}`,
      module,
      teil,
      lang: 'de',
      level: LEVEL,
      questions: qs,
      instruction: qs[0]?.question || '',
      task: qs[0]?.question || '',
      topicTag: batch.topicTag || qs[0]?.topicTags?.[0],
      complete: true,
      verified: true,
      ...(module === 'schreiben'
        ? { minWords: schreibenWords[teil].min, maxWords: schreibenWords[teil].max }
        : {}),
    };
    parts.push({
      cell: `${module}_${teil}`,
      id: rec.id,
      file,
      record: rec,
      part: partRecordToExamPart(rec),
    });
  }
  return parts;
}

function loadPartFromPool(cell, partId, sources) {
  const srcFile = sources[cell];
  const fp = path.join(POOL, srcFile);
  let batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const [module, teilStr] = cell.split('_');
  const teil = Number(teilStr);
  if (module === 'schreiben' || module === 'sprechen') {
    const parts = oralBundleToParts(batch, srcFile, module);
    const hit = parts.find((p) => p.id === partId);
    if (!hit) throw new Error(`Oral part ${partId} not in ${srcFile}`);
    return hit;
  }
  batch = normalizeBatch(batch, { module, teil, lang: 'de', level: LEVEL });
  const rec = batchToRecord(batch, srcFile.replace(/\.json$/i, ''), module, teil);
  if (rec.id !== partId) rec.id = partId;
  return { cell, id: partId, file: srcFile, record: rec, part: partRecordToExamPart(rec) };
}

function reassembleE1() {
  const prev = JSON.parse(fs.readFileSync(ASM, 'utf8'));
  const { partIds, sources, topics, poolCells } = prev._meta;
  const picked = {};
  for (const [cell, partId] of Object.entries(partIds)) {
    picked[cell] = loadPartFromPool(cell, partId, sources);
  }
  const exam = buildExamPartsFromPicked(picked, LEVEL);
  const gate = isExamPublishable({ exam, level: LEVEL }, { expectedLevel: LEVEL });
  const audit = auditExam({ exam, level: LEVEL }, 'assembled-e1');
  const doc = {
    _meta: {
      ...prev._meta,
      generatedAt: new Date().toISOString(),
      reassembledFromPoolAt: new Date().toISOString(),
      gate1: { ok: gate.ok, blocking: (gate.blocking || []).slice(0, 12) },
      audit: { critical: audit.critical, important: audit.important },
      partIds,
      sources,
      topics,
      poolCells,
    },
    lang: 'de',
    level: LEVEL,
    goetheFormat: true,
    exam,
  };
  if (apply) writeJson(ASM, doc);
  return { gate, audit, exam, partIds };
}

function verifyExamContent(exam) {
  const h2 = (exam.horenParts || []).find((p) => Number(p.teil) === 2);
  const sp = exam.sprechenParts || [];
  const sch = exam.schreibenParts || [];
  const h2Qs = h2?.items || h2?.questions || [];
  const checks = {
    h2SpeakerQuestions: h2Qs.every((q) => /^Was macht \w+ am \w+\??$/i.test(String(q.question || ''))),
    h2NoBareDay: !h2Qs.some((q) => /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag)$/i.test(String(q.question || '').trim())),
    sprechenNoB1: !sp.some((p) =>
      /\bpr[äa]sentation\b.*einleitung|feedback.*pr[äa]sentation|sportkurs planen/i.test(
        String(p.task || p.instruction || ''),
      ),
    ),
    sprechenCardsT1: /geburtstag.*wohnort.*beruf.*hobby/is.test(
      String(sp.find((p) => Number(p.teil) === 1)?.task || ''),
    ),
    schreibenNo80: !sch.some((p) => /80 wörter|circa 80/i.test(String(p.task || p.instruction || ''))),
    schreibenA2Words: sch.every((p) => {
      const t = Number(p.teil);
      if (t === 1) return p.minWords === 20 && p.maxWords === 30;
      if (t === 2) return p.minWords === 30 && p.maxWords === 40;
      return true;
    }),
  };
  checks.allOk = Object.values(checks).every(Boolean);
  return checks;
}

async function syncFixedBatches(paths) {
  for (const rel of paths) {
    const fp = path.join(POOL, rel);
    const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const mod = rel.startsWith('horen') ? 'horen' : rel.startsWith('sprechen') ? 'sprechen' : 'schreiben';
    await syncPoolVerifiedBatch({
      file: fp,
      batch,
      level: LEVEL,
      opts: { lang: 'de', module: mod, syncBlobs: false },
    });
  }
}

async function main() {
  const report = {
    at: new Date().toISOString(),
    apply,
    withdraw: null,
    sprechen: [],
    horenT2: [],
    schreiben: [],
    scanBefore: null,
    scanAfter: null,
    reassemble: null,
    verify: null,
    publish: null,
  };

  console.log(`\n=== A2 H2+Sprechen+cur scan repair (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  report.withdraw = ensureWithdrawnServed();
  console.log('Withdraw state:', report.withdraw);

  report.scanBefore = scanCuratedFiles();
  console.log(`Scan before: ${report.scanBefore.files} cur files, ${report.scanBefore.issues.length} issues`);

  const libById = loadLibraryQuestions();

  for (const [topic, file] of Object.entries({
    education: 'sprechen-cur-education.json',
    health: 'sprechen-cur-health.json',
    society: 'sprechen-cur-society.json',
    work: 'sprechen-cur-work.json',
  })) {
    report.sprechen.push(fixSprechenCur(topic, file));
  }

  for (const [file, spec] of Object.entries(HOREN_T2_FIXES)) {
    report.horenT2.push(fixHorenT2(file, spec));
  }

  for (const [file, ids] of Object.entries(SCHREIBEN_FIXES)) {
    report.schreiben.push(fixSchreibenCur(file, ids, libById));
  }

  report.scanAfter = scanCuratedFiles();
  report.reassemble = reassembleE1();
  report.verify = verifyExamContent(report.reassemble.exam);

  console.log('\nSprechen fixes:', report.sprechen.map((s) => `${s.file}: ok=${s.afterOk}`).join(', '));
  console.log(
    'Hören T2 fixes:',
    report.horenT2.map((h) => `${h.file}: align=${h.alignIssues.length} quality=${h.qualityOk}`).join(', '),
  );
  console.log('Schreiben fixes:', report.schreiben.map((s) => s.file).join(', '));
  console.log(`Scan after: ${report.scanAfter.issues.length} issues`);
  console.log('Exam verify:', report.verify);
  console.log(
    `GATE-1: ${report.reassemble.gate.ok ? 'PASS' : 'FAIL'} | audit CRITICAL=${report.reassemble.audit.critical}`,
  );

  const poolFixOk =
    report.sprechen.every((s) => s.afterOk) &&
    report.horenT2.every((h) => h.alignIssues.length === 0 && h.qualityOk);

  const ok =
    poolFixOk &&
    report.reassemble.gate.ok &&
    report.reassemble.audit.critical === 0 &&
    (!apply || (report.scanAfter.issues.length === 0 && report.verify.allOk));

  if (apply && ok) {
    await syncFixedBatches([
      ...Object.keys(HOREN_T2_FIXES),
      'sprechen-cur-education.json',
      'sprechen-cur-health.json',
      'sprechen-cur-society.json',
      'sprechen-cur-work.json',
      ...Object.keys(SCHREIBEN_FIXES),
    ]);
    report.publish = await publishVerifiedExamSlots({
      slots: [SLOT],
      lang: 'de',
      level: LEVEL,
      dryRun: false,
      syncServed: true,
    });
    console.log('\nPublished:', report.publish?.published?.join(', '));
    console.log('Live exams:', report.publish?.liveExams?.join(', '));
  }

  const out = path.join(ROOT, 'batches/ready/gate-logs/a2-h2-sprechen-curated-repair-2026-07-21.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  writeJson(out, report);
  console.log(`\nReport: ${path.relative(ROOT, out)}`);
  console.log(ok ? '\n✓ All checks pass\n' : '\n✗ Verification failed\n');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
