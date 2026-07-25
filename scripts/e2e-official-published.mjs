#!/usr/bin/env node
/**
 * E2E smoke: Official B1 with LEXICOIL_EXAM_SOURCE=published (via index.html flag).
 * Requires: npm start (port 5173), npx playwright available.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.env.LC_E2E_BASE || 'http://127.0.0.1:5173';
const GOAL = [{ id: 'e2e-de-b1', subject: 'de', level: 'B1', label: 'Goethe B1', cert: 'goethe' }];

function startServerIfNeeded() {
  return fetch(BASE, { method: 'HEAD' })
    .then((r) => r.ok)
    .catch(() => false);
}

async function main() {
  const up = await startServerIfNeeded();
  if (!up) {
    console.error('Server not running at', BASE, '— run: npm start');
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem(
      'lc_user',
      JSON.stringify({
        email: 'e2e@test.local',
        name: 'E2E',
        plan: 'pro',
        pro: true,
      }),
    );
    localStorage.setItem('lc_goals', JSON.stringify(GOAL));
    localStorage.setItem('lc_active_goal', 'e2e-de-b1');
    localStorage.removeItem('lc_active_sessions');
    window.confirm = () => true;
  });

  const page = await context.newPage();
  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => typeof getLexicoilExamSource === 'function', null, {
    timeout: 60000,
  });

  const flags = await page.evaluate(() => ({
    source: getLexicoilExamSource(),
    usesPublished: ExamLibrary.usesPublishedExams('de', 'B1'),
  }));
  console.log('Console flags:', flags);
  if (flags.source !== 'published' || !flags.usesPublished) {
    console.error('FAIL: exam source flags');
    process.exit(1);
  }

  // Load published exams and render E4 (guaranteed TechDeal24 L3)
  const loadInfo = await page.evaluate(async () => {
    await ExamLibrary.ensureManifest();
    const exams = await ExamLibrary.loadExams('de', 'B1');
    const pick =
      exams.find((e) => {
        const l3 = (e.lesenParts || []).find((p) => p.teil === 3);
        return (l3?.ads || []).some((a) => a.title === 'TechDeal24');
      }) || exams[0];
    S.mode = 'official';
    S.subject = 'de';
    S.level = 'B1';
    S.activeGoalId = 'e2e-de-b1';
    S.answers = {};
    S.gapAnswers = {};
    S.fieldValues = {};
    S.examData = normalizeExam(pick);
    S.examSource = 'library';
    hideAll();
    show('examScreen');
    renderExam();
    const html = document.getElementById('examScreen')?.innerHTML || '';
    const l2 = (pick.lesenParts || []).find((p) => p.teil === 2);
    const l2Texts = l2?.passages?.map((p) => p.text || '') || (l2?.text ? [l2.text] : []);
    return {
      examCount: exams.length,
      examId: pick.examId || pick.id,
      hasTechDeal: html.includes('TechDeal24'),
      hasPcHilfe: html.includes('PC-Hilfe'),
      hasBildScharf: html.includes('BildScharf'),
      hasLesen: /Lesen|LESEN/i.test(html),
      hasHoren: /H[öo]ren|HÖREN/i.test(html),
      hasSchreiben: /Schreiben|SCHREIBEN/i.test(html),
      l2PassageCount: l2Texts.filter((t) => t.length > 100).length,
      wrongCaps: /\bIch Glaube,|frisch Kochen|was sie Essen\b/.test(html),
      questionInputs: document.querySelectorAll('input[type=radio],input[type=checkbox]').length,
    };
  });

  console.log('Load/render:', loadInfo);
  if (!loadInfo.hasTechDeal || loadInfo.hasBildScharf) {
    console.error('FAIL: L3 ads — expected TechDeal24, not legacy BildScharf');
    process.exit(1);
  }
  if (!loadInfo.hasPcHilfe) console.warn('WARN: PC-Hilfe not found in HTML (scroll?)');
  if (loadInfo.l2PassageCount < 2) {
    console.error('FAIL: Lesen T2 expected 2 passages');
    process.exit(1);
  }
  if (loadInfo.wrongCaps) {
    console.error('FAIL: wrong capitalization patterns in HTML');
    process.exit(1);
  }
  for (const mod of ['hasLesen', 'hasHoren', 'hasSchreiben']) {
    if (!loadInfo[mod]) {
      console.error(`FAIL: module missing — ${mod}`);
      process.exit(1);
    }
  }

  // Answer first radio per lesen/horen group + schreiben textarea, then submit
  const grade = await page.evaluate(async () => {
    const radios = [...document.querySelectorAll('input[type=radio]')];
    const seen = new Set();
    for (const r of radios) {
      const name = r.name;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      r.checked = true;
      r.dispatchEvent(new Event('change', { bubbles: true }));
      if (S.answers && name in S.answers === false) {
        S.answers[name] = r.value;
      }
    }
    document.querySelectorAll('textarea').forEach((ta) => {
      if (!ta.value.trim()) ta.value = 'Das ist meine Meinung zu diesem Thema. '.repeat(8);
    });
    if (typeof collectFieldValues === 'function') collectFieldValues();
    await submitExam();
    await new Promise((r) => setTimeout(r, 1500));
    const resultsHtml = document.getElementById('resultsScreen')?.innerHTML || '';
    const scoreMatch = resultsHtml.match(/(\d{1,3})\s*%/);
    return {
      resultsVisible: document.getElementById('resultsScreen')?.classList.contains('on'),
      scorePct: scoreMatch ? Number(scoreMatch[1]) : null,
      hasErrorToast: resultsHtml.includes('Error') && resultsHtml.includes('grading'),
      snippet: resultsHtml.slice(0, 400),
    };
  });

  console.log('Grading:', grade);
  if (!grade.resultsVisible) {
    console.error('FAIL: results screen not shown');
    if (logs.length) console.error(logs.join('\n'));
    process.exit(1);
  }
  if (grade.scorePct == null || Number.isNaN(grade.scorePct)) {
    console.error('FAIL: no score % on results');
    process.exit(1);
  }

  console.log('\n✅ E2E passed: published source, TechDeal24 L3, modules render, grader returns score', grade.scorePct + '%');
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
