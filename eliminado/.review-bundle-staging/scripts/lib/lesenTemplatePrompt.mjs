import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';
import { applyVocabPreferenceToTemplate, reinforceVocabOptionalBlock } from './userVocabPrompt.mjs';
import { injectT5PromptVariants, injectT4PromptVariants } from './lesenSubtypeRotation.mjs';
import { filterPromptTargetWords, isBlacklistedLemma } from './lexicalCheck.mjs';
import { buildExcludedPremisesPromptBlock } from './excludedPremises.mjs';

const PLACEHOLDER =
  /<<< pon aquí 8-12 palabras alemanas separadas por comas, p\. ej\.: bibliothek, ausleihen, frist, gebühr >>>/;
const WORDS_BLOCK = /<<<[^>]+>>>/;

const TEMPLATE_DIR = path.join(ROOT, 'plantillas-lesen-b1');

/** CEFR + blueprint word bounds injected into every generation prompt. */
const TEIL_LENGTH_RULES = {
  1: {
    target: '165-200',
    min: 150,
    max: 220,
    scope: 'passages[0].text',
    note: '1 blog/e-mail en 1ª persona (ich).',
  },
  2: {
    target: '165-200 cada uno',
    min: 150,
    max: 220,
    scope: 'cada passages[i].text (2 textos)',
    note: '2 textos de prensa; los dos deben cumplir el mínimo por separado.',
  },
  3: {
    target: '25-45',
    min: 20,
    max: 60,
    scope: 'cada anuncio en options (A-J)',
    note: '10 anuncios telegram-style; sin pasaje prose.',
  },
  4: {
    target: 'intro 50-70 + 7 opiniones ~25-35',
    min: 150,
    max: 400,
    scope: 'passages[0].text + todos los signText (suma total ≤400, ≥150)',
    note: 'Cada pregunta ja_nein lleva signText con la opinión (sin repetir el nombre al inicio).',
  },
  5: {
    target: '185-230',
    min: 180,
    max: 250,
    scope: 'passages[0].text',
    note: 'Hausordnung / Regeln con bullets o párrafos cortos.',
  },
};

const CEFR_VOCAB_HINT =
  'Prefiere léxico B1 frecuente: Bewohner, Nachbarn, Stadt, Programm, Organisation, Erfahrungen, ' +
  'Familie, Kinder, Schule, Arbeit, Transport, Kurs, Projekt, Freizeit, Bericht, Termin. ' +
  'Evita rarezas (Begabung, künstlerisch, Denkmuster…) salvo en PALABRAS OBJETIVO. ' +
  'Evita términos C1/académicos (kontextualisieren, Polyphonie, Paradigma, Manifestation, Epistemologie…). ' +
  'ANTI-ANGLICISMOS: NUNCA escribas verbos/sustantivos ingleses sin traducir — ' +
  'gardening→Gartenarbeit/Gärtnern, jogging→Joggen, hiking→Wandern, cycling→Radfahren. ' +
  'Préstamos aceptados (Deadline, Meeting, Team, Computer, E-Mail, App, Blog, Event) ' +
  'SOLO si van capitalizados como sustantivos alemanes: «die Deadline», «das Meeting». ' +
  'ORTOGRAFÍA OBLIGATORIA: todos los sustantivos en MAYÚSCULA — también tras kein/keine, ' +
  'mit/für/von/ohne, en listas y enumeraciones ' +
  '(«Blumen und Pflanzen», «keine Hypothese», no «blumen», no «keine hypothese»). ' +
  'Repasa cada sustantivo antes de enviar. ' +
  'LÍMITE INVERSO — NUNCA capitalices a mitad de frase palabras que NO sean sustantivos ni nombres propios: ' +
  'adjetivos (schwierig, persönlich, zugänglich, einfach, möglich), ' +
  'cuantificadores (viele, wenige, einige), ' +
  'adverbios (lange, eher, leider, trotzdem, natürlich) ' +
  'y verbos conjugados (ich glaube, ich stimme, ich denke) van en MINÚSCULA a mitad de frase. ' +
  'Solo SUSTANTIVOS y nombres propios llevan mayúscula. ' +
  'Ejemplos correctos: «viele Menschen» (NO «Viele»), «in der Praxis schwierig» (NO «Schwierig»), ' +
  '«ich glaube» (NO «Glaube»), «ich stimme zu» (NO «Stimme»), «leicht zugänglich» (NO «Zugänglich»).';

