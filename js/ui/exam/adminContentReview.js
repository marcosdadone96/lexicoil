/**
 * Admin Content Review Mode (PASO 3 / 3.5) — create content corrections from the exam UI.
 * Trusted admins send autoApprove:true so create lands as approved (skip pending wait).
 * After apply succeeds: hot-patch prose fields into live S.examData (same browser session).
 *
 * HOT_PATCH_SAFE_FIELD_PATHS must stay in sync with
 * netlify/functions/lib/contentCorrectionSchema.js
 */
(function (global) {
  var TARGETS = Object.create(null);
  var SEQ = 0;
  var MODAL_ID = 'adminContentReviewModal';
  /** Survives re-render: key → { correctionId, message } */
  var PENDING_MARKS = Object.create(null);

  /** @see contentCorrectionSchema.HOT_PATCH_SAFE_FIELD_PATHS */
  var HOT_PATCH_SAFE_FIELD_PATHS = ['text', 'question', 'explanation', 'title', 'transcript'];
  var MSG_HOT_PATCHED = 'Corregido — ya se actualizó en pantalla.';
  var MSG_NEXT_PART =
    'Corregido — se aplicará a partir de la próxima parte/examen (no afecta esta pregunta ya mostrada).';
  var MSG_PUBLISHED_CONFIRM =
    'Esta parte ya está en el catálogo oficial (PUBLICADO).\n\n' +
    'La corrección se aplicará al pool, seed y al examen publicado para cargas futuras.\n' +
    'No se reescriben intentos ni resultados de exámenes ya completados.\n\n' +
    '¿Continuar?';
  var MODULE_PART_KEYS = [
    'lesenParts',
    'horenParts',
    'schreibenParts',
    'sprechenParts',
    'readingParts',
    'listeningParts',
    'writingParts',
    'speakingParts',
  ];

  function canEditContent() {
    if (typeof Auth !== 'undefined' && typeof Auth.canEditContent === 'function') {
      return Auth.canEditContent();
    }
    if (typeof AdminAccess !== 'undefined' && AdminAccess.canEditContentFromUser) {
      return AdminAccess.canEditContentFromUser(typeof S !== 'undefined' ? S.user : null);
    }
    return !!(typeof S !== 'undefined' && S.user && (S.user.canEditContent || S.user.isAdmin));
  }

  function isAdmin() {
    if (typeof Auth !== 'undefined' && typeof Auth.isAdmin === 'function') return Auth.isAdmin();
    return !!(typeof S !== 'undefined' && S.user && S.user.isAdmin === true);
  }

  function resetTargets() {
    TARGETS = Object.create(null);
  }

  function markKey(kind, provenance) {
    var prov = provenance || {};
    var tid = kind === 'passage' ? prov.passageId : prov.questionId;
    return [String(prov.sourceFile || ''), kind, String(tid || '')].join('|');
  }

  function rememberPending(kind, provenance, correctionId, message) {
    var key = markKey(kind, provenance);
    if (!key || key.indexOf('||') === 0) return;
    PENDING_MARKS[key] = {
      correctionId: correctionId || null,
      message: message || 'Ya existe una corrección pendiente',
    };
  }

  function publishedBadgeHtml(provenance) {
    if (!provenance || !provenance.publishedOfficial) return '';
    return (
      '<span class="admin-review-published" title="Contenido en catálogo oficial">PUBLICADO</span>'
    );
  }

  function examContext() {
    return typeof S !== 'undefined' && S.examData ? S.examData : null;
  }

  function enrichProvenance(prov) {
    prov = prov || {};
    var exam = examContext();
    var level = prov.level || (exam && exam.level) || '';
    var sf = String(prov.sourceFile || '').trim();
    if (sf && sf.indexOf('/') === -1 && sf.indexOf('pool-verified') === -1 && level) {
      sf = 'batches/ready/pool-verified/' + String(level).toUpperCase() + '/' + sf.replace(/\.json$/i, '');
    }
    if (!prov.publishedOfficial && exam && exam.publishedExam === true) {
      prov = Object.assign({}, prov, { publishedOfficial: true });
    }
    if (!prov.examId && exam && exam.examId) {
      prov = Object.assign({}, prov, { examId: exam.examId });
    }
    return Object.assign({}, prov, { sourceFile: sf || prov.sourceFile, level: level || prov.level });
  }

  function isLocalDevHost() {
    try {
      var h = window.location && window.location.hostname;
      return h === 'localhost' || h === '127.0.0.1';
    } catch (_) {
      return false;
    }
  }

  function pendingBadgeHtml(kind, provenance) {
    var mark = PENDING_MARKS[markKey(kind, provenance)];
    if (!mark) return '';
    return (
      '<span class="admin-review-pending" title="' +
      escAttr(mark.correctionId || '') +
      '">Ya existe una corrección pendiente</span>'
    );
  }

  function escAttr(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function valuesEqual(a, b) {
    if (a === b) return true;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (_) {
      return false;
    }
  }

  function parseTags(raw) {
    if (Array.isArray(raw)) return raw.map(String).map((t) => t.trim()).filter(Boolean);
    return String(raw || '')
      .split(/[,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function parseOptions(raw) {
    var text = String(raw || '').trim();
    if (!text) return [];
    try {
      var parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      /* line format */
    }
    return text
      .split(/\n+/)
      .map(function (line) {
        var m = line.match(/^\s*([A-Za-z0-9])[).:\-]\s*(.*)$/);
        if (m) return { key: m[1].toUpperCase(), text: m[2].trim() };
        return line.trim();
      })
      .filter(Boolean);
  }

  function formatOptions(opts) {
    if (!Array.isArray(opts)) return '';
    try {
      return JSON.stringify(opts, null, 2);
    } catch (_) {
      return String(opts);
    }
  }

  function isHotPatchSafe(fieldPath) {
    var leaf = String(fieldPath || '')
      .trim()
      .split('.')
      .pop();
    return HOT_PATCH_SAFE_FIELD_PATHS.indexOf(leaf) !== -1;
  }

  function objectId(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.id != null && obj.id !== '') return String(obj.id);
    if (obj.passageId != null && obj.passageId !== '') return String(obj.passageId);
    if (obj.questionId != null && obj.questionId !== '') return String(obj.questionId);
    return null;
  }

  function objectIds(obj) {
    if (!obj || typeof obj !== 'object') return [];
    var out = [];
    ['id', 'passageId', 'questionId'].forEach(function (k) {
      if (obj[k] != null && String(obj[k]).trim() !== '') out.push(String(obj[k]));
    });
    return out;
  }

  function findTargetsById(examData, targetId) {
    var want = String(targetId || '').trim();
    if (!want || !examData || typeof examData !== 'object') return [];
    var hits = [];
    function consider(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (objectIds(obj).indexOf(want) !== -1) hits.push(obj);
    }
    function walkPart(part) {
      if (!part || typeof part !== 'object') return;
      consider(part);
      if (Array.isArray(part.passages)) part.passages.forEach(consider);
      if (Array.isArray(part.questions)) part.questions.forEach(consider);
      if (Array.isArray(part.items)) part.items.forEach(consider);
      if (Array.isArray(part.ads)) part.ads.forEach(consider);
      if (Array.isArray(part.opinions)) part.opinions.forEach(consider);
      if (Array.isArray(part.persons)) part.persons.forEach(consider);
      if (Array.isArray(part.segments)) {
        part.segments.forEach(function (seg) {
          consider(seg);
          if (Array.isArray(seg.questions)) seg.questions.forEach(consider);
        });
      }
    }
    MODULE_PART_KEYS.forEach(function (key) {
      if (Array.isArray(examData[key])) examData[key].forEach(walkPart);
    });
    if (examData.horen && typeof examData.horen === 'object') consider(examData.horen);
    if (Array.isArray(examData.questions)) examData.questions.forEach(consider);
    if (Array.isArray(examData.passages)) examData.passages.forEach(consider);
    return hits;
  }

  function writeProseField(obj, fieldPath, newValue) {
    if (!obj || typeof obj !== 'object') return false;
    var leaf = String(fieldPath || '')
      .trim()
      .split('.')
      .pop();
    if (!isHotPatchSafe(leaf)) return false;
    if (leaf === 'question') {
      if (Object.prototype.hasOwnProperty.call(obj, 'question') || obj.question != null) {
        obj.question = newValue;
        return true;
      }
      if (Object.prototype.hasOwnProperty.call(obj, 'signText') || obj.signText != null) {
        obj.signText = newValue;
        return true;
      }
      if (Object.prototype.hasOwnProperty.call(obj, 'statement') || obj.statement != null) {
        obj.statement = newValue;
        return true;
      }
      obj.question = newValue;
      return true;
    }
    if (leaf === 'title') {
      if (Object.prototype.hasOwnProperty.call(obj, 'title') || obj.title != null) {
        obj.title = newValue;
        return true;
      }
      if (Object.prototype.hasOwnProperty.call(obj, 'textTitle') || obj.textTitle != null) {
        obj.textTitle = newValue;
        return true;
      }
      obj.title = newValue;
      return true;
    }
    if (leaf === 'text') {
      if (Object.prototype.hasOwnProperty.call(obj, 'text') || obj.text != null) {
        obj.text = newValue;
        return true;
      }
      if (Object.prototype.hasOwnProperty.call(obj, 'transcript') || obj.transcript != null) {
        obj.transcript = newValue;
        return true;
      }
      return false;
    }
    if (leaf === 'explanation') {
      obj.explanation = newValue;
      return true;
    }
    if (leaf === 'transcript') {
      obj.transcript = newValue;
      return true;
    }
    return false;
  }

  /**
   * Patch live S.examData for a safe prose field. Never throws.
   * @returns {{ patched: boolean, message: string, reason?: string }}
   */
  function hotPatchLiveExam(targetId, fieldPath, newValue) {
    try {
      if (!isHotPatchSafe(fieldPath)) {
        return { patched: false, message: MSG_NEXT_PART, reason: 'not_hot_patch_safe' };
      }
      var examData = typeof S !== 'undefined' ? S.examData : null;
      if (!examData) {
        return { patched: false, message: MSG_NEXT_PART, reason: 'no_exam_data' };
      }
      var hits = findTargetsById(examData, targetId);
      if (!hits.length) {
        return { patched: false, message: MSG_NEXT_PART, reason: 'target_not_found' };
      }
      var wrote = false;
      for (var i = 0; i < hits.length; i++) {
        if (writeProseField(hits[i], fieldPath, newValue)) wrote = true;
      }
      if (!wrote) {
        return { patched: false, message: MSG_NEXT_PART, reason: 'field_not_writable' };
      }
      if (typeof renderExam === 'function') {
        try {
          renderExam();
        } catch (err) {
          if (typeof console !== 'undefined') console.warn('[AdminContentReview] renderExam failed', err);
        }
      }
      return { patched: true, message: MSG_HOT_PATCHED };
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[AdminContentReview] hot-patch failed', err);
      return { patched: false, message: MSG_NEXT_PART, reason: 'hot_patch_exception' };
    }
  }

  function resolvePassageProvenance(part, passageObj) {
    var fromPass = passageObj && typeof passageObj === 'object' ? passageObj._contentProvenance : null;
    var fromPart = part && part._contentProvenance;
    var base = fromPass || fromPart || {};
    var passageId =
      (passageObj && typeof passageObj === 'object' && (passageObj.passageId || passageObj.id)) ||
      (part && part.passageId) ||
      base.passageId ||
      null;
    return {
      sourceFile: base.sourceFile || (part && part.sourceFile) || null,
      module: base.module || 'lesen',
      teil: base.teil != null ? Number(base.teil) : part && part.teil != null ? Number(part.teil) : null,
      passageId: passageId != null ? String(passageId) : null,
      partId: base.partId || (part && part.partId) || null,
    };
  }

  function resolveQuestionProvenance(q, part) {
    var base = (q && q._contentProvenance) || (part && part._contentProvenance) || {};
    return {
      sourceFile: base.sourceFile || (part && part.sourceFile) || null,
      module: base.module || 'lesen',
      teil: base.teil != null ? Number(base.teil) : part && part.teil != null ? Number(part.teil) : null,
      questionId: (q && q.id != null ? String(q.id) : base.questionId) || null,
      passageId:
        (q && q.passageId != null ? String(q.passageId) : null) ||
        (part && part.passageId != null ? String(part.passageId) : null) ||
        base.passageId ||
        null,
      partId: base.partId || (part && part.partId) || null,
    };
  }

  function passageBtnHtml(part, passageObj) {
    if (!canEditContent()) return '';
    var id = 'pass_' + ++SEQ;
    var prov = enrichProvenance(resolvePassageProvenance(part, passageObj));
    var title =
      (passageObj && typeof passageObj === 'object' && (passageObj.title || passageObj.textTitle)) ||
      (part && (part.textTitle || part.title)) ||
      '';
    var text =
      typeof passageObj === 'string'
        ? passageObj
        : (passageObj && (passageObj.text || passageObj.transcript)) ||
          (part && (part.text || part.transcript)) ||
          '';
    var topicTag =
      (passageObj && typeof passageObj === 'object' && passageObj.topicTag) ||
      (part && part.topicTag) ||
      '';
    TARGETS[id] = {
      kind: 'passage',
      provenance: prov,
      fields: {
        title: String(title || ''),
        text: String(text || ''),
        topicTag: String(topicTag || ''),
      },
    };
    return (
      '<div class="admin-review-row" data-admin-mark="' +
      escAttr(markKey('passage', prov)) +
      '">' +
      '<button type="button" class="btn-sm admin-review-btn" data-admin-review-id="' +
      escAttr(id) +
      '">✏️ Corregir texto</button>' +
      pendingBadgeHtml('passage', prov) +
      publishedBadgeHtml(prov) +
      '</div>'
    );
  }

  function questionBtnHtml(q, part) {
    if (!canEditContent() || !q || q.id == null) return '';
    var id = 'q_' + ++SEQ;
    var prov = enrichProvenance(resolveQuestionProvenance(q, part));
    TARGETS[id] = {
      kind: 'question',
      provenance: prov,
      fields: {
        question: String(q.question || q.signText || q.statement || ''),
        options: q.options != null ? q.options : [],
        correct: q.correct != null ? q.correct : q.correctAnswer,
        explanation: String(q.explanation || ''),
        vocabularyTags: Array.isArray(q.vocabularyTags) ? q.vocabularyTags.slice() : [],
        grammarTags: Array.isArray(q.grammarTags) ? q.grammarTags.slice() : [],
        difficulty: q.difficulty != null ? q.difficulty : '',
      },
    };
    return (
      '<div class="admin-review-row" data-admin-mark="' +
      escAttr(markKey('question', prov)) +
      '">' +
      '<button type="button" class="btn-sm admin-review-btn" data-admin-review-id="' +
      escAttr(id) +
      '">✏️ Corregir texto</button>' +
      pendingBadgeHtml('question', prov) +
      publishedBadgeHtml(prov) +
      '</div>'
    );
  }

  function ensureModal() {
    var el = document.getElementById(MODAL_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = MODAL_ID;
    el.className = 'admin-review-modal';
    el.style.display = 'none';
    el.innerHTML =
      '<div class="admin-review-dialog" role="dialog" aria-modal="true" aria-labelledby="adminReviewTitle">' +
      '<button type="button" class="admin-review-close" aria-label="Close" onclick="AdminContentReview.close()">×</button>' +
      '<h3 id="adminReviewTitle">Revisión de contenido</h3>' +
      '<p class="admin-review-published-warn" id="adminReviewPublishedWarn" style="display:none"></p>' +
      '<p class="admin-review-meta" id="adminReviewMeta"></p>' +
      '<div id="adminReviewFields"></div>' +
      '<label class="admin-review-label">Motivo <span class="req">*</span></label>' +
      '<input type="text" id="adminReviewReason" class="admin-review-input" placeholder="German naturalness" />' +
      '<label class="admin-review-label">Comentario</label>' +
      '<textarea id="adminReviewComment" class="admin-review-textarea" rows="2" placeholder="Opcional"></textarea>' +
      '<p class="admin-review-hint">Al guardar se auto-aprueba y aplica. Campos de prosa se actualizan en pantalla; opciones/respuesta correcta, en la próxima parte.</p>' +
      '<div class="admin-review-actions">' +
      '<button type="button" class="btn-sm" onclick="AdminContentReview.close()">Cancelar</button>' +
      '<button type="button" class="btn-sm accent" id="adminReviewSaveBtn" onclick="AdminContentReview.save()">Guardar corrección</button>' +
      '</div>' +
      '<p class="admin-review-status" id="adminReviewStatus"></p>' +
      '</div>';
    el.addEventListener('click', function (ev) {
      if (ev.target === el) close();
    });
    document.body.appendChild(el);
    return el;
  }

  function notify(msg, kind) {
    if (typeof lcToast === 'function') lcToast(msg, kind || 'warn', 5000);
    else if (typeof console !== 'undefined') console.warn('[AdminContentReview]', msg);
  }

  async function refreshEditAccess() {
    try {
      if (typeof Auth === 'undefined' || typeof Auth.apiFetch !== 'function') return canEditContent();
      const res = await Auth.apiFetch('/.netlify/functions/auth-me');
      if (!res.ok) return canEditContent();
      const data = await res.json();
      if (data && data.user && typeof applyUserFromServer === 'function') {
        applyUserFromServer(data.user);
      } else if (data && data.user && typeof S !== 'undefined' && S.user) {
        S.user.isAdmin = data.user.isAdmin === true;
        S.user.canEditContent = data.user.canEditContent === true;
        S.user.adminRole = data.user.adminRole || null;
      }
    } catch (_) {
      /* keep current */
    }
    return canEditContent();
  }

  function open(targetId) {
    void openAsync(targetId);
  }

  async function openAsync(targetId) {
    var editOk = canEditContent();
    if (!editOk) {
      notify('Comprobando permisos…', 'ok');
      editOk = await refreshEditAccess();
    }
    if (!editOk) {
      notify('No tienes permiso para corregir contenido.');
      return;
    }
    var target = TARGETS[targetId];
    if (!target) {
      notify('No se encontró el contenido a revisar. Recarga el examen e inténtalo de nuevo.');
      return;
    }
    target.provenance = enrichProvenance(target.provenance);
    var modal = ensureModal();
    modal.dataset.targetId = targetId;
    var prov = target.provenance || {};
    var pubWarn = document.getElementById('adminReviewPublishedWarn');
    if (pubWarn) {
      if (prov.publishedOfficial) {
        pubWarn.style.display = 'block';
        pubWarn.textContent =
          'PUBLICADO — Esta parte está en el catálogo oficial' +
          (prov.examId ? ' (' + prov.examId + ')' : '') +
          '. Los cambios aplican a partir de ahora; no reescriben intentos ya guardados.';
      } else {
        pubWarn.style.display = 'none';
        pubWarn.textContent = '';
      }
    }
    var meta = document.getElementById('adminReviewMeta');
    if (meta) {
      meta.textContent =
        (prov.sourceFile || '¿sin sourceFile?') +
        ' · ' +
        (prov.module || '?') +
        ' T' +
        (prov.teil != null ? prov.teil : '?') +
        ' · ' +
        (target.kind === 'passage'
          ? 'passage ' + (prov.passageId || '—')
          : 'question ' + (prov.questionId || '—'));
    }
    var fieldsEl = document.getElementById('adminReviewFields');
    if (!fieldsEl) return;
    if (target.kind === 'passage') {
      fieldsEl.innerHTML =
        '<label class="admin-review-label">title</label>' +
        '<input type="text" class="admin-review-input" data-field="title" value="' +
        escAttr(target.fields.title) +
        '" />' +
        '<label class="admin-review-label">text</label>' +
        '<textarea class="admin-review-textarea" data-field="text" rows="8">' +
        escHtml(target.fields.text) +
        '</textarea>' +
        '<label class="admin-review-label">topicTag</label>' +
        '<input type="text" class="admin-review-input" data-field="topicTag" value="' +
        escAttr(target.fields.topicTag) +
        '" />';
    } else {
      fieldsEl.innerHTML =
        '<label class="admin-review-label">question</label>' +
        '<textarea class="admin-review-textarea" data-field="question" rows="3">' +
        escHtml(target.fields.question) +
        '</textarea>' +
        '<label class="admin-review-label">options (JSON)</label>' +
        '<textarea class="admin-review-textarea" data-field="options" rows="5">' +
        escHtml(formatOptions(target.fields.options)) +
        '</textarea>' +
        '<label class="admin-review-label">correct</label>' +
        '<input type="text" class="admin-review-input" data-field="correct" value="' +
        escAttr(
          Array.isArray(target.fields.correct)
            ? JSON.stringify(target.fields.correct)
            : target.fields.correct,
        ) +
        '" />' +
        '<label class="admin-review-label">explanation</label>' +
        '<textarea class="admin-review-textarea" data-field="explanation" rows="3">' +
        escHtml(target.fields.explanation) +
        '</textarea>' +
        '<label class="admin-review-label">vocabularyTags (coma)</label>' +
        '<input type="text" class="admin-review-input" data-field="vocabularyTags" value="' +
        escAttr((target.fields.vocabularyTags || []).join(', ')) +
        '" />' +
        '<label class="admin-review-label">grammarTags (coma)</label>' +
        '<input type="text" class="admin-review-input" data-field="grammarTags" value="' +
        escAttr((target.fields.grammarTags || []).join(', ')) +
        '" />' +
        '<label class="admin-review-label">difficulty</label>' +
        '<input type="text" class="admin-review-input" data-field="difficulty" value="' +
        escAttr(target.fields.difficulty) +
        '" />';
    }
    var reason = document.getElementById('adminReviewReason');
    var comment = document.getElementById('adminReviewComment');
    var status = document.getElementById('adminReviewStatus');
    if (reason) reason.value = '';
    if (comment) comment.value = '';
    if (status) status.textContent = '';
    modal.style.display = 'flex';
  }

  function bindDelegatedClicks() {
    if (bindDelegatedClicks._bound) return;
    bindDelegatedClicks._bound = true;
    document.addEventListener(
      'click',
      function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest('.admin-review-btn[data-admin-review-id]');
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();
        open(btn.getAttribute('data-admin-review-id'));
      },
      true,
    );
  }
  bindDelegatedClicks();

  function close() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) modal.style.display = 'none';
  }

  function readField(name) {
    var el = document.querySelector('#' + MODAL_ID + ' [data-field="' + name + '"]');
    return el ? el.value : '';
  }

  function targetTypeForField(kind, fieldPath) {
    if (kind === 'passage') return 'passage';
    if (fieldPath === 'explanation') return 'explanation';
    if (fieldPath === 'vocabularyTags') return 'vocabularyTags';
    if (fieldPath === 'grammarTags') return 'grammarTags';
    if (fieldPath === 'difficulty') return 'difficulty';
    if (fieldPath === 'options') return 'option';
    return 'question';
  }

  function formatApiError(err) {
    var data = (err && err.data) || {};
    var msg = data.message || (err && err.message) || 'create_failed';
    var details = data.details || data.errors || [];
    if (Array.isArray(details) && details.length) {
      return msg + ' (' + details.join(', ') + ')';
    }
    return msg;
  }

  function paintPendingBadge(kind, provenance) {
    var key = markKey(kind, provenance);
    var esc =
      typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(key)
        : String(key).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    var row = document.querySelector('.admin-review-row[data-admin-mark="' + esc + '"]');
    if (!row) return;
    if (row.querySelector('.admin-review-pending')) return;
    var span = document.createElement('span');
    span.className = 'admin-review-pending';
    span.textContent = 'Ya existe una corrección pendiente';
    row.appendChild(span);
  }

  function apiFetch() {
    if (typeof Auth !== 'undefined' && Auth.apiFetch) return Auth.apiFetch.bind(Auth);
    if (typeof lcApiFetch === 'function') return lcApiFetch;
    return null;
  }

  async function postCorrection(body) {
    var fetchFn = apiFetch();
    if (!fetchFn) throw new Error('auth_api_unavailable');
    var res = await fetchFn('/api/admin/content-corrections', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    var data = {};
    try {
      data = await res.json();
    } catch (_) {
      /* empty */
    }
    if (!res.ok) {
      var err = new Error(data.message || data.error || 'create_failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /** Apply via content-corrections (content_corrector + admin); sync on by default. */
  async function postApplyCorrection(correctionId, opts) {
    opts = opts || {};
    var fetchFn = apiFetch();
    if (!fetchFn) throw new Error('auth_api_unavailable');
    var exam = examContext();
    var baseBody = {
      action: 'apply_correction',
      id: correctionId,
      syncEnabled: opts.syncEnabled !== false,
      confirmPublish: opts.confirmPublish === true,
      localOnly: opts.localOnly === true,
      lang: (exam && exam.lang) || opts.lang || 'de',
      level: (exam && exam.level) || opts.level,
    };
    var dryRes = await fetchFn('/.netlify/functions/content-corrections', {
      method: 'POST',
      body: JSON.stringify(Object.assign({}, baseBody, { confirm: false })),
    });
    var dryData = {};
    try {
      dryData = await dryRes.json();
    } catch (_) {
      /* empty */
    }
    if (!dryRes.ok && !dryData.wouldApply) {
      var dryErr = new Error(dryData.message || dryData.error || 'dry_run_failed');
      dryErr.status = dryRes.status;
      dryErr.data = dryData;
      throw dryErr;
    }
    var res = await fetchFn('/.netlify/functions/content-corrections', {
      method: 'POST',
      body: JSON.stringify(Object.assign({}, baseBody, { confirm: true })),
    });
    var data = {};
    try {
      data = await res.json();
    } catch (_) {
      /* empty */
    }
    if (!res.ok) {
      var err = new Error(data.message || data.error || 'apply_failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function save() {
    if (!canEditContent()) return;
    var modal = document.getElementById(MODAL_ID);
    var targetId = modal && modal.dataset.targetId;
    var target = targetId && TARGETS[targetId];
    var status = document.getElementById('adminReviewStatus');
    var saveBtn = document.getElementById('adminReviewSaveBtn');
    if (!target) return;

    var reason = String(document.getElementById('adminReviewReason')?.value || '').trim();
    var comment = String(document.getElementById('adminReviewComment')?.value || '').trim();
    if (reason.length < 2) {
      if (status) status.textContent = 'Indica un motivo (mín. 2 caracteres).';
      return;
    }

    var prov = enrichProvenance(target.provenance || {});
    target.provenance = prov;
    if (!prov.sourceFile) {
      if (status) status.textContent = 'Falta sourceFile en provenance — no se puede crear la corrección.';
      return;
    }
    var targetIdVal = target.kind === 'passage' ? prov.passageId : prov.questionId;
    if (!targetIdVal) {
      if (status)
        status.textContent =
          'Falta ' + (target.kind === 'passage' ? 'passageId' : 'questionId') + ' — no se puede crear.';
      return;
    }

    var patches = [];
    if (target.kind === 'passage') {
      ['title', 'text', 'topicTag'].forEach(function (fp) {
        var neu = readField(fp);
        var old = target.fields[fp];
        if (!valuesEqual(String(old ?? ''), String(neu ?? ''))) {
          patches.push({ fieldPath: fp, oldValue: old, newValue: neu, targetType: 'passage' });
        }
      });
    } else {
      var qNew = readField('question');
      if (!valuesEqual(String(target.fields.question ?? ''), qNew)) {
        patches.push({
          fieldPath: 'question',
          oldValue: target.fields.question,
          newValue: qNew,
          targetType: 'question',
        });
      }
      var optNew = parseOptions(readField('options'));
      if (!valuesEqual(target.fields.options, optNew)) {
        patches.push({
          fieldPath: 'options',
          oldValue: target.fields.options,
          newValue: optNew,
          targetType: 'option',
        });
      }
      var correctRaw = readField('correct').trim();
      var correctNew = correctRaw;
      try {
        if (/^[\[{]/.test(correctRaw)) correctNew = JSON.parse(correctRaw);
      } catch (_) {
        /* keep string */
      }
      if (!valuesEqual(target.fields.correct, correctNew)) {
        patches.push({
          fieldPath: 'correct',
          oldValue: target.fields.correct,
          newValue: correctNew,
          targetType: 'question',
        });
      }
      var explNew = readField('explanation');
      if (!valuesEqual(String(target.fields.explanation ?? ''), explNew)) {
        patches.push({
          fieldPath: 'explanation',
          oldValue: target.fields.explanation,
          newValue: explNew,
          targetType: 'explanation',
        });
      }
      var vocabNew = parseTags(readField('vocabularyTags'));
      if (!valuesEqual(target.fields.vocabularyTags, vocabNew)) {
        patches.push({
          fieldPath: 'vocabularyTags',
          oldValue: target.fields.vocabularyTags,
          newValue: vocabNew,
          targetType: 'vocabularyTags',
        });
      }
      var gramNew = parseTags(readField('grammarTags'));
      if (!valuesEqual(target.fields.grammarTags, gramNew)) {
        patches.push({
          fieldPath: 'grammarTags',
          oldValue: target.fields.grammarTags,
          newValue: gramNew,
          targetType: 'grammarTags',
        });
      }
      var diffNew = readField('difficulty').trim();
      var diffOld = target.fields.difficulty;
      var diffCmp = diffNew === '' ? '' : isNaN(Number(diffNew)) ? diffNew : Number(diffNew);
      if (!valuesEqual(diffOld === '' || diffOld == null ? '' : diffOld, diffCmp === '' ? '' : diffCmp)) {
        patches.push({
          fieldPath: 'difficulty',
          oldValue: diffOld,
          newValue: diffCmp === '' ? null : diffCmp,
          targetType: 'difficulty',
        });
      }
    }

    if (!patches.length) {
      if (status) status.textContent = 'Sin cambios.';
      return;
    }

    var provSave = prov;
    if (provSave.publishedOfficial) {
      if (!window.confirm(MSG_PUBLISHED_CONFIRM)) {
        if (status) status.textContent = 'Cancelado — no se guardó la corrección.';
        return;
      }
    }

    if (saveBtn) saveBtn.disabled = true;
    if (status) status.textContent = 'Guardando ' + patches.length + ' corrección(es)…';

    var created = [];
    var reused = [];
    var ignored = 0;
    var errors = [];
    var userMessages = [];
    var anyHotPatched = false;
    var anyNextPart = false;

    var applyOpts = {
      confirmPublish: !!provSave.publishedOfficial,
      localOnly: isLocalDevHost(),
    };
    var examCtx = examContext();

    try {
      for (var i = 0; i < patches.length; i++) {
        var p = patches[i];
        try {
          var data = await postCorrection({
            sourceFile: provSave.sourceFile,
            module: provSave.module,
            teil: provSave.teil,
            level: provSave.level || (examCtx && examCtx.level),
            targetType: p.targetType || targetTypeForField(target.kind, p.fieldPath),
            targetId: String(targetIdVal),
            fieldPath: p.fieldPath,
            oldValue: p.oldValue,
            newValue: p.newValue,
            reason: reason,
            comment: comment,
            autoApprove: true,
          });
          if (data.ignored) {
            ignored++;
            continue;
          }
          var corr = data.correction || null;
          var cid =
            data.correctionId ||
            (corr && corr.id) ||
            null;
          rememberPending(target.kind, provSave, cid, data.message);
          paintPendingBadge(target.kind, provSave);
          if (data.reused) reused.push(cid);
          else created.push(cid);

          var statusNow = corr && corr.status;
          var appliedOk = false;
          if (cid && statusNow === 'approved') {
            try {
              var applyRes = await postApplyCorrection(cid, applyOpts);
              appliedOk = !!(applyRes && applyRes.applied === true);
              var syncSt =
                (applyRes.sync && applyRes.sync.syncStatus) ||
                (applyRes.correction && applyRes.correction.syncStatus) ||
                null;
              if (syncSt && status) {
                status.textContent = (status.textContent || '') + ' · sync: ' + syncSt;
              }
              if (!appliedOk && applyRes && applyRes.ok === false) {
                errors.push(applyRes.error || 'apply_failed');
              }
            } catch (applyErr) {
              errors.push(formatApiError(applyErr));
            }
          }

          if (statusNow === 'approved' && appliedOk) {
            if (isHotPatchSafe(p.fieldPath)) {
              var hp = hotPatchLiveExam(String(targetIdVal), p.fieldPath, p.newValue);
              if (hp.patched) {
                anyHotPatched = true;
                userMessages.push(MSG_HOT_PATCHED);
              } else {
                anyNextPart = true;
                userMessages.push(MSG_NEXT_PART);
                if (typeof console !== 'undefined') {
                  console.warn('[AdminContentReview] hot-patch fallback', hp.reason, {
                    targetId: targetIdVal,
                    fieldPath: p.fieldPath,
                  });
                }
              }
            } else {
              anyNextPart = true;
              userMessages.push(MSG_NEXT_PART);
            }
          }
        } catch (err) {
          errors.push(formatApiError(err));
        }
      }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }

    var parts = [];
    if (created.length) parts.push(created.length + ' nueva(s)');
    if (reused.length) parts.push(reused.length + ' reutilizada(s)');
    if (ignored) parts.push(ignored + ' sin cambios');

    var toastMsg = null;
    if (anyHotPatched && !anyNextPart && !errors.length) toastMsg = MSG_HOT_PATCHED;
    else if (anyNextPart && !anyHotPatched && !errors.length) toastMsg = MSG_NEXT_PART;
    else if (anyHotPatched && anyNextPart) {
      toastMsg = MSG_HOT_PATCHED + ' ' + MSG_NEXT_PART;
    } else if (created.length || reused.length) {
      toastMsg =
        reused.length && !created.length
          ? 'Ya existe una corrección pendiente'
          : 'Corrección(es) procesada(s): ' + (created.length + reused.length);
    }

    if (created.length || reused.length) {
      var ids = created.concat(reused).filter(Boolean);
      if (status) {
        status.textContent =
          (errors.length ? 'Parcial: ' : 'OK: ') +
          parts.join(', ') +
          (ids.length ? ' (' + ids.join(', ') + ')' : '') +
          (toastMsg ? ' — ' + toastMsg : '');
      }
      if (toastMsg) notify(toastMsg, errors.length ? 'warn' : 'ok');
      if (!errors.length) setTimeout(close, 900);
      else if (status) status.textContent += ' · errores: ' + errors.join('; ');
    } else if (ignored && !errors.length) {
      if (status) status.textContent = 'Sin cambios (servidor).';
    } else {
      if (status) status.textContent = 'Error: ' + (errors.join('; ') || 'create_failed');
    }
  }

  var api = {
    isAdmin: isAdmin,
    resetTargets: resetTargets,
    passageBtnHtml: passageBtnHtml,
    questionBtnHtml: questionBtnHtml,
    open: open,
    close: close,
    save: save,
    hotPatchLiveExam: hotPatchLiveExam,
    isHotPatchSafe: isHotPatchSafe,
    HOT_PATCH_SAFE_FIELD_PATHS: HOT_PATCH_SAFE_FIELD_PATHS,
    MSG_HOT_PATCHED: MSG_HOT_PATCHED,
    MSG_NEXT_PART: MSG_NEXT_PART,
    pendingMarks: function () {
      return PENDING_MARKS;
    },
  };

  global.AdminContentReview = api;
})(typeof window !== 'undefined' ? window : globalThis);
