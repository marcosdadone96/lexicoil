/**
 * Shared TTS cache helpers — hash/file naming matches netlify/functions/tts.js via ttsCacheLib.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ttsCacheLib = require(path.join(ROOT, 'netlify/functions/lib/ttsCacheLib.js'));
const { resolveVoiceId } = require(path.join(ROOT, 'netlify/functions/lib/ttsVoices.js'));

export function normalizeTtsText(text) {
  return ttsCacheLib.normalizeTtsInput(text);
}

export function ttsTextHash(text) {
  return ttsCacheLib.textHash(text);
}

export function cacheKey(voice, text) {
  return ttsCacheLib.cacheKey(voice, text);
}

export function cacheDir(root = ROOT) {
  return path.join(root, 'library', 'tts-cache');
}

export function cacheFilePath(voice, hashOrText, root = ROOT) {
  if (typeof hashOrText === 'string' && hashOrText.length === 16 && !/\s/.test(hashOrText)) {
    return path.join(cacheDir(root), ttsCacheLib.cacheFileName(voice, hashOrText));
  }
  return ttsCacheLib.cacheFilePath(voice, hashOrText, path.join(ROOT, 'netlify/functions/lib'));
}

export function manifestPath(lang, level, root = ROOT) {
  return path.join(cacheDir(root), 'manifest', `${lang}_${level}.json`);
}

export function examManifestPath(lang, level, root = ROOT) {
  return path.join(cacheDir(root), 'manifest', `exams_${lang}_${level}.json`);
}

export function readCache(voice, text, lang = 'de', root = ROOT) {
  const buf = ttsCacheLib.readBundledAudioBuffer(
    voice,
    text,
    lang,
    resolveVoiceId,
    path.join(ROOT, 'netlify/functions/lib'),
  );
  if (!buf) return null;
  const hash = ttsCacheLib.textHash(text);
  const file = path.join(cacheDir(root), ttsCacheLib.cacheFileName(voice, hash));
  return { hash, file, voice, bytes: buf.length };
}

export function writeCache(voice, text, audio, root = ROOT) {
  const hash = ttsCacheLib.textHash(text);
  const file = path.join(cacheDir(root), ttsCacheLib.cacheFileName(voice, hash));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, audio);
  return { hash, file, voice, bytes: audio.length };
}

export function horenPassagesFromBank(bank) {
  return (bank.passages || []).filter((p) => p.module === 'horen' && String(p.text || '').trim());
}

export function loadBank(lang, level, root = ROOT) {
  const file = path.join(root, 'library', lang, level, 'questions.json');
  if (!fs.existsSync(file)) throw new Error(`Missing bank: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Legacy static file only. Levels served from library/published-exams/ are NOT in here —
 * use resolveServedExams() from ./servedExams.mjs to get what the app actually serves.
 */
export function loadServedExams(lang, level, root = ROOT) {
  const file = path.join(root, 'data', 'exams', `${lang}_${level}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing served exams: ${file}`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(raw) ? raw : raw.exams || [raw];
}