function teilLengthBlock(teil) {
  const r = TEIL_LENGTH_RULES[teil];
  if (!r) return '';
  return (
    `\n\n## LONGITUD CEFR (OBLIGATORIO — ingest RECHAZA si fallas)\n` +
    `- Ámbito: **${r.scope}** (${r.note})\n` +
    `- Objetivo: **${r.target} palabras**.\n` +
    `- Mínimo absoluto del gate: **${r.min}** · máximo blueprint: **${r.max}**.\n` +
    `- **CUENTA las palabras antes de responder.** Si estás por debajo, añade 2-4 frases nuevas con contenido (no relleno con adjetivos).\n` +
    `- El ejemplo JSON puede ser más corto por legibilidad; **tu salida NO puede ser más corta que el mínimo**.\n` +
    `- ${CEFR_VOCAB_HINT}\n` +
    `- Cobertura léxica B1 objetivo: **≥75%** (palabras fuera de lista B1 frecuente penalizan).`
  );
}

export function lesenTemplatePath(teil) {
  const t = Number(teil);
  if (!Number.isFinite(t) || t < 1 || t > 5) {
    throw new Error(`Teil inválido: ${teil} (usa 1-5)`);
  }
  const file = path.join(TEMPLATE_DIR, `lesen-teil${t}.md`);
  if (!fs.existsSync(file)) {
    throw new Error(`Plantilla no encontrada: ${path.relative(ROOT, file)}`);
  }
  return file;
}

export function loadLesenTemplate(teil) {
  return fs.readFileSync(lesenTemplatePath(teil), 'utf8');
}

/** Quita la cabecera humana (# Plantilla… / Pega TODO…) y deja el prompt para la IA. */
export function stripHumanHeader(markdown) {
  const dash = String(markdown).indexOf('\n---\n');
  return (dash >= 0 ? markdown.slice(dash + 5) : markdown).trim();
}

export function injectTargetWords(markdown, words) {
  return applyVocabPreferenceToTemplate(markdown, words);
}

export function buildFewShotLesenBlock(teil, examples = []) {
  if (!examples?.length) return '';
  const blocks = examples.map((ex, i) => {
    const slim = {
      passages: (ex.passages || []).map((p) => ({
        title: p.title,
        text: p.text,
        topicTag: p.topicTag,
      })),
      questions: (ex.questions || []).map((q) => ({
        question: q.question,
        correct: q.correct,
        explanation: q.explanation,
      })),
    };
    return `### Ejemplo verificado ${i + 1} (T${teil}, tema ${ex.topicTag || ex._requestedTopic || 'B1'})\n\`\`\`json\n${JSON.stringify(slim, null, 2)}\n\`\`\``;
  });
  return (
    `\n\n## EJEMPLOS VERIFICADOS (imita nivel B1, parafraseo, estilo — NO copies contenido ni IDs)\n` +
    `Genera UNA parte **nueva** con el mismo nivel de calidad que estos ejemplos del pool:\n\n` +
    blocks.join('\n\n') +
    `\n\n`
  );
}

