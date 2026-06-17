import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

export const MERGED_DIR = path.join(ROOT, 'batches', 'merged');

export const LANG_META = {
  de: {
    examType: 'goethe',
    masterPrompt: 'batches/GEMINI_MASTER_PROMPT_de_B1.md',
    apiPrompt: 'batches/GEMINI_API_COMPACT_de_B1.md',
    idPrefix: 'de',
  },
  en: { examType: 'cambridge', masterPrompt: 'batches/MASTER_PROMPT_en.md', idPrefix: 'en' },
  es: { examType: 'dele', masterPrompt: 'batches/MASTER_PROMPT_es.md', idPrefix: 'es' },
};

const MULTI_TEIL_MODULES = new Set(['schreiben', 'sprechen', 'writing']);

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function poolsPath(lang) {
  const perLang = path.join(ROOT, 'batches', 'topic-pools', `${lang}.json`);
  if (fs.existsSync(perLang)) return perLang;
  return path.join(ROOT, 'batches', 'topic-pools.json');
}

export function loadPools(lang) {
  return JSON.parse(fs.readFileSync(poolsPath(lang), 'utf8'));
}

function loadUsedSlugBases(lang, level) {
  const used = new Set();
  const bankPath = path.join(ROOT, 'library', lang, level, 'questions.json');

  if (fs.existsSync(MERGED_DIR)) {
    for (const file of fs.readdirSync(MERGED_DIR)) {
      const m = file.match(
        /^(?:lesen|horen|use-of-english|reading|listening|grammatik)-t\d+-(.+)\.json$|^(?:schreiben|sprechen|writing)-(.+)\.json$/i,
      );
      if (m) used.add((m[1] || m[2]).replace(/\s+/g, ''));
    }
  }

  if (fs.existsSync(bankPath)) {
    try {
      const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
      for (const id of [...(bank.passages || []).map((p) => p.id), ...(bank.questions || []).map((q) => q.id)]) {
        const parts = String(id).split('-');
        const tIdx = parts.findIndex((p) => /^t\d+$/.test(p));
        if (tIdx >= 0 && parts[tIdx + 1]) {
          const rest = parts.slice(tIdx + 1);
          if (/^[ab]$/.test(rest[rest.length - 1])) rest.pop();
          if (/^s\d+$/.test(rest[rest.length - 1])) rest.pop();
          if (/^q\d+$/.test(rest[rest.length - 1])) rest.pop();
          used.add(rest.join('-'));
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  return used;
}

function nextSlug(slugBase, usedSlugs) {
  for (let n = 1; n <= 99; n++) {
    const suffix = String(n).padStart(2, '0');
    const candidate = `${slugBase}-${suffix}`;
    if (!usedSlugs.has(candidate)) return candidate;
  }
  return `${slugBase}-${Date.now().toString(36)}`;
}

function moduleFilePrefix(module) {
  if (module === 'use_of_english') return 'use-of-english';
  return module;
}

function blueprintModuleSet(lang, level) {
  const meta = LANG_META[lang] || LANG_META.de;
  const file = path.join(ROOT, 'library/blueprints', `${meta.examType}_${level}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const bp = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Set((bp.modules || []).map((m) => m.id));
  } catch (_) {
    return null;
  }
}

function pickModule(pools, moduleFilter, allowedModules) {
  if (moduleFilter) {
    if (allowedModules && !allowedModules.has(moduleFilter)) {
      throw new Error(
        `Módulo "${moduleFilter}" no está en el blueprint (${[...allowedModules].join(', ')})`,
      );
    }
    return moduleFilter;
  }
  const priority = pools.priority || {};
  const modules = Object.keys(pools.modules).filter((m) => !allowedModules || allowedModules.has(m));
  if (!modules.length) throw new Error('Ningún módulo del topic-pool coincide con el blueprint');
  const weighted = [];
  for (const mod of modules) {
    const w = (priority[mod]?.length || 0) + 1;
    for (let i = 0; i < w; i++) weighted.push(mod);
  }
  return pick(weighted);
}

function pickTeil(mod, modDef, teilFilter, pools) {
  if (teilFilter) return Number(teilFilter);
  const priorityTeile = pools.priority?.[mod];
  if (priorityTeile?.length) return pick(priorityTeile);
  return pick(modDef.teile);
}

function pickTopic(mod, teil, modDef) {
  if (MULTI_TEIL_MODULES.has(mod)) return pick(modDef.topics);
  const list = modDef.topics[String(teil)];
  if (!list?.length) throw new Error(`No hay temas para ${mod} T${teil}`);
  return pick(list);
}

export function buildBatchParams(pools, lang, opts = {}) {
  const meta = LANG_META[lang] || LANG_META.de;
  const level = opts.level || pick(pools.levels);
  const allowed = blueprintModuleSet(lang, level);
  const module = pickModule(pools, opts.module, allowed);
  const modDef = pools.modules[module];
  if (!modDef) throw new Error(`Módulo "${module}" no existe en topic-pools/${lang}.json`);
  const isMultiTeil = MULTI_TEIL_MODULES.has(module);
  const teil = isMultiTeil ? null : pickTeil(module, modDef, opts.teil, pools);
  const topicEntry = pickTopic(module, teil, modDef);
  const usedSlugs = loadUsedSlugBases(lang, level);
  const slug = nextSlug(topicEntry.slugBase, usedSlugs);
  const fileMod = moduleFilePrefix(module);

  const params = {
    lang,
    level,
    examType: pools.examType || meta.examType,
    module,
    teil: isMultiTeil ? (module === 'writing' ? '1+2' : '1+2+3') : teil,
    slug,
    topicTag: topicEntry.topicTag,
    idPrefix: `${meta.idPrefix}-${level.toLowerCase()}`,
    outputFile: isMultiTeil ? `${fileMod}-${slug}.json` : `${fileMod}-t${teil}-${slug}.json`,
  };

  if (module === 'schreiben') {
    params.topicT1 = topicEntry.topicT1;
    params.topicT2 = topicEntry.topicT2;
    params.topicT3 = topicEntry.topicT3;
    params.topic = `(T1) ${topicEntry.topicT1} — (T2) ${topicEntry.topicT2} — (T3) ${topicEntry.topicT3}`;
  } else if (module === 'writing') {
    params.topicT1 = topicEntry.topicT1;
    params.topicT2 = topicEntry.topicT2;
    params.topic = `(Part 1) ${topicEntry.topicT1} — (Part 2) ${topicEntry.topicT2}`;
  } else if (module === 'sprechen') {
    params.topicT1 = topicEntry.topicT1;
    params.topicT2 = topicEntry.topicT2;
    params.topic = `${topicEntry.topicT1} / ${topicEntry.topicT2}`;
  } else {
    params.topic = topicEntry.topic;
    if (topicEntry.area) params.area = topicEntry.area;
    if (topicEntry.docType) params.docType = topicEntry.docType;
    if (topicEntry.segments) params.segments = topicEntry.segments;
  }

  return params;
}

export function formatParamBlock(p) {
  const lines = [
    'MODO   = aleatorio',
    `LANG   = ${p.lang}`,
    `LEVEL  = ${p.level}`,
    `EXAM   = ${p.examType}`,
    `MODULE = ${p.module}`,
    `TEIL   = ${p.teil}`,
    `TOPIC  = ${p.topic}`,
    `SLUG   = ${p.slug}`,
    `ID_PREFIX = ${p.idPrefix}`,
  ];
  if (p.module === 'sprechen' || p.module === 'schreiben' || p.module === 'writing') {
    lines.push(`AVISO  = ${p.module.toUpperCase()}: passages debe ser [] vacío. NO generes textos largos ni MCQ de lectura.`);
  }
  if (p.module === 'grammatik') {
    lines.push('AVISO  = GRAMMATIK: passages []. Solo MCQ gramatical suelta (12-15 preguntas).');
  }
  if (p.area) lines.push(`AREA   = ${p.area}`);
  if (p.docType) lines.push(`DOCTYPE = ${p.docType}`);
  if (p.segments) lines.push(`SEGMENTS = ${p.segments.join(', ')}`);
  if (p.topicT1) lines.push(`TOPIC_T1 = ${p.topicT1}`);
  if (p.topicT2) lines.push(`TOPIC_T2 = ${p.topicT2}`);
  if (p.topicT3) lines.push(`TOPIC_T3 = ${p.topicT3}`);
  return lines.join('\n');
}

export function buildMasterPrompt(lang, params, { compact = true } = {}) {
  const meta = LANG_META[lang] || LANG_META.de;
  const useCompact = compact && meta.apiPrompt && process.env.GEMINI_FULL_PROMPT !== '1';
  const promptRel = useCompact ? meta.apiPrompt : meta.masterPrompt;
  const promptPath = path.join(ROOT, promptRel);
  if (!fs.existsSync(promptPath)) throw new Error(`No existe master prompt: ${promptRel}`);
  const raw = fs.readFileSync(promptPath, 'utf8');
  const marker = '---INICIO---';
  const match = raw.match(/^---INICIO---\s*$/m);
  if (!match) throw new Error(`${promptRel} no contiene línea ---INICIO---`);
  const idx = match.index;
  const tail = raw.slice(idx + marker.length);
  return `${marker}\n\n${formatParamBlock(params)}\n\n${tail.trim()}\n`;
}
