#!/usr/bin/env node
/**
 * Full pool-verified Hören T3 R/F chrono audit + reorder (char-evidence v1).
 *
 * Manual overrides for semantic collisions (007) and false tag-hit (002 Q6).
 *
 *   node scripts/reorder-horen-t3-pool-char-chrono-2026-07-12.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BALANCE_MCQ_VERSION } from './lib/balanceMcq.mjs';
import {
  HOREN_RF_CHRONO_EVIDENCE_VERSION,
  HOREN_RF_CHRONO_FORBIDDEN_METRIC,
  evidenceCharPos,
  reorderRfByCharEvidence,
  verifyRfChronoByCharPos,
} from './lib/horenRfChronoEvidence.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');

/**
 * Semantic manual overrides — only where auto-locator collides or misfires.
 * Positions are char offsets in passages[0].text (verified by reading dialogue).
 */
const MANUAL = {
  'horen-t3-gemini-002.json': {
    // Auto: tag "Stress" hits inside "gestresst" @53. Real advice is late.
    'gen-q-h3-fa55fa95-6': {
      pos: 1143,
      needle: 'in Ruhe reden, wenn der Stress vorbei ist',
      why: 'Anna rät zum Gespräch wenn Stress vorbei — not opening gestresst',
    },
  },
  'horen-t3-gemini-012.json': {
    // Auto: tag «Wohnung»@140 for q1/q2/q6 — phrase order is strictly monotonic.
    'gen-q-h3-b68e1086-1': {
      pos: 229,
      needle: 'drei Zimmer, ein Wohnzimmer',
      why: 'Zimmeranzahl — not early «Wohnung»@140',
    },
    'gen-q-h3-b68e1086-2': {
      pos: 436,
      needle: 'ein Bisschen schon, aber es lohnt sich',
      why: 'Miete höher — not «Wohnung»@140',
    },
    'gen-q-h3-b68e1086-3': {
      pos: 485,
      needle: 'Der Vermieter ist auch sehr nett',
      why: 'Vermieter positiv — not Schlafzimmer@262',
    },
    'gen-q-h3-b68e1086-6': {
      pos: 993,
      needle: 'Das war dir doch immer so wichtig',
      why: 'Balkon wichtig — not «Wohnung»@140',
    },
  },
  'horen-t3-gemini-007.json': {
    // Collision @368 bodensee: tip vs alone-visit
    'gen-q-h3-v2b8-3': {
      pos: 327,
      needle: 'Mein Kollege hat mir den Tipp gegeben',
      why: 'Empfehlung vom Kollegen — first Bodensee tip turn',
    },
    'gen-q-h3-v2b8-4': {
      pos: 638,
      needle: 'mit meiner Freundin dort',
      why: 'Felix nicht allein — Freundin, not first Bodensee mention',
    },
    // Collision @833 unterkunft: booking-tonight vs Felix-help
    'gen-q-h3-v2b8-7': {
      pos: 1179,
      needle: 'heute Abend direkt online',
      why: 'Buchung heute Abend online — not earlier Unterkunft speculation',
    },
    'gen-q-h3-v2b8-6': {
      pos: 1274,
      needle: 'Wenn du Hilfe brauchst',
      why: 'Felix offers help — after Sarah commits to search tonight',
    },
  },
};

const report = {
  generatedAt: new Date().toISOString(),
  balanceMcq: BALANCE_MCQ_VERSION,
  chronoEvidence: HOREN_RF_CHRONO_EVIDENCE_VERSION,
  forbiddenMetric: HOREN_RF_CHRONO_FORBIDDEN_METRIC,
  note:
    'Pool-wide Hören T3 chrono. Manual char overrides where auto-anchors collide.',
  poolCount: 0,
  files: [],
  manualReasoning: {
    'horen-t3-gemini-007.json': [
      'Q1 (…-1): gestresst @~71 — Felix bemerkt Stress; Sarah bestätigt Job.',
      'Q2 (…-2): konkreten Plan / Nicht wirklich @~262 — noch keine feste Planung.',
      'Q3 (…-3): Kollege-Tipp @327 — Empfehlung Bodensee (NO compartir ancla Bodensee@368 con Q4).',
      'Q4 (…-4): Freundin @638 — Felix no estuvo solo; evidencia es acompañante, no la palabra Bodensee.',
      'Q5 (…-5): wandern @998 — quiere actividad deportiva.',
      'Q7 (…-7): heute Abend online @1179 — reserva esta noche (NO Unterkunft@833).',
      'Q6 (…-6): Hilfe brauchst @1274 — oferta de ayuda de Felix (NO Unterkunft@833).',
      'Orden semántico: 1→2→3→4→5→7→6',
    ],
    'horen-t3-gemini-002.json': [
      'Q6 (…-6): auto ancló tag Stress dentro de gestresst@53; diálogo real: in Ruhe…Stress vorbei @1143.',
      'Resto: quotes/substr OK; auto-reorder tras override → 2,3,4,7,5,6,1',
    ],
    'horen-t3-gemini-004.json': [
      'Sin colisión: Q5 Museumsbesucher@971 y Q6 unveröffentlichte@821 son quotes correctas pero Q5/Q6 estaban invertidas en el array.',
      'Auto-reorder basta: 1,2,3,4,6,5,7',
    ],
  },
};

