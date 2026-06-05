const Auth = (() => {
  const TOKEN_KEY = 'll_token';
  const GUEST_KEY = 'll_guest';
  let cloudEnabled = null;
  let localMode = false;

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
      email: 'guest@lexiloop.app',
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

  async function checkCloudAuth() {
    if (cloudEnabled !== null) return cloudEnabled;
    try {
      const { res, data } = await api('auth-config');
      cloudEnabled = res.ok && Boolean(data.enabled);
    } catch {
      cloudEnabled = false;
    }
    localMode = !cloudEnabled;
    return cloudEnabled;
  }

  function applyUser(user) {
    if (!user) return;
    const avatar = (user.name || user.email || '?')[0].toUpperCase();
    saveUser({
      name: user.name || 'User',
      email: user.email,
      avatar,
      plan: user.pro ? 'pro' : user.plan || 'free',
    });
    if (user.pro) localStorage.setItem('ll_pro', 'true');
    else localStorage.removeItem('ll_pro');
  }

  async function pullSync() {
    if (localMode || !getToken()) return;
    const { res, data } = await api('user-sync', { headers: authHeaders() });
    if (!res.ok) return;
    const d = data.data || {};
    if (Array.isArray(d.flashcards)) S.flashcards = d.flashcards;
    if (Array.isArray(d.history)) S.history = d.history;
    if (Array.isArray(d.savedExams)) S.savedExams = d.savedExams;
    if (d.quota && d.quota.month) {
      localStorage.setItem('ll_quota', JSON.stringify(d.quota));
    }
    localStorage.setItem('ll_fc', JSON.stringify(S.flashcards));
    localStorage.setItem('ll_hist', JSON.stringify(S.history));
    localStorage.setItem('ll_saved', JSON.stringify(S.savedExams));
    updBadges();
    updQuotaUI();
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
          quota: JSON.parse(localStorage.getItem('ll_quota') || 'null') || {
            month: getMonthKey(),
            used: getQuotaUsed(),
          },
        },
      }),
    });
  }

  async function register(name, email, password) {
    await checkCloudAuth();
    if (localMode) return localRegister(name, email, password);

    const { res, data } = await api('auth-register', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) throw new Error(mapAuthError(data.error));
    clearGuest();
    setToken(data.token);
    applyUser(data.user);
    await pullSync();
    return data.user;
  }

  async function login(email, password) {
    await checkCloudAuth();
    if (localMode) return localLogin(email, password);

    const { res, data } = await api('auth-login', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(mapAuthError(data.error));
    clearGuest();
    setToken(data.token);
    applyUser(data.user);
    await pullSync();
    return data.user;
  }

  async function bootstrap() {
    await checkCloudAuth();

    if (isGuest()) {
      applyUser({
        name: 'Guest',
        email: 'guest@lexiloop.app',
        avatar: 'G',
        plan: 'free',
        pro: false,
        guest: true,
      });
      return true;
    }

    if (localMode) {
      if (S.user) return true;
      return false;
    }

    const token = getToken();
    if (!token) {
      S.user = null;
      localStorage.removeItem('ll_user');
      return false;
    }

    const { res, data } = await api('auth-me', { headers: authHeaders() });
    if (!res.ok) {
      setToken('');
      return false;
    }
    applyUser(data.user);
    await pullSync();
    return true;
  }

  function logout() {
    setToken('');
    clearGuest();
    S.user = null;
    localStorage.removeItem('ll_user');
  }

  function mapAuthError(code) {
    const map = {
      email_taken: 'Email already registered.',
      bad_credentials: 'Invalid email or password.',
      invalid_fields: 'Fill all fields correctly.',
      auth_not_configured: 'Accounts are not configured on the server yet.',
    };
    return map[code] || 'Authentication failed.';
  }

  function localRegister(name, email, password) {
    const u = getUsers();
    const em = email.trim().toLowerCase();
    if (u[em]) throw new Error('Email already registered.');
    u[em] = { nm: name, pw: password, plan: 'free' };
    localStorage.setItem('ll_users', JSON.stringify(u));
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
    bootstrap,
    logout,
    pushSync,
    continueAsGuest,
    clearGuest,
    isGuest,
    isLocalMode: () => localMode,
  };
})();
