/**
 * Shared option-letter ↔ explanation resync (KEEP SINGLE SOURCE OF TRUTH).
 *
 * Used by:
 *   - js/engine/prompts/partPostprocess.js  (balanceAnswerPositions)
 *   - scripts/lib/balanceMcq.mjs            (rotateToTarget)
 *
 * Natural language varies; we apply several context patterns rather than one
 * brittle "Option a)" regex. Letter-only rewrites inside those contexts.
 *
 * Loads as CommonJS (Node) and as a browser script (window.ExplanationOptionResync).
 */

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined') {
    root.ExplanationOptionResync = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Build replace specs for rewriting letter `from` → `to` inside option contexts.
   * Order matters: more specific (with `)`) before bare `\b`.
   * @param {string} from  single a|b|c
   * @param {string} to    single a|b|c
   */
  function buildResyncReplacers(from, to) {
    const f = from;
    const t = to;
    return [
      // "Option a)" / "option b)"
      {
        id: 'option_paren',
        re: new RegExp(`([Oo]ption\\s*)${f}(\\))`, 'g'),
        repl: `$1${t}$2`,
      },
      // "Option a" / "was Option c korrekt macht" (no closing paren)
      {
        id: 'option_bare',
        re: new RegExp(`([Oo]ption\\s*)${f}\\b(?!\\s*\\))`, 'g'),
        repl: `$1${t}`,
      },
      // "die Option a" / "Die Option b"
      {
        id: 'die_option',
        re: new RegExp(`(\\b[Dd]ie\\s+[Oo]ption\\s*)${f}\\b`, 'g'),
        repl: `$1${t}`,
      },
      // "Antwort a" / "Antwort b)"
      {
        id: 'antwort',
        re: new RegExp(`([Aa]ntwort\\s*)${f}\\b`, 'g'),
        repl: `$1${t}`,
      },
      // "Alternative a"
      {
        id: 'alternative',
        re: new RegExp(`([Aa]lternative\\s*)${f}\\b`, 'g'),
        repl: `$1${t}`,
      },
      // "Buchstabe a"
      {
        id: 'buchstabe',
        re: new RegExp(`([Bb]uchstabe\\s*)${f}\\b`, 'g'),
        repl: `$1${t}`,
      },
      // "a ist korrekt/richtig" (letter leading)
      {
        id: 'letter_ist',
        re: new RegExp(`\\b${f}(\\s+ist\\s+(?:richtig|korrekt))\\b`, 'gi'),
        repl: `${t}$1`,
      },
      // "ist a korrekt/richtig"
      {
        id: 'ist_letter',
        re: new RegExp(`(\\bist\\s+)${f}(\\s+(?:richtig|korrekt)\\b)`, 'gi'),
        repl: `$1${t}$2`,
      },
    ];
  }

  /**
   * If explanation names an option letter in a known context and that letter
   * moved during shuffle, rewrite `oldLetter` → `newLetter`.
   * No-op when explanation has no such reference (the normal case).
   */
  function resyncExplanationOptionLetter(explanation, oldLetter, newLetter) {
    const expl = String(explanation || '');
    const from = String(oldLetter || '')
      .toLowerCase()
      .replace(/[^a-c]/g, '')
      .slice(0, 1);
    const to = String(newLetter || '')
      .toLowerCase()
      .replace(/[^a-c]/g, '')
      .slice(0, 1);
    if (!expl || !from || !to || from === to) return explanation;

    let out = expl;
    for (const { re, repl } of buildResyncReplacers(from, to)) {
      out = out.replace(re, repl);
    }
    return out;
  }

  /**
   * Detect option-letter mentions in explanation (for audit / retroactive repair).
   * @returns {{ letter: string, patternId: string, match: string, index: number }[]}
   */
  function findExplanationOptionLetters(explanation) {
    const text = String(explanation || '');
    const hits = [];
    const seen = new Set();
    for (const letter of ['a', 'b', 'c']) {
      for (const { id, re } of buildResyncReplacers(letter, letter)) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          const key = `${m.index}:${letter}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push({ letter, patternId: id, match: m[0], index: m.index });
        }
      }
    }
    hits.sort((a, b) => a.index - b.index);
    return hits;
  }

  /**
   * Retroactive: rewrite every option-letter mention in explanation to `correctLetter`
   * when it disagrees. Does not touch options/correct — explanation text only.
   * @returns {{ explanation: string, changed: boolean, fixes: object[] }}
   */
  function alignExplanationOptionLetters(explanation, correctLetter) {
    const want = String(correctLetter || '')
      .toLowerCase()
      .replace(/[^a-c]/g, '')
      .slice(0, 1);
    const expl = String(explanation || '');
    if (!expl || !want) return { explanation: expl, changed: false, fixes: [] };

    const hits = findExplanationOptionLetters(expl);
    const fixes = [];
    let out = expl;
    const wrongLetters = [...new Set(hits.map((h) => h.letter).filter((l) => l !== want))];
    for (const wrong of wrongLetters) {
      const before = out;
      out = resyncExplanationOptionLetter(out, wrong, want);
      if (out !== before) {
        fixes.push({ from: wrong, to: want });
      }
    }
    return { explanation: out, changed: out !== expl, fixes };
  }

  return {
    resyncExplanationOptionLetter,
    findExplanationOptionLetters,
    alignExplanationOptionLetters,
    buildResyncReplacers,
  };
});
