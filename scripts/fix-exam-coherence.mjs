#!/usr/bin/env node
/**
 * fix-exam-coherence.mjs — Reconstruye Lesen T3 y T4 de exámenes curated
 * para garantizar coherencia interna:
 *
 * T3 (matching): todos los ítems de una parte deben compartir el MISMO
 *   conjunto de 10 anuncios (A–J). El banco tiene conjuntos completos de 7
 *   situaciones por pool. Este script detecta el pool dominante en cada examen
 *   y reemplaza la lista con el pool completo si hace falta.
 *
 * T4 (forum opinions): todos los ítems deben ser del MISMO tema/serie de
 *   opiniones individuales (60–90 palabras c/u). El banco tiene sets de 7 ítems
 *   por tema. Este script selecciona el mejor set coherente.
 *
 * Uso:
 *   node scripts/fix-exam-coherence.mjs --dir library/curated/de/B1 --bank library/de/B1/questions.json [--write] [--report report.json]
 */
import fs from 'node:fs';
import path from 'node:path';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const dir = arg('--dir', 'library/curated/de/B1');
const bankPath = arg('--bank', 'library/de/B1/questions.json');
const doWrite = !!arg('--write', false);
const reportPath = arg('--report', null);

const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));

// ── Index T3 pools ────────────────────────────────────────────────────────────
// Group by fingerprint of first option (stable ~50 chars)
function t3PoolKey(item) {
  const opts = item.options || [];
  return opts[0] ? opts[0].replace(/\s+/g, ' ').slice(0, 50) : '__none__';
}

/** @type {Map<string, object[]>} poolKey → [item, ...] */
const t3Pools = new Map();
for (const q of bank.questions || []) {
  if (!/de-b[12]-l-t3|de-[ac][12]-l-t3/.test(q.id) && !/^de-b1-l-t3/.test(q.id)) continue;
  if (q.type !== 'matching' && q.slotType !== 'ads_matching') continue;
  // Accept all matching items regardless of id pattern
  if (q.type === 'matching' || (q.options && q.options.length >= 7)) {
    const key = t3PoolKey(q);
    if (!t3Pools.has(key)) t3Pools.set(key, []);
    t3Pools.get(key).push(q);
  }
}

// Index all bank matching items regardless of id
for (const q of bank.questions || []) {
  if (q.type !== 'matching') continue;
  const key = t3PoolKey(q);
  if (!t3Pools.has(key)) t3Pools.set(key, []);
  // Avoid duplicates
  const pool = t3Pools.get(key);
  if (!pool.find((x) => x.id === q.id)) pool.push(q);
}

// ── Index T4 topic sets ───────────────────────────────────────────────────────
// Each T4 set = items with the same topic prefix (e.g. "de-b1-l-t4-autofrei")
// Individual opinion items have non-empty signText.
function t4TopicKey(q) {
  return q.id.replace(/-q\d+$/, '');
}

/** @type {Map<string, object[]>} topicKey → [item, ...] */
const t4Sets = new Map();
for (const q of bank.questions || []) {
  if (q.type !== 'ja_nein' && q.type !== 'richtig_falsch' && q.type !== 'true_false') continue;
  // Only individual opinion items: non-empty signText
  if (!q.signText || q.signText.trim() === '') continue;
  const key = t4TopicKey(q);
  if (!t4Sets.has(key)) t4Sets.set(key, []);
  t4Sets.get(key).push(q);
}

// Keep only sets with exactly 7 items (complete sets)
const completT4Sets = new Map([...t4Sets.entries()].filter(([, v]) => v.length >= 7));

// ── Helpers ───────────────────────────────────────────────────────────────────
function bankItemToExamItem(q) {
  return {
    id: `ql_${q.id}`,
    type: q.type,
    question: q.question || q.statement || '',
    signText: q.signText || '',
    options: q.options || [],
    correct: q.correct || q.correctAnswer || '',
    correctAnswer: q.correctAnswer || q.correct || '',
    explanation: q.explanation || '',
    grammarTags: q.grammarTags || [],
    topicTags: q.topicTags || [],
    vocabularyTags: q.vocabularyTags || [],
    difficulty: q.difficulty || 3,
    passageId: q.passageId || '',
  };
}

function deriveBankId(curatedId) {
  return (curatedId || '').replace(/^ql_/, '').replace(/-[0-9a-f]{8}$/, '');
}

const T3_KEY_OPTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', '0'];

function parseAdOption(opt) {
  if (typeof opt !== 'string') return { key: null, text: String(opt ?? '').trim() };
  const m = opt.match(/^([a-z])\)\s*(.*)$/i);
  if (m) return { key: m[1].toUpperCase(), text: m[2].trim() };
  return { key: opt.trim().toUpperCase(), text: opt.trim() };
}

