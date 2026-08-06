#!/usr/bin/env node
/**
 * Compare asset paths referenced in prod app.html vs git tracked files.
 *   node scripts/audit-prod-html-vs-git.mjs [path-to-prod-app.html]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath =
  process.argv[2] ||
  path.join(ROOT, 'batches/ready/gate-logs/prod-app-html-www.html');

const html = fs.readFileSync(htmlPath, 'utf8');
const re = /(?:src|href)=["']([^"']+)["']/gi;
const referenced = new Set();
let m;
while ((m = re.exec(html))) {
  let u = m[1].trim();
  if (
    u.startsWith('http') ||
    u.startsWith('//') ||
    u.startsWith('data:') ||
    u.includes('cdn-cgi') ||
    u.includes('googletagmanager') ||
    u.includes('google-analytics') ||
    u.includes('fonts.googleapis') ||
    u.includes('fonts.gstatic') ||
    u.includes('stripe.com')
  ) {
    continue;
  }
  u = u.split('?')[0];
  if (u.startsWith('/')) u = u.slice(1);
  if (!u || u.endsWith('.html')) continue;
  referenced.add(u.replace(/\\/g, '/'));
}

const tracked = new Set(
  execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, '/')),
);

const statusRaw = execSync('git status -u --porcelain', { cwd: ROOT, encoding: 'utf8' });
const untracked = new Set();
const modified = new Set();
for (const line of statusRaw.trim().split(/\r?\n/)) {
  if (!line.trim()) continue;
  const code = line.slice(0, 2);
  const file = line.slice(3).trim().replace(/\\/g, '/');
  if (code === '??' || code === ' A' || code.startsWith('?')) untracked.add(file);
  if (code.includes('M') || code === 'MM') modified.add(file);
}

function classify(refPath) {
  const norm = refPath.replace(/\\/g, '/');
  if (tracked.has(norm)) {
    if (modified.has(norm)) return 'tracked_modified';
    return 'tracked_ok';
  }
  const abs = path.join(ROOT, norm);
  if (fs.existsSync(abs)) return 'untracked_on_disk';
  return 'missing_everywhere';
}

const rows = [...referenced].sort().map((p) => ({
  path: p,
  status: classify(p),
}));

const drift = rows.filter((r) => r.status === 'untracked_on_disk');
const missing = rows.filter((r) => r.status === 'missing_everywhere');
const modifiedRefs = rows.filter((r) => r.status === 'tracked_modified');

const outDir = path.join(ROOT, 'batches/ready/gate-logs');
fs.mkdirSync(outDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  prodHtml: htmlPath,
  referencedCount: referenced.size,
  untrackedReferenced: drift.map((r) => r.path),
  missingReferenced: missing.map((r) => r.path),
  trackedModifiedReferenced: modifiedRefs.map((r) => r.path),
  allReferenced: rows,
};

fs.writeFileSync(
  path.join(outDir, 'prod-app-html-drift-inventory.json'),
  JSON.stringify(report, null, 2),
  'utf8',
);

console.log('Referenced assets:', referenced.size);
console.log('\n=== UNTRACKED but referenced in prod app.html ===');
for (const p of drift.map((r) => r.path)) console.log(p);
console.log('\nCount:', drift.length);

if (missing.length) {
  console.log('\n=== MISSING on disk (broken refs?) ===');
  for (const p of missing.map((r) => r.path)) console.log(p);
}

if (modifiedRefs.length) {
  console.log('\n=== TRACKED but locally modified (content drift vs last commit) ===');
  console.log('Count:', modifiedRefs.length);
}
