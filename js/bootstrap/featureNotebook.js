/* Floating smart notebook — notes per exam tab, draggable FAB on mobile */
(function () {
  if (typeof S === 'undefined') return;

  const HIGHLIGHTS = [
    { id: 'hl-yellow', css: 'rgba(255, 236, 179, 0.85)' },
    { id: 'hl-mint', css: 'rgba(186, 230, 211, 0.85)' },
    { id: 'hl-lavender', css: 'rgba(210, 198, 255, 0.85)' },
    { id: 'hl-peach', css: 'rgba(255, 210, 190, 0.85)' },
    { id: 'hl-sky', css: 'rgba(186, 220, 255, 0.85)' },
  ];

  let panelOpen = localStorage.getItem('lc_notes_open') === '1';
  let activeTabId = localStorage.getItem('lc_notes_active') || null;

  function langLabel(code) {
    const map = { de: 'Deutsch', en: 'English', es: 'Español' };
    return map[code] || String(code || '').toUpperCase();
  }

  function currentExamTabId() {
    if (S.examData?.poolId) return `pool_${S.examData.poolId}`;
    if (S.examData?.id) return `exam_${S.examData.id}`;
    if (S.activeSession?.startedAt) return `sess_${S.activeSession.startedAt}`;
    return `${S.subject || 'general'}_${S.level || 'B1'}_${Date.now()}`;
  }

  function ensureNotebook() {
    if (!S.notebook || !Array.isArray(S.notebook.tabs)) {
      S.notebook = { tabs: [] };
    }
    return S.notebook;
  }

  function getOrCreateActiveTab() {
    const nb = ensureNotebook();
    const id = activeTabId || currentExamTabId();
    let tab = nb.tabs.find((t) => t.id === id);
    if (!tab) {
      tab = {
        id,
        title: S.examData?.topic ? String(S.examData.topic).slice(0, 40) : 'General',
        lang: S.subject || 'de',
        level: S.level || 'B1',
        examId: S.examData?.poolId || S.examData?.id || null,
        html: '',
        updatedAt: Date.now(),
      };
      nb.tabs.push(tab);
    }
    activeTabId = tab.id;
    localStorage.setItem('lc_notes_active', tab.id);
    return tab;
  }

  function sanitizeNoteHtml(raw) {
    const doc = new DOMParser().parseFromString(`<div>${raw || ''}</div>`, 'text/html');
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'iframe') return '';
      if (tag === 'br') return '\n';
      if (tag === 'b' || tag === 'strong') {
        return `<b>${[...node.childNodes].map(walk).join('')}</b>`;
      }
      if (tag === 'u') {
        return `<u>${[...node.childNodes].map(walk).join('')}</u>`;
      }
      if (tag === 'span') {
        const bg = node.style?.backgroundColor;
        const inner = [...node.childNodes].map(walk).join('');
        if (bg) return `<span style="background:${bg}">${inner}</span>`;
        return inner;
      }
      if (tag === 'div' || tag === 'p') {
        return `${[...node.childNodes].map(walk).join('')}<br>`;
      }
      return [...node.childNodes].map(walk).join('');
    };
    return walk(doc.body.firstChild || doc.body).replace(/(<br>)+$/g, '');
  }

  window.saveNotebookData = function saveNotebookData() {
    try {
      localStorage.setItem('lc_notes', JSON.stringify(S.notebook || { tabs: [] }));
      if (typeof Auth !== 'undefined' && Auth.pushSync) Auth.pushSync();
    } catch (_) {}
  };

  window.loadNotebookData = function loadNotebookData() {
    try {
      const raw = localStorage.getItem('lc_notes');
      if (raw) S.notebook = JSON.parse(raw);
    } catch (_) {
      S.notebook = { tabs: [] };
    }
    if (!S.notebook?.tabs) S.notebook = { tabs: [] };
  };

  function saveFabPos(x, y) {
    localStorage.setItem('lc_notes_fab_pos', JSON.stringify({ x, y }));
  }

  function loadFabPos(fab) {
    try {
      const raw = localStorage.getItem('lc_notes_fab_pos');
      if (!raw) return;
      const p = JSON.parse(raw);
      if (typeof p.x === 'number' && typeof p.y === 'number') {
        fab.style.left = `${p.x}px`;
        fab.style.top = `${p.y}px`;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
      }
    } catch (_) {}
  }

  function clampFab(fab, x, y) {
    const pad = 8;
    const w = fab.offsetWidth || 52;
    const h = fab.offsetHeight || 52;
    const nx = Math.max(pad, Math.min(window.innerWidth - w - pad, x));
    const ny = Math.max(pad, Math.min(window.innerHeight - h - pad, y));
    fab.style.left = `${nx}px`;
    fab.style.top = `${ny}px`;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
    saveFabPos(nx, ny);
  }

  function bindFabDrag(fab) {
    let dragging = false;
    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;
    const start = (e) => {
      if (e.target.closest('.nb-fab-main')) {
        /* click handled separately */
      }
      dragging = true;
      const pt = e.touches ? e.touches[0] : e;
      sx = pt.clientX;
      sy = pt.clientY;
      const rect = fab.getBoundingClientRect();
      ox = rect.left;
      oy = rect.top;
      e.preventDefault();
    };
    const move = (e) => {
      if (!dragging) return;
      const pt = e.touches ? e.touches[0] : e;
      clampFab(fab, ox + (pt.clientX - sx), oy + (pt.clientY - sy));
    };
    const end = () => {
      dragging = false;
    };
    fab.addEventListener('mousedown', start);
    fab.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('mouseup', end);
    window.addEventListener('touchend', end);
  }

  function exec(cmd, val) {
    document.execCommand(cmd, false, val || null);
    persistEditor();
  }

  function persistEditor() {
    const ed = document.getElementById('nbEditor');
    if (!ed) return;
    const tab = getOrCreateActiveTab();
    tab.html = sanitizeNoteHtml(ed.innerHTML);
    tab.updatedAt = Date.now();
    saveNotebookData();
  }

  function renderTabs() {
    const bar = document.getElementById('nbTabBar');
    if (!bar) return;
    const nb = ensureNotebook();
    bar.innerHTML = nb.tabs
      .map(
        (t) =>
          `<button type="button" class="nb-tab${t.id === activeTabId ? ' active' : ''}" onclick="NotebookUI.switchTab('${t.id}')">${esc(t.title || 'Tab')}</button>`,
      )
      .join('');
  }

  function renderPanel() {
    const panel = document.getElementById('nbPanel');
    if (!panel) return;
    const tab = getOrCreateActiveTab();
    panel.innerHTML = `
      <div class="nb-head">
        <div class="nb-head-title">Libreta · ${esc(langLabel(tab.lang))} ${esc(tab.level)}</div>
        <div class="nb-head-actions">
          <button type="button" class="btn-sm" onclick="NotebookUI.newTab()" title="Nueva pestaña">+</button>
          <button type="button" class="btn-sm" onclick="NotebookUI.closeTab()" title="Cerrar pestaña">×</button>
          <button type="button" class="btn-sm" onclick="NotebookUI.toggle()">—</button>
        </div>
      </div>
      <div class="nb-toolbar">
        ${HIGHLIGHTS.map((h) => `<button type="button" class="nb-hl" style="background:${h.css}" onclick="NotebookUI.highlight('${h.css}')" aria-label="Resaltar"></button>`).join('')}
        <button type="button" class="btn-sm" onclick="NotebookUI.format('bold')"><b>B</b></button>
        <button type="button" class="btn-sm" onclick="NotebookUI.format('underline')"><u>U</u></button>
        <button type="button" class="btn-sm" onclick="NotebookUI.format('removeFormat')">⌫ fmt</button>
      </div>
      <div id="nbTabBar" class="nb-tabs"></div>
      <div id="nbEditor" class="nb-editor" contenteditable="true" spellcheck="true"></div>`;
    const ed = document.getElementById('nbEditor');
    if (ed) {
      ed.innerHTML = tab.html || '';
      ed.addEventListener('input', persistEditor);
      ed.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
        persistEditor();
      });
    }
    renderTabs();
  }

  function shouldShowFab() {
    if (typeof isOfficialMode === 'function' && isOfficialMode()) return false;
    const screen = document.querySelector('#examScreen:not([style*="display: none"])');
    const results = document.querySelector('#resultsScreen:not([style*="display: none"])');
    const loading = document.querySelector('#loadingScreen:not([style*="display: none"])');
    return !!(S.examData && (screen || results) && !loading);
  }

  window.refreshNotebookFab = function refreshNotebookFab() {
    const fab = document.getElementById('nbFab');
    const panel = document.getElementById('nbPanel');
    if (!fab) return;
    const show = shouldShowFab();
    fab.style.display = show ? '' : 'none';
    if (!show && panel) panel.classList.remove('open');
    if (show && panelOpen && panel) {
      panel.classList.add('open');
      renderPanel();
    }
  };

  window.NotebookUI = {
    toggle() {
      panelOpen = !panelOpen;
      localStorage.setItem('lc_notes_open', panelOpen ? '1' : '0');
      const panel = document.getElementById('nbPanel');
      if (!panel) return;
      if (panelOpen) {
        panel.classList.add('open');
        renderPanel();
      } else panel.classList.remove('open');
    },
    switchTab(id) {
      activeTabId = id;
      localStorage.setItem('lc_notes_active', id);
      renderPanel();
    },
    newTab() {
      const nb = ensureNotebook();
      const id = `tab_${Date.now()}`;
      nb.tabs.push({
        id,
        title: S.examData?.topic ? String(S.examData.topic).slice(0, 28) : 'Notas',
        lang: S.subject || 'de',
        level: S.level || 'B1',
        examId: currentExamTabId(),
        html: '',
        updatedAt: Date.now(),
      });
      activeTabId = id;
      saveNotebookData();
      renderPanel();
    },
    closeTab() {
      const nb = ensureNotebook();
      if (nb.tabs.length <= 1) {
        nb.tabs[0].html = '';
        saveNotebookData();
        renderPanel();
        return;
      }
      nb.tabs = nb.tabs.filter((t) => t.id !== activeTabId);
      activeTabId = nb.tabs[0]?.id || null;
      saveNotebookData();
      renderPanel();
    },
    highlight(color) {
      exec('hiliteColor', color);
    },
    format(kind) {
      if (kind === 'bold') exec('bold');
      else if (kind === 'underline') exec('underline');
      else exec('removeFormat');
    },
  };

  function initNotebook() {
    loadNotebookData();
    const fab = document.getElementById('nbFab');
    if (!fab) return;
    loadFabPos(fab);
    bindFabDrag(fab);
    fab.querySelector('.nb-fab-main')?.addEventListener('click', (e) => {
      if (typeof isOfficialMode === 'function' && isOfficialMode()) {
        if (typeof lcToast === 'function') lcToast('Not available in official exam mode', 'warn', 3000);
        return;
      }
      NotebookUI.toggle();
    });
    document.addEventListener('keydown', (e) => {
      if (!panelOpen) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        NotebookUI.format('bold');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        NotebookUI.format('underline');
      }
    });
    refreshNotebookFab();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotebook);
  } else initNotebook();
})();
