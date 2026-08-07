#!/usr/bin/env node
/**
 * Layout smoke + static preview for Hören T2 activity grid (A mobile / B desktop).
 *   node scripts/test-horen-picture-grid-layout.mjs
 * Open batches/ready/gate-logs/horen-picture-grid-preview.html in browser and resize at 720px.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf8');

const checks = [
  ['2-col desktop grid', /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(css)],
  ['mobile 1-col', /@media\(max-width:720px\)[\s\S]*?\.horen-picture-grid\{grid-template-columns:1fr/.test(css)],
  ['desktop column stack', /\.horen-picture-item\{display:flex;flex-direction:column/.test(css)],
  ['mobile row layout', /@media\(max-width:720px\)[\s\S]*?\.horen-picture-item\{flex-direction:row/.test(css)],
  ['data-activity-key in runner', fs.readFileSync(path.join(ROOT, 'js/ui/exam/examRunner.js'), 'utf8').includes('data-activity-key')],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(ok ? '  ✅' : '  ❌', label);
  if (!ok) failed++;
}

const activities = [
  { key: 'a', icon: '🚴‍♂️', label: 'Fahrrad fahren' },
  { key: 'b', icon: '🇩🇪', label: 'Deutschkurs' },
  { key: 'c', icon: '👫', label: 'Freunde treffen' },
  { key: 'd', icon: '🏋️‍♀️', label: 'Sport machen' },
  { key: 'e', icon: '🏛️', label: 'Museum' },
  { key: 'f', icon: '🎬', label: 'Kino' },
  { key: 'g', icon: '📚', label: 'Lernen' },
  { key: 'h', icon: '🛒', label: 'Einkaufen' },
  { key: 'i', icon: '🍳', label: 'Kochen' },
];

function bankHtml() {
  let h = `<aside class="horen-picture-bank"><div class="horen-picture-header">Aktivitäten a bis i</div><div class="horen-picture-grid">`;
  for (const p of activities) {
    h += `<div class="horen-picture-item" data-activity-key="${p.key}"><span class="pt-letter-pill horen-picture-key">${p.key}</span><span class="horen-picture-icon">${p.icon}</span><span class="horen-picture-label">${p.label}</span></div>`;
  }
  return h + '</div></aside>';
}

const preview = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hören T2 grid preview</title>
<link rel="stylesheet" href="../../../assets/css/app.css?v=31">
<style>
  body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#f1f5f9;color:#0f172a}
  h1{font-size:18px;margin:0 0 8px}
  p{font-size:13px;color:#64748b;margin:0 0 16px;max-width:720px;line-height:1.5}
  .panels{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
  .panel{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;box-sizing:border-box}
  .panel h2{font-size:13px;margin:0 0 10px;color:#475569}
  .desktop{width:820px;max-width:100%}
  .mobile{width:375px;max-width:100%;border:2px solid #94a3b8}
  /* Simula <720px dentro del panel móvil (viewport sigue siendo ancho) */
  .panel.mobile .horen-picture-grid{grid-template-columns:1fr!important;gap:10px!important}
  .panel.mobile .horen-picture-item{flex-direction:row!important;align-items:center!important;text-align:left!important;gap:12px!important;padding:12px 14px!important;border-radius:8px!important}
  .panel.mobile .horen-picture-key{min-width:36px!important;padding:4px 10px!important;font-size:12px!important}
  .panel.mobile .horen-picture-icon{font-size:1.5rem!important}
  .panel.mobile .horen-picture-label{flex:1!important;min-width:0!important;font-size:13px!important;line-height:1.5!important;text-align:left!important}
  .checklist{margin-top:20px;font-size:13px;line-height:1.6}
  .checklist li{margin-bottom:6px}
</style></head><body>
<h1>Hören T2 — grilla de actividades (preview)</h1>
<p>Panel izquierdo ≈ desktop (≥721px, 2 columnas). Panel derecho ≈ móvil (&lt;721px). Comprobá que cada fila/celda muestra la letra <strong>a–i</strong> de forma destacada.</p>
<div class="panels">
  <div class="panel desktop"><h2>Desktop (820px) — Propuesta B</h2>${bankHtml()}</div>
  <div class="panel mobile"><h2>Mobile (375px) — Propuesta A</h2>${bankHtml()}</div>
</div>
<ul class="checklist">
  <li>Desktop: 2×5 celdas, letra centrada arriba en pill, emoji, label debajo.</li>
  <li>Móvil: 9 filas, letra a la izquierda, emoji, label con line-height amplio.</li>
  <li>Las 9 letras deben coincidir con los botones a–i de las preguntas 11–15.</li>
</ul>
</body></html>`;

const outDir = path.join(ROOT, 'batches/ready/gate-logs');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'horen-picture-grid-preview.html');
fs.writeFileSync(outPath, preview, 'utf8');
console.log('\nPreview:', outPath);
console.log('Open in browser; resize window across 720px to verify breakpoint.');

if (failed) process.exit(1);
console.log('\nAll layout checks passed.');
