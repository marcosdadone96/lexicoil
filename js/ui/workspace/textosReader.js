// ═══════════════════════════════════════════
// TEXTOS — read-only Lesen passages by topic (de A2 + B1)
// ═══════════════════════════════════════════

function textosUi() {
  return typeof vocabT === 'function' ? vocabT() : null;
}

function textosSupportedForGoal(goal) {
  if (!goal || String(goal.subject || '').toLowerCase() !== 'de') return false;
  const lv = String(goal.level || '').toUpperCase();
  return lv === 'B1' || lv === 'A2';
}

function textosTopicList(goal) {
  const lv = String(goal?.level || '').toUpperCase();
  if (lv === 'A2' && typeof A2Topics !== 'undefined' && A2Topics.A2_OFFICIAL_TOPICS?.length) {
    return A2Topics.A2_OFFICIAL_TOPICS;
  }
  if (typeof B1Topics !== 'undefined' && B1Topics.B1_TOPICS?.length) return B1Topics.B1_TOPICS;
  return [];
}

function clearVocabHubTextosMode() {
  if (typeof _vocabHub === 'undefined') return;
  _vocabHub.activity = null;
  _vocabHub.textosTopic = null;
  _vocabHub.textosTeil = null;
  _vocabHub.textosPayload = null;
  _vocabHub.textosLoading = false;
  _vocabHub.textosError = null;
}

