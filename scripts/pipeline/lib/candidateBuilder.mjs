/**
 * Build staging candidates from exams / lesen-horen parts (Sprint 2).
 */
import crypto from 'node:crypto';
import { newCandidateId } from './stagingStore.mjs';

function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function slugId(prefix, text) {
  const hash = crypto.createHash('sha256').update(String(text || '').slice(0, 200)).digest('hex').slice(0, 10);
  return `${prefix}-${hash}`;
}

function mapExamQuestion(q, lang, level, module, teil, passageId) {
  const id =
    q.id ||
    slugId(`lb-${lang}-${level}-${module}-t${teil}`, `${q.question}-${q.correct || q.correctAnswer}`);
  const correct = q.correct ?? q.correctAnswer ?? '';
  return {
    id,
    module,
    teil,
    type: q.type || 'multiple',
    question: q.question || '',
    options: q.options,
    correct,
    correctAnswer: correct,
    explanation: q.explanation || '',
    grammarTags: q.grammarTags || [],
    topicTags: q.topicTags || [],
    vocabularyTags: q.vocabularyTags || [],
    difficulty: q.difficulty ?? 4,
    inferenceLevel: q.inferenceLevel || 'explicit',
    distractorProfile: q.distractorProfile || 'plausible',
    passageId: passageId || q.passageId || undefined,
    segmentLabel: q.segmentLabel,
    transcript: q.transcript,
    lang,
    level,
  };
}

function adsToOptions(ads) {
  return (ads || []).map((ad) => {
    const key = String(ad.key || '').toLowerCase() || 'a';
    const title = ad.title || '';
    const snippet = ad.text ? ` — ${String(ad.text).slice(0, 100)}` : '';
    return `${key}) ${title}${snippet}`;
  });
}

function opinionSignText(question, opinions) {
  const text = String(question?.question || '');
  for (const op of opinions || []) {
    if (op.name && text.includes(op.name)) {
      return `${op.name}: ${op.text || ''}`.trim();
    }
  }
  return null;
}

function enrichLesenQuestions(questions, part) {
  const adOptions = part.ads?.length ? adsToOptions(part.ads) : null;
  for (const q of questions) {
    if (adOptions?.length && (q.type === 'matching' || q.type === 'match') && !q.options?.length) {
      q.options = adOptions;
    }
    if (part.opinions?.length) {
      const signText = opinionSignText(q, part.opinions);
      if (signText) q.signText = signText;
    }
    if (q.type === 'ja_nein' && !q.options?.length) {
      q.options = ['Ja', 'Nein'];
    }
  }
  return questions;
}

function blueprintPart(blueprint, module, teil) {
  const mod = blueprint?.modules?.find((m) => m.id === module);
  return mod?.parts?.find((p) => p.teil === teil) || null;
}

export function lesenPartToCandidate(part, { lang, level, blueprint, batchId, source, teilOverride }) {
  const teil = teilOverride ?? part.teil ?? 1;
  const bpPart = blueprintPart(blueprint, 'lesen', teil);
  const passageId = slugId(`p-lesen-t${teil}`, part.textTitle || part.text || part.instruction);
  const passage = part.text
    ? {
        id: passageId,
        module: 'lesen',
        title: part.textTitle || `Lesen Teil ${teil}`,
        text: part.text,
      }
    : null;

  const questions = enrichLesenQuestions(
    (part.questions || []).map((q) => mapExamQuestion(q, lang, level, 'lesen', teil, passage?.id)),
    part,
  );

  if (part.ads?.length && passage) {
    passage.ads = part.ads;
  }

  return {
    id: newCandidateId(lang, level, 'lesen', teil),
    status: 'pending',
    lang,
    level,
    module: 'lesen',
    teil,
    slotType: bpPart?.slotType || null,
    label: bpPart?.label || `Lesen Teil ${teil}`,
    passage,
    questions,
    ads: part.ads || undefined,
    opinions: part.opinions || undefined,
    validation: null,
    review: { notes: '', editedAt: null, reviewedAt: null },
    provenance: {
      generatedBy: source,
      batchId,
      createdAt: new Date().toISOString(),
      sourceTeil: teil,
      wordCount: passage ? wordCount(passage.text) : 0,
    },
  };
}

