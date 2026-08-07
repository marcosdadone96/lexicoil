/**
 * Visual preview — Sprechen Propuesta A + unified briefing (A2 T1 + B1 T1 Free/Pro).
 * Run: node scripts/lib/__tests__/sprechen-ui-proposal-a-preview.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/sprechen-ui-proposal-a-preview.html');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadRuntime(pro) {
  const g = {
    console,
    esc,
    S: { subject: 'de', level: 'B1' },
    SpeakingModes: {
      INPUT_MODES: { TRANSCRIPT: 'transcript', PARTNER: 'partner', VOICE_LIVE: 'voice_live' },
      REALTIME_PERSONALITIES: [],
      personalitiesForLevel: () => [
        { id: 'warm', label: 'Kim', labelDe: 'Kim', desc: 'Warm', descDe: 'Warm', displayName: 'Kim' },
        { id: 'balanced', label: 'Alex', labelDe: 'Alex', desc: 'Balanced', descDe: 'Ausgewogen', displayName: 'Alex' },
        { id: 'direct', label: 'Leo', labelDe: 'Leo', desc: 'Direct', descDe: 'Direkt', displayName: 'Leo' },
      ],
      personalityById: (id) => ({ displayName: id, descDe: 'Partner', desc: 'Partner' }),
    },
    isPaidPlan: () => pro,
    hasAiCreditsFor: () => pro,
    Auth: { isGuest: () => !pro },
    aiCreditCostSuffix: () => ' (4 Credits)',
    renderSpeakingMicHtml: (id) =>
      `<textarea class="write-field" id="${esc(id)}" placeholder="Mikro / Transkript" style="min-height:120px;width:100%"></textarea>`,
    window: {},
  };
  g.window = g;
  vm.createContext(g);
  for (const f of [
    'js/engine/sprechenBriefing.js',
    'js/ui/exam/speakingConversation.js',
    'js/ui/exam/speakingFlow.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), g);
  }
  return g;
}

const ui = {
  speaking: 'Sprechen',
  teil: 'Teil',
  speakFmt: 'Sprich ins Mikrofon — dein Text erscheint unten.',
  lang: 'de',
  card: 'Karte',
  me: 'Ich:',
};

const a2q = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/ready/pool-verified/A2/sprechen-t1-gemini-016.json'), 'utf8'),
).questions[0];
const b1q = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/ready/pool-verified/B1/sprechen-t1-gemini-004.json'), 'utf8'),
).questions[0];

const css = fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf8');
const cssVars = `:root{--bg:#f8fafc;--bg2:#fff;--bg3:#f1f5f9;--border:#e2e8f0;--text:#0f172a;--text-secondary:#475569;--text-muted:#64748b;--brand:#2563eb;--purple:#7c3aed;--purple-bg:rgba(124,58,237,.12);--radius-lg:12px;--lc-font:system-ui,sans-serif}
body{font-family:var(--lc-font);background:var(--bg);color:var(--text);padding:24px;max-width:720px;margin:0 auto}
.panel{margin-bottom:40px;padding-bottom:32px;border-bottom:2px solid var(--border)}
h2{font-size:16px;margin:0 0 16px}
.btn-sm{padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);font-size:12px;font-weight:700;cursor:pointer}
.btn-sm.accent{background:var(--brand);color:#fff;border-color:var(--brand)}
.module-tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px}
.tag-sprechen{color:#7c3aed}
`;

function partFromQ(q, teil, level) {
  return {
    teil,
    level,
    title: `Teil ${teil}`,
    fieldId: `speak_bp_${teil}`,
    situation: q.question,
    instruction: q.question,
  };
}

const free = loadRuntime(false);
const pro = loadRuntime(true);

const panels = [
  { title: 'A2 — Teil 1 (Free: solo path)', html: free.SpeakingFlow.renderGoetheSprechenPart(partFromQ(a2q, 1, 'A2'), ui) },
  { title: 'B1 — Teil 1 (Free: solo path)', html: free.SpeakingFlow.renderGoetheSprechenPart(partFromQ(b1q, 1, 'B1'), ui) },
  { title: 'B1 — Teil 1 (Pro: AI + solo stacked)', html: pro.SpeakingFlow.renderGoetheSprechenPart(partFromQ(b1q, 1, 'B1'), ui) },
];

const body = panels
  .map((p) => `<section class="panel"><h2>${esc(p.title)}</h2>${p.html}</section>`)
  .join('\n');

const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"/><title>Sprechen UI Propuesta A</title><style>${cssVars}${css}</style></head><body><h1>Sprechen — Propuesta A + briefing unificado</h1>${body}</body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log('Wrote', OUT);
console.log('Checks:');
for (const p of panels) {
  console.log(
    `  ${p.title}: briefing=${/sprechen-briefing/.test(p.html)} ai=${/speak-path--ai/.test(p.html)} solo=${/speak-path--solo/.test(p.html)}`,
  );
}
