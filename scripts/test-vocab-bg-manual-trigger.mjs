#!/usr/bin/env node
/**
 * Manual operator trigger — full vocab background generation cycle (real Gemini).
 *
 * Bypasses production gates: 12h frequency cap, 8-word batch threshold, 20h daily fallback.
 * Still uses real POOL-2 publish gates, personal-pool quota, and Gemini generation.
 *
 * SECURITY: CLI-only. Requires ADMIN_SECRET in env (same as activate-pro.mjs).
 * Not exposed to end users — no public HTTP endpoint.
 *
 * Usage:
 *   node scripts/test-vocab-bg-manual-trigger.mjs --email marcosdadra@gmail.com
 *   node scripts/test-vocab-bg-manual-trigger.mjs --email user@example.com --module horen
 *   node scripts/test-vocab-bg-manual-trigger.mjs --email user@example.com --bootstrap-from-deck
 *   node scripts/test-vocab-bg-manual-trigger.mjs --email user@example.com --force
 *
 * Required env (.env or shell):
 *   ADMIN_SECRET          — operator gate (never commit)
 *   GEMINI_API_KEY        — real generation
 *   NETLIFY_SITE_ID       — production blob store
 *   NETLIFY_API_TOKEN     — or NETLIFY_AUTH_TOKEN
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { runVocabBgGeneration } from './lib/vocabBgRunner.mjs';
import { planVocabBgGeneration } from './lib/planVocabBgGeneration.mjs';

const require = createRequire(import.meta.url);
const { STORE_NAME } = require(path.join(ROOT, 'netlify/functions/lib/blobStore.js'));
const { syncKey, userKey } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));
const { resolvePlan, getMonthKey } = require(path.join(ROOT, 'netlify/functions/lib/quotaLib.js'));
const { aiMaxForPlan } = require(path.join(ROOT, 'netlify/functions/lib/freeTrialLib.js'));
const {
  markBgGenStarted,
  commitBgGenSuccess,
  markBgGenFailed,
  processVocabSyncForBg,
} = require(path.join(ROOT, 'netlify/functions/lib/vocabBgQuota.js'));
const VocabBgState = require(path.join(ROOT, 'netlify/functions/lib/vocabBgState.js'));
const PersonalPoolQuota = require(path.join(ROOT, 'js/library/personalPoolQuota.js'));

loadEnvFile();

const BG_GEN_PENDING_STALE_MS = 30 * 60 * 1000;

function parseArgs(argv) {
  const out = { email: '', module: '', bootstrap: false, force: false, dryPlan: false, selftest: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email' && argv[i + 1]) {
      out.email = String(argv[++i]).trim().toLowerCase();
    } else if (a === '--module' && argv[i + 1]) {
      out.module = String(argv[++i]).trim().toLowerCase();
    } else if (a === '--bootstrap-from-deck') {
      out.bootstrap = true;
    } else if (a === '--force') {
      out.force = true;
    } else if (a === '--dry-plan') {
      out.dryPlan = true;
    } else if (a === '--selftest') {
      out.selftest = true;
      if (!out.email) out.email = 'operator-selftest@lexicoil.manual';
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

/** In-memory blob store for --selftest (local evidence without production account). */
function createSelftestStore() {
  const data = new Map();
  const etags = new Map();
  let etagSeq = 1;
  return {
    async get(key, opts) {
      const raw = data.get(key);
      if (raw == null) return null;
      return opts?.type === 'json' ? JSON.parse(raw) : raw;
    },
    async getWithMetadata(key, opts) {
      const raw = data.get(key);
      if (raw == null) return null;
      const parsed = opts?.type === 'json' ? JSON.parse(raw) : raw;
      return { data: parsed, etag: etags.get(key) || null };
    },
    async setJSON(key, val, opts = {}) {
      if (opts.onlyIfNew && data.has(key)) return { modified: false };
      if (opts.onlyIfMatch && etags.get(key) !== opts.onlyIfMatch) return { modified: false };
      data.set(key, JSON.stringify(val));
      etags.set(key, String(++etagSeq));
      return { modified: true };
    },
    async delete(key) {
      data.delete(key);
      etags.delete(key);
    },
    async list({ prefix }) {
      const blobs = [...data.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ key: k }));
      return { blobs, hasMore: false };
    },
  };
}

