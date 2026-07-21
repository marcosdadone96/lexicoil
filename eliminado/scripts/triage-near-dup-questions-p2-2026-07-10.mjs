/**
 * P2: triage near-duplicate questions — question text only (not shared options).
 * Explains audit 5b inflation + classifies remaining real overlaps.
 *
 *   node scripts/triage-near-dup-questions-p2-2026-07-10.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { POOL_VERIFIED_DIR, POOL_CONTENT_OK_LESEN_DIR } from './lib/finalizePoolReady.mjs';

const AUDIT = path.join(ROOT, 'batches/ready/gate-logs/POOL-EXHAUSTIVE-AUDIT-2026-07-10.json');
const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8'));
const auditFiles = audit.full.questionNearDupInternal || [];

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function toks(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-zäöüß\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function stripT3Scaffold(q) {
  return String(q || '')
    .replace(/\b(möchte|will|soll|sucht|möchten|wollen)\b/gi, ' ')
    .replace(/\b(bei|an|für|mit|nach|von|zu|aus|über)\b/gi, ' ')
    .replace(/\b(der|die|das|den|dem|des|ein|eine|einer|einem|einen|eines)\b/gi, ' ')
    .replace(/\b(herr|frau|und|oder|auch|noch|sehr|bitte)\b/gi, ' ')
    .replace(/\b(abgebrochen|ersetzt|gerichtet|lernen|erlernen|suchen|einsteigerkurs|kurs)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentKeyTokens(q) {
  const caps = [...String(q || '').matchAll(/\b[A-ZÄÖÜ][a-zäöüß\-]{2,}\b/g)].map((m) =>
    m[0].toLowerCase(),
  );
  const long = toks(stripT3Scaffold(q)).filter((w) => w.length >= 5);
  return [...new Set([...caps, ...long])];
}

function classifyPair(a, b, meta) {
  const jacFull = jaccard(toks(a), toks(b));
  const ka = contentKeyTokens(a);
  const kb = contentKeyTokens(b);
  const jacContent = ka.length || kb.length ? jaccard(ka, kb) : 0;

  const scaffoldHits = [
    /möchte|will|sucht/i.test(a) && /möchte|will|sucht/i.test(b),
    /abgebrochen|ersetzt|gerichtet|reparier/i.test(a) &&
      /abgebrochen|ersetzt|gerichtet|reparier/i.test(b),
    /lernen|erlernen|kurs|nachhilfe/i.test(a) && /lernen|erlernen|kurs|nachhilfe/i.test(b),
  ].filter(Boolean).length;

  const distinctEntities =
    ka.filter((x) => !kb.includes(x)).length >= 1 && kb.filter((x) => !ka.includes(x)).length >= 1;

  if (jacContent >= 0.72 && jacFull >= 0.85) {
    return {
      class: 'real_near_duplicate',
      reason: `contenido variable muy solapado (contentJ=${jacContent.toFixed(2)})`,
      jacFull,
      jacContent,
    };
  }
  if (jacContent >= 0.85) {
    return {
      class: 'real_near_duplicate',
      reason: `casi misma proposición (contentJ=${jacContent.toFixed(2)})`,
      jacFull,
      jacContent,
    };
  }
  if ((meta.isT3 || scaffoldHits >= 1) && distinctEntities && jacContent < 0.72) {
    return {
      class: 'structural_t3',
      reason: `mismo marco, entidades distintas (contentJ=${jacContent.toFixed(2)})`,
      jacFull,
      jacContent,
    };
  }
  if (distinctEntities && jacContent < 0.55) {
    return {
      class: 'structural_t3',
      reason: `plantilla compartida, contenido distinto (contentJ=${jacContent.toFixed(2)})`,
      jacFull,
      jacContent,
    };
  }
  return {
    class: 'ambiguous',
    reason: `frontera (fullJ=${jacFull.toFixed(2)}, contentJ=${jacContent.toFixed(2)})`,
    jacFull,
    jacContent,
  };
}

function findFile(name) {
  for (const dir of [POOL_VERIFIED_DIR, POOL_CONTENT_OK_LESEN_DIR]) {
    const abs = path.join(dir, name);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function pairsFor(batch, mode) {
  const qs = batch.questions || [];
  const out = [];
  for (let i = 0; i < qs.length; i++) {
    for (let j = i + 1; j < qs.length; j++) {
      let ti;
      let tj;
      if (mode === 'audit_inflated') {
        ti = toks(
          [qs[i].question, qs[i].explanation, ...(qs[i].options || [])].filter(Boolean).join(' '),
        );
        tj = toks(
          [qs[j].question, qs[j].explanation, ...(qs[j].options || [])].filter(Boolean).join(' '),
        );
      } else {
        ti = toks(qs[i].question);
        tj = toks(qs[j].question);
      }
      if (ti.length < 4 || tj.length < 4) continue;
      const jac = jaccard(ti, tj);
      if (jac < 0.85) continue;
      out.push({ i, j, jac, a: qs[i].question, b: qs[j].question });
    }
  }
  return out;
}

// ——— Re-evaluate audit 47 with both metrics ———
let stillInflated = 0;
let questionOnlyHits = 0;
const questionOnlyRows = [];

for (const file of auditFiles) {
  const abs = findFile(file);
  if (!abs) continue;
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const inflated = pairsFor(batch, 'audit_inflated');
  const qOnly = pairsFor(batch, 'question_only');
  if (inflated.length) stillInflated++;
  if (qOnly.length) {
    questionOnlyHits++;
    const isT3 =
      /lesen-t3/i.test(file) || batch.questions?.some((q) => String(q.type).toLowerCase() === 'matching');
    const classified = qOnly.map((p) => ({
      ...p,
      a: String(p.a).slice(0, 120),
      b: String(p.b).slice(0, 120),
      ...classifyPair(p.a, p.b, { isT3 }),
    }));
    const rank = { real_near_duplicate: 2, ambiguous: 1, structural_t3: 0 };
    const worst = classified.reduce((a, b) => (rank[b.class] > rank[a.class] ? b : a));
    questionOnlyRows.push({
      file,
      isT3,
      nPairs: classified.length,
      fileClass: worst.class,
      pairs: classified,
    });
  }
}

// Also scan FULL pool question-only (may find non-audit files)
const fullPoolQOnly = [];
for (const dir of [POOL_VERIFIED_DIR, POOL_CONTENT_OK_LESEN_DIR]) {
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const batch = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const qOnly = pairsFor(batch, 'question_only');
    if (!qOnly.length) continue;
    const isT3 =
      /lesen-t3/i.test(file) || batch.questions?.some((q) => String(q.type).toLowerCase() === 'matching');
    const classified = qOnly.map((p) => ({
      ...p,
      a: String(p.a).slice(0, 120),
      b: String(p.b).slice(0, 120),
      ...classifyPair(p.a, p.b, { isT3 }),
    }));
    const rank = { real_near_duplicate: 2, ambiguous: 1, structural_t3: 0 };
    const worst = classified.reduce((a, b) => (rank[b.class] > rank[a.class] ? b : a));
    fullPoolQOnly.push({
      file,
      isT3,
      nPairs: classified.length,
      fileClass: worst.class,
      pairs: classified,
    });
  }
}

function bucket(rows) {
  return {
    structural_t3: rows.filter((r) => r.fileClass === 'structural_t3'),
    real_near_duplicate: rows.filter((r) => r.fileClass === 'real_near_duplicate'),
    ambiguous: rows.filter((r) => r.fileClass === 'ambiguous'),
  };
}

const from47 = bucket(questionOnlyRows);
const fromAll = bucket(fullPoolQOnly);

function examples(list, n = 8) {
  return list.slice(0, n).map((r) => ({
    file: r.file,
    isT3: r.isT3,
    pair: r.pairs.find((p) => p.class === r.fileClass) || r.pairs[0],
  }));
}

const report = {
  generatedAt: new Date().toISOString(),
  audit5bFiles: auditFiles.length,
  note:
    'Audit 5b included question+explanation+ALL options in Jaccard. Shared T3/Hören option banks inflate similarity. Triage uses question text only.',
  recheckAudit47: {
    stillHitWithInflatedMetric: stillInflated,
    hitWithQuestionOnly: questionOnlyHits,
    countsQuestionOnly: {
      structural_t3: from47.structural_t3.length,
      real_near_duplicate: from47.real_near_duplicate.length,
      ambiguous: from47.ambiguous.length,
    },
  },
  fullPoolQuestionOnly: {
    files: fullPoolQOnly.length,
    counts: {
      structural_t3: fromAll.structural_t3.length,
      real_near_duplicate: fromAll.real_near_duplicate.length,
      ambiguous: fromAll.ambiguous.length,
    },
  },
  examples: {
    structural_t3: examples(fromAll.structural_t3),
    real_near_duplicate: examples(fromAll.real_near_duplicate),
    ambiguous: examples(fromAll.ambiguous),
    // If empty real, show top structural from the original 47 for illustration
    structuralFromOriginal47: examples(from47.structural_t3),
  },
  // For structural illustration when question-only rarely hits 0.85: sample pairs from audit 47 with content classification even if fullJ < 0.85
  structuralIllustrations: [],
};

// Build illustrations: for each of 47, take highest-jac question-only pair and classify
for (const file of auditFiles.slice(0, 47)) {
  const abs = findFile(file);
  if (!abs) continue;
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const qs = batch.questions || [];
  let best = null;
  for (let i = 0; i < qs.length; i++) {
    for (let j = i + 1; j < qs.length; j++) {
      const jac = jaccard(toks(qs[i].question), toks(qs[j].question));
      if (!best || jac > best.jac) {
        best = { i, j, jac, a: qs[i].question, b: qs[j].question };
      }
    }
  }
  if (!best) continue;
  const isT3 =
    /lesen-t3/i.test(file) || qs.some((q) => String(q.type).toLowerCase() === 'matching');
  const cls = classifyPair(best.a, best.b, { isT3 });
  report.structuralIllustrations.push({
    file,
    isT3,
    jacQuestionOnly: Math.round(best.jac * 1000) / 1000,
    ...cls,
    a: String(best.a).slice(0, 120),
    b: String(best.b).slice(0, 120),
  });
}

const illus = {
  structural_t3: report.structuralIllustrations.filter((x) => x.class === 'structural_t3'),
  real_near_duplicate: report.structuralIllustrations.filter((x) => x.class === 'real_near_duplicate'),
  ambiguous: report.structuralIllustrations.filter((x) => x.class === 'ambiguous'),
};

const outJson = path.join(ROOT, 'batches/ready/gate-logs/POOL-NEAR-DUP-P2-TRIAGE-2026-07-10.json');
const outMd = path.join(ROOT, 'batches/ready/gate-logs/POOL-NEAR-DUP-P2-TRIAGE-2026-07-10.md');
fs.writeFileSync(outJson, `${JSON.stringify({ ...report, illustrationCounts: {
  structural_t3: illus.structural_t3.length,
  real_near_duplicate: illus.real_near_duplicate.length,
  ambiguous: illus.ambiguous.length,
}, illustrations: {
  structural_t3: illus.structural_t3.slice(0, 8),
  real_near_duplicate: illus.real_near_duplicate.slice(0, 8),
  ambiguous: illus.ambiguous.slice(0, 8),
} }, null, 2)}\n`);

function block(title, list) {
  const lines = [`### ${title} (mostrados ${list.length})`, ''];
  if (!list.length) return [...lines, '_Ninguno._', ''];
  for (const e of list) {
    lines.push(`- \`${e.file}\` — ${e.reason} (qOnly J=${e.jacQuestionOnly ?? e.pair?.jacFull ?? '?'})`);
    lines.push(`  - A: ${e.a || e.pair?.a}`);
    lines.push(`  - B: ${e.b || e.pair?.b}`);
  }
  lines.push('');
  return lines;
}

const md = [
  '# P2 triage — preguntas casi idénticas (2026-07-10)',
  '',
  '**Sin regeneración.**',
  '',
  '## Hallazgo metodológico (importante)',
  '',
  'El check 5b de la auditoría calculaba Jaccard sobre `question + explanation + options`.',
  'En T3 (y algunos Hören) **todas las preguntas comparten el mismo banco de opciones** →',
  `J≥0.85 artificial. De los **${auditFiles.length}** archivos del audit:`,
  '',
  `| Métrica | N |`,
  `|--------|--:|`,
  `| Siguen “fallando” con métrica inflada (opts incluidas) | ${stillInflated} |`,
  `| Fallan con **solo enunciado** (J≥0.85) | **${questionOnlyHits}** |`,
  '',
  '## Clasificación de los 47 (mejor par por archivo, enunciado solo)',
  '',
  'Aunque pocos alcanzan J≥0.85 sin opciones, se clasifica el **par de mayor solapamiento** de cada archivo:',
  '',
  `| Clase | Archivos (de 47) |`,
  `|-------|-----------------:|`,
  `| Estructural T3 / plantilla | **${illus.structural_t3.length}** |`,
  `| Casi-duplicado real | **${illus.real_near_duplicate.length}** |`,
  `| Ambiguo | **${illus.ambiguous.length}** |`,
  '',
  ...block('Ejemplos estructurales', illus.structural_t3.slice(0, 8)),
  ...block('Ejemplos casi-duplicado real', illus.real_near_duplicate.slice(0, 8)),
  ...block('Ejemplos ambiguos', illus.ambiguous.slice(0, 8)),
  '',
  '## Pool completo — enunciado solo J≥0.85',
  '',
  `| Clase | Archivos |`,
  `|-------|--------:|`,
  `| Estructural | ${fromAll.structural_t3.length} |`,
  `| Real | ${fromAll.real_near_duplicate.length} |`,
  `| Ambiguo | ${fromAll.ambiguous.length} |`,
  `| **Total** | **${fullPoolQOnly.length}** |`,
  '',
  '## Recomendación',
  '',
  '- Los 47 del audit **no justifican regeneración en masa**: la mayoría es solapamiento de plantilla T3 + falso positivo por opciones compartidas.',
  `- Regenerar solo si, tras este triaje, la clase \`real_near_duplicate\` en enunciado-only es >0 y se confirma a ojo (${illus.real_near_duplicate.length} en los 47; ${fromAll.real_near_duplicate.length} en pool completo con umbral 0.85).`,
  '',
  `Datos: \`${path.basename(outJson)}\``,
  '',
];
fs.writeFileSync(outMd, md.join('\n'));
console.log(JSON.stringify({
  audit47: auditFiles.length,
  inflatedStill: stillInflated,
  questionOnlyHitsOn47: questionOnlyHits,
  illustrationCounts: {
    structural_t3: illus.structural_t3.length,
    real_near_duplicate: illus.real_near_duplicate.length,
    ambiguous: illus.ambiguous.length,
  },
  fullPoolQOnly085: {
    total: fullPoolQOnly.length,
    ...Object.fromEntries(Object.entries(fromAll).map(([k, v]) => [k, v.length])),
  },
}, null, 2));
