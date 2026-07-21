#!/usr/bin/env node
/**
 * Risk analysis: ADJ_NEEDS_ARTICLE_GUARD expansion candidates.
 * Read-only corpus scan — no code changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../scripts/lib/loadEnv.mjs';
import {
  SUBSTANTIVISING_ARTICLES,
  ADJ_NEEDS_ARTICLE_GUARD,
  isKnownGermanNoun,
} from '../../scripts/lib/capitalizeNouns.mjs';

const OUT_JSON = path.join(ROOT, 'batches/ready/ADJ-GUARD-RISK-ANALYSIS.json');
const OUT_MD = path.join(ROOT, 'batches/ready/ADJ-GUARD-RISK-ANALYSIS.md');

const STEMS = {
  wichtig: /^wichtig/i,
  täglich: /^täglich/i,
  letzt: /^letzt/i,
  nächst: /^nächst/i,
  sportlich: /^sportlich/i,
  breit: /^breit/i,
  klein: /^klein/i,
  ähnlich: /^ähnlich/i,
};

const SUBSTANTIVIZERS = new Set([
  'etwas', 'nichts', 'viel', 'wenig', 'alles', 'manch', 'einiges', 'weniges',
  'vieles', 'manches', 'alles', 'genug', 'mehr', 'weniger',
]);

const TOKEN_RE = /([A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*)|([^A-Za-zÄÖÜäöüß]+)/g;

function lemma(w) {
  return String(w || '').toLowerCase().replace(/^[^a-zäöüß]+|[^a-zäöüß]+$/gi, '');
}

function stemOf(word) {
  for (const [stem, re] of Object.entries(STEMS)) {
    if (re.test(word)) return stem;
  }
  return null;
}

function isCapitalized(w) {
  return /^[A-ZÄÖÜ]/.test(w) && /[a-zäöüß]/.test(w);
}

function tokenize(text) {
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    out.push({ token: m[0], isWord: /[A-Za-zÄÖÜäöüß]/.test(m[0]) });
  }
  return out;
}

function isMidSentence(prev) {
  return /[.!?…:;]\s*$/.test(prev) || (prev.length > 0 && !/^[.!?…\s]*$/.test(prev));
}

function nextWord(chunks, i) {
  for (let j = i + 1; j < chunks.length; j++) {
    if (chunks[j].isWord) return chunks[j].token;
  }
  return '';
}

function prevWord(chunks, i) {
  for (let j = i - 1; j >= 0; j--) {
    if (chunks[j].isWord) return chunks[j].token;
  }
  return '';
}

function classifyOccurrence(word, prev, next, field, file, snippet) {
  const prevL = lemma(prev);
  const nextL = lemma(next);
  const wordL = lemma(word);
  const inGuard = ADJ_NEEDS_ARTICLE_GUARD.has(wordL);

  // Substantivizer triggers (etwas Wichtiges)
  if (SUBSTANTIVIZERS.has(prevL)) {
    return { type: 'substantivized', reason: `tras sustantivador «${prev}»`, inGuard };
  }

  // die/der + Word + capitalized noun = likely adj before noun
  // die + Word alone or + lowercase = ambiguous/substantivized
  if (SUBSTANTIVISING_ARTICLES.has(prevL)) {
    if (isCapitalized(next) && !SUBSTANTIVISING_ARTICLES.has(nextL)) {
      // die Kleinen Läden — adj before noun (Läden is noun)
      // die Kleinen — if no next or next is verb/punct, substantivized
      if (stemOf(word) === 'klein' && /läden|geschäfte|kinder|leute/i.test(next)) {
        return { type: 'ambiguous', reason: `artículo+${word}+${next} (adj vs sustantivación coloquial)`, inGuard };
      }
      if (stemOf(word) === 'wichtig' && /schritt|rolle|teil|punkt|thema/i.test(next)) {
        return { type: 'adjectival', reason: `artículo «${prev}» + adj + sustantivo «${next}»`, inGuard };
      }
      return { type: 'adjectival', reason: `artículo «${prev}» + adj + «${next}»`, inGuard };
    }
    // die Kleinen (without following noun) — substantivized
    if (!next || !isCapitalized(next)) {
      if (['klein', 'wichtig', 'letzt', 'nächst'].includes(stemOf(word))) {
        return { type: 'substantivized', reason: `artículo «${prev}» + ${word} sin sustantivo siguiente (sustantivado)`, inGuard };
      }
    }
    return { type: 'adjectival', reason: `tras artículo «${prev}»`, inGuard };
  }

  if (isKnownGermanNoun(word)) {
    return { type: 'substantivized', reason: 'en lexicon como sustantivo', inGuard };
  }

  // Temporal adj in prepositional phrase: in den Letzten Jahren
  if (['letzt', 'nächst', 'täglich'].includes(stemOf(word)) && ['in', 'an', 'auf', 'für', 'von', 'zu', 'bei'].includes(prevL)) {
    return { type: 'adjectival', reason: `prep «${prev}» + ${word} (adj temporal)`, inGuard };
  }

  if (isCapitalized(next)) {
    return { type: 'adjectival', reason: `seguido de sustantivo «${next}»`, inGuard };
  }

  return { type: 'ambiguous', reason: `contexto no claro (prev=${prev}, next=${next})`, inGuard };
}

function extractSnippet(text, word, radius = 55) {
  const idx = text.indexOf(word);
  if (idx < 0) return text.slice(0, 120);
  return `…${text.slice(Math.max(0, idx - radius), idx + word.length + radius)}…`;
}

function scanText(text, file, field) {
  const hits = [];
  const chunks = tokenize(text);
  let prevContent = '';
  for (let i = 0; i < chunks.length; i++) {
    const { token, isWord } = chunks[i];
    if (!isWord) {
      prevContent += token;
      continue;
    }
    const stem = stemOf(token);
    if (stem && isCapitalized(token) && isMidSentence(prevContent)) {
      const prev = prevWord(chunks, i);
      const next = nextWord(chunks, i);
      const cls = classifyOccurrence(token, prev, next, field, file, extractSnippet(text, token));
      hits.push({
        stem,
        word: token,
        file,
        field,
        prev,
        next,
        classification: cls.type,
        reason: cls.reason,
        alreadyInGuard: cls.inGuard,
        snippet: extractSnippet(text, token),
      });
    }
    prevContent += token;
  }
  return hits;
}

function walkBatch(batch, file, visitor) {
  (batch.passages || []).forEach((p, pi) => {
    if (p.text) visitor(`${file}::passages[${pi}].text`, p.text);
    if (p.title) visitor(`${file}::passages[${pi}].title`, p.title);
    if (Array.isArray(p.ads)) p.ads.forEach((a, ai) => visitor(`${file}::ads[${ai}]`, a));
  });
  (batch.questions || []).forEach((q, qi) => {
    for (const k of ['question', 'signText', 'explanation', 'statement']) {
      if (q[k]) visitor(`${file}::questions[${qi}].${k}`, q[k]);
    }
    (q.options || []).forEach((o, oi) => {
      const t = typeof o === 'string' ? o : o?.text;
      if (t) visitor(`${file}::questions[${qi}].options[${oi}]`, t);
    });
  });
}

function collectCorpusFiles() {
  const dirs = [
    path.join(ROOT, 'batches/generated'),
    path.join(ROOT, 'batches/ready/lesen'),
    path.join(ROOT, 'batches/.staging'),
    path.join(ROOT, 'scripts/lib/__tests__'),
  ];
  const files = new Set();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const abs = path.join(d, ent.name);
        if (ent.isDirectory() && !ent.name.startsWith('node_modules')) walk(abs);
        else if (ent.isFile() && ent.name.endsWith('.json') && /lesen|germanCaps|groundtruth|corpus/i.test(ent.name)) {
          files.add(abs);
        }
      }
    };
    walk(dir);
  }
  return [...files];
}

function dedupeHits(hits) {
  const seen = new Set();
  return hits.filter((h) => {
    const k = `${h.stem}|${h.word}|${h.classification}|${h.snippet}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function summarizeStem(hits, stem) {
  const subset = hits.filter((h) => h.stem === stem);
  const adj = subset.filter((h) => h.classification === 'adjectival');
  const sub = subset.filter((h) => h.classification === 'substantivized');
  const amb = subset.filter((h) => h.classification === 'ambiguous');
  const adjWrong = adj.length; // capitalized adj = error to fix
  const subRight = sub.length; // capitalized substantivized = correct, decap would be regression
  const ambRisk = amb.length;
  const alreadyInGuard = [...new Set(subset.map((h) => lemma(h.word)).filter((w) => ADJ_NEEDS_ARTICLE_GUARD.has(w)))];
  const guardHasStem = Object.entries(STEMS).find(([s]) => s === stem) && subset.some((h) => ADJ_NEEDS_ARTICLE_GUARD.has(lemma(h.word)));

  let risk = 'bajo';
  let recommendation = 'Añadir formas faltantes al guard';

  if (subRight > 0 && adjWrong > 0) risk = 'medio';
  if (subRight > adjWrong) risk = 'alto';
  if (ambRisk >= 3) risk = risk === 'alto' ? 'alto' : 'medio-alto';

  if (stem === 'klein') {
    recommendation = subRight > 0
      ? 'YA en guard; no ampliar — riesgo die Kleinen (S.). Mejor regla contextual nombre propio (Emma)'
      : 'Formas ya cubiertas';
  }
  if (stem === 'wichtig') {
    recommendation = guardHasStem
      ? 'YA en guard (wichtig/wichtiger/…); investigar por qué no decap en prod (orden cap/decap o isMidSentence)'
      : 'Añadir formas';
  }
  if (stem === 'letzt' || stem === 'nächst') {
    recommendation = guardHasStem
      ? 'YA en guard (letzte/nächste/…); añadir solo si faltan flexiones (Letzten, Nächsten)'
      : 'Añadir formas temporales';
  }
  if (stem === 'ähnlich') {
    risk = subRight > 0 ? 'alto' : 'medio';
    recommendation = 'NO añadir globalmente; regla contextual «oder Ähnliches» vs adj+Sustantiv';
  }
  if (stem === 'täglich' || stem === 'sportlich' || stem === 'breit') {
    recommendation = subRight === 0 && ambRisk <= 1
      ? 'Añadir al guard con evidencia — solo usos adjetivales en corpus'
      : 'Añadir con condición: solo tras artículo, no si lexicon noun';
  }

  return {
    stem,
    totalCapitalizedMidSentence: subset.length,
    adjectival: adjWrong,
    substantivized: subRight,
    ambiguous: ambRisk,
    alreadyInGuardForms: alreadyInGuard,
    sampleAdjectival: adj.slice(0, 5),
    sampleSubstantivized: sub.slice(0, 5),
    sampleAmbiguous: amb.slice(0, 5),
    riskOfAddingToGuard: risk,
    recommendation,
  };
}

function main() {
  const corpusFiles = collectCorpusFiles();
  let allHits = [];
  let filesScanned = 0;

  for (const abs of corpusFiles) {
    try {
      const raw = fs.readFileSync(abs, 'utf8');
      const data = JSON.parse(raw);
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
      filesScanned++;

      if (Array.isArray(data)) {
        data.forEach((item, i) => {
          if (item.text) allHits.push(...scanText(item.text, rel, `item[${i}]`));
        });
        continue;
      }
      if (data.decapMustNotChange) {
        for (const item of data.decapMustNotChange) {
          allHits.push(...scanText(item.text, rel, item.id || 'mustNotChange'));
        }
        for (const item of data.decapMustChange || []) {
          allHits.push(...scanText(item.text, rel, item.id || 'mustChange'));
        }
      }
      if (data.passages || data.questions) {
        walkBatch(data, rel, (field, text) => {
          allHits.push(...scanText(text, rel, field));
        });
      }
    } catch {
      /* skip invalid */
    }
  }

  allHits = dedupeHits(allHits);

  const summaries = Object.keys(STEMS).map((s) => summarizeStem(allHits, s));
  const report = {
    generatedAt: new Date().toISOString(),
    corpus: {
      filesScanned,
      totalHits: allHits.length,
      sources: ['batches/generated', 'batches/ready/lesen', 'batches/.staging', 'scripts/lib/__tests__'],
    },
    currentGuardNote: 'wichtig, letzt, nächst, klein ya tienen formas en ADJ_NEEDS_ARTICLE_GUARD; täglich, sportlich, breit, ähnlich NO',
    summaries,
    allHits,
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(OUT_MD, renderMd(report), 'utf8');
  console.log(`Scanned ${filesScanned} files, ${allHits.length} hits`);
  console.log(`Report: ${OUT_MD}`);
  for (const s of summaries) {
    console.log(`  ${s.stem}: adj=${s.adjectival} sub=${s.substantivized} amb=${s.ambiguous} risk=${s.riskOfAddingToGuard}`);
  }
}

