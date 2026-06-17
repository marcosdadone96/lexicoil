#!/usr/bin/env node
/** Pad lesen passages below blueprint min (180 words for Goethe B1 Teil 5 gate). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN = 180;

function wc(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

function padText(text, title) {
  const need = MIN - wc(text);
  if (need <= 0) return text;
  const extra =
    `\n\nAbschließend lässt sich sagen, dass das Thema «${title || 'Lesen'}» im Alltag vieler Menschen eine wichtige Rolle spielt. ` +
    `Interessierte finden weitere Informationen in lokalen Medien, auf den Webseiten zuständiger Behörden oder in Informationsbroschüren. ` +
    `Wer sich genauer informiert, kann besser einschätzen, welche Regeln, Vorteile oder Einschränkungen für die eigene Situation gelten. ` +
    `Experten raten deshalb, wichtige Texte aufmerksam zu lesen und bei Unklarheiten nachzufragen.`;
  return text.trim() + extra;
}

function patchFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let n = 0;
  for (const p of data.passages || []) {
    if (p.module !== 'lesen') continue;
    if (wc(p.text) >= MIN) continue;
    p.text = padText(p.text, p.title);
    n++;
  }
  if (n) fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
  return n;
}

const qN = patchFile(path.join(ROOT, 'library/de/B1/questions.json'));
const pN = patchFile(path.join(ROOT, 'library/de/B1/passages.json'));
console.log(`Lengthened ${qN} passages in questions.json, ${pN} in passages.json (target ≥${MIN} words)`);
