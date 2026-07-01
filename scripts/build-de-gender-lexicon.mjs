#!/usr/bin/env node
/**
 * Build data/lexicon/de-gender.json — lemma → m|f|n
 * Sources: manual overrides, library vocab lemmas, suffix heuristics.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/** High-confidence B1–C1 nouns (frequency + exam vocabulary). */
const OVERRIDES = {
  frau: 'f', mann: 'm', auto: 'n', kind: 'n', haus: 'n', stadt: 'f', tag: 'm', nacht: 'f',
  jahr: 'n', monat: 'm', woche: 'f', stunde: 'f', minute: 'f', sekunde: 'f', morgen: 'm',
  abend: 'm', mittag: 'm', sommer: 'm', winter: 'm', frühling: 'm', herbst: 'm', sonne: 'f',
  mond: 'm', stern: 'm', himmel: 'm', wolke: 'f', regen: 'm', schnee: 'm', wind: 'm',
  wetter: 'n', temperatur: 'f', grad: 'm', land: 'n', stadt: 'f', dorf: 'n', welt: 'f',
  europa: 'n', deutschland: 'n', berlin: 'n', münchen: 'n', hamburg: 'n', wien: 'n',
  zürich: 'n', name: 'm', vorname: 'm', nachname: 'm', alter: 'n', geburtsdatum: 'n',
  geburtsort: 'm', adresse: 'f', straße: 'f', platz: 'm', nummer: 'f', telefon: 'n',
  handy: 'n', computer: 'm', laptop: 'm', internet: 'n', email: 'f', post: 'f', brief: 'm',
  paket: 'n', geschenk: 'n', geld: 'n', euro: 'm', cent: 'm', preis: 'm', kosten: 'f',
  rechnung: 'f', konto: 'n', bank: 'f', karte: 'f', kreditkarte: 'f', schuld: 'f',
  gehalt: 'n', lohn: 'm', arbeit: 'f', job: 'm', stelle: 'f', beruf: 'm', karriere: 'f',
  firma: 'f', unternehmen: 'n', chef: 'm', chefin: 'f', kollege: 'm', kollegin: 'f',
  mitarbeiter: 'm', angestellter: 'm', kunde: 'm', kundin: 'f', team: 'n', projekt: 'n',
  meeting: 'n', termin: 'm', pause: 'f', urlaub: 'm', freizeit: 'f', hobby: 'n',
  sport: 'm', fußball: 'm', schwimmen: 'n', laufen: 'n', spazieren: 'n', reise: 'f',
  flug: 'm', flugzeug: 'n', zug: 'm', bus: 'm', auto: 'n', fahrrad: 'n', ticket: 'n',
  fahrkarte: 'f', bahnhof: 'm', flughafen: 'm', hotel: 'n', zimmer: 'n', bett: 'n',
  bad: 'n', küche: 'f', wohnung: 'f', haus: 'n', tür: 'f', fenster: 'n', schlüssel: 'm',
  tisch: 'm', stuhl: 'm', sofa: 'n', lampe: 'f', bild: 'n', wand: 'f', boden: 'm',
  decke: 'f', keller: 'm', dach: 'n', garten: 'm', blume: 'f', baum: 'm', gras: 'n',
  tier: 'n', hund: 'm', katze: 'f', vogel: 'm', fisch: 'm', essen: 'n', trinken: 'n',
  frühstück: 'n', mittagessen: 'n', abendessen: 'n', brot: 'n', butter: 'f', käse: 'm',
  milch: 'f', wasser: 'n', kaffee: 'm', tee: 'm', saft: 'm', wein: 'm', bier: 'n',
  fleisch: 'n', fisch: 'm', gemüse: 'n', obst: 'n', apfel: 'm', banane: 'f', tomate: 'f',
  kartoffel: 'f', reis: 'm', nudel: 'f', suppe: 'f', salat: 'm', kuchen: 'm', schokolade: 'f',
  zucker: 'm', salz: 'n', pfeffer: 'm', öl: 'n', restaurant: 'n', café: 'n', kellner: 'm',
  kellnerin: 'f', speisekarte: 'f', tisch: 'm', familie: 'f', eltern: 'f', vater: 'm',
  mutter: 'f', sohn: 'm', tochter: 'f', bruder: 'm', schwester: 'f', kind: 'n',
  baby: 'n', opa: 'm', oma: 'f', onkel: 'm', tante: 'f', cousin: 'm', cousine: 'f',
  freund: 'm', freundin: 'f', nachbar: 'm', nachbarin: 'f', partner: 'm', partnerin: 'f',
  ehemann: 'm', ehefrau: 'f', kinder: 'n', leute: 'f', mensch: 'm', person: 'f',
  mann: 'm', frau: 'f', junge: 'm', mädchen: 'n', schule: 'f', universität: 'f',
  klasse: 'f', kurs: 'm', unterricht: 'm', lehrer: 'm', lehrerin: 'f', schüler: 'm',
  schülerin: 'f', student: 'm', studentin: 'f', prüfung: 'f', test: 'm', note: 'f',
  zeugnis: 'n', hausaufgabe: 'f', buch: 'n', heft: 'n', stift: 'm', bleistift: 'm',
  kugelschreiber: 'm', papier: 'n', tasche: 'f', rucksack: 'm', tisch: 'm', stuhl: 'm',
  tafel: 'f', bibliothek: 'f', ausbildung: 'f', anerkennung: 'f', bewerbung: 'f',
  information: 'f', schätzung: 'f', meinung: 'f', idee: 'f', frage: 'f', antwort: 'f',
  problem: 'n', lösung: 'f', grund: 'm', ergebnis: 'n', ziel: 'n', plan: 'm',
  chance: 'f', risiko: 'n', fehler: 'm', erfolg: 'm', misserfolg: 'm', erfahrung: 'f',
  wissen: 'n', sprache: 'f', wort: 'n', satz: 'm', text: 'm', artikel: 'm', name: 'm',
  formular: 'n', vertrag: 'm', unterschrift: 'f', dokument: 'n', papier: 'n',
  gesundheit: 'f', krankheit: 'f', arzt: 'm', ärztin: 'f', krankenhaus: 'n', apotheke: 'f',
  medizin: 'f', schmerz: 'm', kopfschmerzen: 'm', fieber: 'n', husten: 'm', erkältung: 'f',
  umwelt: 'f', natur: 'f', klimawandel: 'm', energie: 'f', strom: 'm', recycling: 'n',
  müll: 'm', plastik: 'n', nachhaltigkeit: 'f', verkehr: 'm', unfall: 'm', polizei: 'f',
  feuerwehr: 'f', regel: 'f', gesetz: 'n', recht: 'n', pflicht: 'f', freiheit: 'f',
  demokratie: 'f', politik: 'f', regierung: 'f', wahl: 'f', staat: 'm', bürger: 'm',
  bürgerin: 'f', kultur: 'f', kunst: 'f', musik: 'f', film: 'm', theater: 'n',
  museum: 'n', konzert: 'n', festival: 'n', feier: 'f', party: 'f', geburtstag: 'm',
  hochzeit: 'f', weihnachten: 'n', ostern: 'n', geschenk: 'n', tradition: 'f',
  religion: 'f', kirche: 'f', glaube: 'm', zeit: 'f', moment: 'm', stunde: 'f',
  woche: 'f', monat: 'm', jahr: 'n', jahrhundert: 'n', vergangenheit: 'f', zukunft: 'f',
  gegenwart: 'f', anfang: 'm', ende: 'n', teil: 'm', stück: 'n', gruppe: 'f',
  menge: 'f', zahl: 'f', prozent: 'n', hälfte: 'f', drittel: 'n', viertel: 'n',
  seite: 'f', kapitel: 'n', absatz: 'm', zeile: 'f', bild: 'n', foto: 'n', kamera: 'f',
  farbe: 'f', rot: 'n', blau: 'n', grün: 'n', gelb: 'n', schwarz: 'n', weiß: 'n',
  größe: 'f', länge: 'f', breite: 'f', höhe: 'f', gewicht: 'n', meter: 'm',
  kilogramm: 'n', liter: 'm', stück: 'n', paar: 'n', doppelzimmer: 'n', einzelzimmer: 'n',
};

