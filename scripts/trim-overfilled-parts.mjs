#!/usr/bin/env node
/**
 * Trim exam parts that exceed blueprint itemsTotal / passagesPerPart.
 *
 *   node scripts/trim-overfilled-parts.mjs --lang de --level B1 [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { bpPart, assertBlueprintCaps } from './lib/blueprintCaps.mjs';
import {
  curatedDir,
  listCuratedFiles,
  loadBlueprint,
  loadJsonFile,
  bankPath,
  passagesPath,
  ROOT,
} from './lib/examPipeline.mjs';
import {
  PoolIndex,
  UsageTracker,
  examTokenFromFile,
  bankToExamQuestion,
  textHash,
} from './fill-gaps-from-pool.mjs';

const require = createRequire(import.meta.url);
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

function modulePartKey(modId) {
  if (modId === 'lesen') return 'lesenParts';
  if (modId === 'horen') return 'horenParts';
  if (modId === 'schreiben') return 'schreibenParts';
  if (modId === 'sprechen') return 'sprechenParts';
  return `${modId}Parts`;
}

function bankItemToExamItem(q, token) {
  const row = bankToExamQuestion(q, token);
  if (q.signText) row.signText = q.signText;
  return row;
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
    .filter(([, items]) => items.length >= 7 && optionsLookLikeAds(items[0]?.options))
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function optionsLookLikeAds(options) {
  if (!Array.isArray(options) || !options.length) return false;
  let adLike = 0;
  for (const opt of options) {
    const s = String(opt).trim();
    if (/^[a-jA-J0]\)\s+.{15,}/.test(s)) adLike++;
  }
  return adLike >= 3;
}

const BARE_T3_AD_SETS = {
  'de-b1-l-t3-bildungskurse-stadt-02': [
    'A) Integrationskurs Deutsch: Beruf und Alltag (A1/A2)',
    'B) Tablet-Training für Senioren: Videochat und E-Mail',
    'C) Yoga und Entspannung gegen Stress nach der Arbeit',
    'D) Rhetorik-Workshop: Sicher präsentieren vor Gruppen',
    'E) Kochkurs: Exotische Gerichte aus aller Welt',
    'F) Fotokurs Einsteiger: Spiegelreflex und Bildbearbeitung',
    'G) Bewerbungstraining: Lebenslauf und Vorstellungsgespräch',
    'H) Abendkurs Spanisch Konversation (B1)',
    'I) Kreatives Schreiben: Fantasiegeschichten entwickeln',
    'J) Erste-Hilfe am Samstag für alle Interessierten',
    'k) 0) Kein passender Kurs dabei.',
  ],
  'de-b1-l-t3-dienstleistungen-alltag-04': [
    'A) Smartphone-Reparatur: Display und Akku im Express-Service',
    'B) Fahrrad-Service: Bremsen, Kette und Inspektion',
    'C) Umzugshilfe Plus: Tragen, Montage und Verpackung',
    'D) Textilreinigung und Anzug-Service für empfindliche Stoffe',
    'E) Schlüsseldienst und Türservice 24 Stunden',
    'F) Computer-Hilfe: Viren entfernen und PC optimieren',
    'G) Garten- und Balkonservice im Abonnement',
    'H) Haushaltsreinigung: Staubsaugen, Wischen und Bad',
    'I) Hundebetreuung und Gassigehen am Wochenende',
    'J) Nachhilfe Mathematik und Naturwissenschaften',
    'k) 0) Keine passende Anzeige.',
  ],
};

function patchBareT3BankOptions(bank) {
  let patched = 0;
  for (const q of bank.questions || []) {
    if (q.module !== 'lesen' || Number(q.teil) !== 3) continue;
    const prefix = q.id.replace(/-q\d+$/, '');
    const opts = BARE_T3_AD_SETS[prefix];
    if (!opts) continue;
    if (optionsLookLikeAds(q.options)) continue;
    q.options = [...opts];
    patched++;
  }
  return patched;
}

function adsToPartText(ads) {
  return (ads || [])
    .map((a) => {
      const body = a.title && a.text ? `${a.title} — ${a.text}` : a.text || a.title || '';
      return `${a.key}) ${body}`.trim();
    })
    .join('\n');
}

function applyLesenT3Set(part, setKey, questions, token) {
  delete part.items;
  const built = AdsMatching.buildAdsMatchingLesenPart(
    {
      teil: 3,
      slotType: 'ads_matching',
      instruction: part.instruction,
    },
    questions.slice(0, 7),
    (q, i) => bankItemToExamItem(q, token),
  );
  Object.assign(part, built);
  part.passageId = `${setKey}-passage`;
  part.text = adsToPartText(built.ads);
}

function collectLesenT2PassageRows(part) {
  const byId = new Map();
  const add = (row) => {
    const pid = String(row.passageId || '').trim();
    if (!pid) return;
    if (!byId.has(pid)) byId.set(pid, row);
  };
  if (part.passageId) {
    add({
      passageId: part.passageId,
      textTitle: part.textTitle || '',
      text: part.text || '',
    });
  }
  for (const pp of part.passages || []) {
    add({
      passageId: pp.passageId || pp.id,
      textTitle: pp.textTitle || '',
      text: pp.text || pp.passage?.text || '',
    });
  }
  return [...byId.values()];
}

function trimLesenT2(part, tracker, expPassages = 2, expItems = 6, perPassage = 3) {
  const rows = collectLesenT2PassageRows(part);
  const byPassage = new Map();
  for (const q of part.questions || []) {
    const pid = q.passageId;
    if (!pid) continue;
    if (!byPassage.has(pid)) byPassage.set(pid, []);
    byPassage.get(pid).push(q);
  }

  const ranked = rows
    .filter((r) => byPassage.has(r.passageId))
    .map((r) => ({
      ...r,
      questions: byPassage.get(r.passageId) || [],
      uniqueScore: tracker.canUsePassage(r.passageId, r.text) ? 2 : 1,
    }))
    .sort((a, b) => b.uniqueScore - a.uniqueScore || b.questions.length - a.questions.length);

  const kept = ranked.slice(0, expPassages);
  if (!kept.length) return { changed: false, reason: 'no_passages' };

  while (kept.length < expPassages && ranked.length > kept.length) {
    kept.push(ranked[kept.length]);
  }

  const main = kept[0];
  const mate = kept[1] || null;
  part.passageId = main.passageId;
  part.textTitle = main.textTitle;
  part.text = main.text;
  part.passages = mate
    ? [
        {
          passageId: mate.passageId,
          textTitle: mate.textTitle,
          text: mate.text,
        },
      ]
    : [];

  const questions = [];
  for (const p of kept.slice(0, expPassages)) {
    questions.push(...(byPassage.get(p.passageId) || []).slice(0, perPassage));
  }
  part.questions = questions.slice(0, expItems);

  for (const p of kept) {
    tracker.claimPassage(p.passageId, p.text);
  }

  return {
    changed: true,
    kept: kept.map((p) => p.passageId),
    items: part.questions.length,
    passages: kept.length,
  };
}

function trimHorenT1(part, tracker, bp) {
  const expSeg = bp?.segmentsTotal ?? 5;
  const expItems = bp?.itemsTotal ?? 10;
  const perSeg = 2;
  const segs = part.segments || [];
  const haveItems = countScorableItems(part, 'horen');
  const havePassages = countPassagesInPart(part, bp);
  if (segs.length <= expSeg && haveItems <= expItems && havePassages <= expSeg) {
    return { changed: false };
  }

  const ranked = segs
    .map((seg, idx) => ({
      seg,
      idx,
      uniqueScore:
        seg.passageId && tracker.canUsePassage(seg.passageId, seg.transcript || '') ? 2 : 1,
      qCount: (seg.questions || []).length,
    }))
    .sort((a, b) => b.uniqueScore - a.uniqueScore || b.qCount - a.qCount);

  const kept = ranked.slice(0, expSeg);
  part.segments = kept.map((k, i) => ({
    ...k.seg,
    id: k.seg.id || `seg_fill_${i}`,
    label: k.seg.label || `Aufnahme ${i + 1}`,
    questions: (k.seg.questions || []).slice(0, perSeg),
  }));
  part.transcript = part.segments.map((s) => s.transcript).filter(Boolean).join('\n\n');
  for (const k of kept) {
    if (k.seg.passageId) tracker.claimPassage(k.seg.passageId, k.seg.transcript || '');
  }
  return {
    changed: true,
    segments: part.segments.length,
    items: countScorableItems(part, 'horen'),
  };
}

function trimPartGeneric(part, modId, bp, tracker) {
  const actions = [];
  const expItems = bp?.itemsTotal;
  const expPassages = bp?.passagesPerPart ?? bp?.segmentsTotal;

  if (modId === 'horen' && Number(part.teil) === 1 && bp?.segmentsTotal) {
    const havePassages = countPassagesInPart(part, bp);
    const haveItems = countScorableItems(part, 'horen');
    if ((part.segments || []).length > (expPassages ?? 5) || havePassages > (expPassages ?? 5) || haveItems > (expItems ?? 10)) {
      const r = trimHorenT1(part, tracker, bp);
      if (r.changed) actions.push(`horen T1 → ${r.segments} segments, ${r.items} items`);
    }
    return actions;
  }

  if (modId === 'lesen' && Number(part.teil) === 2 && bp?.passagesPerPart === 2) {
    const haveItems = countScorableItems(part, modId);
    const havePassages = countPassagesInPart(part, bp);
    if (haveItems > (expItems ?? 6) || havePassages > (expPassages ?? 2)) {
      const r = trimLesenT2(part, tracker, expPassages ?? 2, expItems ?? 6, 3);
      if (r.changed) actions.push(`lesen T2 → ${r.passages} passages, ${r.items} items`);
    }
    return actions;
  }

  if (expItems != null) {
    const have = countScorableItems(part, modId);
    if (have > expItems) {
      if (part.questions?.length > expItems) {
        part.questions = part.questions.slice(0, expItems);
        actions.push(`${modId} T${part.teil} questions ${have}→${expItems}`);
      }
      if (part.items?.length > expItems) {
        part.items = part.items.slice(0, expItems);
        actions.push(`${modId} T${part.teil} items ${have}→${expItems}`);
      }
    }
  }

  if (expPassages != null) {
    const haveP = countPassagesInPart(part, bp);
    if (haveP > expPassages && Array.isArray(part.passages) && part.passages.length > expPassages - 1) {
      part.passages = part.passages.slice(0, Math.max(0, expPassages - 1));
      actions.push(`${modId} T${part.teil} passages ${haveP}→${expPassages}`);
    }
  }

  return actions;
}

function reassignAllLesenT3Unique(wrappers, completeT3Sets, report) {
  const ordered = [...wrappers].sort((a, b) =>
    String(a.topic || a.exam?.topic || a.id).localeCompare(String(b.topic || b.exam?.topic || b.id)),
  );
  if (completeT3Sets.length < ordered.length) {
    report.unfilled.push({
      exam: '*',
      part: 'lesen T3',
      reason: `need ${ordered.length} unique sets, have ${completeT3Sets.length}`,
    });
    return;
  }
  for (let i = 0; i < ordered.length; i++) {
    const wrapper = ordered[i];
    const exam = wrapper._exam || wrapper.exam;
    const topic = wrapper.topic || exam?.topic || wrapper.id;
    const t3 = (exam.lesenParts || []).find((p) => Number(p.teil) === 3);
    if (!t3) continue;
    const [setKey, qs] = completeT3Sets[i];
    applyLesenT3Set(t3, setKey, qs, examTokenFromFile(wrapper._file));
    report.actions.push({ exam: topic, action: `lesen T3 assign → ${setKey}` });
    console.log(`▶ ${topic}: lesen T3 → ${setKey}`);
    wrapper._exam = exam;
  }
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log('Usage: node scripts/trim-overfilled-parts.mjs --lang de --level B1 [--apply]');
    process.exit(0);
  }

  const blueprint = loadBlueprint(opts.lang, opts.level);
  const dir = curatedDir(opts.lang, opts.level);
  const files = listCuratedFiles(opts.lang, opts.level);
  const bank = loadJsonFile(bankPath(opts.lang, opts.level));
  const bankPatched = patchBareT3BankOptions(bank);
  if (bankPatched && opts.apply) {
    fs.writeFileSync(bankPath(opts.lang, opts.level), JSON.stringify(bank, null, 2) + '\n', 'utf8');
    console.log(`Patched ${bankPatched} bare T3 bank question option row(s)\n`);
  }
  const extraPassages = fs.existsSync(passagesPath(opts.lang, opts.level))
    ? loadJsonFile(passagesPath(opts.lang, opts.level))
    : { passages: [] };
  const completeT3Sets = buildCompleteT3Sets(bank);

  const wrappers = files.map((f) => {
    const w = loadJsonFile(path.join(dir, f));
    w._file = f;
    return w;
  });

  const tracker = new UsageTracker();
  const report = { actions: [], unfilled: [], written: 0 };

  console.log(`\n══ trim-overfilled-parts (${opts.apply ? 'apply' : 'dry-run'}) ══ ${opts.lang}/${opts.level} ══`);
  console.log(`Exams: ${wrappers.length} | T3 sets in pool: ${completeT3Sets.length}\n`);

  for (const wrapper of wrappers) {
    const exam = structuredClone(wrapper.exam);
    const topic = wrapper.topic || exam.topic || wrapper.id;
    const actions = [];

    for (const mod of blueprint.modules || []) {
      const key = modulePartKey(mod.id);
      for (const part of exam[key] || []) {
        const bp = bpPart(blueprint, mod.id, part.teil);
        if (!bp) continue;
        actions.push(...trimPartGeneric(part, mod.id, bp, tracker));
      }
    }

    ExamRenumber.renumberExam(exam, blueprint);
    wrapper._exam = exam;
    wrapper._valOk = validateExamAgainstBlueprint(exam, blueprint).ok;

    if (actions.length) {
      console.log(
        `▶ ${topic}: ${actions.join('; ')}${wrapper._valOk ? '' : ` ✗ ${validateExamAgainstBlueprint(exam, blueprint).errors.slice(0, 2).join('; ')}`}`,
      );
      report.actions.push({ exam: topic, actions, fidelityOk: wrapper._valOk });
    }
  }

  reassignAllLesenT3Unique(wrappers, completeT3Sets, report);

  for (const wrapper of wrappers) {
    if (!wrapper._exam) continue;
    ExamRenumber.renumberExam(wrapper._exam, blueprint);
    wrapper._valOk = validateExamAgainstBlueprint(wrapper._exam, blueprint).ok;
  }

  if (opts.apply) {
    for (const wrapper of wrappers) {
      if (!wrapper._exam) continue;
      const capV = assertBlueprintCaps(wrapper._exam, blueprint, `${wrapper.topic || wrapper.id}/`);
      if (capV.length) {
        console.error(`✗ cap violation after trim ${wrapper.topic}: ${capV.join('; ')}`);
        process.exit(1);
      }
      wrapper.exam = wrapper._exam;
      delete wrapper._exam;
      fs.writeFileSync(path.join(dir, wrapper._file), JSON.stringify(wrapper, null, 2) + '\n', 'utf8');
      report.written++;
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`  Actions: ${report.actions.length}`);
  console.log(`  T3 unfilled: ${report.unfilled.length}`);
  console.log(`  Files written: ${opts.apply ? report.written : 0}${opts.dryRun ? ' (dry-run)' : ''}\n`);

  const fail = report.unfilled.length || wrappers.some((w) => w._valOk === false);
  process.exit(fail ? 1 : 0);
}

main();
