#!/usr/bin/env node
/**
 * Remediate Sprechen pool — canonical rubric, metadata, Kunden/Leser leak fix.
 *
 *   node scripts/remediate-sprechen-pool-2026-07-13.mjs
 *   node scripts/remediate-sprechen-pool-2026-07-13.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalSprechenExplanation } from './lib/sprechenDisplayRubric.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches', 'ready', 'pool-verified');

/** Marketing-template leak from B2 blacklist suggestion «Kunden / Leser» for Zielgruppe. */
const KUNDEN_LESER_BULLET = /Kunden\s*\/\s*Leser\s+und\s+Nutzen\s+des\s+Programms/gi;
const KUNDEN_LESER_BULLET_REPLACEMENT = 'Teilnehmer und Nutzen des Programms';

function resolveRootTopic(batch) {
  const tag =
    batch.topicTag ||
    batch._requestedTopic ||
    batch.questions?.find((q) => q.topicTag)?.topicTag ||
    batch.questions?.find((q) => q.topicTags?.length)?.topicTags?.[0] ||
    null;
  return tag ? String(tag).trim() : null;
}

function unifyQuestionMetadata(q, rootTopic) {
  const topic =
    rootTopic ||
    q.topicTag ||
    (Array.isArray(q.topicTags) && q.topicTags[0]) ||
    'Freizeit';
  q.topicTag = topic;
  q.topicTags = [topic];
}

function fixKundenLeserLeak(text) {
  if (!text || typeof text !== 'string') return { text, changed: false };
  if (!KUNDEN_LESER_BULLET.test(text)) return { text, changed: false };
  KUNDEN_LESER_BULLET.lastIndex = 0;
  return {
    text: text.replace(KUNDEN_LESER_BULLET, KUNDEN_LESER_BULLET_REPLACEMENT),
    changed: true,
  };
}

function remediateFile(relPath, dryRun) {
  const abs = path.join(ROOT, relPath);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const changes = [];

  const rootTopic = resolveRootTopic(batch);
  if (rootTopic) {
    if (batch.topicTag !== rootTopic) {
      batch.topicTag = rootTopic;
      changes.push('root.topicTag');
    }
    if (!batch._requestedTopic) {
      batch._requestedTopic = rootTopic;
      changes.push('root._requestedTopic');
    }
  }

  for (const q of batch.questions || []) {
    if (q.module !== 'sprechen' && batch.questions?.every((x) => x.module === 'sprechen')) {
      q.module = 'sprechen';
    }
    const teil = Number(q.teil);
    const canon = canonicalSprechenExplanation(teil);
    if (canon && q.explanation !== canon) {
      q.explanation = canon;
      changes.push(`q${teil}.explanation`);
    }

    const beforeMeta = JSON.stringify({ topicTag: q.topicTag, topicTags: q.topicTags });
    unifyQuestionMetadata(q, rootTopic);
    const afterMeta = JSON.stringify({ topicTag: q.topicTag, topicTags: q.topicTags });
    if (beforeMeta !== afterMeta) changes.push(`q${teil}.metadata`);

    if (q.question) {
      const { text, changed } = fixKundenLeserLeak(q.question);
      if (changed) {
        q.question = text;
        changes.push(`q${teil}.kunden-leser-fix`);
      }
    }

    if (Array.isArray(q.vocabularyTags)) {
      const fixed = q.vocabularyTags.map((t) => (t === 'mietpreisen' ? 'Mietpreisen' : t));
      if (JSON.stringify(fixed) !== JSON.stringify(q.vocabularyTags)) {
        q.vocabularyTags = fixed;
        changes.push(`q${teil}.vocabTags`);
      }
    }
  }

  if (changes.length && !dryRun) {
    fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  }
  return { relPath, changes };
}

function scanPoolLeak(files) {
  const hits = [];
  const patterns = [
    /Kunden\s*\/\s*Leser/i,
    /Leser und Nutzen des Programms/i,
  ];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(POOL, f), 'utf8');
    for (const p of patterns) {
      if (p.test(raw)) hits.push({ file: f, pattern: p.source });
    }
  }
  return hits;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const files = fs.readdirSync(POOL).filter((f) => f.startsWith('sprechen') && f.endsWith('.json'));
  const leaksBefore = scanPoolLeak(files);

  console.log(`Sprechen pool: ${files.length} archivos`);
  if (leaksBefore.length) {
    console.log('Filtraciones Kunden/Leser antes:', leaksBefore);
  } else {
    console.log('Filtraciones Kunden/Leser antes: ninguna');
  }

  const results = [];
  for (const f of files.sort()) {
    const rel = path.join('batches', 'ready', 'pool-verified', f).replace(/\\/g, '/');
    const r = remediateFile(rel, dryRun);
    if (r.changes.length) results.push(r);
  }

  for (const r of results) {
    console.log(`${dryRun ? '[dry-run] ' : ''}${path.basename(r.relPath)}: ${r.changes.join(', ')}`);
  }
  console.log(`\nArchivos modificados: ${results.length}/${files.length}${dryRun ? ' (dry-run)' : ''}`);

  if (!dryRun) {
    const leaksAfter = scanPoolLeak(files);
    console.log(
      leaksAfter.length
        ? `Filtraciones después: ${JSON.stringify(leaksAfter)}`
        : 'Filtraciones después: ninguna',
    );
  }
}

main();
