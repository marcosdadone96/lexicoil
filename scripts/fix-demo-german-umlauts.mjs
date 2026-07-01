#!/usr/bin/env node
/**
 * Restore proper German ä/ö/ü/ß in goetheDemoExams.js string literals.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'js/content/goetheDemoExams.js');

/** @param {string} t */
function fixUeToUmlaut(t) {
  // ue → ü when it stands for Umlaut (not in zuerst, Konsequenzen, teuer, …)
  return t.replace(/ue/gi, (match, offset, whole) => {
    const before = whole[offset - 1] || '';
    const after = whole[offset + match.length] || '';
    const lower = match.toLowerCase();
    const isCap = match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase();
    const u = isCap ? 'Ü' : 'ü';
    if (/[qQzZ]/i.test(before)) return match;
    if (/^e/i.test(after) && /[sS]$/.test(before)) return match; // …ss + ue + e… (overschüssige)
    if (before.toLowerCase() === 'e' && after.toLowerCase() === 'r') return match; // teuer, Steuer, …
    if (before.toLowerCase() === 'a' && after.toLowerCase() === 'u') return match; // bauen, …
    if (before.toLowerCase() === 'r' && after.toLowerCase() === 'e') return match; // freuen, …
    if (before.toLowerCase() === 'n' && after.toLowerCase() === 'e') return match; // neuen, neue, …
    if (before.toLowerCase() === 'q' && after.toLowerCase() === 'u') return match; // …qu + ue…
    return u;
  });
}

/** @param {string} s */
function fixGermanString(s) {
  let t = s;
  t = t.replace(/Ae/g, 'Ä').replace(/ae/g, 'ä');
  t = t.replace(/Oe/g, 'Ö').replace(/oe/g, 'ö');
  t = fixUeToUmlaut(t);

  // ß (only where German uses Eszett — not after every umlaut+ss)
  const ssToEszeett = [
    [/\bgroesster\b/gi, 'größter'],
    [/\bgroessten\b/gi, 'größten'],
    [/\bgroesser\b/gi, 'größer'],
    [/\bgroesse\b/gi, 'größe'],
    [/\bgrosses\b/gi, 'großes'],
    [/\bgrosser\b/gi, 'großer'],
    [/\bgross\b/gi, 'groß'],
    [/\bGrosser\b/g, 'Großer'],
    [/\bGross\b/g, 'Groß'],
    [/\bGrosse\b/g, 'Große'],
    [/\bAusserdem\b/g, 'Außerdem'],
    [/\bausserhalb\b/g, 'Außerhalb'],
    [/\bAusserhalb\b/g, 'Außerhalb'],
    [/\bStrasse\b/g, 'Straße'],
    [/\bstrasse\b/g, 'straße'],
    [/\bFussnoten\b/g, 'Fußnoten'],
    [/\bGruesse\b/g, 'Grüße'],
    [/\bgruesse\b/g, 'grüße'],
    [/\bGruss\b/g, 'Gruß'],
    [/\bSpass\b/g, 'Spaß'],
    [/\bSchliessen\b/g, 'Schließen'],
    [/\bschliessen\b/g, 'schließen'],
    [/\bschliesst\b/g, 'schließt'],
    [/\babschliessend\b/gi, (m) => (m[0] === 'A' ? 'Abschließend' : 'abschließend')],
    [/\babschliessenden\b/g, 'abschließenden'],
  ];
  for (const [re, rep] of ssToEszeett) {
    t = typeof rep === 'function' ? t.replace(re, rep) : t.replace(re, rep);
  }

  t = t.replace(/\bheisse\b/g, 'heiße');
  t = t.replace(/\bheissen\b/g, 'heißen');
  t = t.replace(/\bHeissen\b/g, 'Heißen');
  t = t.replace(/\bDuesseldorf\b/g, 'Düsseldorf');
  t = t.replace(/\bGoethe\b/g, 'Goethe');
  t = t.replace(/\bGöthe\b/g, 'Goethe');
  t = t.replace(/\bRodrigüz\b/g, 'Rodriguez');
  t = t.replace(/\bFÜhrung\b/g, 'Führung');
  t = t.replace(/\bMÜnchen\b/g, 'München');
  t = t.replace(/\bGemuese\b/g, 'Gemüse');
  t = t.replace(/\bsuesse\b/g, 'süße');
  t = t.replace(/\bReisebuero\b/g, 'Reisebüro');
  t = t.replace(/\bReisebuero-/g, 'Reisebüro-');
  t = t.replace(/\bKonseqünzen\b/g, 'Konsequenzen');
  t = t.replace(/\bzürst\b/g, 'zuerst');
  t = t.replace(/\bZürst\b/g, 'Zuerst');
  t = t.replace(/\büberschüß/g, 'überschüss');

  return t;
}

const STRING_RE = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g;

const raw = fs.readFileSync(TARGET, 'utf8');
let changes = 0;
const out = raw.replace(STRING_RE, (lit) => {
  const quote = lit[0];
  const inner = lit.slice(1, -1);
  const fixed = fixGermanString(inner);
  if (fixed !== inner) changes++;
  return quote + fixed + quote;
});

fs.writeFileSync(TARGET, out, 'utf8');
console.log(`Updated ${TARGET} (${changes} string literal(s) changed).`);
