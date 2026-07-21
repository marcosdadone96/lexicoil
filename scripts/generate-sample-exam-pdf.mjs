#!/usr/bin/env node
/**
 * Generate sample exam correction PDFs via the same Puppeteer path as generate-pdf.js.
 * Run: node scripts/generate-sample-exam-pdf.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildPdfReportHtml } = require(path.join(ROOT, 'netlify/functions/lib/pdfHtmlBundle.js'));
const { renderPdfFromHtml } = require(path.join(ROOT, 'netlify/functions/lib/pdfRender.js'));

const CHROME =
  process.env.CHROME_PATH ||
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome');

const correction = {
  parts: [
    {
      title: 'Lesen — Teil 1',
      items: [
        {
          ok: false,
          q: 'Was steht im Text über die Öffnungszeiten?',
          yours: 'B',
          correct: 'C',
          explanation: 'Relativsatz: „die geöffnet hat“ bezieht sich auf „Bibliothek“.',
          grammarTags: ['g-de-b1-relativ'],
        },
        {
          ok: false,
          q: 'Welche Aussage ist richtig?',
          yours: 'Richtig',
          correct: 'Falsch',
          explanation: 'Passiv Präsens: „wird renoviert“.',
          grammarTags: ['g-de-b1-passiv'],
        },
        { ok: true, q: 'Wer schreibt die Anzeige?', yours: 'A', correct: 'A', grammarTags: [] },
      ],
    },
    {
      title: 'Hörverstehen — Teil 2',
      items: [
        {
          ok: false,
          q: 'Der Sprecher empfiehlt…',
          yours: 'Frühstück im Hotel',
          correct: 'Frühstück zu Hause',
          explanation: 'Detailverständnis — Gegenteil im zweiten Satz.',
          grammarTags: ['g-de-b1-listening-detail'],
        },
      ],
    },
    {
      title: 'Schreiben — Teil 1 (Länge)',
      items: [
        {
          ok: false,
          q: 'Mindestwortzahl',
          yours: '78 Wörter',
          correct: '≥ 80 Wörter',
          explanation: 'Antwort zu kurz für die Aufgabenstellung.',
          grammarTags: [],
        },
      ],
    },
  ],
  writingAi: [
    {
      aufgabe: 1,
      correction: {
        correctedText:
          'Liebe Anna,\n\nvielen Dank für deine Einladung zum Sommerfest. Ich komme gerne am Samstag gegen 18 Uhr. Soll ich etwas mitbringen?\n\nViele Grüße\nMaria',
        summary: 'Gute Anrede und Schlussformel; einige Wortstellungs- und Artikelfehler.',
        errors: [
          {
            original: 'danke für die Einladung',
            correction: 'vielen Dank für deine Einladung',
            explanation: 'Formellere Wendung + Possessiv.',
          },
          {
            original: 'komme am Samstag gerne',
            correction: 'komme gerne am Samstag',
            explanation: 'Te-Klammer: „gerne“ als Mittelfeld.',
          },
        ],
        totalScore: 72,
        rubric: { erfuellung: 20, kohaerenz: 18, wortschatz: 17, strukturen: 17 },
      },
    },
  ],
};

const speakingEvals = [
  {
    transcript:
      'Ich finde, dass man mehr Fahrradwege braucht. In meiner Stadt ist oft Stau und die Luft ist nicht gut.',
    criteria: [
      { name: 'Aufgabenerfüllung', score: 4, comment: 'Punkte angesprochen, etwas kurz.' },
      { name: 'Wortschatz', score: 3, comment: 'Einfach aber passend.' },
      { name: 'Grammatik', score: 3, comment: 'Relativsätze teils holprig.' },
      { name: 'Kohärenz & Flüssigkeit', score: 4, comment: 'Logischer Aufbau.' },
    ],
    overallFeedback: 'Verständlich und strukturiert; erweitere Argumente und Nebensätze.',
    correctedVersion:
      'Ich finde, dass man mehr Fahrradwege braucht, weil in meiner Stadt oft Stau ist und die Luftverschmutzung hoch ist.',
    score: 70,
  },
];

const coaching = {
  topics: [
    {
      tag: 'g-de-b1-passiv',
      title: 'Passiv im Präsens',
      explanation: 'Subjekt erleidet die Handlung; „werden“ + Partizip II.',
      examples: ['Das Haus wird renoviert.', 'Die Tür wird geöffnet.'],
      tip: 'Achte auf die Wortstellung: werden steht an Position 2.',
    },
  ],
};

const exam = {
  level: 'B1',
  lang: 'de',
  topic: 'Stadt & Mobilität',
  official: { certificate: 'Goethe-Zertifikat B1' },
};

const outDir = path.join(ROOT, 'batches/ready/gate-logs');
fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(CHROME)) {
  console.error('Chrome not found at', CHROME);
  console.error('Set CHROME_PATH or install Google Chrome.');
  process.exit(1);
}

for (const uiLang of ['de', 'es']) {
  const suffix = uiLang === 'de' ? 'puppeteer-2026-07-13' : 'puppeteer-es-2026-07-13';
  const outPdf = path.join(outDir, `sample-exam-report-${suffix}.pdf`);
  const outHtml = path.join(outDir, `sample-exam-report-${suffix}.html`);
  const payload = {
    score: 68,
    mods: { lesen: 55, horen: 62, schreiben: 72, sprechen: 70 },
    d: exam,
    isDE: true,
    correction,
    speakingParts: speakingEvals,
    grammarCoaching: coaching,
    uiLang,
  };
  const fullHtml = buildPdfReportHtml(payload, ROOT);
  fs.writeFileSync(outHtml, fullHtml);

  try {
    const pdfBuf = await renderPdfFromHtml(fullHtml, { executablePath: CHROME });
    fs.writeFileSync(outPdf, pdfBuf);
    console.log(`PDF (${uiLang}) via Puppeteer renderPdfFromHtml:`, outPdf);
    const raw = pdfBuf.toString('latin1');
    const hasFileUrl = /file:\/\/|Desktop\\MDR|\.html\s+\d+\/\d+/i.test(raw);
    const hasLexiFooter = raw.includes('LexiCoil') && raw.includes('lexicoil.com');
    console.log(`  footer check: file:// leak=${hasFileUrl ? 'FAIL' : 'OK'}, brand footer=${hasLexiFooter ? 'OK' : 'n/a'}`);
  } catch (err) {
    console.error(`Puppeteer PDF failed (${uiLang}):`, err.message || err);
    process.exitCode = 1;
  }
  console.log(`HTML (${uiLang}):`, outHtml);
}
