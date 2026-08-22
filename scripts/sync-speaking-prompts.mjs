#!/usr/bin/env node
/**
 * sync-speaking-prompts.mjs — rellena el array `speaking` de
 * library/<lang>/<level>/writing-speaking.json a partir de las preguntas del
 * módulo `sprechen` que ya viven en questions.json.
 *
 * PROBLEMA: ContentServable.assessLevel cuenta los prompts de speaking SOLO desde
 * writing-speaking.json. En en/B1 ese array quedó vacío (stub de bootstrap), así que
 * el nivel entero se reporta `servable: false` con "speaking prompts: 0/4" y la app
 * responde "Content is being prepared for this level" — pese a que las preguntas de
 * sprechen sí existen en el banco.
 *
 * ARREGLO: espeja esas preguntas al formato de prompt que espera el gate
 * (library/schemas/writing-speaking.schema.json), como ya está hecho en de/B1.
 * NO genera contenido: solo copia lo que ya está escrito y validado.
 *
 * Uso:  node scripts/sync-speaking-prompts.mjs --lang en --level B1
 *       node scripts/sync-speaking-prompts.mjs --lang en --level B1 --apply
 *       node scripts/sync-speaking-prompts.mjs --lang en --level B1 --apply --force
 *
 * SAFETY: sin --apply hace CERO escrituras. Con `speaking` ya poblado no toca nada
 * salvo que se pase --force.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const LANG = flag('lang', 'en');
const LEVEL = flag('level', 'B1');
const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');

const levelDir = path.join(ROOT, 'library', LANG, LEVEL);
const qPath = path.join(levelDir, 'questions.json');
const wsPath = path.join(levelDir, 'writing-speaking.json');

for (const p of [qPath, wsPath]) {
  if (!fs.existsSync(p)) {
    console.error(`No existe ${path.relative(ROOT, p)}`);
    process.exit(1);
  }
}

const qDoc = JSON.parse(fs.readFileSync(qPath, 'utf8'));
const questions = Array.isArray(qDoc?.questions) ? qDoc.questions : Array.isArray(qDoc) ? qDoc : [];
const ws = JSON.parse(fs.readFileSync(wsPath, 'utf8'));

const isSpeaking = (q) => {
  const mod = String(q?.module || '').toLowerCase();
  if (mod === 'sprechen' || mod === 'speaking') return true;
  return Array.isArray(q?.skills) && q.skills.some((s) => String(s).toLowerCase() === 'speaking');
};

const source = questions.filter(isSpeaking);
if (!source.length) {
  console.error(`Sin preguntas de sprechen en ${path.relative(ROOT, qPath)} — nada que espejar.`);
  process.exit(1);
}

const existing = Array.isArray(ws.speaking) ? ws.speaking : [];
if (existing.length && !FORCE) {
  console.log(`SKIP  ${LANG}/${LEVEL} — speaking ya tiene ${existing.length} prompt(s). Usa --force para regenerar.`);
  process.exit(0);
}

// Orden estable: por teil y luego por id, para que el fichero no baile entre corridas.
source.sort((a, b) => (Number(a.teil || 0) - Number(b.teil || 0)) || String(a.id).localeCompare(String(b.id)));

const seqByTeil = new Map();
const speaking = source.map((q) => {
  const teil = Number(q.teil) || 0;
  const n = (seqByTeil.get(teil) || 0) + 1;
  seqByTeil.set(teil, n);
  const prompt = String(q.prompt || q.question || '').trim();
  const entry = {
    id: n === 1 ? `ws-${LANG}-${LEVEL}-sprechen-t${teil}` : `ws-${LANG}-${LEVEL}-sprechen-t${teil}-${String(n).padStart(2, '0')}`,
    module: 'sprechen',
    teil,
    prompt,
    taskFormat: String(q.taskTypes?.[0] || q.taskFormat || 'open_task'),
    topicTags: Array.isArray(q.topicTags) ? [...q.topicTags] : [],
    sourceQuestionId: q.id,
  };
  return entry;
});

// Validaciones antes de escribir: el esquema exige id/module/prompt no vacíos y unicidad.
const problems = [];
speaking.forEach((s, i) => {
  if (!s.prompt) problems.push(`entrada ${i} (${s.sourceQuestionId}) sin prompt`);
  if (!s.teil) problems.push(`entrada ${i} (${s.sourceQuestionId}) sin teil`);
});
const ids = speaking.map((s) => s.id);
if (new Set(ids).size !== ids.length) problems.push('ids duplicados');
if (problems.length) {
  console.error('FAIL — no se escribe nada:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const byTeil = [...seqByTeil.entries()].sort((a, b) => a[0] - b[0]).map(([t, n]) => `t${t}:${n}`).join(' ');
console.log(`${LANG}/${LEVEL}: ${speaking.length} prompt(s) de speaking  [${byTeil}]`);
console.log(`  writing existente: ${(ws.writing || []).length} (sin tocar)`);
for (const s of speaking.slice(0, 4)) {
  console.log(`  ${s.id}  (${s.taskFormat})  ${s.prompt.slice(0, 68)}${s.prompt.length > 68 ? '…' : ''}`);
}
if (speaking.length > 4) console.log(`  … y ${speaking.length - 4} más`);

if (APPLY) {
  ws.speaking = speaking;
  fs.writeFileSync(wsPath, `${JSON.stringify(ws, null, 2)}\n`, 'utf8');
  console.log(`\nAPLICADO -> ${path.relative(ROOT, wsPath)}`);
} else {
  console.log('\nDRY-RUN: nada escrito. Reejecuta con --apply.');
}
