import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const COST_FILE = path.join(ROOT, 'batches', '.claude-cost.json');

const PRICES_PER_M = {
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-4-8': { in: 5, out: 25 },
};

export class BudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

function defaultBudget() {
  return Number(process.env.CLAUDE_BUDGET_USD || 2.3);
}

function resolvePrices(model) {
  const m = String(model || '').toLowerCase();
  if (PRICES_PER_M[m]) return PRICES_PER_M[m];
  for (const [prefix, prices] of Object.entries(PRICES_PER_M)) {
    if (m.startsWith(prefix)) return prices;
  }
  return PRICES_PER_M['claude-sonnet-4-6'];
}

function readStore() {
  try {
    if (fs.existsSync(COST_FILE)) {
      const data = JSON.parse(fs.readFileSync(COST_FILE, 'utf8'));
      return {
        totalUSD: Number(data.totalUSD) || 0,
        calls: Array.isArray(data.calls) ? data.calls : [],
      };
    }
  } catch (_) {
    /* corrupt file — reset on next write */
  }
  return { totalUSD: 0, calls: [] };
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(COST_FILE), { recursive: true });
  const tmp = `${COST_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(
    tmp,
    `${JSON.stringify(
      {
        totalUSD: store.totalUSD,
        budgetUSD: defaultBudget(),
        updatedAt: new Date().toISOString(),
        calls: store.calls.slice(-500),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  fs.renameSync(tmp, COST_FILE);
}

export function computeUsageUSD(model, usage, priceFactor = 1) {
  const p = resolvePrices(model);
  const input = Number(usage?.input_tokens || 0);
  const output = Number(usage?.output_tokens || 0);
  const cacheRead = Number(usage?.cache_read_input_tokens || 0);
  const cacheCreate = Number(usage?.cache_creation_input_tokens || 0);
  const billableIn = Math.max(0, input - cacheRead);
  const inCost =
    (billableIn * p.in + cacheRead * p.in * 0.1 + cacheCreate * p.in * 1.25) / 1_000_000;
  const outCost = (output * p.out) / 1_000_000;
  return (inCost + outCost) * priceFactor;
}

export function spentUSD() {
  return readStore().totalUSD;
}

export function remainingUSD() {
  return Math.max(0, defaultBudget() - spentUSD());
}

export function addUsage(model, usage, priceFactor = 1) {
  const cost = computeUsageUSD(model, usage, priceFactor);
  for (let i = 0; i < 5; i++) {
    const store = readStore();
    store.totalUSD += cost;
    store.calls.push({
      model,
      costUSD: cost,
      usage,
      at: new Date().toISOString(),
    });
    try {
      writeStore(store);
      return cost;
    } catch (_) {
      /* retry read-modify-write */
    }
  }
  throw new Error('No se pudo actualizar batches/.claude-cost.json');
}

export function assertWithinBudget(estimateUSD = 0) {
  const budget = defaultBudget();
  const spent = spentUSD();
  if (spent + estimateUSD >= budget) {
    throw new BudgetExceededError(
      `Tope de gasto alcanzado ($${budget.toFixed(2)}). Gastado: $${spent.toFixed(4)}. ` +
        'Sube CLAUDE_BUDGET_USD para continuar.',
    );
  }
}
