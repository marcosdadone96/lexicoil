/**
 * Fix common Gemini output mistakes before validate/merge.
 */
import { capitalizeBatchNouns, decapitalizeBatchMidSentence } from './capitalizeNouns.mjs';
import { balanceMcqGroup, antiRuns } from './balanceMcq.mjs';
import { normalizeT3 } from './normalizeT3.mjs';
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
  a2: 3,
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
    if (typeof opt === 'string') {
      const t = opt.trim();
      if (/^[a-z]\)\s/i.test(t)) return opt;
      const letter = String.fromCharCode(97 + i);
      return `${letter}) ${t}`;
    }
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

function normalizeQuestionType(raw) {
  const t = String(raw || '').toLowerCase().trim();
  // Normalize all MC variants → multiple_choice
  if (['mcq', 'mc', 'multiple', 'multiple_choice', 'mc_question', 'multiple-choice'].includes(t)) return 'multiple_choice';
  if (['match', 'zuordnung', 'zuordnen'].includes(t)) return 'matching';
  // Keep richtig_falsch/ja_nein as canonical internal types (display logic uses correct value)
  if (['rf', 'richtig_falsch', 'richtig-falsch', 'true_false', 'wahr_falsch'].includes(t)) return 'richtig_falsch';
  if (['jn', 'ja_nein', 'ja-nein', 'ja_nein_frage'].includes(t)) return 'ja_nein';
  return t;
}

function normalizeQuestion(q) {
  const out = { ...q };
  if (typeof out.teil === 'string') out.teil = Number(out.teil);
  // If teil is still missing, try to extract it from the question ID
  // Patterns: gen-q-sp-t1-..., gen-q-s-t2-..., gen-q-h1-...-s1-q1
  if (out.teil == null && out.id) {
    const mTeil = String(out.id).match(/[_-]t(\d)[_-]/i);
    if (mTeil) out.teil = Number(mTeil[1]);
  }
  if (out.type) out.type = normalizeQuestionType(out.type);
  if (out.questionType) out.questionType = normalizeQuestionType(out.questionType);
  // `correct` is canonical. Backfill from correctAnswer only when correct is absent.
  if (out.correct == null && out.correctAnswer != null) {
    out.correct = out.correctAnswer;
  }
  if (out.module === 'schreiben' || out.module === 'sprechen') {
    if (
      out.type === 'rubric' ||
      out.type === 'schreiben' ||
      out.type === 'sprechen' ||
      out.type === 'speaking_task' ||
      out.type === 'oral_task' ||
      out.type === 'speaking' ||
      ['planungsaufgabe', 'praesentation', 'praesentationsaufgabe', 'feedback', 'feedback_diskussion', 'feedback_und_fragen', 'diskussion'].includes(out.type) ||
      !out.type
    ) {
      out.type = 'short_answer';
    }
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
  if (Array.isArray(out.passageId)) delete out.passageId;
  // `correct` always wins. Mirror to correctAnswer so both are always identical.
  if (out.correct != null) {
    out.correctAnswer = out.correct;
  }
  return out;
}

/**
 * Inject module/teil/lang/level and link passageId when Gemini omits bank fields.
 */
export function enrichBatchMetadata(batch, ctx = {}) {
  const mod = ctx.module ? String(ctx.module).toLowerCase() : null;
  const teilNum = ctx.teil != null && Number.isFinite(Number(ctx.teil)) ? Number(ctx.teil) : null;
  const lang = ctx.lang || 'de';
  const level = ctx.level || 'B1';

  const passages = (batch.passages || []).map((p) => {
    const out = { ...p };
    if (mod && !out.module) out.module = mod;
    return out;
  });

  const passageIds = passages.map((p) => p.id).filter(Boolean);
  const solePassageId = passageIds.length === 1 ? passageIds[0] : null;

  const questions = (batch.questions || []).map((q, idx) => {
    const out = { ...q };
    if (mod && !out.module) out.module = mod;
    if (teilNum != null && (out.teil == null || out.teil === '')) out.teil = teilNum;
    if (!out.language) out.language = lang;
    if (!out.level) out.level = level;
    if (!out.examType) out.examType = 'goethe';
    // `correct` is canonical; backfill only when correct is absent.
    if (out.correct == null && out.correctAnswer != null) out.correct = out.correctAnswer;
    if (out.correct != null) out.correctAnswer = out.correct;
    if ((mod === 'horen' || mod === 'lesen') && !out.passageId && solePassageId) {
      out.passageId = solePassageId;
    }
    if (mod === 'horen' && Number(out.teil) === 1 && !out.segmentLabel && passageIds.length > 1) {
      const pid = out.passageId || passageIds[idx % passageIds.length];
      if (pid) {
        out.passageId = pid;
        const segIdx = passageIds.indexOf(pid);
        if (segIdx >= 0) out.segmentLabel = `Aufnahme ${segIdx + 1}`;
      }
    }
    return out;
  });

  return { passages, questions };
}

/**
 * Rotate 3-option MCQ so the correct answer lands in slot (questionIdx % 3).
 * For a 6-question batch this guarantees exactly 2×a, 2×b, 2×c.
 * Accepts 3-option arrays only (T2/T5). Returns { options, correct, correctAnswer }.
 */
export function shuffleMcqOptions(options, correct, questionIdx = 0) {
  if (!Array.isArray(options) || options.length !== 3) return { options, correct, correctAnswer: correct };
  const correctLetter = String(correct || '').toLowerCase().replace(/[^a-c]/g, '');
  const correctIdx = correctLetter ? correctLetter.charCodeAt(0) - 97 : -1;
  if (correctIdx < 0 || correctIdx >= options.length) return { options, correct, correctAnswer: correct };

  // Target slot for this question (0→a, 1→b, 2→c)
  const targetIdx = questionIdx % 3;
  // How many positions to rotate left so correctIdx lands at targetIdx
  const shift = ((correctIdx - targetIdx) + 3) % 3;
  if (shift === 0) return { options, correct, correctAnswer: correct };

  const arr = options.map((o, i) => ({ text: o, originalIdx: i }));
  const rotated = [...arr.slice(shift), ...arr.slice(0, shift)];

  const newCorrectIdx = rotated.findIndex((x) => x.originalIdx === correctIdx);
  const newLetter = String.fromCharCode(97 + newCorrectIdx);
  const newOptions = rotated.map((x, i) => {
    const letter = String.fromCharCode(97 + i);
    return String(x.text).replace(/^[a-c]\)\s*/i, `${letter}) `);
  });
  return { options: newOptions, correct: newLetter, correctAnswer: newLetter };
}

