#!/usr/bin/env node
/**
 * Trace repo-root filesystem deps (require/import/resolveFromRoot) for Netlify included_files.
 * Usage: node scripts/analyze-netlify-function-runtime-deps.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RE_REQUIRE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const RE_REQUIRE_RESOLVE = /require\s*\(\s*resolveFromRoot\s*\(\s*([^)]+)\)\s*\)/g;
const RE_IMPORT = /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;
const RE_IMPORT_DYNAMIC = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const RE_DYNAMIC_ROOT = /pathToFileURL\s*\(\s*(?:path\.join\s*\(\s*ROOT\s*,\s*['"]([^'"]+)['"]\)|resolveFromRoot\s*\(\s*([^)]+)\))/g;

function parseResolveFromRootArgs(inner) {
  const parts = [];
  const re = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(inner))) parts.push(m[1]);
  return parts;
}

function isRepoRuntimeFile(abs) {
  if (!abs.startsWith(ROOT)) return false;
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  if (rel.startsWith('node_modules/')) return false;
  if (rel.startsWith('netlify/functions/') && !rel.includes('/lib/')) {
    // function entry — bundled by esbuild; lib/*.js often loaded from disk when listed in included_files
  }
  return fs.existsSync(abs) && fs.statSync(abs).isFile();
}

function resolveSpec(fromFile, spec) {
  if (spec.startsWith('.')) {
    const base = path.resolve(path.dirname(fromFile), spec);
    for (const ext of ['', '.js', '.mjs', '.json', '/index.js']) {
      const p = ext.startsWith('/') ? base + ext : base + ext;
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
    return null;
  }
  if (spec.startsWith('node:') || !spec.includes('/') && !spec.endsWith('.mjs')) {
    return null; // builtin or npm — bundled
  }
  return null;
}

function collectFromSource(filePath, relPaths) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  let m;

  while ((m = RE_REQUIRE_RESOLVE.exec(text))) {
    const segs = parseResolveFromRootArgs(m[1]);
    if (segs.length) relPaths.add(segs.join('/'));
  }

  const joinRoot = /path\.join\s*\(\s*ROOT\s*,\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"]\s*)?\)/g;
  while ((m = joinRoot.exec(text))) {
    const segs = [m[1], m[2]].filter(Boolean);
    relPaths.add(segs.join('/'));
  }

  while ((m = RE_REQUIRE.exec(text))) {
    const spec = m[1];
    if (spec.includes('resolveFromRoot')) continue;
    const resolved = resolveSpec(filePath, spec);
    if (resolved) queue.push(resolved);
  }

  for (const re of [RE_IMPORT, RE_IMPORT_DYNAMIC]) {
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        const resolved = resolveSpec(filePath, spec);
        if (resolved) queue.push(resolved);
      } else if (spec.startsWith('../') && filePath.includes('scripts')) {
        const resolved = resolveSpec(filePath, spec);
        if (resolved) queue.push(resolved);
      }
    }
  }
}

const seeds = process.argv.includes('--seeds-only')
  ? process.argv.slice(process.argv.indexOf('--seeds-only') + 1)
  : null;

const defaultSeeds = [
  path.join(ROOT, 'netlify/functions/admin-api.js'),
  path.join(ROOT, 'netlify/functions/exam-part.js'),
  path.join(ROOT, 'scripts/lib/levelPlanner.mjs'),
  path.join(ROOT, 'scripts/lib/poolGapPlanner.mjs'),
];

const queue = [...(seeds || defaultSeeds)];
const visited = new Set();
const relPaths = new Set();
const visitedRel = new Set();

while (queue.length) {
  const filePath = queue.shift();
  const norm = path.normalize(filePath);
  if (visited.has(norm)) continue;
  visited.add(norm);
  if (!fs.existsSync(norm)) continue;
  const rel = path.relative(ROOT, norm).replace(/\\/g, '/');
  if (!rel.startsWith('..')) {
    relPaths.add(rel);
    visitedRel.add(rel);
  }
  collectFromSource(norm, relPaths);
}

// Expand resolveFromRoot paths collected as joined strings
for (const p of [...relPaths]) {
  if (p.includes('.js') || p.includes('.mjs')) {
    const abs = path.join(ROOT, p);
    if (fs.existsSync(abs) && !visited.has(path.normalize(abs))) queue.push(abs);
  }
}
// second pass for newly queued
while (queue.length) {
  const filePath = queue.shift();
  const norm = path.normalize(filePath);
  if (visited.has(norm)) continue;
  visited.add(norm);
  if (!fs.existsSync(norm)) continue;
  const rel = path.relative(ROOT, norm).replace(/\\/g, '/');
  if (!rel.startsWith('..')) relPaths.add(rel);
  collectFromSource(norm, relPaths);
}

function suggestGlobs(paths) {
  const dirs = new Set();
  const files = new Set();
  for (const p of paths) {
    if (p.endsWith('.json') && p.includes('library/reusable-seed')) {
      dirs.add('library/reusable-seed/**');
      continue;
    }
    if (p.startsWith('scripts/lib/')) {
      dirs.add('scripts/lib/**');
    } else if (p.startsWith('scripts/') && (p.endsWith('.mjs') || p.endsWith('.js'))) {
      files.add(p);
    } else if (p.startsWith('js/data/')) dirs.add('js/data/**');
    else if (p.startsWith('js/engine/')) dirs.add('js/engine/**');
    else if (p.startsWith('js/library/')) dirs.add('js/library/**');
    else if (p.startsWith('library/blueprints/')) dirs.add('library/blueprints/**');
    else if (p.startsWith('library/vocab/')) dirs.add('library/vocab/**');
    else if (p.startsWith('library/reusable-seed/')) dirs.add('library/reusable-seed/**');
    else if (p.startsWith('library/banks/')) dirs.add('library/banks/**');
    else if (p.startsWith('library/curated/')) dirs.add('library/curated/**');
    else if (p.startsWith('library/schemas/')) dirs.add('library/schemas/**');
    else if (p.startsWith('data/lexicon/')) dirs.add('data/lexicon/**');
    else if (p.startsWith('knowledge/')) dirs.add('knowledge/**');
    else if (p.startsWith('plantillas')) {
      const top = p.split('/')[0];
      dirs.add(`${top}/**`);
    } else if (p.startsWith('netlify/functions/lib/')) {
      files.add(p);
    }
  }
  return { dirs: [...dirs].sort(), files: [...files].sort() };
}

const { dirs, files } = suggestGlobs(relPaths);

function parseIncludedGlobs(tomlText, fnName) {
  const re = new RegExp(`\\[functions\\.\\"${fnName.replace(/"/g, '')}\\"\\][\\s\\S]*?included_files\\s*=\\s*\\[([^\\]]+)\\]`, 'm');
  const m = tomlText.match(re);
  if (!m) return [];
  return m[1].match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) || [];
}

function pathMatchesGlob(rel, glob) {
  const g = glob.replace(/\*\*/g, '{{GLOB}}').replace(/\*/g, '[^/]*').replace(/\{\{GLOB\}\}/g, '.*');
  return new RegExp(`^${g}$`).test(rel);
}

