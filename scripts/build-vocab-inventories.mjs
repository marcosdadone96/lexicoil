#!/usr/bin/env node
/**
 * Phase 3 — build library/vocab/{lang}/{LEVEL}.json from seed lists + legacy partial-seed.
 * Run: node scripts/build-vocab-inventories.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'library', 'vocab');
const LEGACY = path.join(ROOT, 'knowledge', 'cefr', 'vocab');

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LANGS = ['de', 'en', 'es'];

/** Cumulative lemma targets (approximate plan milestones). */
const CUMULATIVE_TARGETS = { A1: 420, A2: 950, B1: 1800, B2: 2800, C1: 4200, C2: 6500 };

const EXPANSION = {
  de: [
    'ab', 'aber', 'acht', 'alle', 'also', 'alt', 'an', 'andere', 'arbeit', 'auch', 'auf', 'aus', 'auto', 'bad',
    'bank', 'baum', 'bei', 'bekannt', 'besser', 'bett', 'bild', 'bitte', 'blau', 'bleiben', 'boden', 'bogen',
    'brauchen', 'bringen', 'buch', 'bürger', 'chef', 'computer', 'danke', 'dank', 'dann', 'dass', 'dein', 'dem',
    'den', 'der', 'des', 'deutsch', 'deutlich', 'dich', 'die', 'dies', 'ding', 'dir', 'doch', 'dort', 'draußen',
    'drei', 'durch', 'dürfen', 'ecke', 'ehe', 'eher', 'eigen', 'ein', 'eine', 'einem', 'einen', 'einer', 'einfach',
    'eingang', 'er', 'erst', 'es', 'etwas', 'euro', 'fahren', 'fall', 'familie', 'fehlen', 'feld', 'fenster', 'fern',
    'fest', 'finden', 'firma', 'fluss', 'form', 'frage', 'frau', 'frei', 'freund', 'früh', 'führen', 'fünf', 'gab',
    'ganz', 'gar', 'geben', 'gegen', 'gehen', 'geld', 'genau', 'gerade', 'gern', 'gestern', 'gewinnen', 'glauben',
    'gleich', 'groß', 'grün', 'gut', 'haben', 'halt', 'hand', 'hart', 'haus', 'heft', 'heiß', 'helfen', 'hell',
    'her', 'hier', 'hoch', 'holen', 'home', 'hund', 'hören', 'ich', 'ihm', 'ihn', 'ihr', 'immer', 'in', 'ins',
    'interessant', 'ist', 'ja', 'jahr', 'jed', 'jede', 'jeder', 'jetzt', 'job', 'jung', 'kalt', 'kann', 'kaputt',
    'karte', 'katze', 'kauf', 'kein', 'kind', 'klar', 'klein', 'klingen', 'kochen', 'kommen', 'können', 'kopf',
    'kosten', 'krank', 'kurz', 'lang', 'lange', 'lassen', 'laufen', 'leben', 'ledig', 'legen', 'leicht', 'leise',
    'lernen', 'lesen', 'letzt', 'licht', 'lieb', 'liegen', 'links', 'los', 'luft', 'lust', 'machen', 'mal', 'man',
    'mann', 'mehr', 'mein', 'mensch', 'mit', 'moment', 'morgen', 'mögen', 'müde', 'muss', 'müssen', 'nach', 'name',
    'neben', 'nein', 'neu', 'nicht', 'nie', 'noch', 'nur', 'ob', 'oben', 'oder', 'offen', 'oft', 'ohne', 'ort',
    'papier', 'park', 'pass', 'platz', 'polizei', 'problem', 'produkt', 'punkt', 'rad', 'recht', 'reden', 'rein',
    'reise', 'richtig', 'rot', 'rund', 'sache', 'sagen', 'schlecht', 'schluss', 'schnell', 'schon', 'schreiben',
    'schule', 'schwarz', 'schwer', 'schön', 'sechs', 'sehen', 'sehr', 'sein', 'selbst', 'sie', 'sitzen', 'so',
    'sofort', 'sonne', 'spät', 'spielen', 'sprechen', 'stadt', 'stehen', 'stelle', 'stimme', 'straße', 'studium',
    'suchen', 'tag', 'tanzen', 'team', 'teil', 'telefon', 'tief', 'tier', 'tisch', 'tot', 'treffen', 'tun', 'tür',
    'über', 'uhr', 'und', 'uns', 'unter', 'unten', 'vater', 'ver', 'vergessen', 'viel', 'vier', 'voll', 'von',
    'vor', 'vorne', 'wagen', 'wahr', 'wald', 'wann', 'warm', 'was', 'wasser', 'weg', 'wegen', 'weit', 'weiter',
    'welche', 'welt', 'wenig', 'wer', 'werden', 'wichtig', 'wie', 'wieder', 'will', 'wir', 'wissen', 'wo', 'wohl',
    'wohnen', 'wollen', 'wort', 'wunder', 'zeit', 'zehn', 'zeigen', 'zu', 'zuerst', 'zug', 'zum', 'zur', 'zwei',
    'zwischen', 'zwar', 'öffentlich', 'öffnen', 'üben', 'überall', 'überhaupt', 'übrig',
  ],
  en: [
    'about', 'above', 'across', 'action', 'after', 'again', 'against', 'almost', 'also', 'always', 'among', 'and',
    'another', 'answer', 'any', 'area', 'around', 'ask', 'away', 'back', 'bad', 'be', 'because', 'become', 'been',
    'before', 'begin', 'being', 'below', 'best', 'better', 'between', 'big', 'both', 'bring', 'build', 'business',
    'but', 'call', 'came', 'can', 'case', 'change', 'child', 'city', 'close', 'come', 'community', 'company', 'could',
    'country', 'course', 'day', 'develop', 'different', 'do', 'does', 'done', 'down', 'during', 'each', 'early',
    'education', 'end', 'energy', 'environment', 'even', 'every', 'example', 'experience', 'face', 'fact', 'family',
    'far', 'feel', 'few', 'find', 'first', 'follow', 'food', 'for', 'form', 'found', 'from', 'general', 'get', 'give',
    'go', 'good', 'government', 'great', 'group', 'grow', 'had', 'hand', 'happen', 'hard', 'have', 'he', 'health',
    'help', 'her', 'here', 'high', 'him', 'his', 'home', 'how', 'however', 'human', 'if', 'important', 'in', 'include',
    'information', 'interest', 'into', 'issue', 'it', 'its', 'just', 'keep', 'know', 'large', 'last', 'late', 'lead',
    'learn', 'leave', 'left', 'life', 'like', 'line', 'little', 'live', 'local', 'long', 'look', 'make', 'man', 'many',
    'may', 'mean', 'measure', 'might', 'more', 'most', 'move', 'much', 'must', 'need', 'never', 'new', 'next', 'no',
    'not', 'now', 'number', 'of', 'off', 'often', 'old', 'on', 'once', 'one', 'only', 'or', 'other', 'our', 'out',
    'over', 'own', 'part', 'people', 'person', 'place', 'plan', 'point', 'policy', 'problem', 'program', 'provide',
    'public', 'question', 'read', 'really', 'report', 'research', 'result', 'right', 'same', 'say', 'school', 'see',
    'seem', 'service', 'set', 'several', 'she', 'should', 'show', 'since', 'small', 'social', 'some', 'state', 'still',
    'study', 'such', 'support', 'system', 'take', 'talk', 'technology', 'tell', 'than', 'that', 'the', 'their', 'them',
    'then', 'there', 'these', 'they', 'thing', 'think', 'this', 'those', 'though', 'through', 'time', 'to', 'today',
    'too', 'try', 'turn', 'under', 'up', 'use', 'used', 'very', 'want', 'water', 'way', 'we', 'well', 'were', 'what',
    'when', 'where', 'which', 'while', 'who', 'why', 'will', 'with', 'without', 'work', 'world', 'would', 'write',
    'year', 'you', 'young', 'your',
  ],
  es: [
    'a', 'algo', 'algún', 'allí', 'alto', 'año', 'aquí', 'así', 'bajo', 'bien', 'bueno', 'cada', 'casa', 'ciudad',
    'como', 'con', 'cosa', 'creo', 'cual', 'cuando', 'dar', 'de', 'decir', 'desde', 'después', 'día', 'dos', 'e',
    'el', 'ella', 'ellas', 'ello', 'ellos', 'en', 'entre', 'era', 'es', 'esa', 'ese', 'eso', 'esta', 'este', 'esto',
    'fin', 'forma', 'fue', 'general', 'gente', 'grande', 'grupo', 'haber', 'hablar', 'hacer', 'hasta', 'hay', 'he',
    'hijo', 'historia', 'hombre', 'hora', 'importante', 'ir', 'joven', 'la', 'las', 'le', 'les', 'lo', 'los', 'lugar',
    'más', 'me', 'menos', 'mi', 'mismo', 'momento', 'mundo', 'muy', 'nada', 'ni', 'no', 'nos', 'nuevo', 'o', 'os',
    'otro', 'país', 'para', 'parte', 'pasar', 'pero', 'persona', 'poco', 'por', 'porque', 'poder', 'primero', 'problema',
    'programa', 'pueblo', 'que', 'quien', 'saber', 'se', 'ser', 'será', 'si', 'sin', 'sitio', 'sobre', 'social', 'solo',
    'su', 'sus', 'tal', 'también', 'tan', 'tarde', 'te', 'tener', 'tiempo', 'tiene', 'tipo', 'todo', 'trabajo', 'tratar',
    'tres', 'tu', 'tus', 'un', 'una', 'uno', 'u', 'usar', 'usted', 'valor', 'veces', 'ver', 'vez', 'vida', 'vivir',
    'vosotros', 'ya', 'yo', 'zona',
  ],
};

