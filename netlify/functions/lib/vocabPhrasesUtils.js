'use strict';

const path = require('path');

let SeparableResolve;
let VerbConjugation;

function loadSeparableResolve() {
  if (!SeparableResolve) {
    const sepPath = path.join(__dirname, '../../../js/engine/separableResolve.js');
    SeparableResolve = require(sepPath);
    if (typeof global !== 'undefined') global.SeparableResolve = SeparableResolve;
  }
  return SeparableResolve;
}

function loadVerbConjugation() {
  if (!VerbConjugation) {
    try {
      const lemPath = path.join(__dirname, '../../../js/engine/validation/lemmatizer.js');
      if (!global.Lemmatizer) global.Lemmatizer = require(lemPath);
    } catch (_) {}
    loadSeparableResolve();
    VerbConjugation = require(path.join(__dirname, '../../../js/data/verbConjugation.js'));
  }
  return VerbConjugation;
}

function isSeparableTarget(word) {
  const SR = loadSeparableResolve();
  return SR.SEPARABLE_INFINITIVES.has(String(word || '').trim().toLowerCase());
}

function splitSeparableLemma(lemma) {
  const SR = loadSeparableResolve();
  const low = String(lemma || '').trim().toLowerCase();
  if (!SR.SEPARABLE_INFINITIVES.has(low)) return null;
  const sorted = [...SR.SEPARABLE_PREFIXES].sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    if (!low.startsWith(p) || low.length <= p.length + 2) continue;
    const root = low.slice(p.length);
    if (/(?:en|eln|ern)$/i.test(root) && root.length >= 4) return { prefix: p, root };
  }
  return null;
}

function findLemmaPair(full, targetWord) {
  const SR = loadSeparableResolve();
  const lemma = String(targetWord || '').trim().toLowerCase();
  const tokens = SR.tokenize(String(full || '').trim());
  const pairs = SR.findSplitPairs(tokens);
  return pairs.find((p) => p.lemma === lemma) || null;
}

/** True when full contains a glued finite token for this separable lemma (e.g. abnimmt). */
function fullHasGluedSeparableToken(full, targetWord) {
  const split = splitSeparableLemma(targetWord);
  if (!split) return false;
  const SR = loadSeparableResolve();
  const tokens = SR.tokenize(String(full || '').trim());
  const particleSeen = tokens.some((t) => !SR.isBreakToken(t) && t.toLowerCase() === split.prefix);
  if (particleSeen) return false;
  const gluedRe = new RegExp(`^${split.prefix}[a-zäöüß]{2,}`, 'i');
  return tokens.some((t) => !SR.isBreakToken(t) && gluedRe.test(t));
}

/**
 * Gate: separable targets must have findSplitPairs(full) with matching lemma,
 * blankToken = conjugated root (not glued lemma), prefix separate in full.
 */
function validateSeparablePhrase(targetWord, full, blankToken) {
  const target = String(targetWord || '').trim().toLowerCase();
  if (!isSeparableTarget(target)) return { ok: true };

  if (fullHasGluedSeparableToken(full, target)) {
    return { ok: false, reason: 'glued_token_in_full' };
  }

  const pair = findLemmaPair(full, target);
  if (!pair) return { ok: false, reason: 'no_split_pair' };

  const blank = String(blankToken || '').trim();
  const blankLow = blank.toLowerCase();
  const rootLow = String(pair.rootToken || '').toLowerCase();
  const rootBare = rootLow.replace(/[.,!?;:…]+$/g, '');

  if (!blank) return { ok: false, reason: 'missing_blank' };
  if (blankLow === target) return { ok: false, reason: 'blank_is_lemma' };
  if (blankLow.startsWith(pair.particleToken)) return { ok: false, reason: 'blank_has_prefix' };

  const split = splitSeparableLemma(target);
  if (split && blankLow === `${split.prefix}${rootBare}`) {
    return { ok: false, reason: 'blank_is_glued' };
  }

  if (blankLow !== rootBare && blankLow !== rootLow) {
    return { ok: false, reason: 'blank_not_root', expectedRoot: pair.rootToken };
  }

  return { ok: true, pair };
}