function norm(s) {
  return String(s || '').trim().normalize('NFC').toLowerCase();
}

function inferGender(low) {
  const neut = new Set(['feuer', 'wasser', 'messer', 'kreuz', 'herz', 'interieur', 'genie', 'mädchen']);
  if (neut.has(low)) return 'n';
  if (/(chen|lein|tum|ment|nis|ett|on|um)$/i.test(low) && !/(ung|heit|keit)$/i.test(low)) return 'n';
  if (/(ung|heit|keit|schaft|tion|sion|tät|ität|ik|ur|ie|ei|anz|enz)$/i.test(low)) return 'f';
  if (low.endsWith('in') && low.length > 3) return 'f';
  if (/(ling|ismus|or|ant|ent|ich)$/i.test(low)) return 'm';
  if (low.endsWith('er') && low.length >= 4) return 'm';
  if (low.endsWith('ig')) return 'm';
  if (low.endsWith('e') && low.length > 3) return 'f';
  return null;
}

function collectLemmaFiles() {
  const dir = path.join(ROOT, 'library/vocab/de');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  const words = new Set();
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      (data.lemmas || []).forEach((w) => words.add(norm(w)));
    } catch (_) {}
  }
  return words;
}

function collectBankVocab() {
  const dir = path.join(ROOT, 'library/de');
  const words = new Set();
  if (!fs.existsSync(dir)) return words;
  for (const level of fs.readdirSync(dir)) {
    const qf = path.join(dir, level, 'questions.json');
    if (!fs.existsSync(qf)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(qf, 'utf8'));
      Object.keys(data.vocabulary || {}).forEach((w) => words.add(norm(w)));
    } catch (_) {}
  }
  return words;
}

const lex = { ...OVERRIDES };
for (const w of [...collectLemmaFiles(), ...collectBankVocab()]) {
  if (!w || lex[w]) continue;
  const g = inferGender(w);
  if (g) lex[w] = g;
}

const outDir = path.join(ROOT, 'data/lexicon');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'de-gender.json');
fs.writeFileSync(outPath, JSON.stringify(lex));
console.log(`Wrote ${Object.keys(lex).length} entries → ${outPath}`);
