/**
 * Shared TTS cache helpers (Sprint 3 — pretts-bank + warm-pool).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function ttsTextHash(text) {
  return crypto.createHash('sha256').update(String(text || '').trim().toLowerCase()).digest('hex').slice(0, 16);
}

export function cacheDir(root = ROOT) {
  return path.join(root, 'library', 'tts-cache');
}

export function cacheFilePath(voice, hash, root = ROOT) {
  const safeVoice = String(voice || 'default').trim().slice(0, 32);
  return path.join(cacheDir(root), `${safeVoice}_${hash}.mp3`);
}

export function manifestPath(lang, level, root = ROOT) {
  return path.join(cacheDir(root), 'manifest', `${lang}_${level}.json`);
}

export function readCache(voice, text, root = ROOT) {
  const hash = ttsTextHash(text);
  const file = cacheFilePath(voice, hash, root);
  if (!fs.existsSync(file)) return null;
  return { hash, file, voice, bytes: fs.statSync(file).size };
}

export function writeCache(voice, text, audio, root = ROOT) {
  const hash = ttsTextHash(text);
  const file = cacheFilePath(voice, hash, root);
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
