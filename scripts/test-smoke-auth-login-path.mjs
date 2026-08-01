#!/usr/bin/env node
/**
 * Auth path diagnosis — production uses Supabase vs legacy auth-login.
 * Run: node scripts/test-smoke-auth-login-path.mjs
 */
import { diagnoseLoginMismatch } from './lib/smokeAuthLogin.mjs';

const base = process.env.SMOKE_BASE_URL || 'https://lexicoil.com';
const email = process.env.SMOKE_DIAG_EMAIL || 'marcosdadra@gmail.com';

const diag = await diagnoseLoginMismatch(base, email);
console.log(JSON.stringify(diag, null, 2));

if (!diag.authConfig.supabase) {
  console.log('\nLegacy-only site: smoke auth-login is correct.');
} else {
  console.log('\nSupabase site: smoke must use Supabase token + auth-supabase-session (see smokeAuthLogin.mjs).');
}