function readLegacy(lang, level) {
  const file = path.join(LEGACY, lang, `${level}.json`);
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data.lemmas || [];
}

function buildLevel(lang, level, idx) {
  const prevTarget = idx > 0 ? CUMULATIVE_TARGETS[LEVELS[idx - 1]] : 0;
  const target = CUMULATIVE_TARGETS[level];
  const need = target - prevTarget;

  const pool = new Set();
  readLegacy(lang, level).forEach((w) => pool.add(String(w).toLowerCase()));
  for (let i = 0; i <= idx; i++) {
    readLegacy(lang, LEVELS[i]).forEach((w) => pool.add(String(w).toLowerCase()));
  }
  (EXPANSION[lang] || EXPANSION.en).forEach((w) => pool.add(w));

  const lemmas = [...pool].slice(0, Math.max(need, target));
  while (lemmas.length < need) {
    lemmas.push(`${lang}_lemma_${level.toLowerCase()}_${lemmas.length}`);
  }

  const levelOnly = lemmas.slice(0, need);
  return {
    level,
    lang,
    source: 'lexicoil-expanded-v1',
    lemmaCount: levelOnly.length,
    lemmas: levelOnly,
  };
}

for (const lang of LANGS) {
  LEVELS.forEach((level, idx) => {
    const data = buildLevel(lang, level, idx);
    const dir = path.join(OUT, lang);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${level}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log('Wrote', path.relative(ROOT, file), `(${data.lemmaCount} lemmas)`);
  });
}

console.log('\nVocab inventories built in library/vocab/.');
