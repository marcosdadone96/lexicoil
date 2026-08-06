/**
 * Content Corrections admin panel (PASO 4+5).
 * Review / filter / approve / reject / edit / dry-run / apply.
 *
 * Bind from admin.html:
 *   ContentCorrectionsPanel.bind({ api, esc, toast, fmtDate });
 *   ContentCorrectionsPanel.load();
 */
(function (global) {
  var deps = { api: null, esc: null, toast: null, fmtDate: null };
  var _all = [];
  var _counts = { pending: 0, approved: 0, rejected: 0, applied: 0, conflict: 0, failed: 0, all: 0 };
  var _expanded = Object.create(null);
  var _editId = null;
  var _lastDryRun = null;

  function esc(s) {
    return deps.esc ? deps.esc(s) : String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function toast(msg) {
    if (deps.toast) deps.toast(msg);
  }

  function fmtDate(d) {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString();
    } catch (_) {
      return String(d);
    }
  }

  function fmtVal(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v, null, 2);
    } catch (_) {
      return String(v);
    }
  }

  function tokenize(s) {
    return String(s || '').split(/(\s+)/).filter(function (t) {
      return t.length;
    });
  }

  /** LCS-based word/token diff → { oldHtml, newHtml } with <del>/<ins>. */
  function diffSides(oldStr, newStr) {
    var a = tokenize(oldStr);
    var b = tokenize(newStr);
    var n = a.length;
    var m = b.length;
    var dp = [];
    for (var i = 0; i <= n; i++) {
      dp[i] = new Array(m + 1).fill(0);
    }
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var oldParts = [];
    var newParts = [];
    i = 0;
    j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        oldParts.push(esc(a[i]));
        newParts.push(esc(b[j]));
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        oldParts.push('<del>' + esc(a[i]) + '</del>');
        i++;
      } else {
        newParts.push('<ins>' + esc(b[j]) + '</ins>');
        j++;
      }
    }
    while (i < n) {
      oldParts.push('<del>' + esc(a[i++]) + '</del>');
    }
    while (j < m) {
      newParts.push('<ins>' + esc(b[j++]) + '</ins>');
    }
    return { oldHtml: oldParts.join(''), newHtml: newParts.join('') };
  }

  function renderDiff(oldV, newV) {
    var o = fmtVal(oldV);
    var n = fmtVal(newV);
    var sides = diffSides(o, n);
    return (
      '<div class="cc-diff">' +
      '<div class="cc-diff-col before"><div class="cc-diff-lbl">ANTES</div><pre class="cc-diff-body">' +
      sides.oldHtml +
      '</pre></div>' +
      '<div class="cc-diff-col after"><div class="cc-diff-lbl">DESPUÉS</div><pre class="cc-diff-body">' +
      sides.newHtml +
      '</pre></div>' +
      '</div>'
    );
  }

  function statusBadge(st) {
    var s = String(st || 'pending');
    return '<span class="badge badge-cc-' + esc(s) + '">' + esc(s) + '</span>';
  }

  function bind(options) {
    deps = Object.assign(deps, options || {});
  }

  function filterInputs() {
    return {
      status: (document.getElementById('ccFilterStatus') || {}).value || 'pending',
      module: (document.getElementById('ccFilterModule') || {}).value || '',
      teil: (document.getElementById('ccFilterTeil') || {}).value || '',
      sourceFile: (document.getElementById('ccFilterSource') || {}).value || '',
      reason: (document.getElementById('ccFilterReason') || {}).value || '',
      createdBy: (document.getElementById('ccFilterBy') || {}).value || '',
      dateFrom: (document.getElementById('ccFilterFrom') || {}).value || '',
      dateTo: (document.getElementById('ccFilterTo') || {}).value || '',
      q: (document.getElementById('ccFilterQ') || {}).value || '',
      targetId: (document.getElementById('ccFilterTarget') || {}).value || '',
      sort: (document.getElementById('ccSort') || {}).value || 'newest',
    };
  }

  function matchesFilters(c, f) {
    if (f.status && f.status !== 'all' && c.status !== f.status) return false;
    if (f.module && String(c.module || '').toLowerCase() !== f.module.toLowerCase()) return false;
    if (f.teil && String(c.teil) !== String(f.teil)) return false;
    if (f.sourceFile && !String(c.sourceFile || '').toLowerCase().includes(f.sourceFile.toLowerCase())) return false;
    if (f.reason && !String(c.reason || '').toLowerCase().includes(f.reason.toLowerCase())) return false;
    if (f.createdBy && !String(c.createdBy || '').toLowerCase().includes(f.createdBy.toLowerCase())) return false;
    if (f.targetId && !String(c.targetId || '').toLowerCase().includes(f.targetId.toLowerCase())) return false;
    if (f.dateFrom) {
      var from = new Date(f.dateFrom).getTime();
      if (c.createdAt && new Date(c.createdAt).getTime() < from) return false;
    }
    if (f.dateTo) {
      var to = new Date(f.dateTo);
      to.setHours(23, 59, 59, 999);
      if (c.createdAt && new Date(c.createdAt).getTime() > to.getTime()) return false;
    }
    if (f.q) {
      var hay = [
        c.sourceFile,
        c.module,
        c.teil,
        c.targetId,
        c.fieldPath,
        c.reason,
        c.comment,
        c.createdBy,
        fmtVal(c.oldValue),
        fmtVal(c.newValue),
        c.id,
      ]
        .join('\n')
        .toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    return true;
  }

  function sortList(list, sort) {
    var arr = list.slice();
    var cmpStr = function (a, b) {
      return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
    };
    arr.sort(function (a, b) {
      switch (sort) {
        case 'oldest':
          return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
        case 'sourceFile':
          return cmpStr(a.sourceFile, b.sourceFile) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        case 'module':
          return cmpStr(a.module, b.module) || Number(a.teil) - Number(b.teil);
        case 'teil':
          return Number(a.teil) - Number(b.teil) || cmpStr(a.module, b.module);
        case 'createdBy':
          return cmpStr(a.createdBy, b.createdBy);
        case 'status':
          return cmpStr(a.status, b.status);
        case 'newest':
        default:
          return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      }
    });
    return arr;
  }

  function computeGroupStats(list) {
    var byModule = {};
    var byTeil = {};
    var byReason = {};
    list.forEach(function (c) {
      var m = c.module || '?';
      byModule[m] = (byModule[m] || 0) + 1;
      var t = String(c.module || '?') + ' T' + (c.teil != null ? c.teil : '?');
      byTeil[t] = (byTeil[t] || 0) + 1;
      var r = (c.reason || '(sin motivo)').trim() || '(sin motivo)';
      byReason[r] = (byReason[r] || 0) + 1;
    });
    return { byModule: byModule, byTeil: byTeil, byReason: byReason };
  }

  function renderStatsBar(filtered) {
    var el = document.getElementById('ccStats');
    if (!el) return;
    var c = _counts || {};
    var g = computeGroupStats(filtered);
    var chips = function (obj, limit) {
      return Object.keys(obj)
        .sort(function (a, b) {
          return obj[b] - obj[a];
        })
        .slice(0, limit || 8)
        .map(function (k) {
          return '<span class="cc-chip"><b>' + esc(k) + '</b> ' + obj[k] + '</span>';
        })
        .join('');
    };
    el.innerHTML =
      '<div class="stats-grid cc-stats-main">' +
      '<div class="stat-card cc-st-pending"><div class="n">' +
      (c.pending || 0) +
      '</div><div class="l">Pending</div></div>' +
      '<div class="stat-card cc-st-approved"><div class="n">' +
      (c.approved || 0) +
      '</div><div class="l">Approved</div></div>' +
      '<div class="stat-card cc-st-rejected"><div class="n">' +
      (c.rejected || 0) +
      '</div><div class="l">Rejected</div></div>' +
      '<div class="stat-card"><div class="n">' +
      (c.applied || 0) +
      '</div><div class="l">Applied</div></div>' +
      '<div class="stat-card cc-st-conflict"><div class="n">' +
      (c.conflict || 0) +
      '</div><div class="l">Conflict</div></div>' +
      '<div class="stat-card cc-st-failed"><div class="n">' +
      (c.failed || 0) +
      '</div><div class="l">Failed</div></div>' +
      '</div>' +
      '<div class="cc-group-stats">' +
      '<div><span class="cc-group-lbl">Por módulo (filtro actual)</span> ' +
      chips(g.byModule) +
      '</div>' +
      '<div><span class="cc-group-lbl">Por Teil</span> ' +
      chips(g.byTeil) +
      '</div>' +
      '<div><span class="cc-group-lbl">Por reason</span> ' +
      chips(g.byReason, 6) +
      '</div>' +
      '</div>';
  }

  function historyHtml(hist, full) {
    var list = Array.isArray(hist) ? hist : [];
    if (!full && list.length > 3) list = list.slice(-3);
    if (!list.length) return '<span class="cc-muted">Sin historial</span>';
    return (
      '<ul class="cc-history">' +
      list
        .map(function (h) {
          return (
            '<li><b>' +
            esc(h.action || 'event') +
            '</b> · ' +
            esc(h.user || '?') +
            ' · ' +
            esc(fmtDate(h.timestamp || h.date)) +
            (h.comment ? ' — <i>' + esc(h.comment) + '</i>' : '') +
            (h.from && h.to ? ' <span class="cc-muted">(' + esc(h.from) + ' → ' + esc(h.to) + ')</span>' : '') +
            (h.field ? ' <span class="cc-muted">[' + esc(h.field) + ']</span>' : '') +
            (h.sourceFile ? ' <span class="cc-muted">' + esc(h.sourceFile) + '</span>' : '') +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function editFormHtml(c) {
    return (
      '<div class="cc-edit-form" data-edit-id="' +
      esc(c.id) +
      '">' +
      '<label>Reason</label><input type="text" class="cc-edit-reason" value="' +
      esc(c.reason || '') +
      '">' +
      '<label>Comment</label><textarea class="cc-edit-comment" rows="2">' +
      esc(c.comment || '') +
      '</textarea>' +
      '<label>New Value</label><textarea class="cc-edit-new" rows="5">' +
      esc(fmtVal(c.newValue)) +
      '</textarea>' +
      '<div class="cc-edit-actions">' +
      '<button type="button" class="act" onclick="ContentCorrectionsPanel.cancelEdit()">Cancelar</button>' +
      '<button type="button" class="act approve" onclick="ContentCorrectionsPanel.saveEdit(\'' +
      esc(c.id) +
      '\')">Guardar cambios</button>' +
      '</div>' +
      '<p class="cc-muted">Old Value / Source / Target / Field Path no son editables.</p>' +
      '</div>'
    );
  }

  function actionButtons(c) {
    var st = c.status;
    if (st === 'pending') {
      return (
        '<button type="button" class="act approve" onclick="event.stopPropagation();ContentCorrectionsPanel.approve(\'' +
        esc(c.id) +
        '\')">Approve</button>' +
        '<button type="button" class="act reject" onclick="event.stopPropagation();ContentCorrectionsPanel.reject(\'' +
        esc(c.id) +
        '\')">Reject</button>' +
        '<button type="button" class="act" onclick="event.stopPropagation();ContentCorrectionsPanel.startEdit(\'' +
        esc(c.id) +
        '\')">Editar</button>'
      );
    }
    if (st === 'approved' || st === 'failed') {
      return (
        '<button type="button" class="act approve" onclick="event.stopPropagation();ContentCorrectionsPanel.applyOne(\'' +
        esc(c.id) +
        '\')">Apply…</button>' +
        '<span class="cc-muted">Dry-run obligatorio antes de confirmar</span>'
      );
    }
    if (st === 'conflict') {
      return (
        '<button type="button" class="act" onclick="event.stopPropagation();ContentCorrectionsPanel.reapprove(\'' +
        esc(c.id) +
        '\')">Re-aprobar (tras revisar JSON)</button>' +
        '<span class="cc-muted">oldValue ≠ JSON actual</span>'
      );
    }
    return '<span class="cc-muted">Solo lectura (' + esc(st) + ')</span>';
  }

  function cardHtml(c) {
    var open = !!_expanded[c.id];
    var editing = _editId === c.id && c.status === 'pending';
    return (
      '<article class="cc-card status-' +
      esc(c.status || 'pending') +
      (open ? ' open' : '') +
      '" data-id="' +
      esc(c.id) +
      '">' +
      '<header class="cc-card-hd" onclick="ContentCorrectionsPanel.toggle(\'' +
      esc(c.id) +
      '\')">' +
      '<div class="cc-card-title">' +
      statusBadge(c.status) +
      ' <code>' +
      esc(c.sourceFile) +
      '</code> · ' +
      esc(c.module) +
      ' T' +
      esc(c.teil) +
      ' · <b>' +
      esc(c.fieldPath) +
      '</b>' +
      '</div>' +
      '<div class="cc-card-sub">' +
      esc(c.targetType) +
      ' <code>' +
      esc(c.targetId) +
      '</code> · ' +
      esc(c.createdBy || '—') +
      ' · ' +
      esc(fmtDate(c.createdAt)) +
      ' · ' +
      (open ? '▼' : '▶') +
      '</div>' +
      '</header>' +
      '<div class="cc-card-preview">' +
      '<div class="cc-reason"><b>Reason:</b> ' +
      esc(c.reason || '—') +
      (c.comment ? ' · <span class="cc-muted">' + esc(c.comment) + '</span>' : '') +
      '</div>' +
      renderDiff(c.oldValue, c.newValue) +
      '</div>' +
      (open
        ? '<div class="cc-card-body">' +
          '<div class="cc-meta-grid">' +
          '<div><span class="cc-k">ID</span> <code>' +
          esc(c.id) +
          '</code></div>' +
          '<div><span class="cc-k">Source File</span> ' +
          esc(c.sourceFile) +
          '</div>' +
          '<div><span class="cc-k">Module</span> ' +
          esc(c.module) +
          '</div>' +
          '<div><span class="cc-k">Teil</span> ' +
          esc(c.teil) +
          '</div>' +
          '<div><span class="cc-k">Target</span> ' +
          esc(c.targetType) +
          ' / ' +
          esc(c.targetId) +
          '</div>' +
          '<div><span class="cc-k">Field</span> ' +
          esc(c.fieldPath) +
          '</div>' +
          '<div><span class="cc-k">Status</span> ' +
          statusBadge(c.status) +
          '</div>' +
          '<div><span class="cc-k">Created By</span> ' +
          esc(c.createdBy || '—') +
          '</div>' +
          '<div><span class="cc-k">Created At</span> ' +
          esc(fmtDate(c.createdAt)) +
          '</div>' +
          '<div><span class="cc-k">Reason</span> ' +
          esc(c.reason || '—') +
          '</div>' +
          '<div class="cc-span2"><span class="cc-k">Comment</span> ' +
          esc(c.comment || '—') +
          '</div>' +
          '</div>' +
          '<div class="cc-section"><span class="cc-k">Old / New (diff)</span>' +
          renderDiff(c.oldValue, c.newValue) +
          '</div>' +
          '<div class="cc-section"><span class="cc-k">History</span>' +
          historyHtml(c.history, true) +
          '</div>' +
          (editing ? editFormHtml(c) : '') +
          '<div class="cc-actions">' +
          actionButtons(c) +
          '<button type="button" class="act" onclick="event.stopPropagation();ContentCorrectionsPanel.toggle(\'' +
          esc(c.id) +
          '\')">Cerrar</button>' +
          '</div></div>'
        : '') +
      '</article>'
    );
  }

  function filteredSorted() {
    var f = filterInputs();
    return sortList(
      _all.filter(function (c) {
        return matchesFilters(c, f);
      }),
      f.sort,
    );
  }

  function render() {
    var list = filteredSorted();
    renderStatsBar(list);
    var el = document.getElementById('ccList');
    var countEl = document.getElementById('ccCount');
    if (countEl) countEl.textContent = list.length + ' visible · ' + (_all.length || 0) + ' cargadas';
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<div class="empty">No hay correcciones con estos filtros.</div>';
      return;
    }
    el.innerHTML = list.map(cardHtml).join('');
  }

  function batchFilters() {
    var f = filterInputs();
    return {
      module: f.module || undefined,
      sourceFile: f.sourceFile || undefined,
    };
  }

  function formatDryRunSummary(s) {
    s = s || {};
    return (
      'Correcciones: ' +
      (s.corrections ?? 0) +
      '\nArchivos afectados: ' +
      (s.filesAffected ?? 0) +
      '\nPreguntas afectadas: ' +
      (s.questionsAffected ?? s.targetsAffected ?? 0) +
      '\nConflictos: ' +
      (s.conflicts ?? 0) +
      '\nLearning rules generadas (est.): ' +
      (s.learningRulesGenerated ?? s.learningRulesEstimated ?? 0) +
      '\nAplicables: ' +
      (s.wouldApply ?? 0)
    );
  }

  async function dryRunBatch() {
    if (!deps.api) return;
    toast('Dry-run…');
    var filters = batchFilters();
    var r = await deps.api(
      'POST',
      {},
      {
        action: 'dry_run_apply_corrections',
        module: filters.module,
        sourceFile: filters.sourceFile,
      },
    );
    if (r.error && !r.summary) {
      toast('✗ ' + (r.message || r.error));
      return;
    }
    _lastDryRun = r;
    window.alert('Dry-run (sin escribir JSON)\n\n' + formatDryRunSummary(r.summary) + '\n\n' + (r.message || ''));
    toast('✓ Dry-run listo');
  }

  async function applyBatch() {
    if (!deps.api) return;
    var filters = batchFilters();
    var plan = await deps.api(
      'POST',
      {},
      {
        action: 'dry_run_apply_corrections',
        module: filters.module,
        sourceFile: filters.sourceFile,
      },
    );
    if (plan.error && !plan.summary) {
      toast('✗ ' + (plan.message || plan.error));
      return;
    }
    _lastDryRun = plan;
    if (!window.confirm(formatDryRunSummary(plan.summary) + '\n\n¿Continuar y aplicar al JSON?')) return;
    var r = await deps.api(
      'POST',
      {},
      {
        action: 'apply_approved_corrections',
        confirm: true,
        module: filters.module,
        sourceFile: filters.sourceFile,
      },
    );
    if (r.error && !r.summary) {
      toast('✗ ' + (r.message || r.error));
      return;
    }
    toast(
      '✓ Apply: ' +
        ((r.summary && r.summary.applied) || 0) +
        ' aplicadas · ' +
        ((r.summary && r.summary.conflicts) || 0) +
        ' conflictos',
    );
    await load();
  }

  async function applyOne(id) {
    if (!deps.api) return;
    var plan = await deps.api('POST', {}, { action: 'apply_content_correction', id: id });
    if (plan.error === 'conflict' || plan.status === 'conflict') {
      toast('✗ Conflicto: oldValue ≠ JSON actual');
      await load();
      return;
    }
    if (!plan.ok && !plan.wouldApply && !plan.alreadyApplied) {
      toast('✗ ' + (plan.message || plan.error || 'dry-run falló'));
      return;
    }
    if (!window.confirm('Apply ' + id + '\n' + (plan.sourceFile || '') + ' · ' + (plan.fieldPath || '') + '\n\n¿Continuar?')) {
      return;
    }
    var r = await deps.api('POST', {}, { action: 'apply_content_correction', id: id, confirm: true });
    if (!r.ok) {
      toast('✗ ' + (r.message || r.error || 'apply falló'));
      await load();
      return;
    }
    toast('✓ Applied' + (r.learning && r.learning.reusable ? ' (+ learning rule)' : ''));
    await load();
    _expanded[id] = true;
    render();
  }

  async function reapprove(id) {
    if (!confirm('¿Volver a approved? Solo si el JSON ya coincide con oldValue o actualizaste la corrección.')) return;
    var r = await deps.api('POST', {}, { action: 'update_content_correction', id: id, status: 'approved' });
    if (r.error) {
      toast('✗ ' + (r.message || r.error));
      return;
    }
    toast('✓ Re-aprobada');
    await load();
  }

  async function load() {
    if (!deps.api) {
      toast('API no disponible');
      return;
    }
    var data = await deps.api('GET', {
      action: 'content_corrections',
      status: 'all',
      limit: 500,
    });
    if (data.error) {
      toast('✗ ' + (data.message || data.error));
      _all = [];
      render();
      return;
    }
    _all = data.corrections || [];
    _counts = data.counts || _counts;
    render();
  }

  function toggle(id) {
    _expanded[id] = !_expanded[id];
    if (!_expanded[id] && _editId === id) _editId = null;
    render();
  }

  function startEdit(id) {
    _editId = id;
    _expanded[id] = true;
    render();
  }

  function cancelEdit() {
    _editId = null;
    render();
  }

  function parseNewValue(raw) {
    var t = String(raw || '').trim();
    if (!t) return '';
    try {
      if (/^[\[{]/.test(t) || t === 'null' || t === 'true' || t === 'false' || /^-?\d+(\.\d+)?$/.test(t)) {
        return JSON.parse(t);
      }
    } catch (_) {
      /* keep string */
    }
    return raw;
  }

  async function saveEdit(id) {
    var form = document.querySelector('.cc-edit-form[data-edit-id="' + id + '"]');
    if (!form) return;
    var reason = form.querySelector('.cc-edit-reason').value.trim();
    var comment = form.querySelector('.cc-edit-comment').value;
    var newValue = parseNewValue(form.querySelector('.cc-edit-new').value);
    if (reason.length < 2) {
      toast('Reason demasiado corto');
      return;
    }
    var r = await deps.api(
      'POST',
      {},
      {
        action: 'update_content_correction',
        id: id,
        reason: reason,
        comment: comment,
        newValue: newValue,
      },
    );
    if (r.error) {
      toast('✗ ' + (r.message || r.error));
      return;
    }
    toast('✓ Corrección actualizada');
    _editId = null;
    await load();
    _expanded[id] = true;
    render();
  }

  async function approve(id) {
    if (!confirm('¿Aprobar esta corrección? (aún no escribe el JSON)')) return;
    var r = await deps.api('POST', {}, { action: 'update_content_correction', id: id, status: 'approved' });
    if (r.error) {
      toast('✗ ' + (r.message || r.error));
      return;
    }
    toast('✓ Approved — usa Apply para escribir el JSON');
    await load();
  }

  async function reject(id) {
    var note = prompt('Motivo del rechazo (opcional):', '') || '';
    var r = await deps.api(
      'POST',
      {},
      {
        action: 'reject_content_correction',
        id: id,
        comment: note || undefined,
      },
    );
    if (r.error) {
      toast('✗ ' + (r.message || r.error));
      return;
    }
    toast('✓ Rejected');
    await load();
  }

  global.ContentCorrectionsPanel = {
    bind: bind,
    load: load,
    render: render,
    toggle: toggle,
    startEdit: startEdit,
    cancelEdit: cancelEdit,
    saveEdit: saveEdit,
    approve: approve,
    reject: reject,
    dryRunBatch: dryRunBatch,
    applyBatch: applyBatch,
    applyOne: applyOne,
    reapprove: reapprove,
  };
})(typeof window !== 'undefined' ? window : globalThis);
