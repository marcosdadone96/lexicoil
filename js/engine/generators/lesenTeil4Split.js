/**
 * Lesen Teil 4 (forum_opinions) — split into fast sub-calls that fit Netlify ~30s limit.
 * Phase 1: shell (instruction + textTitle). Phases 2+: 3 opinions per batch (Haiku, ~5.5k tokens).
 */
const LesenTeil4Split = (() => {
  const MAX_TOKENS = 5500;
  const SHELL_MAX_TOKENS = 2500;
  const SUB_TIMEOUT_MS = 26000;
  const MODEL = 'claude-haiku-4-5';

  function isLesenForumT4Chunk(chunk) {
    const slotType = String(chunk?.blueprintPart?.slotType || '').toLowerCase();
    const teilNum = Number(chunk?.teil ?? chunk?.blueprintPart?.teil);
    const expectKey = String(chunk?.expectKey || '').toLowerCase();
    return (
      (slotType.includes('forum') || slotType.includes('opinion')) &&
      teilNum === 4 &&
      /lesen|reading/.test(expectKey)
    );
  }

  function parseItemIdRange(part) {
    const count = part?.questionsTotal?.min ?? part?.questionsTotal?.max ?? 7;
    const instr = String(part?.instruction || '');
    const m = instr.match(/(\d{1,2})\s*(?:bis|–|-|to)\s*(\d{1,2})/i);
    const start = m ? Number(m[1]) : 20;
    const end = m ? Number(m[2]) : start + count - 1;
    const n = Math.max(1, end - start + 1);
    return Array.from({ length: n }, (_, i) => String(start + i));
  }

  function itemIdBatches(part, batchSize = 3) {
    const ids = parseItemIdRange(part);
    const batches = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      batches.push(ids.slice(i, i + batchSize));
    }
    return batches;
  }

  function phaseCount(part) {
    return 1 + itemIdBatches(part).length;
  }

  function extractPart(partObj, expectKey) {
    const arr = partObj?.[expectKey];
    if (!Array.isArray(arr) || !arr[0]) return null;
    return arr[0];
  }

  function buildShellPrompt(chunk) {
    const key = chunk.expectKey;
    return (
      `${chunk.prompt}\n\n` +
      'SPLIT GENERATION — PHASE 1 (shell ONLY, no opinions yet):\n' +
      `- Return ONE object in "${key}" with teil:4, official instruction, textTitle (forum topic as a question).\n` +
      '- Set blueprintSlot/slotType to "forum_opinions". items[] MUST be empty [].\n' +
      '- Do NOT include part.text. Do NOT generate any signText opinions in this phase.\n' +
      `- Example: {"${key}":[{"teil":4,"instruction":"…","textTitle":"Sollen Handys in der Schule erlaubt sein?","items":[]}]}`
    );
  }

  function buildItemsPrompt(chunk, itemIds, textTitle) {
    const key = chunk.expectKey;
    const topic = String(textTitle || 'forum topic').slice(0, 300);
    return (
      `${chunk.prompt}\n\n` +
      `SPLIT GENERATION — opinions batch (ids ${itemIds.join(', ')} ONLY):\n` +
      `- Shared forum topic (textTitle): "${topic}" — every opinion must clearly relate to this topic.\n` +
      `- Generate EXACTLY ${itemIds.length} item(s) with ids ${itemIds.join(', ')}.\n` +
      '- Each item: signText (60–80 words, one person\'s forum post), type "ja_nein", correct "J" or "N".\n' +
      '- No question field, no options[], no part.text.\n' +
      `- Return {"${key}":[{"teil":4,"items":[...]}]} with ONLY these ${itemIds.length} items.\n` +
      '- Mix J and N answers across the batch where natural.'
    );
  }

  function normalizeItem(it) {
    if (!it || typeof it !== 'object') return null;
    const signText = it.signText || it.text || it.body || it.content;
    if (!signText) return null;
    const out = { ...it, signText, type: it.type || 'ja_nein' };
    delete out.text;
    delete out.options;
    delete out.question;
    return out;
  }

  function mergeParts(expectKey, shell, collectedItems, blueprintPart) {
    const byId = new Map();
    for (const raw of collectedItems) {
      const it = normalizeItem(raw);
      if (!it || it.id == null) continue;
      byId.set(String(it.id), it);
    }
    const items = [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
    const merged = {
      ...shell,
      teil: Number(shell?.teil) || 4,
      blueprintSlot: shell?.blueprintSlot || 'forum_opinions',
      slotType: shell?.slotType || 'forum_opinions',
      items,
      questions: [],
    };
    delete merged.text;
    validateItemCount(merged, blueprintPart, items);
    return { [expectKey]: [merged] };
  }

  function expectedItemCount(blueprintPart) {
    const qt = blueprintPart?.questionsTotal;
    if (qt?.min != null) return qt.min;
    if (qt?.max != null) return qt.max;
    return parseItemIdRange(blueprintPart).length;
  }

  function validateItemCount(part, blueprintPart, items) {
    const expected = expectedItemCount(blueprintPart);
    const n = items?.length ?? part.items?.length ?? 0;
    const ids = (items || part.items || []).map((i) => i.id).join(',');
    if (n !== expected) {
      log(
        `[GEN lesen teil4] WARN item_count_mismatch expected=${expected} received=${n} ids=[${ids}]`,
      );
    } else {
      log(`[GEN lesen teil4] merge ok expected=${expected} ids=[${ids}]`);
    }
  }

  function classifyFail(err) {
    if (!err) return 'empty';
    const code = String(err.code || '');
    const msg = String(err.message || '').toLowerCase();
    if (code === 'timeout' || msg.includes('timed out') || msg.includes('timeout')) return 'timeout';
    if (
      msg.includes('json') ||
      msg.includes('parse') ||
      msg.includes('chunk not') ||
      msg.includes('missing lesen') ||
      msg.includes('could not parse') ||
      msg.includes('expected')
    ) {
      return 'json_parse';
    }
    if (msg.includes('empty')) return 'empty';
    return 'api_error';
  }

  function log(msg) {
    if (typeof lcDebug !== 'undefined') lcDebug.log(msg);
    console.log(msg);
  }

  /**
   * Run Lesen T4 as sequential sub-calls; retries each phase independently.
   */
  async function runSplit(chunk, hooks, ai) {
    const {
      callAI,
      onStep = () => {},
      parseExamJson,
      validateChunkObj,
      promptSuffix = '',
    } = hooks;

    const subAi = {
      ...ai,
      examModel: MODEL,
      timeoutMs: SUB_TIMEOUT_MS,
    };
    const maxTokens = chunk.lesenT4MaxTokens || MAX_TOKENS;
    const suffix = promptSuffix || '';
    let shell = null;
    let textTitle = '';

    log('[GEN lesen teil4] start (split)');
    onStep('Lesen Teil 4 — forum topic…');

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        log('[GEN lesen teil4] shell start');
        const fix =
          attempt > 0
            ? '\n\nFIX: Return lesenParts/teil:4 with textTitle + instruction; items:[].'
            : '';
        const raw = await callAI(
          buildShellPrompt(chunk) + fix + suffix,
          SHELL_MAX_TOKENS,
          subAi,
        );
        const parsed = validateChunkObj(chunk, parseExamJson(raw));
        shell = extractPart(parsed, chunk.expectKey);
        textTitle = String(shell?.textTitle || shell?.instruction || '').trim();
        if (!shell || !textTitle) throw new Error('empty lesen t4 shell');
        log('[GEN lesen teil4] shell ok');
        break;
      } catch (err) {
        log('[GEN lesen teil4] shell FAIL reason=' + classifyFail(err));
        if (attempt === 1) throw err;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    const batches = itemIdBatches(chunk.blueprintPart);
    const collected = [];

    for (const itemIds of batches) {
      const label = `${itemIds[0]}-${itemIds[itemIds.length - 1]}`;
      let batchOk = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          log(`[GEN lesen teil4] items ${label} start`);
          onStep(`Lesen Teil 4 — Meinungen ${label}…`);
          const fix =
            attempt > 0
              ? `\n\nFIX: Return exactly ${itemIds.length} items with ids ${itemIds.join(', ')} and full signText.`
              : '';
          const raw = await callAI(
            buildItemsPrompt(chunk, itemIds, textTitle) + fix + suffix,
            maxTokens,
            subAi,
          );
          const parsed = validateChunkObj(chunk, parseExamJson(raw));
          const batchPart = extractPart(parsed, chunk.expectKey);
          const got = (batchPart?.items || []).map(normalizeItem).filter(Boolean);
          if (got.length < itemIds.length) {
            throw new Error(`expected ${itemIds.length} items, got ${got.length}`);
          }
          for (const id of itemIds) {
            const found = got.find((it) => String(it.id) === String(id));
            if (!found) throw new Error(`missing item id ${id}`);
            collected.push(found);
          }
          log(`[GEN lesen teil4] items ${label} ok (batch ids: ${itemIds.join(',')}, collected total: ${collected.length})`);
          batchOk = true;
          break;
        } catch (err) {
          log(`[GEN lesen teil4] items ${label} FAIL reason=` + classifyFail(err));
          if (attempt === 1) throw err;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      if (!batchOk) throw new Error(`Lesen Teil 4 batch ${label} failed`);
    }

    const part = mergeParts(chunk.expectKey, shell, collected, chunk.blueprintPart);
    const n = part[chunk.expectKey]?.[0]?.items?.length || 0;
    log(`[GEN lesen teil4] ok (${n} items)`);
    return part;
  }

  return Object.freeze({
    isLesenForumT4Chunk,
    itemIdBatches,
    phaseCount,
    parseItemIdRange,
    mergeParts,
    runSplit,
    MAX_TOKENS,
    SUB_TIMEOUT_MS,
    MODEL,
  });
})();

if (typeof window !== 'undefined') window.LesenTeil4Split = LesenTeil4Split;
if (typeof module !== 'undefined') module.exports = LesenTeil4Split;