/** Remove internal LLM markup backticks: `word` → word */
function stripBackticks(obj) {
  if (typeof obj === 'string') return obj.replace(/`([^`]+)`/g, '$1');
  if (Array.isArray(obj)) return obj.map(stripBackticks);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = stripBackticks(v);
    return out;
  }
  return obj;
}

/** Remove markdown bold/italic from question text fields only (not explanation metadata). */
const QUESTION_TEXT_FIELDS = new Set(['question', 'signText', 'title']);
function stripMarkdownBold(q) {
  const out = { ...q };
  for (const field of QUESTION_TEXT_FIELDS) {
    if (typeof out[field] === 'string') {
      out[field] = out[field].replace(/\*\*(.+?)\*\*/g, '$1').replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1');
    }
  }
  if (Array.isArray(out.options)) {
    out.options = out.options.map((o) =>
      typeof o === 'string' ? o.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1') : o,
    );
  }
  return out;
}

/** Strip LLM artifact "Stichworte: Wort." from options/matchLabels in Lesen T3. */
const STICHWORTE_RE = /\s*Stichworte:\s*\S+\.?/gi;
function stripStichworte(q) {
  if (q.module !== 'lesen' || q.teil !== 3) return q;
  const out = { ...q };
  if (Array.isArray(out.options)) {
    out.options = out.options.map(o =>
      typeof o === 'string' ? o.replace(STICHWORTE_RE, '').trim() : o,
    );
  }
  if (Array.isArray(out.matchLabels)) {
    out.matchLabels = out.matchLabels.map(o =>
      typeof o === 'string' ? o.replace(STICHWORTE_RE, '').trim() : o,
    );
  }
  return out;
}

/** Derive audio turns from passage text when LLM didn't include the "audio" field.
 *  Splits on lines matching "Name: text" pattern, assigns rotating voices.
 */
const HOREN_VOICES = ['de-DE-KatjaNeural', 'de-DE-ConradNeural', 'de-DE-BerndNeural'];
function deriveAudioFallback(passage, module, teil) {
  if (!passage.text) return null;
  const lines = passage.text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const turns = [];
  const speakerVoice = {};
  let voiceIdx = 0;
  for (const line of lines) {
    const m = line.match(/^([A-ZÄÖÜa-zäöü][^\s:]{0,20}):\s+(.+)$/);
    if (!m) continue;
    const speaker = m[1];
    const text = m[2].trim();
    if (!speakerVoice[speaker]) {
      speakerVoice[speaker] = HOREN_VOICES[voiceIdx % HOREN_VOICES.length];
      voiceIdx++;
    }
    turns.push({ speaker, voiceId: speakerVoice[speaker], text });
  }
  return turns.length >= 2 ? turns : null;
}

export function normalizeBatch(batch, ctx) {
  const cleaned = stripBackticks(batch);
  const base = ctx ? enrichBatchMetadata(cleaned, ctx) : cleaned;
  const mod = String(ctx?.module || '').toLowerCase();
  const teil = ctx?.teil;

  const passages = (base.passages || []).map((p) => {
    const out = { ...p };
    // Add audio fallback for Hören T3 / T4 if not already present
    if (mod === 'horen' && (teil === 3 || teil === 4) && !out.audio) {
      const derived = deriveAudioFallback(out, mod, teil);
      if (derived) out.audio = derived;
    }
    return out;
  });

  // Balance MCQ letter distribution and break consecutive runs (all MCQ teils:
  // lesen T2/T5, horen T1/T2).  richtig_falsch, ja_nein and matching untouched.
  const rawQuestions = (base.questions || []).map((q) =>
    normalizeQuestion(stripStichworte(stripMarkdownBold(q))),
  );
  const balancedQuestions = antiRuns(balanceMcqGroup(rawQuestions));

  let normalized = {
    passages,
    questions: balancedQuestions,
  };

  // Lesen T3: canonicalize matching format (uppercase correct, sync correctAnswer,
  // unify whitespace in shared A-J options list). Does NOT change options[] structure.
  if (mod === 'lesen' && teil === 3) {
    normalized = normalizeT3(normalized);
  }

  // Step N-1: lower-case adjectives/adverbs that Gemini over-capitalises mid-sentence
  const { batch: decapped, totalFixed: nDecap } = decapitalizeBatchMidSentence(normalized);
  if (nDecap > 0) {
    console.log(`  [normalizeNouns] ${nDecap} adjetivo(s)/adverbio(s) en mayúscula errónea corregido(s)`);
  }

  // Last step: deterministic noun capitalization via lexicon
  const { batch: capitalized, totalFixed } = capitalizeBatchNouns(decapped);
  if (totalFixed > 0) {
    console.log(`  [normalizeNouns] ${totalFixed} sustantivo(s) capitalizados automáticamente`);
  }
  return capitalized;
}

/** Tras generación LLM: fuerza module/teil/lang/type del slot objetivo. */
const TEIL_QUESTION_TYPE = {
  1: 'richtig_falsch',
  2: 'multiple_choice',
  3: 'matching',
  4: 'ja_nein',
  5: 'multiple_choice',
};

function normalizeRichtigFalschAnswer(q) {
  const raw = String(q.correctAnswer ?? q.correct ?? '').trim().toLowerCase();
  if (['richtig', 'true', 'wahr', 'r', 'yes', 'ja'].includes(raw)) {
    return { correct: 'Richtig', correctAnswer: 'Richtig' };
  }
  if (['falsch', 'false', 'unwahr', 'f', 'no', 'nein'].includes(raw)) {
    return { correct: 'Falsch', correctAnswer: 'Falsch' };
  }
  return {};
}

function normalizeJaNeinAnswer(q) {
  const raw = String(q.correctAnswer ?? q.correct ?? '').trim().toLowerCase();
  if (raw === 'ja' || raw === 'yes' || raw === 'true') {
    return { correct: 'Ja', correctAnswer: 'Ja' };
  }
  if (raw === 'nein' || raw === 'no' || raw === 'false') {
    return { correct: 'Nein', correctAnswer: 'Nein' };
  }
  return {};
}

export function coerceGeneratedLesenPart(batch, ctx = {}) {
  const teil = Number(ctx.teil);
  const lang = ctx.lang || 'de';
  const level = ctx.level || 'B1';
  const normalized = normalizeBatch(batch, {
    module: 'lesen',
    teil: Number.isFinite(teil) ? teil : ctx.teil,
    lang,
    level,
  });
  const teilNum = Number.isFinite(teil) ? teil : null;
  const slotType = teilNum != null ? TEIL_QUESTION_TYPE[teilNum] : null;
  const passageIds = (normalized.passages || []).map((p) => p.id).filter(Boolean);
  const solePassageId = passageIds.length === 1 ? passageIds[0] : null;

  return {
    passages: (normalized.passages || []).map((p) => ({
      ...p,
      module: 'lesen',
      ...(teilNum != null ? { teil: teilNum } : {}),
      lang: p.lang || lang,
      level: p.level || level,
    })),
    questions: (normalized.questions || []).map((q, qIdx) => {
      let out = {
        ...q,
        module: 'lesen',
        ...(teilNum != null ? { teil: teilNum } : {}),
        lang: q.lang || lang,
        level: q.level || level,
      };
      if (slotType) {
        out.type = slotType;
        if (slotType === 'richtig_falsch') {
          out.options = [];
          out = { ...out, ...normalizeRichtigFalschAnswer(out) };
        } else if (slotType === 'ja_nein') {
          out.options = out.options || [];
          out = { ...out, ...normalizeJaNeinAnswer(out) };
        } else if (slotType === 'multiple_choice') {
          out.options = normalizeOptions(out.options, slotType);
          // Rotate 3-option MCQ (T2/T5) by question index for balanced distribution
          if (out.options.length === 3) {
            const shuffled = shuffleMcqOptions(out.options, out.correct, qIdx);
            out.options = shuffled.options;
            out.correct = shuffled.correct;
            out.correctAnswer = shuffled.correctAnswer;
          }
        }
      }
      if ((out.module === 'lesen' || !out.passageId) && solePassageId && !out.passageId) {
        out.passageId = solePassageId;
      }
      return out;
    }),
  };
}