/** Build part.ads + key-only item options so correct "0" is renderable in strict fidelity. */
function normalizeLesenT3AdsLayout(p) {
  if (!Array.isArray(p.items) || !p.items.length) return false;
  const sample = p.items.find((i) => Array.isArray(i.options) && i.options.length >= 7);
  if (!sample) return false;
  const hasFullText = sample.options.some((o) => typeof o === 'string' && /^\s*[a-j]\)\s/i.test(o));
  if (!hasFullText) {
    if (!p.ads?.length && sample.options.every((o) => /^[A-J0]$/i.test(String(o)))) {
      p.ads = sample.options
        .filter((o) => /^[A-J]$/i.test(String(o)))
        .map((o) => ({ key: String(o).toUpperCase(), title: '', text: '' }));
    }
    return false;
  }
  p.ads = sample.options.slice(0, 10).map((o) => {
    const { key, text } = parseAdOption(o);
    return { key, title: '', text };
  });
  p.text = sample.options.join('\n');
  for (const item of p.items) item.options = [...T3_KEY_OPTS];
  return true;
}

// ── Process files ─────────────────────────────────────────────────────────────
const files = fs.readdirSync(dir).filter((f) => f.startsWith('curated') && f.endsWith('.json'));
const report = {
  files: 0,
  t3Fixed: 0, t3Unchanged: 0, t3Incomplete: 0,
  t4Fixed: 0, t4Unchanged: 0, t4Incomplete: 0,
  details: [],
};

// Track which bank items are already used in earlier exams (avoid cross-exam duplicates)
const usedT4Ids = new Set();

for (const file of files) {
  const full = path.join(dir, file);
  const x = JSON.parse(fs.readFileSync(full, 'utf8'));
  const e = x.exam || {};
  const detail = { file, t3: {}, t4: {} };

  for (const p of e.lesenParts || []) {
    // ── Fix T3 ──────────────────────────────────────────────────────────────
    if (p.teil === 3 && Array.isArray(p.items)) {
      // Determine dominant pool
      const poolCounts = new Map();
      for (const item of p.items) {
        const key = t3PoolKey(item);
        poolCounts.set(key, (poolCounts.get(key) || 0) + 1);
      }
      let bestKey = null;
      let bestCount = 0;
      for (const [k, cnt] of poolCounts) {
        if (cnt > bestCount && k !== '__none__') { bestKey = k; bestCount = cnt; }
      }

      if (!bestKey) {
        detail.t3 = { status: 'no_pool', items: p.items.length };
        continue;
      }

      // If dominant pool is incomplete, fall back to any complete pool of 7
      const fullPool = t3Pools.get(bestKey) || [];
      if (fullPool.length < 7) {
        // Find another pool with 7+ items (prefer pools not yet heavily used)
        const used7Pools = new Set(report.details.map((d) => d.t3?.poolKey).filter(Boolean));
        for (const [k, v] of t3Pools) {
          if (v.length >= 7 && !used7Pools.has(k.slice(0, 50))) {
            bestKey = k;
            break;
          }
        }
        // Second fallback: any 7-item pool even if reused
        if ((t3Pools.get(bestKey) || []).length < 7) {
          for (const [k, v] of t3Pools) {
            if (v.length >= 7) { bestKey = k; break; }
          }
        }
      }

      const poolItems = (t3Pools.get(bestKey) || []).slice(0, 7);

      if (poolItems.length === 7) {
        // Replace T3 with the complete, coherent pool
        // Preserve item texts but use bank options (the authoritative ad list)
        // Keep only exam items that belong to this pool; supplement from bank
        const examPoolItems = p.items.filter((item) => t3PoolKey(item) === bestKey);
        const examIds = new Set(examPoolItems.map((i) => deriveBankId(i.id)));

        // Items already in exam from the correct pool
        const kept = examPoolItems;
        // Fill missing slots from bank pool
        const toAdd = poolItems.filter((bq) => !examIds.has(bq.id)).slice(0, 7 - kept.length);

        const merged = [...kept, ...toAdd.map(bankItemToExamItem)].slice(0, 7);

        if (merged.length === 7 && (p.items.length !== 7 || poolCounts.size > 1)) {
          p.items = merged;
          // Rebuild part-level `text` from the pool's options (same list for all items)
          if (merged[0] && merged[0].options && merged[0].options.length >= 7) {
            p.text = merged[0].options.join('\n');
          }
          detail.t3 = { status: 'fixed', finalCount: 7, poolKey: bestKey.slice(0, 50) };
          report.t3Fixed++;
        } else if (merged.length < 7) {
          detail.t3 = { status: 'incomplete', finalCount: merged.length, poolKey: bestKey.slice(0, 50) };
          report.t3Incomplete++;
        } else {
          detail.t3 = { status: 'ok', items: 7 };
          report.t3Unchanged++;
        }
        if (normalizeLesenT3AdsLayout(p)) {
          detail.t3 = { ...detail.t3, adsLayout: 'normalized' };
          if (detail.t3.status === 'ok') report.t3Fixed++;
        }
      } else {
        detail.t3 = { status: 'pool_small', poolKey: bestKey.slice(0, 50), poolSize: poolItems.length };
        report.t3Incomplete++;
      }
    }

    // ── Fix T4 ──────────────────────────────────────────────────────────────
    if (p.teil === 4 && Array.isArray(p.items)) {
      // Determine current topic prefixes
      const topicCounts = new Map();
      for (const item of p.items) {
        const key = deriveBankId(item.id).replace(/-q\d+$/, '');
        topicCounts.set(key, (topicCounts.get(key) || 0) + 1);
      }

      // Find the best complete topic set (7 items) not yet fully used
      let bestSetKey = null;
      let bestSetScore = -1;

      for (const [setKey, setItems] of completT4Sets) {
        const dominated = topicCounts.get(setKey) || 0;
        // Prefer sets already dominant in this exam; then sets with unused items
        const unused = setItems.filter((i) => !usedT4Ids.has(i.id)).length;
        const score = dominated * 100 + unused;
        if (score > bestSetScore && unused >= 7) {
          bestSetScore = score;
          bestSetKey = setKey;
        }
      }

      // Fallback: allow reuse from any complete set if all have been used
      if (!bestSetKey) {
        for (const [setKey, setItems] of completT4Sets) {
          const dominated = topicCounts.get(setKey) || 0;
          if (dominated > (topicCounts.get(bestSetKey) || 0)) bestSetKey = setKey;
        }
      }

      if (bestSetKey && completT4Sets.has(bestSetKey)) {
        const setItems = completT4Sets.get(bestSetKey).slice(0, 7);
        const isCoherent = topicCounts.size === 1 && topicCounts.has(bestSetKey);

        if (!isCoherent) {
          // Replace T4 with the complete coherent topic set
          p.items = setItems.map(bankItemToExamItem);
          // Update part-level textTitle to match the new topic
          p.textTitle = `Diskussion: ${bestSetKey.replace(/^de-b1-l-t4-/, '').replace(/-/g, ' ')}`;
          // Clear the part-level text (it was the wrong vegetarismus passage; each item has its own signText)
          p.text = '';
          p.passageId = setItems[0]?.passageId || '';
          // Mark these as used
          setItems.forEach((i) => usedT4Ids.add(i.id));
          detail.t4 = { status: 'fixed', topicSet: bestSetKey, finalCount: 7 };
          report.t4Fixed++;
        } else {
          detail.t4 = { status: 'ok', topicSet: bestSetKey };
          report.t4Unchanged++;
        }
      } else {
        detail.t4 = { status: 'no_complete_set', topicCount: topicCounts.size };
        report.t4Incomplete++;
      }
    }
  }

  report.details.push(detail);
  report.files++;
  if (doWrite) fs.writeFileSync(full, JSON.stringify(x, null, 2), 'utf8');
}

