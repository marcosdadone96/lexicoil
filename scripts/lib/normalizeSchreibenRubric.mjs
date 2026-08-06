/**
 * Canonical Schreiben rubric schema (fixed English keys).
 * Migrates string "|" / " · " formats and heterogeneous DE/EN objects.
 *
 * Keys: content | vocabulary | grammar | coherence | length
 */

export const SCHREIBEN_RUBRIC_KEYS = Object.freeze([
  'content',
  'vocabulary',
  'grammar',
  'coherence',
  'length',
]);

const ALIAS_TO_KEY = (() => {
  const map = new Map();
  const add = (key, aliases) => {
    for (const a of aliases) map.set(a, key);
  };
  add('content', [
    'content',
    'inhalt',
    'erfüllung',
    'erfuellung',
    'erfüllung der aufgabe',
    'erfuellung der aufgabe',
    'aufgabe',
    'kommunikative aufgabe',
    'aufgabenerfüllung',
    'aufgabenerfuellung',
  ]);
  add('vocabulary', ['vocabulary', 'wortschatz', 'vokabular', 'wortschatz und grammatik']);
  add('grammar', [
    'grammar',
    'grammatik',
    'accuracy',
    'korrektheit',
    'orthografie',
    'grammatik & orthografie',
    'grammatik und orthografie',
    'korrektheit (grammatik, vokabular)',
  ]);
  add('coherence', [
    'coherence',
    'kohärenz',
    'kohaerenz',
    'struktur',
    'ton',
    'höflichkeit',
    'hoeflichkeit',
    'höflichkeit & struktur',
    'hoeflichkeit & struktur',
    'anrede und gruß',
    'anrede und gruss',
  ]);
  add('length', ['length', 'umfang', 'länge', 'laenge', 'wortanzahl', 'wortanzahl 20–30', 'wortanzahl 30–40']);
  return map;
})();

function classifySegmentLabel(label) {
  const raw = String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[–—]/g, '-')
    .trim();
  if (!raw) return null;

  // Direct alias hit on full label or leading phrase before "(" / ":"
  const head = raw.split(/[:(]/)[0].trim();
  if (ALIAS_TO_KEY.has(raw)) return ALIAS_TO_KEY.get(raw);
  if (ALIAS_TO_KEY.has(head)) return ALIAS_TO_KEY.get(head);

  if (/wortschatz|vokabular|vocabulary/.test(raw) && /grammatik|orthograf|accuracy|korrektheit/.test(raw)) {
    return 'grammar'; // combined "Wortschatz und Grammatik" → grammar bucket + keep text
  }
  if (/wortschatz|vokabular|vocabulary/.test(raw)) return 'vocabulary';
  if (/grammatik|orthograf|accuracy|korrektheit/.test(raw)) return 'grammar';
  if (/umfang|lange|length|wortanzahl|worter|wörter/.test(raw)) return 'length';
  if (/koharen|coherence|struktur|ton|hoflich|anrede|gruss|gruß/.test(raw)) return 'coherence';
  if (/inhalt|erfull|aufgabe|content|kommunikativ|meinung|argument|information|punkte/.test(raw)) {
    return 'content';
  }
  return 'content';
}

function appendField(out, key, text) {
  const t = String(text || '').replace(/^[\s–—\-·•]+/, '').trim();
  if (!t || !key) return;
  if (!out[key]) out[key] = t;
  else if (!out[key].includes(t)) out[key] = `${out[key]} | ${t}`;
}

function parsePipeString(str) {
  const out = {};
  const parts = String(str)
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (/^gesamt\b/i.test(part)) continue;
    const m = part.match(/^([^:]+):\s*(.+)$/);
    if (m) {
      const key = classifySegmentLabel(m[1]);
      appendField(out, key, part);
    } else {
      appendField(out, classifySegmentLabel(part), part);
    }
  }
  return out;
}

function parseDotString(str) {
  const out = {};
  const parts = String(str)
    .split(/\s*·\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const key = classifySegmentLabel(part);
    appendField(out, key, part);
  }
  return out;
}

