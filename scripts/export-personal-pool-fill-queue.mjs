#!/usr/bin/env node
/**
 * Cola operador Fase C — una fila = 1 parte a generar/publicar hasta launch min (3/celda).
 *
 * Run:
 *   node scripts/build-pool-stock-manifest.mjs   # opcional, refresca summary
 *   node scripts/export-personal-pool-fill-queue.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const summaryPath = path.join(ROOT, 'library/pool-stock/de_B1-summary.json');
if (!fs.existsSync(summaryPath)) {
  console.error('Missing', summaryPath, '— run: node scripts/build-pool-stock-manifest.mjs');
  process.exit(1);
}
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

const TIER_A = [
  'Umwelt', 'Gesundheit', 'Reisen', 'Arbeit', 'Wohnen', 'Medien',
  'Verkehr', 'Stadtleben', 'Ernährung', 'Freizeit', 'Sport', 'Kultur',
  'Familie', 'Konsum', 'Technik', 'Bildung',
];
const LAUNCH_MIN = 3;

function cellStock(topic, mod, teil) {
  return summary.byTopic?.[topic]?.[mod]?.[String(teil)] ?? 0;
}

/** @type {Array<{topic,module,teil,stock,needTotal,partIndex}>} */
const jobs = [];

for (const topic of TIER_A) {
  for (const teil of [1, 2, 3, 4, 5]) {
    const mod = 'lesen';
    const stock = cellStock(topic, mod, teil);
    const needTotal = Math.max(0, LAUNCH_MIN - stock);
    for (let partIndex = 1; partIndex <= needTotal; partIndex++) {
      jobs.push({ topic, module: mod, teil, stock, needTotal, partIndex });
    }
  }
  for (const teil of [1, 2, 3, 4]) {
    const mod = 'horen';
    const stock = cellStock(topic, mod, teil);
    const needTotal = Math.max(0, LAUNCH_MIN - stock);
    for (let partIndex = 1; partIndex <= needTotal; partIndex++) {
      jobs.push({ topic, module: mod, teil, stock, needTotal, partIndex });
    }
  }
}

jobs.sort((a, b) => {
  if (a.stock !== b.stock) return a.stock - b.stock;
  if (a.needTotal !== b.needTotal) return b.needTotal - a.needTotal;
  const modOrd = (m) => (m === 'lesen' ? 0 : 1);
  if (modOrd(a.module) !== modOrd(b.module)) return modOrd(a.module) - modOrd(b.module);
  if (a.teil !== b.teil) return a.teil - b.teil;
  return a.topic.localeCompare(b.topic, 'de');
});

function cliCommand(job) {
  const cell = `${job.module}-t${job.teil}`;
  return `node scripts/generate-cli.mjs --cell ${cell} --topic "${job.topic}" --count 1 --publish --sync-pool`;
}

const generatedAt = new Date().toISOString();
const jsonOut = path.join(ROOT, 'batches/ready/gate-logs/personal-pool-fill-queue.json');
const mdOut = path.join(ROOT, 'batches/ready/gate-logs/PERSONAL-POOL-FILL-QUEUE.md');

const payload = {
  generatedAt,
  launchMinPerCell: LAUNCH_MIN,
  summarySource: path.relative(ROOT, summaryPath),
  totalParts: jobs.length,
  jobs: jobs.map((j, i) => ({
    seq: i + 1,
    ...j,
    cli: cliCommand(j),
  })),
};

fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
fs.writeFileSync(jsonOut, `${JSON.stringify(payload, null, 2)}\n`);

const byCell = new Map();
for (const j of jobs) {
  const k = `${j.topic}|${j.module}|${j.teil}`;
  if (!byCell.has(k)) byCell.set(k, { ...j, parts: 0 });
  byCell.get(k).parts++;
}

let md = `# Cola operador — pool personal B1 DE (launch min ${LAUNCH_MIN}/celda)

**Generado:** ${generatedAt}  
**Partes totales en cola:** ${jobs.length}  
**Celdas afectadas:** ${byCell.size}  
**Fuente stock:** \`library/pool-stock/de_B1-summary.json\`

Criterio: cada fila = **1 parte** hasta llegar a **≥${LAUNCH_MIN}** partes verificadas por (tema Tier A × módulo × Teil).

## Comando tipo

\`\`\`powershell
node scripts/generate-cli.mjs --cell lesen-t4 --topic "Bildung" --count 1 --publish --sync-pool
\`\`\`

Tras un lote: \`node scripts/build-pool-stock-manifest.mjs\` y regenerar esta cola.

---

## Lista numerada (${jobs.length} partes)

| # | Tema | Módulo | T | Stock | (parte k/n celda) |
|---:|------|--------|---:|------:|-------------------|
`;

for (let i = 0; i < jobs.length; i++) {
  const j = jobs[i];
  md += `| ${i + 1} | ${j.topic} | ${j.module} | ${j.teil} | ${j.stock} | ${j.partIndex}/${j.needTotal} |\n`;
}

md += `\n---\n\n## Detalle con CLI (copiar/pegar)\n\n`;
for (let i = 0; i < jobs.length; i++) {
  const j = jobs[i];
  md += `${i + 1}. **${j.topic}** · ${j.module} T${j.teil} (stock ${j.stock} → +${j.needTotal}, parte ${j.partIndex}/${j.needTotal})\n`;
  md += `   \`\`\`powershell\n   ${cliCommand(j)}\n   \`\`\`\n\n`;
}

md += `## Resumen por celda (${byCell.size})\n\n| Tema | Módulo | T | Stock | Partes a generar |\n|------|--------|---:|------:|-----------------:|\n`;
const cellRows = [...byCell.values()].sort((a, b) => {
  if (a.stock !== b.stock) return a.stock - b.stock;
  return `${a.topic}${a.module}${a.teil}`.localeCompare(`${b.topic}${b.module}${b.teil}`, 'de');
});
for (const c of cellRows) {
  md += `| ${c.topic} | ${c.module} | ${c.teil} | ${c.stock} | ${c.parts} |\n`;
}

fs.writeFileSync(mdOut, md);

console.log(`Wrote ${path.relative(ROOT, mdOut)} (${jobs.length} parts, ${byCell.size} cells)`);
console.log(`Wrote ${path.relative(ROOT, jsonOut)}`);
