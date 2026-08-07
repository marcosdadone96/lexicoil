#!/usr/bin/env node
/**
 * Hören T2 A2 — catálogo de planes + audit B (pool) + simulación rotación.
 *   node scripts/audit-horen-t2-schedule-catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  resetHorenT2ActivitySchedulesCache,
  getHorenT2ActivitySchedules,
  pickNextHorenT2ActivitySchedule,
  scheduleSignature,
  loadPersistedHorenT2KeySignatures,
} from './lib/horenT2ActivityScheduleBank.mjs';
import { countSharedFiveGrams } from './lib/horenT2ActivityScheduleBank.mjs';

resetHorenT2ActivitySchedulesCache();
const schedules = getHorenT2ActivitySchedules();
console.log(`\n── Catálogo Hören T2 A2 ──`);
console.log(`Schedules en banco: ${schedules.length}`);
console.log(`IDs nuevos (8): ${schedules.slice(8).map((s) => s.id).join(', ')}`);

const exclude = new Set(loadPersistedHorenT2KeySignatures('A2'));
console.log(`\nPersistidos en pool (key sigs excluidos al generar): ${exclude.size}`);

const picked = new Set();
const excludeSim = new Set(exclude);
for (let i = 0; i < 16; i += 1) {
  const pick = pickNextHorenT2ActivitySchedule(excludeSim, `catalog-sim:${i}`);
  if (!pick.schedule) break;
  picked.add(pick.schedule.id);
  excludeSim.add(pick.schedule.id);
  excludeSim.add(scheduleSignature(pick.schedule));
}
console.log(`\n── Simulación 16 picks (exclude pool + sesión) ──`);
console.log(`Distinct schedule IDs picked: ${picked.size}/16`);
console.log(`Available after pool exclude: ${schedules.filter((s) => !exclude.has(s.id) && !exclude.has(scheduleSignature(s))).length}/${schedules.length}`);

// Audit B on pool (legacy dialogues — unchanged until new gen)
const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const rows = [];
for (const f of fs.readdirSync(poolDir)) {
  if (!f.includes('horen-t2')) continue;
  rows.push(JSON.parse(fs.readFileSync(path.join(poolDir, f), 'utf8')));
}
let pairs = 0;
let highOverlap = 0;
for (let i = 0; i < rows.length; i += 1) {
  for (let j = i + 1; j < rows.length; j += 1) {
    const textA = rows[i].passages?.[0]?.text || '';
    const textB = rows[j].passages?.[0]?.text || '';
    const shared = countSharedFiveGrams(textA, textB);
    if (shared >= 8) highOverlap += 1;
    pairs += 1;
  }
}
console.log(`\n── Audit B (pool-verified T2 legacy, diálogos ya escritos) ──`);
console.log(`Archivos T2: ${rows.length}, pares: ${pairs}, pares ≥8 5-gramas: ${highOverlap}`);
console.log(`(Mejora en generación futura vía catálogo 16; pool histórico no se reescribe solo.)`);

// Forward: unique key sigs if each new batch follows a distinct unused schedule
const allSigs = new Set(schedules.map((s) => scheduleSignature(s)));
const poolSigs = exclude;
const freshSigs = [...allSigs].filter((s) => !poolSigs.has(s));
console.log(`\n── Capacidad nuevas generaciones (firmas de plan no usadas en pool) ──`);
console.log(`Firmas catálogo: ${allSigs.size}, ya en pool: ${poolSigs.size}, libres para rotación: ${freshSigs.length}`);
