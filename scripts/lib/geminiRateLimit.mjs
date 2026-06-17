/**
 * File-backed Gemini rate limiter (RPM + RPD) for multi-process spawn safety.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

export class DailyQuotaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DailyQuotaError';
  }
}

const USAGE_FILE = path.join(ROOT, 'batches', '.gemini-usage.json');

function rpmLimit() {
  return Math.max(1, Number(process.env.GEMINI_RPM) || 8);
}

function rpdLimit() {
  const n = Number(process.env.GEMINI_RPD);
  return Number.isFinite(n) && n >= 0 ? n : 240;
}

function ptDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readUsage() {
  const day = ptDateKey();
  try {
    if (!fs.existsSync(USAGE_FILE)) return { day, count: 0, timestamps: [] };
    const raw = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    if (raw.day !== day) return { day, count: 0, timestamps: [] };
    return {
      day: raw.day,
      count: Number(raw.count) || 0,
      timestamps: (Array.isArray(raw.timestamps) ? raw.timestamps : []).map(Number).filter(Boolean),
    };
  } catch {
    return { day, count: 0, timestamps: [] };
  }
}

function writeUsage(data) {
  fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
  fs.writeFileSync(USAGE_FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function remainingToday() {
  const usage = readUsage();
  return Math.max(0, rpdLimit() - usage.count);
}

export function isDailyQuotaMessage(message) {
  return /per day|PerDay|RPD|free_tier.*day|daily|GenerateRequestsPerDay/i.test(String(message || ''));
}

/** Wait until RPM/RPD allow one request; then record it. */
export async function acquire() {
  const rpm = rpmLimit();
  const rpd = rpdLimit();
  const minSpacing = 60000 / rpm;

  if (rpd <= 0) {
    throw new DailyQuotaError(
      'Presupuesto diario de Gemini agotado (GEMINI_RPD=0). Reanuda mañana o sube el límite en .env.',
    );
  }

  for (let attempt = 0; attempt < 60; attempt++) {
    const usage = readUsage();
    if (usage.count >= rpd) {
      throw new DailyQuotaError(
        `Presupuesto diario de Gemini agotado (${usage.count}/${rpd} peticiones hoy PT). Reanuda mañana.`,
      );
    }

    const now = Date.now();
    const recent = usage.timestamps.filter((t) => now - t < 60000);
    let waitMs = 0;

    if (recent.length >= rpm) {
      waitMs = Math.max(waitMs, 60000 - (now - Math.min(...recent)) + 50);
    }
    if (recent.length > 0) {
      waitMs = Math.max(waitMs, minSpacing - (now - Math.max(...recent)) + 50);
    }

    if (waitMs > 0) {
      await sleep(waitMs);
      continue;
    }

    const fresh = readUsage();
    if (fresh.count >= rpd) {
      throw new DailyQuotaError(
        `Presupuesto diario de Gemini agotado (${fresh.count}/${rpd} peticiones hoy PT). Reanuda mañana.`,
      );
    }

    const ts = Date.now();
    writeUsage({
      day: fresh.day,
      count: fresh.count + 1,
      timestamps: [...fresh.timestamps.filter((t) => ts - t < 600000), ts].slice(-rpm * 15),
    });
    return;
  }

  throw new Error('No se pudo adquirir slot de rate limit tras varios intentos');
}

export { USAGE_FILE };
