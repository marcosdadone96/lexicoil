#!/usr/bin/env node
/**
 * Publish assembled verified exams to local catalog (pool-verified overlay).
 *
 *   node scripts/publish-verified-exams-local.mjs --slots 4
 *   node scripts/publish-verified-exams-local.mjs --slots 1,2,3,4
 *   node scripts/publish-verified-exams-local.mjs --all-assembled
 *   node scripts/publish-verified-exams-local.mjs --dry-run --slots 4
 */
import { publishVerifiedExamSlots, listAssembledSlots } from './lib/verifiedExamPublishLib.mjs';

function parseSlots(argv) {
  const out = { slots: [], all: false, dryRun: false, lang: 'de', level: 'B1' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--slots') {
      out.slots = String(argv[++i] || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    } else if (a === '--all-assembled') out.all = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--lang') out.lang = String(argv[++i] || 'de').toLowerCase();
    else if (a === '--level') out.level = String(argv[++i] || 'B1').toUpperCase();
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

const args = parseSlots(process.argv);
if (args.help || (!args.slots.length && !args.all)) {
  console.log(`Usage:
  node scripts/publish-verified-exams-local.mjs --slots 4
  node scripts/publish-verified-exams-local.mjs --all-assembled [--dry-run]`);
  process.exit(args.help ? 0 : 2);
}

const slots = args.all ? listAssembledSlots(args.level) : args.slots;
if (!slots.length) {
  console.error('No slots to publish.');
  process.exit(1);
}

const result = publishVerifiedExamSlots({
  slots,
  lang: args.lang,
  level: args.level,
  dryRun: args.dryRun,
  syncServed: !args.dryRun,
});

if (args.dryRun) {
  console.log('[DRY-RUN]', result);
} else {
  console.log('\n✅ Published:', result.published.join(', '));
  console.log('  live exams:', result.liveCount, '→', result.liveExams.join(', '));
  console.log('  Hard-refresh the app.');
}