export function horenPartToCandidate(part, { lang, level, blueprint, batchId, source }) {
  const teil = part.teil ?? 1;
  const bpPart = blueprintPart(blueprint, 'horen', teil);
  const passageId = slugId(`p-horen-t${teil}`, part.context || part.instruction || part.transcript);
  const transcript = part.transcript || (part.segments || []).map((s) => s.transcript).filter(Boolean).join('\n');

  const passage = transcript
    ? {
        id: passageId,
        module: 'horen',
        title: part.context || `Hören Teil ${teil}`,
        text: transcript,
      }
    : null;

  const questions = [];
  if (Array.isArray(part.questions)) {
    for (const q of part.questions) {
      questions.push(mapExamQuestion(q, lang, level, 'horen', teil, passage?.id));
    }
  }
  if (Array.isArray(part.segments)) {
    for (const seg of part.segments) {
      for (const q of seg.questions || []) {
        questions.push({
          ...mapExamQuestion(q, lang, level, 'horen', teil, passage?.id),
          segmentLabel: seg.label || q.segmentLabel,
          transcript: seg.transcript || q.transcript,
        });
      }
    }
  }
  if (Array.isArray(part.noteFields)) {
    for (const n of part.noteFields) {
      questions.push({
        id: n.id || slugId(`lb-${lang}-${level}-horen-t${teil}`, n.label),
        module: 'horen',
        teil,
        type: 'gap_fill',
        question: n.label || '',
        correct: n.answer || '',
        correctAnswer: n.answer || '',
        explanation: '',
        grammarTags: [],
        topicTags: ['umwelt'],
        difficulty: 4,
        passageId: passage?.id,
        lang,
        level,
      });
    }
  }

  return {
    id: newCandidateId(lang, level, 'horen', teil),
    status: 'pending',
    lang,
    level,
    module: 'horen',
    teil,
    slotType: bpPart?.slotType || null,
    label: bpPart?.label || `Hören Teil ${teil}`,
    passage,
    questions,
    plays: part.plays,
    validation: null,
    review: { notes: '', editedAt: null, reviewedAt: null },
    provenance: {
      generatedBy: source,
      batchId,
      createdAt: new Date().toISOString(),
      wordCount: passage ? wordCount(passage.text) : 0,
    },
  };
}

export function schreibenPartToCandidate(part, { lang, level, blueprint, batchId, source }) {
  const teil = part.teil ?? 1;
  const bpPart = blueprintPart(blueprint, 'schreiben', teil);
  const task = part.task || part.prompt || part.instruction || '';
  const questions = (part.questions || []).length
    ? part.questions.map((q) => mapExamQuestion(q, lang, level, 'schreiben', teil, null))
    : [
        {
          id: slugId(`lb-${lang}-${level}-schreiben-t${teil}`, task),
          module: 'schreiben',
          teil,
          type: 'short_answer',
          question: task,
          correct: 'rubric',
          correctAnswer: 'rubric',
          explanation: part.explanation || '',
          grammarTags: part.grammarTags || [],
          topicTags: part.topicTags || [],
          vocabularyTags: part.vocabularyTags || [],
          difficulty: part.difficulty ?? 5,
          lang,
          level,
          examType: 'goethe',
        },
      ];

  return {
    id: newCandidateId(lang, level, 'schreiben', teil),
    status: 'pending',
    lang,
    level,
    module: 'schreiben',
    teil,
    slotType: bpPart?.slotType || null,
    label: bpPart?.label || `Schreiben Teil ${teil}`,
    passage: null,
    questions,
    validation: null,
    review: { notes: '', editedAt: null, reviewedAt: null },
    provenance: {
      generatedBy: source,
      batchId,
      createdAt: new Date().toISOString(),
      wordCount: wordCount(task),
    },
  };
}

export function sprechenPartToCandidate(part, { lang, level, blueprint, batchId, source }) {
  const teil = part.teil ?? 1;
  const bpPart = blueprintPart(blueprint, 'sprechen', teil);
  const situation = part.situation || part.prompt || '';
  const questions = (part.questions || []).length
    ? part.questions.map((q) => mapExamQuestion(q, lang, level, 'sprechen', teil, null))
    : [
        {
          id: slugId(`lb-${lang}-${level}-sprechen-t${teil}`, situation),
          module: 'sprechen',
          teil,
          type: 'short_answer',
          question: situation,
          correct: 'rubric',
          correctAnswer: 'rubric',
          explanation: part.explanation || '',
          grammarTags: part.grammarTags || [],
          topicTags: part.topicTags || [],
          vocabularyTags: part.vocabularyTags || [],
          difficulty: part.difficulty ?? 5,
          lang,
          level,
          examType: 'goethe',
          points: part.points,
        },
      ];

  return {
    id: newCandidateId(lang, level, 'sprechen', teil),
    status: 'pending',
    lang,
    level,
    module: 'sprechen',
    teil,
    slotType: bpPart?.slotType || null,
    label: bpPart?.label || `Sprechen Teil ${teil}`,
    passage: null,
    questions,
    validation: null,
    review: { notes: '', editedAt: null, reviewedAt: null },
    provenance: {
      generatedBy: source,
      batchId,
      createdAt: new Date().toISOString(),
      wordCount: wordCount(situation),
    },
  };
}

