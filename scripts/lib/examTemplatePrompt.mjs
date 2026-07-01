import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';
import {
  injectTargetWords,
  pickTargetWords,
  stripHumanHeader,
} from './lesenTemplatePrompt.mjs';

export { pickTargetWords };

const MODULE_DIRS = {
  horen: 'plantillas-horen-b1',
  schreiben: 'plantillas-schreiben-b1',
  sprechen: 'plantillas-sprechen-b1',
};

/** B1 Goethe length + batch rules injected into every prompt. */
const EXAM_LENGTH_RULES = {
  horen: {
    1: {
      target: '50–85 por segmento',
      min: 40,
      max: 90,
      scope: 'cada passages[i].text (5 segmentos s1–s5)',
      note: '10 preguntas: por segmento 1× richtig_falsch + 1× multiple (a/b/c). Lenguaje hablado.',
    },
    2: {
      target: '240–300',
      min: 220,
      max: 320,
      scope: 'passages[0].text (monólogo/Vortrag)',
      note: '5 preguntas multiple_choice, escucha 1×.',
    },
    3: {
      target: '270–330',
      min: 250,
      max: 350,
      scope: 'passages[0].text (diálogo Person A:/Person B:)',
      note: '7 preguntas richtig_falsch, escucha 1×.',
    },
    4: {
      target: '320–400',
      min: 300,
      max: 420,
      scope: 'passages[0].text (debate Moderator + 2 Gäste)',
      note: '8 preguntas matching speaker; options idénticas M/A/B en las 8.',
    },
  },
  schreiben: {
    all: {
      target: 'T1 ~80, T2 ~80, T3 ~40 palabras (consigna)',
      min: 0,
      max: 0,
      scope: 'question de cada teil (consigna, no respuesta modelo)',
      note: '1 batch = 3 preguntas (teil 1+2+3), passages: []. correct: "rubric".',
    },
  },
  sprechen: {
    all: {
      target: 'consignas claras con tiempos oficiales',
      min: 0,
      max: 0,
      scope: 'question de cada teil',
      note: '1 batch = 3 tareas (planung + präsentation + feedback). passages: []. correct: "rubric".',
    },
  },
};

const CEFR_VOCAB_HINT =
  'Prefiere léxico B1 frecuente (≤B1 CEFR). Evita meta-texto («Dieser Text hat 280 Wörter…») y términos C1/académicos (kontextualisieren, Polyphonie, Paradigma, Manifestation…). ' +
  'REGLA ANTI-ANGLICISMOS: NUNCA escribas verbos/sustantivos ingleses sin traducir — ' +
  'gardening→Gartenarbeit/Gärtnern, jogging→Joggen, hiking→Wandern, cycling→Radfahren, ' +
  'shopping→Einkaufen, cooking→Kochen. ' +
  'Préstamos aceptados en alemán moderno (Deadline, Meeting, Team, Job, Computer, Internet, ' +
  'E-Mail, Video, Blog, Podcast, App, Design, Event, Check-in, Feedback) son válidos ' +
  'SOLO si van capitalizados como sustantivos: «die Deadline», «das Meeting», «das Team». ' +
  'REGLA ORTOGRÁFICA OBLIGATORIA: en alemán TODOS los sustantivos van en MAYÚSCULA — ' +
  'también en enumeraciones y después de «kein/keine» ' +
  '(«Blumen und Pflanzen», «keine Hypothese», no «blumen», no «keine hypothese»). ' +
  'Repasa cada sustantivo antes de enviar.';

export function examTemplatePath(module, teil) {
  const mod = String(module || '').toLowerCase();
  const dirName = MODULE_DIRS[mod];
  if (!dirName) throw new Error(`Módulo inválido: ${module} (horen|schreiben|sprechen)`);

  let fileName;
  if (mod === 'horen') {
    const t = Number(teil);
    if (!Number.isFinite(t) || t < 1 || t > 4) throw new Error(`Hören teil inválido: ${teil}`);
    fileName = `horen-teil${t}.md`;
  } else {
    fileName = `${mod}-b1.md`;
  }

  const file = path.join(ROOT, dirName, fileName);
  if (!fs.existsSync(file)) {
    throw new Error(`Plantilla no encontrada: ${path.relative(ROOT, file)}`);
  }
  return file;
}

export function loadExamTemplate(module, teil) {
  return fs.readFileSync(examTemplatePath(module, teil), 'utf8');
}

function lengthBlock(module, teil) {
  const modRules = EXAM_LENGTH_RULES[module];
  const key = module === 'horen' ? Number(teil) : 'all';
  const r = modRules?.[key];
  if (!r) return '';

  if (module === 'schreiben' || module === 'sprechen') {
    return (
      `\n\n## LONGITUD / FORMATO OFICIAL (OBLIGATORIO)\n` +
      `- ${r.note}\n` +
      `- Ámbito: **${r.scope}**\n` +
      `- Objetivo: **${r.target}**\n` +
      `- ${CEFR_VOCAB_HINT}\n` +
      `- Integra PALABRAS OBJETIVO en las consignas y vocabulario sugerido, no en respuestas modelo.`
    );
  }

  return (
    `\n\n## LONGITUD CEFR (OBLIGATORIO — ingest RECHAZA si fallas)\n` +
    `- Ámbito: **${r.scope}** (${r.note})\n` +
    `- Objetivo: **${r.target} palabras**.\n` +
    `- Mínimo absoluto: **${r.min}** · máximo: **${r.max}**.\n` +
    `- **CUENTA las palabras antes de responder.** Transcript = lenguaje **hablado**, no ensayo escrito.\n` +
    `- ${CEFR_VOCAB_HINT}\n` +
    `- Integra PALABRAS OBJETIVO en los transcripts (Hören), no en las preguntas literalmente.`
  );
}

