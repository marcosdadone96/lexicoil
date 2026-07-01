#!/usr/bin/env node
/**
 * Generate vocabulary & phrases reference JSON via Gemini (free tier rate limit).
 * Usage: node scripts/generate-reference-content.mjs [--type vocabulary|phrases] [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/loadEnv.mjs';
import { generateContent, DailyQuotaError } from './lib/geminiClient.mjs';
import { extractJson } from './lib/extractJson.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(path.join(ROOT, '.env'));

const TAUGHT = 'de';
const META_LANGS = ['en', 'es'];
const PUBLISHED_LEVELS = ['A2', 'B1'];
const STUB_LEVELS = ['A1', 'B2', 'C1', 'C2'];
const ALL_LEVELS = [...STUB_LEVELS, ...PUBLISHED_LEVELS].sort();

const VOCAB_SECTIONS = {
  A2: [
    { id: 'familie', titleEn: 'Family & relationships', titleEs: 'Familia y relaciones' },
    { id: 'einkaufen', titleEn: 'Shopping & food', titleEs: 'Compras y comida' },
    { id: 'gesundheit', titleEn: 'Health', titleEs: 'Salud' },
    { id: 'freizeit', titleEn: 'Leisure & hobbies', titleEs: 'Ocio y aficiones' },
    { id: 'arbeit', titleEn: 'Work & daily routine', titleEs: 'Trabajo y rutina' },
    { id: 'wohnen', titleEn: 'Home & city', titleEs: 'Vivienda y ciudad' },
  ],
  B1: [
    { id: 'umwelt', titleEn: 'Environment & nature', titleEs: 'Medio ambiente' },
    { id: 'arbeit_beruf', titleEn: 'Work & career', titleEs: 'Trabajo y carrera' },
    { id: 'technologie', titleEn: 'Technology & media', titleEs: 'Tecnología y medios' },
    { id: 'gesundheit', titleEn: 'Health & wellbeing', titleEs: 'Salud y bienestar' },
    { id: 'reisen', titleEn: 'Travel & transport', titleEs: 'Viajes y transporte' },
    { id: 'gesellschaft', titleEn: 'Society & education', titleEs: 'Sociedad y educación' },
  ],
};

const PHRASE_SECTIONS = {
  A2: [
    { id: 'alltag', titleEn: 'Everyday requests', titleEs: 'Peticiones cotidianas' },
    { id: 'einkaufen', titleEn: 'Shopping & services', titleEs: 'Compras y servicios' },
    { id: 'gesundheit', titleEn: 'At the doctor', titleEs: 'En el médico' },
    { id: 'reisen', titleEn: 'Travel & directions', titleEs: 'Viajes e indicaciones' },
    { id: 'freizeit', titleEn: 'Invitations & plans', titleEs: 'Invitaciones y planes' },
  ],
  B1: [
    { id: 'meinung', titleEn: 'Opinions & discussion', titleEs: 'Opiniones y debate' },
    { id: 'vorschlaege', titleEn: 'Suggestions & advice', titleEs: 'Sugerencias y consejos' },
    { id: 'beschwerden', titleEn: 'Complaints & problems', titleEs: 'Quejas y problemas' },
    { id: 'formell', titleEn: 'Formal situations', titleEs: 'Situaciones formales' },
    { id: 'arbeit', titleEn: 'Work & appointments', titleEs: 'Trabajo y citas' },
  ],
};

function scopeText(type, level, meta) {
  const ml = meta === 'es' ? 'español' : 'English';
  if (type === 'vocabulary') {
    return `Core German vocabulary for Goethe ${level}, grouped by theme. Word translations are in ${ml}; examples stay in German.`;
  }
  return `Useful German phrases and expressions for Goethe ${level}. Translations and usage notes in ${ml}; phrase examples in German.`;
}

function buildPrompt(type, level, meta) {
  const sections = type === 'vocabulary' ? VOCAB_SECTIONS[level] : PHRASE_SECTIONS[level];
  const sectionList = sections
    .map((s) => {
      const title = meta === 'es' ? s.titleEs : s.titleEn;
      return `- id: "${s.id}", title: "${title}" (exactly 8 items)`;
    })
    .join('\n');

  const itemSchema =
    type === 'vocabulary'
      ? '{ "word": "German", "translation": "...", "example": "German sentence.", "category": "optional subtopic" }'
      : '{ "phrase": "German", "translation": "...", "usage": "when to use (in ' +
        (meta === 'es' ? 'Spanish' : 'English') +
        ')", "register": "formal|informal|neutral" }';

  return `You are building reference content for a German exam prep app (Goethe ${level}).

Return ONLY valid JSON (no markdown) matching this schema:
{
  "lang": "de",
  "level": "${level}",
  "status": "published",
  "title": "${type === 'vocabulary' ? 'Vocabulary' : 'Phrases'} · German ${level}",
  "metaLanguage": "${meta}",
  "scope": "${scopeText(type, level, meta).replace(/"/g, '\\"')}",
  "sections": [
    { "id": "...", "title": "...", "items": [ ${itemSchema} ] }
  ]
}

Sections (8 items each, CEFR ${level} appropriate — not too easy, not C1+):
${sectionList}

Rules:
- German examples/phrases must be natural and level-appropriate.
- Translations in ${meta === 'es' ? 'Spanish' : 'English'}.
- No duplicate items across sections.
- section ids must match exactly as listed.`;
}

function outPath(type, taught, meta, level) {
  return path.join(ROOT, 'content', type, taught, meta, `${level}.json`);
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function stubDoc(type, level, meta) {
  const ml = meta === 'es' ? 'es' : 'en';
  return {
    lang: TAUGHT,
    level,
    status: 'draft',
    title: `${type === 'vocabulary' ? 'Vocabulary' : 'Phrases'} · German ${level}`,
    metaLanguage: meta,
    scope: scopeText(type, level, ml),
    sections: [],
  };
}

function writeManifest(type) {
  const published = { [TAUGHT]: {} };
  for (const meta of META_LANGS) {
    published[TAUGHT][meta] = [...PUBLISHED_LEVELS];
  }
  const manifest = {
    metaLanguages: META_LANGS,
    defaultMetaLanguage: 'en',
    published,
    pending: Object.fromEntries(STUB_LEVELS.map((l) => [l, META_LANGS])),
    note: `Reference ${type} for Goethe German. Path: content/${type}/<taughtLang>/<metaLang>/<level>.json`,
  };
  writeJson(path.join(ROOT, 'content', type, 'manifest.json'), manifest);
}

async function generateOne(type, level, meta, dryRun) {
  const filePath = outPath(type, TAUGHT, meta, level);
  if (dryRun) {
    console.log('[dry-run]', filePath);
    return;
  }
  const prompt = buildPrompt(type, level, meta);
  console.log(`Generating ${type} de/${meta}/${level}…`);
  try {
    const raw = await generateContent({ prompt, jsonMode: true, maxTokens: 12000 });
    const doc = extractJson(raw);
    doc.lang = TAUGHT;
    doc.level = level;
    doc.status = 'published';
    doc.metaLanguage = meta;
    writeJson(filePath, doc);
    console.log('  ✓', filePath, `(${doc.sections?.length || 0} sections)`);
  } catch (e) {
    console.error('  ✗', e.message);
    throw e;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const typeFilter = args.find((a) => a.startsWith('--type='))?.split('=')[1];
  const types = typeFilter ? [typeFilter] : ['vocabulary', 'phrases'];

  for (const type of types) {
    writeManifest(type);
    for (const level of ALL_LEVELS) {
      for (const meta of META_LANGS) {
        const filePath = outPath(type, TAUGHT, meta, level);
        if (STUB_LEVELS.includes(level)) {
          if (!dryRun) writeJson(filePath, stubDoc(type, level, meta));
          continue;
        }
        if (PUBLISHED_LEVELS.includes(level)) {
          await generateOne(type, level, meta, dryRun);
        }
      }
    }
  }
  console.log('\nDone.');
}

main().catch((e) => {
  if (e instanceof DailyQuotaError) {
    console.error('\n' + e.message);
    console.error('Run again tomorrow or use bundled seeds.');
  }
  process.exit(1);
});