function seedSelftestAccount(store, email) {
  // Topic-coherent pending (Umwelt) — improves anchor integration odds in selftest
  const words = ['umwelt', 'nachhaltigkeit', 'energie', 'müll'];
  const now = Date.now();
  const pending = words.map((w, i) => ({
    word: w,
    lang: 'de',
    level: 'B1',
    key: `${w}|de`,
    savedAt: now - (words.length - i) * 60000,
    queuedAt: now - (words.length - i) * 30000,
  }));
  const flashcards = words.map((w, i) => ({
    word: w,
    sourceLang: 'de',
    sourceLevel: 'B1',
    savedAt: now - i * 1000,
  }));
  return Promise.all([
    store.setJSON(userKey(email), { email, plan: 'pro', name: 'Selftest Operator' }),
    store.setJSON(syncKey(email), { flashcards, deletedFlashcards: [] }),
    store.setJSON(`quota:${email}`, {
      month: getMonthKey(),
      personalLesenUsed: 0,
      personalHorenUsed: 0,
      bgGenCountMonth: 0,
      lastBgGenAt: now - 3600000,
      lastBgGenModule: 'horen',
      bgVocabPending: pending,
      bgVocabPendingCount: pending.length,
      aiUsed: 12,
      aiMax: 40,
      rollover: 3,
      creditTopups: 5,
    }),
  ]);
}

function log(step, msg, data) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${step}: ${msg}`;
  console.log(line);
  if (data !== undefined) {
    console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  }
}

function getStoreForCli() {
  const { getStore } = require('@netlify/blobs');
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) {
    return { store: getStore({ name: STORE_NAME, siteID, token }), mode: 'remote' };
  }
  try {
    return { store: getStore(STORE_NAME), mode: 'local-netlify-dev' };
  } catch (err) {
    return { store: null, mode: 'unavailable', error: err.message };
  }
}

function printHelp() {
  console.log(`
LexiCoil — disparo manual de generación de fondo (solo operador)

PASO 1 — Guardar vocabulario en la app
  • Entrá a lexicoil.com con tu cuenta.
  • Abrí Vocabulario y guardá 2–8 palabras nuevas del banco B1 alemán
    (ej. Fitness, Therapie, Urlaub, Umwelt). Palabras fuera del banco no cuentan.

PASO 2 — Correr este script (desde la carpeta del proyecto)
  ADMIN_SECRET=... node scripts/test-vocab-bg-manual-trigger.mjs --email TU@EMAIL.com

  Si no hay palabras pendientes pero tenés vocab guardado:
  ... --bootstrap-from-deck

PASO 3 — Ver el resultado
  • En la consola: poolId, módulo (Lesen/Hören), palabras usadas.
  • En la app: Examen → Personalizado → Lesen o Hören con tus palabras.
  • Cartel azul: "Automatisch aus deinem kürzlichen Vokabular generiert".

Opciones:
  --email            (requerido) cuenta a procesar
  --module lesen|horen   forzar módulo (default: alterna según última gen)
  --bootstrap-from-deck  si pending vacío, encolar palabras del deck guardado
  --force            limpiar mutex bgGenPending atascado
  --dry-plan         solo planificar, sin Gemini ni publicar
  --selftest         cuenta mock local + Gemini real (evidencia sin producción)
