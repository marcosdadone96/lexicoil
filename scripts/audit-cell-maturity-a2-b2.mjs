#!/usr/bin/env node
/**
 * Offline maturity map (A2/B2 × module × Teil) + static prompt/gate gap scan.
 *
 *   node scripts/audit-cell-maturity-a2-b2.mjs
 *   node scripts/audit-cell-maturity-a2-b2.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLesenStaticCore } from './lib/lesenTemplatePrompt.mjs';
import { buildExamStaticCore } from './lib/examTemplatePrompt.mjs';
import { BLACKLIST } from './blacklist.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsonOut = process.argv.includes('--json');
const LEVELS = ['A2', 'B2'];

const PLANTILLA_DIR = {
  A2: {
    lesen: 'plantillas-lesen-a2',
    horen: 'plantillas-horen-a2',
    schreiben: 'plantillas-schreiben-a2',
    sprechen: 'plantillas-sprechen-a2',
  },
  B2: {
    lesen: 'plantillas-lesen-b2',
    horen: 'plantillas-horen-b2',
    schreiben: 'plantillas-schreiben-b2',
    sprechen: 'plantillas-sprechen-b2',
  },
};

function loadBlueprint(level) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints', `goethe_${level}.json`), 'utf8'));
}

function buildCellGrid() {
  const grid = [];
  for (const level of LEVELS) {
    for (const mod of loadBlueprint(level).modules) {
      for (const part of mod.parts) {
        grid.push({
          level,
          module: mod.id,
          teil: part.teil,
          slotType: part.slotType,
          key: `${level}:${mod.id}:T${part.teil}`,
        });
      }
    }
  }
  return grid;
}

function parseFilenameCell(basename, level) {
  const m = basename.match(/^(lesen|horen|schreiben|sprechen)(?:-t(\d+))?/i);
  if (!m) return null;
  return `${level}:${m[1].toLowerCase()}:T${m[2] ? Number(m[2]) : 1}`;
}

function readPlantilla(level, module, teil) {
  const dir = PLANTILLA_DIR[level]?.[module];
  if (!dir) return null;
  const fp = path.join(ROOT, dir, `${module}-teil${teil}.md`);
  return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
}

function buildStaticPrompt(level, module, teil) {
  if (module === 'lesen') return buildLesenStaticCore(teil, { level });
  return buildExamStaticCore(module, teil, level);
}

function walkJson(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJson(p, acc);
    else if (ent.name.endsWith('.json')) acc.push(p);
  }
  return acc;
}

function scanPoolVerified() {
  const byCell = {};
  for (const level of LEVELS) {
    const dir = path.join(ROOT, 'batches/ready/pool-verified', level);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const key = parseFilenameCell(f, level);
      if (!key) continue;
      if (!byCell[key]) byCell[key] = { gemini: 0, curated: 0, other: 0, samples: [] };
      if (/-cur-/.test(f)) byCell[key].curated++;
      else if (/-gemini-/.test(f)) byCell[key].gemini++;
      else byCell[key].other++;
      if (byCell[key].samples.length < 2) byCell[key].samples.push(f);
    }
  }
  return byCell;
}

function scanRejected() {
  const byCell = {};
  for (const fp of walkJson(path.join(ROOT, 'batches/generated/.rejected'))) {
    const base = path.basename(fp);
    for (const level of LEVELS) {
      const key = parseFilenameCell(base, level);
      if (key) byCell[key] = (byCell[key] || 0) + 1;
    }
  }
  return byCell;
}

function inferLevelFromBatchFile(filePath) {
  if (!filePath || !fs.existsSync(path.join(ROOT, filePath))) return null;
  try {
    const b = JSON.parse(fs.readFileSync(path.join(ROOT, filePath), 'utf8'));
    return b.passages?.[0]?.level || b.questions?.[0]?.level || null;
  } catch {
    return null;
  }
}

function scanGenerationCost() {
  const logPath = path.join(ROOT, 'batches/ready/gate-logs/generation-cost.jsonl');
  const byCell = {};
  if (!fs.existsSync(logPath)) return byCell;
  for (const line of fs.readFileSync(logPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    let level = e.level;
    if (!level && e.file) {
      const mm = String(e.file).match(/\/(A2|B2)\//);
      if (mm) level = mm[1];
      else level = inferLevelFromBatchFile(e.file);
    }
    if (!level || !LEVELS.includes(level)) continue;
    const key = `${level}:${e.module}:T${e.teil ?? 1}`;
    if (!byCell[key]) {
      byCell[key] = { ok: 0, fail: 0, savedOk: 0, usd: 0, failGates: {} };
    }
    byCell[key].usd += Number(e.costUsd) || 0;
    if (e.ok) {
      byCell[key].ok++;
      if (e.file) byCell[key].savedOk++;
    } else {
      byCell[key].fail++;
      const g = e.failGate || '?';
      byCell[key].failGates[g] = (byCell[key].failGates[g] || 0) + 1;
    }
  }
  return byCell;
}

function classifyMaturity(key, pool, cost, rejected) {
  const p = pool[key] || {};
  const c = cost[key] || {};
  const r = rejected[key] || 0;
  const geminiPublished = (p.gemini || 0) > 0;

  let tier;
  if (geminiPublished) tier = 'PUBLISHED_GEMINI';
  else if ((c.ok || 0) > 0 && (c.savedOk || 0) > 0) tier = 'GENERATED_OK_NOT_IN_POOL';
  else if ((c.fail || 0) > 0 || r > 0) tier = 'ATTEMPTED_NEVER_PUBLISHED';
  else if ((p.curated || 0) > 0) tier = 'CURATED_ONLY';
  else tier = 'NEVER_TOUCHED';

  return {
    tier,
    geminiPoolCount: p.gemini || 0,
    curatedPoolCount: p.curated || 0,
    costOk: c.ok || 0,
    costFail: c.fail || 0,
    spendUsd: Math.round((c.usd || 0) * 100) / 100,
    rejectedFiles: r,
    topFailGates: c.failGates || {},
    sampleFiles: p.samples || [],
  };
}

const BLACKLIST_TERMS = BLACKLIST.map((e) => {
  const src = e.term?.source || String(e.term || '');
  const m = src.match(/\\b([^\\]+)\\b/i);
  return m ? m[1] : null;
}).filter(Boolean);

const HIGH_SIGNAL_BLACKLIST = ['workshop', 'implementier', 'evaluier', 'optimier'];

function scanGaps(level, module, teil, slotType) {
  const gaps = [];
  const plantilla = readPlantilla(level, module, teil) || '';
  let staticCore = '';
  try {
    staticCore = buildStaticPrompt(level, module, teil);
  } catch {
    gaps.push({ id: 'NO_STATIC_CORE', severity: 'high', detail: 'No se pudo ensamblar static core del prompt' });
  }
  const combined = `${plantilla}\n${staticCore}`;

  if (!plantilla && level === 'A2') {
    gaps.push({ id: 'NO_PLANTILLA', severity: 'high', detail: 'Sin plantilla .md' });
  }

  // Field consistency
  if (module === 'lesen' && teil === 4 && level === 'A2') {
    if (!/"question"|clave JSON.*question|JSON `\`"question\`"/i.test(combined)) {
      gaps.push({ id: 'FIELD_question', severity: 'high', detail: 'Clave JSON "question" no mandatada' });
    }
    if (!/passages.*title|"title"|titular/i.test(combined)) {
      gaps.push({ id: 'FIELD_passage_title', severity: 'high', detail: 'CHK-29 exige 6 passages[].title ≥3 chars' });
    }
  }

  if (module === 'lesen' && teil === 3 && level === 'A2') {
    if (!/subordinate|Nebensatz|Nebensätze|weil|dass|wenn|≤\s*12|max.*12.*%/i.test(combined)) {
      gaps.push({
        id: 'CEFR_SUBORDINATE_MAX',
        severity: 'high',
        detail: 'Pre-ingest CEFR A2 exige subordinatePct ≤12%; prompt no limita Nebensätze en E-Mail',
      });
    }
    if (!/correct.*correctAnswer|correctAnswer.*correct|misma letra/i.test(combined)) {
      gaps.push({
        id: 'MCQ_CORRECT_SYNC',
        severity: 'high',
        detail: 'balanceMcqGroup exige correct === correctAnswer (letra a/b/c)',
      });
    }
    if (!/a\)\s|b\)\s|c\)\s|opciones.*a\/b\/c|options.*a\)/i.test(combined)) {
      gaps.push({
        id: 'MCQ_OPTION_PREFIX',
        severity: 'high',
        detail: 'Opciones deben usar prefijo «a) …» «b) …» «c) …» (contract balanceMcqGroup)',
      });
    }
  }

  if (module === 'lesen' && [1, 2, 3].includes(teil) && level === 'A2') {
    if (!/explanation.*≥6|≥6 palabras|mindestens 6/i.test(combined)) {
      gaps.push({ id: 'EXPL_MIN_MCQ', severity: 'medium', detail: 'Gate exige explanation ≥6 palabras (MCQ)' });
    }
  }

  if (module === 'lesen' && teil === 2 && level === 'A2') {
    if (!/anderer Stock|anderes Stockwerk|in einem anderen Stock/i.test(combined)) {
      gaps.push({ id: 'GATE_T2_FLOOR', severity: 'high', detail: 'Fórmula oficial Stock/Etage + opción «anderer Stock»' });
    }
    if (!/4\/5|≥4|4 de las 5|mínimo 4/i.test(combined)) {
      gaps.push({ id: 'GATE_T2_FLOOR_4OF5', severity: 'high', detail: 'Gate exige ≥4/5 preguntas Stock/Etage y ≥4/5 «anderer Stock» — prompt debe decir 4/5 explícito' });
    }
    if (!/mcq_distinct|mutuamente excluyente|no solap|CHK-28|jaccard/i.test(combined)) {
      gaps.push({ id: 'GATE_T2_MCQ_DISTINCT', severity: 'high', detail: 'Gate CHK-28 mcq_distinct — prompt sin ejemplo de opciones no solapadas' });
    }
  }

  if (module === 'horen' && level === 'A2') {
    if (!/"audio"|campo.*audio/i.test(combined)) {
      gaps.push({ id: 'FIELD_audio', severity: 'medium', detail: 'TTS gate espera passages[].audio[]' });
    }
  }

  if (module === 'horen' && teil === 4 && level === 'A2') {
    if (!/ja_nein|"Ja"|"Nein"/i.test(combined)) {
      gaps.push({ id: 'FORMAT_ja_nein', severity: 'high', detail: 'Formato oficial 5× ja_nein' });
    }
  }

  if (module === 'schreiben' && level === 'A2') {
    if (!/correct.*rubric|"rubric"/i.test(combined)) {
      gaps.push({ id: 'FIELD_rubric', severity: 'high', detail: 'Gate espera correct:"rubric"' });
    }
    if (teil === 2 && !/Chef/i.test(combined)) {
      gaps.push({ id: 'GATE_chef_keyword', severity: 'high', detail: 'Consigna debe mencionar Chef' });
    }
  }

  // Blacklist communication
  for (const term of HIGH_SIGNAL_BLACKLIST) {
    const inBl = BLACKLIST_TERMS.some((t) => t.toLowerCase() === term);
    if (inBl && !new RegExp(term, 'i').test(combined)) {
      gaps.push({ id: `BLACKLIST_${term}`, severity: 'medium', detail: `Blacklist incluye «${term}» pero prompt no lo prohíbe explícitamente` });
    }
  }

  // Lesen T4 specific remaining gates
  if (module === 'lesen' && teil === 4 && level === 'A2') {
    if (!/topicTag|thema oficial|Gesundheit|Stadtleben|alineación/i.test(combined)) {
      gaps.push({ id: 'TOPIC_per_passage', severity: 'high', detail: 'content_topic gate scorea topicTag por pasaje; prompt no guía alineación léxica' });
    }
    if (!/truncado|termina en \.\!\?|punto final/i.test(combined)) {
      gaps.push({ id: 'TITLE_PUNCTUATION', severity: 'medium', detail: 'Gate rechaza títulos sin .!? — prompt no lo menciona' });
    }
    if (/matching/i.test(combined) && !/matching.*3|minimo.*3.*palabra|≥3 palabra/i.test(combined)) {
      gaps.push({ id: 'EXPL_MATCHING_MIN', severity: 'medium', detail: 'Gate exige ≥3 palabras en explanation matching; riesgo placeholder «Siehe Text»' });
    }
  }

  return {
    hasPlantilla: Boolean(plantilla),
    plantillaPath: plantilla ? `${PLANTILLA_DIR[level]?.[module]}/${module}-teil${teil}.md` : null,
    gapCount: gaps.length,
    highGaps: gaps.filter((g) => g.severity === 'high').length,
    gaps,
  };
}

const grid = buildCellGrid();
const pool = scanPoolVerified();
const cost = scanGenerationCost();
const rejected = scanRejected();

const cells = grid.map((c) => ({
  ...c,
  maturity: classifyMaturity(c.key, pool, cost, rejected),
}));

const a2HighRisk = cells.filter(
  (c) =>
    c.level === 'A2' &&
    c.maturity.tier !== 'PUBLISHED_GEMINI',
);

const gapScans = a2HighRisk
  .map((c) => ({
    key: c.key,
    tier: c.maturity.tier,
    slotType: c.slotType,
    ...scanGaps(c.level, c.module, c.teil, c.slotType),
  }))
  .sort((a, b) => a.highGaps - b.highGaps || a.gapCount - b.gapCount);

const report = {
  generatedAt: new Date().toISOString(),
  note: '4 módulos oficiales Goethe (Lesen/Hören/Schreiben/Sprechen). Sin Grammatik en A2/B2.',
  maturitySummary: Object.fromEntries(
    LEVELS.map((lv) => [
      lv,
      Object.fromEntries(
        ['PUBLISHED_GEMINI', 'GENERATED_OK_NOT_IN_POOL', 'ATTEMPTED_NEVER_PUBLISHED', 'CURATED_ONLY', 'NEVER_TOUCHED'].map(
          (t) => [t, cells.filter((c) => c.level === lv && c.maturity.tier === t).length],
        ),
      ),
    ]),
  ),
  cells,
  a2HighRiskGapScans: gapScans,
  recommendedFirstTargets: gapScans.filter((g) => g.highGaps === 0 && g.gapCount <= 2).map((g) => g.key),
};

const outJson = path.join(ROOT, 'batches/ready/gate-logs/cell-maturity-audit-a2-b2.json');
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));

const outMd = path.join(ROOT, 'batches/ready/gate-logs/CELL-MATURITY-AUDIT-A2-B2.md');

function tierEmoji(t) {
  if (t === 'PUBLISHED_GEMINI') return '✅';
  if (t === 'GENERATED_OK_NOT_IN_POOL') return '🟡';
  if (t === 'CURATED_ONLY') return '📦';
  if (t === 'ATTEMPTED_NEVER_PUBLISHED') return '🔴';
  return '⬜';
}

let md = `# Auditoría de madurez por celda — A2 & B2\n\n`;
md += `Generado: ${report.generatedAt}\n\n`;
md += `> **Definición «publicado Gemini»:** ≥1 archivo \`-gemini-\` en \`batches/ready/pool-verified/{nivel}/\` para esa celda.\n\n`;

for (const lv of LEVELS) {
  md += `## ${lv}\n\n| Módulo | Teil | Tier | Gemini | Curated | Cost OK/Fail | $ | Rechazos |\n`;
  md += `|--------|------|------|--------|---------|--------------|---|----------|\n`;
  for (const c of cells.filter((x) => x.level === lv)) {
    const m = c.maturity;
    md += `| ${c.module} | T${c.teil} | ${tierEmoji(m.tier)} ${m.tier} | ${m.geminiPoolCount} | ${m.curatedPoolCount} | ${m.costOk}/${m.costFail} | ${m.spendUsd} | ${m.rejectedFiles} |\n`;
  }
  md += `\n`;
}

md += `## A2 — Escaneo estático (celdas sin publish Gemini)\n\n`;
for (const g of gapScans) {
  md += `### ${g.key} (${g.tier}) — ${g.gapCount} huecos, ${g.highGaps} críticos\n\n`;
  if (g.plantillaPath) md += `Plantilla: \`${g.plantillaPath}\`\n\n`;
  if (!g.gaps.length) md += `- Sin huecos obvios en plantilla + static core\n\n`;
  else {
    for (const gap of g.gaps) md += `- **[${gap.severity}] ${gap.id}:** ${gap.detail}\n`;
    md += `\n`;
  }
}

md += `## Recomendación pre-generación\n\n`;
md += `Priorizar celdas con **0 huecos críticos** y pipeline ya probado en celdas hermanas:\n\n`;
if (report.recommendedFirstTargets.length) {
  for (const k of report.recommendedFirstTargets) md += `- \`${k}\`\n`;
} else {
  md += `- Ninguna celda A2 de alto riesgo queda sin huecos críticos tras el escaneo.\n`;
  md += `- **Mejor candidato relativo:** \`A2:lesen:T2\` o \`A2:lesen:T3\` (solo huecos medios; plantillas maduras).\n`;
  md += `- **Evitar hasta fixes:** \`A2:lesen:T4\` (content_topic + explanation + títulos).\n`;
}

fs.writeFileSync(outMd, md);

if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n=== MAPA DE MADUREZ ===\n`);
  console.log(`A2:`, report.maturitySummary.A2);
  console.log(`B2:`, report.maturitySummary.B2);
  console.log(`\nInforme: ${outMd}`);
  console.log(`JSON:    ${outJson}\n`);
  for (const g of gapScans) {
    console.log(`${g.key} [${g.tier}] — ${g.gapCount} huecos (${g.highGaps} críticos)`);
  }
}
