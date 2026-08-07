/**
 * UI preview — B2 Sprechen briefing + partner paths.
 * Run: node scripts/lib/__tests__/b2-sprechen-ui-preview.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/b2-sprechen-ui-preview.html');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function loadRuntime(pro) {
  const g = {
    console,
    esc,
    S: { subject: 'de', level: 'B2' },
    SpeakingModes: {
      INPUT_MODES: { TRANSCRIPT: 'transcript', PARTNER: 'partner' },
      personalitiesForLevel: () => [
        { id: 'balanced', label: 'Alex', labelDe: 'Alex', desc: 'Balanced', descDe: 'Ausgewogen', displayName: 'Alex' },
      ],
      personalityById: () => ({ displayName: 'Alex', descDe: 'Partner' }),
    },
    isPaidPlan: () => pro,
    hasAiCreditsFor: () => pro,
    Auth: { isGuest: () => !pro },
    aiCreditCostSuffix: () => ' (4 Credits)',
    renderSpeakingMicHtml: (id) =>
      `<textarea class="write-field" id="${esc(id)}" style="min-height:120px;width:100%"></textarea>`,
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

const ui = { speaking: 'Sprechen', teil: 'Teil', speakFmt: 'Sprich ins Mikrofon.', lang: 'de' };
const pro = loadRuntime(true);

const parts = [1, 2].map((teil) => {
  const batch = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, `batches/ready/pool-verified/B2/sprechen-t${teil}-gemini-019.json`),
      'utf8',
    ),
  );
  const q = batch.questions[0];
  return {
    teil,
    level: 'B2',
    fieldId: `speak_bp_${teil}`,
    title: teil === 1 ? 'Vortrag halten' : 'Diskussion führen',
    situation: q.question,
  };
});

const htmlParts = parts.map((p) => pro.SpeakingFlow.renderGoetheSprechenPart(p, ui));
const css = fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf8');
const body = htmlParts.map((h, i) => `<section class="panel"><h2>B2 Teil ${i + 1}</h2>${h}</section>`).join('');
const page = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"/><title>B2 Sprechen UI</title><style>${css.slice(0, 8000)}</style></head><body>${body}</body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page, 'utf8');
console.log('Wrote', OUT);
for (const [i, h] of htmlParts.entries()) {
  console.log(
    `  T${i + 1}: briefing=${/sprechen-briefing/.test(h)} ai=${/speak-path--ai/.test(h)} solo=${/speak-path--solo/.test(h)}`,
  );
}
