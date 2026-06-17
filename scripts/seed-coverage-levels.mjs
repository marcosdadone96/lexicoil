#!/usr/bin/env node
/**
 * Phase 13a — seed question banks for all advertised lang×level pairs (A1–C2).
 * Run: node scripts/seed-coverage-levels.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'library');

export const ALL_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const ALL_LANGS = ['de', 'en', 'es'];

const GRAMMAR = {
  de: {
    A1: ['g-de-a1-praesens', 'g-de-a1-artikel'],
    A2: ['g-de-a2-perfekt', 'g-de-a2-dat-akk'],
    B1: ['g-de-b1-nebensatz', 'g-de-b1-passiv'],
    B2: ['g-de-b2-konj1', 'g-de-b2-nominal'],
    C1: ['g-de-c1-konj2', 'g-de-c1-stil'],
    C2: ['g-de-c2-register', 'g-de-c2-idiom'],
  },
  en: {
    A1: ['g-en-a1-present', 'g-en-a1-articles'],
    A2: ['g-en-a2-past', 'g-en-a2-prepositions'],
    B1: ['g-en-b1-clauses', 'g-en-b1-modals'],
    B2: ['g-en-b2-clauses', 'g-en-b2-reported'],
    C1: ['g-en-c1-inversion', 'g-en-c1-ellipsis'],
    C2: ['g-en-c2-register', 'g-en-c2-nuance'],
  },
  es: {
    A1: ['g-es-a1-present', 'g-es-a1-gender'],
    A2: ['g-es-a2-pret', 'g-es-a2-ser-estar'],
    B1: ['g-es-b1-subj', 'g-es-b1-por-para'],
    B2: ['g-es-b2-passive', 'g-es-b2-subj-past'],
    C1: ['g-es-c1-register', 'g-es-c1-subj-plus'],
    C2: ['g-es-c2-discourse', 'g-es-c2-register-plus'],
  },
};

const TOPICS = {
  de: ['alltag', 'reisen', 'arbeit', 'familie', 'gesundheit'],
  en: ['daily_life', 'travel', 'work', 'health', 'education'],
  es: ['vida', 'viajes', 'trabajo', 'salud', 'cultura'],
};

function mcq(id, module, question, options, correct, tags, extra = {}) {
  return {
    id,
    module,
    type: 'multiple',
    question,
    options,
    correct,
    correctAnswer: correct,
    explanation: extra.explanation || 'See passage or transcript.',
    grammarTags: tags.grammar || [],
    topicTags: tags.topic || [],
    difficulty: tags.difficulty || 2,
    ...extra,
  };
}

function tf(id, module, question, correct, tags, extra = {}) {
  const isDe = extra.lang === 'de';
  const val = correct ? (isDe ? 'Richtig' : 'True') : isDe ? 'Falsch' : 'False';
  return {
    id,
    module,
    type: isDe ? 'richtig_falsch' : 'true_false',
    question,
    correct: val,
    correctAnswer: val,
    explanation: extra.explanation || 'See passage or transcript.',
    grammarTags: tags.grammar || [],
    topicTags: tags.topic || [],
    difficulty: tags.difficulty || 2,
    ...extra,
  };
}

function gap(id, module, question, correct, tags, extra = {}) {
  return {
    id,
    module,
    type: 'gap_fill',
    question,
    correct,
    correctAnswer: correct,
    explanation: extra.explanation || 'Grammar gap.',
    grammarTags: tags.grammar || [],
    topicTags: tags.topic || [],
    difficulty: tags.difficulty || 3,
    ...extra,
  };
}

function match(id, module, question, options, correct, tags, extra = {}) {
  return {
    id,
    module,
    type: 'matching',
    question,
    options,
    correct,
    correctAnswer: correct,
    explanation: extra.explanation || 'Match the speaker.',
    grammarTags: tags.grammar || [],
    topicTags: tags.topic || [],
    difficulty: tags.difficulty || 3,
    ...extra,
  };
}

function levelDifficulty(level) {
  const map = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  return map[level] || 3;
}

function readingText(lang, level) {
  const short = {
    de: 'Anna wohnt in Berlin. Sie arbeitet in einem Café und lernt Deutsch. Am Wochenende trifft sie Freunde im Park.',
    en: 'Tom lives in London. He studies at university and works part-time in a bookshop. On weekends he visits museums.',
    es: 'Lucía vive en Madrid. Estudia en la universidad y trabaja en una librería. Los fines de semana visita museos.',
  };
  const mid = {
    de: 'Immer mehr Menschen nutzen öffentliche Verkehrsmittel, weil sie umweltfreundlicher sind. Städte investieren in neue Bus- und Bahnlinien. Experten sagen, dass dies die Luftqualität verbessert und den Verkehr entlastet.',
    en: 'Many cities are investing in cycling infrastructure as commuters seek healthier alternatives to driving. Supporters argue that safe bike lanes reduce congestion and emissions. Critics warn that funding must also improve public transport links.',
    es: 'Muchas ciudades invierten en carriles bici porque los ciudadanos buscan alternativas saludables al coche. Los defensores afirman que reduce la congestión. Los críticos piden también mejor transporte público.',
  };
  const long = {
    de: 'Die Digitalisierung verändert den Arbeitsmarkt grundlegend. Während repetitive Tätigkeiten zunehmend automatisiert werden, entstehen neue Berufsfelder in der IT und im Gesundheitswesen. Politiker fordern deshalb lebenslange Weiterbildung, damit Arbeitnehmerinnen und Arbeitnehmer den Wandel mitgestalten können.',
    en: 'Artificial intelligence is reshaping professional life across sectors once considered stable. While automation eliminates routine tasks, it also creates demand for skills in data literacy and ethical oversight. Policymakers argue that education systems must adapt faster than traditional curricula allow.',
    es: 'La inteligencia artificial transforma sectores que antes parecían estables. Aunque automatiza tareas rutinarias, también exige competencias digitales y criterio ético. Los responsables políticos insisten en reformar la formación profesional con mayor rapidez.',
  };
  if (level === 'A1' || level === 'A2') return short[lang];
  if (level === 'B1' || level === 'B2') return mid[lang];
  return long[lang];
}

function listeningText(lang, level) {
  const lines = {
    de: {
      A1: 'Moderator: Willkommen! Gast: Ich heiße Max. Ich komme aus Hamburg.\nModerator: Schön! Gast: Ich lerne Deutsch seit einem Jahr.',
      A2: 'Moderator: Guten Tag! Gast: Ich suche eine Wohnung in der Stadt.\nModerator: Haben Sie schon eine Anzeige gesehen? Gast: Ja, eine kleine Wohnung in der Nähe vom Park.',
      default:
        'Moderatorin: Heute sprechen wir über nachhaltige Mobilität. Expertin: Viele Städte bauen neue Radwege, weil immer mehr Menschen das Fahrrad nutzen. Moderatorin: Ist das sicher? Expertin: Ja, wenn die Wege breit genug sind und gut markiert werden.',
    },
    en: {
      A1: 'Host: Welcome! Guest: My name is Emma. I am from Bristol.\nHost: Nice to meet you! Guest: I study English every day.',
      A2: 'Host: Good morning! Guest: I am looking for a flat in the city.\nHost: Have you seen any adverts? Guest: Yes, a small flat near the park.',
      default:
        'Presenter: Today we discuss remote work. Expert: Flexibility helps many employees, but boundaries between work and leisure can blur. Presenter: What should companies do? Expert: Define clear rules and support wellbeing.',
    },
    es: {
      A1: 'Presentadora: ¡Bienvenidos! Invitado: Me llamo Pablo. Soy de Sevilla.\nPresentadora: ¡Encantada! Invitado: Estudio español desde hace un año.',
      A2: 'Presentadora: ¡Buenos días! Invitado: Busco un piso en la ciudad.\nPresentadora: ¿Has visto algún anuncio? Invitado: Sí, un piso pequeño cerca del parque.',
      default:
        'Presentadora: Hoy hablamos de energías renovables. Ingeniero: Los paneles solares son parte de la solución, pero hay que mejorar el almacenamiento. Presentadora: ¿Ha bajado el coste? Ingeniero: Sí, un 40% en la última década.',
    },
  };
  const bucket = lines[lang] || lines.en;
  return bucket[level] || bucket.A2 || bucket.A1 || bucket.default;
}

export function makeBank(lang, level) {
  const g = GRAMMAR[lang];
  const tags = (i) => ({
    grammar: [g[level][i % g[level].length]],
    topic: [TOPICS[lang][i % TOPICS[lang].length]],
    difficulty: levelDifficulty(level),
  });
  const lesenId = `p-${lang}-${level}-lesen`;
  const horenId = `p-${lang}-${level}-horen`;
  const prefix = `lb-${lang}-${level.toLowerCase()}`;
  const isDe = lang === 'de';
  const questions = [
    tf(`${prefix}-l1`, 'lesen', isDe ? 'Der Text beschreibt eine Person oder Situation.' : lang === 'es' ? 'El texto describe una persona o situación.' : 'The text describes a person or situation.', true, tags(0), { passageId: lesenId, teil: 1, lang: isDe ? 'de' : undefined }),
    tf(`${prefix}-l2`, 'lesen', isDe ? 'Es gibt keine Information über Arbeit oder Studium.' : lang === 'es' ? 'No hay información sobre trabajo o estudios.' : 'There is no information about work or study.', false, tags(1), { passageId: lesenId, teil: 1, lang: isDe ? 'de' : undefined }),
    mcq(`${prefix}-l3`, 'lesen', isDe ? 'Worum geht es im Text hauptsächlich?' : lang === 'es' ? '¿De qué trata principalmente el texto?' : 'What is the text mainly about?', isDe ? ['a) Sport', 'b) Alltag, Arbeit oder Stadt', 'c) Geschichte'] : lang === 'es' ? ['a) Deporte', 'b) Vida diaria, trabajo o ciudad', 'c) Historia'] : ['a) Sport', 'b) Daily life, work or city life', 'c) Ancient history'], 'b', tags(2), { passageId: lesenId, teil: 2 }),
    mcq(`${prefix}-h1`, 'horen', isDe ? 'Worum geht es im Gespräch?' : lang === 'es' ? '¿De qué trata la conversación?' : 'What is the conversation about?', isDe ? ['a) Wetter', 'b) Alltag oder aktuelles Thema', 'c) Mathematik'] : lang === 'es' ? ['a) Tiempo', 'b) Vida diaria o tema actual', 'c) Matemáticas'] : ['a) Weather only', 'b) Daily life or a current topic', 'c) Mathematics'], 'b', tags(0), { passageId: horenId, segmentLabel: isDe ? 'Aufnahme 1' : lang === 'es' ? 'Grabación 1' : 'Recording 1', teil: 1 }),
    tf(`${prefix}-h2`, 'horen', isDe ? 'Mindestens zwei Sprecher sind im Dialog.' : lang === 'es' ? 'Hay al menos dos hablantes en el diálogo.' : 'There are at least two speakers in the dialogue.', true, tags(1), { passageId: horenId, segmentLabel: isDe ? 'Aufnahme 1' : lang === 'es' ? 'Grabación 1' : 'Recording 1', teil: 1, lang: isDe ? 'de' : undefined }),
  ];

  if (lang === 'en' || lang === 'es') {
    questions.push(
      gap(`${prefix}-g1`, 'grammatik', 'Complete: It is important ___ protect the environment.', 'to', tags(0), { teil: 2 }),
      gap(`${prefix}-g2`, 'grammatik', 'Complete: She has lived here ___ 2019.', 'since', tags(1), { teil: 3 }),
      match(`${prefix}-m1`, 'lesen', 'Who mentions cost reduction?', ['A) Presenter', 'B) Expert', 'C) Neither'], 'B', tags(2), { passageId: horenId, teil: 1 }),
    );
  } else {
    questions.push(
      gap(`${prefix}-g1`, 'grammatik', 'Ergänzen: Ich ___ gestern ins Kino gegangen. (Perfekt Hilfsverb)', 'bin', tags(0), { teil: 1 }),
      gap(`${prefix}-g2`, 'grammatik', 'Ergänzen: Das Buch, ___ ich lese, ist spannend. (Relativpronomen)', 'das', tags(1), { teil: 1 }),
    );
  }

  return {
    meta: { language: lang, level, version: 2, generatedAt: new Date().toISOString().slice(0, 10), source: 'seed-coverage-levels' },
    passages: [
      { id: lesenId, module: 'lesen', title: `${level} reading`, text: readingText(lang, level) },
      { id: horenId, module: 'horen', title: `${level} listening`, text: listeningText(lang, level) },
    ],
    questions,
    vocabulary: {},
  };
}

function writeBank(lang, level) {
  const bank = makeBank(lang, level);
  const dir = path.join(LIB, lang, level);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'questions.json');
  fs.writeFileSync(file, JSON.stringify(bank, null, 2) + '\n', 'utf8');
  console.log('Wrote', path.relative(ROOT, file), `(${bank.questions.length} q)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const force = process.argv.includes('--force');
  const repair = process.argv.includes('--repair');
  for (const lang of ALL_LANGS) {
    for (const level of ALL_LEVELS) {
      const file = path.join(LIB, lang, level, 'questions.json');
      let skip = false;
      if (!force && fs.existsSync(file)) {
        if (repair) {
          try {
            const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
            const horenPass = (existing.passages || []).find((p) => p.module === 'horen');
            const badModule = (existing.questions || []).some((q) =>
              ['use_of_english', 'reading'].includes(q.module),
            );
            if (horenPass?.text && !badModule) skip = true;
          } catch (_) {}
        } else {
          const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
          if ((existing.questions || []).length >= 6) skip = true;
        }
      }
      if (skip) {
        console.log('Skip', path.relative(ROOT, file));
        continue;
      }
      writeBank(lang, level);
    }
  }
  console.log('Coverage seed complete.');
}
