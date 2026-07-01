'use strict';

/**
 * Optional semantic gate: topic/theme coherence + CEFR level appropriateness.
 *
 * Enable with TOPIC_COHERENCE_GATE=1 (recommended ON in production).
 * Cost: ~1 Claude call per part (uses CLAUDE_VERIFY_MODEL, default Haiku).
 */

function isEnabled() {
  return process.env.TOPIC_COHERENCE_GATE === '1';
}

function verifyModel() {
  return String(process.env.CLAUDE_VERIFY_MODEL || 'claude-haiku-4-5').trim();
}

function isExamShape(input) {
  if (!input || typeof input !== 'object') return false;
  return !!(
    input.lesenParts ||
    input.horenParts ||
    input.readingParts ||
    input.listeningParts ||
    input.schreibenParts ||
    input.sprechenParts ||
    input.modules
  );
}

function listScorableParts(exam) {
  const out = [];
  const topic = exam.topic || exam.theme || null;
  for (const [key, mod] of [
    ['lesenParts', 'lesen'],
    ['readingParts', 'lesen'],
    ['horenParts', 'horen'],
    ['listeningParts', 'horen'],
    ['schreibenParts', 'schreiben'],
    ['writingParts', 'schreiben'],
    ['sprechenParts', 'sprechen'],
    ['speakingParts', 'sprechen'],
  ]) {
    for (const part of exam[key] || []) {
      if (!part || typeof part !== 'object') continue;
      out.push({ part, module: mod, teil: part.teil ?? null, topic });
    }
  }
  return out;
}

function summarizePartContent(part, module) {
  const bits = [];
  const push = (v, max = 1200) => {
    const s = String(v || '').trim();
    if (s) bits.push(s.slice(0, max));
  };

  push(part.passage?.text || part.passage?.transcript);
  push(part.text || part.textTitle);
  push(part.transcript);
  push(part.task || part.instruction || part.prompt || part.situation);

  for (const seg of (part.segments || []).slice(0, 4)) {
    push(seg.transcript || seg.text, 800);
  }
  for (const ad of (part.ads || []).slice(0, 12)) {
    push(ad.text || ad.body || ad.title, 300);
  }

  const questions = part.questions || part.items || [];
  for (const q of questions.slice(0, 10)) {
    push(q.question || q.statement || q.stem || q.signText || q.text, 220);
  }

  if (module === 'schreiben' || module === 'sprechen') {
    push(part.points?.join('\n'), 600);
    push(part.prompts?.join('\n'), 600);
  }

  return bits.filter(Boolean).join('\n---\n').slice(0, 3800);
}

function buildTopicCoherencePrompt({ topic, lang, level, module, teil, content }) {
  const topicLine = topic ? String(topic) : '(infer theme from content — must be a coherent single theme)';
  return [
    `You verify whether ONE section of a ${String(lang || 'de').toUpperCase()} CEFR ${String(level || 'B1').toUpperCase()} language exam matches its assigned topic/theme and uses language appropriate for that level.`,
    '',
    'Assigned topic/theme:',
    topicLine,
    '',
    `Module: ${module || 'unknown'}${teil != null ? ` Teil ${teil}` : ''}`,
    '',
    'Decide:',
    '- onTopic: true if readings, questions, tasks, and answer options clearly belong to the assigned theme (or one coherent theme when topic is unspecified).',
    '- cefrOk: true if vocabulary and sentence complexity fit the CEFR level (not clearly A1 text at C1, nor C1 text at A2).',
    '',
    'Reply with ONLY valid JSON, no markdown:',
    '{"onTopic":true,"cefrOk":true,"issues":[]}',
    '',
    'Set onTopic=false when most content is about a different domain (e.g. topic "transport" but content is cooking/recipes).',
    'Set cefrOk=false when level mismatch is obvious.',
    'issues: up to 4 short English strings explaining problems (empty array when both true).',
    '',
    'SECTION CONTENT:',
    content || '(empty)',
  ].join('\n');
}

function parseTopicCoherenceResponse(text) {
  const raw = String(text || '').replace(/```json|```/g, '').trim();
  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch (_) {
      return null;
    }
  };
  let data = tryParse(raw);
  if (!data) {
    const m = raw.match(/\{[\s\S]*\}/);
    data = m ? tryParse(m[0]) : null;
  }
  if (!data || typeof data !== 'object') {
    return { onTopic: true, cefrOk: true, issues: ['parse_failed'], skipped: false, reason: 'parse_failed' };
  }
  const issues = Array.isArray(data.issues)
    ? data.issues.map((x) => String(x)).filter(Boolean).slice(0, 6)
    : [];
  return {
    onTopic: data.onTopic !== false,
    cefrOk: data.cefrOk !== false,
    issues,
    skipped: false,
  };
}

