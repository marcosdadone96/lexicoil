#!/usr/bin/env node
/**
 * Personal exam — one module at a time; Haiku-shaped fixtures must normalize + validate.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

globalThis.S = { subject: 'de', level: 'B1', history: [] };
globalThis.window = globalThis;
globalThis.lcDebug = { log() {}, warn() {} };

vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/library/adsMatching.js'), 'utf8'), {
  filename: 'adsMatching.js',
});
const src = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examGeneration.js'), 'utf8');
vm.runInThisContext(src, { filename: 'examGeneration.js' });

const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

function validatePersonal(exam) {
  const norm = normalizeExam(exam);
  norm.vocabPersonal = true;
  return new ExamValidator().validate(norm, { strict: false, blueprint: false });
}

// Lesen Teil 1 — Haiku puts R/F in items[] as multiple without options
{
  const check = validatePersonal({
    lang: 'de',
    level: 'B1',
    lesenParts: [
      {
        teil: 1,
        blueprintSlot: 'blog_richtig_falsch',
        text: 'Ein langer Blogtext über Umwelt und Natur in der Stadt mit vielen Details und Beispielen für Schüler.',
        items: Array.from({ length: 6 }, (_, i) => ({
          id: `l${i + 1}`,
          question: `Aussage ${i + 1}?`,
          correct: i % 2 ? 'F' : 'R',
          type: 'multiple',
        })),
      },
    ],
  });
  assert(check.valid, 'lesen teil1 (items→questions rf) validates');
}

// Lesen Teil 4 — forum items with signText + Ja/Nein
{
  const check = validatePersonal({
    lang: 'de',
    level: 'B1',
    lesenParts: [
      {
        teil: 4,
        blueprintSlot: 'forum_opinions',
        items: Array.from({ length: 4 }, (_, i) => ({
          id: `f${i + 1}`,
          signText: `Meinung von Person ${i + 1}: langer Forumtext über das Thema.`,
          question: `Stimmt Person ${i + 1} dem Thema zu?`,
          correct: i % 2 ? 'Nein' : 'Ja',
          type: 'multiple',
        })),
      },
    ],
  });
  assert(check.valid, 'lesen teil4 (forum yn in items) validates');
}

// Lesen Teil 3 — ads matching
{
  const ads = 'ABCDEFGHIJ'.split('').map((k) => ({ key: k, title: `Ad ${k}`, text: `Text ${k}` }));
  const check = validatePersonal({
    lang: 'de',
    level: 'B1',
    lesenParts: [
      {
        teil: 3,
        blueprintSlot: 'ads_matching',
        ads,
        items: Array.from({ length: 5 }, (_, i) => ({
          id: String(13 + i),
          signText: `Situation ${13 + i}: Ich suche etwas.`,
          question: `Welche Anzeige passt?`,
          correct: ads[i].key,
          type: 'matching',
        })),
      },
    ],
  });
  assert(check.valid, 'lesen teil3 (ads matching) validates');
}

// Hören Teil 3 — flat questions + transcript (Haiku shape)
{
  const check = validatePersonal({
    lang: 'de',
    level: 'B1',
    horenParts: [
      {
        teil: 3,
        instruction: 'Richtig oder Falsch?',
        transcript: 'Ein Gespräch über Reisen und Urlaub mit vielen Details und Namen der Sprecher.',
        questions: Array.from({ length: 5 }, (_, i) => ({
          id: `h${i + 1}`,
          question: `Aussage ${i + 1}?`,
          correct: i % 2 ? 'F' : 'R',
          type: 'multiple',
        })),
      },
    ],
  });
  assert(check.valid, 'horen teil3 (flat→segments rf) validates');
}

// Hören Teil 1 — segments with mixed RF + MCQ
{
  const check = validatePersonal({
    lang: 'de',
    level: 'B1',
    horenParts: [
      {
        teil: 1,
        instruction: 'Kurze Texte',
        plays: 2,
        segments: [
          {
            label: 'Text 1',
            transcript: 'Kurzer Hörtext über Wetter und Kleidung.',
            questions: [
              { id: 'h1a', question: 'Es regnet.', correct: 'R', type: 'multiple' },
              {
                id: 'h1b',
                question: 'Was trägt sie?',
                correct: 'b',
                type: 'multiple_choice',
                options: [
                  { key: 'a', text: 'Hut' },
                  { key: 'b', text: 'Mantel' },
                  { key: 'c', text: 'Schuhe' },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  assert(check.valid, 'horen teil1 (segments rf+mcq) validates');
}

// Hören — Haiku duplicate skeleton questions (empty A/B/C/D stubs)
{
  const raw = {
    lang: 'de',
    level: 'B1',
    horenParts: [
      {
        teil: 3,
        instruction: 'Interview',
        plays: 2,
        segments: [
          {
            label: 'Segment 2',
            transcript: 'Moderator: Willkommen. Expertin: Danke. Langer Interviewtext über Lernen und Sprache.',
            questions: [
              {
                id: 'hq1',
                question: 'Was empfiehlt die Expertin?',
                correct: 'b',
                type: 'multiple_choice',
                options: [
                  { key: 'a', text: 'Nur Vokabeln lernen' },
                  { key: 'b', text: 'Im Kontext üben' },
                  { key: 'c', text: 'Grammatik ignorieren' },
                ],
              },
              {
                id: 'hq1stub',
                correct: 'b',
                type: 'multiple_choice',
                options: [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }],
              },
              {
                id: 'hq2',
                correct: 'c',
                options: ['A', 'B', 'C', 'D'],
              },
            ],
          },
        ],
      },
    ],
  };
  const norm = normalizeExam(raw);
  const qCount = norm.horenParts?.[0]?.segments?.[0]?.questions?.length ?? 0;
  assert(qCount === 1, `horen segment keeps 1 real question after prune (got ${qCount})`);
  norm.vocabPersonal = true;
  const check = new ExamValidator().validate(norm, { strict: false, blueprint: false });
  assert(check.valid, 'horen prunes empty MCQ stub questions');
}

// Lesen Teil 3 — situations without part.ads but ads embedded in item.options (bank shape)
{
  const raw = {
    lang: 'de',
    level: 'B1',
    lesenParts: [
      {
        teil: 3,
        blueprintSlot: 'ads_matching',
        instruction: 'Lesen Sie die Situationen 13 bis 19 und die Anzeigen a bis j.',
        items: [
          {
            id: '13',
            type: 'matching',
            signText: 'Marcus sucht einen Intensivkurs für Geschäftsdeutsch.',
            correct: 'B',
            options: [
              'a) Sprachcafé — jeden Donnerstag',
              'b) Intensivkurs Business Deutsch — 4 Wochen',
              'c) Online-Grammatikkurs',
              'd) Konversationskurs für Anfänger',
            ],
          },
          {
            id: '14',
            type: 'matching',
            signText: 'Marcus möchte ungezwungen Deutsch sprechen üben.',
            correct: 'A',
            options: [
              'a) Sprachcafé — jeden Donnerstag',
              'b) Intensivkurs Business Deutsch — 4 Wochen',
              'c) Online-Grammatikkurs',
              'd) Konversationskurs für Anfänger',
            ],
          },
        ],
      },
    ],
  };
  const norm = normalizeExam(raw);
  const part = norm.lesenParts[0];
  assert(part.ads?.length >= 3, `ads extracted from item options (got ${part.ads?.length || 0})`);
  assert(part.items[0].id === '13', 'situation id preserved as 13');
  const opts = part.items[0].options || [];
  assert(opts.length >= 2, 'matching choice keys present');
  assert(part.ads.some((a) => `${a.title || ''} ${a.text || ''}`.includes('Intensiv')), 'ads block has extracted ad text');
  assert(/Situationen 13 bis 14/.test(part.instruction), 'instruction synced to actual situation range');
  assert(typeof lesenPartMissingAds === 'function' && !lesenPartMissingAds(part), 'part has ads after coalesce');
}

// Lesen Teil 3 — missing ads should flag unanswerable
{
  const bad = {
    lesenParts: [{
      teil: 3,
      items: [
        { signText: 'Situation A', correct: 'B', type: 'matching', options: ['A', 'B', 'C', 'D'] },
      ],
    }],
  };
  const norm = normalizeExam(bad);
  assert(lesenPartMissingAds(norm.lesenParts[0]), 'missing ads detected');
  assert(examHasUnanswerableQuestions(norm), 'exam without ads is unanswerable');
}

// Hören Teil 4 — speaker matching: bare A/B/C/D keys → names from transcript
{
  const raw = {
    lang: 'de',
    level: 'B1',
    horenParts: [{
      teil: 4,
      instruction: 'Ordnen Sie die Aussagen den Personen zu.',
      segments: [{
        label: 'Segment 1',
        transcript: 'Moderator: Willkommen.\nFrau Krämer: In meiner Branche steigen die Bewerberzahlen.\nHerr Bauer: Eine solide Ausbildung ist wichtig.',
        questions: [
          {
            id: 'h4q1',
            type: 'matching',
            question: 'In meiner Branche verzeichnen wir steigende Bewerberzahlen.',
            correct: 'A',
            options: ['A', 'B', 'C', 'D'],
          },
          {
            id: 'h4q2',
            type: 'matching',
            question: 'Eine solide Ausbildung ist das Fundament für Erfolg.',
            correct: 'B',
            options: ['A', 'B', 'C', 'D'],
          },
        ],
      }],
    }],
  };
  const norm = normalizeExam(raw);
  const q1 = norm.horenParts[0].segments[0].questions[0];
  assert(q1.options.some(o => (o.text || '').includes('Krämer')), 'speaker A labeled from transcript');
  assert(!q1._keyOnlyMatch, 'horen speaker matching is not key-only');
  const legend = norm.horenParts[0].segments[0].speakerLegend || [];
  assert(legend.some(l => l.includes('Krämer')), 'segment speaker legend present');
}

// examConfig — single module selection
{
  const cfgSrc = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examConfig.js'), 'utf8');
  assert(/_examConfig\.skills=new Set\(\[skill\]\)/.test(cfgSrc), 'examConfig uses radio-style single skill');
  assert(!/skills\.add\(skill\)/.test(cfgSrc), 'examConfig does not multi-add skills');
}

// Lesen Teil 3 — Haiku duplicate ad keys (all "A")
{
  const ads = Array.from({ length: 10 }, (_, i) => ({
    key: 'A',
    title: `Ad ${i + 1}`,
    text: `Anzeigentext ${i + 1}`,
  }));
  const check = validatePersonal({
    lang: 'de',
    level: 'B1',
    lesenParts: [
      {
        teil: 3,
        blueprintSlot: 'ads_matching',
        ads,
        items: Array.from({ length: 7 }, (_, i) => ({
          id: String(13 + i),
          signText: `Situation ${13 + i}`,
          question: 'Welche Anzeige passt?',
          correct: ['A', 'B', 'C', 'D', 'E', 'F', 'G'][i],
          type: 'multiple',
          options: ads.map((a) => String(a.key)),
        })),
      },
    ],
  });
  assert(check.valid, 'lesen teil3 duplicate ad keys from Haiku validates');
}

console.log('\nAll personal-module tests passed.');
