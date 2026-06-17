'use strict';

const { checkQuota, decrementQuota, quotaIdemKey } = require('./quotaLib.js');
const { verifyGenTicket, verifyGenTicketSignature, renewGenTicketPayload } = require('./genTicket.js');
const { getStoreForEvent } = require('./blobStore.js');
const { casWriteJson, writeIdempotentResult } = require('./casBlob.js');
const { getJwtSecret } = require('./authLib.js');
const { releaseAiCreditConsumption, getAiCredits } = require('./aiCredits.js');

function ticketSubForQuotaState(qState) {
  if (!qState) return null;
  return qState.authenticated ? qState.email : `guest:${qState.ipHash || 'unknown'}`;
}

/**
 * Link a generation-ticket nonce to the quota increment issued at startGeneration
 * so releaseGeneration can refund idempotently via decrementQuota({ requestId: nonce }).
 */
async function linkTicketQuotaCharge(event, qState, nonce, quotaMeta) {
  if (!nonce || !quotaMeta || quotaMeta.error) return;
  try {
    const store = getStoreForEvent(event);
    const scopeKey = qState.authenticated ? qState.qKey : qState.gKey;
    await writeIdempotentResult(store, quotaIdemKey(scopeKey, nonce), quotaMeta);
  } catch (err) {
    console.error('[releaseGeneration] link ticket quota charge failed:', err.message);
  }
}

/**
 * Refund the startGeneration charge when the user never received a deliverable exam.
 * personal_exam → AI credits; exam_generation / quick_exam → monthly exam quota.
 * chunksUsed does not block refund.
 * @returns {Promise<{ released: boolean, used?: number, max?: number, plan?: string, reason?: string }>}
 */
async function releaseGenerationQuota(event, { genTicket } = {}) {
  const secret = getJwtSecret();
  if (!secret || !genTicket) return { released: false, reason: 'misconfigured' };

  const ticketPayload = verifyGenTicket(genTicket, secret) || verifyGenTicketSignature(genTicket, secret);
  if (!ticketPayload) return { released: false, reason: 'ticket_invalid' };

  let quotaCheck;
  try {
    quotaCheck = await checkQuota(event);
  } catch (err) {
    console.error('[releaseGeneration] quota check failed:', err.message);
    return { released: false, reason: 'quota_unavailable' };
  }

  const qState = quotaCheck?.state;
  const expectedSub = ticketSubForQuotaState(qState);
  if (!expectedSub || ticketPayload.sub !== expectedSub) {
    return { released: false, reason: 'ticket_owner_mismatch' };
  }

  const store = getStoreForEvent(event);
  const ticketKey = `gentk:${ticketPayload.nonce}`;

  const casResult = await casWriteJson(
    store,
    ticketKey,
    (current) => {
      if (current?.released) {
        return { skip: true, result: { released: false, reason: 'already_released' } };
      }
      if (current?.delivered) {
        return { skip: true, result: { released: false, reason: 'already_delivered' } };
      }
      const chunksUsed = current?.chunksUsed || 0;
      return {
        payload: {
          chunksUsed,
          maxChunks: current?.maxChunks || ticketPayload.maxChunks,
          released: true,
          releasedAt: Date.now(),
        },
        result: { released: true, doRefund: true, chunksUsed },
      };
    },
    { logTag: '[gentk-release]' },
  ).catch((err) => {
    console.error('[releaseGeneration] CAS error:', err.message);
    return { released: false, reason: 'cas_error' };
  });

  if (!casResult?.released || !casResult.doRefund) {
    return {
      released: false,
      reason: casResult?.reason || 'not_eligible',
    };
  }

  if (ticketPayload.scope === 'personal_exam') {
    let refundMeta;
    try {
      refundMeta = await releaseAiCreditConsumption(event, 'personal_exam', {
        requestId: ticketPayload.nonce,
      });
    } catch (err) {
      console.error('[releaseGeneration] releaseAiCreditConsumption failed:', err.message);
      return { released: false, reason: 'refund_failed' };
    }
    if (refundMeta?.skipped && refundMeta.reason === 'no_charge') {
      return { released: false, reason: 'no_increment' };
    }
    const aiAfter = await getAiCredits(event).catch(() => ({}));
    return {
      released: true,
      plan: quotaCheck.plan,
      aiUsed: refundMeta?.aiUsed ?? aiAfter.used,
      aiRemaining: refundMeta?.aiRemaining ?? refundMeta?.remaining ?? aiAfter.remaining,
      aiMax: refundMeta?.aiMax ?? aiAfter.max,
      remaining: refundMeta?.aiRemaining ?? refundMeta?.remaining ?? aiAfter.remaining,
      chunksUsed: casResult.chunksUsed ?? 0,
    };
  }

  let refundMeta;
  try {
    refundMeta = await decrementQuota(quotaCheck, { requestId: ticketPayload.nonce });
  } catch (err) {
    console.error('[releaseGeneration] decrementQuota failed:', err.message);
    return { released: false, reason: 'refund_failed' };
  }

  if (refundMeta?.skipped && refundMeta.reason === 'no_increment') {
    return { released: false, reason: 'no_increment' };
  }

  return {
    released: true,
    used: refundMeta?.used ?? quotaCheck.used,
    max: refundMeta?.max ?? quotaCheck.max,
    plan: refundMeta?.plan ?? quotaCheck.plan,
    chunksUsed: casResult.chunksUsed ?? 0,
  };
}

