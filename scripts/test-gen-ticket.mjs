#!/usr/bin/env node
/**
 * test-gen-ticket.mjs
 *
 * Verifies the generation-ticket security model WITHOUT making real HTTP calls.
 *
 * Tests:
 *  1. signGenTicket / verifyGenTicket round-trip
 *  2. Expired ticket is rejected
 *  3. Tampered ticket is rejected
 *  4. Valid ticket verifies correctly
 *  5. Simulated server: {examGeneration:true, consumeQuota:false} without ticket → 403
 *  6. Simulated server: valid ticket allows the call (no quota charge)
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { signGenTicket, verifyGenTicket, createGenTicket, TICKETED_SCOPES } =
  require(path.join(ROOT, 'netlify/functions/lib/genTicket.js'));

const SECRET = 'test-secret-at-least-16-chars!!';

let passed = 0;
let failed = 0;

function assert(label, cond, detail) {
  if (cond) {
    console.log('  OK:', label);
    passed++;
  } else {
    console.error('FAIL:', label, detail ? `— ${detail}` : '');
    failed++;
  }
}

// ── 1. Round-trip ────────────────────────────────────────────────────────────
console.log('\n[1] signGenTicket / verifyGenTicket round-trip');
{
  const { token, payload } = createGenTicket('user@test.com', 'exam_generation', 4, SECRET);
  assert('token is a non-empty string', typeof token === 'string' && token.length > 10);
  const decoded = verifyGenTicket(token, SECRET);
  assert('decoded is non-null', decoded !== null);
  assert('sub matches', decoded?.sub === 'user@test.com');
  assert('scope matches', decoded?.scope === 'exam_generation');
  assert('maxChunks matches', decoded?.maxChunks === 4);
  assert('nonce is 32 hex chars', /^[0-9a-f]{32}$/.test(decoded?.nonce));
  assert('exp is in future', decoded?.exp > Math.floor(Date.now() / 1000));
}

// ── 2. Expired token ─────────────────────────────────────────────────────────
console.log('\n[2] Expired ticket is rejected');
{
  const now = Math.floor(Date.now() / 1000);
  const expiredPayload = { sub: 'user@test.com', scope: 'exam_generation', maxChunks: 2, nonce: 'abc', iat: now - 200, exp: now - 10 };
  const expiredToken = signGenTicket(expiredPayload, SECRET);
  const result = verifyGenTicket(expiredToken, SECRET);
  assert('expired token returns null', result === null);
}

// ── 3. Tampered payload ───────────────────────────────────────────────────────
console.log('\n[3] Tampered ticket is rejected');
{
  const { token } = createGenTicket('user@test.com', 'exam_generation', 2, SECRET);
  // flip one char in the payload portion
  const dot = token.lastIndexOf('.');
  const tampered = token.slice(0, 5) + (token[5] === 'A' ? 'B' : 'A') + token.slice(6, dot) + token.slice(dot);
  const result = verifyGenTicket(tampered, SECRET);
  assert('tampered token returns null', result === null);
}

// ── 4. Wrong secret ───────────────────────────────────────────────────────────
console.log('\n[4] Wrong secret is rejected');
{
  const { token } = createGenTicket('user@test.com', 'exam_generation', 2, SECRET);
  const result = verifyGenTicket(token, 'wrong-secret-totally-different!!');
  assert('wrong secret returns null', result === null);
}

// ── 5. Server logic: examGeneration without ticket → ticket_required ──────────
console.log('\n[5] examGeneration without genTicket is rejected with ticket_required');
{
  // Simulate the server decision branch inline (without calling the real server)
  function simulateServerCheck(body) {
    if (body.examGeneration) {
      if (!body.genTicket) return { status: 403, error: 'ticket_required' };
      const payload = verifyGenTicket(body.genTicket, SECRET);
      if (!payload) return { status: 403, error: 'ticket_invalid' };
      if (!TICKETED_SCOPES.has(payload.scope)) return { status: 403, error: 'ticket_scope_invalid' };
      return { status: 200, ok: true };
    }
    return { status: 200, ok: true, quotaCharged: true };
  }

  const noTicket = simulateServerCheck({ examGeneration: true, consumeQuota: false, aiAction: 'exam_generation', prompt: 'hello' });
  assert('status is 403', noTicket.status === 403);
  assert('error is ticket_required', noTicket.error === 'ticket_required');

  const withConsumeQuotaFalse = simulateServerCheck({ examGeneration: true, consumeQuota: false });
  assert('consumeQuota:false still rejected without ticket', withConsumeQuotaFalse.status === 403);
}

// ── 6. Server logic: valid ticket allows call ─────────────────────────────────
console.log('\n[6] Valid ticket allows examGeneration call without quota charge');
{
  function simulateServerCheck(body) {
    if (body.examGeneration) {
      if (!body.genTicket) return { status: 403, error: 'ticket_required' };
      const payload = verifyGenTicket(body.genTicket, SECRET);
      if (!payload) return { status: 403, error: 'ticket_invalid' };
      if (!TICKETED_SCOPES.has(payload.scope)) return { status: 403, error: 'ticket_scope_invalid' };
      return { status: 200, ok: true, quotaCharged: false };
    }
    return { status: 200, ok: true, quotaCharged: true };
  }

  const { token } = createGenTicket('user@test.com', 'exam_generation', 4, SECRET);
  const result = simulateServerCheck({ examGeneration: true, aiAction: 'exam_generation', genTicket: token, prompt: 'build exam' });
  assert('status is 200', result.status === 200);
  assert('quota was NOT charged for chunk call', result.quotaCharged === false);
}

// ── 7. TICKETED_SCOPES set ────────────────────────────────────────────────────
console.log('\n[7] TICKETED_SCOPES contains expected values');
{
  assert('exam_generation in scopes', TICKETED_SCOPES.has('exam_generation'));
  assert('personal_exam in scopes', TICKETED_SCOPES.has('personal_exam'));
  assert('quick_exam in scopes', TICKETED_SCOPES.has('quick_exam'));
  assert('translation NOT in scopes', !TICKETED_SCOPES.has('translation'));
}

// ── 8. maxChunks capped at MAX_CHUNKS_ALLOWED ─────────────────────────────────
console.log('\n[8] maxChunks is capped server-side');
{
  const { payload } = createGenTicket('u@x.com', 'exam_generation', 999, SECRET);
  assert('maxChunks capped at 20', payload.maxChunks === 20);
  const { payload: p2 } = createGenTicket('u@x.com', 'exam_generation', 0, SECRET);
  assert('maxChunks minimum is 1', p2.maxChunks === 1);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
