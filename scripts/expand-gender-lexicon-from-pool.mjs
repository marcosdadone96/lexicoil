#!/usr/bin/env node
/**
 * Add pool-verified frequent nouns to de-gender.json (DWDS-checked genders).
 * Run: node scripts/expand-gender-lexicon-from-pool.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEX = path.join(ROOT, 'data/lexicon/de-gender.json');

/** Top pool gaps (lemma → gender), verified against DWDS 2026-07-13 */
const POOL_ADDITIONS = {
  autorin: 'f', // die Autorin
  beispiel: 'n', // das Beispiel
  alltag: 'm', // der Alltag
  anmeldung: 'f', // die Anmeldung
  bedeutung: 'f', // die Bedeutung
  angebot: 'n', // das Angebot
  anzeige: 'f', // die Anzeige
  nutzung: 'f', // die Nutzung
  tätigkeit: 'f', // die Tätigkeit
  möglichkeit: 'f', // die Möglichkeit
  stress: 'm', // der Stress
  umgebung: 'f', // die Umgebung
  heizung: 'f', // die Heizung
  wunsch: 'm', // der Wunsch
  beratung: 'f', // die Beratung
  bildschirm: 'm', // der Bildschirm
  abholung: 'f', // die Abholung
  hausverwaltung: 'f', // die Hausverwaltung
  entsorgung: 'f', // die Entsorgung
  nachbarschaft: 'f', // die Nachbarschaft
  verwaltung: 'f', // die Verwaltung
  aktivität: 'f', // die Aktivität
  beginn: 'm', // der Beginn
  erholung: 'f', // die Erholung
  luft: 'f', // die Luft
  nachhilfe: 'f', // die Nachhilfe
  aspekt: 'm', // der Aspekt
  einstellung: 'f', // die Einstellung
  kauf: 'm', // der Kauf
  wichtigkeit: 'f', // die Wichtigkeit
};

const lex = JSON.parse(fs.readFileSync(LEX, 'utf8'));
let added = 0;
for (const [k, v] of Object.entries(POOL_ADDITIONS)) {
  if (!lex[k]) {
    lex[k] = v;
    added += 1;
  }
}
const sorted = Object.fromEntries(Object.keys(lex).sort().map((k) => [k, lex[k]]));
fs.writeFileSync(LEX, JSON.stringify(sorted));

const logPath = path.join(ROOT, 'batches/ready/gate-logs/gender-pool-expansion-2026-07-13.json');
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(
  logPath,
  JSON.stringify(
    {
      scannedAt: new Date().toISOString(),
      source: 'pool-verified top gaps + DWDS',
      addedCount: added,
      additions: POOL_ADDITIONS,
      lexiconSize: Object.keys(sorted).length,
    },
    null,
    2,
  ),
);

console.log(`Added ${added} pool-verified nouns → lexicon size ${Object.keys(sorted).length}`);
console.log(`Log: ${path.relative(ROOT, logPath)}`);
