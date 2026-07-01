/** Grammar / Vocabulary / Phrases reference viewer — sticky nav, search, print */
(function () {
  const META_LABELS = { es: 'Español', en: 'English', de: 'Deutsch' };
  const TAUGHT_LABELS = { de: 'Deutsch', en: 'English' };

  const CONTENT_TYPES = {
    grammar: {
      id: 'grammar',
      label: 'Grammar',
      route: 'grammar',
      loader: () => GrammarLoader,
      getDoc: (l, t, lv, m) => l.getGrammar(t, lv, m),
      prepSuffix: 'Grammar content',
    },
    vocabulary: {
      id: 'vocabulary',
      label: 'Vocabulary',
      route: 'vocabulary',
      loader: () => VocabularyLoader,
      getDoc: (l, t, lv, m) => l.getContent(t, lv, m),
      prepSuffix: 'Vocabulary lists',
    },
    phrases: {
      id: 'phrases',
      label: 'Phrases',
      route: 'phrases',
      loader: () => PhrasesLoader,
      getDoc: (l, t, lv, m) => l.getContent(t, lv, m),
      prepSuffix: 'Phrase lists',
    },
  };

  let _state = {
    contentType: 'grammar',
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

  function contentTypeConfig(type) {
    return CONTENT_TYPES[type] || CONTENT_TYPES.grammar;
  }

  function getLoader() {
    return contentTypeConfig(_state.contentType).loader();
  }

  function routeBase() {
    const cfg = contentTypeConfig(_state.contentType);
    return '#/' + cfg.route + '/' + _state.taughtLang + '/' + _state.level;
  }

  function prepMessage(metaLang) {
    const ml = META_LABELS[metaLang] || metaLang;
    const suffix = contentTypeConfig(_state.contentType).prepSuffix;
    return suffix + ' in ' + ml + ' — coming soon.';
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

  function itemMatches(item, q, contentType) {
    if (!q) return true;
    const low = q.toLowerCase();
    if (contentType === 'vocabulary') {
      return (
        String(item.word || '').toLowerCase().includes(low) ||
        String(item.translation || '').toLowerCase().includes(low) ||
        String(item.example || '').toLowerCase().includes(low) ||
        String(item.category || '').toLowerCase().includes(low)
      );
    }
    if (contentType === 'phrases') {
      return (
        String(item.phrase || '').toLowerCase().includes(low) ||
        String(item.translation || '').toLowerCase().includes(low) ||
        String(item.usage || '').toLowerCase().includes(low) ||
        String(item.register || '').toLowerCase().includes(low)
      );
    }
    return false;
  }

  function sectionMatches(section, q) {
    if (!q) return true;
    const low = q.toLowerCase();
    if (String(section.title || '').toLowerCase().includes(low)) return true;
    if (Array.isArray(section.items) && section.items.length) {
      return section.items.some((it) => itemMatches(it, q, _state.contentType));
    }
    return (section.blocks || []).some((b) => blockMatches(b, q));
  }

  function renderVocabItem(item, query) {
    const cat = item.category
      ? '<span class="ref-item-tag">' + highlightText(item.category, query) + '</span>'
      : '';
    return (
      '<div class="ref-item-card ref-item-card--vocab">' +
      '<div class="ref-item-head">' +
      '<strong class="ref-item-primary">' +
      highlightText(item.word, query) +
      '</strong>' +
      '<span class="ref-item-secondary">' +
      highlightText(item.translation, query) +
      '</span></div>' +
      cat +
      (item.example
        ? '<div class="ref-item-example">' + highlightText(item.example, query) + '</div>'
        : '') +
      '</div>'
    );
  }

  function renderPhraseItem(item, query) {
    const reg = item.register
      ? '<span class="ref-item-tag ref-item-tag--' +
        (String(item.register).toLowerCase().includes('formal') ? 'formal' : 'informal') +
        '">' +
        highlightText(item.register, query) +
        '</span>'
      : '';
    return (
      '<div class="ref-item-card ref-item-card--phrase">' +
      '<div class="ref-item-head">' +
      '<strong class="ref-item-primary">' +
      highlightText(item.phrase, query) +
      '</strong></div>' +
      '<div class="ref-item-secondary ref-item-secondary--block">' +
      highlightText(item.translation, query) +
      '</div>' +
      reg +
      (item.usage
        ? '<div class="ref-item-usage">' + highlightText(item.usage, query) + '</div>'
        : '') +
      '</div>'
    );
  }

  function renderItemsSection(section, query) {
    const items = (section.items || [])
      .map((it) =>
        _state.contentType === 'phrases' ? renderPhraseItem(it, query) : renderVocabItem(it, query),
      )
      .join('');
    return (
      '<section class="grammar-section ref-items-section" id="grammar-' +
      grammarEsc(section.id) +
      '" data-section-id="' +
      grammarEsc(section.id) +
      '">' +
      '<h2 class="grammar-section-title">' +
      highlightText(section.title, query) +
      '</h2>' +
      '<div class="ref-items-grid">' +
      items +
      '</div></section>'
    );
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
    if (Array.isArray(section.items) && section.items.length) {
      let items = section.items;
      const q = String(query || '').trim();
      if (q.length >= 2) items = items.filter((it) => itemMatches(it, q, _state.contentType));
      if (!items.length) return '';
      return renderItemsSection({ ...section, items }, query);
    }
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
          '<li><a class="grammar-nav-link" href="' +
          routeBase() +
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
        LcRouter.replaceRoute(routeBase() + '#' + sectionId, contentTypeConfig(_state.contentType).label);
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

  function renderTypeTabs() {
    return (
      '<div class="grammar-toolbar-row grammar-type-tabs" role="tablist" aria-label="Reference type">' +
      Object.values(CONTENT_TYPES)
        .map((cfg) => {
          const on = cfg.id === _state.contentType ? ' on' : '';
          return (
            '<button type="button" class="grammar-type-tab' +
            on +
            '" role="tab" aria-selected="' +
            (cfg.id === _state.contentType) +
            '" onclick="setReferenceContentType(\'' +
            grammarEsc(cfg.id) +
            "')\">" +
            grammarEsc(cfg.label) +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderToolbar() {
    const manifest = _state.manifest;
    const loader = getLoader();
    const metaOpts = loader.publishedMetaLanguages(_state.taughtLang, manifest);
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

    const levelBtns = loader.LEVELS.map((l) => {
      const pub = loader.publishedLevels(
        _state.taughtLang,
        _state.result?.metaLanguage || _state.metaLang || loader.userMetaLanguage(),
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
    const typeLbl = contentTypeConfig(_state.contentType).label;

    return (
      '<div class="grammar-toolbar">' +
      renderTypeTabs() +
      '<div class="grammar-toolbar-row">' +
      '<h1 class="grammar-h1">' +
      bookIconSvg() +
      ' <span>' +
      grammarEsc(typeLbl) +
      ' · ' +
      grammarEsc(taughtLbl) +
      '</span></h1>' +
      '<button type="button" class="btn-sm grammar-print-btn" onclick="printGrammar()">Download PDF</button>' +
      '</div>' +
      '<div class="grammar-toolbar-row grammar-toolbar-levels">' +
      levelBtns +
      '</div>' +
      (metaOpts.length > 1
        ? '<div class="grammar-toolbar-row"><span class="grammar-toolbar-lbl">Explanation:</span>' +
          metaBtns +
          '</div>'
        : '') +
      '<div class="grammar-toolbar-row">' +
      '<input type="search" class="grammar-search" id="grammarSearchInput" placeholder="Search this level…" value="' +
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
        grammarEsc(prepMessage(_state.metaLang || getLoader().userMetaLanguage())) +
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
      : '<p class="grammar-empty">No sections match your search.</p>';

    host.innerHTML =
      renderToolbar() +
      '<div class="grammar-layout">' +
      '<nav class="grammar-nav" aria-label="Index">' +
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

  async function loadReferenceContent() {
    _state.loading = true;
    paintGrammarDom();
    try {
      const loader = getLoader();
      const cfg = contentTypeConfig(_state.contentType);
      _state.manifest = await loader.loadManifest();
      if (!_state.metaLang) _state.metaLang = loader.userMetaLanguage();
      _state.result = await cfg.getDoc(loader, _state.taughtLang, _state.level, _state.metaLang);
      if (_state.result.metaLanguage) _state.metaLang = _state.result.metaLanguage;
    } catch (_) {
      _state.result = { status: 'preparation', doc: null };
    }
    _state.loading = false;
    paintGrammarDom();
  }

  async function openStudyReference(contentType, taughtLang, level, metaLang, sectionId, fromRoute) {
    _state.contentType = CONTENT_TYPES[contentType] ? contentType : 'grammar';
    _state.taughtLang = String(taughtLang || 'de').toLowerCase();
    _state.level = String(level || 'A1').toUpperCase();
    _state.metaLang = metaLang || null;
    _state.sectionId = sectionId || null;
    _state.query = '';

    const cfg = contentTypeConfig(_state.contentType);
    if (!fromRoute && typeof routerNavigate === 'function') {
      const frag = sectionId ? '#' + sectionId : '';
      routerNavigate('#/' + cfg.route + '/' + _state.taughtLang + '/' + _state.level + frag, {
        label: cfg.label,
      });
      return;
    }

    hideAll();
    show('grammarScreen');
    if (typeof setNavActive === 'function') setNavActive('grammar');
    document.body.classList.add('grammar-active');

    await loadReferenceContent();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function openGrammar(taughtLang, level, metaLang, sectionId, fromRoute) {
    return openStudyReference('grammar', taughtLang, level, metaLang, sectionId, fromRoute);
  }

  function setGrammarLevel(level) {
    _state.level = String(level).toUpperCase();
    _state.sectionId = null;
    if (typeof LcRouter !== 'undefined') {
      LcRouter.navigate(routeBase(), {
        label: contentTypeConfig(_state.contentType).label,
        replace: true,
      });
    }
    loadReferenceContent();
  }

  function setReferenceContentType(type) {
    if (!CONTENT_TYPES[type] || type === _state.contentType) return;
    _state.contentType = type;
    _state.sectionId = null;
    _state.result = null;
    _state.manifest = null;
    getLoader().resetCache?.();
    if (typeof LcRouter !== 'undefined') {
      LcRouter.navigate(routeBase(), {
        label: contentTypeConfig(type).label,
        replace: true,
      });
    }
    loadReferenceContent();
  }

  function setGrammarMetaLang(meta) {
    _state.metaLang = meta;
    _state.sectionId = null;
    loadReferenceContent();
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
      '" onclick="event.preventDefault();openStudyReference(\'grammar\',\'' +
      grammarEsc(goal.subject) +
      "','" +
      grammarEsc(lvl) +
      '\')">' +
      bookIconSvg() +
      ' Reference</a>'
    );
  }

  /** Node/test helper — render HTML string without DOM */
  function renderReferenceDocument(doc, query, contentType) {
    if (contentType) _state.contentType = contentType;
    return renderGrammarDocument(doc, query);
  }

  function renderGrammarDocument(doc, query) {
    if (!doc || !doc.sections) return '';
    const q = String(query || '').trim();
    let sections = doc.sections;
    if (q.length >= 2) sections = sections.filter((s) => sectionMatches(s, q));
    return sections.map((s) => renderSection(s, q)).join('');
  }

  window.openGrammar = openGrammar;
  window.openStudyReference = openStudyReference;
  window.setReferenceContentType = setReferenceContentType;
  window.setGrammarLevel = setGrammarLevel;
  window.setGrammarMetaLang = setGrammarMetaLang;
  window.onGrammarSearch = onGrammarSearch;
  window.printGrammar = printGrammar;
  window.grammarNavLinkHtml = grammarNavLinkHtml;
  window.GrammarView = {
    renderGrammarDocument,
    renderReferenceDocument,
    sectionMatches,
    itemMatches,
    grammarEsc,
    getState: () => ({ ..._state }),
    CONTENT_TYPES,
  };
})();
