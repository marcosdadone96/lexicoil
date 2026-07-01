/**
 * Lesen Teil 2 (press_mcq, dual passages) — split into two fast sub-calls (~26s each).
 * Phase 1: Text A + 3 MCQ. Phase 2: Text B + 3 MCQ. Merged with official instruction.
 */
const LesenTeil2Split = (() => {
  const MAX_TOKENS = 4500;
  const SHELL_MAX_TOKENS = 1200;
  const SUB_TIMEOUT_MS = 26000;
  const MODEL = 'claude-haiku-4-5';

  function isLesenT2SplitChunk(chunk) {
    if (chunk?.lesenT2Split) return true;
    const slotType = String(chunk?.blueprintPart?.slotType || '').toLowerCase();
    const teilNum = Number(chunk?.teil ?? chunk?.blueprintPart?.teil);
    const expectKey = String(chunk?.expectKey || '').toLowerCase();
    return (
      teilNum === 2 &&
      /lesen|reading/.test(expectKey) &&
      (slotType.includes('press') || Number(chunk?.blueprintPart?.passagesPerPart) >= 2)
    );
  }

  function parseQuestionIdRange(part) {
    const instr = String(part?.instruction || '');
    const m = instr.match(/(\d{1,2})\s*(?:bis|–|-|to)\s*(\d{1,2})/i);
    if (m) {
      const start = Number(m[1]);
      const end = Number(m[2]);
      const count = end - start + 1;
      const half = Math.floor(count / 2);
      const aIds = Array.from({ length: half }, (_, i) => String(start + i));
      const bIds = Array.from({ length: count - half }, (_, i) => String(start + half + i));
      return { aIds, bIds };
    }
    return { aIds: ['7', '8', '9'], bIds: ['10', '11', '12'] };
  }

  function phaseCount() {
    return 3; // shell + passage A + passage B
  }

  function extractPart(partObj, expectKey) {
    const arr = partObj?.[expectKey];
    if (!Array.isArray(arr) || !arr[0]) return null;
    return arr[0];
  }

  function wordTarget(part) {
    const w = part?.wordsPerPassage || part?.wordsPerText;
    if (w?.min && w?.max) return `${Math.min(w.min, 120)}-${Math.min(w.max, 180)}`;
    return '120-160';
  }

  function buildShellPrompt(chunk) {
    const key = chunk.expectKey;
    const instr = chunk.blueprintPart?.instruction || '';
    return (
      `${chunk.prompt}\n\n` +
      'SPLIT GENERATION — PHASE 1 (shell ONLY):\n' +
      `- Return ONE object in "${key}" with teil:2, official instruction, blueprintSlot "press_mcq".\n` +
      `- instruction MUST be: "${instr.replace(/"/g, '\\"')}"\n` +
      '- passages[] MUST be empty []. questions[] MUST be empty [].\n' +
      '- Do NOT generate any press text or questions in this phase.'
    );
  }

  function buildPassagePrompt(chunk, passageId, questionIds) {
    const key = chunk.expectKey;
    const words = wordTarget(chunk.blueprintPart);
    const other = passageId === 'A' ? 'B' : 'A';
    return (
      `${chunk.prompt}\n\n` +
      `SPLIT GENERATION — Text ${passageId} ONLY (passage ${passageId} of 2; Text ${other} comes in a separate call):\n` +
      `- Return {"${key}":[{"teil":2,"passages":[{"passageId":"${passageId}","textTitle":"…","text":"…"}],"questions":[…]}]}.\n` +
      `- ONE independent press/magazine text (${words} words, BRIEF — 4-6 sentences).\n` +
      `- EXACTLY 3 multiple-choice questions (a/b/c) with passageId "${passageId}", ids ${questionIds.join(', ')}.\n` +
      `- Each question answerable ONLY from this text. Non-degenerate correct keys.\n` +
      `- Do NOT include passage "${other}" or its questions.`
    );
  }

  function normalizePassage(raw, passageId) {
    if (!raw || typeof raw !== 'object') return null;
    const passages = Array.isArray(raw.passages) ? raw.passages : [];
    let hit =
      passages.find((p) => String(p.passageId || p.id || '').toUpperCase() === passageId) ||
      passages[passageId === 'A' ? 0 : 1] ||
      passages[0];
    if (!hit && raw.text?.trim()) {
      hit = { passageId, textTitle: raw.textTitle || `Text ${passageId}`, text: raw.text };
    }
    if (!hit) return null;
    const text = String(hit.text || '').trim();
    if (!text) return null;
    return {
      passageId,
      textTitle: hit.textTitle || hit.title || `Text ${passageId}`,
      text,
    };
  }

  function normalizeQuestions(raw, wantIds, passageId) {
    const qs = Array.isArray(raw?.questions) ? raw.questions : [];
    const out = [];
    for (const id of wantIds) {
      const q =
        qs.find((x) => String(x.id) === String(id)) ||
        qs.find((x) => String(x.passageId || '').toUpperCase() === passageId && !out.some((o) => o.id === x.id));
      if (!q || !q.question) return null;
      out.push({
        ...q,
        id: String(id),
        passageId,
        type: q.type || 'multiple_choice',
      });
    }
    return out.length === wantIds.length ? out : null;
  }

  function mergeParts(expectKey, shell, passageA, passageB, questionsA, questionsB) {
    const merged = {
      ...(shell || {}),
      teil: 2,
      blueprintSlot: 'press_mcq',
      slotType: 'press_mcq',
      instruction: shell?.instruction || '',
      passages: [passageA, passageB],
      questions: [...questionsA, ...questionsB],
      text: passageA.text,
      textTitle: passageA.textTitle,
      textB: passageB.text,
      textTitleB: passageB.textTitle,
    };
    return { [expectKey]: [merged] };
  }

  function classifyFail(err) {
    if (!err) return 'empty';
    const code = String(err.code || '');
    const msg = String(err.message || '').toLowerCase();
    if (code === 'timeout' || msg.includes('timed out') || msg.includes('timeout')) return 'timeout';
    if (msg.includes('json') || msg.includes('parse') || msg.includes('passage') || msg.includes('question')) {
      return 'json_parse';
    }
    return 'api_error';
  }

  function log(msg) {
    if (typeof lcDebug !== 'undefined') lcDebug.log(msg);
    console.log(msg);
  }

  async function runSplit(chunk, hooks, ai) {
    const { callAI, onStep = () => {}, parseExamJson, validateChunkObj, promptSuffix = '' } = hooks;
    const subAi = { ...ai, examModel: MODEL, timeoutMs: SUB_TIMEOUT_MS };
    const suffix = promptSuffix || '';
    const { aIds, bIds } = parseQuestionIdRange(chunk.blueprintPart);
    let shell = null;

    log('[GEN lesen teil2] start (split)');
    onStep('Lesen Teil 2 — Vorbereitung…');

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fix = attempt > 0 ? '\n\nFIX: Return teil:2 shell with instruction only; empty passages and questions.' : '';
        const raw = await callAI(buildShellPrompt(chunk) + fix + suffix, SHELL_MAX_TOKENS, subAi);
        const parsed = validateChunkObj(chunk, parseExamJson(raw));
        shell = extractPart(parsed, chunk.expectKey);
        if (!shell?.instruction) throw new Error('empty lesen t2 shell');
        log('[GEN lesen teil2] shell ok');
        break;
      } catch (err) {
        log('[GEN lesen teil2] shell FAIL reason=' + classifyFail(err));
        if (attempt === 1) throw err;
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    async function runPassage(letter, ids) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          log(`[GEN lesen teil2] passage ${letter} start`);
          onStep(`Lesen Teil 2 — Text ${letter}…`);
          const fix =
            attempt > 0
              ? `\n\nFIX: Return Text ${letter} with 3 MC questions ids ${ids.join(', ')}, passageId "${letter}".`
              : '';
          const raw = await callAI(
            buildPassagePrompt(chunk, letter, ids) + fix + suffix,
            chunk.lesenT2MaxTokens || MAX_TOKENS,
            subAi,
          );
          const parsed = validateChunkObj(chunk, parseExamJson(raw));
          const part = extractPart(parsed, chunk.expectKey);
          const passage = normalizePassage(part, letter);
          const questions = normalizeQuestions(part, ids, letter);
          if (!passage || !questions) throw new Error(`invalid passage ${letter}`);
          log(`[GEN lesen teil2] passage ${letter} ok`);
          return { passage, questions };
        } catch (err) {
          log(`[GEN lesen teil2] passage ${letter} FAIL reason=` + classifyFail(err));
          if (attempt === 1) throw err;
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
      throw new Error(`passage ${letter} failed`);
    }

    const sideA = await runPassage('A', aIds);
    const sideB = await runPassage('B', bIds);
    const part = mergeParts(chunk.expectKey, shell, sideA.passage, sideB.passage, sideA.questions, sideB.questions);
    log('[GEN lesen teil2] ok (6 questions, 2 passages)');
    return part;
  }

  return Object.freeze({
    isLesenT2SplitChunk,
    parseQuestionIdRange,
    phaseCount,
    mergeParts,
    runSplit,
    MAX_TOKENS,
    SUB_TIMEOUT_MS,
    MODEL,
  });
})();

if (typeof window !== 'undefined') window.LesenTeil2Split = LesenTeil2Split;
if (typeof module !== 'undefined') module.exports = LesenTeil2Split;
