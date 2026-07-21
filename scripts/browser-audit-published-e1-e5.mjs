import puppeteer from 'puppeteer-core';

const BASE = 'http://127.0.0.1:5173';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXAMS = ['official-de-B1-e1', 'official-de-B1-e2', 'official-de-B1-e3', 'official-de-B1-e4', 'official-de-B1-e5'];

function pass(ok, note) {
  return ok ? `✅ ${note}` : `❌ ${note}`;
}

async function auditExam(page, examId) {
  const data = await page.evaluate(async (id) => {
    const exams = await ExamLibrary.loadExams('de', 'B1');
    const pick = exams.find((e) => (e.examId || e.id) === id);
    S.mode = 'official';
    S.subject = 'de';
    S.level = 'B1';
    S.answers = {};
    S.fieldValues = {};
    Object.keys(S).forEach((k) => {
      if (k.startsWith('listenPlays')) delete S[k];
    });
    S.examData = normalizeExam(pick);
    hideAll();
    show('examScreen');
    renderExam();

    const sec = (cls) =>
      [...document.querySelectorAll('#examScreen section.module-wrap')]
        .filter((s) => s.querySelector('.' + cls))
        .map((s) => {
          const teil = s.querySelector('.module-tag')?.textContent?.match(/Teil\s*(\d+)/)?.[1];
          return { teil: Number(teil), el: s };
        });

    const lesen = sec('tag-lesen').map(({ teil, el }) => ({
      teil,
      instr: (el.querySelector('.off-instr')?.textContent || '').trim().length > 10,
      readable: el.querySelectorAll('.readable-text').length,
      rfBtns: el.querySelectorAll('.rf-btn').length,
      radios: el.querySelectorAll('input[type=radio]').length,
      situations: el.querySelectorAll('.pt-match-situation').length,
      ads: el.querySelectorAll('.pt-ad-item').length,
      pills: el.querySelectorAll('.pt-match-pills').length,
      hasZero: [...el.querySelectorAll('.pt-letter-pill')].some((b) => b.textContent.trim() === '0'),
      t3layout: !!el.querySelector('.pt-t3-layout'),
      offSigns: el.querySelectorAll('.off-sign:not(.off-sign-example)').length,
      l4nums: [...el.querySelectorAll('.off-sign-label')].map((n) => n.textContent.trim()),
      l4opinionSample: (el.querySelector('.off-sign:not(.off-sign-example)')?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 70),
      jaNein: el.innerHTML.includes('Ja</button>') && el.innerHTML.includes('Nein</button>'),
    }));

    const horen = sec('tag-horen').map(({ teil, el }) => ({
      teil,
      instr: (el.querySelector('.off-instr')?.textContent || '').trim().length > 10,
      listenBtns: el.querySelectorAll('[id^=listenBtn_]:not([disabled])').length,
      listenTotal: el.querySelectorAll('[id^=listenBtn_]').length,
      rfBtns: el.querySelectorAll('.rf-btn').length,
      radios: el.querySelectorAll('input[type=radio]').length,
    }));

    const schreiben = sec('tag-schreiben').map(({ teil, el }) => ({
      teil,
      taskLen: (el.querySelector('.write-brief .off-instr')?.textContent || '').trim().length,
      textarea: !!el.querySelector('textarea.write-field'),
      meter: el.querySelector('.word-meter')?.textContent?.trim() || '',
    }));

    const blueTargets = document.querySelectorAll('#examScreen .vocab-target').length;
    const blueStyle = getComputedStyle(document.querySelector('#examScreen .vocab-word') || document.body);

    // TTS test first enabled listen btn
    let tts = { ok: false, detail: 'no button' };
    const btn = document.querySelector('[id^=listenBtn_]:not([disabled])');
    if (btn) {
      let spoke = false;
      const orig = window.speechSynthesis?.speak;
      if (window.speechSynthesis) {
        window.speechSynthesis.speak = () => {
          spoke = true;
        };
      }
      const before = btn.textContent;
      btn.click();
      tts = {
        ok: spoke || /playing/i.test(btn.textContent),
        detail: `${before} → ${btn.textContent} spoke=${spoke}`,
      };
      if (orig) window.speechSynthesis.speak = orig;
    }

    // word counter on first schreiben textarea
    let wc = { ok: false, detail: 'n/a' };
    const ta = document.querySelector('textarea.write-field');
    const meter0 = document.querySelector('.word-meter');
    if (ta && meter0) {
      ta.value = 'Eins zwei drei vier fünf sechs sieben acht neun zehn elf';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof updWGoethe === 'function') updWGoethe();
      const m = document.querySelector('.word-meter')?.textContent || '';
      wc = { ok: parseInt(m, 10) >= 5, detail: m };
    }

    return {
      examId: id,
      modeOfficial: document.getElementById('examScreen')?.classList.contains('mode-official'),
      lesen,
      horen,
      schreiben,
      blueTargets,
      tts,
      wc,
    };
  }, examId);

  const l1 = data.lesen.find((p) => p.teil === 1);
  const l2 = data.lesen.find((p) => p.teil === 2);
  const l3 = data.lesen.find((p) => p.teil === 3);
  const l4 = data.lesen.find((p) => p.teil === 4);
  const l5 = data.lesen.find((p) => p.teil === 5);

  const row = {
    exam: examId.replace('official-de-B1-e', 'E'),
    lesenT125: pass(
      l1?.instr && l1.readable >= 1 && l1.rfBtns >= 6 &&
        l2?.instr && l2.readable >= 2 && (l2.rfBtns >= 6 || l2.radios >= 6) &&
        l5?.instr && l5.readable >= 1 && (l5.rfBtns >= 4 || l5.radios >= 4),
      `T1 instr+text+6RF; T2 2passages+Qs; T5 text+Qs`,
    ),
    lesenT3: pass(
      l3?.instr && l3.t3layout && l3.situations >= 7 && l3.ads >= 10 && l3.pills >= 7 && l3.hasZero,
      `instr+7sit+10ads+pills A-J+0`,
    ),
    lesenT4: pass(
      l4?.instr && l4.offSigns >= 7 && l4.l4nums.join(',') === '20,21,22,23,24,25,26' &&
        l4.l4opinionSample.length > 20 && l4.jaNein && l4.rfBtns >= 7,
      `7 opiniones 20-26 + Ja/Nein`,
    ),
    horenRender: pass(
      data.horen.length === 4 && data.horen.every((h) => h.instr && h.listenTotal >= 1),
      `4 teils, ${data.horen.map((h) => `T${h.teil}:${h.listenTotal}btn`).join(' ')}`,
    ),
    horenTts: pass(data.tts.ok, data.tts.detail),
    schreiben: pass(
      data.schreiben.length === 3 && data.schreiben.every((s) => s.taskLen > 50 && s.textarea && s.meter),
      `3 tasks+textarea+meter`,
    ),
    wordCounter: pass(data.wc.ok, data.wc.detail),
    blueTraces: pass(data.blueTargets === 0, `vocab-target=${data.blueTargets}`),
    hacible: true,
  };

  row.hacible = [row.lesenT125, row.lesenT3, row.lesenT4, row.horenRender, row.horenTts, row.schreiben, row.wordCounter, row.blueTraces]
    .every((c) => c.startsWith('✅'));

  return row;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
await page.evaluate(() => {
  localStorage.setItem('lc_user', JSON.stringify({ email: 'audit@local', plan: 'pro', pro: true }));
  localStorage.setItem('lc_goals', JSON.stringify([{ id: 'audit', subject: 'de', level: 'B1' }]));
  localStorage.setItem('lc_active_goal', 'audit');
});
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction('typeof renderExam === "function"');

const rows = [];
for (const id of EXAMS) rows.push(await auditExam(page, id));
await browser.close();

console.log('\n| Examen | Lesen T1/T2/T5 | Lesen T3 | Lesen T4 | Hören render | Hören TTS | Schreiben | Contador | Sin azul | ¿Hacible E2E? |');
console.log('|--------|----------------|----------|-----------|--------------|-----------|-----------|----------|----------|-------------|');
for (const r of rows) {
  console.log(
    `| ${r.exam} | ${r.lesenT125} | ${r.lesenT3} | ${r.lesenT4} | ${r.horenRender} | ${r.horenTts} | ${r.schreiben} | ${r.wordCounter} | ${r.blueTraces} | ${r.hacible ? '✅ SÍ' : '❌ NO'} |`,
  );
}
