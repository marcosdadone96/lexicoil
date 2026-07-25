/**
 * Shared blueprint v3 Modellsatz smoke tests — structure, counts, pass rules, no grammatik.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { BLUEPRINT_V3_SPECS } from './blueprint-v3-specs.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function partItems(part) {
  if (typeof part === 'number') return part;
  return part.itemsTotal ?? part.questionsTotal?.min ?? 0;
}

function expectedModuleCounts(spec) {
  const out = {};
  for (const [modId, modSpec] of Object.entries(spec.modules || {})) {
    const counts = (modSpec.parts || []).map(partItems);
    out[modId] = {
      counts,
      total: counts.reduce((s, n) => s + n, 0),
      parts: counts.length,
    };
  }
  return out;
}

/**
 * @param {string} fileId e.g. goethe_A1
 * @param {{ exitOnFail?: boolean }} opts
 */
export function testBlueprintV3(fileId, opts = {}) {
  const spec = BLUEPRINT_V3_SPECS[fileId];
  if (!spec) throw new Error(`unknown blueprint spec: ${fileId}`);

  const file = path.join(ROOT, 'library', 'blueprints', `${fileId}.json`);
  if (!fs.existsSync(file)) throw new Error(`missing blueprint file: ${file}`);

  const bp = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errors = [];
  const ok = (cond, msg) => { if (!cond) errors.push(msg); };

  ok(bp.structureVersion === 3, 'structureVersion 3');
  ok(bp.id === spec.id, `id ${spec.id}`);
  ok(Array.isArray(bp.modules) && bp.modules.length === 4, '4 modules (no grammatik)');
  ok(!bp.modules.some((m) => m.id === 'grammatik' || m.id === 'use_of_english'), 'no grammatik/use_of_english');

  const expected = expectedModuleCounts(spec);
  for (const modId of ['lesen', 'horen', 'schreiben', 'sprechen']) {
    const mod = bp.modules.find((m) => m.id === modId);
    ok(!!mod, `module ${modId} present`);
    if (!mod) continue;
    const counts = (mod.parts || []).map((p) => p.itemsTotal ?? p.questionsTotal?.min);
    const exp = expected[modId];
    ok(counts.length === exp.parts, `${modId} part count ${exp.parts}`);
    for (let i = 0; i < exp.counts.length; i++) {
      ok(counts[i] === exp.counts[i], `${modId} teil ${i + 1}: ${counts[i]} != ${exp.counts[i]}`);
    }
    ok(bp.itemsTotalByModule?.[modId] === exp.total, `${modId} itemsTotalByModule ${exp.total}`);
  }

  if (spec.passRule?.scope === 'cambridge-scale') {
    ok(bp.passRule?.scope === 'cambridge-scale', 'passRule cambridge-scale');
    ok(bp.passRule?.passScale === spec.passRule.passScale, 'passScale');
    ok(bp.modularGrading === false, 'modularGrading false');
    ok(bp.passPercentPerModule == null, 'no passPercentPerModule');
  } else if (spec.passRule?.scope === 'whole-exam-total') {
    ok(bp.passRule?.scope === 'whole-exam-total', 'passRule whole-exam-total');
    ok(bp.passRule?.minTotalPoints === spec.passRule.minTotalPoints, 'minTotalPoints');
    ok(bp.modularGrading === false, 'modularGrading false');
    ok(bp.passPercentPerModule == null, 'no passPercentPerModule');
  } else if (spec.passRule?.scope === 'whole-exam') {
    ok(bp.passRule?.scope === 'whole-exam', 'passRule whole-exam');
    ok(bp.passRule?.writtenMin?.points === spec.passRule.writtenMin?.points, 'writtenMin points');
    ok(bp.passRule?.speakingMin?.points === spec.passRule.speakingMin?.points, 'speakingMin points');
    ok(bp.modularGrading === false, 'modularGrading false');
  } else if (spec.passRule?.scope === 'dele-c2-three-tests') {
    ok(bp.passRule?.scope === 'dele-c2-three-tests', 'passRule dele-c2-three-tests');
    ok(bp.passRule?.minPointsPerTest === 20, 'minPointsPerTest 20');
    ok(bp.passRule?.tests?.length === 3, 'three pruebas');
  } else if (spec.passRule?.scope === 'dele-groups') {
    ok(bp.passRule?.scope === 'dele-groups', 'passRule dele-groups');
    ok(bp.passRule?.grupo1?.minPoints === 30, 'grupo1 min 30');
    ok(bp.passRule?.grupo2?.minPoints === 30, 'grupo2 min 30');
  } else if (spec.modularGrading) {
    ok(bp.passPercentPerModule === 60, 'passPercentPerModule 60');
    ok(bp.modularGrading === true, 'modularGrading true');
  }

  if (spec.verifyPending) {
    console.warn(`WARN ${fileId}: verifyPending — ${spec.notes?.verifyPending || 'needs official confirmation'}`);
  }

  if (errors.length) {
    if (opts.exitOnFail !== false) {
      console.error(`FAIL ${fileId}:`);
      for (const e of errors) console.error('  -', e);
      process.exit(1);
    }
    return { ok: false, errors, fileId };
  }

  console.log(`OK  ${fileId} v3 (${spec.certificate})`);
  return { ok: true, errors: [], fileId };
}

export function testAllBlueprintsV3() {
  let failed = 0;
  for (const fileId of Object.keys(BLUEPRINT_V3_SPECS)) {
    const r = testBlueprintV3(fileId, { exitOnFail: false });
    if (!r.ok) {
      failed += 1;
      console.error(`FAIL ${fileId}:`);
      for (const e of r.errors) console.error('  -', e);
    }
  }
  if (failed) process.exit(1);
  console.log(`\nAll ${Object.keys(BLUEPRINT_V3_SPECS).length} blueprint v3 tests passed.`);
}
