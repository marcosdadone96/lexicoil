/** Grammar reference viewer — sticky nav, search, print */
(function () {
  const META_LABELS = { es: 'Español', en: 'English', de: 'Deutsch' };
  const TAUGHT_LABELS = { de: 'Deutsch', en: 'English' };

  let _state = {
    taughtLang: 'de',
    level: 'A1',
    metaLang: null,
    sectionId: null,
    query: '',
    loading: false,
    result: null,
    manifest: null,
  };

  let _scrollSpy = null;

  function grammarEsc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function prepMessage(metaLang) {
    const ml = META_LABELS[metaLang] || metaLang;
    if (typeof S !== 'undefined' && S.fcLang === 'es') {
      return 'Contenido de gramática en ' + ml + ' — en preparación.';
    }
    return 'Grammar content in ' + ml + ' — coming soon.';
  }

  function bookIconSvg() {
    return (
      '<svg class="grammar-book-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' +
      '</svg>'
    );
  }

  function highlightText(text, query) {
    const safe = grammarEsc(text);
    const q = String(query || '').trim();
    if (!q || q.length < 2) return safe;
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return safe.replace(re, '<mark class="grammar-mark">$1</mark>');
  }

  function blockMatches(block, q) {
    if (!q) return true;
    const low = q.toLowerCase();
    if (block.type === 'paragraph' || block.type === 'note') {
      return String(block.text || '').toLowerCase().includes(low);
    }
    if (block.type === 'example') {
      return (
        String(block.label || '').toLowerCase().includes(low) ||
        String(block.text || '').toLowerCase().includes(low)
      );
    }
    if (block.type === 'list') {
      return (block.items || []).some((it) => String(it).toLowerCase().includes(low));
    }
    if (block.type === 'table') {
      const flat = [].concat(block.headers || [], ...(block.rows || []).flat());
      return flat.some((c) => String(c).toLowerCase().includes(low));
    }
    return false;
  }

  function sectionMatches(section, q) {
    if (!q) return true;
    const low = q.toLowerCase();
    if (String(section.title || '').toLowerCase().includes(low)) return true;
    return (section.blocks || []).some((b) => blockMatches(b, q));
  }

  function renderBlock(block, query) {
    const q = query || '';
    if (block.type === 'paragraph') {
      return '<p class="grammar-p">' + highlightText(block.text, q) + '</p>';
    }
    if (block.type === 'note') {
      return (
        '<aside class="grammar-note" role="note">' +
        highlightText(block.text, q) +
        '</aside>'
      );
    }
    if (block.type === 'example') {
      const lbl = block.label
        ? '<span class="grammar-ex-label">' + highlightText(block.label, q) + '</span>'
        : '';
      return (
        '<div class="grammar-example">' +
        lbl +
        '<div class="grammar-ex-text">' +
        grammarEsc(block.text) +
        '</div></div>'
      );
    }
    if (block.type === 'list') {
      const items = (block.items || [])
        .map((it) => '<li>' + highlightText(it, q) + '</li>')
        .join('');
      return '<ul class="grammar-list">' + items + '</ul>';
    }
    if (block.type === 'table') {
      const heads = (block.headers || [])
        .map((h) => '<th scope="col">' + highlightText(h, q) + '</th>')
        .join('');
      const rows = (block.rows || [])
        .map(
          (row) =>
            '<tr>' +
            row.map((c) => '<td>' + grammarEsc(c) + '</td>').join('') +
            '</tr>',
        )
        .join('');
      return (
        '<div class="grammar-table-wrap"><table class="grammar-table">' +
        (heads ? '<thead><tr>' + heads + '</tr></thead>' : '') +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
      );
    }
    return '';
  }

  function renderSection(section, query) {
    const blocks = (section.blocks || []).map((b) => renderBlock(b, query)).join('');
    return (
      '<section class="grammar-section" id="grammar-' +
      grammarEsc(section.id) +
      '" data-section-id="' +
      grammarEsc(section.id) +
      '">' +
      '<h2 class="grammar-section-title">' +
      highlightText(section.title, query) +
      '</h2>' +
      blocks +
      '</section>'
    );
  }

  function renderNav(sections, activeId) {
    return sections
      .map((s) => {
        const on = s.id === activeId ? ' aria-current="location"' : '';
        return (
          '<li><a class="grammar-nav-link" href="#/grammar/' +
          grammarEsc(_state.taughtLang) +
          '/' +
          grammarEsc(_state.level) +
          '#' +
          grammarEsc(s.id) +
          '" data-section="' +
          grammarEsc(s.id) +
          '"' +
          on +
          '>' +
          grammarEsc(s.title) +
          '</a></li>'
        );
      })
      .join('');
  }

  function bindNavClicks(root) {
    root.querySelectorAll('.grammar-nav-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const sid = a.getAttribute('data-section');
        scrollToGrammarSection(sid, true);
      });
    });
  }

  function scrollToGrammarSection(sectionId, updateHash) {
    if (!sectionId) return;
    const el = document.getElementById('grammar-' + sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      _state.sectionId = sectionId;
      if (updateHash && typeof LcRouter !== 'undefined') {
        LcRouter.replaceRoute(
          '#/grammar/' + _state.taughtLang + '/' + _state.level + '#' + sectionId,
          'Grammar',
        );
      }
      updateNavActive(sectionId);
    }
  }

  function updateNavActive(activeId) {
    const nav = document.getElementById('grammarNavList');
    if (!nav) return;
    nav.querySelectorAll('.grammar-nav-link').forEach((a) => {
      const on = a.getAttribute('data-section') === activeId;
      a.setAttribute('aria-current', on ? 'location' : 'false');
    });
  }

  function unbindScrollSpy() {
    if (_scrollSpy) {
      window.removeEventListener('scroll', _scrollSpy);
      _scrollSpy = null;
    }
  }

  function bindScrollSpy(sections) {
    unbindScrollSpy();
    if (!sections.length) return;
    const ids = sections.map((s) => s.id);
    _scrollSpy = () => {
      const docTop = window.scrollY + 120;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById('grammar-' + id);
        if (el && el.offsetTop <= docTop) current = id;
      }
      if (current !== _state.sectionId) {
        _state.sectionId = current;
        updateNavActive(current);
      }
    };
    window.addEventListener('scroll', _scrollSpy, { passive: true });
    _scrollSpy();
  }

  function renderToolbar() {
    const manifest = _state.manifest;
    const metaOpts = GrammarLoader.publishedMetaLanguages(_state.taughtLang, manifest);
    const metaBtns = metaOpts
      .map((m) => {
        const on = m === (_state.result?.metaLanguage || _state.metaLang) ? ' on' : '';
        const lbl = META_LABELS[m] || m;
        return (
          '<button type="button" class="grammar-meta-pill' +
          on +
          '" onclick="setGrammarMetaLang(\'' +
          grammarEsc(m) +
          '\')">' +
          grammarEsc(lbl) +
          '</button>'
        );
      })
      .join('');

    const levelBtns = GrammarLoader.LEVELS.map((l) => {
      const pub = GrammarLoader.publishedLevels(
        _state.taughtLang,
        _state.result?.metaLanguage || _state.metaLang || GrammarLoader.userMetaLanguage(),
        manifest,
      );
      const avail = pub.includes(l);
      const on = l === _state.level ? ' on' : '';
      const dis = avail ? '' : ' disabled';
      return (
        '<button type="button" class="grammar-level-pill' +
        on +
        '"' +
        dis +
        ' onclick="setGrammarLevel(\'' +
        l +
        '\')">' +
        l +
        '</button>'
      );
    }).join('');

    const taughtLbl = TAUGHT_LABELS[_state.taughtLang] || _state.taughtLang;

    return (
      '<div class="grammar-toolbar">' +
      '<div class="grammar-toolbar-row">' +
      '<h1 class="grammar-h1">' +
      bookIconSvg() +
      ' <span>Gramática · ' +
      grammarEsc(taughtLbl) +
      '</span></h1>' +
      '<button type="button" class="btn-sm grammar-print-btn" onclick="printGrammar()">Descargar PDF</button>' +
      '</div>' +
      '<div class="grammar-toolbar-row grammar-toolbar-levels">' +
      levelBtns +
      '</div>' +
      (metaOpts.length > 1
        ? '<div class="grammar-toolbar-row"><span class="grammar-toolbar-lbl">Explicación:</span>' +
          metaBtns +
          '</div>'
        : '') +
      '<div class="grammar-toolbar-row">' +
      '<input type="search" class="grammar-search" id="grammarSearchInput" placeholder="Buscar en este nivel…" value="' +
      grammarEsc(_state.query) +
      '" oninput="onGrammarSearch(this.value)">' +
      '</div></div>'
    );
  }

  function paintGrammarDom() {
    const host = document.getElementById('grammarScreenContent');
    if (!host) return;

    if (_state.loading) {
      host.innerHTML =
        '<div class="grammar-loading"><span class="vt-dot"></span><span class="vt-dot"></span><span class="vt-dot"></span></div>';
      return;
    }

    const res = _state.result;
    if (!res || res.status !== 'ok' || !res.doc) {
      host.innerHTML =
        renderToolbar() +
        '<div class="grammar-prep"><div class="grammar-prep-inner">' +
        grammarEsc(prepMessage(_state.metaLang || GrammarLoader.userMetaLanguage())) +
        '</div></div>';
      return;
    }

    const q = String(_state.query || '').trim();
    let sections = res.doc.sections || [];
    if (q.length >= 2) {
      sections = sections.filter((s) => sectionMatches(s, q));
    }

    const docHtml = sections.length
      ? sections.map((s) => renderSection(s, q)).join('')
      : '<p class="grammar-empty">No hay secciones que coincidan con la búsqueda.</p>';

    host.innerHTML =
      renderToolbar() +
      '<div class="grammar-layout">' +
      '<nav class="grammar-nav" aria-label="Índice">' +
      '<ol class="grammar-nav-list" id="grammarNavList">' +
      renderNav(sections, _state.sectionId) +
      '</ol></nav>' +
      '<article class="grammar-doc" id="grammarDoc">' +
      '<header class="grammar-doc-head">' +
      '<p class="grammar-scope">' +
      grammarEsc(res.doc.scope) +
      '</p></header>' +
      docHtml +
      '</article></div>';

    bindNavClicks(host);
    bindScrollSpy(sections);
    if (_state.sectionId) {
      requestAnimationFrame(() => scrollToGrammarSection(_state.sectionId, false));
    }
  }

  async function loadGrammarContent() {
    _state.loading = true;
    paintGrammarDom();
    try {
      _state.manifest = await GrammarLoader.loadManifest();
      if (!_state.metaLang) _state.metaLang = GrammarLoader.userMetaLanguage();
      _state.result = await GrammarLoader.getGrammar(
        _state.taughtLang,
        _state.level,
        _state.metaLang,
      );
      if (_state.result.metaLanguage) _state.metaLang = _state.result.metaLanguage;
    } catch (_) {
      _state.result = { status: 'preparation', doc: null };
    }
    _state.loading = false;
    paintGrammarDom();
  }

  async function openGrammar(taughtLang, level, metaLang, sectionId, fromRoute) {
    _state.taughtLang = String(taughtLang || 'de').toLowerCase();
    _state.level = String(level || 'A1').toUpperCase();
    _state.metaLang = metaLang || null;
    _state.sectionId = sectionId || null;
    _state.query = '';

    if (!fromRoute && typeof routerNavigate === 'function') {
      const frag = sectionId ? '#' + sectionId : '';
      routerNavigate('#/grammar/' + _state.taughtLang + '/' + _state.level + frag, {
        label: 'Grammar',
      });
      return;
    }

    hideAll();
    show('grammarScreen');
    if (typeof setNavActive === 'function') setNavActive('grammar');
    document.body.classList.add('grammar-active');

    await loadGrammarContent();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setGrammarLevel(level) {
    _state.level = String(level).toUpperCase();
    _state.sectionId = null;
    if (typeof LcRouter !== 'undefined') {
      LcRouter.navigate('#/grammar/' + _state.taughtLang + '/' + _state.level, {
        label: 'Grammar',
        replace: true,
      });
    }
    loadGrammarContent();
  }

  function setGrammarMetaLang(meta) {
    _state.metaLang = meta;
    _state.sectionId = null;
    loadGrammarContent();
  }

  function onGrammarSearch(val) {
    _state.query = val;
    paintGrammarDom();
  }

  function printGrammar() {
    window.print();
  }

  function grammarNavLinkHtml(goal) {
    if (!goal || (goal.subject !== 'de' && goal.subject !== 'en')) return '';
    const lvl = goal.level || 'A1';
    return (
      '<a class="ws-grammar-link" href="#/grammar/' +
      goal.subject +
      '/' +
      lvl +
      '" onclick="event.preventDefault();openGrammar(\'' +
      grammarEsc(goal.subject) +
      "','" +
      grammarEsc(lvl) +
      '\')">' +
      bookIconSvg() +
      ' Gramática</a>'
    );
  }

  /** Node/test helper — render HTML string without DOM */
  function renderGrammarDocument(doc, query) {
    if (!doc || !doc.sections) return '';
    const q = String(query || '').trim();
    let sections = doc.sections;
    if (q.length >= 2) sections = sections.filter((s) => sectionMatches(s, q));
    return sections.map((s) => renderSection(s, q)).join('');
  }

  window.openGrammar = openGrammar;
  window.setGrammarLevel = setGrammarLevel;
  window.setGrammarMetaLang = setGrammarMetaLang;
  window.onGrammarSearch = onGrammarSearch;
  window.printGrammar = printGrammar;
  window.grammarNavLinkHtml = grammarNavLinkHtml;
  window.GrammarView = {
    renderGrammarDocument,
    sectionMatches,
    grammarEsc,
    getState: () => ({ ..._state }),
  };
})();