`);
}

async function ensureOperatorGate() {
  if (!process.env.ADMIN_SECRET || String(process.env.ADMIN_SECRET).length < 8) {
    console.error('\n❌ Falta ADMIN_SECRET en el entorno.');
    console.error('   Solo operadores con el secreto de admin pueden correr este script.');
    console.error('   No hay endpoint público equivalente para usuarios normales.\n');
    process.exit(1);
  }
  log('AUTH', 'ADMIN_SECRET presente — acceso operador OK');
}

async function clearMutexIfNeeded(store, qKey, rec, force) {
  if (!rec.bgGenPending) return rec;
  const started = Number(rec.bgGenStartedAt) || 0;
  const age = started ? Date.now() - started : Infinity;
  const stale = age > BG_GEN_PENDING_STALE_MS;
  if (!force && !stale) {
    console.error('\n❌ Hay una generación en curso (bgGenPending).');
    console.error('   Esperá 30 min o usá --force si estás seguro de que quedó colgada.\n');
    process.exit(1);
  }
  log('MUTEX', force ? 'Forzando limpieza de bgGenPending' : 'Recuperando bgGenPending obsoleto');
  const patch = VocabBgState.markBgGenFailed(rec, force ? 'manual_force_clear' : 'stale_bg_gen_recovery');
  const { casWriteJson } = require(path.join(ROOT, 'netlify/functions/lib/casBlob.js'));
  const { buildQuotaPayload } = require(path.join(ROOT, 'netlify/functions/lib/aiQuotaState.js'));
  await casWriteJson(
    store,
    qKey,
    (current) => ({
      payload: buildQuotaPayload({ ...current, ...VocabBgState.attachBgFields(current), ...patch }, true),
      result: { ok: true },
    }),
    { logTag: '[manual-bg-mutex]' },
  );
  return { ...rec, ...patch };
}

async function bootstrapPendingFromDeck(store, qKey, email, plan, month, aiMax) {
  const sync = await store.get(syncKey(email), { type: 'json' }).catch(() => null);
  const cards = sync?.flashcards || [];
  if (!cards.length) {
    log('BOOTSTRAP', 'Sin flashcards en sync — guardá palabras en la app primero');
    return null;
  }
  log('BOOTSTRAP', `Encolando desde deck (${cards.length} tarjetas)`);
  const res = await processVocabSyncForBg(store, qKey, {
    prevCards: [],
    nextCards: cards,
    plan,
    month,
    tombstones: sync?.deletedFlashcards || [],
  });
  return res?.result?.rec || null;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.email) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  console.log('\n═══ LexiCoil — disparo manual generación de fondo ═══\n');
  await ensureOperatorGate();

  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error('❌ Falta GEMINI_API_KEY (o GOOGLE_API_KEY) para generación real.');
    process.exit(1);
  }

  let store;
  let mode;
  if (args.selftest) {
    store = createSelftestStore();
    await seedSelftestAccount(store, args.email);
    mode = 'selftest-mock';
    log('STORE', 'Modo --selftest (mock local, Gemini real, publica en de_B1.json local)');
  } else {
    const conn = getStoreForCli();
    store = conn.store;
    mode = conn.mode;
    if (!store) {
      console.error(`❌ Blob store no disponible (${conn.error || 'sin credenciales'}).`);
      console.error('   Configurá NETLIFY_SITE_ID + NETLIFY_API_TOKEN en .env');
      process.exit(1);
    }
    log('STORE', `Conectado (${mode})`);
  }

  const email = args.email;
  const qKey = `quota:${email}`;
  let quotaRec = await store.get(qKey, { type: 'json' }).catch(() => null);
  const user = await store.get(userKey(email), { type: 'json' }).catch(() => null);
  if (!args.selftest && !user && !quotaRec) {
    console.error(`❌ No se encontró cuenta para ${email}`);
    process.exit(1);
  }

  const plan = resolvePlan(user);
  const month = getMonthKey();
  const aiMax = aiMaxForPlan(plan, user, month);
  let rec = { ...(quotaRec || {}), month: quotaRec?.month || month, ...VocabBgState.attachBgFields(quotaRec || {}) };

  log('ACCOUNT', `${email} · plan=${plan}`);
  log(
    'STATE',
    `pending=${VocabBgState.effectivePendingCount(rec)} · lastBgGen=${rec.lastBgGenAt || 'nunca'} · lesen=${PersonalPoolQuota.usedFromRecord(rec, 'lesen')}/${PersonalPoolQuota.maxFor(plan, 'lesen')} · horen=${PersonalPoolQuota.usedFromRecord(rec, 'horen')}/${PersonalPoolQuota.maxFor(plan, 'horen')}`,
  );

  const normalElig = VocabBgState.evaluateBgEligibility(rec, plan);
  log('NORMAL_ELIGIBILITY', normalElig.eligible ? 'dispararía solo' : `NO dispararía: ${normalElig.reason}`, {
    trigger: normalElig.trigger,
    pendingCount: normalElig.pendingCount,
    hours: normalElig.hours,
  });
  log('BYPASS', 'Ignorando freno 12h, umbral 8 palabras y fallback 20h (solo esta corrida manual)');

  rec = await clearMutexIfNeeded(store, qKey, rec, args.force);

  let pending = VocabBgState.getEligiblePendingEntries(rec);
  if (!pending.length && args.bootstrap) {
    const bootRec = await bootstrapPendingFromDeck(store, qKey, email, plan, month, aiMax);
    if (bootRec) {
      rec = { ...rec, ...bootRec };
      pending = VocabBgState.getEligiblePendingEntries(rec);
    }
  }

  if (!pending.length) {
    console.error('\n❌ No hay palabras pendientes para generar.');
    console.error('   Guardá palabras nuevas en Vocabulario (banco B1) o usá --bootstrap-from-deck.\n');
    process.exit(1);
  }

  const pendingWords = pending.map((p) => p.word).slice(0, 12);
  log('PENDING', `${pending.length} palabra(s) elegibles`, pendingWords);

  const preferredModule =
    args.module && ['lesen', 'horen'].includes(args.module)
      ? args.module
      : VocabBgState.pickNextModule(rec);
  log('MODULE', `Próximo módulo: ${preferredModule}`);

  const planPreview = planVocabBgGeneration({
    pendingWords: pending,
    preferredModule,
    lang: 'de',
    level: 'B1',
  });
  log('PLAN', `celda ${planPreview.module} T${planPreview.teil} · tema=${planPreview.topic}`, {
    words: planPreview.words,
    userAnchor: planPreview.userAnchor,
    score: planPreview.score,
  });

  if (args.dryPlan) {
    log('DONE', 'Dry-plan only — sin Gemini ni publicación');
    process.exit(0);
  }

  const modNorm = PersonalPoolQuota.normalizeModule(preferredModule);
  if (!PersonalPoolQuota.canUse(plan, modNorm, rec)) {
    const alt = modNorm === 'lesen' ? 'horen' : 'lesen';
    if (!PersonalPoolQuota.canUse(plan, alt, rec)) {
      console.error(`❌ Cuota mensual de pool personal agotada (lesen y horen).`);
      process.exit(1);
    }
    log('QUOTA', `Módulo ${modNorm} sin cupo — usando ${alt}`);
  }

  const requestId = crypto.randomUUID();
  log('START', `Marcando job iniciado (requestId=${requestId.slice(0, 8)}…)`);
  await markBgGenStarted(store, qKey, requestId, plan, month, aiMax);

  log('GEMINI', 'Generando parte con Gemini (puede tardar 1–5 min)…');
  const t0 = Date.now();
  let result;
  try {
    result = await runVocabBgGeneration({
      store,
      pendingWords: pending,
      preferredModule: modNorm,
      email,
      requestId,
      lang: 'de',
      level: 'B1',
      fixRetries: args.selftest ? 0 : 3,
      maxApiCalls: 45,
      maxAttemptsPerFile: 8,
      skipQuality: !!args.selftest,
      testMode: !!args.selftest,
    });
  } catch (err) {
    log('FATAL', err.message);
    await markBgGenFailed(store, qKey, err.message, month, aiMax, { attemptedKeys: [] });
    process.exit(1);
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log('GENERATE', `Completado en ${elapsed}s · stage=${result.stage || 'ok'}`);

  if (!result.ok) {
    log('FAILED', result.reason || 'unknown', {
      stage: result.stage,
      file: result.file,
      queued: result.queued,
    });
    const attemptedKeys = VocabBgState.buildAttemptedKeysFromPlan(result.plan, pending);
    await markBgGenFailed(store, qKey, result.reason || 'failed', month, aiMax, { attemptedKeys });
    process.exit(1);
  }

  log('PUBLISH', result.testMode ? 'testMode — sin publicación a pool de producción' : 'Parte publicada en pool', {
    poolId: result.poolId,
    module: result.module,
    teil: result.teil,
    file: result.file,
    bgVocabLemmas: result.userAnchor || result.words?.slice(0, 5),
    anchorGate: result.anchorGate || null,
  });

  if (result.anchorGate?.integrated?.length) {
    log('ANCHOR_GATE', `Aprobado — ${result.anchorGate.integrated.length} ancla(s) verificadas en texto`, result.anchorGate);
  }

  const quotaBefore = await store.get(qKey, { type: 'json' }).catch(() => null);
  if (quotaBefore) {
    log('QUOTA_BEFORE', 'Snapshot pre-commit', {
      personalLesenUsed: quotaBefore.personalLesenUsed,
      personalHorenUsed: quotaBefore.personalHorenUsed,
      aiUsed: quotaBefore.aiUsed,
      aiMax: quotaBefore.aiMax,
      rollover: quotaBefore.rollover,
      creditTopups: quotaBefore.creditTopups,
      bgGenCountMonth: quotaBefore.bgGenCountMonth,
    });
  }

  const commit = await commitBgGenSuccess(store, qKey, {
    requestId,
    module: result.module,
    usedWords: result.userAnchor || result.words,
    plan,
    month,
    aiMax,
  });

  if (!commit?.ok) {
    log('COMMIT_FAILED', commit?.error || 'commit_failed', commit);
    await markBgGenFailed(store, qKey, commit?.error || 'commit_failed', month, aiMax, {
      attemptedKeys: VocabBgState.buildAttemptedKeysFromPlan(result.plan, pending),
    });
    process.exit(1);
  }

  log('COMMIT', 'Cuota descontada y palabras pendientes actualizadas', {
    personalLesenUsed: commit.personalLesenUsed,
    personalHorenUsed: commit.personalHorenUsed,
    bgGenCountMonth: commit.bgGenCountMonth,
  });

  const quotaAfter = await store.get(qKey, { type: 'json' }).catch(() => null);
  if (quotaAfter && quotaBefore) {
    log('QUOTA_AFTER', 'Snapshot post-commit', {
      personalLesenUsed: quotaAfter.personalLesenUsed,
      personalHorenUsed: quotaAfter.personalHorenUsed,
      aiUsed: quotaAfter.aiUsed,
      aiMax: quotaAfter.aiMax,
      rollover: quotaAfter.rollover,
      creditTopups: quotaAfter.creditTopups,
      bgGenCountMonth: quotaAfter.bgGenCountMonth,
      bgVocabPendingCount: quotaAfter.bgVocabPendingCount,
    });
    const aiUntouched =
      quotaAfter.aiUsed === quotaBefore.aiUsed &&
      quotaAfter.aiMax === quotaBefore.aiMax &&
      quotaAfter.rollover === quotaBefore.rollover &&
      quotaAfter.creditTopups === quotaBefore.creditTopups;
    log(
      'QUOTA_AI',
      aiUntouched
        ? 'aiUsed/aiMax/rollover/creditTopups SIN cambios (descuento solo pool personal)'
        : 'ADVERTENCIA: campos AI modificados inesperadamente',
    );
  }

  console.log('\n═══ ÉXITO ═══');
  console.log(`Cuenta:     ${email}`);
  console.log(`Parte:      ${result.module} Teil ${result.teil} · ${planPreview.topic}`);
  console.log(`Pool ID:    ${result.poolId}`);
  console.log(`Palabras:   ${(result.userAnchor || result.words || []).join(', ')}`);
  console.log('\nVer en app: Examen → Personalizado → Lesen/Hören con vocabulario guardado.');
  console.log('Cartel:     "✨ Automatisch aus deinem kürzlichen Vokabular generiert"\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
