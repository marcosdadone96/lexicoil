#!/usr/bin/env node
/** FASE 4 — HorenGame logic smoke test */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const H = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js/library/HorenGame.js'));

const r = H.buildRound(['Haus', 'Auto', 'Baum', 'Wasser', 'Schule']);
console.log('played+absent==total:', r.played.length + r.absent.length === r.targets.length, '| 1+ ausente:', r.absent.length >= 1);
const s = H.scoreRound(r, r.played);
console.log('perfecto:', s.correct === s.total, '| faltan:', s.missing.join(', ') || '(none)');

if (!(r.played.length + r.absent.length === r.targets.length && r.absent.length >= 1 && s.correct === s.total)) {
  process.exit(1);
}
