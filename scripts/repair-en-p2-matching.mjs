#!/usr/bin/env node
/**
 * repair-en-p2-matching.mjs — repara Cambridge Reading Part 2 (person_text_matching)
 * en exámenes ya curados.
 *
 * PROBLEMA: la maquinaria de matching estaba atada al alemán (teil 3, ids "-l-t4-",
 * claves A-F), así que las partes inglesas de P2 cayeron al layout genérico "items".
 * Resultado: cada item quedó con options sin texto ("a) A" … "h) H") y con signText
 * puesto al texto de SU PROPIA respuesta correcta, en vez del bloque completo A-H.
 * El alumno nunca veía los ocho textos.
 *
 * ARREGLO: reconstruye la parte con la forma que ya usa el alemán servido —
 *   part.text          = bloque "A) Título — texto" con las ocho entradas
 *   item.options       = las mismas ocho líneas, con texto real
 *   item.signText      = "" (el texto vive en la parte, no en el item)
 * Los textos salen del banco (library/<lang>/<level>/passages.json); NO se genera
 * contenido nuevo ni se llama a ninguna API.
 *
 * Uso:  node scripts/repair-en-p2-matching.mjs --lang en --level B1
 *       node scripts/repair-en-p2-matching.mjs --lang en --level B1 --apply
 *
 * SAFETY: sin --apply hace CERO escrituras (dry-run por defecto).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const AM = require(path.join(ROOT, 'js/library/adsMatching.js'));

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const LANG = flag('lang', 'en');
const LEVEL = flag('level', 'B1');
const APPLY = argv.includes('--apply');

const SLOT = 'person_text_matching';
const MIN_ADS = 5;

const bankPath = path.join(ROOT, 'library', LANG, LEVEL, 'passages.json');
if (!fs.existsSync(bankPath)) {
  console.error(`No existe el banco de pasajes: ${path.relative(ROOT, bankPath)}`);
  process.exit(1);
}
const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));

const curatedDir = path.join(ROOT, 'library/curated', LANG, LEVEL);
const files = fs.existsSync(curatedDir)
  ? fs.readdirSync(curatedDir).filter((f) => /^curated_.*\.json$/i.test(f)).sort()
  : [];
if (!files.length) {
  console.error(`Sin exámenes curados en ${path.relative(ROOT, curatedDir)}`);
  process.exit(1);
}

/** "E: Coastal Wildlife Reserve" -> "Coastal Wildlife Reserve" */
function stripKeyPrefix(title, key) {
  return String(title || '')
    .replace(new RegExp(`^\\s*${key}\\s*[:)\\-–—]\\s*`, 'i'), '')
    .trim();
}

function adLine(ad) {
  const title = stripKeyPrefix(ad.title, ad.key);
  return title ? `${ad.key}) ${title} — ${ad.text}` : `${ad.key}) ${ad.text}`;
}

let repaired = 0, skipped = 0, failed = 0;

for (const file of files) {
  const full = path.join(curatedDir, file);
  const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
  const parts = doc?.exam?.lesenParts;
  if (!Array.isArray(parts)) { console.log(`SKIP  ${file} — sin lesenParts`); skipped++; continue; }

  const part = parts.find((p) => p?.blueprintSlot === SLOT);
  if (!part) { console.log(`SKIP  ${file} — sin parte ${SLOT}`); skipped++; continue; }

  const items = Array.isArray(part.items) ? part.items : [];
  if (!items.length) { console.log(`SKIP  ${file} — parte sin items`); skipped++; continue; }

  // Idempotencia: si las options ya llevan texto real, no hay nada que reparar.
  const alreadyOk = items.every(
    (it) => Array.isArray(it.options) && it.options.every((o) => String(o).trim().length > 12),
  );
  if (alreadyOk) { console.log(`SKIP  ${file} — ya reparado`); skipped++; continue; }

  const ads = AM.buildAdsFromPassages(bank, items);
  if (ads.length < MIN_ADS) {
    console.error(`FAIL  ${file} — solo ${ads.length} texto(s) hallados en el banco para ${items[0]?.id}`);
    failed++;
    continue;
  }

  const lines = ads.map(adLine);
  const keys = ads.map((a) => a.key);

  // Toda respuesta correcta debe existir entre las claves recuperadas.
  const orphan = items.map((it) => AM.normalizeMatchingCorrect(it.correct)).find((c) => !keys.includes(c));
  if (orphan) {
    console.error(`FAIL  ${file} — respuesta "${orphan}" fuera de [${keys.join('')}]`);
    failed++;
    continue;
  }

  part.text = lines.join('\n');
  delete part.textTitle;   // apuntaba a UNA sola opción; el bloque ya no tiene título propio
  delete part.passageId;   // idem: el id de un solo pasaje
  for (const it of items) {
    it.options = [...lines];
    it.signText = '';
    it.correct = AM.normalizeMatchingCorrect(it.correct);
    delete it.passageId;
  }

  console.log(`OK    ${file} — ${ads.length} textos [${keys.join('')}], ${items.length} items`);
  if (APPLY) fs.writeFileSync(full, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  repaired++;
}

console.log(`\n${APPLY ? 'APLICADO' : 'DRY-RUN'}: ${repaired} reparado(s), ${skipped} omitido(s), ${failed} fallido(s)`);
if (!APPLY && repaired) console.log('Reejecuta con --apply para escribir los cambios.');
process.exit(failed ? 1 : 0);
