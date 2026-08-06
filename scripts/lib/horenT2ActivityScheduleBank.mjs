/**
 * Hören T2 A2 — rotación de secuencia día↔actividad (claves a–i).
 * Mismo patrón de exclusión que horenOpeningsBank / titleVariantBank.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const CONFIG_FILE = path.join(ROOT, 'data', 'horen-t2-activity-schedules-bank.json');

let _cache = null;

export function loadHorenT2ActivitySchedulesConfig() {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _cache = { schedules: [], promptDe: '' };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return _cache;
}

export function resetHorenT2ActivitySchedulesCache() {
  _cache = null;
}

export function getHorenT2ActivitySchedules() {
  return loadHorenT2ActivitySchedulesConfig().schedules || [];
}

/** Signature for dedup: ordered correct keys Mon–Fri. */
export function horenT2ActivityKeySignature(batch) {
  const qs = (batch?.questions || [])
    .filter((q) => Number(q.teil) === 2)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const keys = qs.map((q) => String(q.correctAnswer ?? q.correct ?? '').toLowerCase()).filter(Boolean);
  return keys.length === 5 ? keys.join('-') : null;
}

export function scheduleSignature(schedule) {
  return (schedule?.correctKeys || []).join('-');
}

/**
 * @param {Set<string>|string[]} [exclude] — schedule ids or key signatures
 * @param {string|number} [entropy]
 */
export function pickNextHorenT2ActivitySchedule(exclude = new Set(), entropy = Date.now()) {
  const excludeSet =
    exclude instanceof Set ? exclude : new Set((exclude || []).map((s) => String(s).trim()).filter(Boolean));
  const schedules = getHorenT2ActivitySchedules();
  const available = schedules.filter(
    (s) => !excludeSet.has(s.id) && !excludeSet.has(scheduleSignature(s)),
  );
  const pool = available.length ? available : schedules;
  if (!pool.length) return { schedule: null, index: -1, exhausted: true };
  const seed = String(entropy);
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const index = hash % pool.length;
  return { schedule: pool[index], index, exhausted: available.length <= 1 };
}

function formatScheduleLine(schedule) {
  return (schedule.days || [])
    .map((d) => `${d.day}: hablante ${d.speaker} → clave «${d.key}» (${d.cueDe})`)
    .join(' · ');
}

/**
 * @param {{ mandatedSchedule?: object|null }} [opts]
 */
export function buildHorenT2ActivitySchedulePromptBlock(opts = {}) {
  const cfg = loadHorenT2ActivitySchedulesConfig();
  const sch = opts.mandatedSchedule;
  if (!sch) return '';
  const scheduleLine = formatScheduleLine(sch);
  const line = String(cfg.promptDe || '')
    .trim()
    .replaceAll('{{SCHEDULE}}', scheduleLine);
  return line ? `\n- ${line}\n` : '';
}

/** Load activity-key signatures already in pool-verified for exclusion. */
export function loadPersistedHorenT2KeySignatures(level = 'A2') {
  const sigs = new Set();
  const poolDir = path.join(ROOT, 'batches/ready/pool-verified', String(level).toUpperCase());
  if (!fs.existsSync(poolDir)) return sigs;
  for (const f of fs.readdirSync(poolDir)) {
    if (!/horen-t2.*\.json$/i.test(f)) continue;
    try {
      const b = JSON.parse(fs.readFileSync(path.join(poolDir, f), 'utf8'));
      const sig = horenT2ActivityKeySignature(b);
      if (sig) sigs.add(sig);
    } catch {
      /* skip */
    }
  }
  return sigs;
}

/** N-grams (5+) from dialogue body for convergence scan. */
export function horenT2DialogueFiveGrams(text) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const grams = [];
  for (let i = 0; i <= words.length - 5; i += 1) {
    grams.push(words.slice(i, i + 5).join(' '));
  }
  return grams;
}

/** Shared 5-gram count between two dialogues. */
export function countSharedFiveGrams(textA, textB) {
  const ga = new Set(horenT2DialogueFiveGrams(textA));
  const gb = horenT2DialogueFiveGrams(textB);
  let shared = 0;
  for (const g of gb) if (ga.has(g)) shared += 1;
  return shared;
}