function missingFromGlobs(allRel, globs) {
  const miss = [];
  for (const p of allRel) {
    if (p.startsWith('netlify/functions/') && !p.includes('/lib/')) continue;
    if (p.endsWith('.md')) continue;
    if (globs.some((g) => pathMatchesGlob(p, g))) continue;
    miss.push(p);
  }
  return miss.sort();
}

const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
const adminGlobs = parseIncludedGlobs(toml, 'admin-api');
const examGlobs = parseIncludedGlobs(toml, 'exam-part');

const out = {
  fileCount: relPaths.size,
  suggestedGlobs: dirs,
  suggestedExplicitFiles: files.filter((f) => f.startsWith('scripts/')),
  missingUnderAdminApi: missingFromGlobs([...relPaths], adminGlobs),
  missingUnderExamPart: missingFromGlobs([...relPaths], examGlobs),
  allPaths: [...relPaths].sort(),
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log('Suggested directory globs:', dirs.join('\n  '));
  console.log('\nExplicit scripts/ files (outside scripts/lib):', out.suggestedExplicitFiles.join('\n  '));
  console.log('\nMissing vs admin-api included_files (' + out.missingUnderAdminApi.length + '):');
  console.log(out.missingUnderAdminApi.slice(0, 80).join('\n'));
  if (out.missingUnderAdminApi.length > 80) console.log('...');
  console.log('\nMissing vs exam-part included_files (' + out.missingUnderExamPart.length + '):');
  console.log(out.missingUnderExamPart.slice(0, 80).join('\n'));
}
