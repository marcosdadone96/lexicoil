/**
 * Low-level publish: write published_exam + catalog from one assembled JSON.
 * Callers must run assertAssembledFreshBeforePublish (or equivalent) first.
 *
 * Official CLI entry: publish-verified-exams-local.mjs → publishVerifiedExamSlots.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { ROOT } from './loadEnv.mjs';
import {
  buildPublishedExamDoc,
  capturePublishedParts,
  defaultExamId,
  getBlobStore,
  loadSeedRecords,
  mergeSeedOverlay,
  parseAssembledExamFile,
  summarizePublishedExam,
  upsertPublishedCatalog,
  writePublishedExam,
  officialCellsForLevel,
} from './publishedExamLib.mjs';
import { isExamPublishable } from '../audit-pass-2.mjs';
import { resolveBlueprintForLangLevel } from './examPipeline.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateExamAgainstBlueprint } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintFidelity.js',
));
const { normalizeExamStructure } = require(path.join(
  ROOT,
  'js/engine/validation/normalizeExamStructure.js',
));

const ASM_DIR = path.join(ROOT, 'batches/ready/assembled-from-verified');
const OFFICIAL_ASM_RE = /^assembled-exam-[a-z0-9]+-verified-e\d+\.json$/i;

/** @returns {'official'|'quarantine'|'external'|'other'} */
export function classifyAssembledSourcePath(fromAbs) {
  const abs = path.resolve(fromAbs);
  const rel = path.relative(ASM_DIR, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return 'external';
  if (rel.startsWith(`quarantine${path.sep}`) || rel.includes(`${path.sep}quarantine${path.sep}`)) {
    return 'quarantine';
  }
  if (OFFICIAL_ASM_RE.test(path.basename(abs))) return 'official';
  return 'other';
}

async function confirm(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(`${msg} [y/N] `, resolve));
  rl.close();
  return /^y(es)?$/i.test(String(answer).trim());
}

export function printCapturePreview({ doc, sources, missing }) {
  console.log('\n=== published_exam shape (preview) ===\n');
  const preview = summarizePublishedExam(doc);
  console.log(JSON.stringify(preview, null, 2));

  console.log('\n--- parts: partId + contentHash (full hash in doc) ---\n');
  for (const p of doc.parts) {
    const src = sources[p.cell] || '?';
    console.log(
      `  ${p.cell.padEnd(14)}  ${p.partId}\n` +
        `  ${''.padEnd(14)}  hash=${p.contentHash}  (${src})`,
    );
  }

  if (missing.length) {
    console.log('\n⚠  Missing parts:');
    for (const m of missing) console.log(`    · ${m}`);
  }

  console.log('\n--- example part entry (lesen_3 only, snapshot truncated) ---\n');
  const l3 = doc.parts.find((p) => p.cell === 'lesen_3');
  if (l3) {
    const snapPreview = {
      cell: l3.cell,
      partId: l3.partId,
      contentHash: l3.contentHash,
      snapshot: {
        ...l3.snapshot,
        questions: `[${(l3.snapshot.questions || []).length} questions]`,
        ads: l3.snapshot.ads ? `[${l3.snapshot.ads.length} ads]` : undefined,
      },
    };
    console.log(JSON.stringify(snapPreview, null, 2));
  }
}

/**
 * @param {object} opts
 * @returns {Promise<{ examId: string, slot: number, dryRun: boolean }>}
 */