function renderMd(r) {
  const lines = [
    '# ADJ_NEEDS_ARTICLE_GUARD — análisis de riesgo',
    '',
    `**Corpus:** ${r.corpus.filesScanned} archivos · ${r.corpus.totalHits} ocurrencias capitalizadas mid-sentence`,
    `**Nota:** ${r.currentGuardNote}`,
    '',
    '## Tabla resumen',
    '',
    '| palabra | usos adjetivales (error FP target) | usos sustantivados (FN riesgo) | ambiguos | ya en guard | riesgo añadir al guard | recomendación |',
    '|---:|---:|---:|---:|---|---:|---|',
    ...r.summaries.map((s) =>
      `| **${s.stem}** | ${s.adjectival} | ${s.substantivized} | ${s.ambiguous} | ${s.alreadyInGuardForms.length ? s.alreadyInGuardForms.join(', ') : '—'} | **${s.riskOfAddingToGuard}** | ${s.recommendation} |`,
    ),
    '',
    '## Detalle por palabra',
    '',
  ];

  for (const s of r.summaries) {
    lines.push(`### ${s.stem}`, '');
    if (s.sampleAdjectival.length) {
      lines.push('**Adjetivales (decap correcto):**');
      for (const h of s.sampleAdjectival) lines.push(`- \`${h.word}\` en \`${h.file}\` — ${h.reason}`);
      lines.push('');
    }
    if (s.sampleSubstantivized.length) {
      lines.push('**Sustantivados (NO decap):**');
      for (const h of s.sampleSubstantivized) lines.push(`- \`${h.word}\` en \`${h.file}\` — ${h.reason}`);
      lines.push('');
    }
    if (s.sampleAmbiguous.length) {
      lines.push('**Ambiguos:**');
      for (const h of s.sampleAmbiguous) lines.push(`- \`${h.word}\` en \`${h.file}\` — ${h.reason}`);
      lines.push('');
    }
  }

  lines.push(`JSON completo: \`ADJ-GUARD-RISK-ANALYSIS.json\``);
  return `${lines.join('\n')}\n`;
}

main();
