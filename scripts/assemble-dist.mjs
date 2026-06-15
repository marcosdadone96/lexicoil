#!/usr/bin/env node
/**
 * Merges Next.js landing export with the LexiCoil app (static HTML/JS).
 * Output: dist/ ready for Netlify publish.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LANDING_OUT = path.join(ROOT, 'landing', 'out');
const DIST = path.join(ROOT, 'dist');

const COPY_DIRS = ['js', 'data', 'assets', 'knowledge', 'library'];

function copyDesignSystem() {
  const destDir = path.join(DIST, 'assets', 'css');
  const sheets = ['lexicoil-design-system.css', 'app.css', 'app-utilities.css', 'app-screens.css', 'demo-loop.css'];
  ensureDir(destDir);
  for (const name of sheets) {
    const src = path.join(ROOT, 'assets', 'css', name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(destDir, name));
  }
}
const COPY_FILES = [
  'admin.html',
  'confirmacion.html',
  'privacy.html',
  'terms.html',
  'favicon.svg',
  'favicon.png',
  'og-image.svg',
  'robots.txt',
  'server.mjs',
  'BETA.md',
];

function cp(src, dest) {
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyLanding() {
  if (!fs.existsSync(LANDING_OUT)) {
    console.error('Missing landing/out ? run: cd landing && npm run build');
    process.exit(1);
  }
  cp(LANDING_OUT, DIST);
}

function copyAppAssets() {
  for (const dir of COPY_DIRS) {
    const src = path.join(ROOT, dir);
    if (fs.existsSync(src)) cp(src, path.join(DIST, dir));
  }
  for (const file of COPY_FILES) {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, file));
  }
}

function publishAppEntry() {
  const indexSrc = path.join(ROOT, 'index.html');
  const appDest = path.join(DIST, 'app.html');
  if (!fs.existsSync(indexSrc)) {
    console.error('Missing index.html (app source)');
    process.exit(1);
  }
  fs.copyFileSync(indexSrc, appDest);
}

function publishDemo() {
  const demoSrc = path.join(ROOT, 'demo.html');
  const demoDest = path.join(DIST, 'demo.html');
  if (!fs.existsSync(demoSrc)) {
    console.error('Missing demo.html (static demo)');
    process.exit(1);
  }
  fs.copyFileSync(demoSrc, demoDest);
}

function writeSitemap() {
  const examUrls = [
    'goethe-a1',
    'goethe-a2',
    'goethe-b1',
    'goethe-b2',
    'goethe-c1',
    'cambridge-b1',
    'cambridge-b2',
    'cambridge-c1',
  ]
    .map(
      (slug) => `  <url>
    <loc>https://www.lexicoil.com/exams/${slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.lexicoil.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://www.lexicoil.com/app.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://www.lexicoil.com/demo.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.85</priority>
  </url>
${examUrls}
  <url>
    <loc>https://www.lexicoil.com/privacy.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>https://www.lexicoil.com/terms.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
</urlset>
`;
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), xml, 'utf8');
}

ensureDir(DIST);
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}
ensureDir(DIST);

function syncLandingDesignSystem() {
  const src = path.join(ROOT, 'assets', 'css', 'lexicoil-design-system.css');
  const destDir = path.join(ROOT, 'landing', 'public', 'assets', 'css');
  ensureDir(destDir);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(destDir, 'lexicoil-design-system.css'));
}

syncLandingDesignSystem();
copyLanding();
copyAppAssets();
copyDesignSystem();
publishAppEntry();
publishDemo();
writeSitemap();

console.log('Assembled dist/ ? landing at /, app at /app.html, demo at /demo.html');
