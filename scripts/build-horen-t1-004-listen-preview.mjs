/**
 * One-shot: listen preview for horen-t1-gemini-004 (runtime TTS path evidence).
 * Source of truth = passages[].text (same as T2). Does not invent audio[].
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(ROOT, 'batches/ready/horen-t1-staging-2026-07-11/horen-t1-gemini-004.json');
const outDir = path.dirname(src);
const b = JSON.parse(fs.readFileSync(src, 'utf8'));

const segments = (b.passages || []).map((p, i) => ({
  n: i + 1,
  id: p.id,
  title: p.title || `Aufnahme ${i + 1}`,
  text: String(p.text || '').trim(),
  words: String(p.text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length,
}));

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const meta = {
  source: path.relative(ROOT, src).replace(/\\/g, '/'),
  note:
    'Runtime TTS source of truth = passages[].text (same as Hören T2). audio[] is NOT used by examRunner playHorenPart / resolveListeningContext.',
  verdict: 'FALSE_BLOCKER_audio_not_required_for_T1',
  playableSegments: segments.length,
  segments,
};

const jsonOut = path.join(outDir, 'horen-t1-gemini-004.listen-preview.json');
fs.writeFileSync(jsonOut, JSON.stringify(meta, null, 2));

const cards = segments
  .map(
    (s) => `
<section class="seg">
  <h2>Aufnahme ${s.n}: ${esc(s.title)}</h2>
  <p class="meta">${s.words} Wörter · id=${esc(s.id)} · fuente: passages[].text</p>
  <p class="txt">${esc(s.text)}</p>
  <button type="button" onclick="speak(this,${s.n - 1})">Play (browser TTS)</button>
  <button type="button" onclick="stop()">Stop</button>
</section>`,
  )
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Hören T1-004 listen preview</title>
<style>
body{font-family:Georgia,serif;max-width:720px;margin:24px auto;padding:0 16px;line-height:1.45;color:#1a1a1a;background:#f7f4ef}
h1{font-size:1.4rem;margin-bottom:4px}
.banner{background:#e8f5e9;border:1px solid #a5d6a7;padding:12px 14px;border-radius:8px;margin:12px 0 20px;font-size:0.95rem}
.seg{border-top:1px solid #ddd;padding:16px 0}
h2{font-size:1.1rem;margin:0 0 6px}
.meta{font-size:0.8rem;color:#666;margin:0 0 8px}
.txt{background:#fff;border:1px solid #e0dcd4;padding:12px;border-radius:6px}
button{margin:8px 8px 0 0;padding:8px 14px;font-size:0.95rem;cursor:pointer}
.playing{outline:2px solid #2e7d32}
code{font-family:Consolas,monospace;font-size:0.9em}
</style>
</head>
<body>
<h1>Hören T1 · gemini-004 — listen preview</h1>
<p>Misma fuente que el runtime: <code>passages[].text</code> → <code>segment.transcript</code> → TTS. No usa <code>audio[]</code>.</p>
<div class="banner"><b>Diagnóstico:</b> falso bloqueador de auditoría. T1 es monólogo; T3 guarda <code>audio[]</code> como metadata de turnos multi-voz en el batch, y el runner tampoco lo lee (parsea el transcript).</div>
${cards}
<script>
const TEXTS=${JSON.stringify(segments.map((s) => s.text))};
function stop(){
  if(window.speechSynthesis) speechSynthesis.cancel();
  document.querySelectorAll('.seg').forEach((el)=>el.classList.remove('playing'));
}
function speak(btn,i){
  stop();
  const text=TEXTS[i];
  if(!window.speechSynthesis){ alert('speechSynthesis no disponible'); return; }
  btn.closest('.seg').classList.add('playing');
  const u=new SpeechSynthesisUtterance(text);
  u.lang='de-DE';
  const voices=speechSynthesis.getVoices();
  const de=voices.find((v)=>/de(-|_|$)/i.test(v.lang));
  if(de) u.voice=de;
  u.onend=()=>btn.closest('.seg').classList.remove('playing');
  speechSynthesis.speak(u);
}
speechSynthesis.getVoices();
</script>
</body>
</html>
`;

const htmlOut = path.join(outDir, 'horen-t1-gemini-004.listen-preview.html');
fs.writeFileSync(htmlOut, html);
console.log(
  JSON.stringify(
    {
      jsonOut: path.relative(ROOT, jsonOut).replace(/\\/g, '/'),
      htmlOut: path.relative(ROOT, htmlOut).replace(/\\/g, '/'),
      segments: segments.length,
      words: segments.map((s) => s.words),
      hasAudioInSource: (b.passages || []).some((p) => Array.isArray(p.audio) && p.audio.length),
    },
    null,
    2,
  ),
);
