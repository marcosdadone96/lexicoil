#!/usr/bin/env node
/**
 * Reprocess pool-verified vocabularyTags after findSplitSeparables v2.3.5
 * (allowlist-only + anti-prep / clause-break guards).
 *
 *   node scripts/reprocess-separable-split-2026-07-11.mjs
 *   node scripts/reprocess-separable-split-2026-07-11.mjs --dry-run
 *   node scripts/reprocess-separable-split-2026-07-11.mjs --audit-only
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractVocabularyFromText,
  questionSpecificVocabBlob,
  ensureDistinctQuestionVocabTags,
  VOCAB_TAGS_NORMALIZE_VERSION,
  SEPARABLE_INFINITIVES,
} from './lib/enrichBatchMetadata.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const LOG = path.join(ROOT, 'batches/ready/gate-logs/separable-split-reprocess-2026-07-11.json');
const dryRun = process.argv.includes('--dry-run');
const auditOnly = process.argv.includes('--audit-only');

const PREFIXES = [
  'mit', 'auf', 'an', 'aus', 'ein', 'zu', 'vor', 'nach', 'bei', 'los', 'weg',
  'zurück', 'weiter', 'fest', 'teil', 'statt', 'heran', 'herum', 'hin', 'her',
];
const ROOTS = [
  'machen', 'nehmen', 'bringen', 'kommen', 'schalten', 'räumen',
  'rufen', 'fangen', 'sehen', 'ziehen', 'laden', 'kaufen',
];
const COMBOS = new Set(PREFIXES.flatMap((p) => ROOTS.map((r) => `${p}${r}`)));

const ROOT_FORMS = {
  machen: ['machen', 'macht', 'machst', 'mache', 'gemacht', 'machten', 'machte'],
  nehmen: ['nehmen', 'nimmt', 'nimmst', 'nehme', 'genommen', 'nahmen', 'nahm'],
  bringen: ['bringen', 'bringt', 'bringst', 'bringe', 'gebracht', 'brachten', 'brachte'],
  kommen: ['kommen', 'kommt', 'kommst', 'komme', 'gekommen', 'kamen', 'kam'],
  schalten: ['schalten', 'schaltet', 'schaltest', 'geschaltet', 'schaltete'],
  räumen: ['räumen', 'raeumen', 'räumt', 'raeumt', 'geräumt', 'geraemt'],
  rufen: ['rufen', 'ruft', 'rufst', 'gerufen', 'rief', 'riefen'],
  fangen: ['fangen', 'fängt', 'faengt', 'fange', 'gefangen', 'fing'],
  sehen: ['sehen', 'sieht', 'siehst', 'sehe', 'gesehen', 'sah', 'sahen'],
  ziehen: ['ziehen', 'zieht', 'ziehst', 'gezogen', 'zog', 'zogen'],
  laden: ['laden', 'lädt', 'laedt', 'ladet', 'geladen', 'lud'],
  kaufen: ['kaufen', 'kauft', 'kaufst', 'gekauft', 'kaufte', 'kauften'],
};

function wholeWord(text, w) {
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Za-zÄÖÜäöüß])${esc}(?:[^A-Za-zÄÖÜäöüß]|$)`, 'i').test(text);
}

function participleOf(prefix, root) {
  if (root === 'nehmen') return `${prefix}genommen`;
  if (root === 'bringen') return `${prefix}gebracht`;
  if (root === 'kommen') return `${prefix}gekommen`;
  if (root === 'rufen') return `${prefix}gerufen`;
  if (root === 'fangen') return `${prefix}gefangen`;
  if (root === 'sehen') return `${prefix}gesehen`;
  if (root === 'ziehen') return `${prefix}gezogen`;
  if (root === 'laden') return `${prefix}geladen`;
  if (root === 'kaufen') return `${prefix}gekauft`;
  if (root === 'schalten') return `${prefix}geschaltet`;
  if (root === 'räumen') return [`${prefix}geräumt`, `${prefix}geraemt`];
  return `${prefix}gemacht`;
}

function isGenuineInText(text, full) {
  const prefix = PREFIXES.find((p) => full.startsWith(p) && ROOTS.includes(full.slice(p.length)));
  if (!prefix) return wholeWord(text, full);
  const root = full.slice(prefix.length);
  if (wholeWord(text, full)) return true;
  if (wholeWord(text, `${prefix}zu${root}`)) return true;
  const parts = participleOf(prefix, root);
  for (const part of Array.isArray(parts) ? parts : [parts]) {
    if (wholeWord(text, part)) return true;
  }
  const forms = ROOT_FORMS[root] || [root];
  const formAlt = forms.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const pEsc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const gap = '[^.!?]{0,70}?';
  const verbThenParticle = new RegExp(`\\b(?:${formAlt})\\b${gap}\\b${pEsc}\\b`, 'i');
  if (!verbThenParticle.test(text)) return false;
  const m = text.match(verbThenParticle);
  if (!m) return false;
  const afterIdx = text.toLowerCase().indexOf(m[0].toLowerCase()) + m[0].length;
  const after = text.slice(afterIdx, afterIdx + 12);
  if (/^\s+(?:der|die|das|den|dem|des|ein|eine|einer|eines|einem|einen)\b/i.test(after)) {
    return false;
  }
  // Manual FP patterns from Paso 1
  if (/räumen/i.test(m[0]) && prefix === 'auf') return false; // noun Räumen
  if (prefix === 'ein' && /\bsieht\b/i.test(m[0]) && /\bein\b/i.test(m[0])) return false;
  if (prefix === 'mit' && /\bsieht\b/i.test(m[0])) return false;
  return true;
}

function unitText(q, passage) {
  return questionSpecificVocabBlob(q, passage);
}

function tagsEqual(a, b) {
  const aa = (a || []).map(String);
  const bb = (b || []).map(String);
  if (aa.length !== bb.length) return false;
  return aa.every((t, i) => t === bb[i]);
}

function reextractQuestionVocab(q, passage) {
  const vocabBlob = questionSpecificVocabBlob(q, passage);
  let words = extractVocabularyFromText(vocabBlob, 6);
  if (words.length < 3) {
    words = extractVocabularyFromText(
      [q.question, q.explanation, passage?.title].filter(Boolean).join(' '),
      6,
    );
  }
  if (words.length < 2 && passage?.text) {
    words = extractVocabularyFromText(`${vocabBlob} ${passage.text}`, 6);
  }
  if (!words.length) {
    words = extractVocabularyFromText(
      [q.question, q.explanation].filter(Boolean).join(' '),
      4,
    );
  }
  return words.length ? words.slice(0, 6) : ['Alltag', 'Mensch', 'Zeit'];
}

function collectComboTags(doc) {
  const hits = [];
  const walk = (n, pathSoFar) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      n.forEach((x, i) => walk(x, `${pathSoFar}[${i}]`));
      return;
    }
    if (Array.isArray(n.vocabularyTags)) {
      for (const t of n.vocabularyTags) {
        const low = String(typeof t === 'string' ? t : t?.word || '').toLowerCase();
        if (COMBOS.has(low)) hits.push({ path: pathSoFar, tag: low });
      }
    }
    for (const [k, v] of Object.entries(n)) {
      if (k === 'vocabularyTags' || k.startsWith('_')) continue;
      walk(v, pathSoFar ? `${pathSoFar}.${k}` : k);
    }
  };
  walk(doc, '');
  return hits;
}

const files = fs.readdirSync(POOL).filter((f) => f.endsWith('.json')).sort();
const stampAt = new Date().toISOString();

// ── Point 2: regression on existing tagged combos (before rewrite) ────────
console.log('=== POINT 2: recount tagged combos with new extractor ===');
const knownGenuineKeys = new Set(); // file|qid|tag that were genuine pre-fix
const knownFpKeys = new Set();
const recount = {
  oldTotal: 0,
  stillEmitted: 0,
  dropped: 0,
  genuineKept: 0,
  genuineLost: 0,
  fpKept: 0,
  fpDropped: 0,
  byCombo: {},
  losses: [],
  fpRemaining: [],
  handAdjusted: [],
};

const HAND_FP_SNIPPETS = [
  { tag: 'mitsehen', re: /sieht.*mit|mit.*sieht/i, label: 'sieht…mit' },
  { tag: 'einsehen', re: /sieht.*ein|ein Problem/i, label: 'sieht…ein' },
  { tag: 'aufräumen', re: /[Rr]äumen.*auf|auf.*[Rr]äumen/i, label: 'Räumen…auf' },
];

for (const file of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
  const passagesById = new Map((doc.passages || []).map((p) => [p.id, p]));
  for (const q of doc.questions || []) {
    const tags = (q.vocabularyTags || []).map((t) => String(t).toLowerCase());
    const comboTags = tags.filter((t) => COMBOS.has(t));
    if (!comboTags.length) continue;
    const blob = unitText(q, passagesById.get(q.passageId));
    const extracted = extractVocabularyFromText(blob, 16).map((t) => String(t).toLowerCase());
    // Also try same fallbacks as reextract
    const extracted2 = reextractQuestionVocab(q, passagesById.get(q.passageId)).map((t) =>
      String(t).toLowerCase(),
    );
    const newSet = new Set([...extracted, ...extracted2]);

    for (const tag of comboTags) {
      recount.oldTotal += 1;
      if (!recount.byCombo[tag]) recount.byCombo[tag] = { old: 0, kept: 0, dropped: 0, genuine: 0, fp: 0 };
      recount.byCombo[tag].old += 1;
      const genuine = isGenuineInText(blob, tag);
      if (genuine) {
        recount.byCombo[tag].genuine += 1;
        knownGenuineKeys.add(`${file}|${q.id}|${tag}`);
      } else {
        recount.byCombo[tag].fp += 1;
        knownFpKeys.add(`${file}|${q.id}|${tag}`);
      }

      const still = newSet.has(tag);
      if (still) {
        recount.stillEmitted += 1;
        recount.byCombo[tag].kept += 1;
        if (genuine) recount.genuineKept += 1;
        else {
          recount.fpKept += 1;
          recount.fpRemaining.push({ file, id: q.id, tag, sample: blob.replace(/\s+/g, ' ').slice(0, 100) });
        }
      } else {
        recount.dropped += 1;
        recount.byCombo[tag].dropped += 1;
        if (genuine) {
          recount.genuineLost += 1;
          recount.losses.push({ file, id: q.id, tag, sample: blob.replace(/\s+/g, ' ').slice(0, 100) });
        } else recount.fpDropped += 1;
      }

      for (const h of HAND_FP_SNIPPETS) {
        if (tag === h.tag && h.re.test(blob)) {
          recount.handAdjusted.push({
            file,
            id: q.id,
            tag,
            label: h.label,
            stillEmitted: still,
          });
        }
      }
    }
  }
}

console.log(JSON.stringify({
  oldTotal: recount.oldTotal,
  stillEmitted: recount.stillEmitted,
  dropped: recount.dropped,
  genuineKept: recount.genuineKept,
  genuineLost: recount.genuineLost,
  fpKept: recount.fpKept,
  fpDropped: recount.fpDropped,
  handAdjusted: recount.handAdjusted,
  losses: recount.losses,
  fpRemaining: recount.fpRemaining.slice(0, 20),
}, null, 2));

if (auditOnly) {
  fs.writeFileSync(LOG, JSON.stringify({ stampAt, recount }, null, 2));
  process.exit(0);
}

// ── Point 3: reprocess all files whose tags change ────────────────────────
console.log('\n=== POINT 3: reprocess changed files ===');
const modified = [];
const unchanged = [];
const perFile = [];

for (const file of files) {
  const abs = path.join(POOL, file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const passagesById = new Map((batch.passages || []).map((p) => [p.id, p]));
  const beforeByQ = (batch.questions || []).map((q) => [...(q.vocabularyTags || [])]);

  const questions = (batch.questions || []).map((q) => ({ ...q }));
  for (const q of questions) {
    q.vocabularyTags = reextractQuestionVocab(q, passagesById.get(q.passageId));
  }
  ensureDistinctQuestionVocabTags(questions, (q) =>
    questionSpecificVocabBlob(q, passagesById.get(q.passageId)),
  );

  const qChanges = [];
  let any = false;
  for (let i = 0; i < questions.length; i++) {
    const oldTags = beforeByQ[i];
    const newTags = [...(questions[i].vocabularyTags || [])];
    if (!tagsEqual(oldTags, newTags)) {
      any = true;
      qChanges.push({
        id: questions[i].id,
        before: oldTags,
        after: newTags,
        removedCombos: oldTags
          .map((t) => String(t).toLowerCase())
          .filter((t) => COMBOS.has(t) && !newTags.map((x) => String(x).toLowerCase()).includes(t)),
        addedCombos: newTags
          .map((t) => String(t).toLowerCase())
          .filter((t) => COMBOS.has(t) && !oldTags.map((x) => String(x).toLowerCase()).includes(t)),
      });
    } else {
      questions[i].vocabularyTags = batch.questions[i].vocabularyTags;
    }
  }

  if (!any) {
    unchanged.push(file);
    continue;
  }

  const out = { ...batch, questions };
  out._vocabTagsNormalizeVersion = VOCAB_TAGS_NORMALIZE_VERSION;
  out._separableSplitFixReprocessedAt = stampAt;

  modified.push(file);
  perFile.push({ file, questionsChanged: qChanges.length, qChanges });

  if (!dryRun) {
    fs.writeFileSync(abs, `${JSON.stringify(out, null, 2)}\n`);
  }
  console.log(
    `${dryRun ? '[dry] ' : ''}${file}: ${qChanges.length} q changed; removedCombos=`,
    qChanges.flatMap((c) => c.removedCombos),
  );
}

console.log(`modified ${modified.length} / ${files.length}; unchanged ${unchanged.length}`);

// ── Point 4: final combo scan on disk (or simulated if dry-run) ───────────
console.log('\n=== POINT 4: final combo scan ===');
const final = { total: 0, genuine: 0, fp: 0, byCombo: {}, fps: [] };

function scanDoc(doc, file) {
  const passagesById = new Map((doc.passages || []).map((p) => [p.id, p]));
  for (const q of doc.questions || []) {
    for (const t of q.vocabularyTags || []) {
      const tag = String(t).toLowerCase();
      if (!COMBOS.has(tag)) continue;
      final.total += 1;
      if (!final.byCombo[tag]) final.byCombo[tag] = { total: 0, genuine: 0, fp: 0 };
      final.byCombo[tag].total += 1;
      const blob = unitText(q, passagesById.get(q.passageId));
      if (isGenuineInText(blob, tag)) {
        final.genuine += 1;
        final.byCombo[tag].genuine += 1;
      } else {
        final.fp += 1;
        final.byCombo[tag].fp += 1;
        final.fps.push({ file, id: q.id, tag, sample: blob.replace(/\s+/g, ' ').slice(0, 100) });
      }
    }
  }
}

if (dryRun) {
  for (const file of files) {
    const batch = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
    const change = perFile.find((p) => p.file === file);
    if (change) {
      const qMap = new Map(change.qChanges.map((c) => [c.id, c.after]));
      for (const q of batch.questions || []) {
        if (qMap.has(q.id)) q.vocabularyTags = qMap.get(q.id);
      }
    }
    scanDoc(batch, file);
  }
} else {
  for (const file of files) {
    scanDoc(JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8')), file);
  }
}

console.log(JSON.stringify({
  finalTotal: final.total,
  finalGenuine: final.genuine,
  finalFp: final.fp,
  byCombo: final.byCombo,
  fps: final.fps,
}, null, 2));

const report = {
  stampAt,
  version: VOCAB_TAGS_NORMALIZE_VERSION,
  dryRun,
  recount,
  modified,
  unchangedCount: unchanged.length,
  perFile,
  final,
  allowlistHasEinnehmen: SEPARABLE_INFINITIVES.has('einnehmen'),
};
fs.writeFileSync(LOG, JSON.stringify(report, null, 2));
console.log('\nWrote', LOG);
