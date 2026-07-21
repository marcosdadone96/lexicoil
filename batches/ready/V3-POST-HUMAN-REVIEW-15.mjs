#!/usr/bin/env node
/**
 * Post-v3.0-stable validation vs human review (15 generated batches).
 * Read-only: no code/rule changes, no file writes to generated/.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../../scripts/lib/loadEnv.mjs';
import { collectStringsFromBatch, runPosCapsBulk } from '../../scripts/lib/germanCapsGate.mjs';
import {
  applyGermanCapsNormalize,
  GERMAN_CAPS_NORMALIZE_VERSION,
  collectLesenTextFields,
} from '../../scripts/lib/germanCapsNormalize.mjs';

const GATE = 'v6.1-B-G2 (frozen)';
const GENERATED_DIR = path.join(ROOT, 'batches/generated');
const OUT_JSON = path.join(ROOT, 'batches/ready/V3-POST-HUMAN-REVIEW-15.json');
const OUT_MD = path.join(ROOT, 'batches/ready/V3-POST-HUMAN-REVIEW-15.md');
const V3_CUTOFF = new Date('2026-07-08T14:00:00.000Z');

const FILES = selectLast15();

/** Human-review checklist (from Claude audit) */
const HUMAN_FINDINGS = [
  { id: 'dup-t1-177', file: 'lesen-t1-gemini-177.json', category: 'duplicación', desc: 'Duplicado exacto "Mein Hobby im Theaterverein"', component: 'generador/plantilla' },
  { id: 'dup-t2-091', file: 'lesen-t2-gemini-091.json', category: 'duplicación', desc: 'Duplicado exacto "Familienzeit am Wochenende"', component: 'generador/plantilla' },
  { id: 'dup-t3-pair', files: ['lesen-t3-auto-qeh7ew.json', 'lesen-t3-auto-tz7n7y.json'], category: 'duplicación', desc: 'Mismo set 7 preguntas Emma/piano plantilla auto', component: 'plantilla t3-auto' },
  { id: 't2-092-wichtiger', file: 'lesen-t2-gemini-092.json', category: 'adj_over_cap', pattern: /ein Wichtiger Schritt/i, fieldHint: 'passages', desc: 'ein Wichtiger Schritt', component: 'generador' },
  { id: 't2-092-naechste', file: 'lesen-t2-gemini-092.json', category: 'adj_over_cap', pattern: /das Nächste Fest/i, fieldHint: 'passages', desc: 'das Nächste Fest', component: 'generador' },
  { id: 't2-092-alter', file: 'lesen-t2-gemini-092.json', category: 'adj_over_cap', pattern: /ein Alter Industriebau/i, fieldHint: 'explanation', desc: 'ein Alter Industriebau', component: 'generador' },
  { id: 't2-092-breite', file: 'lesen-t2-gemini-092.json', category: 'adj_over_cap', pattern: /eine Breite Teilnahme/i, fieldHint: 'explanation', desc: 'eine Breite Teilnahme', component: 'generador' },
  { id: 't2-093-taeglich', file: 'lesen-t2-gemini-093.json', category: 'adj_over_cap', pattern: /den Täglichen Weg/i, fieldHint: 'passages', desc: 'den Täglichen Weg', component: 'generador' },
  { id: 't2-093-letzten', file: 'lesen-t2-gemini-093.json', category: 'adj_over_cap', pattern: /in den Letzten fünf Jahren/i, fieldHint: 'passages|explanation', desc: 'in den Letzten fünf Jahren', component: 'generador' },
  { id: 't2-093-naechsten', file: 'lesen-t2-gemini-093.json', category: 'adj_over_cap', pattern: /in den Nächsten drei Jahren/i, fieldHint: 'explanation', desc: 'in den Nächsten drei Jahren', component: 'generador' },
  { id: 't2-093-sportlich', file: 'lesen-t2-gemini-093.json', category: 'adj_over_cap', pattern: /Sportlichen Aktivitäten/i, fieldHint: 'passages|question', desc: 'Sportlichen Aktivitäten', component: 'generador' },
  { id: 't2-091-wichtig', file: 'lesen-t2-gemini-091.json', category: 'adj_over_cap', pattern: /Wichtige Rolle|Wichtiger Bestandteil/i, fieldHint: 'passages|question', desc: 'Wichtige Rolle / Wichtiger Bestandteil', component: 'generador' },
  { id: 't3-kleine-emma', files: ['lesen-t3-auto-qeh7ew.json', 'lesen-t3-auto-tz7n7y.json'], category: 'adj_over_cap', pattern: /Die Kleine Emma/i, fieldHint: 'questions', desc: 'Die Kleine Emma', component: 'generador' },
  { id: 't4-036-wichtiger', file: 'lesen-t4-gemini-036.json', category: 'adj_over_cap', pattern: /ein Wichtiger Schritt/i, fieldHint: 'signText', desc: 'ein Wichtiger Schritt (Clara)', component: 'generador' },
  { id: 't4-037-missing', file: 'lesen-t4-gemini-037.json', category: 'substantiv_missing_cap', pattern: /etwas wichtiges/i, fieldHint: 'signText|explanation', desc: 'etwas wichtiges (falta Wichtiges)', component: 'generador' },
  { id: 't4-037-over', file: 'lesen-t4-gemini-037.json', category: 'adj_over_cap', pattern: /die Kleinen (Läden|Geschäfte)/i, fieldHint: 'signText', desc: 'die Kleinen Läden/Geschäfte', component: 'generador' },
  { id: 't5-063-sentence', file: 'lesen-t5-gemini-063.json', category: 'sentence_start_lowercase', pattern: /\*\*[^*]+:\*\* persönliche Gegenstände/i, fieldHint: 'passages', desc: 'Inicio oración minúscula tras encabezado (persönliche Gegenstände)', component: 'plantilla t5-reglamento' },
  { id: 't5-065-sentence', file: 'lesen-t5-gemini-065.json', category: 'sentence_start_lowercase', pattern: /\*\*[^*]+:\*\* persönliche Daten/i, fieldHint: 'passages', desc: 'Inicio oración minúscula tras encabezado (persönliche Daten)', component: 'plantilla t5-reglamento' },
  { id: 't5-067-freien', file: 'lesen-t5-gemini-067.json', category: 'adj_over_cap', pattern: /den Freien Verkehr/i, fieldHint: 'passages', desc: 'den Freien Verkehr', component: 'generador' },
  { id: 't5-067-aehnlich', file: 'lesen-t5-gemini-067.json', category: 'adj_over_cap', pattern: /Ähnlichen Fortbewegungsmitteln|Ähnliche Fortbewegungsmittel/i, fieldHint: 'passages|explanation', desc: 'Ähnlichen/Ähnliche Fortbewegungsmittel', component: 'generador' },
];

