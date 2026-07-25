#!/usr/bin/env node
/** Lesen T3: pill onclick must work (regression for double-quote attr bug). */
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.LC_E2E_BASE || 'http://127.0.0.1:5173';

let failed = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else console.log('OK:', msg);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
await page.evaluate(() => {
  localStorage.setItem('lc_user', JSON.stringify({ plan: 'pro', pro: true }));
  localStorage.setItem('lc_goals', JSON.stringify([{ id: 'g', subject: 'de', level: 'B1' }]));
  localStorage.setItem('lc_active_goal', 'g');
});
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction('typeof ptSetMatch === "function"');

for (const examId of ['official-de-B1-e1', 'official-de-B1-e2', 'official-de-B1-e3', 'official-de-B1-e4', 'official-de-B1-e5']) {
  const r = await page.evaluate(async (id) => {
    const pick = (await ExamLibrary.loadExams('de', 'B1')).find((e) => (e.examId || e.id) === id);
    S.mode = 'official';
    S.answers = {};
    S.examData = normalizeExam(pick);
    hideAll();
    show('examScreen');
    renderExam();
    const pill = document.querySelector('.pt-letter-pill');
    const onclick = pill?.getAttribute('onclick') || '';
    if (pill) pill.click();
    return {
      onclick,
      selected: document.querySelectorAll('.pt-letter-pill.selected').length,
      answerCount: Object.keys(S.answers).filter((k) => k.startsWith('lesen_')).length,
    };
  }, examId);

  ok(!/onclick="ptSetMatch\("/.test(r.onclick), `${examId} no broken double-quote onclick`);
  ok(r.onclick.includes("ptSetMatch(") && r.onclick.includes(',this)'), `${examId} onclick complete`);
  ok(r.selected >= 1, `${examId} pill click marks selected (${r.selected})`);
  ok(r.answerCount >= 1, `${examId} answer stored (${r.answerCount})`);
}

await browser.close();
if (failed) process.exit(1);
console.log('\nLesen T3 pill interaction OK for E1–E5');