export function buildLesenPrompt(teil, words, options = {}) {
  const {
    idSuffix, textSubtype, subtypeDef, excludeMolds, debateTopic, debateDef, debateSeed, topicTag,
    fewShotExamples, minimalRules,
  } = options;
  const raw = loadLesenTemplate(teil);
  let prompt = injectTargetWords(stripHumanHeader(raw), words);
  prompt = reinforceVocabOptionalBlock(prompt);
  if (idSuffix) {
    prompt +=
      `\n\nIMPORTANTE — IDs de esta generación:\n` +
      `- Prefijo de passages: gen-l${teil}-${idSuffix}\n` +
      `- Prefijo de preguntas: gen-q-${teil}-${idSuffix}-\n` +
      `No reutilices IDs del ejemplo ni del banco existente.`;
  }
  if (Number(teil) === 5 && subtypeDef) {
    prompt = injectT5PromptVariants(prompt, { textSubtype, subtypeDef, excludeMolds });
  }
  if (Number(teil) === 4 && (debateSeed || debateDef)) {
    prompt = injectT4PromptVariants(prompt, { debateTopic, debateDef, debateSeed, excludeMolds, topicTag });
  }
  if (Number(teil) === 1 || Number(teil) === 2) {
    prompt += buildExcludedPremisesPromptBlock();
  }
  if (fewShotExamples?.length) {
    prompt = prompt.replace(/\n## AUTORREVISIÓN[\s\S]*?(?=\n## PALABRAS OBJETIVO|\n## LONGITUD|$)/, '\n');
    prompt += buildFewShotLesenBlock(Number(teil), fewShotExamples);
  }
  prompt += teilLengthBlock(Number(teil));
  if (minimalRules) {
    prompt +=
      `\n\nCHECKLIST FINAL (mínima — calidad vía ejemplos verificados arriba):\n` +
      `- JSON válido único; IDs con el prefijo de esta generación.\n` +
      `- Tema B1 pedido; parafraseo B1 (máx. 2 palabras de contenido iguales al pasaje por afirmación).\n` +
      `- Vocabulario preguntas/explications ≤ B1; sin jerga B2/C1.\n` +
      (Number(teil) === 1 ? `- (T1) Blog en ich; 6 RF; misma persona (sie O er) en todas las afirmaciones.\n` : '') +
      `- Imita **estilo y dificultad** de los ejemplos verificados; contenido **nuevo**.\n` +
      `- Responde SOLO con el objeto JSON.\n`;
  } else {
    prompt +=
    `\n\nCHECKLIST FINAL (Goethe Hard Mode + CEFR):\n` +
    `- Cumple la sección «Goethe Hard Mode» de esta plantilla.\n` +
    `- Anti–word-matching: parafraseo, no emparejar palabras sueltas.\n` +
    `- Longitud: cumple el mínimo CEFR de arriba (cuenta palabras).\n` +
    `- El batch debe pasar check-lesen-batch-quality.mjs y check-lesen-batch-ingest.mjs sin errores.\n` +
    `- VOCABULARIO SUGERIDO: integra palabras solo si encajan; omite las que no encajen.\n` +
    `- Anti word-matching: máx. 2 palabras de contenido iguales al pasaje por afirmación/pregunta.\n` +
    `- Parafraseo B1 (T1/T2): vocabulario de preguntas/opciones/explanations ≤ B1 — sinónimo NO más difícil que el pasaje. ` +
    `PROHIBIDO modifizieren, Gelassenheit, Angehörige, elektronische Mitteilungen, sich austauschen, jerga B2.\n` +
    `- CEFR: evita Eigenregie, empfand, faszinierend, gebucht, Smartphone — usa léxico simple.\n` +
    (Number(teil) === 1
      ? `- (T1) Misma referencia sie/ihre O er/seine en todas las afirmaciones — nunca mezclar.\n`
      : '') +
    (Number(teil) === 2
      ? `- (T2) Los DOS textos deben tratar el TEMA OBLIGATORIO; topicTag idéntico en ambos passages.\n` +
        `- (T2) Textos de prensa B1: PROHIBIDO lenguaje corporativo/marketing/negocios ` +
        `(«Marke stärken», «die eigene Marke», «Branding», «Image pflegen», «Reichweite», ` +
        `«Zielgruppe», «Marketing», «Corporate»). Usa lenguaje cotidiano de periódico local.\n` +
        `- (T2) MCQ: las 3 opciones a/b/c deben ser **mutuamente excluyentes**. PROHIBIDO que dos ` +
        `opciones parafraseen el mismo hecho con sinónimos (p. ej. verbessern / besser machen, ` +
        `Unterstützung / Betreuung). Los distractores incorrectos deben usar **otro dato del pasaje ` +
        `mal aplicado o incompleto**, no otra formulación de la respuesta correcta.\n` +
        `- (T2) Opción correcta: PROHIBIDO copiar ≥4 palabras seguidas del pasaje; máx. 3 palabras ` +
        `de contenido (≥4 letras) iguales al pasaje — parafrasea con sinónimos B1.\n`
      : '') +
    (Number(teil) === 5
      ? `- (T5) Texto normativo B1 (Hausordnung/Regeln): opción correcta MCQ NO puede copiar ≥5 palabras ` +
        `seguidas del pasaje; máx. 3 palabras de contenido iguales — parafrasea la regla con otras palabras B1.\n`
      : '') +
    (Number(teil) === 4 && (debateSeed || debateDef)
      ? `- (T4) El foro debate el Vorschlag fijado y debe tratar del **tema B1 pedido** (topicTag); ` +
        `no debates genéricos de otro ámbito (p. ej. Homeoffice si el tema es Technik).\n`
      : '') +
    `- explanation: ≥10 palabras para multiple_choice (CHK-18 rechaza si es más corta). Usa frases completas que justifiquen la respuesta.\n` +
    `- Responde SOLO con el objeto JSON (sin markdown, sin \`\`\`, sin texto antes ni después).`;
  }
  return prompt;
}

/**
 * Reparación word-copy: T2/T5 — parafrasear opción correcta (y opcionalmente enunciado).
 */
export function buildMcqWordCopyRepairPrompt(ctx) {
  const passage = ctx.passage || {};
  const q = ctx.question || {};
  const body = String(passage.text || '').trim();
  const minWords = ctx.minWords ?? 4;
  if (!body) throw new Error('word-copy repair: pasaje sin texto');

  const opts = (q.options || []).map((o, i) => `${String.fromCharCode(97 + i)}) ${o}`).join('\n');
  const issues = (ctx.findings || []).map((f) => `- ${f.detail || 'word-copy'}`).join('\n');
  const forbidden = (ctx.forbiddenTokens || []).slice(0, 20).join(', ');

  return (
    `Eres examinador Goethe B1 Lesen Teil ${ctx.teil || 2}. El PASAJE está aprobado — NO lo modifiques.\n` +
    `Reescribe SOLO esta pregunta MCQ: parafrasea la opción CORRECTA para que NO copie ≥${minWords} palabras seguidas del pasaje.\n\n` +
    `## Pasaje (NO cambiar)\n` +
    `passageId: "${passage.id || '?'}"\n${body}\n\n` +
    `## Pregunta [${q.id || '?'}]\n` +
    `Enunciado: ${q.question || ''}\n` +
    `Clave correcta: ${q.correct ?? q.correctAnswer ?? '?'}\n` +
    `Opciones actuales:\n${opts || '(vacías)'}\n` +
    `Explanation: ${q.explanation || '(ninguna)'}\n\n` +
    `## Error del checker\n${issues}\n\n` +
    `## Reglas\n` +
    `- Mantén la MISMA clave correcta (misma letra a/b/c).\n` +
    `- La opción correcta debe seguir siendo la única respuesta válida según el pasaje.\n` +
    `- Parafrasea con vocabulario B1; máx. 3 palabras de contenido (≥4 letras) iguales al pasaje en la opción correcta.\n` +
    (forbidden
      ? `- EVITA estas palabras frecuentes del pasaje en la opción correcta (usa sinónimos B1): ${forbidden}\n`
      : '') +
    `- Distractores: datos distintos del pasaje, no sinónimos de la correcta.\n` +
    `- explanation ≥10 palabras.\n\n` +
    `Devuelve SOLO JSON:\n` +
    `{ "id": "${q.id || 'gen-q-repair'}", "question": "...", "options": ["a) ...", "b) ...", "c) ..."], ` +
    `"correct": "${q.correct ?? q.correctAnswer ?? 'a'}", "correctAnswer": "${q.correctAnswer ?? q.correct ?? 'a'}", ` +
    `"explanation": "..." }`
  );
}

/**
 * Reparación SEM-2 mcq_distinct: solo opciones a/b/c + explanation de UNA pregunta MCQ L2.
 */
export function buildL2McqDistinctRepairPrompt(ctx) {
  const passage = ctx.passage || {};
  const q = ctx.question || {};
  const body = String(passage.text || '').trim();
  if (!body) throw new Error('L2 mcq repair: pasaje sin texto');

  const opts = (q.options || []).map((o, i) => `${String.fromCharCode(97 + i)}) ${o}`).join('\n');
  const issues = (ctx.findings || []).map((f) => `- ${f.detail || f.message || 'opciones duplicadas'}`).join('\n');

  return (
    `Eres examinador Goethe B1 Lesen Teil 2. El PASAJE está aprobado — NO lo modifiques.\n` +
    `Reescribe SOLO las 3 opciones a/b/c y la explanation de esta pregunta MCQ.\n\n` +
    `## Pasaje (NO cambiar)\n` +
    `passageId: "${passage.id || '?'}"\n${body}\n\n` +
    `## Pregunta [${q.id || '?'}] (mantener id y clave correcta)\n` +
    `Enunciado: ${q.question || ''}\n` +
    `Clave correcta actual: ${q.correct ?? q.correctAnswer ?? '?'}\n` +
    `Opciones actuales:\n${opts || '(vacías)'}\n` +
    `Explanation actual: ${q.explanation || '(ninguna)'}\n\n` +
    `## Error del juez\n${issues}\n\n` +
    `## Reglas\n` +
    `- Las 3 opciones deben ser mutuamente excluyentes.\n` +
    `- PROHIBIDO que dos opciones parafraseen el mismo hecho (sinónimos).\n` +
    `- Distractores incorrectos: otro dato del pasaje mal aplicado o incompleto.\n` +
    `- Vocabulario B1; NO cambies la clave correcta salvo que esté objetivamente mal (raro).\n` +
    `- explanation ≥10 palabras, justifica la clave.\n\n` +
    `Devuelve SOLO JSON:\n` +
    `{ "id": "${q.id || 'gen-q-2-repair'}", "options": ["texto a", "texto b", "texto c"], ` +
    `"correct": "${q.correct ?? q.correctAnswer ?? 'a'}", "correctAnswer": "${q.correctAnswer ?? q.correct ?? 'a'}", ` +
    `"explanation": "..." }`
  );
}

export function pickRandomWords(pool, min = 8, max = 12) {
  const src = [...new Set((pool || []).map((w) => String(w).trim()).filter(Boolean))];
  if (!src.length) return [];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const n = lo === hi ? Math.min(src.length, lo) : Math.min(src.length, lo + Math.floor(Math.random() * (hi - lo + 1)));
  const copy = [...src];
  const out = [];
  while (copy.length && out.length < n) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

/** Lemas que suelen bajar cobertura CEFR si se fuerzan en el pasaje. */
const CEFR_RISKY_LEMMA = new Set([
  'design', 'begabung', 'ästhetik', 'ästhetisch', 'empfand', 'faszinierend', 'eigenregie',
  'smartphone', 'authentisch', 'literarisch', 'juris', 'therapie', 'künstlerisch',
  'denkmuster', 'reputation', 'image', 'inspiration', 'inspirieren',
]);

export function loadVocabBankLemmas(lang, level) {
  const file = path.join(ROOT, 'library', 'vocab', lang, `${level}.json`);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const raw = data.lemmas || data.words || [];
  return raw.map((w) => String(w).trim().toLowerCase()).filter(Boolean);
}

/**
 * Elige palabras objetivo para generación Lesen.
 * @param {{ lang?: string, level?: string, count?: number, source?: 'bank'|'weak'|'auto', safe?: boolean }} opts
 */
export function pickTargetWords(opts = {}) {
  const lang = opts.lang || 'de';
  const level = opts.level || 'B1';
  const count = Math.max(1, Number(opts.count) || 10);
  const source = opts.source || 'auto';
  const safe = opts.safe !== false;

  let pool = null;
  if (source === 'weak' || source === 'auto') {
    pool = loadWeakLemmas(lang, level);
  }
  if ((!pool || pool.length < count) && (source === 'bank' || source === 'auto')) {
    pool = loadVocabBankLemmas(lang, level);
  }
  if (!pool?.length) {
    throw new Error(
      `Sin pool de lemas para ${lang}/${level}. Ejecuta vocab-coverage-report.mjs o revisa library/vocab/${lang}/${level}.json`,
    );
  }

  let filtered = pool.map((w) => w.toLowerCase());
  if (safe) {
    filtered = filtered.filter((w) => !CEFR_RISKY_LEMMA.has(w));
    if (filtered.length < count) filtered = pool.map((w) => w.toLowerCase());
  }
  filtered = filtered.filter((w) => w.length >= 4);
  filtered = filterPromptTargetWords(filtered, { log: false });
  if (filtered.length < count) {
    filtered = pool
      .map((w) => String(w).trim().toLowerCase())
      .filter(Boolean)
      .filter((w) => !isBlacklistedLemma(w));
  }

  const picked = pickRandomWords(filtered, count, count);
  if (!picked.length) throw new Error('No se pudieron elegir palabras objetivo');
  return picked;
}

export function buildLesenPromptHeader(teil) {
  return (
    `# Prompt generado — Lesen B1 · Teil ${teil}\n` +
    `Copia TODO (desde la línea ---) y pégalo en Gemini/ChatGPT. Devuelve SOLO JSON.\n` +
    `Regenerar otro sorteo: npm run lesen:prompt:t${teil}\n\n---\n\n`
  );
}

export function buildLesenPromptFull(teil, words, options = {}) {
  return buildLesenPromptHeader(teil) + buildLesenPrompt(teil, words, options);
}

export function loadWeakLemmas(lang, level) {
  const file = path.join(ROOT, 'data', 'coverage', `weak-${lang}_${level}.json`);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data.weakLemmas || [];
}

/**
 * Segunda pasada: solo reescribe las 6 afirmaciones T1 manteniendo el pasaje.
 * @param {{ passage: object, idSuffix: string, forbiddenTokens?: string[], qualityIssues?: string[] }} ctx
 */
export function buildT1QuestionsRepairPrompt(ctx) {
  const passage = ctx.passage || {};
  const body = String(passage.text || '').trim();
  if (!body) throw new Error('T1 repair: pasaje sin texto');
  const forbidden = (ctx.forbiddenTokens || []).slice(0, 30).join(', ');
  const issues = (ctx.qualityIssues || []).slice(0, 6).map((i) => `- ${i}`).join('\n');
  const pid = passage.id || `gen-l1-${ctx.idSuffix || 'repair'}`;
  return (
    `Eres examinador Goethe B1 Lesen Teil 1. El PASAJE ya está aprobado — NO lo modifiques.\n` +
    `Reescribe SOLO las 6 afirmaciones Richtig/Falsch (type "richtig_falsch").\n\n` +
    `## Pasaje (NO cambiar)\n` +
    `passageId: "${pid}"\n` +
    `${body}\n\n` +
    `## Reglas (rechazo si fallas)\n` +
    `- Máx. 2 palabras de contenido (≥4 letras) iguales al pasaje por afirmación.\n` +
    `- Parafrasea con vocabulario B1 (≤ nivel del pasaje); sinónimo NO más difícil. ` +
    `PROHIBIDO: modifizieren, Gelassenheit, Angehörige, elektronische Mitteilungen, sich austauschen.\n` +
    `- 2+ correct Richtig, 2+ correct Falsch.\n` +
    `- ≥2 Falsch con alle/jede/jeder/immer/nie/nur/ausschließlich/täglich/komplett.\n` +
    `- Misma referencia sie/ihre O er/seine en todas — nunca mezclar.\n` +
    (forbidden
      ? `- PROHIBIDO usar estas palabras del pasaje en afirmaciones: ${forbidden}\n`
      : '') +
    (issues ? `\n## Errores del checker anterior\n${issues}\n` : '') +
    `\n## Salida\n` +
    `Devuelve SOLO JSON: { "questions": [ 6 objetos ] }\n` +
    `- Cada pregunta: id gen-q-1-${ctx.idSuffix || 'repair'}-N, module "lesen", teil 1, lang "de", level "B1",\n` +
    `  type "richtig_falsch", passageId "${pid}", question, correct, correctAnswer, explanation.\n` +
    `- options: [] · Sin markdown.`
  );
}

export function nextOutputBasename(teil, tag = 'gemini') {
  const dir = path.join(ROOT, 'batches', 'generated');
  fs.mkdirSync(dir, { recursive: true });
  let max = 0;
  const re = new RegExp(`^lesen-t${teil}-${tag}-(\\d+)\\.json$`, 'i');
  for (const name of fs.readdirSync(dir)) {
    const m = name.match(re);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `lesen-t${teil}-${tag}-${String(max + 1).padStart(3, '0')}.json`;
}
