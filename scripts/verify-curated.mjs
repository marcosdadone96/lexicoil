#!/usr/bin/env node
/**
 * verify-curated.mjs — Gate SEMÁNTICO con IA (lo que el saneador determinista no ve).
 * Verifica questions[] y items[] (Lesen T3 anuncios, T4 foro).
 *
 * REQUIERE ANTHROPIC_API_KEY. Usar CLAUDE_VERIFY_MODEL=claude-sonnet-4-6 (no Haiku).
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateContent } from './lib/claudeClient.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const dir = arg('--dir', '.');
const doDrop = !!arg('--drop', false);
const reportPath = arg('--report', null);
const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.CLAUDE_VERIFY_MODEL || 'claude-sonnet-4-6';

if (!apiKey) { console.error('Falta ANTHROPIC_API_KEY en el entorno.'); process.exit(2); }

const files = fs.readdirSync(dir).filter((f) => f.startsWith('curated') && f.endsWith('.json'));
const report = { checkedQuestions: 0, checkedItems: 0, failed: 0, dropped: 0, calls: 0, details: [] };

function buildPrompt(passage, questions, { kind = 'questions' } = {}) {
  const qs = questions.map((q, i) => {
    const opts = q.options ? ` | Opciones: ${q.options.join(' ')}` : '';
    const stem = q.question || q.statement || q.signText || q.text || '';
    return `${i + 1}. [id:${q.id}] (${q.type || kind}) ${stem}${opts} | MARCADA: ${q.correct ?? q.correctAnswer ?? ''}`;
  }).join('\n');
  const intro = kind === 'items'
    ? 'Verifica cada ítem (matching/foro). Para T3: el anuncio marcado debe encajar con la situación. Para T4: el hablante/opinión marcada debe corresponder al texto del foro.'
    : 'Verifica cada pregunta SOLO contra el texto.';
  return [
    'Eres examinador de alemán (Goethe). ' + intro,
    'Devuelve SOLO un array JSON, un objeto por ítem, en el MISMO orden:',
    '[{"id":"...","answerable":true|false,"keyCorrect":true|false,"reason":"breve"}]',
    '- answerable: ¿se puede responder usando EXCLUSIVAMENTE el texto/contexto?',
    '- keyCorrect: ¿la respuesta MARCADA es la correcta según el texto?',
    '',
    'TEXTO / CONTEXTO:',
    passage || '(sin texto)',
    '',
    'ÍTEMS:',
    qs,
  ].join('\n');
}

function parseArr(text) {
  try { const m = text.match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

function lesenPartContext(p) {
  const bits = [];
  if (p.text) bits.push(p.text);
  if (Array.isArray(p.ads)) {
    for (const a of p.ads) {
      bits.push(typeof a === 'string' ? a : `${a.key || ''}) ${a.text || a.title || ''}`);
    }
  }
  if (p.signText) bits.push(p.signText);
  if (Array.isArray(p.opinions)) {
    for (const o of p.opinions) {
      bits.push(typeof o === 'string' ? o : `${o.speaker || o.key || ''}: ${o.text || o.opinion || ''}`);
    }
  }
  return bits.filter(Boolean).join('\n\n');
}

async function verifyGroup(g) {
  const qs = g.questions || [];
  if (!qs.length) return;
  process.stdout.write(`[${g.idx}/${g.total}] ${g.file.slice(13, 21)} ${g.label} — ${qs.length} ítems... `);
  let verdicts = null;
  try {
    const { text } = await generateContent({
      prompt: buildPrompt(g.passage, qs, { kind: g.kind }),
      apiKey,
      model,
      maxTokens: 900,
    });
    verdicts = parseArr(text);
    report.calls++;
  } catch (err) {
    console.log(`ERROR (${err.message}) -> se conservan`);
    return;
  }
  if (!verdicts) { console.log('respuesta no parseable -> se conservan'); return; }
  const byId = {};
  verdicts.forEach((v) => { if (v && v.id) byId[v.id] = v; });
  let bad = 0;
  const kept = [];
  for (const q of qs) {
    if (g.kind === 'items') report.checkedItems++;
    else report.checkedQuestions++;
    const v = byId[q.id];
    const ok = !v || (v.answerable !== false && v.keyCorrect !== false);
    if (!ok) {
      bad++; report.failed++;
      report.details.push(`${g.file.slice(13, 21)} ${q.id}: answerable=${v.answerable} keyCorrect=${v.keyCorrect} — ${v.reason || ''}`);
      if (doDrop) { report.dropped++; continue; }
    }
    kept.push(q);
  }
  if (doDrop && bad) {
    if (g.field === 'items') g.container.items = kept;
    else g.container.questions = kept;
    g.dirty = true;
  }
  console.log(bad ? `${bad} con problemas` : 'OK');
}

// Recolecta grupos: questions[] y items[]
const groups = [];
let idx = 0;
for (const file of files) {
  const x = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const e = x.exam || x;
  (e.lesenParts || []).forEach((p) => {
    if ((p.questions || []).length) {
      groups.push({
        file, x, passage: p.text || lesenPartContext(p), container: p, field: 'questions',
        questions: p.questions, kind: 'questions', label: `Lesen T${p.teil || '?'}`,
      });
    }
    if ((p.items || []).length) {
      groups.push({
        file, x, passage: lesenPartContext(p), container: p, field: 'items',
        questions: p.items, kind: 'items', label: `Lesen T${p.teil || '?'} items`,
      });
    }
  });
  (e.horenParts || []).forEach((p) => {
    (p.segments || []).forEach((s) => {
      if ((s.questions || []).length) {
        groups.push({
          file, x, passage: s.transcript, container: s, field: 'questions',
          questions: s.questions, kind: 'questions', label: 'Hören segment',
        });
      }
    });
    if ((p.questions || []).length) {
      groups.push({
        file, x, passage: p.transcript, container: p, field: 'questions',
        questions: p.questions, kind: 'questions', label: `Hören T${p.teil || '?'}`,
      });
    }
  });
}
const total = groups.length;
groups.forEach((g, i) => { g.idx = i + 1; g.total = total; });

console.log(`Iniciando verificación: ${files.length} exámenes, ${total} grupos (questions + items).`);
console.log(`Modelo: ${model}. Puede tardar varios minutos.\n`);

const dirty = new Set();
for (const g of groups) {
  await verifyGroup(g);
  if (g.dirty) dirty.add(g.file);
}

if (doDrop) {
  for (const file of dirty) {
    const g = groups.find((x) => x.file === file);
    fs.writeFileSync(path.join(dir, file), JSON.stringify(g.x, null, 2));
  }
}

console.log(`\n=== verify-curated ===`);
console.log(`Llamadas: ${report.calls} | preguntas: ${report.checkedQuestions} | items T3/T4: ${report.checkedItems} | problemas: ${report.failed} | eliminadas: ${report.dropped}`);
if (reportPath) { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); console.log(`Informe: ${reportPath}`); }
else { report.details.slice(0, 25).forEach((d) => console.log('  - ' + d)); }
process.exit(0);
