/**
 * "Notify me when ready" for coming-soon level combos.
 */
(function (global) {
  const LS_KEY = 'lc_level_waitlist';

  function waitlistLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function saveWaitlistLocal(map) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(map));
    } catch (_) {
      /* ignore quota */
    }
  }

  function comboKey(lang, level) {
    return `${lang}_${level}`;
  }

  function isSubscribed(email, lang, level) {
    const key = comboKey(lang, level);
    const map = waitlistLocal();
    const list = map[key] || [];
    return list.some((e) => String(e).toLowerCase() === String(email).toLowerCase());
  }

  function markSubscribed(email, lang, level) {
    const key = comboKey(lang, level);
    const map = waitlistLocal();
    const list = map[key] || [];
    const norm = String(email).trim().toLowerCase();
    if (!list.some((e) => String(e).toLowerCase() === norm)) list.push(norm);
    map[key] = list;
    saveWaitlistLocal(map);
  }

  function defaultEmail() {
    if (typeof S !== 'undefined' && S.user && S.user.email) return S.user.email;
    try {
      const u = localStorage.getItem('lc_user');
      if (u) {
        const parsed = JSON.parse(u);
        if (parsed && parsed.email) return parsed.email;
      }
    } catch (_) {
      /* ignore */
    }
    return '';
  }

  async function submitLevelNotify(email, lang, level) {
    const trimmed = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new Error('Enter a valid email address.');
    }
    markSubscribed(trimmed, lang, level);
    try {
      const res = await fetch('/.netlify/functions/level-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, lang, level }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not save your request.');
      }
    } catch (err) {
      if (err.message && err.message.includes('valid email')) throw err;
      /* localStorage already saved — offline OK */
    }
    return true;
  }

  function closeLevelSoonPanel() {
    const panel = document.getElementById('levelSoonPanel');
    if (panel) panel.remove();
  }

  function renderLevelSoonPanel(lang, level) {
    closeLevelSoonPanel();
    const host = document.createElement('div');
    host.id = 'levelSoonPanel';
    host.className = 'level-soon-panel';
    const prefill = esc(defaultEmail());
    const langLbl =
      typeof SubjectMeta !== 'undefined'
        ? SubjectMeta.langName(lang)
        : lang === 'de'
          ? 'German'
          : lang === 'es'
            ? 'Spanish'
            : 'English';
    host.innerHTML = `
      <div class="level-soon-panel__card" role="dialog" aria-labelledby="levelSoonTitle">
        <button type="button" class="level-soon-panel__close" onclick="closeLevelSoonPanel()" aria-label="Close">×</button>
        <h3 id="levelSoonTitle">${esc(langLbl)} ${esc(level)} — Próximamente</h3>
        <p class="level-soon-panel__lede">We're preparing official mock exams for this level. Leave your email and we'll notify you when it's ready.</p>
        <form class="level-soon-form" onsubmit="return submitLevelSoonForm(event,'${esc(lang)}','${esc(level)}')">
          <input type="email" name="email" class="level-soon-input" placeholder="you@example.com" value="${prefill}" required autocomplete="email">
          <button type="submit" class="btn-sm blue">Avísame cuando esté listo</button>
        </form>
        <p id="levelSoonDone" class="level-soon-done" style="display:none">✓ We'll email you when ${esc(langLbl)} ${esc(level)} is available.</p>
      </div>`;
    document.body.appendChild(host);
    host.addEventListener('click', (e) => {
      if (e.target === host) closeLevelSoonPanel();
    });
    const input = host.querySelector('input[type=email]');
    if (input && !input.value) input.focus();
  }

  async function submitLevelSoonForm(ev, lang, level) {
    ev.preventDefault();
    const form = ev.target;
    const email = form.querySelector('input[type=email]')?.value || '';
    try {
      await submitLevelNotify(email, lang, level);
      form.style.display = 'none';
      const done = document.getElementById('levelSoonDone');
      if (done) done.style.display = 'block';
      if (typeof lcToast === 'function') lcToast("You're on the list — we'll notify you.", 'success');
      else if (typeof notify === 'function') notify("You're on the list — we'll notify you.", 'success');
    } catch (err) {
      if (typeof lcToast === 'function') lcToast(err.message || 'Could not save.', 'error');
      else if (typeof notify === 'function') notify(err.message || 'Could not save.', 'error');
    }
    return false;
  }

  function openLevelSoonNotify(lang, level) {
    renderLevelSoonPanel(lang, level);
  }

  global.closeLevelSoonPanel = closeLevelSoonPanel;
  global.openLevelSoonNotify = openLevelSoonNotify;
  global.submitLevelSoonForm = submitLevelSoonForm;
  global.submitLevelNotify = submitLevelNotify;
  global.isLevelNotifySubscribed = isSubscribed;

  if (typeof module !== 'undefined') {
    module.exports = {
      comboKey,
      isSubscribed,
      markSubscribed,
      submitLevelNotify,
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
