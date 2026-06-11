const Auth = (() => {
  const TOKEN_KEY = 'lc_token';
  const GUEST_KEY = 'lc_guest';

  let cloudEnabled = null;
  let localMode = false;
  let supabaseEnabled = false;
  let authConfig = null;

  function isGuest() {
    return localStorage.getItem(GUEST_KEY) === '1';
  }

  function clearGuest() {
    localStorage.removeItem(GUEST_KEY);
  }

  function continueAsGuest() {
    clearGuest();
    localStorage.setItem(GUEST_KEY, '1');
    setToken('');
    applyUser({
      name: 'Guest',
      email: 'guest@lexicoil.com',
      avatar: 'G',
      plan: 'free',
      pro: false,
      guest: true,
    });
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  async function api(path, options = {}) {
    const res = await fetch(`/.netlify/functions/${path}`, options);
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* empty */
    }
    return { res, data };
  }

  async function loadAuthConfig() {
    if (authConfig) return authConfig;
    try {
      const { res, data } = await api('auth-config');
      authConfig = res.ok ? data : { enabled: false };
    } catch {
      authConfig = { enabled: false };
    }
    cloudEnabled = Boolean(authConfig.enabled);
    localMode = !cloudEnabled;
    supabaseEnabled = Boolean(authConfig.supabase);
    return authConfig;
  }

  async function checkCloudAuth() {
    if (cloudEnabled !== null) return cloudEnabled;
    await loadAuthConfig();
    return cloudEnabled;
  }

  function applyUser(user) {
    if (!user) return;
    const plan = user.guest ? 'guest' : (user.pro || user.plan === 'pro') ? 'pro' : user.plan || 'free';
    const avatar = (user.name || user.email || '?')[0].toUpperCase();
    saveUser({
      name: user.name || 'User',
      email: user.email,
      avatar,
      plan: user.guest ? 'free' : plan,
      memberSince: user.memberSince || null,
    });
    if (typeof S !== 'undefined') S.plan = plan;
    if (typeof applyServerQuota === 'function') {
      if (user.quota) {
        applyServerQuota({ used: user.quota.used, max: user.quota.max, plan });
      } else if (user.guest) {
        applyServerQuota({ used: getQuotaUsed?.() || 0, max: 2, plan: 'guest' });
      }
    }
  }

  async function exchangeSupabaseSession(accessToken) {
    const { res, data } = await api('auth-supabase-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
    });
    if (!res.ok) throw new Error(mapAuthError(data.error));
    clearGuest();
    setToken(data.token);
    applyUser(data.user);
    await pullSync();
    const { res: meRes, data: meData } = await api('auth-me', { headers: authHeaders() });
    if (meRes.ok) applyUser(meData.user);
    return data.user;
  }

  function localSyncSnapshot() {
    const read = (key, fallback) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    };
    return {
      flashcards: Array.isArray(S.flashcards) ? S.flashcards : read('lc_fc', []),
      history: Array.isArray(S.history) ? S.history : read('lc_hist', []),
      savedExams: Array.isArray(S.savedExams) ? S.savedExams : read('lc_saved', []),
      activityLog: Array.isArray(S.activityLog) ? S.activityLog : read('lc_activity', []),
      studyTime:
        S.studyTime && typeof S.studyTime === 'object'
          ? S.studyTime
          : read('lc_time', typeof ActivityTrack !== 'undefined' ? ActivityTrack.defaultStudyTime() : {}),
    };
  }

  async function pullSync() {
    if (localMode || !getToken()) return;
    const localBefore = localSyncSnapshot();
    const { res, data } = await api('user-sync', { headers: authHeaders() });
    if (!res.ok) return;
    const server = data.data || {};
    const merged =
      typeof mergeSyncPayload === 'function'
        ? mergeSyncPayload(localBefore, server)
        : {
            flashcards: Array.isArray(server.flashcards) ? server.flashcards : localBefore.flashcards,
            history: Array.isArray(server.history) ? server.history : localBefore.history,
            savedExams: Array.isArray(server.savedExams) ? server.savedExams : localBefore.savedExams,
            activityLog: Array.isArray(server.activityLog) ? server.activityLog : localBefore.activityLog,
            studyTime: server.studyTime && typeof server.studyTime === 'object' ? server.studyTime : localBefore.studyTime,
          };
    S.flashcards = merged.flashcards;
    S.history = merged.history;
    S.savedExams = merged.savedExams;
    S.activityLog = merged.activityLog || [];
    S.studyTime = merged.studyTime || (typeof ActivityTrack !== 'undefined' ? ActivityTrack.defaultStudyTime() : {});
    localStorage.setItem('lc_fc', JSON.stringify(S.flashcards));
    localStorage.setItem('lc_hist', JSON.stringify(S.history));
    localStorage.setItem('lc_saved', JSON.stringify(S.savedExams));
    localStorage.setItem('lc_activity', JSON.stringify(S.activityLog));
    localStorage.setItem('lc_time', JSON.stringify(S.studyTime));
    if (typeof updBadges === 'function') updBadges();
    if (typeof updQuotaUI === 'function') updQuotaUI();
    await pushSync();
  }

  async function pushSync() {
    if (localMode || !getToken() || isGuest()) return;
    await api('user-sync', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        data: {
          flashcards: S.flashcards,
          history: S.history,
          savedExams: S.savedExams,
          activityLog: S.activityLog || [],
          studyTime: S.studyTime || {},
        },
      }),
    });
  }

  function isSupabaseEmailConfirmed(user) {
    if (!user) return false;
    return Boolean(
      user.email_confirmed_at ||
        user.confirmed_at ||
        user.identities?.some((id) => id.identity_data?.email_verified),
    );
  }

  function isOAuthCallbackUrl() {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search);
    return q.has('code') || /access_token|refresh_token/.test(window.location.hash || '');
  }

  async function ensureSupabaseReady() {
    if (!supabaseEnabled || !authConfig) return false;
    await SupabaseAuth.init(authConfig);
    return SupabaseAuth.isReady();
  }

  async function waitForSupabaseSession(sb, maxMs = 10000) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      if (data?.session?.access_token) return data.session;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  }

  function stripOAuthParamsFromUrl() {
    if (typeof window === 'undefined') return;
    try {
      const u = new URL(window.location.href);
      let dirty = false;
      for (const key of ['code', 'error', 'error_description', 'state']) {
        if (u.searchParams.has(key)) {
          u.searchParams.delete(key);
          dirty = true;
        }
      }
      if (/access_token|refresh_token/i.test(u.hash || '')) {
        u.hash = '';
        dirty = true;
      }
      if (dirty) {
        const next = u.pathname + u.search + u.hash;
        window.history.replaceState({}, document.title, next || '/');
      }
    } catch {
      /* ignore */
    }
  }

  async function completeOAuthCallback() {
    if (!isOAuthCallbackUrl()) return false;
    await loadAuthConfig();
    if (!supabaseEnabled) {
      stripOAuthParamsFromUrl();
      throw new Error('Google sign-in is not configured on the server.');
    }
    if (!(await ensureSupabaseReady())) {
      stripOAuthParamsFromUrl();
      throw new Error('Could not connect to Supabase. Refresh and try again.');
    }

    const sb = SupabaseAuth.getClient();
    const params = new URLSearchParams(window.location.search);
    const oauthErr = params.get('error_description') || params.get('error');
    if (oauthErr) {
      stripOAuthParamsFromUrl();
      throw new Error(decodeURIComponent(String(oauthErr).replace(/\+/g, ' ')));
    }

    const code = params.get('code');
    let session = await waitForSupabaseSession(sb, 3000);

    if (!session?.access_token && code) {
      const { data, error } = await sb.auth.exchangeCodeForSession(code);
      if (error) throw new Error(mapSupabaseError(error));
      if (data?.session) session = data.session;
    }
    if (!session?.access_token) {
      session = await waitForSupabaseSession(sb, 10000);
    }
    if (!session?.access_token) {
      stripOAuthParamsFromUrl();
      throw new Error('Session expired or invalid link. Try signing in again.');
    }

    try {
      await exchangeSupabaseSession(session.access_token);
      return true;
    } finally {
      stripOAuthParamsFromUrl();
    }
  }

  async function register(name, email, password) {
    await loadAuthConfig();
    const em = String(email || '').trim().toLowerCase();

    if (supabaseEnabled) {
      if (!(await ensureSupabaseReady())) {
        throw new Error('Supabase auth is unavailable. Refresh the page and try again.');
      }
      const sb = SupabaseAuth.getClient();
      const { data, error } = await sb.auth.signUp({
        email: em,
        password,
        options: {
          data: { full_name: String(name || '').trim() },
          emailRedirectTo: SupabaseAuth.getEmailRedirectUrl(),
        },
      });
      if (error) throw new Error(mapSupabaseError(error));
      if (data.session?.access_token) {
        return exchangeSupabaseSession(data.session.access_token);
      }
      try {
        await sb.auth.signOut();
      } catch {
        /* ignore */
      }
      return { pendingConfirmation: true, email: em };
    }

    if (localMode) return localRegister(name, email, password);

    const { res, data } = await api('auth-register', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, email: em, password }),
    });
    if (!res.ok) throw new Error(mapAuthError(data.error));
    clearGuest();
    setToken(data.token);
    applyUser(data.user);
    await pullSync();
    const { res: meRes, data: meData } = await api('auth-me', { headers: authHeaders() });
    if (meRes.ok) applyUser(meData.user);
    return data.user;
  }

  async function login(email, password) {
    await loadAuthConfig();
    const em = String(email || '').trim().toLowerCase();

    if (supabaseEnabled) {
      if (!(await ensureSupabaseReady())) {
        throw new Error('Supabase auth is unavailable. Refresh the page and try again.');
      }
      const sb = SupabaseAuth.getClient();
      const { data, error } = await sb.auth.signInWithPassword({ email: em, password });
      if (error) throw new Error(mapSupabaseError(error));
      if (!data.session) throw new Error('Authentication failed.');
      return exchangeSupabaseSession(data.session.access_token);
    }

    if (localMode) return localLogin(email, password);

    const { res, data } = await api('auth-login', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: em, password }),
    });
    if (!res.ok) throw new Error(mapAuthError(data.error));
    clearGuest();
    setToken(data.token);
    applyUser(data.user);
    await pullSync();
    const { res: meRes, data: meData } = await api('auth-me', { headers: authHeaders() });
    if (meRes.ok) applyUser(meData.user);
    return data.user;
  }

  async function signInWithGoogle() {
    await loadAuthConfig();
    if (!supabaseEnabled) {
      throw new Error('Google sign-in is not configured on the server.');
    }
    if (!(await ensureSupabaseReady())) {
      throw new Error('Could not connect to Supabase. Check your connection and try again.');
    }
    const { error } = await SupabaseAuth.getClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: SupabaseAuth.getOAuthRedirectUrl(),
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw error;
  }

  async function resendConfirmationEmail(email) {
    await loadAuthConfig();
    const em = String(email || '').trim().toLowerCase();
    if (!em) throw new Error('Enter your email address.');
    if (!supabaseEnabled) {
      throw new Error('Email confirmation is not configured on the server.');
    }
    if (!(await ensureSupabaseReady())) {
      throw new Error('Supabase auth is unavailable. Refresh the page and try again.');
    }
    const { error } = await SupabaseAuth.getClient().auth.resend({
      type: 'signup',
      email: em,
      options: { emailRedirectTo: SupabaseAuth.getEmailRedirectUrl() },
    });
    if (error) throw new Error(mapSupabaseError(error));
    return { ok: true };
  }

  async function forgotPassword(email) {
    await loadAuthConfig();
    const em = String(email || '').trim().toLowerCase();
    if (!em) throw new Error('Enter your email address.');

    if (supabaseEnabled && SupabaseAuth.isReady()) {
      const sb = SupabaseAuth.getClient();
      const { error } = await sb.auth.resetPasswordForEmail(em, {
        redirectTo: `${SupabaseAuth.getEmailRedirectUrl()}?type=recovery`,
      });
      if (error) throw new Error(mapSupabaseError(error));
      return { ok: true };
    }

    const { res, data } = await api('auth-forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: em }),
    });
    if (!res.ok) throw new Error(mapAuthError(data.error) || 'Could not send reset link.');
    return data;
  }

  function restoreCachedUser() {
    try {
      const raw = localStorage.getItem('lc_user');
      if (!raw) return false;
      const cached = JSON.parse(raw);
      if (!cached?.email) return false;
      applyUser(cached);
      return true;
    } catch {
      return false;
    }
  }

  async function bootstrap() {
    await loadAuthConfig();

    const token = getToken();
    if (token) {
      clearGuest();
      const { res, data } = await api('auth-me', { headers: authHeaders() });
      if (res.ok) {
        applyUser(data.user);
        await pullSync();
        return true;
      }
      if (res.status === 401) {
        setToken('');
        localStorage.removeItem('lc_user');
      } else if (restoreCachedUser()) {
        return true;
      }
    }

    if (supabaseEnabled && (await ensureSupabaseReady())) {
      const { data } = await SupabaseAuth.getClient().auth.getSession();
      if (data?.session?.access_token) {
        try {
          await exchangeSupabaseSession(data.session.access_token);
          return true;
        } catch {
          if (getToken() && restoreCachedUser()) return true;
        }
      }
    }

    if (isGuest()) {
      applyUser({
        name: 'Guest',
        email: 'guest@lexicoil.com',
        avatar: 'G',
        plan: 'free',
        pro: false,
        guest: true,
      });
      return true;
    }

    if (localMode && S.user) return true;

    S.user = null;
    localStorage.removeItem('lc_user');
    return false;
  }

  async function logout() {
    if (supabaseEnabled && SupabaseAuth.isReady()) {
      try {
        await SupabaseAuth.getClient().auth.signOut();
      } catch {
        /* ignore */
      }
    }
    setToken('');
    clearGuest();
    S.user = null;
    S.plan = 'guest';
    localStorage.removeItem('lc_user');
  }

  function mapAuthError(code) {
    const map = {
      email_taken: 'Email already registered.',
      bad_credentials: 'Invalid email or password.',
      invalid_fields: 'Fill all fields correctly.',
      auth_not_configured: 'Accounts are not configured on the server yet.',
      supabase_not_configured: 'Supabase is not configured on the server yet.',
      invalid_supabase_session: 'Session expired. Please sign in again.',
    };
    return map[code] || 'Authentication failed.';
  }

  function mapSupabaseError(err) {
    const msg = String(err?.message || '');
    if (/already registered|already exists|user already registered/i.test(msg)) {
      return 'Email already registered.';
    }
    if (/invalid login credentials/i.test(msg)) return 'Invalid email or password.';
    if (/email not confirmed/i.test(msg)) {
      return 'Please confirm your email before signing in.';
    }
    return msg || 'Authentication failed.';
  }

  function localRegister(name, email, password) {
    const u = getUsers();
    const em = email.trim().toLowerCase();
    if (u[em]) throw new Error('Email already registered.');
    u[em] = { nm: name, pw: password, plan: 'free' };
    localStorage.setItem('lc_users', JSON.stringify(u));
    applyUser({ name, email: em, plan: 'free', pro: false });
  }

  function localLogin(email, password) {
    const em = email.trim().toLowerCase();
    const u = getUsers();
    if (!u[em] || u[em].pw !== password) throw new Error('Invalid email or password.');
    applyUser({
      name: u[em].nm,
      email: em,
      plan: u[em].plan || 'free',
      pro: u[em].plan === 'pro',
    });
  }

  return {
    checkCloudAuth,
    register,
    login,
    signInWithGoogle,
    completeOAuthCallback,
    resendConfirmationEmail,
    forgotPassword,
    bootstrap,
    logout,
    pushSync,
    continueAsGuest,
    clearGuest,
    isGuest,
    hasToken: () => Boolean(getToken()),
    isLocalMode: () => localMode,
    usesSupabase: () => supabaseEnabled,
  };
})();
