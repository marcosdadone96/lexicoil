#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logPath = process.argv[2] || path.join(ROOT, 'batches/logs/audit-a2-exhaustive-2026-07-26.log');
const raw = fs.readFileSync(logPath);
const log =
  raw[0] === 0xff && raw[1] === 0xfe
    ? raw.toString('utf16le')
    : raw.toString('utf8');

const results = {};
const ATTEMPT_RE =
  /(?:──|ÔöÇÔöÇ)\s*(lesen|horen|schreiben|sprechen)\s+T(\d+)\s*[^\n]*?intento\s+(\d+)/g;
const matches = [...log.matchAll(ATTEMPT_RE)];
for (let mi = 0; mi < matches.length; mi++) {
  const m = matches[mi];
  const mod = m[1];
  const teil = m[2];
  const att = m[3];
  const start = m.index + m[0].length;
  const end = mi + 1 < matches.length ? matches[mi + 1].index : log.length;
  const body = log.slice(start, end);
  const key = `${mod}-t${teil}`;
  if (!results[key]) results[key] = { module: mod, teil: Number(teil), attempts: [], published: null };
  let reason = 'unknown';
  const fm = body.match(/Fall.{0,6}\(generate\)(?:\s*\[[^\]]+\])?:\s*([^\n]+)/);
  if (fm) reason = fm[1].trim();
  else if (/pool-verified|Publicado en pool|✅ Publicado/.test(body)) reason = 'PUBLISHED';
  else if (/· OK ·/.test(body) && /pool-verified/.test(body)) reason = 'PUBLISHED';
  const cost = body.match(/· (\d+) llamadas · \$([\d.]+)/);
  const pub = body.match(/pool-verified\/A2\/([^\s]+\.json)/);
  results[key].attempts.push({
    attempt: Number(att),
    reason,
    calls: cost ? Number(cost[1]) : null,
    usd: cost ? cost[2] : null,
  });
  if (reason === 'PUBLISHED' || pub) {
    results[key].published = pub ? pub[1] : results[key].published || true;
  }
}

const cells = ['lesen-t1', 'lesen-t2', 'lesen-t3', 'lesen-t4', 'horen-t1', 'horen-t2', 'horen-t3', 'horen-t4', 'schreiben-t1', 'schreiben-t2', 'sprechen-t1', 'sprechen-t2', 'sprechen-t3'];
const summary = cells.map((k) => {
  const r = results[k] || { module: k.split('-')[0], teil: Number(k.split('-t')[1]), attempts: [], published: null };
  const last = r.attempts[r.attempts.length - 1];
  const failReasons = [...new Set(r.attempts.map((a) => a.reason).filter((x) => x !== 'PUBLISHED' && x !== 'unknown'))];
  return {
    cell: k,
    attempts: r.attempts.length,
    published: !!r.published,
    file: r.published,
    topFailures: failReasons.slice(0, 5),
    lastFailure: last?.reason,
  };
});

console.log(JSON.stringify({ logPath, parsedCells: Object.keys(results).length, summary, detail: results }, null, 2));
