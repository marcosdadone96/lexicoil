#!/usr/bin/env node
/**
 * audit-curated.mjs — Auditoría estructural COMPLETA de exámenes curated (sin IA).
 *
 * Checks:
 *   T1: count questions[] (target 6); text word count (min 150)
 *   T2: count questions[] (target 6); check both passage IDs represented
 *   T3: detect mixed ad sets across items[]; flag truncated ads; count items[] (target 7)
 *   T4: count items[] (target 7); detect empty signText; detect topic mixing
 *   T5: count questions[] (target 4)
 *   Global: blueprintCoverage vs actual counts; duplicate item IDs across exams
 *
 * Usage:
 *   node scripts/audit-curated.mjs --dir library/curated/de/B1 [--json]
 *   node scripts/audit-curated.mjs --dir library/curated/de/B1 --json > audit-report.json
 */
import fs from 'node:fs';
import path from 'node:path';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const dir = arg('--dir', 'library/curated/de/B1');
const jsonOut = !!arg('--json', false);

const BLUEPRINT = {
  lesen: {
    1: { target: 6, field: 'questions', label: 'Richtig/Falsch' },
    2: { target: 6, field: 'questions', label: 'MCQ 2 Texte' },
    3: { target: 7, field: 'items',     label: 'Matching Anzeigen' },
    4: { target: 7, field: 'items',     label: 'Forum Ja/Nein' },
    5: { target: 4, field: 'questions', label: 'Regeln MCQ' },
  },
};

// Detect dominant ad-set in a T3 options list (each item has options[])
function adSetSignature(options) {
  if (!options || !options.length) return null;
  const text = options.join('|');
  // Use first 60 chars of first option as fingerprint
  return options[0] ? options[0].slice(0, 60) : null;
}

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Derive topic prefix from item id (strip ql_ prefix and suffix namespacing)
function topicPrefix(id) {
  const bare = (id || '').replace(/^ql_/, '').replace(/-[0-9a-f]{8}$/, '');
  // e.g. "de-b1-l-t4-autofrei-q6" → "de-b1-l-t4-autofrei"
  return bare.replace(/-q\d+$/, '');
}

const files = fs.readdirSync(dir).filter((f) => f.startsWith('curated') && f.endsWith('.json'));
if (!files.length) {
  console.error(`No curated_*.json en ${dir}`);
  process.exit(1);
}

const allItemIds = new Set();
const report = { dir, exams: [], summary: { total: 0, issues: 0, critical: 0 } };

