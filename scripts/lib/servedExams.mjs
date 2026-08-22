/**
 * Resolve the exams the app actually serves for a lang/level.
 *
 * The browser picks between two sources (js/data/examLibrary.js → usesPublishedExams):
 *   'published' — library/published-exams/<lang>/<level>/ through PublishedExamAdapter
 *   'legacy'    — data/exams/<lang>_<level>.json
 *
 * Node-side scripts used to read the legacy file unconditionally, which silently skipped
 * every published exam missing from it (de/B1 served 19, the legacy file has 16 → e17–e19
 * never got their Hören pregenerated). This module mirrors the browser decision instead of
 * guessing: it runs the real `examSource.js` / `publishedExamAdapter.js` / `examLibrary.js`
 * in a vm with a disk-backed `fetch`, so the exam objects are byte-for-byte the ones the
 * runtime builds.
 *
 * The mode itself comes from index.html (`window.LEXICOIL_EXAM_SOURCE`), the single place
 * that sets it for the deployed site.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Browser files that together decide + build the served exams. Order matters. */
const BROWSER_FILES = [
  'js/config/examSource.js',
  'js/data/publishedExamAdapter.js',
  'js/data/examLibrary.js',
];

const CONTEXTS = new Map();

/** @returns {'published'|'legacy'} the mode index.html ships with. */
export function readExamSourceMode(root = ROOT) {
  const indexPath = path.join(root, 'index.html');
  if (!fs.existsSync(indexPath)) return 'legacy';
  const html = fs.readFileSync(indexPath, 'utf8');
  // window.LEXICOIL_EXAM_SOURCE='published';  (commented-out lines don't count)
  const re = /^(?![ \t]*(?:\/\/|\/\*|\*)).*\bLEXICOIL_EXAM_SOURCE\s*=\s*['"](published|legacy)['"]/gm;
  let mode = 'legacy';
  let m;
  while ((m = re.exec(html))) mode = m[1]; // last assignment wins, as in the browser
  return mode;
}

/** vm context with the real browser modules loaded and `fetch` reading from disk. */
function browserContext(root, mode) {
  const cacheKey = `${root}::${mode}`;
  if (CONTEXTS.has(cacheKey)) return CONTEXTS.get(cacheKey);

  const g = {
    console,
    window: null,
    LEXICOIL_EXAM_SOURCE: mode,
    fetch: async (url) => {
      const rel = String(url).replace(/^\//, '').split('/').join(path.sep);
      const file = path.join(root, rel);
      if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
      const body = fs.readFileSync(file, 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    },
  };
  g.window = g;

  const ctx = vm.createContext(g);
  for (const rel of BROWSER_FILES) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new Error(`Missing browser module: ${rel}`);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel });
  }

  CONTEXTS.set(cacheKey, g);
  return g;
}

export function legacyExamsPath(lang, level, root = ROOT) {
  return path.join(root, 'data', 'exams', `${lang}_${level}.json`);
}

export function publishedCatalogPath(lang, level, root = ROOT) {
  return path.join(
    root,
    'library',
    'published-exams',
    String(lang).toLowerCase(),
    String(level).toUpperCase(),
    '_catalog.json',
  );
}

function loadLegacyExams(lang, level, root) {
  const file = legacyExamsPath(lang, level, root);
  if (!fs.existsSync(file)) throw new Error(`Missing served exams: ${file}`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(raw) ? raw : raw.exams || [raw];
}

/**
 * @param {string} lang
 * @param {string} level
 * @param {{root?: string, source?: 'auto'|'published'|'legacy'}} [opts]
 * @returns {Promise<{source: 'published'|'legacy', origin: string, mode: string, exams: object[]}>}
 */
export async function resolveServedExams(lang, level, opts = {}) {
  const root = opts.root || ROOT;
  const requested = opts.source || 'auto';
  const mode = requested === 'auto' ? readExamSourceMode(root) : requested;

  if (requested !== 'legacy') {
    const g = browserContext(root, mode);
    const usesPublished =
      requested === 'published'
        ? g.PublishedExamAdapter.supports(lang, level)
        : g.ExamLibrary.usesPublishedExams(lang, level);
    if (usesPublished) {
      const exams = await g.PublishedExamAdapter.loadExams(lang, level);
      return {
        source: 'published',
        origin: path.relative(root, path.dirname(publishedCatalogPath(lang, level, root))).split(path.sep).join('/'),
        mode,
        exams,
      };
    }
    if (requested === 'published') {
      throw new Error(`No published exams for ${lang}/${level} (PublishedExamAdapter does not support it)`);
    }
  }

  return {
    source: 'legacy',
    origin: path.relative(root, legacyExamsPath(lang, level, root)).split(path.sep).join('/'),
    mode,
    exams: loadLegacyExams(lang, level, root),
  };
}
