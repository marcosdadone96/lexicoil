#!/usr/bin/env node
/**
 * Dump assembled exams to human-readable text (user review E2E).
 *   node scripts/dump-assembled-exams-readable.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'batches/ready/assembled-from-verified');

function optLine(o, i) {
  const letter = String.fromCharCode(97 + i);
  if (typeof o === 'string') {
    const m = o.match(/^([abc])\)\s*(.*)$/i);
    return m ? `${m[1]}) ${m[2]}` : `${letter}) ${o}`;
  }
  if (o && typeof o === 'object') {
    const id = o.id || letter;
    return `${id}) ${o.text || o.label || JSON.stringify(o)}`;
  }
  return `${letter}) ${o}`;
}

function dumpPart(lines, label, part) {
  lines.push('');
  lines.push('═'.repeat(72));
  lines.push(label);
  lines.push('═'.repeat(72));
  if (!part) {
    lines.push('(vacío)');
    return;
  }
  if (part.instruction) {
    lines.push('');
    lines.push(`Instrucción: ${part.instruction}`);
  }
  if (part.task && part.task !== part.instruction) {
    lines.push('');
    lines.push(`Aufgabe: ${part.task}`);
  }

  // Exam-part shapes: passages[], passage, top-level text/transcript
  const passages = [];
  if (Array.isArray(part.passages) && part.passages.length) {
    for (const p of part.passages) passages.push(p);
  } else if (part.passage) {
    passages.push(part.passage);
  } else if (part.text || part.transcript || part.textTitle) {
    passages.push({
      title: part.textTitle || '',
      text: part.text || part.transcript || '',
      transcript: part.transcript || part.text || '',
      audio: part.audio,
      signText: part.signText,
    });
  }

  for (const [pi, p] of passages.entries()) {
    lines.push('');
    lines.push(`--- Text ${pi + 1}${p.title ? `: ${p.title}` : ''} ---`);
    if (p.signText) lines.push(`Schild: ${p.signText}`);
    const text = p.text || p.transcript || '';
    if (text) lines.push(text);
    if (Array.isArray(p.audio) && p.audio.length) {
      lines.push('');
      lines.push('[Audio / Gespräch]');
      for (const turn of p.audio) {
        const who = turn.speaker || turn.role || '';
        lines.push(`${who ? `${who}: ` : ''}${turn.text || ''}`);
      }
    }
  }

  // Lesen T3 Anzeigen
  if (Array.isArray(part.ads) && part.ads.length) {
    lines.push('');
    lines.push('--- Anzeigen (A–J) ---');
    for (const ad of part.ads) {
      const id = ad.id || ad.label || '';
      const body = ad.text || ad.title || ad.body || JSON.stringify(ad);
      lines.push(`${id}: ${body}`);
    }
  }
  if (part.example) {
    lines.push('');
    lines.push(`Beispiel: ${typeof part.example === 'string' ? part.example : JSON.stringify(part.example)}`);
  }

  // Prefer segment questions when present; otherwise top-level questions
  if (Array.isArray(part.segments) && part.segments.length) {
    for (const [si, seg] of part.segments.entries()) {
      lines.push('');
      lines.push(`--- Segment ${si + 1}${seg.label ? `: ${seg.label}` : ''} ---`);
      lines.push(seg.text || seg.transcript || '');
      for (const q of seg.questions || []) dumpQ(lines, q);
    }
  } else {
    for (const q of part.questions || []) dumpQ(lines, q);
  }
}

function dumpQ(lines, q) {
  lines.push('');
  lines.push(`Frage ${q.id || ''} [${q.type || '?'}]${q.segmentLabel ? ` (${q.segmentLabel})` : ''}`);
  if (q.question) lines.push(q.question);
  if (q.signText) lines.push(`Schild: ${q.signText}`);
  if (Array.isArray(q.options) && q.options.length) {
    q.options.forEach((o, i) => lines.push(`  ${optLine(o, i)}`));
  }
  const ans = q.correctAnswer ?? q.correct;
  if (ans != null && ans !== '') lines.push(`  → Antwort (Schlüssel): ${ans}`);
  if (q.explanation) lines.push(`  Erklärung: ${q.explanation}`);
}

function dumpExam(doc, outPath) {
  const lines = [];
  const m = doc._meta || {};
  lines.push(`EXAMEN ${m.examId || ''} · ${doc.lang}/${doc.level}`);
  lines.push(`Generado: ${m.generatedAt || ''}`);
  lines.push(`GATE-1: ${m.gate1?.ok ? 'PASS' : 'FAIL'}`);
  lines.push('');
  lines.push('Fuentes (pool-verified):');
  for (const [k, v] of Object.entries(m.sources || {})) {
    lines.push(`  ${k.padEnd(14)} ${v}`);
  }
  lines.push('');
  lines.push('IDs de partes:');
  for (const [k, v] of Object.entries(m.partIds || {})) {
    lines.push(`  ${k.padEnd(14)} ${v}`);
  }

  const exam = doc.exam || {};
  (exam.lesenParts || []).forEach((p, i) => dumpPart(lines, `LESEN Teil ${i + 1}`, p));
  (exam.horenParts || []).forEach((p, i) => dumpPart(lines, `HÖREN Teil ${i + 1}`, p));
  (exam.schreibenParts || []).forEach((p, i) => dumpPart(lines, `SCHREIBEN Teil ${i + 1}`, p));
  (exam.sprechenParts || []).forEach((p, i) => dumpPart(lines, `SPRECHEN Teil ${i + 1}`, p));

  fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
  return lines.length;
}

const files = fs
  .readdirSync(DIR)
  .filter((f) => /^assembled-exam-b1-verified-e\d+\.json$/.test(f))
  .sort();

const summary = [];
for (const f of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const out = f.replace(/\.json$/i, '-READABLE.txt');
  const n = dumpExam(doc, path.join(DIR, out));
  summary.push({ json: f, readable: out, lines: n, examId: doc._meta?.examId, sources: doc._meta?.sources });
  console.log(`Wrote ${out} (${n} lines)`);
}
fs.writeFileSync(path.join(DIR, 'readable-dump-index.json'), `${JSON.stringify(summary, null, 2)}\n`);
