import fs from 'fs';
import path from 'path';

function walk(dir, exts, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !['node_modules', 'dist', '.next', '.netlify'].includes(e.name)) {
      walk(p, exts, acc);
    } else if (e.isFile() && exts.some((x) => p.endsWith(x))) {
      acc.push(p);
    }
  }
  return acc;
}

const corpusFiles = [
  ...walk('js', ['.js']),
  ...walk('netlify', ['.js']),
  ...walk('scripts', ['.mjs']),
  ...walk('landing/src', ['.tsx']),
  'index.html',
  'demo.html',
].filter((f) => fs.existsSync(f));

const corpus = corpusFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

const defs = {};
for (const f of [...walk('js', ['.js']), 'index.html'].filter((x) => fs.existsSync(x))) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/\bfunction\s+([a-zA-Z_]\w*)\s*\(/g)) {
    defs[m[1]] = f;
  }
}

const mode = process.argv[2] || 'functions';

if (mode === 'functions') {
  for (const [name, f] of Object.entries(defs).sort(([a], [b]) => a.localeCompare(b))) {
    const total = (corpus.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
    const dcount = (corpus.match(new RegExp(`\\bfunction\\s+${name}\\s*\\(`, 'g')) || []).length;
    if (total - dcount === 0) console.log(`DEAD  ${name.padEnd(34)} ${f}`);
  }
}

if (mode === 'css') {
  const html = fs.readFileSync('index.html', 'utf8');
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const classes = new Set([...styles.matchAll(/\.([a-zA-Z][\w-]+)\s*[{,:]/g)].map((m) => m[1]));
  let cssCorpus = html.replace(/<style[\s\S]*?<\/style>/g, '');
  for (const f of [...walk('js', ['.js']), 'demo.html', ...walk('landing/src', ['.tsx'])]) {
    if (fs.existsSync(f)) cssCorpus += '\n' + fs.readFileSync(f, 'utf8');
  }
  const dead = [...classes].filter((c) => !new RegExp(`\\b${c}\\b`).test(cssCorpus)).sort();
  console.log(`DEAD CSS classes: ${dead.length}`);
  console.log(dead.join('\n'));
}