function checklistBlock(module, teil) {
  const t = Number(teil);
  const common =
    `\n\nCHECKLIST FINAL (Goethe B1 — debe pasar validate-batch.mjs):\n` +
    `- Responde SOLO JSON: { "passages": [...], "questions": [...] } — sin markdown, sin \`\`\`.\n` +
    `- correct === correctAnswer en todas las preguntas.\n` +
    `- module correcto en cada question; lang:"de", level:"B1".\n` +
    `- IDs únicos con el prefijo indicado arriba (no reutilizar el ejemplo).\n` +
    `- explanation en alemán en cada pregunta (nunca vacía).\n` +
    `- PALABRAS OBJETIVO: 8–12 lemas B1 integrados en el contenido.\n` +
    `- MAYÚSCULAS: TODO sustantivo alemán en mayúscula — también tras kein/keine/mit/für/von/ohne, en enumeraciones y listas. ¡Compruébalo antes de enviar!\n` +
    `- ANTI-ANGLICISMOS: CERO palabras inglesas sin traducir (gardening, jogging, hiking, cycling…). Préstamos aceptados (Deadline, Meeting, Team, Computer, E-Mail, App, Blog, Podcast, Event) SOLO capitalizados.\n`;

  if (module === 'horen' && t === 1) {
    return (
      common +
      `- 5 passages (s1–s5) + 10 questions (sN-q1 RF, sN-q2 MCQ).\n` +
      `- segmentLabel en cada pregunta (Aufnahme 1 … 5).\n` +
      `- MCQ: options a)/b)/c); correct solo letra; varía a/b/c.\n`
    );
  }
  if (module === 'horen' && t === 2) {
    return common + `- 1 passage + 5 MCQ; distractores plausibles.\n`;
  }
  if (module === 'horen' && t === 3) {
    return (
      common +
      `- Cada passage: "module":"horen". Cada question: "module":"horen","teil":3,"lang":"de","level":"B1","correctAnswer" (= correct).\n` +
      `- Diálogo con Person A:/Person B: alternando.\n` +
      `- 7× richtig_falsch; mezcla Richtig/Falsch; al menos 2 inferencia/paráfrasis.\n`
    );
  }
  if (module === 'horen' && t === 4) {
    return (
      common +
      `- 1 debate; 8× matching; options **idénticas** en las 8: ["M) Moderator","A) …","B) …"].\n` +
      `- correct ∈ {M,A,B}; reparte M/A/B (no todo en A).\n` +
      `- PROHIBIDO gap_fill o matching sin options.\n`
    );
  }
  if (module === 'schreiben') {
    return (
      common +
      `- passages: [] · exactamente 3 questions (teil 1,2,3).\n` +
      `- type:"short_answer", correct:"rubric", options:[].\n` +
      `- T1 E-Mail Freund/in ~80W · T2 Forumpost ~80W con cita · T3 nota semiformal ~40W.\n`
    );
  }
  if (module === 'sprechen') {
    return (
      common +
      `- passages: [] · exactamente 3 questions (teil 1,2,3).\n` +
      `- T1 planungsaufgabe: 5 bullet points · T2 präsentation: 5 slides en question · T3 feedback + 2–3 Fragen Beispiel.\n` +
      `- correct:"rubric" · T3 referencia el tema de T2.\n`
    );
  }
  return common;
}

export function buildExamPrompt(module, teil, words, { idSuffix } = {}) {
  const raw = loadExamTemplate(module, teil);
  let prompt = injectTargetWords(stripHumanHeader(raw), words);

  if (idSuffix) {
    const mod = module === 'horen' ? 'h' : module === 'schreiben' ? 's' : 'sp';
    if (module === 'horen') {
      prompt +=
        `\n\nIMPORTANTE — IDs de esta generación:\n` +
        `- Passages T${teil}: gen-p-h${teil}-${idSuffix}-sN (N=1…5 solo T1)\n` +
        `- Preguntas: gen-q-h${teil}-${idSuffix}-…\n`;
    } else {
      prompt +=
        `\n\nIMPORTANTE — IDs de esta generación:\n` +
        `- Preguntas: gen-q-${mod}-t{1,2,3}-${idSuffix}-q1\n`;
    }
    prompt += `No reutilices IDs del ejemplo ni del banco existente.`;
  }

  prompt += lengthBlock(module, teil);
  prompt += checklistBlock(module, teil);
  return prompt;
}

export function buildExamPromptHeader(module, teil) {
  const label =
    module === 'horen'
      ? `Hören B1 · Teil ${teil}`
      : module === 'schreiben'
        ? 'Schreiben B1 · Teile 1–3'
        : 'Sprechen B1 · Teile 1–3';
  const regen =
    module === 'horen'
      ? `npm run horen:prompt:t${teil}`
      : `${module}:prompt`;
  return (
    `# Prompt generado — ${label}\n` +
    `Copia TODO (desde la línea ---) y pégalo en Gemini/ChatGPT. Devuelve SOLO JSON.\n` +
    `Regenerar otro sorteo: npm run ${regen}\n\n---\n\n`
  );
}

export function buildExamPromptFull(module, teil, words, options = {}) {
  return buildExamPromptHeader(module, teil) + buildExamPrompt(module, teil, words, options);
}

export function teileForModule(module, allTeile = false) {
  const mod = String(module).toLowerCase();
  if (mod === 'horen') return allTeile ? [1, 2, 3, 4] : null;
  if (mod === 'schreiben' || mod === 'sprechen') return ['all'];
  throw new Error(`Módulo inválido: ${module}`);
}