function buildDisplayFromBlank(full, blankToken) {
  const blank = String(blankToken || '').trim();
  if (!blank) return full;
  return full.replace(new RegExp(blank.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '_____');
}

function normalizeSeparablePhraseItem(item) {
  const targetWord = String(item?.targetWord || '').trim();
  const full = String(item?.full || '').trim();
  let blankToken = String(item?.blankToken || '').trim();
  let blankPos = String(item?.blankPos || '').trim().toLowerCase();
  if (!['noun', 'verb', 'adjective', 'adverb'].includes(blankPos)) blankPos = 'other';

  if (!isSeparableTarget(targetWord)) {
    return { ok: true, phrase: { ...item, targetWord, full, blankToken, blankPos } };
  }

  blankPos = 'verb';
  let gate = validateSeparablePhrase(targetWord, full, blankToken);
  if (!gate.ok && gate.reason === 'blank_not_root' && gate.expectedRoot) {
    blankToken = gate.expectedRoot;
    gate = validateSeparablePhrase(targetWord, full, blankToken);
  }

  if (!gate.ok) return { ok: false, reason: gate.reason, targetWord, full, blankToken };

  const SR = loadSeparableResolve();
  let tokens = Array.isArray(item?.tokens)
    ? item.tokens.map((t) => String(t || '').trim()).filter(Boolean)
    : SR.tokenize(full);
  if (tokens.length < 3) tokens = SR.tokenize(full);

  const display = buildDisplayFromBlank(full, blankToken);
  return {
    ok: true,
    phrase: {
      targetWord,
      full,
      blankToken,
      blankPos,
      tokens,
      display,
      separable: true,
      particle: gate.pair.particleToken,
      rootToken: gate.pair.rootToken,
    },
  };
}

function separablePresentRoot(lemma, person = 'er') {
  const VC = loadVerbConjugation();
  const c = VC.getPresent ? VC.getPresent(lemma, 'de') : null;
  if (!c?.separable || !c.forms) return null;
  const form = String(c.forms[person] || c.forms.er || '').trim();
  if (!form) return null;
  const parts = form.split(/\s+/);
  return parts[0] || null;
}

function pickSeparableStemDistractors(blankRoot, targetWord, allMeta, need = 3, rng = Math.random) {
  const blank = String(blankRoot || '').trim();
  const target = String(targetWord || '').trim().toLowerCase();
  const exclude = new Set([blank.toLowerCase(), target]);
  const stems = new Set();

  for (const m of allMeta || []) {
    const w = String(m.word || '').trim().toLowerCase();
    if (!w || exclude.has(w) || !isSeparableTarget(w)) continue;
    const stem = separablePresentRoot(w);
    if (!stem || exclude.has(stem.toLowerCase())) continue;
    stems.add(stem);
  }

  const arr = [...stems];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, need);
}

function buildSeparablePromptRules(words) {
  const SR = loadSeparableResolve();
  const separable = words.filter((w) => SR.SEPARABLE_INFINITIVES.has(String(w).toLowerCase()));
  if (!separable.length) return '';
  return `
SEPARABLE VERBS (mandatory for: ${separable.join(', ')}):
- In main clauses, SPLIT the verb: conjugated ROOT in V2 position, PREFIX at clause end (e.g. "Die Sonne geht am Abend unter." for untergehen, NOT "Die Sonne untergeht am Abend.").
- "blankToken" MUST be the conjugated ROOT only (e.g. "geht", "nimmt", "schlägt") — NEVER the glued form ("untergeht", "abnimmt").
- "tokens" MUST list root and prefix as separate words (e.g. ["Die","Sonne","geht","am","Abend","unter."]).
- "full" must pass split-pair validation: particle separated from root.`;
}

module.exports = {
  isSeparableTarget,
  findLemmaPair,
  fullHasGluedSeparableToken,
  validateSeparablePhrase,
  normalizeSeparablePhraseItem,
  buildDisplayFromBlank,
  separablePresentRoot,
  pickSeparableStemDistractors,
  buildSeparablePromptRules,
  loadSeparableResolve,
};
