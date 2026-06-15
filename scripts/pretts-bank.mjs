#!/usr/bin/env node
/**
 * Sprint 3 — pre-generate TTS audio for library hören passages (multi-voice aware).
 *
 * Usage:
 *   TTS_PROVIDER=stub node scripts/pretts-bank.mjs --lang de --level B1
 *   TTS_PROVIDER=elevenlabs ELEVENLABS_API_KEY=... node scripts/pretts-bank.mjs --lang de --level B1
 *   node scripts/pretts-bank.mjs --all
 *   node scripts/pretts-bank.mjs --lang de --level B1 --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  cacheDir,
  manifestPath,
  readCache,
  writeCache,
  horenPassagesFromBank,
  loadBank,
  ttsTextHash,
} from './lib/ttsCache.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const { synthesize, isProviderConfigured } = require(path.join(ROOT, 'netlify/functions/lib/ttsProvider.js'));
const { defaultVoiceForLang, resolveVoiceId } = require(path.join(ROOT, 'netlify/functions/lib/ttsVoices.js'));
const ListeningScript = require(path.join(ROOT, 'js/bootstrap/listeningScript.js'));

const DEFAULT_TARGETS = [
  ['de', 'B1'],
  ['de', 'B2'],
  ['en', 'B2'],
  ['es', 'B2'],
];

function parseArgs(argv) {
  const out = { lang: 'de', level: 'B1', all: false, dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = argv[++i];
    else if (a === '--all') out.all = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
  }
  return out;
}

async function synthSegment(text, voice, lang, stats) {
  const key = `${voice}:${ttsTextHash(text)}`;
  if (!stats.force) {
    const hit = readCache(voice, text);
    if (hit) {
      stats.skipped++;
      return { voice, hash: hit.hash, cached: true, bytes: hit.bytes };
    }
  }

  if (stats.dryRun) {
    stats.planned++;
    return { voice, hash: ttsTextHash(text), cached: false, dryRun: true };
  }

  const audio = await synthesize(text, voice, lang);
  if (!audio?.length) {
    stats.failed++;
    return null;
  }

  const written = writeCache(voice, text, audio);
  stats.generated++;
  stats.bytes += written.bytes;
  return { voice: written.voice, hash: written.hash, cached: false, bytes: written.bytes };
}

async function prettsLevel(lang, level, opts) {
  const bank = loadBank(lang, level);
  const passages = horenPassagesFromBank(bank);
  const stats = { generated: 0, skipped: 0, failed: 0, planned: 0, bytes: 0, dryRun: opts.dryRun, force: opts.force };
  const manifest = {
    lang,
    level,
    provider: process.env.TTS_PROVIDER || 'none',
    generatedAt: new Date().toISOString(),
    passages: [],
  };

  for (const passage of passages) {
    const entry = {
      passageId: passage.id,
      title: passage.title || '',
      multiVoice: ListeningScript.isMultiVoice(passage.text),
      segments: [],
    };

    if (entry.multiVoice) {
      const segments = ListeningScript.prepare(passage.text, lang);
      for (const seg of segments) {
        const voice = resolveVoiceId(seg.voice, lang);
        const result = await synthSegment(seg.text, voice, lang, stats);
        if (result) {
          entry.segments.push({
            speaker: seg.speaker,
            voice: result.voice,
            hash: result.hash,
            bytes: result.bytes,
            cached: result.cached,
            preview: seg.text.slice(0, 80),
          });
        }
      }
    } else {
      const voice = defaultVoiceForLang(lang);
      const result = await synthSegment(passage.text, voice, lang, stats);
      if (result) {
        entry.segments.push({
          speaker: 'Narrator',
          voice: result.voice,
          hash: result.hash,
          bytes: result.bytes,
          cached: result.cached,
          preview: passage.text.slice(0, 80),
        });
      }
    }

    if (entry.segments.length) manifest.passages.push(entry);
  }

  if (!opts.dryRun && manifest.passages.length) {
    fs.mkdirSync(path.dirname(manifestPath(lang, level)), { recursive: true });
    fs.writeFileSync(manifestPath(lang, level), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }

  console.log(
    `${lang}/${level}: ${passages.length} hören passages — +${stats.generated} new, ${stats.skipped} cached, ${stats.failed} failed` +
      (opts.dryRun ? ` (${stats.planned} planned)` : '') +
      (stats.bytes ? `, ${Math.round(stats.bytes / 1024)} KB` : ''),
  );

  return stats;
}

const args = parseArgs(process.argv.slice(2));

if (!args.dryRun && !isProviderConfigured()) {
  console.error('TTS provider not configured. Set TTS_PROVIDER=stub (dev) or TTS_PROVIDER=elevenlabs + ELEVENLABS_API_KEY');
  process.exit(1);
}

fs.mkdirSync(cacheDir(), { recursive: true });

const targets = args.all ? DEFAULT_TARGETS : [[args.lang, args.level]];
let totalFailed = 0;

for (const [lang, level] of targets) {
  try {
    const stats = await prettsLevel(lang, level, args);
    if (stats.failed > 0 && stats.generated === 0 && stats.skipped === 0) totalFailed++;
  } catch (err) {
    console.error(`FAIL ${lang}/${level}:`, err.message);
    totalFailed++;
  }
}

console.log(`\nCache: library/tts-cache/`);
if (totalFailed) process.exit(1);
