/**
 * Sprechen tier router: free/transcript vs Pro partner chat (T1 + T3).
 * Kim/Alex/Leo turn-based + voice chat on Teil 1 (planning) and Teil 3 (feedback).
 * Teil 2 (presentation) = transcript only — partner listens in the real exam.
 */
const SpeakingFlow = (() => {
  function isDe(ui) {
    return ui?.lang === 'de';
  }

  /** Partner personalities (Kim/Alex/Leo) on Goethe Sprechen Teil 1 and Teil 3. */
  function isPartnerTeil(part) {
    const teil = Number(part?.teil);
    return teil === 1 || teil === 3;
  }

  function canUseRealtimeConversation() {
    if (typeof isPaidPlan !== 'function' || !isPaidPlan()) return false;
    if (typeof hasAiCreditsFor === 'function' && !hasAiCreditsFor('speaking_realtime')) return false;
    if (typeof Auth !== 'undefined' && Auth.isGuest && Auth.isGuest()) return false;
    return true;
  }

  function getInputMode() {
    return canUseRealtimeConversation()
      ? SpeakingModes?.INPUT_MODES?.PARTNER || SpeakingModes?.INPUT_MODES?.REALTIME || 'partner'
      : SpeakingModes?.INPUT_MODES?.TRANSCRIPT || 'transcript';
  }

  /** Pro partner shell only when plan allows AND part is T1 or T3. */
  function shouldRenderPartnerShell(part) {
    if (!isPartnerTeil(part)) return false;
    if (!canUseRealtimeConversation()) return false;
    return typeof SpeakingConversation !== 'undefined';
  }

  function freeBannerHtml(ui) {
    const de = isDe(ui);
    return `<div class="speak-mode-banner speak-mode-banner--free"><b>${de ? 'Sprechen (Free)' : 'Speaking (Free)'}:</b> ${de ? 'Sprich ins Mikrofon — dein Text erscheint unten. Nach dem Examen korrigiert die KI deine Antwort (Credits).' : 'Speak into the mic — your words fill the box below. AI correction runs after you submit (credits).'} ${de ? '<span class="speak-mode-upgrade">Pro: Gespräch Zug um Zug mit Kim, Alex oder Leo (Teil 1 und 3).</span>' : '<span class="speak-mode-upgrade">Pro: turn-based chat with Kim, Alex or Leo (Parts 1 and 3).</span>'}</div>`;
  }

  function transcriptBannerHtml(ui, part) {
    const de = isDe(ui);
    const teil = Number(part?.teil);
    if (canUseRealtimeConversation()) {
      if (teil === 2) {
        return `<div class="speak-mode-banner"><b>${de ? 'Sprechen Teil 2' : 'Speaking Part 2'}:</b> ${de ? 'Einzelpräsentation — sprich oder tippe dein Transkript (kein Partner-Chat; der Partner hört nur zu).' : 'Individual presentation — speak or type your transcript (no partner chat; your partner only listens).'}</div>`;
      }
    }
    return freeBannerHtml(ui);
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
    const briefing =
      typeof SprechenBriefing !== 'undefined'
        ? SprechenBriefing.briefingForPart(part)
        : {
            intro: part.situation || '',
            bullets: part.points || part.prompts || [],
            slides: part.slides || [],
          };
    const displayIntro = briefing.intro || part.situation || '';
    const bullets = briefing.bullets || [];
    const slides = briefing.slides?.length ? briefing.slides : part.slides || [];
    const modLabel = ui.speaking;
    const teilLabel = ui.teil;
    const de = isDe(ui);
    const usePartner = shouldRenderPartnerShell(part);
    const mode = usePartner
      ? SpeakingModes?.INPUT_MODES?.PARTNER || 'partner'
      : SpeakingModes?.INPUT_MODES?.TRANSCRIPT || 'transcript';

    let h = `<section class="module-wrap speak-part" data-speak-mode="${mode}" data-field-id="${esc(part.fieldId || '')}" data-teil="${esc(String(part.teil ?? ''))}"><div class="module-tag tag-sprechen">${modLabel} — ${teilLabel} ${part.teil}: ${esc(part.title || '')}${part.dauer ? ' · ' + esc(part.dauer) : ''}</div><div class="off-instr">${esc(displayIntro)}</div>`;

    if (part.cardText) {
      h += `<div class="off-card-scene"><b>${ui.card}</b> ${esc(part.cardText)}</div>`;
    }
    if (part.photoDescriptions?.length) {
      h += `<div class="off-photos">${part.photoDescriptions.map((p) => `<div class="off-ad">${esc(p)}</div>`).join('')}</div>`;
    }
    if (slides.length) {
      h += `<div class="speak-points speak-slides">${slides.map((s) => `<div class="speak-point"><b>${esc(String(s.n ?? ''))}.</b> ${esc(s.title || s.text || '')}</div>`).join('')}</div>`;
    } else if (bullets.length) {
      const ptsLabel = de ? 'Punkte zum Besprechen' : 'Points to cover';
      h += `<div class="speak-points-label">${esc(ptsLabel)}</div><ul class="speak-points speak-points-list">${bullets.map((p) => `<li class="speak-point">${esc(p)}</li>`).join('')}</ul>`;
    }

    if (usePartner) {
      h += SpeakingConversation.renderPartShell(part, ui);
    } else {
      h += transcriptBannerHtml(ui, part);
      h += `<div style="font-size:12px;color:var(--text-muted);margin-bottom:7px">${ui.speakFmt}</div>`;
      h += renderTranscriptInput(part, ui);
    }

    h += '</section><hr class="section-div">';
    return h;
  }

  function initForExam(examData, subject) {
    const parts = examData?.sprechenParts || [];
    if (parts.some((p) => shouldRenderPartnerShell(p)) && typeof SpeakingVoicePilot !== 'undefined') {
      SpeakingVoicePilot.load();
    }
    parts.forEach((p) => {
      if (shouldRenderPartnerShell(p)) {
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
    isPartnerTeil,
    shouldRenderPartnerShell,
    renderGoetheSprechenPart,
    initForExam,
    collectPartAnswer,
  };
})();

if (typeof window !== 'undefined') window.SpeakingFlow = SpeakingFlow;
