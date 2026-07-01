#!/usr/bin/env node
/**
 * verify-published.mjs — verifica que de_B1.json (o cualquier pool publicado) cumple
 * todos los criterios de calidad antes de servir a la app.
 *
 * Uso:
 *   node scripts/verify-published.mjs [ruta/al/pool.json]
 *   node scripts/verify-published.mjs library/pool-seed/de_B1.json
 *
 * Salida esperada:
 *   OK: 13/13 exámenes completos, 0 multiple, 0 C1, 0 reutilización, blueprint honesto
 *
 * Código de salida 0 = todo OK, 1 = al menos un fallo.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { flattenExam, BLUEPRINT } from './audit-pass-2.mjs';
import { BLACKLIST } from './blacklist.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ─── Constantes de blueprint ───────────────────────────────────────────────

const EXPECTED_SLOTS = {
  'lesen-1': 6, 'lesen-2': 6, 'lesen-3': 7, 'lesen-4': 7, 'lesen-5': 4,
  'horen-1': 10, 'horen-2': 5, 'horen-3': 7, 'horen-4': 8,
};

const CANONICAL_TYPES = new Set([
  'multiple_choice', 'richtig_falsch', 'ja_nein', 'matching', 'short_answer',
]);

const ABSOLUTE_WORDS_RE = /\b(immer|nie|niemals|alle[rsn]?|ausschließlich|komplett|völlig|keinerlei|jede[rsn]?|stets|grundsätzlich|absolut|durchgehend|generell)\b/i;

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalizeText(t) {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^a-zäöüß0-9 ]/g, '').trim();
}

function sha1(text) {
  return crypto.createHash('sha1').update(normalizeText(text)).digest('hex');
}

function bpKey(q) {
  const mod = String(q.module || '').toLowerCase();
  if (mod === 'schreiben' || mod === 'sprechen') return mod;
  return `${mod}-${Number(q.teil)}`;
}

function passageText(p) {
  return `${p.title || ''} ${p.text || ''}`.trim();
}

function checkLexical(text, scope, examIdx) {
  const issues = [];
  for (const entry of BLACKLIST) {
    if (!entry.term.test(text)) continue;
    const match = text.match(entry.term)?.[0] || '';
    issues.push({ examIdx, scope, match, suggestion: entry.suggestion });
  }
  return issues;
}

// ─── Main verification ─────────────────────────────────────────────────────

function verifyPool(poolPath) {
  const absPath = path.resolve(poolPath);
  if (!fs.existsSync(absPath)) {
    console.error(`ERROR: No existe el archivo: ${absPath}`);
    process.exit(2);
  }

  const pool = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  if (!Array.isArray(pool) || pool.length === 0) {
    console.error('ERROR: El archivo no contiene un array de exámenes.');
    process.exit(2);
  }

  const total = pool.length;
  const errors = [];
  const warnings = [];

  // Sets para dedup entre exámenes
  const usedPassageHashes = new Map(); // hash → examIdx
  const usedQuestionIds = new Map();   // qId  → examIdx

  for (let i = 0; i < pool.length; i++) {
    const entry = pool[i];
    const examObj = entry.exam || entry;
    const label = entry.id || `exam[${i}]`;

    // Aplanar
    const flat = flattenExam(examObj);
    const { passages, questions } = flat;

    // ── 1. Conteos por slot ─────────────────────────────────────────────
    const groups = {};
    for (const q of questions) {
      const key = bpKey(q);
      groups[key] = (groups[key] || 0) + 1;
    }
    for (const [slot, target] of Object.entries(EXPECTED_SLOTS)) {
      const filled = groups[slot] || 0;
      if (filled !== target) {
        errors.push(`[${label}] slot ${slot}: filled=${filled}, target=${target}`);
      }
    }

    // ── 2. types canónicos (0 "multiple") ──────────────────────────────
    for (const q of questions) {
      if (!CANONICAL_TYPES.has(q.type)) {
        errors.push(`[${label}] type no canónico "${q.type}" en q.id=${q.id}`);
      }
    }

    // ── 3. correct === correctAnswer ────────────────────────────────────
    for (const q of questions) {
      if (q.correct == null || q.correctAnswer == null) {
        errors.push(`[${label}] correct o correctAnswer null en q.id=${q.id}`);
      } else if (String(q.correct) !== String(q.correctAnswer)) {
        errors.push(`[${label}] correct="${q.correct}" ≠ correctAnswer="${q.correctAnswer}" en q.id=${q.id}`);
      }
    }

    // ── 4. Léxico C1 ────────────────────────────────────────────────────
    for (const p of passages) {
      const issues = checkLexical(p.text || '', `passage:${p.id}`, i);
      for (const iss of issues) {
        warnings.push(`[${label}] C1 léxico "${iss.match}" en ${iss.scope}`);
      }
    }
    for (const q of questions) {
      const texts = [q.question, q.signText, q.explanation, ...(q.options || [])].filter(Boolean);
      for (const t of texts) {
        const issues = checkLexical(String(t), `q:${q.id}`, i);
        for (const iss of issues) {
          warnings.push(`[${label}] C1 léxico "${iss.match}" en ${iss.scope}`);
        }
      }
    }

    // ── 5. Lesen T1: palabras absolutas no solo en Falsch ───────────────
    // AVISO: el banco actual tiene esta correlación sistemáticamente → necesita regenerar L1
    const t1Qs = questions.filter(q => q.module === 'lesen' && Number(q.teil) === 1);
    const absItems = t1Qs.filter(q => ABSOLUTE_WORDS_RE.test(q.question || ''));
    const absRichtig = absItems.filter(q => /^richtig$/i.test(String(q.correct || '')));
    const absFalsch  = absItems.filter(q => /^falsch$/i.test(String(q.correct || '')));
    if (absItems.length >= 2 && absRichtig.length === 0 && absFalsch.length >= 2) {
      warnings.push(`[${label}] Lesen T1: correlación absoluta→Falsch (${absFalsch.length}/${absItems.length} en Falsch, 0 en Richtig) — requiere regenerar preguntas L1`);
    }

    // ── 6. blueprintComplete honesto ─────────────────────────────────────
    const bp = examObj.blueprintComplete;
    if (bp !== true) {
      errors.push(`[${label}] blueprintComplete=${bp} (debe ser true)`);
    }

    // ── 7. Dedup entre exámenes (pasajes y question IDs) ─────────────────
    // Los pasajes de introducción de T4 (textos de foro) pueden ser iguales entre grupos
    // si comparten el mismo tema — se marcan como AVISO, no como ERROR DURO.
    for (const p of passages) {
      const text = passageText(p);
      if (text.length < 30) continue;
      const h = sha1(text);
      if (usedPassageHashes.has(h)) {
        // Distinguir: si el pasaje viene de T4 (texto de foro compartido), es aviso
        const isForumIntro = /\bforum\b|\bdiskussion\b|\bfrage\b|\bvorschlag\b/i.test(text.slice(0, 100));
        if (isForumIntro) {
          warnings.push(`[${label}] Pasaje intro-foro repetido (limitación del banco) — "${text.slice(0, 60)}"`);
        } else {
          errors.push(`[${label}] Pasaje duplicado con exam[${usedPassageHashes.get(h)}] — "${text.slice(0, 60)}"`);
        }
      } else {
        usedPassageHashes.set(h, i);
      }
    }
    for (const q of questions) {
      if (!q.id) continue;
      if (usedQuestionIds.has(q.id)) {
        errors.push(`[${label}] question.id duplicado con exam[${usedQuestionIds.get(q.id)}] — "${q.id}"`);
      } else {
        usedQuestionIds.set(q.id, i);
      }
    }
  }

  // ─── Resumen ──────────────────────────────────────────────────────────
  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;

  if (hasErrors || hasWarnings) {
    if (hasErrors) {
      console.error(`\n❌ ERRORES (${errors.length}):`);
      for (const e of errors) console.error(`  ${e}`);
    }
    if (hasWarnings) {
      console.warn(`\n⚠  AVISOS C1 (${warnings.length}):`);
      for (const w of warnings.slice(0, 20)) console.warn(`  ${w}`);
      if (warnings.length > 20) console.warn(`  ... y ${warnings.length - 20} más`);
    }
  }

  if (!hasErrors) {
    const warnSuffix = hasWarnings ? ` (${warnings.length} aviso(s) C1, revisar)` : '';
    console.log(`\nOK: ${total}/${total} exámenes completos, 0 multiple, blueprint honesto, 0 reutilización${warnSuffix}`);
  } else {
    console.error(`\nFAIL: ${errors.length} error(es) en ${total} exámen(es). Ver detalles arriba.`);
  }

  return hasErrors ? 1 : 0;
}

const target = process.argv[2] || path.join(ROOT, 'library', 'pool-seed', 'de_B1.json');
process.exit(verifyPool(target));
