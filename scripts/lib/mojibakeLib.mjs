/**
 * Mojibake detection and repair — UTF-8 mis-decoded as Latin-1.
 * Shared by fix-mojibake.mjs and assert-no-mojibake.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Windows-1252 mis-decoded UTF-8 punctuation (already stored as Unicode code points). */
const CP1252_MOJIBAKE = [
  ['\u00E2\u20AC\u0153', '\u201C'], // â€œ → "
  ['\u00E2\u20AC\u009D', '\u201D'], // â€ + control → "
  ['\u00E2\u20AC\u0152', '\u201C'],
  ['\u00E2\u20AC\u201D', '\u201D'], // â€"
  ['\u00E2\u20AC\u201C', '\u201C'],
  ['\u00E2\u20AC\u2013', '\u2013'], // â€"
  ['\u00E2\u20AC\u2014', '\u2014'],
  ['\u00E2\u20AC\u2018', '\u2018'],
  ['\u00E2\u20AC\u2019', '\u2019'],
  ['\u00E2\u201A\u00AC', '\u20AC'], // â‚¬ → €
  ['\u00C2\u00BF', '\u00BF'], // Â¿ → ¿
  ['\u00C2\u00A1', '\u00A1'], // Â¡ → ¡
];

/** Classic mojibake signatures (es/de accents + cp1252 punctuation). */
export const MOJIBAKE_SIGNATURE =
  /(?:Ã[\u0080-\u00BF]|â[\u20AC\u201A][\u0080-\u00BF\u0152\u0153]|\u00E2\u20AC[\u0152\u0153\u2013\u2014\u2018\u2019\u201C\u201D]|â‚¬|Â[¿¡])/;

/** Extract corrupted token(s) from a line for reporting. */
export const MOJIBAKE_TOKEN =
  /(?:Ã[\u0080-\u00BF]+|â[\u20AC\u201A][\u0080-\u00BF\u0152\u0153]+|\u00E2\u20AC[\u0152\u0153\u2013\u2014\u2018\u2019\u201C\u201D]+|â‚¬|Â[¿¡])/g;

function applyCp1252Replacements(text) {
  let out = text;
  let changed = false;
  for (const [bad, good] of CP1252_MOJIBAKE) {
    if (out.includes(bad)) {
      out = out.split(bad).join(good);
      changed = true;
    }
  }
  return { text: out, changed };
}

export const SCAN_ROOTS = ['data', 'js/content', 'library'];
export const SCAN_EXTENSIONS = new Set(['.json', '.js', '.mjs', '.md', '.html', '.txt', '.css']);
export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'out',
  'dist',
  'tts-cache',
  '.netlify',
]);

export function countMojibake(text) {
  if (!text) return 0;
  const m = text.match(MOJIBAKE_TOKEN);
  return m ? m.length : 0;
}

export function hasReplacementChar(text) {
  return /\uFFFD/.test(text);
}

/**
 * Repair mojibake by Latin-1 → UTF-8 round-trip on affected regions.
 * Does not rewrite valid UTF-8 that lacks mojibake signatures.
 */
export function repairMojibake(text) {
  if (!text || !MOJIBAKE_SIGNATURE.test(text)) {
    return { text, changed: false, strategy: 'none' };
  }

  let base = text;
  let strategy = 'none';
  let changed = false;

  const cp1252 = applyCp1252Replacements(base);
  if (cp1252.changed) {
    base = cp1252.text;
    changed = true;
    strategy = 'cp1252-map';
  }

  if (MOJIBAKE_SIGNATURE.test(base)) {
    const tryWhole = Buffer.from(base, 'latin1').toString('utf8');
    if (
      !hasReplacementChar(tryWhole) &&
      countMojibake(tryWhole) < countMojibake(base)
    ) {
      base = tryWhole;
      changed = true;
      strategy = strategy === 'none' ? 'whole-file' : `${strategy}+latin1`;
    } else {
      const lines = base.split('\n');
      let lineChanged = false;
      const fixedLines = lines.map((line) => {
        if (!MOJIBAKE_SIGNATURE.test(line)) return line;
        let src = line;
        const cp = applyCp1252Replacements(src);
        if (cp.changed) src = cp.text;
        if (!MOJIBAKE_SIGNATURE.test(src)) {
          lineChanged = true;
          return src;
        }
        const candidate = Buffer.from(src, 'latin1').toString('utf8');
        if (!hasReplacementChar(candidate) && countMojibake(candidate) < countMojibake(line)) {
          lineChanged = true;
          return candidate;
        }
        const tokenFixed = src.replace(MOJIBAKE_TOKEN, (match) => {
          const c = Buffer.from(match, 'latin1').toString('utf8');
          return hasReplacementChar(c) ? match : c;
        });
        if (tokenFixed !== line) {
          lineChanged = true;
          return tokenFixed;
        }
        return line;
      });
      if (lineChanged) {
        base = fixedLines.join('\n');
        changed = true;
        strategy = strategy === 'none' ? 'line' : `${strategy}+line`;
      }
    }
  }

  return { text: base, changed, strategy: changed ? strategy : 'unresolved' };
}

export function scanLineHits(content, fileRel) {
  const hits = [];
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (!MOJIBAKE_SIGNATURE.test(line)) return;
    const tokens = [...new Set(line.match(MOJIBAKE_TOKEN) || [])];
    hits.push({
      file: fileRel,
      line: idx + 1,
      tokens,
      preview: line.trim().slice(0, 120),
    });
  });
  return hits;
}

export function walkScanFiles(rootDir) {
  const files = [];
  function walk(abs, rel) {
    if (!fs.existsSync(abs)) return;
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      if (SKIP_DIRS.has(ent.name)) continue;
      const absPath = path.join(abs, ent.name);
      const relPath = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(absPath, relPath);
      else if (SCAN_EXTENSIONS.has(path.extname(ent.name).toLowerCase())) {
        files.push({ abs: absPath, rel: relPath.replace(/\\/g, '/') });
      }
    }
  }
  for (const root of SCAN_ROOTS) {
    walk(path.join(rootDir, root), root);
  }
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

export function validateJsonFile(absPath) {
  if (!absPath.endsWith('.json')) return { ok: true };
  try {
    JSON.parse(fs.readFileSync(absPath, 'utf8'));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Self-check: detector catches known corrupted forms. */
export function selfTestDetector() {
  const detectSamples = ['MÃ¼nchen', 'EspaÃ±ol', 'Â¿QuÃ©?', 'â‚¬', '\u00E2\u20AC\u0153Hallo'];
  for (const bad of detectSamples) {
    if (!MOJIBAKE_SIGNATURE.test(bad)) {
      throw new Error(`self-test: failed to detect mojibake in "${bad}"`);
    }
  }

  const repairCases = [
    ['MÃ¼nchen', 'München'],
    ['EspaÃ±ol', 'Español'],
    ['Â¿QuÃ©?', '¿Qué?'],
    ['â‚¬', '€'],
    ['\u00E2\u20AC\u0153Hallo', '\u201CHallo'],
  ];
  for (const [bad, good] of repairCases) {
    const { text, changed } = repairMojibake(bad);
    if (!changed || !text.includes(good)) {
      throw new Error(`self-test: repair failed "${bad}" -> "${text}" (expected "${good}")`);
    }
  }
}
