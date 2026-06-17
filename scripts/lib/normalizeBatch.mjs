/**
 * Fix common Gemini output mistakes before validate/merge.
 */
const SKILL_MAP = {
  listening: 'listening',
  listening_comprehension: 'listening',
  hörverstehen: 'listening',
  hörverstehen: 'listening',
  horverstehen: 'listening',
  reading: 'reading',
  reading_comprehension: 'reading',
  leseverstehen: 'reading',
  writing: 'writing',
  schreiben: 'writing',
  speaking: 'speaking',
  sprechen: 'speaking',
  grammar: 'grammar',
};

const DIFFICULTY_WORDS = {
  leicht: 3,
  easy: 3,
  mittel: 5,
  medium: 5,
  schwer: 7,
  hard: 7,
  b1: 5,
  b2: 6,
  c1: 7,
};

function moduleDefaultSkill(module) {
  if (module === 'horen') return 'listening';
  if (module === 'lesen') return 'reading';
  if (module === 'schreiben') return 'writing';
  if (module === 'sprechen') return 'speaking';
  if (module === 'grammatik') return 'grammar';
  return 'reading';
}

function normalizeDifficulty(value, module) {
  if (typeof value === 'number' && value >= 1 && value <= 10) return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (DIFFICULTY_WORDS[lower] != null) return DIFFICULTY_WORDS[lower];
    const n = parseInt(value, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 10) return n;
  }
  if (module === 'horen') return 5;
  if (module === 'schreiben' || module === 'sprechen') return 6;
  return 4;
}

function normalizeSkills(value, module) {
  const fallback = moduleDefaultSkill(module);
  const mapOne = (s) => {
    const key = String(s).toLowerCase().trim();
    return SKILL_MAP[key] || (['listening', 'reading', 'writing', 'speaking', 'grammar'].includes(key) ? key : fallback);
  };
  if (Array.isArray(value) && value.length) {
    return value.map(mapOne).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return [mapOne(value)];
  }
  return [fallback];
}

function normalizeTopicTags(value) {
  if (Array.isArray(value)) return value.length > 1 ? [value[0]] : value;
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return ['daily_life'];
}

function defaultExplanation(q) {
  if (q.module === 'schreiben' || q.module === 'sprechen') {
    return 'Bewertung: Inhalt vollständig; passende Struktur und Register; verständliche Sprache auf B1-Niveau.';
  }
  return q.explanation || 'Siehe Text/Transkript.';
}

/** Gemini sometimes returns { value, text } objects instead of "a) …" strings. */
export function normalizeOptions(options, type) {
  if (!Array.isArray(options)) return [];
  if (type === 'richtig_falsch') return [];
  return options.map((opt, i) => {
    if (typeof opt === 'string') return opt;
    if (opt && typeof opt === 'object') {
      const letter = String(opt.value ?? opt.id ?? opt.key ?? String.fromCharCode(97 + i))
        .replace(/[^a-z]/gi, '')
        .toLowerCase()
        .slice(0, 1) || String.fromCharCode(97 + i);
      const text = opt.text ?? opt.label ?? opt.content ?? '';
      return text ? `${letter}) ${text}` : letter;
    }
    return String(opt);
  });
}

function normalizeQuestion(q) {
  const out = { ...q };
  if (typeof out.teil === 'string') out.teil = Number(out.teil);
  if (out.module === 'schreiben' || out.module === 'sprechen') {
    if (out.type === 'rubric' || !out.type) out.type = 'short_answer';
  }
  out.difficulty = normalizeDifficulty(out.difficulty, out.module);
  out.skills = normalizeSkills(out.skills, out.module);
  out.topicTags = normalizeTopicTags(out.topicTags);
  out.options = normalizeOptions(out.options, out.type);
  if (out.type === 'richtig_falsch' && Array.isArray(out.options) && out.options.length) {
    out.options = [];
  }
  if (!out.explanation || String(out.explanation).toLowerCase() === 'rubric') {
    out.explanation = defaultExplanation(out);
  }
  if (out.passageId === null) delete out.passageId;
  if (out.correct != null && out.correctAnswer != null && out.correct !== out.correctAnswer) {
    const c = String(out.correct).trim();
    const ca = String(out.correctAnswer).trim();
    if (/^[a-j0]$/i.test(c)) {
      out.correctAnswer = c.toLowerCase() === '0' ? '0' : c.toLowerCase();
    } else if (/^[A-J]$/.test(c)) {
      out.correctAnswer = c;
    } else if (/^[A-Z]$/.test(ca) && (out.type === 'matching' || String(out.type).includes('match'))) {
      out.correct = ca;
    }
  }
  return out;
}

export function normalizeBatch(batch) {
  return {
    passages: (batch.passages || []).map((p) => ({ ...p })),
    questions: (batch.questions || []).map(normalizeQuestion),
  };
}
