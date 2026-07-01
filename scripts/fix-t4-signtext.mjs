#!/usr/bin/env node
/**
 * fix-t4-signtext.mjs — Repara los items de Lesen T4 en exámenes curated:
 *
 *   1. Restaura el signText correcto de cada ítem desde el banco de preguntas
 *      (el banco tiene los textos de opinión individuales; el assembler los perdió
 *      al sobreescribirlos con el pasaje de nivel de parte).
 *   2. Elimina ítems cuyo signText queda vacío después de la restauración
 *      (formato incorrecto para T4: son preguntas de comprensión de un único texto,
 *      no opiniones individuales).
 *   3. Detecta mezcla de temas y reporta los conjuntos presentes.
 *   4. Corrige el campo `text` de la parte T4 para que use el primer signText
 *      disponible como referencia contextual (o lo vacía si es el texto incorrecto).
 *
 * Uso:
 *   node scripts/fix-t4-signtext.mjs --dir library/curated/de/B1 --bank library/de/B1/questions.json [--write] [--report informe.json]
 *   (sin --write: dry-run y muestra cambios; con --write: sobreescribe los JSON)
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

// ── Build signText index from bank ────────────────────────────────────────────
const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
/** @type {Map<string, string>} bank id → signText */
const bankSignText = new Map();
for (const q of bank.questions || []) {
  if (q.signText !== undefined && q.signText !== null) {
    bankSignText.set(q.id, q.signText);
  }
}

/**
 * Derive the bank ID from a curated item ID.
 * Curated items have "ql_" prefix and optionally a "-xxxxxxxx" namespace suffix.
 *   "ql_de-b1-l-t4-autofrei-q6"  →  "de-b1-l-t4-autofrei-q6"
 *   "ql_de-b1-l-t4-homeoffice-q2-4ef47183" → "de-b1-l-t4-homeoffice-q2"
 */
function deriveBankId(curatedId) {
  // Strip leading "ql_"
  let id = (curatedId || '').replace(/^ql_/, '');
  // Strip trailing namespace suffix "-xxxxxxxx" (8 hex chars, not part of base id)
  id = id.replace(/-[0-9a-f]{8}$/, '');
  return id;
}

// ── Process files ─────────────────────────────────────────────────────────────
const files = fs.readdirSync(dir).filter((f) => f.startsWith('curated') && f.endsWith('.json'));
const report = { bankItems: bankSignText.size, files: 0, t4Fixed: 0, t4Dropped: 0, t4MixedTopics: 0, details: [] };

for (const file of files) {
  const full = path.join(dir, file);
  const x = JSON.parse(fs.readFileSync(full, 'utf8'));
  const e = x.exam || {};

  for (const p of e.lesenParts || []) {
    if (p.teil !== 4) continue;

    const originalCount = (p.items || []).length;
    const restored = [];
    const dropped = [];
    const topicSets = new Set();

    for (const item of p.items || []) {
      const bankId = deriveBankId(item.id);
      const bankSign = bankSignText.get(bankId);

      // Determine the signText to use
      let newSignText = item.signText;
      if (bankSign !== undefined) {
        newSignText = bankSign; // restore from bank (may be '' for wrong-format items)
      }

      if (!newSignText || newSignText.trim() === '') {
        // Drop items with no individual opinion text — they are single-text comprehension items
        // (wrong format for T4 individual opinions)
        dropped.push({
          id: item.id,
          bankId,
          reason: 'signText vacío en banco — formato incorrecto para T4 opiniones individuales',
        });
        report.t4Dropped++;
      } else {
        const updated = { ...item, signText: newSignText };
        restored.push(updated);
        // Track topic prefix for coherence check
        const prefix = bankId.replace(/-q\d+$/, '');
        topicSets.add(prefix);
      }
    }

    const detail = {
      file,
      originalCount,
      restoredCount: restored.length,
      droppedCount: dropped.length,
      topicSets: [...topicSets],
      mixed: topicSets.size > 1,
      dropped,
    };

    if (topicSets.size > 1) {
      report.t4MixedTopics++;
      detail.warning = `⚠️  Mezcla de ${topicSets.size} temas en T4: ${[...topicSets].join(', ')}`;
    }

    report.t4Fixed += restored.filter((r, i) => r.signText !== (p.items || [])[i]?.signText).length;
    report.details.push(detail);

    // Apply the fix
    p.items = restored;

    // If the part-level text is the wrong vegetarismus passage (it replaced individual opinions),
    // set it to the topic title or clear it — T4 part text is just context, not a reading passage.
    // We detect it if it starts with the well-known vegetarismus sentence.
    const VEG_MARKER = 'Viele Schülerinnen und Schüler wünschen sich eine gesündere Ernährung';
    if (p.text && p.text.startsWith(VEG_MARKER) && topicSets.size > 0) {
      // Keep textTitle; clear the body text since each item has its own signText
      p.text = '';
    }
  }

  report.files++;
  if (doWrite) fs.writeFileSync(full, JSON.stringify(x, null, 2), 'utf8');
}

// ── Output ────────────────────────────────────────────────────────────────────
console.log('\n══ fix-t4-signtext ══════════════════════════════════');
console.log(`Banco: ${bankSignText.size} signTexts indexados`);
console.log(`Archivos procesados: ${report.files}`);
console.log(`Ítems T4 restaurados (signText corregido): ${report.t4Fixed}`);
console.log(`Ítems T4 eliminados (signText vacío): ${report.t4Dropped}`);
console.log(`Exámenes con mezcla de temas en T4: ${report.t4MixedTopics}`);
console.log(doWrite ? 'MODO ESCRITURA: archivos actualizados.' : 'DRY-RUN (usa --write para guardar).');
console.log('');

for (const d of report.details) {
  const ok = !d.mixed && d.droppedCount === 0 && d.restoredCount === 7;
  console.log(`  ${ok ? '✅' : '⚠️ '} ${d.file}: T4 ${d.originalCount}→${d.restoredCount} ítems (${d.droppedCount} eliminados)`);
  if (d.mixed) console.log(`       ${d.warning}`);
  if (d.dropped.length) {
    d.dropped.forEach((dr) => console.log(`       🗑️  ${dr.id}: ${dr.reason}`));
  }
}

if (reportPath) {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nInforme guardado: ${reportPath}`);
}

console.log('');
process.exit(report.t4MixedTopics > 0 ? 1 : 0);