for (const file of files) {
  const full = path.join(dir, file);
  const x = JSON.parse(fs.readFileSync(full, 'utf8'));
  const e = x.exam || {};
  const examReport = {
    file,
    topic: x.topic,
    issues: [],
    lesenTeile: {},
  };

  // ── Lesen parts ──────────────────────────────────────────────────────────────
  for (const p of e.lesenParts || []) {
    const t = p.teil;
    const spec = BLUEPRINT.lesen[t];
    if (!spec) continue;

    const items = p[spec.field] || [];
    const actual = items.length;
    const target = spec.target;

    const teilInfo = {
      teil: t,
      label: spec.label,
      expected: target,
      actual,
      ok: actual === target,
      warnings: [],
    };

    if (actual !== target) {
      const severity = actual < target / 2 ? 'CRÍTICO' : 'AVISO';
      examReport.issues.push(`[${severity}] Lesen T${t}: ${actual}/${target} ${spec.field}`);
    }

    // T1: text word count
    if (t === 1) {
      const wc = countWords(p.text);
      teilInfo.textWords = wc;
      if (wc < 150) {
        examReport.issues.push(`[AVISO] Lesen T1: texto corto (${wc} palabras, mín 150)`);
        teilInfo.warnings.push(`texto ${wc} palabras`);
      }
    }

    // T2: check that both passage IDs are represented in questions
    if (t === 2) {
      const passageIds = new Set((items).map((q) => q.passageId).filter(Boolean));
      teilInfo.passages = [...passageIds];
      if (passageIds.size < 2) {
        examReport.issues.push(`[AVISO] Lesen T2: solo ${passageIds.size} pasaje(s) representado(s) en preguntas (se necesitan 2)`);
        teilInfo.warnings.push(`${passageIds.size} pasaje(s) representados`);
      }
    }

    // T3: check ad set consistency
    if (t === 3) {
      const sigs = items.map((item) => adSetSignature(item.options));
      const sigSet = new Set(sigs.filter(Boolean));
      teilInfo.adSets = sigSet.size;
      if (sigSet.size > 1) {
        examReport.issues.push(`[CRÍTICO] Lesen T3: ${sigSet.size} conjuntos de anuncios mezclados — el alumno verá listas distintas por pregunta`);
        teilInfo.warnings.push(`${sigSet.size} ad sets distintos`);
      }
      // Check for truncated ads
      const truncated = items.filter((item) =>
        (item.options || []).some((o) => /[\u2026]|\.{3}\s*$|[^\s]{50,}$/.test(o))
      ).length;
      if (truncated > 0) {
        examReport.issues.push(`[AVISO] Lesen T3: ${truncated} ítem(s) con anuncios truncados`);
        teilInfo.warnings.push(`${truncated} ads truncados`);
      }
    }

    // T4: signText and topic coherence
    if (t === 4) {
      const emptySign = items.filter((item) => !item.signText || item.signText.trim() === '').length;
      if (emptySign > 0) {
        examReport.issues.push(`[CRÍTICO] Lesen T4: ${emptySign} ítem(s) con signText vacío — alumno no puede responder`);
        teilInfo.warnings.push(`${emptySign} sin signText`);
      }
      const prefixes = new Set(items.map((item) => topicPrefix(item.id)));
      teilInfo.topicSets = [...prefixes];
      if (prefixes.size > 1) {
        examReport.issues.push(`[CRÍTICO] Lesen T4: ${prefixes.size} conjuntos de tema mezclados (${[...prefixes].join(', ')})`);
        teilInfo.warnings.push(`${prefixes.size} topic sets`);
      }
    }

    // Duplicate IDs
    for (const item of items) {
      if (item.id) {
        if (allItemIds.has(item.id)) {
          examReport.issues.push(`[AVISO] ID duplicado global: ${item.id}`);
          teilInfo.warnings.push(`dup id ${item.id}`);
        }
        allItemIds.add(item.id);
      }
    }

    // blueprintCoverage claimed vs actual
    const claimed = (e.blueprintCoverage || []).find((c) => c.module === 'lesen' && c.teil === t);
    if (claimed && claimed.filled !== actual && spec.field !== 'items') {
      // Note: blueprintCoverage.filled counts bank items, actual counts assembled items
      teilInfo.blueprintClaimed = claimed.filled;
      teilInfo.warnings.push(`blueprint dice ${claimed.filled} pero JSON tiene ${actual}`);
    }

    examReport.lesenTeile[t] = teilInfo;
  }

  // ── Hören parts (basic count only) ───────────────────────────────────────────
  const horenIssues = [];
  for (const p of e.horenParts || []) {
    const segQs = (p.segments || []).reduce((n, s) => n + (s.questions || []).length, 0);
    const directQs = (p.questions || []).length;
    const total = segQs + directQs;
    if (total === 0) {
      horenIssues.push(`T${p.teil}: 0 preguntas`);
    }
  }
  if (horenIssues.length) {
    examReport.issues.push(`[AVISO] Hören vacío: ${horenIssues.join(', ')}`);
  }

  report.exams.push(examReport);
  report.summary.total++;
  if (examReport.issues.length) report.summary.issues++;
  const critical = examReport.issues.filter((i) => i.includes('[CRÍTICO]')).length;
  if (critical) report.summary.critical++;
}

// ── Output ───────────────────────────────────────────────────────────────────
if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log('\n══════════════════════════════════════════════════════');
console.log(' audit-curated — Informe estructural de exámenes');
console.log(`══════════════════════════════════════════════════════`);
console.log(` Directorio: ${dir}`);
console.log(` Exámenes:   ${report.summary.total}`);
console.log(` Con issues: ${report.summary.issues}`);
console.log(` Críticos:   ${report.summary.critical}`);
console.log('══════════════════════════════════════════════════════\n');

let examIdx = 0;
for (const exam of report.exams) {
  examIdx++;
  const ok = exam.issues.length === 0;
  const critical = exam.issues.filter((i) => i.includes('[CRÍTICO]')).length;
  const badge = ok ? '✅' : critical ? '❌' : '⚠️ ';
  console.log(`${badge} [${examIdx}/${report.summary.total}] ${exam.file}`);
  console.log(`     Topic: ${exam.topic}`);

  // Summary table for Lesen Teile
  const row = Object.values(exam.lesenTeile).map((t) => {
    const s = t.ok ? '✓' : `${t.actual}/${t.expected}`;
    return `T${t.teil}:${s}`;
  }).join('  ');
  if (row) console.log(`     Lesen: ${row}`);

  if (exam.issues.length === 0) {
    console.log(`     Sin problemas detectados.\n`);
  } else {
    for (const issue of exam.issues) {
      const symbol = issue.includes('CRÍTICO') ? '  🔴' : '  🟡';
      console.log(`${symbol} ${issue.replace(/^\[(?:CRÍTICO|AVISO)\] /, '')}`);
    }
    console.log('');
  }
}

console.log('══ Leyenda ══════════════════════════════════════════');
console.log(' 🔴 CRÍTICO — el examen no es fiable para el usuario');
console.log(' 🟡 AVISO   — calidad reducida, revisión recomendada');
console.log(' ✅ OK      — examen pasa todas las verificaciones\n');

const exitCode = report.summary.critical > 0 ? 1 : 0;
process.exit(exitCode);