export async function applyPublishExamFromAssembled(opts) {
  const {
    from,
    examId: examIdArg,
    slot: slotArg,
    title: titleArg,
    lang: langArg,
    level: levelArg,
    dryRun = true,
    yes = false,
    localOnly = false,
    seedOverlay = null,
  } = opts;

  if (!from || !fs.existsSync(from)) {
    throw new Error(`File not found: ${from}`);
  }

  const assembled = parseAssembledExamFile(from);
  const lang = langArg || assembled.lang;
  const level = levelArg || assembled.level;
  const slot = slotArg ?? assembled.slot;
  const examId = examIdArg || defaultExamId(lang, level, slot);
  const title = titleArg || `Official ${level} Exam ${slot}`;

  const rawAssembled = JSON.parse(fs.readFileSync(from, 'utf8'));
  const gate1 = isExamPublishable({ exam: rawAssembled.exam, level }, { expectedLevel: level });
  if (!gate1.ok) {
    const sample = (gate1.blocking || [])
      .slice(0, 3)
      .map((b) => `[${b.id}] ${b.message}`)
      .join('; ');
    throw new Error(
      `GATE-1 BLOCK — ${path.basename(from)}: ${(gate1.blocking || []).length} finding(s) — ${sample}`,
    );
  }

  const blueprint = resolveBlueprintForLangLevel(lang, level);
  if (blueprint && rawAssembled.exam) {
    const normalized = normalizeExamStructure(rawAssembled.exam, { level });
    const fidelity = validateExamAgainstBlueprint(normalized, blueprint, {
      examLabel: `${examId} (pre-publish)`,
    });
    if (!fidelity.ok) {
      const sample = (fidelity.errors || []).slice(0, 4).join('; ');
      throw new Error(
        `GATE-2 FIDELITY — ${path.basename(from)}: ${fidelity.errors.length} issue(s) — ${sample}`,
      );
    }
  }

  const { byId: seedById, source: seedFile } = loadSeedRecords(lang, level);
  let overlayInfo = { merged: 0, source: null };
  if (seedOverlay) {
    overlayInfo = mergeSeedOverlay(seedById, seedOverlay);
  }
  const store = localOnly ? null : await getBlobStore();

  console.log(`\n=== publish-exam ${dryRun ? 'DRY-RUN' : 'APPLY'} ===`);
  console.log(`  from:    ${path.relative(ROOT, from)}`);
  console.log(`  examId:  ${examId}  slot=${slot}`);
  console.log(`  seed:    ${seedFile ? path.relative(ROOT, seedFile) : '(none)'}`);
  if (overlayInfo.source) {
    console.log(
      `  overlay: ${path.relative(ROOT, overlayInfo.source)} (${overlayInfo.merged} records)`,
    );
  }
  console.log(`  store:   ${store ? 'netlify-blobs' : 'local-seed-only'}`);

  const { parts, missing, sources } = await capturePublishedParts(store, {
    lang,
    level,
    partIdMap: assembled.partIds,
    seedById,
  });

  if (missing.length) {
    throw new Error(`missing ${missing.length} part(s): ${missing.join('; ')}`);
  }

  const expectedCells = officialCellsForLevel(level);
  if (parts.length !== expectedCells.length) {
    throw new Error(`Expected ${expectedCells.length} parts, got ${parts.length}`);
  }

  const doc = buildPublishedExamDoc({
    examId,
    lang,
    level,
    title,
    slot,
    parts,
    status: 'live',
    manifestVersion: 1,
    gate1: { ok: gate1.ok, blocking: (gate1.blocking || []).slice(0, 8) },
    sourceAssembled: path.relative(ROOT, from),
  });

  printCapturePreview({ doc, sources, missing: [] });

  if (dryRun) {
    console.log('\n[DRY-RUN] No files or blobs written. Re-run with --apply to publish.');
    return { examId, slot, dryRun: true };
  }

  if (!yes) {
    const ok = await confirm('\nWrite published_exam?');
    if (!ok) {
      return { examId, slot, dryRun: true, aborted: true };
    }
  }

  await writePublishedExam({
    store,
    lang,
    level,
    doc,
    applyLocal: true,
    applyBlob: !!store,
  });

  await upsertPublishedCatalog({
    store,
    lang,
    level,
    examEntry: {
      examId,
      slot,
      title,
      status: doc.status,
      manifestVersion: doc.manifestVersion,
      publishedAt: doc.publishedAt,
    },
    applyLocal: true,
    applyBlob: !!store,
  });

  console.log(`\n✅ Published ${examId} (manifest v${doc.manifestVersion})`);
  if (store) console.log(`   blob: published_exam:${lang}:${level}:${examId}`);
  console.log(`   local: library/published-exams/${lang}/${level}/${examId}.json`);

  return { examId, slot, dryRun: false };
}
