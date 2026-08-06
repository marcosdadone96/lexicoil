/**
 * schreibenT3PremiseDedup.mjs — avoid repeating the same T3 scenario skeleton in the pool.
 * Blocks e.g. «Nachbar leiht Objekt → heute nicht zurückgeben → neuer Termin» clones.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const POOL_DIRS = [
  path.join(ROOT, 'batches/ready/pool-verified'),
  path.join(ROOT, 'batches/generated'),
  path.join(ROOT, 'batches/needs-regeneration'),
];

function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[„“"«»']/g, '')
    .replace(/[^a-z0-9äöüß\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Classify T3 into scenario families for dedup + prompt exclusion. */
export function classifySchreibenT3Scenario(question) {
  const q = fold(question);
  const intro = q.split(/\n/)[0] || q;

  if (
    /(aus)?geliehen|geliehen|ausleihen|leihen/.test(q) &&
    /zuruck(geben|bringen)|nicht zuruck|heute nicht/.test(q)
  ) {
    return 'borrowed_item_return_delay';
  }
  if (/termin absagen|nicht kommen|verschieben|absagen muss|absagen konnen/.test(q)) {
    return 'appointment_cancel_reschedule';
  }
  if (/einladen|einladung|mitkommen|treffen vorschlagen/.test(q)) {
    return 'invitation_proposal';
  }
  if (/bedanken|danke fur/.test(q)) {
    return 'thank_you_note';
  }
  return `free:${intro.slice(0, 120)}`;
}

export function extractSchreibenT3Premise(question) {
  const q = String(question || '');
  const cut = q.split(/\n\n|\n(?=•|\*|- |\d\.)/)[0] || q;
  return fold(cut).slice(0, 160);
}

function loadSchreibenBatchFiles() {
  const files = [];
  for (const dir of POOL_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (/^schreiben.*\.json$/i.test(name)) files.push(path.join(dir, name));
    }
  }
  return files;
}

export function scanSchreibenT3Premises(opts = {}) {
  const self = opts.selfSource ? path.basename(String(opts.selfSource)) : null;
  const byScenario = new Map();
  const byPremise = new Map();

  for (const abs of loadSchreibenBatchFiles()) {
    const file = path.basename(abs);
    if (self && file === self) continue;
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    const q = (batch.questions || []).find((x) => Number(x.teil) === 3);
    if (!q?.question) continue;
    const scenario = classifySchreibenT3Scenario(q.question);
    const premise = extractSchreibenT3Premise(q.question);
    if (!byScenario.has(scenario)) byScenario.set(scenario, []);
    byScenario.get(scenario).push(file);
    if (!byPremise.has(premise)) byPremise.set(premise, []);
    byPremise.get(premise).push(file);
  }
  return { byScenario, byPremise };
}

export function assertSchreibenT3PremiseUnique(batch, opts = {}) {
  const q = (batch?.questions || []).find((x) => Number(x.teil) === 3);
  if (!q?.question) return { ok: true };
  const scenario = classifySchreibenT3Scenario(q.question);
  const premise = extractSchreibenT3Premise(q.question);
  const { byScenario, byPremise } = scanSchreibenT3Premises(opts);

  const scenarioHits = (byScenario.get(scenario) || []).filter(Boolean);
  if (scenarioHits.length) {
    return {
      ok: false,
      issue:
        `Schreiben T3: escenario duplicado «${scenario}» (ya en ${scenarioHits.slice(0, 3).join(', ')}) — varía la situación (no solo objeto/nombre)`,
      scenario,
      files: scenarioHits,
    };
  }

  const premiseHits = (byPremise.get(premise) || []).filter(Boolean);
  if (premiseHits.length) {
    return {
      ok: false,
      issue:
        `Schreiben T3: premisa casi idéntica (ya en ${premiseHits.slice(0, 3).join(', ')})`,
      premise,
      files: premiseHits,
    };
  }

  return { ok: true, scenario, premise };
}

const SCENARIO_LABELS = Object.freeze({
  borrowed_item_return_delay:
    'Objekt ausgeliehen → heute nicht zurückgeben → neuer Termin (evitar repetir)',
  appointment_cancel_reschedule:
    'Termin absagen/verschieben (evitar repetir la misma estructura)',
});

export function buildSchreibenT3PremiseExcludePromptBlock() {
  const { byScenario } = scanSchreibenT3Premises();
  const lines = [];
  for (const [scenario, files] of byScenario.entries()) {
    if (files.length < 1) continue;
    const label = SCENARIO_LABELS[scenario] || scenario;
    lines.push(`- ${label} (pool: ${files.slice(0, 4).join(', ')})`);
  }
  if (!lines.length) return '';
  return (
    `\n\nVARIEDAD TEIL 3 (Schreiben): NO repitas estos escenarios ya usados en el pool — inventa otra situación práctica (Einladung, Bitte, Dank, Info, Absage distinta, etc.):\n` +
    `${lines.join('\n')}\n`
  );
}
