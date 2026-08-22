#!/usr/bin/env node
/**
 * Diagnóstico ElevenLabs: key, suscripción/créditos, modelo y una síntesis de prueba.
 * Uso: node scripts/tts-doctor.mjs
 */
import { loadEnvFile } from './lib/loadEnv.mjs';
loadEnvFile();

const key = (process.env.ELEVENLABS_API_KEY || '').trim();
if (!key) { console.error('ELEVENLABS_API_KEY no está en .env'); process.exit(1); }
const H = { 'xi-api-key': key };

// 1) usuario / créditos
let r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: H });
console.log('subscription:', r.status, r.ok ? '' : await r.text());
if (r.ok) {
  const s = await r.json();
  console.log(`  tier: ${s.tier} | usados: ${s.character_count}/${s.character_limit}`);
}

// 2) modelos disponibles
r = await fetch('https://api.elevenlabs.io/v1/models', { headers: H });
if (r.ok) {
  const models = await r.json();
  console.log('modelos:', models.map((m) => m.model_id).join(', '));
} else console.log('models:', r.status, await r.text());

// 2b) voces disponibles en la cuenta (premade = usables en plan gratis)
r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: H });
if (r.ok) {
  const v = await r.json();
  for (const x of v.voices || []) console.log(`  voz: ${x.voice_id}  ${x.name}  (${x.category}${x.labels?.accent ? ', ' + x.labels.accent : ''})`);
} else console.log('voices:', r.status, (await r.text()).slice(0, 160));

// 3) síntesis de prueba (frase corta, voz EN por defecto del repo)
const voiceId = (process.env.ELEVENLABS_VOICES_EN || 'onwK4e9ZLuTAKqWW03F9').split(',')[0].trim();
const model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
  body: JSON.stringify({ text: 'Hello, this is a test.', model_id: model }),
});
console.log(`synth de prueba (voz ${voiceId}, modelo ${model}):`, r.status, r.ok ? `OK ${(await r.arrayBuffer()).byteLength} bytes` : await r.text());
