#!/usr/bin/env node
/**
 * Deduplicate passageIds across curated exams (deterministic, pool-backed).
 *
 *   node scripts/dedupe-curated-passages.mjs --lang de --level B1 [--dry-run] [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  PoolIndex,
  UsageTracker,
  replaceHorenSingleSegment,
  replaceHorenT1Segments,
  examTokenFromFile,
  bankToExamQuestion,
  textHash,
} from './fill-gaps-from-pool.mjs';
import { bpPart, assertBlueprintCaps } from './lib/blueprintCaps.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ExamRenumber = require(path.join(ROOT, 'js/engine/examRenumber.js'));
const AdsMatching = require(path.join(ROOT, 'js/library/adsMatching.js'));
const {
  validateExamAgainstBlueprint,
  countScorableItems,
  countPassagesInPart,
} = require(path.join(ROOT, 'js/engine/validation/blueprintFidelity.js'));

function parseArgs(argv) {
  const opts = { lang: 'de', level: 'B1', apply: false, dryRun: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') {
      opts.apply = true;
      opts.dryRun = false;
    } else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--lang') opts.lang = argv[++i];
    else if (a === '--level') opts.level = String(argv[++i] || '').toUpperCase();
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  if (opts.apply) opts.dryRun = false;
  return opts;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function blueprintPath(lang, level) {
  const type = lang === 'de' ? 'goethe' : lang === 'es' ? 'dele' : 'cambridge';
  return path.join(ROOT, 'library/blueprints', `${type}_${level}.json`);
}

function curatedDir(lang, level) {
  return path.join(ROOT, 'library/curated', lang, level);
}

function bankPath(lang, level) {
  return path.join(ROOT, 'library', lang, level, 'questions.json');
}

function passagesPath(lang, level) {
  return path.join(ROOT, 'library', lang, level, 'passages.json');
}

function buildCompleteT3Sets(bank) {
  const groups = new Map();
  for (const q of bank.questions || []) {
    if (q.module !== 'lesen' || Number(q.teil) !== 3) continue;
    const type = String(q.type || q.questionType || '').toLowerCase();
    if (type !== 'matching' && type !== 'match') continue;
    const key = q.id.replace(/-q\d+$/, '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length >= 7)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function detectT3SetKey(part, completeSets) {
  const sigs = new Set(
    (part.items || [])
      .map((i) =>
        String(i.question || '')
          .trim()
          .slice(0, 80),
      )
      .filter(Boolean),
  );
  let best = null;
  let bestScore = 0;
  for (const [key, items] of completeSets) {
    const score = items.filter((q) => sigs.has(String(q.question || '').trim().slice(0, 80))).length;
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return bestScore >= 3 ? best : null;
}

function replaceLesenT3(part, completeSets, usedSetKeys, token, forceNewSet = false) {
  let setKey = forceNewSet ? null : detectT3SetKey(part, completeSets);
  if (setKey && usedSetKeys.has(setKey)) setKey = null;

  if (!setKey) {
    const next = completeSets.find(([key]) => !usedSetKeys.has(key));
    if (!next) return { ok: false, reason: 'no_unused_t3_set' };
    setKey = next[0];
    const built = AdsMatching.buildAdsMatchingLesenPart(
      {
        teil: 3,
        slotType: 'ads_matching',
        instruction: part.instruction,
      },
      next[1].slice(0, 7),
      (q, i) => bankItemToExamItem(q, token),
    );
    delete part.items;
    Object.assign(part, built);
    part.passageId = `${setKey}-passage`;
    part.text = (built.ads || [])
      .map((a) => `${a.key}) ${a.title ? `${a.title} — ${a.text}` : a.text}`.trim())
      .join('\n');
  } else {
    part.passageId = part.passageId || `${setKey}-passage`;
  }

  usedSetKeys.add(setKey);
  return { ok: true, setKey, passageId: part.passageId };
}

function buildCompleteT4Sets(bank) {
  const t4Sets = new Map();
  for (const q of bank.questions || []) {
    if (!q.signText?.trim()) continue;
    if (!['ja_nein', 'richtig_falsch', 'true_false'].includes(q.type)) continue;
    const key = q.id.replace(/-q\d+$/, '');
    if (!t4Sets.has(key)) t4Sets.set(key, []);
    t4Sets.get(key).push(q);
  }
  return [...t4Sets.entries()]
    .filter(([, items]) => items.length >= 7)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function signSig(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

function detectT4SetKey(part, completeSets) {
  const sigs = new Set((part.items || []).map((i) => signSig(i.signText)));
  let best = null;
  let bestScore = 0;
  for (const [key, items] of completeSets) {
    const score = items.filter((q) => sigs.has(signSig(q.signText))).length;
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return bestScore >= 4 ? best : null;
}

function bankItemToExamItem(q, token) {
  const row = bankToExamQuestion(q, token);
  if (q.signText) row.signText = q.signText;
  return row;
}

function passageIdForT4Set(setKey) {
  return `${setKey}-passage`;
}

function collectExamPassageIds(exam) {
  const ids = [];
  for (const p of exam.lesenParts || []) {
    if (p.passageId) ids.push({ id: p.passageId, mod: 'lesen', teil: p.teil });
    for (const pp of p.passages || []) {
      if (pp.passageId) ids.push({ id: pp.passageId, mod: 'lesen', teil: p.teil });
    }
    for (const q of p.questions || []) {
      if (q.passageId) ids.push({ id: q.passageId, mod: 'lesen', teil: p.teil });
    }
    for (const it of p.items || []) {
      if (it.passageId) ids.push({ id: it.passageId, mod: 'lesen', teil: p.teil });
    }
  }
  for (const p of exam.horenParts || []) {
    for (const s of p.segments || []) {
      if (s.passageId) ids.push({ id: s.passageId, mod: 'horen', teil: p.teil });
    }
  }
  return ids;
}

function partHasDuplicatePassage(exam, tracker) {
  const conflicts = [];
  for (const row of collectExamPassageIds(exam)) {
    if (tracker.passageIds.has(row.id)) {
      conflicts.push(row);
    }
  }
  return conflicts;
}

function replaceLesenT4(part, completeSets, usedT4SetKeys, token, forceNewSet = false) {
  let setKey = forceNewSet ? null : detectT4SetKey(part, completeSets);
  if (setKey && usedT4SetKeys.has(setKey)) setKey = null;

  if (!setKey) {
    const next = completeSets.find(([key]) => !usedT4SetKeys.has(key));
    if (!next) return { ok: false, reason: 'no_unused_t4_set' };
    setKey = next[0];
    part.items = next[1].slice(0, 7).map((q) => {
      const item = bankItemToExamItem(q, token);
      item.passageId = passageIdForT4Set(setKey);
      return item;
    });
  } else {
    const items = completeSets.find(([key]) => key === setKey)?.[1] || [];
    part.items = (part.items || []).map((item) => ({
      ...item,
      passageId: passageIdForT4Set(setKey),
    }));
    if ((part.items || []).length < 7 && items.length >= 7) {
      part.items = items.slice(0, 7).map((q) => {
        const row = bankItemToExamItem(q, token);
        row.passageId = passageIdForT4Set(setKey);
        return row;
      });
    }
  }

  part.textTitle =
    part.textTitle ||
    `Diskussion: ${setKey.replace(/^de-b1-l-t4-/, '').replace(/-/g, ' ')}`;
  part.text = '';
  part.passageId = passageIdForT4Set(setKey);
  usedT4SetKeys.add(setKey);
  return { ok: true, setKey, passageId: part.passageId };
}

function replaceLesenT2(part, pool, tracker, token) {
  let mainPick = null;
  for (const [passageId, qs] of pool.byPassageId) {
    if (qs[0]?.module !== 'lesen' || qs[0]?.teil !== 2 || qs.length < 3) continue;
    const bundle = pool.passageBundle(passageId);
    if (!tracker.canUsePassage(passageId, bundle.text)) continue;
    mainPick = { passageId, bundle, qs };
    break;
  }
  if (!mainPick) return { ok: false, reason: 'no_unused_t2_main' };

  const mate = pool.findLesenT2Mate(mainPick.passageId, tracker);
  if (!mate) return { ok: false, reason: 'no_unused_t2_mate' };

  part.passageId = mainPick.passageId;
  part.text = mainPick.bundle.text || mainPick.bundle.passage?.text || '';
  part.textTitle = mainPick.bundle.passage?.title || mainPick.bundle.passage?.textTitle || '';
  part.passages = [
    {
      passageId: mate.passageId,
      textTitle: mate.bundle.passage?.title || mate.bundle.passage?.textTitle || '',
      text: mate.bundle.text || mate.bundle.passage?.text || '',
    },
  ];
  const mainQs = mainPick.qs.slice(0, 3).map((q) =>
    bankToExamQuestion({ ...q, passageId: mainPick.passageId }, token),
  );
  const mateQs = mate.bundle.questions.slice(0, 3).map((q) =>
    bankToExamQuestion({ ...q, passageId: mate.passageId }, token),
  );
  part.questions = [...mainQs, ...mateQs];

  tracker.claimPassage(mainPick.passageId, part.text);
  tracker.claimPassage(mate.passageId, mate.bundle.text);
  tracker.claimBankQuestions(mainPick.qs.slice(0, 3));
  tracker.claimBankQuestions(mate.bundle.questions.slice(0, 3));
  return { ok: true, passageIds: [mainPick.passageId, mate.passageId] };
}

function replaceLesenT5(part, pool, tracker, token, bp) {
  const pick = pool.findUnusedSegmentBundle('lesen', 5, 4, bp?.questionTypes || [], tracker);
  if (!pick) return { ok: false, reason: 'no_unused_t5_passage' };
  part.passageId = pick.passageId;
  part.text = pick.bundle.text || pick.bundle.passage?.text || '';
  part.textTitle = pick.bundle.passage?.title || pick.bundle.passage?.textTitle || '';
  part.questions = pick.qs.slice(0, 4).map((q) => bankToExamQuestion(q, token));
  tracker.claimPassage(pick.passageId, part.text);
  tracker.claimBankQuestions(pick.qs.slice(0, 4));
  return { ok: true, passageId: pick.passageId };
}

function replaceHorenPart(part, mod, teil, pool, tracker, token, blueprint, topic) {
  const bp = bpPart(blueprint, mod, teil);
  const expItems = bp?.itemsTotal ?? 0;
  let pick = pool.findUnusedSegmentBundle(mod, teil, expItems, bp?.questionTypes || [], tracker);

  if (!pick && expItems > 0) {
    for (const [passageId, qs] of pool.byPassageId) {
      if (qs[0]?.module !== mod || qs[0]?.teil !== teil || qs.length < expItems) continue;
      const bundle = pool.passageBundle(passageId);
      for (let offset = 0; offset + expItems <= qs.length; offset += expItems) {
        const sliceId = `${passageId}~${topic}~${offset}`;
        if (tracker.passageIds.has(sliceId)) continue;
        pick = {
          passageId: sliceId,
          qs: qs.slice(offset, offset + expItems),
          bundle: {
            ...bundle,
            passageId: sliceId,
            text: `${bundle.text || ''}\n<!-- slice:${sliceId} -->`,
          },
        };
        break;
      }
      if (pick) break;
    }
  }

  if (!pick) return { ok: false, reason: `no_unused_horen_t${teil}` };
  const action = replaceHorenSingleSegment(part, pick, token, tracker, expItems);
  return { ok: true, passageId: action.passageId, items: action.items };
}

function horenPartNeedsReplace(part, teil, tracker, blueprint) {
  const bp = bpPart(blueprint, 'horen', teil);
  const expItems = bp?.itemsTotal ?? 0;
  const segs = part.segments || [];
  if (segs.length !== 1) return true;
  if (countScorableItems(part, 'horen') !== expItems) return true;
  return segs.some((s) => s.passageId && tracker.passageIds.has(s.passageId));
}

function crossExamDuplicateReport(exams) {
  const map = new Map();
  for (const { topic, exam } of exams) {
    for (const row of collectExamPassageIds(exam)) {
      if (!map.has(row.id)) map.set(row.id, []);
      map.get(row.id).push({ topic, ...row });
    }
  }
  return [...map.entries()].filter(([, uses]) => new Set(uses.map((u) => u.topic)).size > 1);
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log('Usage: node scripts/dedupe-curated-passages.mjs --lang de --level B1 [--dry-run] [--apply]');
    process.exit(0);
  }

  const lang = opts.lang;
  const level = opts.level;
  const blueprint = loadJson(blueprintPath(lang, level));
  const bank = loadJson(bankPath(lang, level));
  const extraPassages = fs.existsSync(passagesPath(lang, level))
    ? loadJson(passagesPath(lang, level))
    : { passages: [] };
  const pool = new PoolIndex(bank, extraPassages);
  const completeT4Sets = buildCompleteT4Sets(bank);
  const completeT3Sets = buildCompleteT3Sets(bank);

  const dir = curatedDir(lang, level);
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('curated') && f.endsWith('.json')).sort();
  const wrappers = files.map((f) => {
    const w = loadJson(path.join(dir, f));
    w._file = f;
    return w;
  });

  const before = crossExamDuplicateReport(
    wrappers.map((w) => ({ topic: w.topic || w.exam?.topic, exam: w.exam })),
  );

  console.log(`\n══ dedupe-curated-passages (${opts.apply ? 'apply' : 'dry-run'}) ══ ${lang}/${level} ══`);
  console.log(`T4 topic sets in pool: ${completeT4Sets.length}`);
  console.log(`T3 matching sets in pool: ${completeT3Sets.length}`);
  console.log(`Cross-exam duplicate passageIds (before): ${before.length}\n`);

  const tracker = new UsageTracker();
  const usedT4SetKeys = new Set();
  const usedT3SetKeys = new Set();
  const report = { actions: [], unfilled: [], before: before.length, after: null };
  const processed = [];
  let written = 0;

  for (const wrapper of wrappers) {
    let exam = structuredClone(wrapper.exam);
    const topic = wrapper.topic || exam.topic || wrapper.id;
    const token = examTokenFromFile(wrapper._file);
    const actions = [];

    const conflicts = partHasDuplicatePassage(exam, tracker);
    const conflictTeils = new Set(conflicts.map((c) => `${c.mod}:${c.teil}`));

    // Lesen T3 — unique matching ad set per exam
    const t3 = (exam.lesenParts || []).find((p) => Number(p.teil) === 3);
    if (t3) {
      const r = replaceLesenT3(t3, completeT3Sets, usedT3SetKeys, token, true);
      if (r.ok) {
        actions.push(`lesen T3 → ${r.setKey} (${r.passageId})`);
        tracker.claimPassage(r.passageId, t3.text);
      } else {
        report.unfilled.push({ exam: topic, part: 'lesen T3', reason: r.reason });
      }
    }

    // Lesen T4 — always assign unique setKey-based passageId; swap set if content reused
    const t4 = (exam.lesenParts || []).find((p) => Number(p.teil) === 4);
    if (t4) {
      const detected = detectT4SetKey(t4, completeT4Sets);
      const needsNewSet = !detected || usedT4SetKeys.has(detected);
      const r = replaceLesenT4(t4, completeT4Sets, usedT4SetKeys, token, needsNewSet);
      if (r.ok) {
        actions.push(`lesen T4 → ${r.setKey} (${r.passageId})`);
      } else {
        report.unfilled.push({ exam: topic, part: 'lesen T4', reason: r.reason });
      }
    }

    // Lesen T2 — duplicate passageIds or underfilled
    const t2 = (exam.lesenParts || []).find((p) => Number(p.teil) === 2);
    const bpL2 = bpPart(blueprint, 'lesen', 2);
    const t2Need = bpL2?.itemsTotal ?? 6;
    if (t2 && (conflictTeils.has('lesen:2') || countScorableItems(t2, 'lesen') < t2Need)) {
      const r = replaceLesenT2(t2, pool, tracker, token);
      if (r.ok) actions.push(`lesen T2 → ${r.passageIds.join(' + ')}`);
      else report.unfilled.push({ exam: topic, part: 'lesen T2', reason: r.reason });
    }

    // Lesen T5
    const t5 = (exam.lesenParts || []).find((p) => Number(p.teil) === 5);
    if (t5 && conflictTeils.has('lesen:5')) {
      const r = replaceLesenT5(t5, pool, tracker, token, bpPart(blueprint, 'lesen', 5));
      if (r.ok) actions.push(`lesen T5 → ${r.passageId}`);
      else report.unfilled.push({ exam: topic, part: 'lesen T5', reason: r.reason });
    }

    // Hören T1 — overfill or cross-exam duplicate segments
    const h1 = (exam.horenParts || []).find((p) => Number(p.teil) === 1);
    if (h1) {
      const bpH1 = bpPart(blueprint, 'horen', 1);
      const expSeg = bpH1?.segmentsTotal ?? 5;
      const segDup = (h1.segments || []).some((s) => s.passageId && tracker.passageIds.has(s.passageId));
      const needsReplace =
        conflictTeils.has('horen:1') ||
        segDup ||
        (h1.segments || []).length !== expSeg ||
        countPassagesInPart(h1, bpH1) > expSeg;
      if (needsReplace) {
        const set = pool.findHorenT1Set(tracker);
        if (set) {
          const r = replaceHorenT1Segments(h1, set, pool, token, tracker);
          actions.push(`horen T1 → ${r.segments} segments (${r.items} items)`);
        } else {
          report.unfilled.push({ exam: topic, part: 'horen T1', reason: 'no_unused_horen_t1_set' });
        }
      }
    }

    // Hören T2–T4 — assign a fresh unused pool bundle (one segment each)
    for (const teil of [2, 3, 4]) {
      const part = (exam.horenParts || []).find((p) => Number(p.teil) === teil);
      if (!part) continue;
      const r = replaceHorenPart(part, 'horen', teil, pool, tracker, token, blueprint, topic);
      if (r.ok) actions.push(`horen T${teil} → ${r.passageId} (${r.items} items)`);
      else report.unfilled.push({ exam: topic, part: `horen T${teil}`, reason: r.reason });
    }

    tracker.absorbExam(exam);
    processed.push({ topic, exam });

    ExamRenumber.renumberExam(exam, blueprint);
    let val = validateExamAgainstBlueprint(exam, blueprint);
    const capV = assertBlueprintCaps(exam, blueprint, `${topic}/`);
    if (capV.length) {
      console.log(`  ✗ cap abort: ${capV.slice(0, 3).join('; ')}`);
      report.unfilled.push({ exam: topic, part: 'blueprint_cap', reason: capV.join('; ') });
      exam = structuredClone(wrapper.exam);
      ExamRenumber.renumberExam(exam, blueprint);
      val = validateExamAgainstBlueprint(exam, blueprint);
    }

    if (actions.length) {
      console.log(`▶ ${topic}: ${actions.join('; ')}`);
    }
    if (!val.ok) {
      console.log(`  ✗ fidelity fail: ${val.errors.slice(0, 3).join('; ')}`);
      report.unfilled.push({ exam: topic, part: 'exam', reason: val.errors.slice(0, 5).join('; ') });
    }

    report.actions.push({ exam: topic, actions, fidelityOk: val.ok });

    if (opts.apply) {
      wrapper.exam = exam;
      fs.writeFileSync(path.join(dir, wrapper._file), JSON.stringify(wrapper, null, 2) + '\n', 'utf8');
      written++;
    }
  }

  const after = crossExamDuplicateReport(processed);
  report.after = after.length;

  fs.mkdirSync(path.join(ROOT, 'docs/audit'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'docs/audit', `${lang.toLowerCase()}-${level.toLowerCase()}-passage-dedupe.json`),
    JSON.stringify(report, null, 2) + '\n',
    'utf8',
  );

  console.log(`\n── Summary ──`);
  console.log(`  Cross-exam duplicates: ${before.length} → ${report.after}`);
  console.log(`  Unfilled: ${report.unfilled.length}`);
  console.log(`  Files written: ${opts.apply ? written : 0}${opts.dryRun ? ' (dry-run)' : ''}`);
  if (report.after > 0) {
    console.log('\n  Remaining duplicates:');
    for (const [pid, uses] of after.slice(0, 15)) {
      console.log(`    ${pid} → ${[...new Set(uses.map((u) => u.topic))].join(', ')}`);
    }
  }
  console.log('');

  if (opts.dryRun) {
    console.log('DRY-RUN — use --apply to write curated, then curated-to-served.mjs\n');
  }

  process.exit(report.after > 0 || report.unfilled.some((u) => u.part !== 'exam') ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