function launchVocabHubTextos() {
  const goal = typeof getActiveGoal === 'function' ? getActiveGoal() : null;
  const vt = textosUi();
  if (!goal) return;
  if (!textosSupportedForGoal(goal)) {
    lcToast(vt?.textosB1Only || 'Texts is available for German A2 and B1 only.', 'warn');
    return;
  }
  if (typeof _vocabHub === 'undefined') return;
  _vocabHub.pickActivity = null;
  _vocabHub.selectedIds.clear();
  _vocabHub.activity = 'textos_read';
  _vocabHub.textosTopic = _vocabHub.textosTopic || null;
  _vocabHub.textosExcludeIds = Array.isArray(_vocabHub.textosExcludeIds) ? _vocabHub.textosExcludeIds : [];
  _vocabHub.textosPayload = null;
  _vocabHub.textosLoading = false;
  _vocabHub.textosError = null;
  S.activeGoalId = goal.id;
  S.subject = goal.subject;
  if (typeof refreshVocabHubPanel === 'function') refreshVocabHubPanel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function textosTopicPickerHtml(goal) {
  const topics = textosTopicList(goal);
  const chips = topics.map((t) => {
    const on = _vocabHub.textosTopic === t ? ' on' : '';
    return `<button type="button" class="vv-filter${on}" onclick='selectTextosTopic(${JSON.stringify(t)})'>${esc(t)}</button>`;
  }).join('');
  return `<div class="vv-filters vv-filters--merged textos-topic-row">${chips}</div>`;
}

function selectTextosTopic(topic) {
  _vocabHub.textosTopic = topic;
  _vocabHub.textosError = null;
  void loadTextosPassage();
}

async function loadTextosPassage() {
  const goal = typeof getActiveGoal === 'function' ? getActiveGoal() : null;
  const vt = textosUi();
  if (!goal || !_vocabHub.textosTopic) return;
  if (typeof fetchTextosReading !== 'function') {
    _vocabHub.textosError = 'textos_unavailable';
    refreshVocabHubPanel();
    return;
  }
  _vocabHub.textosLoading = true;
  _vocabHub.textosError = null;
  refreshVocabHubPanel();
  try {
    const data = await fetchTextosReading(goal.subject, goal.level, {
      topicTag: _vocabHub.textosTopic,
      teil: _vocabHub.textosTeil,
      excludeIds: _vocabHub.textosExcludeIds || [],
    });
    _vocabHub.textosPayload = data;
    _vocabHub.textosLoading = false;
    _vocabHub.textosError = null;
    if (data?.id) {
      const ex = _vocabHub.textosExcludeIds || [];
      if (!ex.includes(data.id)) {
        ex.push(data.id);
        _vocabHub.textosExcludeIds = ex.slice(-40);
      }
    }
    refreshVocabHubPanel();
    bindTextosPassageMeta(data);
  } catch (err) {
    _vocabHub.textosLoading = false;
    _vocabHub.textosPayload = null;
    _vocabHub.textosError = err?.code || err?.message || 'textos_no_match';
    refreshVocabHubPanel();
    if (_vocabHub.textosError === 'rate_limited') lcToast('Too many requests — wait a moment.', 'warn');
    else if (_vocabHub.textosError === 'official_index_stale') lcToast(vt?.textosTempUnavailable || 'Texts temporarily unavailable.', 'error');
    else if (_vocabHub.textosError === 'textos_no_match') lcToast(vt?.textosNoMatch || 'No texts for this topic yet.', 'warn');
  }
}

function bindTextosPassageMeta(data) {
  if (!data?.reading?.passageText || typeof stashPassageMeta !== 'function') return;
  const blockId = 'textos_passage_0';
  stashPassageMeta(blockId, data.reading.passageText, {});
}

function textosReaderToolbarHtml(blockId) {
  const vt = textosUi();
  const ui = typeof examUiStrings === 'function'
    ? examUiStrings(typeof resolveExamLang === 'function' ? resolveExamLang(null, S.subject) : S.subject)
    : { translatePassage: 'Translate passage' };
  const trLabel = ui.translatePassage || 'Translate passage';
  return `<div class="textos-toolbar">` +
    `<button type="button" class="btn-sm" id="passBtn_${blockId}" onclick="translatePassage('${blockId}')">${esc(trLabel)}</button>` +
    `<button type="button" class="btn-sm" onclick="loadTextosPassage()">${esc(vt?.textosAnotherText || 'Another text')}</button>` +
    `</div>` +
    `<div class="passage-translation" id="passTrans_${blockId}" style="display:none;margin-top:10px;padding:12px;background:var(--surface2,rgba(127,127,127,.08));border-radius:8px;font-size:14px;line-height:1.65"></div>`;
}

function textosReaderBodyHtml(data) {
  const reading = data.reading || {};
  const blockId = 'textos_passage_0';
  const title = reading.title ? `<h2 class="textos-passage-title">${esc(reading.title)}</h2>` : '';
  const subtitle = reading.subtitle ? `<p class="textos-passage-subtitle">${esc(reading.subtitle)}</p>` : '';
  const body = typeof formatReadableText === 'function'
    ? formatReadableText(reading.passageText, blockId, true)
    : esc(reading.passageText || '').replace(/\n/g, '<br>');
  const meta = `<p class="note textos-meta">${esc(data.topicTag || '')}${data.teil ? ` · Teil ${data.teil}` : ''}${reading.wordCount ? ` · ${reading.wordCount} words` : ''}</p>`;
  return `${title}${subtitle}${meta}<div class="textos-passage-body exam-passage">${body}</div>${textosReaderToolbarHtml(blockId)}`;
}

function renderTextosHubHtml(goal) {
  const vt = textosUi();
  const back = typeof renderNavBackBtn === 'function' ? renderNavBackBtn(vt?.vocabulary || 'Vocabulary') : '';
  const header = `<h1 class="exam-config-h1">${esc(vt?.textosTitle || 'Texts')}</h1><p class="exam-config-lede">${esc(vt?.textosDesc || 'Pick a topic · read-only · tap words to translate')}</p>`;
  let body = textosTopicPickerHtml(goal);
  if (_vocabHub.textosLoading) {
    body += `<p class="note" style="margin-top:16px">${esc(vt?.textosLoading || 'Loading passage…')}</p>`;
  } else if (_vocabHub.textosError && !_vocabHub.textosPayload) {
    const msg = _vocabHub.textosError === 'textos_no_match'
      ? (vt?.textosNoMatchRetry || 'No texts for this topic yet — try another.')
      : (vt?.textosLoadError || 'Could not load a text. Try again in a moment.');
    body += `<p class="note" style="margin-top:16px;color:var(--text-muted)">${esc(msg)}</p>`;
  } else if (_vocabHub.textosPayload?.reading) {
    body += `<div class="ws-panel textos-reader-panel">${textosReaderBodyHtml(_vocabHub.textosPayload)}</div>`;
  } else if (_vocabHub.textosTopic) {
    body += `<p class="note" style="margin-top:16px">${esc(vt?.textosSelectTopic || 'Select a topic above to load a passage.')}</p>`;
  } else {
    body += `<p class="note" style="margin-top:16px">${esc(vt?.textosChooseTopic || 'Choose a topic to start reading.')}</p>`;
  }
  return `<div class="vv-panel vv-panel--textos">${back}${header}<div class="ws-panel">${body}</div></div>`;
}

function exitTextosHub() {
  clearVocabHubTextosMode();
  if (typeof refreshVocabHubPanel === 'function') refreshVocabHubPanel();
}

window.launchVocabHubTextos = launchVocabHubTextos;
window.selectTextosTopic = selectTextosTopic;
window.loadTextosPassage = loadTextosPassage;
window.renderTextosHubHtml = renderTextosHubHtml;
window.clearVocabHubTextosMode = clearVocabHubTextosMode;
window.exitTextosHub = exitTextosHub;
window.textosSupportedForGoal = textosSupportedForGoal;
