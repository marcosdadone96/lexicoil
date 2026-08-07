#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const auditPath =
  process.argv[2] || path.join(ROOT, 'batches/ready/gate-logs/a2-pool-verified-audit-final.json');
let raw = fs.readFileSync(auditPath, 'utf8');
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
const j = JSON.parse(raw);
const dir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const all = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

const byFile = {};
for (const f of j.findings || []) {
  if (!byFile[f.file]) byFile[f.file] = { imp: [], min: [] };
  if (f.severity === 'IMPORTANT') byFile[f.file].imp.push(f.id);
  else if (f.severity === 'MINOR') byFile[f.file].min.push(f.id);
}

function status(file) {
  if (j.fileGroups.clean.includes(file)) return 'limpio';
  if (j.fileGroups.important.includes(file)) return 'important_pendiente';
  if (j.fileGroups.cosmeticOnly.includes(file)) return 'cosmetico_ok';
  return 'revisar';
}

function action(file, st) {
  if (st === 'limpio' || st === 'cosmetico_ok') return 'servir (reparado det.)';
  if (file.startsWith('lesen-t2-cur')) return 'IA: CHK-28 MCQ (~$0.12/parte)';
  if (file === 'lesen-t4-cur-education.json') return 'IA/regen: CHK-27 tema (~$0.25) o swap seed';
  if (file.includes('lesen-t4-cur')) return 'ignorar CHK-30b (títulos anuncio) + det caps';
  if (file.includes('horen-t2-gemini')) return 'servir; gen nuevo con catálogo (rotación)';
  if (st === 'important_pendiente') return 'IA: CHK-33/18 (~$0.05–0.10)';
  return '—';
}

const lines = ['| Archivo | Estado audit | IMPORTANT (CHK) | Acción |', '|---|---|---|---|'];
for (const file of all) {
  const st = status(file);
  const imp = [...new Set((byFile[file]?.imp || []))].join(', ') || '—';
  lines.push(`| ${file} | ${st} | ${imp} | ${action(file, st)} |`);
}

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-pool-status-table.md');
fs.writeFileSync(
  out,
  `# A2 pool-verified — estado post reparación determinista\n\nAudit: \`${path.basename(auditPath)}\`\n\n${lines.join('\n')}\n`,
);
console.log('Wrote', out);
