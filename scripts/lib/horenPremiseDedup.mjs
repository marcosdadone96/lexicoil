/**
 * horenPremiseDedup.mjs — avoid repeating Hören T1/T2 scenario skeletons in the pool.
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

/** Classify a passage/monologue into scenario families. */
export function classifyHorenScenario(text, teil = 1) {
  const t = fold(text);
  const intro = t.slice(0, 160);

  if (
    /verspatung|verspätung|verspatet|verspätet/.test(t) &&
    /(zug|bahn|regionalzug|ice|re \d|gleis|abfahrt|fahrgast)/.test(t)
  ) {
    return 'train_delay_announcement';
  }
  if (/anrufbeantworter|nach dem signalton|hinterlassen sie eine nachricht/.test(t)) {
    return 'answering_machine';
  }
  if (/liebe zuhörer|wichtiger tipp|radio/.test(t) && Number(teil) === 1) {
    return 'radio_tip';
  }
  if (
    Number(teil) === 2 &&
    (/freizeit gut nutzen/.test(t) ||
      (/heute sprechen wir über/.test(intro) && /freizeit/.test(intro)) ||
      (/herzlich willkommen zu unserem heutigen beitrag/.test(intro) && /freizeit/.test(t)))
  ) {
    return 'freizeit_vortrag_monologue';
  }
  if (Number(teil) === 2 && /herzlich willkommen zu unserem heutigen beitrag/.test(intro)) {
    return 'generic_vortrag_opening';
  }
  if (
    Number(teil) === 2 &&
    /(umweltschutz|schutz unserer umwelt|unsere umwelt)/.test(t) &&
    /(vortrag|heutigen beitrag|bei uns sind|heute sprechen wir)/.test(intro)
  ) {
    return 'umwelt_vortrag_monologue';
  }
  return `free:${intro.slice(0, 100)}`;
}

function loadHorenBatchFiles(teil) {
  const re = new RegExp(`^horen-t${teil}-.*\\.json$`, 'i');
  const files = [];
  for (const dir of POOL_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (re.test(name)) files.push(path.join(dir, name));
    }
  }
  return files;
}

export function scanHorenPremises(teil, opts = {}) {
  const self = opts.selfSource ? path.basename(String(opts.selfSource)) : null;
  const byScenario = new Map();

  for (const abs of loadHorenBatchFiles(teil)) {
    const file = path.basename(abs);
    if (self && file === self) continue;
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    for (const p of batch.passages || []) {
      if (!p?.text) continue;
      const scenario = classifyHorenScenario(p.text, teil);
      if (!byScenario.has(scenario)) byScenario.set(scenario, []);
      byScenario.get(scenario).push({ file, passageId: p.id || '?' });
    }
  }
  return { byScenario };
}

export function assertHorenPremiseUnique(batch, teil, opts = {}) {
  const t = Number(teil);
  const hits = [];
  for (const p of batch?.passages || []) {
    if (!p?.text) continue;
    const scenario = classifyHorenScenario(p.text, t);
    const { byScenario } = scanHorenPremises(t, opts);
    const prev = (byScenario.get(scenario) || []).filter(Boolean);
    if (prev.length) {
      hits.push({
        scenario,
        passageId: p.id || '?',
        files: [...new Set(prev.map((x) => x.file))],
      });
    }
  }
  if (!hits.length) return { ok: true };

  const h = hits[0];
  const label =
    h.scenario === 'train_delay_announcement'
      ? 'Durchsage tren/retraso (Verspätung + Gleis/Zug)'
      : h.scenario === 'freizeit_vortrag_monologue'
        ? 'Monólogo «Freizeit gut nutzen» / Vortrag Freizeit'
        : h.scenario === 'umwelt_vortrag_monologue'
          ? 'Monólogo Vortrag Umweltschutz / Nachhaltigkeit'
          : h.scenario;
  return {
    ok: false,
    issue:
      `Hören T${t}: escenario duplicado «${label}» en ${h.passageId} ` +
      `(ya en ${h.files.slice(0, 3).join(', ')}) — varía situación/apertura/guion`,
    scenario: h.scenario,
    files: h.files,
  };
}

const SCENARIO_LABELS = Object.freeze({
  train_delay_announcement: 'Anuncio tren con retraso + cambio de Gleis (evitar repetir)',
  freizeit_vortrag_monologue: 'Monólogo Vortrag «Freizeit gut nutzen» (evitar repetir)',
  answering_machine: 'Anrufbeantworter genérico (evitar repetir)',
  generic_vortrag_opening: 'Apertura «Herzlich willkommen zu unserem heutigen Beitrag» (variar tema)',
});

export function buildHorenPremiseExcludePromptBlock(teil) {
  const { byScenario } = scanHorenPremises(teil);
  const lines = [];
  for (const [scenario, entries] of byScenario.entries()) {
    if (!entries.length || scenario.startsWith('free:')) continue;
    const label = SCENARIO_LABELS[scenario] || scenario;
    const files = [...new Set(entries.map((e) => e.file))];
    lines.push(`- ${label} (pool: ${files.slice(0, 4).join(', ')})`);
  }
  if (!lines.length) return '';
  return (
    `\n\nVARIEDAD TEIL ${teil} (Hören): NO repitas estos escenarios/guiones ya usados — inventa otra situación B1:\n` +
    `${lines.join('\n')}\n`
  );
}