// ── Output ────────────────────────────────────────────────────────────────────
console.log('\n══ fix-exam-coherence ═══════════════════════════════');
console.log(`Archivos: ${report.files}`);
console.log(`T3 arreglados: ${report.t3Fixed} | sin cambios: ${report.t3Unchanged} | incompletos: ${report.t3Incomplete}`);
console.log(`T4 arreglados: ${report.t4Fixed} | sin cambios: ${report.t4Unchanged} | incompletos: ${report.t4Incomplete}`);
console.log(doWrite ? 'MODO ESCRITURA: archivos actualizados.' : 'DRY-RUN (usa --write para guardar).');
console.log('');

for (const d of report.details) {
  const t3ok = d.t3.status === 'ok' || d.t3.status === 'fixed';
  const t4ok = d.t4.status === 'ok' || d.t4.status === 'fixed';
  const badge = (t3ok && t4ok) ? '✅' : '⚠️ ';
  console.log(`${badge} ${d.file}`);
  if (d.t3.status) {
    const s = d.t3;
    const label = s.status === 'fixed' ? `✓ ${s.finalCount} ítems (pool coherente)` : s.status === 'ok' ? '✓ OK' : `⚠ ${JSON.stringify(s)}`;
    console.log(`     T3: ${label}`);
  }
  if (d.t4.status) {
    const s = d.t4;
    const label = s.status === 'fixed' ? `✓ 7 ítems tema "${s.topicSet}"` : s.status === 'ok' ? '✓ OK' : `⚠ ${JSON.stringify(s)}`;
    console.log(`     T4: ${label}`);
  }
}

if (reportPath) {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nInforme guardado: ${reportPath}`);
}
console.log('');
process.exit(report.t3Incomplete + report.t4Incomplete > 0 ? 1 : 0);
