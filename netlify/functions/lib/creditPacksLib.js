'use strict';

/** Current one-off credit packs (pack key = credits granted). */
const CREDIT_PACK_SIZES = [15, 40, 100];

const CREDIT_PACKS = Object.freeze({
  15: 15,
  40: 40,
  100: 100,
});

const PACK_META = Object.freeze({
  15: { label: 'S', priceEur: 6, pricePerCredit: 0.4 },
  40: { label: 'M', priceEur: 14, pricePerCredit: 0.35 },
  100: { label: 'L', priceEur: 30, pricePerCredit: 0.3 },
});

/** Legacy auto-recharge / checkout sizes → nearest current pack. */
const LEGACY_PACK_MAP = Object.freeze({
  50: 40,
  150: 100,
  400: 100,
});

const STRIPE_PRICE_ENV_KEYS = Object.freeze({
  15: 'STRIPE_PRICE_CREDITS_15',
  40: 'STRIPE_PRICE_CREDITS_40',
  100: 'STRIPE_PRICE_CREDITS_100',
  50: 'STRIPE_PRICE_CREDITS_50',
  150: 'STRIPE_PRICE_CREDITS_150',
  400: 'STRIPE_PRICE_CREDITS_400',
});

const PRO_SUBSCRIPTION_EUR = Number(process.env.PRO_SUBSCRIPTION_EUR || 13);
const PRO_SUBSCRIPTION_CREDITS = Number(process.env.AI_CREDITS_PRO || 40);
const PRO_PRICE_PER_CREDIT = PRO_SUBSCRIPTION_EUR / PRO_SUBSCRIPTION_CREDITS;

function normalizeCreditPack(pack) {
  const n = Math.floor(Number(pack) || 0);
  if (CREDIT_PACKS[n]) return n;
  if (LEGACY_PACK_MAP[n]) return LEGACY_PACK_MAP[n];
  return null;
}

function creditsForPack(pack) {
  const normalized = normalizeCreditPack(pack);
  return normalized ? CREDIT_PACKS[normalized] : null;
}

function stripePriceEnvKeyForPack(pack) {
  const raw = Math.floor(Number(pack) || 0);
  const normalized = normalizeCreditPack(raw);
  if (!normalized) return null;
  const primary = STRIPE_PRICE_ENV_KEYS[normalized];
  if (primary && String(process.env[primary] || '').trim()) return primary;
  const legacyKey = STRIPE_PRICE_ENV_KEYS[raw];
  if (raw !== normalized && legacyKey && String(process.env[legacyKey] || '').trim()) {
    return legacyKey;
  }
  return primary || legacyKey || null;
}

function stripePriceIdForPack(pack) {
  const envKey = stripePriceEnvKeyForPack(pack);
  if (!envKey) return null;
  return String(process.env[envKey] || '').trim() || null;
}

function packMoreExpensiveThanProSubscription(pack) {
  const normalized = normalizeCreditPack(pack);
  if (!normalized || !PACK_META[normalized]) return false;
  return PACK_META[normalized].pricePerCredit > PRO_PRICE_PER_CREDIT + 1e-9;
}

/** UI / modal: upgrade before packs depending on plan. */
function exhaustedWallActions(plan) {
  const p = String(plan || 'guest').toLowerCase();
  if (p === 'free' || p === 'guest') {
    return { primary: 'upgrade_pro', showPacks: false, showAutoRecharge: false };
  }
  if (p === 'pro') {
    return { primary: 'upgrade_pro_max', showPacks: true, showAutoRecharge: true };
  }
  if (p === 'pro_max') {
    return { primary: 'buy_pack', showPacks: true, showAutoRecharge: true };
  }
  return { primary: 'upgrade_pro', showPacks: false, showAutoRecharge: false };
}

function listCreditPackOffers() {
  return CREDIT_PACK_SIZES.map((size) => ({
    pack: size,
    credits: CREDIT_PACKS[size],
    ...PACK_META[size],
    noExpiry: true,
    moreExpensiveThanPro: packMoreExpensiveThanProSubscription(size),
  }));
}

module.exports = {
  CREDIT_PACK_SIZES,
  CREDIT_PACKS,
  PACK_META,
  LEGACY_PACK_MAP,
  STRIPE_PRICE_ENV_KEYS,
  PRO_PRICE_PER_CREDIT,
  normalizeCreditPack,
  creditsForPack,
  stripePriceEnvKeyForPack,
  stripePriceIdForPack,
  packMoreExpensiveThanProSubscription,
  exhaustedWallActions,
  listCreditPackOffers,
};
