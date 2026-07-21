#!/usr/bin/env node
/** User dropdown plan buttons — resolveAppPlan unifies S.plan / S.user.plan / lc_quota. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeDom() {
  const els = new Map();
  const factory = (id) => {
    const el = {
      id,
      textContent: '',
      innerHTML: '',
      className: '',
      hidden: id === 'udUpgrade' || id === 'udSignIn' ? false : false,
      style: {},
    };
    els.set(id, el);
    return el;
  };
  return {
    els,
    document: {
      getElementById: (id) => els.get(id) || factory(id),
      addEventListener: () => {},
    },
  };
}

function loadAuthSandbox({ user, plan, quotaPlan, guest = false, authenticated = true }) {
  const dom = makeDom();
  const store = {};
  if (user) store.lc_user = JSON.stringify(user);
  if (quotaPlan) store.lc_quota = JSON.stringify({ plan: quotaPlan, month: '2026-5', used: 0 });
  if (guest) store.lc_guest = '1';
  else if (authenticated && user?.email) store.lc_token = 'test-session';

  const sandbox = {
    ...dom,
    window: {},
    localStorage: {
      getItem(k) {
        return store[k] ?? null;
      },
      setItem(k, v) {
        store[k] = v;
      },
      removeItem(k) {
        delete store[k];
      },
    },
    S: {
      user: user ? { ...user } : null,
      plan: plan ?? 'free',
    },
    Auth: {
      isGuest: () => guest,
      hasSession: () => authenticated && !!user?.email && user.email !== 'guest@lexicoil.com',
    },
    GUEST_QUOTA: 2,
    FREE_QUOTA: 5,
    PRO_QUOTA: 12,
    esc: (s) => String(s ?? ''),
    console,
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/bootstrap/state.js'), 'utf8'), sandbox);
  // state.js uses a context-local `const S` — mutate it inside the VM, not via sandbox.S
  vm.runInContext(
    `S.user = ${user ? JSON.stringify(user) : 'null'}; S.plan = ${JSON.stringify(plan ?? (guest ? 'guest' : 'free'))};`,
    sandbox,
  );
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/bootstrap/quota.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/bootstrap/featureQuota.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/bootstrap/auth.js'), 'utf8'), sandbox);

  return sandbox;
}

function assertDropdown(sandbox, { upgradeHidden, signInHidden, manageVisible, planLabel }) {
  sandbox.refreshUserDropdown();
  const up = sandbox.document.getElementById('udUpgrade');
  const sign = sandbox.document.getElementById('udSignIn');
  const sub = sandbox.document.getElementById('udManageSub');
  const plan = sandbox.document.getElementById('udPlan');
  assert.equal(up.hidden, upgradeHidden, `udUpgrade hidden=${upgradeHidden}`);
  assert.equal(up.style.display, upgradeHidden ? 'none' : '', `udUpgrade display`);
  assert.equal(sign.hidden, signInHidden, `udSignIn hidden=${signInHidden}`);
  assert.equal(sub.hidden, !manageVisible, `udManageSub visible=${manageVisible}`);
  assert.equal(plan.textContent, planLabel, `udPlan label ${planLabel}`);
}

function setUserBilling(sandbox, patch) {
  sandbox.S.user = { ...sandbox.S.user, ...patch };
  const raw = sandbox.localStorage.getItem('lc_user');
  if (raw) {
    const u = JSON.parse(raw);
    sandbox.localStorage.setItem('lc_user', JSON.stringify({ ...u, ...patch }));
  }
}

{
  const sb = loadAuthSandbox({
    user: { name: 'Pro User', email: 'pro@test.com', plan: 'pro', avatar: 'P' },
    plan: 'free',
    quotaPlan: 'pro',
  });
  assert.equal(sb.resolveAppPlan(), 'pro', 'resolveAppPlan prefers pro from user/quota');
  assertDropdown(sb, { upgradeHidden: true, signInHidden: true, manageVisible: true, planLabel: 'Pro' });
  console.log('OK   Pro session hides upgrade + sign-in even when S.plan stale');
}

{
  const sb = loadAuthSandbox({
    user: { name: 'Manual Pro', email: 'manual@test.com', plan: 'pro', avatar: 'M', billingSource: 'manual' },
    plan: 'pro',
    quotaPlan: 'pro',
  });
  assertDropdown(sb, { upgradeHidden: true, signInHidden: true, manageVisible: false, planLabel: 'Pro' });
  console.log('OK   Manual Pro hides manage subscription');
}

{
  const sb = loadAuthSandbox({
    user: { name: 'Free User', email: 'free@test.com', plan: 'free', avatar: 'F' },
    plan: 'free',
  });
  assertDropdown(sb, { upgradeHidden: false, signInHidden: true, manageVisible: false, planLabel: 'Free' });
  console.log('OK   Free session shows upgrade, hides sign-in');
}

{
  const sb = loadAuthSandbox({
    user: null,
    guest: true,
    authenticated: false,
  });
  assertDropdown(sb, { upgradeHidden: true, signInHidden: false, manageVisible: false, planLabel: 'Guest' });
  console.log('OK   Guest shows sign-in, hides upgrade');
}

{
  const sb = loadAuthSandbox({
    user: { name: 'Pro User', email: 'pro@test.com', plan: 'pro', avatar: 'P' },
    plan: 'guest',
  });
  sb.refreshUserDropdown();
  assert.equal(sb.document.getElementById('udUpgrade').hidden, true);
  assert.equal(sb.document.getElementById('udSignIn').hidden, true);
  console.log('OK   refresh before syncAppPlan — pro from S.user.plan still wins');
}

console.log('test-user-dropdown-plan: ok');
