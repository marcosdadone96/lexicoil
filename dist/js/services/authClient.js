const Auth = (() => {
  const TOKEN_KEY = 'lc_token';
  const GUEST_KEY = 'lc_guest';

  let cloudEnabled = null;
  let localMode = false;
  let supabaseEnabled = false;
  let authConfig = null;
  let authListenerBound = false;

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
    if (typeof applyFreeCombo === 'function') applyFreeCombo(user);
  }

  function pendingComboPayload() {
    if (typeof readRegisterComboFromForm !== 'function') return {};
    const combo = readRegisterComboFromForm();
    return { lang: combo.lang, level: combo.level };
  }

  async function exchangeSupabaseSession(accessToken, comboExtra) {
    const combo = comboExtra || pendingComboPayload();
    const { res, data } = await api('auth-supabase-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, ...combo }),
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
      deletedFlashcards: Array.isArray(S.deletedFlashcards) ? S.deletedFlashcards : read('lc_fc_del', []),
      history: Array.isArray(S.history) ? S.history : read('lc_hist', []),
      savedExams: Array.isArray(S.savedExams) ? S.savedExams : read('lc_saved', []),
      deletedSavedExams: Array.isArray(S.deletedSavedExams) ? S.deletedSavedExams : read('lc_saved_del', []),
      activityLog: Array.isArray(S.activityLog) ? S.activityLog : read('lc_activity', []),
      studyTime:
        S.studyTime && typeof S.studyTime === 'object'
          ? S.studyTime
          : read('lc_time', typeof ActivityTrack !== 'undefined' ? ActivityTrack.defaultStudyTime() : {}),
      mastery:
        typeof AnalyticsStore !== 'undefined'
          ? AnalyticsStore.exportSnapshot()
          : read('lc_mastery', { profiles: {} }),
      burned:
        typeof BurnedRegistry !== 'undefined'
          ? BurnedRegistry.toPayload()
          : read('lc_burned', { v: 1, keys: [], ids: [] }),
      goals: Array.isArray(S.goals) ? S.goals : read('lc_goals', []),
      activeGoalId: S.activeGoalId || localStorage.getItem('lc_active_goal') || null,
      notebook: S.notebook && typeof S.notebook === 'object' ? S.notebook : read('lc_notes', { tabs: [] }),
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
            deletedFlashcards: Array.isArray(server.deletedFlashcards) ? server.deletedFlashcards : localBefore.deletedFlashcards,
            history: Array.isArray(server.history) ? server.history : localBefore.history,
            savedExams: Array.isArray(server.savedExams) ? server.savedExams : localBefore.savedExams,
            deletedSavedExams: Array.isArray(server.deletedSavedExams) ? server.deletedSavedExams : localBefore.deletedSavedExams,
            activityLog: Array.isArray(server.activityLog) ? server.activityLog : localBefore.activityLog,
            studyTime: server.studyTime && typeof server.studyTime === 'object' ? server.studyTime : localBefore.studyTime,
            mastery: server.mastery && typeof server.mastery === 'object' ? server.mastery : localBefore.mastery,
            burned: server.burned && typeof server.burned === 'object' ? server.burned : localBefore.burned,
          };
    S.flashcards = merged.flashcards;
    S.deletedFlashcards = merged.deletedFlashcards || [];
    S.history = merged.history;
    S.savedExams = merged.savedExams;
    S.deletedSavedExams = merged.deletedSavedExams || [];
    S.activityLog = merged.activityLog || [];
    S.studyTime = merged.studyTime || (typeof ActivityTrack !== 'undefined' ? ActivityTrack.defaultStudyTime() : {});
    if (typeof AnalyticsStore !== 'undefined' && merged.mastery) {
      AnalyticsStore.replaceSnapshot(merged.mastery);
    } else if (merged.mastery) {
      localStorage.setItem('lc_mastery', JSON.stringify(merged.mastery));
    }
    localStorage.setItem('lc_fc', JSON.stringify(S.flashcards));
    localStorage.setItem('lc_fc_del', JSON.stringify(S.deletedFlashcards));
    localStorage.setItem('lc_hist', JSON.stringify(S.history));
    localStorage.setItem('lc_saved', JSON.stringify(S.savedExams));
    localStorage.setItem('lc_saved_del', JSON.stringify(S.deletedSavedExams));
    localStorage.setItem('lc_activity', JSON.stringify(S.activityLog));
    localStorage.setItem('lc_time', JSON.stringify(S.studyTime));
    if (merged.burned) { localStorage.setItem('lc_burned', JSON.stringify(merged.burned)); if (typeof S !== 'undefined') S.burned = null; }
    if (Array.isArray(merged.goals)) {
      S.goals = merged.goals;
      localStorage.setItem('lc_goals', JSON.stringify(merged.goals));
    }
    if (merged.activeGoalId) {
      S.activeGoalId = merged.activeGoalId;
      localStorage.setItem('lc_active_goal', merged.activeGoalId);
    }
    if (merged.notebook) {
      S.notebook = merged.notebook;
      localStorage.setItem('lc_notes', JSON.stringify(merged.notebook));
    }
    if (typeof AnalyticsStore !== 'undefined') {
      localStorage.setItem(AnalyticsStore.KEY, JSON.stringify(AnalyticsStore.exportSnapshot()));
    }
    // Apply user preferences from server (translation language, TTS voice)
    const serverPrefs = server.preferences;
    if (serverPrefs) {
      const xlat = Array.isArray(serverPrefs.translationLangs) && serverPrefs.translationLangs[0];
      if (xlat && typeof S !== 'undefined') {
        S.fcLang = xlat;
        try { localStorage.setItem('lc_pref_xlat', xlat); } catch (_) {}
      }
      if (serverPrefs.ttsVoices && typeof setTtsVoicePref === 'function') {
        Object.entries(serverPrefs.ttsVoices || {}).forEach(([lang, voice]) => {
          if (voice) setTtsVoicePref(lang, voice);
        });
      }
    }
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
          deletedFlashcards: S.deletedFlashcards || [],
          history: S.history,
          savedExams: S.savedExams,
          deletedSavedExams: S.deletedSavedExams || [],
          activityLog: S.activityLog || [],
          studyTime: S.studyTime || {},
          mastery:
            typeof AnalyticsStore !== 'undefined'
              ? AnalyticsStore.exportSnapshot()
              : JSON.parse(localStorage.getItem('lc_mastery') || '{"profiles":{}}'),
          burned:
            typeof BurnedRegistry !== 'undefined'
              ? BurnedRegistry.toPayload()
              : JSON.parse(localStorage.getItem('lc_burned') || '{"v":1,"keys":[],"ids":[]}'),
          goals: Array.isArray(S.goals) ? S.goals : [],
          activeGoalId: S.activeGoalId || null,
          notebook: S.notebook && typeof S.notebook === 'object' ? S.notebook : { tabs: [] },
          preferences: {
            translationLangs: [S.fcLang || 'en'],
            ttsVoices: (typeof getTtsVoicePref === 'function' && S.subject)
              ? { [S.subject]: getTtsVoicePref(S.subject) }
              : {},
          },
        },
      }),
    });
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

  function setupSupabaseAuthListener() {
    if (authListenerBound || !supabaseEnabled || !SupabaseAuth.isReady()) return;
    authListenerBound = true;
    const sb = SupabaseAuth.getClient();
    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        // Ignore passive SIGNED_OUT (e.g. cross-tab storage noise). Auth.logout() clears state.
        return;
      }
      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session?.access_token) {
        try {
          await exchangeSupabaseSession(session.access_token);
          if (typeof updUserBtn === 'function') updUserBtn();
          if (typeof refreshUserDropdown === 'function') refreshUserDropdown();
          if (typeof restoreAppShellAfterAuth === 'function' && isAppAuthenticated()) {
            const active = typeof getActiveScreenId === 'function' ? getActiveScreenId() : null;
            const ov = document.getElementById('authOverlay');
            const overlayOpen = Boolean(ov && ov.classList.contains('open'));
            if (overlayOpen || !active) restoreAppShellAfterAuth();
            else if (active === 'homeScreen' && typeof renderHomeScreen === 'function') renderHomeScreen();
          }
        } catch {
          /* keep prior token if exchange fails */
        }
      }
    });
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
    const combo = typeof readRegisterComboFromForm === 'function' ? readRegisterComboFromForm() : null;
    if (combo && typeof savePendingCombo === 'function') savePendingCombo(combo);

    if (supabaseEnabled) {
      if (!(await ensureSupabaseReady())) {
        throw new Error('Supabase auth is unavailable. Refresh the page and try again.');
      }
      const sb = SupabaseAuth.getClient();
      const { data, error } = await sb.auth.signUp({
        email: em,
        password,
        options: {
          data: {
            full_name: String(name || '').trim(),
            free_combo_lang: combo?.lang || 'de',
            free_combo_level: combo?.level || 'B1',
          },
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
      body: JSON.stringify({
        name,
        email: em,
        password,
        lang: combo?.lang,
        level: combo?.level,
      }),
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
        if (supabaseEnabled && (await ensureSupabaseReady())) setupSupabaseAuthListener();
        return true;
      }
      if (res.status !== 401 && restoreCachedUser()) {
        if (supabaseEnabled && (await ensureSupabaseReady())) setupSupabaseAuthListener();
        return true;
      }
    }

    if (supabaseEnabled && (await ensureSupabaseReady())) {
      setupSupabaseAuthListener();
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

    if (token && restoreCachedUser()) {
      if (supabaseEnabled && (await ensureSupabaseReady())) setupSupabaseAuthListener();
      return true;
    }

    if (token) {
      setToken('');
      localStorage.removeItem('lc_user');
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
        await SupabaseAuth.getClient().auth.signOut({ scope: 'local' });
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
    applyUser({ name, email: em, plan: 'free', pro: false, freeCombo: readRegisterComboFromForm?.() });
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
