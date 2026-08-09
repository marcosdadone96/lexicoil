/**
 * DWDS gender lookup — Goethe cache/API + HTML Grammatik line.
 * Used by expand-gender-ground-truth.mjs and audit tooling.
 */

const GENUS_MAP = {
  'mask.': 'm',
  maskulinum: 'm',
  maskulin: 'm',
  'fem.': 'f',
  femininum: 'f',
  feminin: 'f',
  'neutr.': 'n',
  neutrum: 'n',
  neutral: 'n',
};

const ARTICLE_MAP = { der: 'm', die: 'f', das: 'n' };

export function normLemma(s) {
  return String(s || '').trim().normalize('NFC').toLowerCase();
}

/** Map DWDS Goethe row → m|f|n or null if not a singular noun gender. */
export function genderFromGoetheRow(row) {
  if (!row || String(row.pos || '') !== 'Substantiv') return null;
  const genera = (row.genera || []).map((g) => String(g).toLowerCase());
  if (genera.length !== 1) return null;
  const g = genera[0];
  if (/fem/.test(g)) return 'f';
  if (/mask/.test(g)) return 'm';
  if (/neut/.test(g)) return 'n';
  const articles = (row.articles || []).map((a) => String(a).toLowerCase());
  if (articles.length === 1 && ARTICLE_MAP[articles[0]]) return ARTICLE_MAP[articles[0]];
  return null;
}

/** Parse gender from DWDS /wb/ HTML Grammatik block. */
export function parseGenderFromDwdsHtml(html, lemma) {
  if (!html || html.length < 40) {
    return { status: 'not_found', gender: null, pos: null, reasons: ['empty html'] };
  }
  if (/404 – Seite nicht gefunden|Seite nicht gefunden/i.test(html)) {
    return { status: 'not_found', gender: null, pos: null, reasons: ['DWDS 404'] };
  }

  const reasons = [];
  const wortart = html.match(/dwdswb-ft-wortart[^>]*>\s*([^<]+)/i)?.[1]?.trim() || null;
  if (wortart && !/substantiv/i.test(wortart)) {
    reasons.push(`DWDS Wortart ${wortart}`);
    return { status: 'not_noun', gender: null, pos: wortart, reasons };
  }

  const gramBlock =
    html.match(/Grammatik[\s\S]{0,400}?dwdswb-ft-blocktext[\s\S]{0,250}?<\/span>/i)?.[0] ||
    html.match(/Grammatik[\s\S]{0,120}?Substantiv\s*\([^)]+\)/i)?.[0] ||
    '';
  const gramText = gramBlock.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const directGenus = html.match(/Substantiv\s*\((Maskulinum|Femininum|Neutrum)\)/i);
  if (directGenus) {
    const inner = directGenus[1].toLowerCase();
    if (/maskulinum/.test(inner)) {
      return { status: 'ok', gender: 'm', pos: 'Substantiv', reasons: [`Grammatik: ${inner}`] };
    }
    if (/femininum/.test(inner)) {
      return { status: 'ok', gender: 'f', pos: 'Substantiv', reasons: [`Grammatik: ${inner}`] };
    }
    if (/neutrum/.test(inner)) {
      return { status: 'ok', gender: 'n', pos: 'Substantiv', reasons: [`Grammatik: ${inner}`] };
    }
  }

  if (/Substantiv\s*\(([^)]+)\)/i.test(gramText)) {
    const inner = gramText.match(/Substantiv\s*\(([^)]+)\)/i)[1].toLowerCase();
    if (/maskulinum|maskulin/.test(inner)) {
      return { status: 'ok', gender: 'm', pos: 'Substantiv', reasons: [`Grammatik: ${inner}`] };
    }
    if (/femininum|feminin/.test(inner)) {
      return { status: 'ok', gender: 'f', pos: 'Substantiv', reasons: [`Grammatik: ${inner}`] };
    }
    if (/neutrum|neutral/.test(inner)) {
      return { status: 'ok', gender: 'n', pos: 'Substantiv', reasons: [`Grammatik: ${inner}`] };
    }
    if (/,/.test(inner) || /\//.test(inner) || /oder/i.test(inner)) {
      reasons.push(`ambiguous genus: ${inner}`);
      return { status: 'ambiguous', gender: null, pos: 'Substantiv', reasons };
    }
  }

  if (/Substantiv/i.test(gramText) || /substantiv/i.test(wortart || '')) {
    const art = html.match(/\b(der|die|das)\s+<(?:em|strong|span|a)[^>]*>\s*[^<]*${lemma}/i);
    if (art) {
      const g = ARTICLE_MAP[art[1].toLowerCase()];
      if (g) return { status: 'ok', gender: g, pos: 'Substantiv', reasons: [`article ${art[1]}`] };
    }
  }

  reasons.push('no genus in Grammatik block');
  return { status: 'unknown', gender: null, pos: wortart, reasons };
}

export async function fetchDwdsHtml(lemma, fetchImpl = fetch) {
  const url = `https://www.dwds.de/wb/${encodeURIComponent(lemma)}`;
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'LexiLoop-gender-gt/1.0' } });
  const html = await res.text();
  return { url, status: res.status, html };
}

export async function lookupDwdsGender(lemma, fetchImpl = fetch) {
  const { url, status, html } = await fetchDwdsHtml(lemma, fetchImpl);
  const parsed = parseGenderFromDwdsHtml(html, lemma);
  return { ...parsed, url, httpStatus: status };
}

export function buildGoetheIndex(rows, sourceLabel) {
  const index = new Map();
  for (const row of rows || []) {
    const lemma = normLemma((row.sch || [])[0]?.lemma);
    const gender = genderFromGoetheRow(row);
    if (!lemma || !gender || index.has(lemma)) continue;
    index.set(lemma, { gender, source: sourceLabel, url: row.url || null });
  }
  return index;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