/**
 * Mark a generation session as successfully delivered — blocks future quota refund.
 */
async function deliverGenerationQuota(event, { genTicket } = {}) {
  const secret = getJwtSecret();
  if (!secret || !genTicket) return { delivered: false, reason: 'misconfigured' };

  const ticketPayload = verifyGenTicket(genTicket, secret) || verifyGenTicketSignature(genTicket, secret);
  if (!ticketPayload) return { delivered: false, reason: 'ticket_invalid' };

  let quotaCheck;
  try {
    quotaCheck = await checkQuota(event);
  } catch (err) {
    return { delivered: false, reason: 'quota_unavailable' };
  }

  const qState = quotaCheck?.state;
  const expectedSub = ticketSubForQuotaState(qState);
  if (!expectedSub || ticketPayload.sub !== expectedSub) {
    return { delivered: false, reason: 'ticket_owner_mismatch' };
  }

  const store = getStoreForEvent(event);
  const ticketKey = `gentk:${ticketPayload.nonce}`;

  const casResult = await casWriteJson(
    store,
    ticketKey,
    (current) => {
      if (current?.released) {
        return { skip: true, result: { delivered: false, reason: 'already_released' } };
      }
      if (current?.delivered) {
        return { skip: true, result: { delivered: true, reason: 'already_delivered' } };
      }
      return {
        payload: {
          chunksUsed: current?.chunksUsed || 0,
          maxChunks: current?.maxChunks || ticketPayload.maxChunks,
          delivered: true,
          deliveredAt: Date.now(),
        },
        result: { delivered: true },
      };
    },
    { logTag: '[gentk-deliver]' },
  ).catch(() => ({ delivered: false, reason: 'cas_error' }));

  if (ticketPayload.scope === 'personal_exam') {
    const aiAfter = await getAiCredits(event).catch(() => ({}));
    return {
      delivered: !!casResult?.delivered,
      reason: casResult?.reason,
      plan: quotaCheck.plan,
      aiUsed: aiAfter.used,
      aiRemaining: aiAfter.remaining,
      aiMax: aiAfter.max,
      remaining: aiAfter.remaining,
    };
  }

  return {
    delivered: !!casResult?.delivered,
    reason: casResult?.reason,
    used: quotaCheck.used,
    max: quotaCheck.max,
    plan: quotaCheck.plan,
  };
}

/**
 * Re-issue a ticket (new expiry) for the same session without charging quota again.
 */
async function renewGenerationTicket(event, { genTicket } = {}) {
  const secret = getJwtSecret();
  if (!secret || !genTicket) return { renewed: false, reason: 'misconfigured' };

  const payload = verifyGenTicketSignature(genTicket, secret);
  if (!payload?.nonce) return { renewed: false, reason: 'ticket_invalid' };

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now - 600) {
    return { renewed: false, reason: 'ticket_too_old' };
  }

  let quotaCheck;
  try {
    quotaCheck = await checkQuota(event);
  } catch (err) {
    return { renewed: false, reason: 'quota_unavailable' };
  }

  const qState = quotaCheck?.state;
  const expectedSub = ticketSubForQuotaState(qState);
  if (!expectedSub || payload.sub !== expectedSub) {
    return { renewed: false, reason: 'ticket_owner_mismatch' };
  }

  const store = getStoreForEvent(event);
  const ticketKey = `gentk:${payload.nonce}`;
  const row = await store.get(ticketKey, { type: 'json' }).catch(() => null);
  if (row?.released || row?.delivered) {
    return { renewed: false, reason: row?.delivered ? 'already_delivered' : 'already_released' };
  }

  const { token, payload: renewedPayload } = renewGenTicketPayload(payload, secret);
  return { renewed: true, ticket: token, nonce: renewedPayload.nonce };
}

module.exports = {
  linkTicketQuotaCharge,
  releaseGenerationQuota,
  deliverGenerationQuota,
  renewGenerationTicket,
  ticketSubForQuotaState,
};
