/**
 * Shared helpers for certification acceptance tests (dry-run, no LLM).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeExamParts, validateChunkObj } from './examJsonUtils.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ACCEPTANCE_MATRIX = [
  { brand: 'Goethe', provider: 'goethe', language: 'german', lang: 'de', level: 'A1', firstKey: 'lesenParts' },
  { brand: 'Goethe', provider: 'goethe', language: 'german', lang: 'de', level: 'B1', firstKey: 'lesenParts' },
  { brand: 'Goethe', provider: 'goethe', language: 'german', lang: 'de', level: 'C1', firstKey: 'lesenParts' },
  { brand: 'Cambridge', provider: 'cambridge', language: 'english', lang: 'en', level: 'A2', firstKey: 'readingParts' },
  { brand: 'Cambridge', provider: 'cambridge', language: 'english', lang: 'en', level: 'B2', firstKey: 'readingParts' },
  { brand: 'Cambridge', provider: 'cambridge', language: 'english', lang: 'en', level: 'C1', firstKey: 'readingParts' },
  { brand: 'DELE', provider: 'dele', language: 'spanish', lang: 'es', level: 'A1', firstKey: 'readingParts' },
  { brand: 'DELE', provider: 'dele', language: 'spanish', lang: 'es', level: 'B1', firstKey: 'readingParts' },
  { brand: 'DELE', provider: 'dele', language: 'spanish', lang: 'es', level: 'C1', firstKey: 'readingParts' },
];

export function loadEngine() {
  require(path.join(ROOT, 'js', 'engine', 'domain', 'lexicoilDomain.js'));
  require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeLoader.js'));
  require(path.join(ROOT, 'js', 'engine', 'providers', 'baseProviderAdapter.js'));
  require(path.join(ROOT, 'js', 'engine', 'providers', 'goetheAdapter.js'));
  require(path.join(ROOT, 'js', 'engine', 'providers', 'cambridgeAdapter.js'));
  require(path.join(ROOT, 'js', 'engine', 'providers', 'deleAdapter.js'));
  require(path.join(ROOT, 'js', 'engine', 'providers', 'providerRegistry.js'));
  require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeEngine.js'));
  require(path.join(ROOT, 'js', 'engine', 'prompts', 'promptShell.js'));
  require(path.join(ROOT, 'js', 'engine', 'prompts', 'moduleInstructions.js'));
  require(path.join(ROOT, 'js', 'engine', 'prompts', 'PromptBuilder.js'));
  require(path.join(ROOT, 'js', 'engine', 'validation', 'ExamValidator.js'));
  require(path.join(ROOT, 'js', 'engine', 'generators', 'chunkRunner.js'));
  require(path.join(ROOT, 'js', 'engine', 'generators', 'ExamGenerator.js'));
  const { normalizeSpanishExam } = require(path.join(ROOT, 'js', 'i18n', 'examSpanishNormalize.js'));
  const { examUiStrings } = require(path.join(ROOT, 'js', 'i18n', 'examUiLocale.js'));

  return {
    KnowledgeEngine: require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeEngine.js')),
    ProviderRegistry: require(path.join(ROOT, 'js', 'engine', 'providers', 'providerRegistry.js')),
    KnowledgeLoader: require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeLoader.js')),
    PromptBuilder: require(path.join(ROOT, 'js', 'engine', 'prompts', 'PromptBuilder.js')),
    ExamGenerator: require(path.join(ROOT, 'js', 'engine', 'generators', 'ExamGenerator.js')),
    ExamValidator: require(path.join(ROOT, 'js', 'engine', 'validation', 'ExamValidator.js')),
    normalizeSpanishExam,
    examUiStrings,
  };
}

export function chunkCount(spec) {
  return spec.constraints?.chunkPlan?.reduce((s, m) => s + (m.parts || 1), 0) || 0;
}

export function normalizeCambridgeExam(d) {
  if (!d || (!d.readingParts && !d.listeningParts)) return d;
  const { normalizeSpanishExam } = require(path.join(ROOT, 'js', 'i18n', 'examSpanishNormalize.js'));
  const out = normalizeSpanishExam({
    ...d,
    lang: 'en',
    deleFormat: false,
    official: d.official || {
      board: 'Cambridge Assessment English',
      certificate: `Cambridge ${d.level || 'B1'}`,
      note: 'Practice exam (acceptance fixture).',
    },
    modules: d.modules || {
      lesen: { title: 'Reading', time: '45 min' },
      horen: { title: 'Listening', time: '30 min' },
      schreiben: { title: 'Writing', time: '45 min' },
      sprechen: { title: 'Speaking', time: '12 min' },
    },
  });
  out.lang = 'en';
  out.deleFormat = false;
  delete out.deleFormat;
  out.cambridgeFormat = true;
  return out;
}

export function normalizeForRender(row, exam, normalizeSpanishExam) {
  const copy = JSON.parse(JSON.stringify(exam));
  copy.level = copy.level || row.level;
  if (row.provider === 'dele') {
    return normalizeSpanishExam(copy);
  }
  if (row.provider === 'cambridge') {
    return normalizeCambridgeExam(copy);
  }
  copy.lang = 'de';
  copy.goetheFormat = true;
  if (!copy.modules) {
    copy.modules = {
      lesen: { title: 'Lesen', time: '65 Minuten' },
      horen: { title: 'Hörverstehen', time: '40 Minuten' },
      schreiben: { title: 'Schreiben', time: '60 Minuten' },
      sprechen: { title: 'Sprechen', time: '15 Minuten' },
    };
  }
  return copy;
}

export function isExamRenderable(exam) {
  if (!exam?.goetheFormat) return false;
  const lp = (exam.lesenParts || []).some(
    (p) => p.text || p.items?.length || p.questions?.length || p.ads?.length,
  );
  const hp = (exam.horenParts || []).some(
    (p) => p.segments?.length || p.questions?.length || p.transcript || p.noteFields?.length,
  );
  return lp && hp;
}

export function simulateRenderCheck(exam, ui) {
  if (!isExamRenderable(exam)) return { ok: false, reason: 'not renderable' };
  if (!exam.modules?.lesen?.title || !exam.modules?.horen?.title) {
    return { ok: false, reason: 'missing module titles' };
  }
  if (exam.modules.lesen.title !== ui.reading) {
    return { ok: false, reason: `reading title mismatch: ${exam.modules.lesen.title}` };
  }
  if (exam.modules.horen.title !== ui.listening) {
    return { ok: false, reason: `listening title mismatch: ${exam.modules.horen.title}` };
  }
  const markers = [ui.reading, ui.listening, ui.teil];
  const pseudo = markers.join(' ');
  if (!pseudo) return { ok: false, reason: 'empty ui markers' };
  return { ok: true, markers: pseudo };
}

function mockChunkObject(expectKey, level, lang) {
  const mcq = {
    id: 'q1',
    type: 'multiple',
    question: 'Sample question?',
    options: ['a) One', 'b) Two', 'c) Three'],
    correct: 'b',
  };
  const item = {
    id: 'l1',
    question: 'Sample?',
    options: ['a) One', 'b) Two', 'c) Three'],
    correct: 'b',
  };
  if (expectKey === 'lesenParts') {
    return {
      lang,
      level,
      lesenParts: [{ teil: 1, instruction: 'Lesen', text: 'Beispieltext.', items: [item] }],
    };
  }
  if (expectKey === 'horenParts') {
    return {
      lang,
      level,
      horenParts: [
        {
          teil: 1,
          instruction: 'Hören',
          transcript: 'Hallo und willkommen.',
          segments: [
            {
              id: 'h1',
              label: 'Aufnahme 1',
              transcript: 'Hallo.',
              question: 'Was?',
              options: ['a) Ja', 'b) Nein'],
              correct: 'a',
            },
          ],
        },
      ],
    };
  }
  if (expectKey === 'schreibenParts') {
    return { lang, level, schreibenParts: [{ aufgabe: 1, task: 'Schreiben Sie einen Text.', fieldId: 'write1' }] };
  }
  if (expectKey === 'sprechenParts') {
    return {
      lang,
      level,
      sprechenParts: [{ teil: 1, title: 'Sprechen', situation: 'Stellen Sie sich vor.', points: ['Name'], fieldId: 'speak1' }],
    };
  }
  if (expectKey === 'readingParts') {
    return {
      lang,
      level,
      readingParts: [{ part: 1, instruction: 'Read', text: 'Sample text.', questions: [mcq] }],
    };
  }
  if (expectKey === 'listeningParts') {
    return {
      lang,
      level,
      listeningParts: [
        {
          part: 1,
          instruction: 'Listen',
          segments: [
            {
              id: 's1',
              label: 'Recording 1',
              transcript: 'Hello.',
              question: 'What?',
              options: ['A) Yes', 'B) No'],
              correct: 'A',
            },
          ],
        },
      ],
    };
  }
  if (expectKey === 'writingParts') {
    return { lang, level, writingParts: [{ part: 1, instruction: 'Write an email.' }] };
  }
  if (expectKey === 'speakingParts') {
    return {
      lang,
      level,
      speakingParts: [{ part: 1, title: 'Speaking', situation: 'Talk about yourself.', points: ['Intro'] }],
    };
  }
  return { [expectKey]: [{ teil: 1 }] };
}

export function moduleChunkKeys(row) {
  if (row.provider === 'goethe') {
    return ['lesenParts', 'horenParts', 'schreibenParts', 'sprechenParts'];
  }
  return ['readingParts', 'listeningParts', 'writingParts', 'speakingParts'];
}

export function buildLegacyChunks(row) {
  return moduleChunkKeys(row).map((expectKey, i) => ({
    label: String(i + 1),
    expectKey,
    prompt: 'acceptance mock',
    maxTokens: 2000,
  }));
}

export async function runAcceptanceCase(engine, row) {
  const topic = await engine.KnowledgeEngine.pickRandomTopic(
    row.lang === 'de' ? 'de' : row.lang === 'es' ? 'es' : 'en',
    row.level,
  );

  const spec = await engine.KnowledgeEngine.buildSpec({
    language: row.language,
    level: row.level,
    provider: row.provider,
    contentType: 'Exam',
    topic,
  });

  if (spec.language !== row.language) {
    throw new Error(`KnowledgeEngine language: expected ${row.language}, got ${spec.language}`);
  }
  if (spec.provider !== row.provider) {
    throw new Error(`KnowledgeEngine provider: expected ${row.provider}, got ${spec.provider}`);
  }
  if (spec.level !== row.level) throw new Error(`KnowledgeEngine level mismatch`);
  if (!spec.examStructure?.board) throw new Error('KnowledgeEngine missing examStructure.board');
  if (!spec.constraints?.chunkPlan?.length) throw new Error('KnowledgeEngine missing chunkPlan');
  if (!spec.canDoStatements?.length) throw new Error('KnowledgeEngine missing canDoStatements');
  if (!spec.constraints.chunkPlan.some((c) => c.expectKey === row.firstKey)) {
    throw new Error(`KnowledgeEngine first expectKey expected ${row.firstKey}`);
  }

  const providerData = await engine.KnowledgeLoader.loadProvider(row.provider);
  const BaseProviderAdapter = require(path.join(ROOT, 'js', 'engine', 'providers', 'baseProviderAdapter.js'));
  BaseProviderAdapter.assertNoPrompts(providerData, row.provider);

  const adapted = engine.ProviderRegistry.apply(row.provider, providerData, row.level, row.language);
  if (!adapted.examStructure?.certificate) throw new Error('Provider adapter missing certificate');
  if (!adapted.chunkPlan?.length) throw new Error('Provider adapter missing chunkPlan');
  const adapterChunks = adapted.chunkPlan.reduce((s, m) => s + (m.parts || 1), 0);
  const specChunks = chunkCount(spec);
  if (adapterChunks !== specChunks) {
    throw new Error(`Provider chunk count ${adapterChunks} != spec ${specChunks}`);
  }

  const built = engine.PromptBuilder.buildPrompt(spec);
  if (built.mode !== 'chunks') throw new Error('PromptBuilder must use chunk mode');
  if (built.chunks.length !== specChunks) {
    throw new Error(`PromptBuilder chunks ${built.chunks.length} != expected ${specChunks}`);
  }
  if (built.chunks[0].expectKey !== row.firstKey) {
    throw new Error(`PromptBuilder first key ${built.chunks[0].expectKey} != ${row.firstKey}`);
  }
  if (!built.chunks[0].prompt.includes(topic)) {
    throw new Error('PromptBuilder prompt missing topic');
  }

  const legacyChunks = buildLegacyChunks(row);
  let chunkIdx = 0;
  const hooks = {
    callAI: async (_prompt, _max, _opts) => {
      const chunk = legacyChunks[chunkIdx++];
      const obj = mockChunkObject(chunk.expectKey, row.level, row.lang);
      return JSON.stringify(obj);
    },
    onStep: () => {},
    parseExamJson: (raw) => JSON.parse(raw),
    validateChunkObj,
    mergeExamParts,
    commitExamQuota: async () => {},
    normalizeExam: (x) => normalizeForRender(row, x, engine.normalizeSpanishExam),
  };

  const merged = await engine.ExamGenerator.generate(spec, hooks, { legacyChunks });
  const validation = new engine.ExamValidator().validate(merged);
  if (!validation.valid) {
    throw new Error(`Generator/ExamValidator: ${validation.errors.join(', ')}`);
  }

  const ui = engine.examUiStrings(row.lang);
  const render = simulateRenderCheck(merged, ui);
  if (!render.ok) throw new Error(`Renderer: ${render.reason}`);

  return { spec, merged, topic };
}
