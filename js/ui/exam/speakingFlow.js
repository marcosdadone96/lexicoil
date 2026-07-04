/**
 * Sprechen tier router: free transcript path vs Pro realtime conversation (scaffold).
 */
const SpeakingFlow = (() => {
  function isDe(ui) {
    return ui?.lang === 'de';
  }

  function canUseRealtimeConversation() {
    if (typeof isPaidPlan !== 'function' || !isPaidPlan()) return false;
    if (typeof hasAiCreditsFor === 'function' && !hasAiCreditsFor('speaking_realtime')) return false;
    if (typeof Auth !== 'undefined' && Auth.isGuest && Auth.isGuest()) return false;
    return true;
  }

  function getInputMode() {
    return canUseRealtimeConversation()
      ? SpeakingModes?.INPUT_MODES?.REALTIME || 'realtime'
      : SpeakingModes?.INPUT_MODES?.TRANSCRIPT || 'transcript';
  }

  function freeBannerHtml(ui) {
    const de = isDe(ui);
    return `<div class="speak-mode-banner speak-mode-banner--free"><b>${de ? 'Sprechen (Free)' : 'Speaking (Free)'}:</b> ${de ? 'Sprich ins Mikrofon — dein Text erscheint unten. Nach dem Examen korrigiert die KI deine Antwort.' : 'Speak into the mic — your words fill the box below. AI correction runs after you submit.'} ${de ? '<span class="speak-mode-upgrade">Pro: Live-Gespräch mit KI-Partner (3 Stile).</span>' : '<span class="speak-mode-upgrade">Pro: live AI partner conversation (3 styles).</span>'}</div>`;
  }

  function renderTranscriptInput(part, ui) {
    const fid = part.fieldId || `speak_bp_${part.teil || 1}`;
    if (typeof renderSpeakingMicHtml === 'function') {
      return renderSpeakingMicHtml(fid, typeof S !== 'undefined' ? S.subject : ui?.lang || 'de');
    }
    const ph = ui?.me || 'Ich:';
    return `<textarea class="write-field" id="${fid}" style="min-height:160px" placeholder="${ph}" oninput="typeof updProg==='function'&&updProg()"></textarea>`;
  }

  function renderGoetheSprechenPart(part, ui) {
    const pts = part.points || part.prompts || [];
    const slides = part.slides || [];
    const modLabel = ui.speaking;
    const teilLabel = ui.teil;
    const mode = getInputMode();
    const useRealtime =
      mode === (SpeakingModes?.INPUT_MODES?.REALTIME || 'realtime') &&
      typeof SpeakingConversation !== 'undefined';

    let h = `<section class="module-wrap speak-part" data-speak-mode="${mode}" data-field-id="${esc(part.fieldId || '')}"><div class="module-tag tag-sprechen">${modLabel} — ${teilLabel} ${part.teil}: ${esc(part.title || '')}${part.dauer ? ' · ' + esc(part.dauer) : ''}</div><div class="off-instr">${esc(part.situation || '')}</div>`;

    if (part.cardText) {
      h += `<div class="off-card-scene"><b>${ui.card}</b> ${esc(part.cardText)}</div>`;
    }
    if (part.photoDescriptions?.length) {
      h += `<div class="off-photos">${part.photoDescriptions.map((p) => `<div class="off-ad">${esc(p)}</div>`).join('')}</div>`;
    }
    if (slides.length) {
      h += `<div class="speak-points speak-slides">${slides.map((s) => `<div class="speak-point"><b>${esc(String(s.n ?? ''))}.</b> ${esc(s.title || s.text || '')}</div>`).join('')}</div>`;
    } else if (pts.length) {
      h += `<div class="speak-points">${pts.map((p) => `<div class="speak-point">${esc(p)}</div>`).join('')}</div>`;
    }

    if (useRealtime) {
      h += SpeakingConversation.renderPartShell(part, ui);
    } else {
      h += freeBannerHtml(ui);
      h += `<div style="font-size:12px;color:var(--text-muted);margin-bottom:7px">${ui.speakFmt}</div>`;
      h += renderTranscriptInput(part, ui);
    }

    h += '</section><hr class="section-div">';
    return h;
  }

  function initForExam(examData, subject) {
    const parts = examData?.sprechenParts || [];
    parts.forEach((p) => {
      const mode = p._speakInputMode || getInputMode();
      if (mode === (SpeakingModes?.INPUT_MODES?.REALTIME || 'realtime') && typeof SpeakingConversation !== 'undefined') {
        SpeakingConversation.initPart(p, subject);
      } else if (p.fieldId && typeof initSpeakingMic === 'function') {
        initSpeakingMic(p.fieldId, subject);
      }
    });
    if (examData?.sprechen && typeof initSpeakingMic === 'function') {
      initSpeakingMic('speakAns', subject);
    }
  }

  function collectPartAnswer(part) {
    if (typeof SpeakingConversation !== 'undefined' && SpeakingConversation.collectPartAnswer) {
      const conv = SpeakingConversation.collectPartAnswer(part);
      if (conv?.transcript) return conv;
    }
    const fid = part.fieldId || `speak_bp_${part.teil || 1}`;
    const ta = document.getElementById(fid);
    return {
      fieldId: fid,
      inputMode: SpeakingModes?.INPUT_MODES?.TRANSCRIPT || 'transcript',
      transcript: ta?.value?.trim() || '',
    };
  }

  return {
    canUseRealtimeConversation,
    getInputMode,
    renderGoetheSprechenPart,
    initForExam,
    collectPartAnswer,
  };
})();

if (typeof window !== 'undefined') window.SpeakingFlow = SpeakingFlow;