function applyManual(batch, fileBase) {
  const map = MANUAL[fileBase];
  if (!map) return [];
  const applied = [];
  for (const q of batch.questions || []) {
    const ov = map[q.id];
    if (!ov) continue;
    q._rfChronoManualCharPos = ov.pos;
    q._rfChronoManualNeedle = ov.needle;
    q._rfChronoManualWhy = ov.why;
    applied.push({ id: q.id, ...ov });
  }
  return applied;
}

const files = fs
  .readdirSync(POOL)
  .filter((f) => f.startsWith('horen-t3-') && f.endsWith('.json'))
  .sort();
report.poolCount = files.length;

for (const fileBase of files) {
  const fp = path.join(POOL, fileBase);
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const text = batch.passages?.[0]?.text || '';
  const beforeAuto = (batch.questions || []).map((q) => {
    const e = evidenceCharPos(
      { ...q, _rfChronoManualCharPos: undefined },
      text,
    );
    return { id: q.id, pos: e.pos, via: e.via, needle: e.needle };
  });
  const applied = applyManual(batch, fileBase);
  const beforeVerify = verifyRfChronoByCharPos(batch);
  const chrono = reorderRfByCharEvidence(batch);
  const afterVerify = verifyRfChronoByCharPos(batch);
  const needsWrite =
    chrono.changed || applied.length > 0 || !batch._rfChronoEvidenceVersion;
  if (needsWrite) {
    batch._rfChronoRestoredAt = new Date().toISOString();
    batch._rfChronoEvidenceVersion = HOREN_RF_CHRONO_EVIDENCE_VERSION;
    batch._balanceMcqVersion = BALANCE_MCQ_VERSION;
    if (applied.length) {
      batch._rfChronoManualOverrides = applied.map((a) => ({
        id: a.id,
        pos: a.pos,
        needle: a.needle,
        why: a.why,
      }));
    }
    fs.writeFileSync(fp, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  }
  const entry = {
    file: fileBase,
    topic: batch.passages?.[0]?.topicTag || '',
    wrote: needsWrite,
    chronoChanged: chrono.changed,
    manualApplied: applied,
    beforeAutoPos: beforeAuto.map((r) => r.pos),
    beforePos: beforeVerify.positions,
    afterPos: afterVerify.positions,
    beforeIds: chrono.before.length ? chrono.before : beforeAuto.map((r) => r.id),
    afterIds: chrono.after.length ? chrono.after : beforeAuto.map((r) => r.id),
    beforeMono: beforeVerify.ok,
    afterMono: afterVerify.ok,
    collisionsBefore: (() => {
      const m = new Map();
      for (const r of beforeAuto) {
        if (!m.has(r.pos)) m.set(r.pos, []);
        m.get(r.pos).push(r.id);
      }
      return [...m.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([pos, ids]) => ({ pos, ids }));
    })(),
  };
  report.files.push(entry);
  console.log(
    fileBase,
    'changed=',
    chrono.changed,
    'manual=',
    applied.length,
    'after',
    JSON.stringify(afterVerify.positions),
    'mono',
    afterVerify.ok,
  );
}

const out = path.join(
  ROOT,
  'batches/ready/gate-logs/horen-t3-pool-char-chrono-2026-07-12.json',
);
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('wrote', out);
console.log(
  'ALL_MONO',
  report.files.every((f) => f.afterMono),
  'count',
  report.poolCount,
);