function normalizeObjectRubric(obj) {
  const keys = Object.keys(obj || {});
  // Re-split legacy collapse: single "content" holding multi-label prose
  if (keys.length === 1 && keys[0] === 'content' && typeof obj.content === 'string') {
    const split = parseLabeledProse(obj.content);
    if (split && Object.keys(split).length > 1) return split;
  }
  const out = {};
  for (const [rawKey, value] of Object.entries(obj || {})) {
    if (value == null || value === '') continue;
    const key =
      ALIAS_TO_KEY.get(String(rawKey).toLowerCase().trim()) ||
      classifySegmentLabel(rawKey) ||
      'content';
    // accuracy often covers both grammar+vocab — keep under grammar
    appendField(out, key, String(value));
  }
  // Split combined "Wortschatz und Grammatik" text into both buckets when only grammar got it
  if (out.grammar && /wortschatz/i.test(out.grammar) && !out.vocabulary) {
    out.vocabulary = out.grammar;
  }
  return out;
}

function parseLabeledProse(str) {
  const out = {};
  // "Inhalt: … (1 Punkt). Grammatik & Orthografie: … (1 Punkt). Umfang: …"
  const re =
    /(?:^|[.]\s+)((?:Inhalt|Erfüllung(?:\s+der\s+Aufgabe)?|Kommunikative\s+Aufgabe|Grammatik(?:\s*[&und]+\s*Orthografie)?|Korrektheit(?:[^:]*)?|Wortschatz(?:\s+und\s+Grammatik)?|Höflichkeit(?:\s*[&und]+\s*Struktur)?|Anrede(?:\s+und\s+Gruß)?|Umfang|Länge|Wortanzahl|Ton|Struktur|Kohärenz)[^:]*):\s*/gi;
  const matches = [...String(str).matchAll(re)];
  if (matches.length < 2) return null;
  for (let i = 0; i < matches.length; i++) {
    const label = matches[i][1];
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : str.length;
    const body = str.slice(start, end).replace(/\s*Gesamt:.*$/i, '').trim().replace(/[.]\s*$/, '');
    const key = classifySegmentLabel(label);
    appendField(out, key, `${label.trim()}: ${body}`);
  }
  return Object.keys(out).length ? out : null;
}

/** @returns {Record<string,string>|null} */
export function normalizeSchreibenRubric(rubric) {
  if (rubric == null || rubric === '') return null;
  if (typeof rubric === 'object' && !Array.isArray(rubric)) {
    const out = normalizeObjectRubric(rubric);
    return Object.keys(out).length ? out : null;
  }
  if (typeof rubric !== 'string') return null;
  const s = rubric.trim();
  if (!s) return null;
  let out;
  if (s.includes('|')) out = parsePipeString(s);
  else if (s.includes('·') || /^[–—\-]/.test(s)) out = parseDotString(s);
  else out = parseLabeledProse(s) || parsePipeString(s);
  return Object.keys(out).length ? out : { content: s };
}

/**
 * If correctAnswer holds a model example (not "rubric"), fold it into explanation.
 * Then set correct/correctAnswer to the B1 convention "rubric"/"rubric".
 */
export function normalizeSchreibenCorrectFields(q) {
  const out = { ...q };
  const ca = out.correctAnswer;
  const isExample =
    typeof ca === 'string' &&
    ca.trim() !== '' &&
    ca.trim().toLowerCase() !== 'rubric';

  if (isExample) {
    const snippet = ca.trim().slice(0, 48);
    const expl = typeof out.explanation === 'string' ? out.explanation : '';
    if (!expl.includes(snippet)) {
      const labeled = /^\s*beispiel/i.test(ca.trim()) ? ca.trim() : `Beispiel: ${ca.trim()}`;
      out.explanation = expl ? `${expl} ${labeled}` : labeled;
    }
  }

  out.correct = 'rubric';
  out.correctAnswer = 'rubric';
  return out;
}
