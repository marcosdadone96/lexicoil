/** Shared JSON parse / merge helpers for exam E2E tests */

export const PART_KEYS = [
  'lesenParts',
  'horenParts',
  'schreibenParts',
  'sprechenParts',
  'readingParts',
  'listeningParts',
  'writingParts',
  'speakingParts',
];

export function extractJsonBlock(raw) {
  let s = String(raw).replace(/```json\s*|```/gi, '').trim();
  const start = s.indexOf('{');
  if (start < 0) throw new Error('No JSON object in AI response');
  s = s.slice(start);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(0, i + 1);
    }
  }
  return s;
}

export function salvageJson(text) {
  let json = extractJsonBlock(text);
  for (let n = 0; n < 24; n++) {
    try {
      return JSON.parse(json);
    } catch (e) {
      if (!/unterminated|unexpected end|position/i.test(e.message)) throw e;
      const ob = (json.match(/\{/g) || []).length - (json.match(/\}/g) || []).length;
      const oa = (json.match(/\[/g) || []).length - (json.match(/\]/g) || []).length;
      if (ob > 0 || oa > 0) {
        json = json.replace(/,\s*$/, '') + ']'.repeat(Math.max(0, oa)) + '}'.repeat(Math.max(0, ob));
        continue;
      }
      const cut = json.lastIndexOf(',');
      if (cut > 10) json = json.slice(0, cut);
      else throw e;
    }
  }
  throw new Error('Could not parse AI JSON');
}

export function normalizeChunkObj(chunk, obj) {
  if (!obj || Array.isArray(obj)) return obj;
  if (obj.parts && Array.isArray(obj.parts) && chunk.expectKey) {
    const o = { topic: obj.topic, level: obj.level, lang: obj.lang || obj.language };
    o[chunk.expectKey] = obj.parts;
    return o;
  }
  if (chunk.expectKey === 'lesenParts' && (obj.teil1 || obj.teil2)) {
    return { ...obj, lesenParts: [obj.teil1, obj.teil2].filter(Boolean) };
  }
  const key = chunk.expectKey;
  if (key && obj[key] && !Array.isArray(obj[key]) && typeof obj[key] === 'object') {
    return { ...obj, [key]: [obj[key]] };
  }
  if (!obj.lang && obj.language) {
    obj = {
      ...obj,
      lang: obj.language === 'German' ? 'de' : obj.language === 'Spanish' ? 'es' : 'en',
    };
  }
  return obj;
}

export function validateChunkObj(chunk, obj) {
  obj = normalizeChunkObj(chunk, obj);
  if (!obj || Array.isArray(obj) || typeof obj !== 'object') {
    throw new Error('chunk response is not an object');
  }
  if (chunk.expectKey && !Array.isArray(obj[chunk.expectKey])) {
    throw new Error(
      `missing ${chunk.expectKey} (keys: ${Object.keys(obj).join(', ')})`,
    );
  }
  return obj;
}

export function mergeExamParts(...args) {
  const topic = args[args.length - 1];
  const chunks = args.slice(0, -1);
  let merged = {};
  for (const part of chunks) {
    for (const [k, v] of Object.entries(part)) {
      if (PART_KEYS.includes(k) && Array.isArray(v)) {
        merged[k] = [...(merged[k] || []), ...v];
      } else if (!(k in merged)) merged[k] = v;
      else if (k === 'modules') merged[k] = { ...merged[k], ...v };
    }
  }
  return {
    ...merged,
    topic: merged.topic || topic,
    level: merged.level || 'B1',
    lang: merged.lang || 'de',
  };
}

export function isValidExam(exam) {
  if (!exam || typeof exam !== 'object') return false;
  const parts =
    (exam.lesenParts?.length || 0) +
    (exam.horenParts?.length || 0) +
    (exam.schreibenParts?.length || 0) +
    (exam.sprechenParts?.length || 0) +
    (exam.readingParts?.length || 0) +
    (exam.listeningParts?.length || 0) +
    (exam.writingParts?.length || 0) +
    (exam.speakingParts?.length || 0);
  if (parts > 0) return true;
  if (exam.lesen?.questions?.length || exam.horen?.questions?.length) return true;
  if (exam.reading?.questions?.length || exam.listening?.questions?.length) return true;
  return false;
}

export function countParts(exam) {
  const out = {};
  for (const k of PART_KEYS) {
    if (Array.isArray(exam[k])) out[k] = exam[k].length;
  }
  return out;
}

export function meetsPartMinimums(counts, minimums) {
  for (const [key, min] of Object.entries(minimums)) {
    if ((counts[key] || 0) < min) return false;
  }
  return true;
}