function selectLast15() {
  return fs.readdirSync(GENERATED_DIR)
    .filter((f) => /^lesen-t\d.*\.json$/i.test(f))
    .map((f) => ({ file: f, abs: path.join(GENERATED_DIR, f), mtime: fs.statSync(path.join(GENERATED_DIR, f)).mtimeMs }))
    .filter((x) => x.mtime < V3_CUTOFF.getTime())
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 15);
}

function hash(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

function allTextJoined(batch) {
  return collectLesenTextFields(batch).map((f) => f.value).join('\n');
}

function scanPatterns(batch, patterns) {
  const hits = [];
  for (const f of collectLesenTextFields(batch)) {
    for (const p of patterns) {
      const re = p.pattern instanceof RegExp ? p.pattern : new RegExp(p.pattern, 'gi');
      if (re.test(f.value)) {
        hits.push({ ...p, field: f.path, snippet: extractSnippet(f.value, re) });
      }
    }
  }
  return hits;
}

function extractSnippet(text, re) {
  const m = text.match(re);
  if (!m) return '';
  const idx = text.indexOf(m[0]);
  const start = Math.max(0, idx - 40);
  return `…${text.slice(start, idx + m[0].length + 40)}…`;
}

function t3CanonicalSignature(batch) {
  const qs = (batch.questions || []).map((q) => q.question || '').sort();
  const ads = new Set();
  (batch.passages || []).forEach((p) => (p.ads || []).forEach((a) => ads.add(a)));
  return hash([...qs].join('|') + '::' + [...ads].sort().join('|'));
}

function passageFingerprint(batch) {
  return (batch.passages || []).map((p) => hash((p.title || '') + '::' + (p.text || '')));
}

function detectDuplicates(fileData) {
  const dups = [];
  const byPassage = new Map();
  const byT3 = new Map();
  const byTitleText = new Map();

  for (const { file, raw } of fileData) {
    for (const fp of passageFingerprint(raw)) {
      if (!byPassage.has(fp)) byPassage.set(fp, []);
      byPassage.get(fp).push(file);
    }
    const titleKey = (raw.passages || []).map((p) => p.title).join('||');
    if (titleKey) {
      if (!byTitleText.has(titleKey)) byTitleText.set(titleKey, []);
      byTitleText.get(titleKey).push(file);
    }
    const teil = raw.passages?.[0]?.teil;
    if (teil === 3) {
      const sig = t3CanonicalSignature(raw);
      if (!byT3.has(sig)) byT3.set(sig, []);
      byT3.get(sig).push(file);
    }
  }

  for (const [fp, files] of byPassage) {
    if (files.length > 1) dups.push({ type: 'passage_text_hash', files: [...new Set(files)], fingerprint: fp });
  }
  for (const [sig, files] of byT3) {
    if (files.length > 1) dups.push({ type: 't3_question_set', files: [...new Set(files)], signature: sig });
  }
  for (const [title, files] of byTitleText) {
    const uniq = [...new Set(files)];
    if (uniq.length > 1) dups.push({ type: 'passage_titles', files: uniq, titles: title });
  }
  return dups;
}

function classifyPostV3(beforeHit, afterHit, normalizeChanges, gateRemoved, gateAdded) {
  if (!beforeHit && !afterHit) return { status: 'no_issue', note: 'No detectado en raw ni post-v3' };
  if (beforeHit && !afterHit) return { status: 'fixed_by_v3', note: 'Corregido por normalizador' };
  if (!beforeHit && afterHit) return { status: 'introduced_by_v3', note: 'Introducido por normalizador (regresión)' };
  // still present
  const relatedChange = normalizeChanges.find((c) =>
    beforeHit.snippet?.includes(c.tokenFrom) || afterHit.snippet?.includes(c.tokenTo));
  if (relatedChange) return { status: 'partial_or_reverted', note: `Cambio neto: ${relatedChange.tokenFrom}→${relatedChange.tokenTo}` };
  const gateFix = gateRemoved.some((f) => beforeHit.snippet?.includes(f.word));
  if (gateFix) return { status: 'gate_only', note: 'Gate eliminó finding pero texto humano aún ve error' };
  return { status: 'persists', note: 'Persiste tras v3 — fuera de alcance normalizador' };
}

function proposeFix(finding, status) {
  const cat = finding.category;
  if (cat === 'duplicación') {
    return 'Diversidad en prompt t3-auto / dedup en ingest; rechazar si signature ya existe en pool';
  }
  if (cat === 'sentence_start_lowercase') {
    return 'Post-proceso sentence-start tras `**Header:**` en pipeline o regla en prompt t5 plantilla reglamento';
  }
  if (cat === 'substantiv_missing_cap') {
    if (status === 'fixed_by_v3') return 'Ya cubierto por capitalizeNouns; asegurar que pipeline prod aplica full normalize';
    return 'Ampliar sustantivadores (etwas/nichts/viel) en capitalizeNouns + verificar orden decap→cap';
  }
  if (cat === 'adj_over_cap') {
    if (status === 'fixed_by_v3') return 'OK en v3; verificar despliegue en prod';
    if (status === 'persists') {
      if (/Kleinen/.test(finding.desc)) return 'Gate pide minúscula pero es sustantivación (Kleine Läden); revisar regla gate vs normalize';
      if (/Ähnlich/.test(finding.desc)) return 'Añadir ähnlich a heurística adj o lista homograph; o regla comparativo+Artikel';
      return 'Ampliar ADJ_NEEDS_ARTICLE_GUARD / heurística adj en capitalizeNouns (evidencia G2)';
    }
  }
  return 'Revisar prompt generador para consistencia caps';
}

function diffNormalizeChanges(before, after) {
  const changes = [];
  const fields = collectLesenTextFields(after);
  const beforeMap = new Map(collectLesenTextFields(before).map((f) => [f.path, f.value]));
  for (const f of fields) {
    const b = beforeMap.get(f.path);
    if (b && b !== f.value) {
      const tokenRe = /[A-Za-zÄÖÜäöüß]+/g;
      const bt = b.match(tokenRe) || [];
      const at = f.value.match(tokenRe) || [];
      if (bt.length === at.length) {
        for (let i = 0; i < bt.length; i++) {
          if (bt[i] !== at[i]) changes.push({ path: f.path, tokenFrom: bt[i], tokenTo: at[i] });
        }
      } else {
        changes.push({ path: f.path, tokenFrom: '(rewrite)', tokenTo: '(rewrite)' });
      }
    }
  }
  return changes;
}

function runGate(batch, file) {
  const items = collectStringsFromBatch(batch).map((f, i) => ({
    id: `${file}::${i}`, file, field: f.field, text: f.text,
  }));
  const bulk = runPosCapsBulk(items, { timeoutMs: 300_000 });
  return bulk.findings || [];
}

function teilFromFile(file) {
  const m = file.match(/lesen-t(\d)/i);
  return m ? Number(m[1]) : 0;
}

async function main() {
  const fileData = FILES.map(({ file, abs }) => ({
    file,
    raw: JSON.parse(fs.readFileSync(abs, 'utf8')),
  }));

  const duplicates = detectDuplicates(fileData);

  const checklistResults = [];
  const perFile = [];
  let totalBeforeGate = 0;
  let totalAfterGate = 0;

  for (const { file, raw } of fileData) {
    const { batch: normalized } = applyGermanCapsNormalize(raw);
    const normChanges = diffNormalizeChanges(raw, normalized);
    const beforeGate = runGate(raw, file);
    const afterGate = runGate(normalized, file);
    totalBeforeGate += beforeGate.length;
    totalAfterGate += afterGate.length;

    const gateRemoved = beforeGate.filter(
      (b) => !afterGate.some((a) => a.word === b.word && a.reason === b.reason && a.field === b.field),
    );
    const gateAdded = afterGate.filter(
      (a) => !beforeGate.some((b) => b.word === a.word && b.reason === b.reason && b.field === b.field),
    );

    perFile.push({
      file,
      teil: teilFromFile(file),
      normChanges,
      beforeGate: beforeGate.length,
      afterGate: afterGate.length,
      gateRemoved,
      gateAdded,
    });
  }

  for (const hf of HUMAN_FINDINGS) {
    const targetFiles = hf.files || [hf.file];
    for (const file of targetFiles) {
      const entry = fileData.find((d) => d.file === file);
      if (!entry) continue;
      const { batch: normalized } = applyGermanCapsNormalize(entry.raw);
      const patterns = hf.pattern ? [hf] : [];
      const beforeHits = patterns.length ? scanPatterns(entry.raw, patterns) : [];
      const afterHits = patterns.length ? scanPatterns(normalized, patterns) : [];
      const pf = perFile.find((p) => p.file === file) || { normChanges: [], gateRemoved: [], gateAdded: [] };

      if (hf.category === 'duplicación') {
        const dup = duplicates.find((d) => d.files.includes(file));
        checklistResults.push({
          ...hf,
          file,
          status: dup ? 'persists' : 'unclear',
          postV3: dup ? 'Duplicación confirmada programáticamente' : 'No cruzada con otros del lote',
          component: hf.component,
          fixProposal: proposeFix(hf, 'persists'),
        });
        continue;
      }

      const beforeHit = beforeHits[0];
      const afterHit = afterHits[0];
      const post = classifyPostV3(beforeHit, afterHit, pf.normChanges, pf.gateRemoved, pf.gateAdded);
      checklistResults.push({
        id: hf.id,
        file,
        category: hf.category,
        desc: hf.desc,
        before: beforeHit ? { field: beforeHit.field, snippet: beforeHit.snippet } : null,
        after: afterHit ? { field: afterHit.field, snippet: afterHit.snippet } : null,
        status: post.status,
        postV3Note: post.note,
        component: assignComponent(hf, post.status),
        fixProposal: proposeFix(hf, post.status),
      });
    }
  }

  const byStatus = countBy(checklistResults.filter((r) => r.category !== 'duplicación'), (r) => r.status);
  const byTeil = {};
  for (const r of checklistResults) {
    const t = teilFromFile(r.file);
    if (!byTeil[t]) byTeil[t] = { total: 0, persists: 0, fixed: 0 };
    byTeil[t].total++;
    if (r.status === 'persists' || r.status === 'partial_or_reverted') byTeil[t].persists++;
    if (r.status === 'fixed_by_v3') byTeil[t].fixed++;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    normalizeVersion: GERMAN_CAPS_NORMALIZE_VERSION,
    gateVersion: GATE,
    files: FILES.map((f) => f.file),
    gateSummary: { before: totalBeforeGate, after: totalAfterGate, delta: totalAfterGate - totalBeforeGate },
    duplicates,
    humanChecklist: checklistResults,
    byStatus,
    byTeil,
    perFile,
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(OUT_MD, renderMd(report), 'utf8');
  console.log(`Report: ${OUT_MD}`);
  console.log(`Gate: ${totalBeforeGate} → ${totalAfterGate}`);
  console.log(`Human issues fixed by v3: ${byStatus.fixed_by_v3 || 0}, persist: ${byStatus.persists || 0}`);
}

function assignComponent(hf, status) {
  if (status === 'fixed_by_v3') return 'normalizador (OK v3)';
  if (status === 'introduced_by_v3') return 'normalizador (regresión)';
  if (hf.category === 'duplicación') return hf.component;
  if (hf.category === 'sentence_start_lowercase') return 'plantilla t5-reglamento + generador';
  if (status === 'persists' && hf.category === 'substantiv_missing_cap') return 'normalizador (gap)';
  if (status === 'persists' && /Kleinen/.test(hf.desc)) return 'auditor/gate (ambigüedad sustantivación)';
  if (status === 'persists') return 'generador (prompt)';
  return hf.component || 'generador';
}

function countBy(arr, fn) {
  const m = {};
  for (const x of arr) m[fn(x)] = (m[fn(x)] || 0) + 1;
  return m;
}

function renderMd(r) {
  const lines = [
    '# v3.0-stable vs revisión humana — 15 generados',
    '',
    `**Normalización:** \`${r.normalizeVersion}\` (simulada post-generación)`,
    `**Gate:** ${r.gateVersion}`,
    `**Fecha:** ${r.generatedAt}`,
    '',
    '## Resumen ejecutivo',
    '',
    `| Métrica | Valor |`,
    `|---|---|`,
    `| Findings gate (raw) | ${r.gateSummary.before} |`,
    `| Findings gate (post-v3) | ${r.gateSummary.after} |`,
    `| Δ gate | ${r.gateSummary.delta} |`,
    `| Issues humanos → corregidos por v3 | ${r.byStatus.fixed_by_v3 || 0} |`,
    `| Issues humanos → persisten | ${r.byStatus.persists || 0} |`,
    `| Issues humanos → parcial/revertido | ${r.byStatus.partial_or_reverted || 0} |`,
    `| Regresiones v3 | ${r.byStatus.introduced_by_v3 || 0} |`,
    `| Grupos duplicación detectados | ${r.duplicates.length} |`,
    '',
    '## 1. Duplicación de contenido',
    '',
    r.duplicates.length
      ? r.duplicates.map((d) => `- **${d.type}:** ${d.files.map((f) => `\`${f}\``).join(', ')}`).join('\n')
      : '_Sin duplicados detectados por hash._',
    '',
    '**Confirmación revisión humana:** 4/15 archivos con contenido no nuevo (177, 091, qeh7ew↔tz7n7y). Causa: plantilla fija t3-auto + reutilización gemini sin diversidad.',
    '',
    '## 2. Errores de capitalización — checklist humano vs post-v3',
    '',
    '| archivo | error | categoría | antes | después v3 | estado | componente | fix propuesto |',
    '|---|---|---|---|---|---|---|---|',
    ...r.humanChecklist
      .filter((x) => x.category !== 'duplicación')
      .map((x) => {
        const bef = x.before ? `\`${x.before.snippet?.slice(0, 50)}\`` : '—';
        const aft = x.after ? `\`${x.after.snippet?.slice(0, 50)}\`` : '—';
        return `| \`${x.file}\` | ${x.desc} | ${x.category} | ${bef} | ${aft} | **${x.status}** | ${x.component} | ${x.fixProposal} |`;
      }),
    '',
    '## 3. Patrones por Teil',
    '',
    '| Teil | issues checklist | corregidos v3 | persisten |',
    '|---:|---:|---:|---:|',
    ...Object.entries(r.byTeil).sort((a, b) => a[0] - b[0]).map(([t, v]) => `| ${t} | ${v.total} | ${v.fixed} | ${v.persists} |`),
    '',
    '### Interpretación por componente',
    '',
    '| Componente | Rol en este lote |',
    '|---|---|',
    '| **Prompt generador** | Inconsistencia bidireccional caps (sobra Y falta); adj capitalizados en texto/explicaciones/signText |',
    '| **Plantilla fija** | t3-auto recicla 7 preguntas; t5-reglamento repite patrón `**Header:**` + minúscula inicial |',
    '| **Normalizador v3** | Corrige subset adj-over-cap (p.ej. Freien→freien); no toca inicio oración ni todos los adj |',
    '| **Auditor (gate)** | Detecta 7 casos ambiguos; no corrige; a veces discrepa con criterio humano (Kleinen) |',
    '',
    '## 4. Ejemplos detallados',
    '',
    ...r.humanChecklist
      .filter((x) => x.before || x.after)
      .slice(0, 12)
      .map((x) => `### \`${x.file}\` — ${x.desc}\n- **Estado:** ${x.status}\n- **Antes:** ${x.before?.snippet || '—'}\n- **Post-v3:** ${x.after?.snippet || '— (corregido)'}\n- **Componente:** ${x.component}\n- **Fix:** ${x.fixProposal}`),
    '',
    '## 5. Propuestas de fix (sin implementar)',
    '',
    '1. **t3-auto dedup:** rechazar ingest si `t3CanonicalSignature` ya existe en pool activo.',
    '2. **t5 sentence-start:** regla post-gen `/: \\p{Ll}/` → capitalizar tras `**Sección:**` (fuera de germanCapsNormalize o capa nueva).',
    '3. **Sustantivación etwas/nichts:** verificar que `capitalizeBatchNouns` corre en prod tras decap; ampliar triggers si persiste.',
    '4. **Adj tras artículo:** extender cobertura a Letzten/Nächsten/Sportlichen/Täglichen (misma familia que G2).',
    '5. **Kleinen Läden:** resolver ambigüedad gate (sustantivación) vs normalize (decap adj) con criterio documentado.',
    '6. **Ähnliche/Ähnlichen:** añadir a heurística solo con evidencia (comparativo + noun phrase).',
    '',
    `JSON: \`V3-POST-HUMAN-REVIEW-15.json\``,
  ];
  return `${lines.join('\n')}\n`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
