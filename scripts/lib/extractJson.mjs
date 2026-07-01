/**
 * Parse JSON from a model response (plain JSON or fenced code block).
 */
export function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Respuesta vacía del modelo');

  try {
    return JSON.parse(trimmed);
  } catch (_) {
    /* try fenced block */
  }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    return JSON.parse(fence[1].trim());
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new Error('No se encontró JSON válido en la respuesta');
}

const TEIL_MARKER =
  /^(?:={3,}|-{3,}|#{1,3})\s*(?:TEIL|Teil|teil)\s*(\d)\s*(?:={3,}|-{3,})?\s*$/im;

const MODULE_MARKER =
  /^(?:={3,}|-{3,}|#{1,3})\s*(?:SCHREIBEN|Schreiben|SPRECHEN|Sprechen|HÖREN|Horen|HOREN)\s*(?:={3,}|-{3,})?\s*$/im;

function parseJsonSlice(slice) {
  try {
    return JSON.parse(slice);
  } catch (_) {
    return null;
  }
}

/** Encuentra objetos JSON de nivel superior por balanceo de llaves. */
export function findTopLevelJsonObjects(text) {
  const src = String(text || '');
  const results = [];
  let i = 0;

  while (i < src.length) {
    const start = src.indexOf('{', i);
    if (start < 0) break;

    let depth = 0;
    let inString = false;
    let escape = false;
    let closedAt = -1;

    for (let j = start; j < src.length; j++) {
      const c = src[j];
      if (inString) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          closedAt = j + 1;
          break;
        }
      }
    }

    if (closedAt < 0) break;

    const slice = src.slice(start, closedAt);
    const obj = parseJsonSlice(slice);
    if (obj && (Array.isArray(obj.questions) || Array.isArray(obj.passages))) {
      results.push(obj);
    }
    i = closedAt;
  }

  return results;
}

function extractFromSegment(segment) {
  const trimmed = String(segment || '').trim();
  if (!trimmed) return [];

  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  if (fenced.length) {
    const out = [];
    for (const m of fenced) {
      const obj = parseJsonSlice(m[1].trim());
      if (obj && (Array.isArray(obj.questions) || Array.isArray(obj.passages))) out.push(obj);
    }
    if (out.length) return out;
  }

  try {
    const one = extractJson(trimmed);
    if (one && (Array.isArray(one.questions) || Array.isArray(one.passages))) return [one];
  } catch (_) {
    /* fall through */
  }

  return findTopLevelJsonObjects(trimmed);
}

export function inferTeilFromBatch(batch) {
  const teils = (batch?.questions || [])
    .map((q) => Number(q?.teil))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  if (!teils.length) return null;
  const counts = new Map();
  for (const t of teils) counts.set(t, (counts.get(t) || 0) + 1);
  let best = null;
  let bestN = 0;
  for (const [t, n] of counts) {
    if (n > bestN) {
      best = t;
      bestN = n;
    }
  }
  return best;
}

/**
 * Extrae uno o varios batches Lesen de un bloc de notas.
 * Soporta separadores opcionales: === TEIL 1 ===, --- Teil 2 ---, # teil 3
 */
export function extractAllLesenBatches(text) {
  const src = String(text || '');
  if (!src.trim()) return [];

  const lines = src.split(/\r?\n/);
  const sections = [];
  let currentTeil = null;
  let buf = [];

  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) sections.push({ teil: currentTeil, body });
    buf = [];
  };

  for (const line of lines) {
    const marker = line.match(TEIL_MARKER);
    if (marker) {
      flush();
      currentTeil = Number(marker[1]);
      continue;
    }
    buf.push(line);
  }
  flush();

  const hasMarkers = sections.some((s) => s.teil != null) || sections.length > 1;
  const segments = hasMarkers && sections.length ? sections : [{ teil: null, body: src }];

  const batches = [];
  for (const seg of segments) {
    const objs = extractFromSegment(seg.body);
    for (const obj of objs) {
      batches.push({
        batch: obj,
        teil: seg.teil ?? inferTeilFromBatch(obj),
      });
    }
  }

  return batches;
}

/**
 * Extrae batches de un bloc de notas (Hören / Schreiben / Sprechen).
 * Hören: === TEIL N === · Schreiben/Sprechen: === SCHREIBEN === / === SPRECHEN ===
 */
export function extractAllExamBatches(text, expectedModule = null) {
  const src = String(text || '');
  if (!src.trim()) return [];

  const lines = src.split(/\r?\n/);
  const sections = [];
  let currentTeil = null;
  let buf = [];

  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) sections.push({ teil: currentTeil, body });
    buf = [];
  };

  for (const line of lines) {
    const teilM = line.match(TEIL_MARKER);
    if (teilM) {
      flush();
      currentTeil = Number(teilM[1]);
      continue;
    }
    const modM = line.match(MODULE_MARKER);
    if (modM) {
      flush();
      currentTeil = null;
      continue;
    }
    buf.push(line);
  }
  flush();

  const hasMarkers = sections.some((s) => s.teil != null) || sections.length > 1;
  const segments = hasMarkers && sections.length ? sections : [{ teil: null, body: src }];

  const batches = [];
  for (const seg of segments) {
    const objs = extractFromSegment(seg.body);
    for (const obj of objs) {
      batches.push({
        batch: obj,
        teil: seg.teil ?? inferTeilFromBatch(obj),
      });
    }
  }

  return batches;
}