export function examToCandidates(exam, { lang, level, blueprint, batchId, source }) {
  const out = [];
  for (const part of exam.lesenParts || []) {
    out.push(lesenPartToCandidate(part, { lang, level, blueprint, batchId, source }));
  }
  for (const part of exam.horenParts || []) {
    out.push(horenPartToCandidate(part, { lang, level, blueprint, batchId, source }));
  }
  for (const part of exam.schreibenParts || []) {
    out.push(schreibenPartToCandidate(part, { lang, level, blueprint, batchId, source }));
  }
  for (const part of exam.sprechenParts || []) {
    out.push(sprechenPartToCandidate(part, { lang, level, blueprint, batchId, source }));
  }
  return out;
}

/**
 * Convert a merge batch ({ passages, questions }) into staging candidates (one per module+teil).
 */
export function batchToCandidates(batch, { lang, level, blueprint, batchId, source }) {
  const passageById = Object.fromEntries((batch.passages || []).map((p) => [p.id, p]));
  const groups = new Map();

  for (const q of batch.questions || []) {
    if (!q.module || q.teil == null) continue;
    const key = `${q.module}-t${q.teil}`;
    if (!groups.has(key)) {
      groups.set(key, { module: q.module, teil: Number(q.teil), questions: [], passageIds: new Set() });
    }
    const g = groups.get(key);
    g.questions.push({ ...q, teil: Number(q.teil), lang: q.lang || lang, level: q.level || level });
    if (q.passageId) g.passageIds.add(q.passageId);
  }

  const out = [];
  for (const g of groups.values()) {
    const bpPart = blueprintPart(blueprint, g.module, g.teil);
    const linkedPassages = [...g.passageIds]
      .map((id) => passageById[id])
      .filter(Boolean)
      .map((p) => ({
        id: p.id,
        module: p.module || g.module,
        title: p.title || '',
        text: p.text,
      }));

    const candidate = {
      id: newCandidateId(lang, level, g.module, g.teil, batchId?.slice(-8) || ''),
      status: 'pending',
      lang,
      level,
      module: g.module,
      teil: g.teil,
      slotType: bpPart?.slotType || null,
      label: bpPart?.label || `${g.module} Teil ${g.teil}`,
      passage: linkedPassages[0] || null,
      passages: linkedPassages.length > 1 ? linkedPassages : undefined,
      questions: g.questions,
      validation: null,
      review: { notes: '', editedAt: null, reviewedAt: null },
      provenance: {
        generatedBy: source,
        batchId,
        createdAt: new Date().toISOString(),
        wordCount: linkedPassages.reduce((n, p) => n + wordCount(p.text), 0),
      },
    };
    out.push(candidate);
  }
  return out;
}

export function miniExamFromCandidate(candidate) {
  const part = {
    teil: candidate.teil,
    instruction: candidate.label || '',
    text: candidate.passage?.text,
    textTitle: candidate.passage?.title,
    questions: candidate.questions,
    ads: candidate.ads,
    opinions: candidate.opinions,
  };
  if (candidate.module === 'lesen' || candidate.module === 'reading') {
    const key = candidate.module === 'reading' ? 'readingParts' : 'lesenParts';
    return { lang: candidate.lang, level: candidate.level, [key]: [part] };
  }
  if (candidate.module === 'horen' || candidate.module === 'listening') {
    const key = candidate.module === 'listening' ? 'listeningParts' : 'horenParts';
    const passages =
      candidate.passages?.length > 0
        ? candidate.passages
        : candidate.passage
          ? [candidate.passage]
          : [];
    const questions = candidate.questions || [];
    let segments;
    if (passages.length) {
      segments = passages.map((p) => ({
        label: p.title || 'Audio',
        transcript: p.text,
        questions: questions.filter((q) => q.passageId === p.id),
      }));
      const assigned = new Set(segments.flatMap((s) => s.questions));
      const orphans = questions.filter((q) => !assigned.has(q));
      if (orphans.length && segments.length) {
        segments[0].questions.push(...orphans);
      }
    } else {
      segments = [
        {
          label: 'Audio',
          transcript: candidate.passage?.text,
          questions,
        },
      ];
    }
    return {
      lang: candidate.lang,
      level: candidate.level,
      [key]: [
        {
          teil: candidate.teil,
          transcript: passages.map((p) => p.text).filter(Boolean).join('\n') || candidate.passage?.text,
          segments,
        },
      ],
    };
  }
  if (candidate.module === 'schreiben') {
    return {
      lang: candidate.lang,
      level: candidate.level,
      schreibenParts: [{ teil: candidate.teil, task: candidate.questions?.[0]?.question || '' }],
    };
  }
  if (candidate.module === 'sprechen') {
    return {
      lang: candidate.lang,
      level: candidate.level,
      sprechenParts: [{ teil: candidate.teil, situation: candidate.questions?.[0]?.question || '' }],
    };
  }
  return { lang: candidate.lang, level: candidate.level };
}