async function callClaudeTopicVerify(prompt, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: verifyModel(),
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    console.warn('[topicCoherenceGate] API error:', msg);
    return { skipped: true, reason: 'api_error', onTopic: true, cefrOk: true, issues: [] };
  }
  const text = (data.content || []).map((p) => p.text || '').join('');
  return parseTopicCoherenceResponse(text);
}

/**
 * Verify topic coherence for a single part or a full exam.
 * For exams, runs one Claude call per scorable part (~1 call/part).
 *
 * @returns {{ onTopic: boolean, cefrOk: boolean, issues: string[], skipped?: boolean, reason?: string, parts?: object[] }}
 */
async function verifyTopicCoherence(partOrExam, { topic, lang, level, apiKey, module, teil } = {}) {
  if (!isEnabled()) {
    return { onTopic: true, cefrOk: true, issues: [], skipped: true, reason: 'disabled' };
  }
  if (!apiKey) {
    return { onTopic: true, cefrOk: true, issues: [], skipped: true, reason: 'no_api_key' };
  }

  const lg = String(lang || partOrExam?.lang || 'de').slice(0, 2).toLowerCase();
  const lv = String(level || partOrExam?.level || 'B1').toUpperCase();

  if (isExamShape(partOrExam)) {
    const parts = listScorableParts(partOrExam);
    if (!parts.length) {
      return { onTopic: true, cefrOk: true, issues: [], skipped: true, reason: 'no_parts' };
    }

    const partResults = [];
    let onTopic = true;
    let cefrOk = true;
    const issues = [];

    for (const row of parts) {
      const partTopic = topic || row.topic || partOrExam.topic || null;
      const content = summarizePartContent(row.part, row.module);
      if (!content.trim()) continue;

      const prompt = buildTopicCoherencePrompt({
        topic: partTopic,
        lang: lg,
        level: lv,
        module: row.module,
        teil: row.teil,
        content,
      });

      let result;
      try {
        result = await callClaudeTopicVerify(prompt, apiKey);
      } catch (err) {
        console.warn('[topicCoherenceGate] network error:', err.message);
        result = { onTopic: true, cefrOk: true, issues: [], skipped: true, reason: 'network_error' };
      }

      partResults.push({
        module: row.module,
        teil: row.teil,
        ...result,
      });

      if (!result.skipped) {
        if (!result.onTopic) onTopic = false;
        if (!result.cefrOk) cefrOk = false;
        for (const issue of result.issues || []) {
          issues.push(`${row.module} T${row.teil ?? '?'}: ${issue}`);
        }
      }
    }

    if (!partResults.some((r) => !r.skipped)) {
      return { onTopic: true, cefrOk: true, issues: [], skipped: true, reason: 'all_parts_empty', parts: partResults };
    }

    return { onTopic, cefrOk, issues, skipped: false, parts: partResults };
  }

  const mod = String(module || partOrExam?.module || 'lesen').toLowerCase();
  const partTeil = teil ?? partOrExam?.teil ?? null;
  const partTopic = topic || partOrExam?.topic || null;
  const content = summarizePartContent(partOrExam, mod);

  if (!content.trim()) {
    return { onTopic: true, cefrOk: true, issues: [], skipped: true, reason: 'empty_content' };
  }

  const prompt = buildTopicCoherencePrompt({
    topic: partTopic,
    lang: lg,
    level: lv,
    module: mod,
    teil: partTeil,
    content,
  });

  try {
    return await callClaudeTopicVerify(prompt, apiKey);
  } catch (err) {
    console.warn('[topicCoherenceGate] network error:', err.message);
    return { onTopic: true, cefrOk: true, issues: [], skipped: true, reason: 'network_error' };
  }
}

/** Convenience wrapper for validateExam flows. ok=false when gate rejects content. */
async function verifyTopicCoherenceExam(exam, opts = {}) {
  const result = await verifyTopicCoherence(exam, opts);
  const ok = result.skipped || (result.onTopic && result.cefrOk);
  return { ...result, ok };
}

module.exports = {
  verifyTopicCoherence,
  verifyTopicCoherenceExam,
  isTopicCoherenceGateEnabled: isEnabled,
  summarizePartContent,
  listScorableParts,
};
