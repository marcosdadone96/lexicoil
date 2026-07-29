/**
 * Sprechen tier router: free/transcript vs Pro partner chat (T1 + T3).
 * Kim/Alex/Leo turn-based + voice chat on Teil 1 (planning) and Teil 3 (feedback).
 * Teil 2 (presentation) = transcript only — partner listens in the real exam.
 */
const SpeakingFlow = (() => {
  function isDe(ui) {
    return ui?.lang === 'de';
  }

  function examLevel(part) {
    return String(
      part?.level || (typeof S !== 'undefined' && S.level ? S.level : '') || '',
    ).toUpperCase();
  }

  /** B1 (and legacy) T2 = solo Präsentation; B2 T2 = Diskussion with partner. */
  function isSoloPresentationTeil(part) {
    const teil = Number(part?.teil);
    if (teil !== 2) return false;
    return examLevel(part) !== 'B2';
  }

  /** Partner personalities (Kim/Alex/Leo) on Goethe Sprechen paired Teile. */
  function isPartnerTeil(part) {
    const teil = Number(part?.teil);
    if (examLevel(part) === 'B2') return teil === 1 || teil === 2;
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
      if (isSoloPresentationTeil(part)) {
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

  /** Shared Aufgabe chrome for all Sprechen Teile / levels (A2 cards, B1 bullets, T2 slides, A2 T3 agendas). */
  function renderSprechenBriefing(briefing, part, ui) {
    const de = isDe(ui);
    const layout = briefing.layout || 'none';
    const bullets = briefing.bullets || [];
    const slides = briefing.slides?.length ? briefing.slides : part.slides || [];
    const items = briefing.items || [];
    const agendas = briefing.agendas || [];

    let h = '<div class="sprechen-briefing">';
    const intro = briefing.intro || part.situation || '';
    if (intro) {
      h += `<div class="sprechen-briefing-intro">${esc(intro)}</div>`;
    }

    if (part.cardText) {
      h += `<div class="off-card-scene speak-brief-item"><b>${ui.card}</b> ${esc(part.cardText)}</div>`;
    }
    if (part.photoDescriptions?.length) {
      h += `<div class="off-photos">${part.photoDescriptions.map((p) => `<div class="off-ad">${esc(p)}</div>`).join('')}</div>`;
    }

    if (layout === 'cards' && items.length) {
      const lbl = briefing.sectionLabel || (de ? 'Karten' : 'Cards');
      h += `<div class="speak-brief-section-label">${esc(lbl)}</div>`;
      h += `<div class="speak-brief-cards">${items
        .map((it) => {
          const title = it.label
            ? `<b class="speak-brief-card-title">${esc(it.label)}</b> `
            : '';
          return `<div class="speak-brief-item speak-point">${title}${esc(it.text || '')}</div>`;
        })
        .join('')}</div>`;
    } else if (layout === 'agenda' && agendas.length) {
      h += `<div class="speak-brief-agendas">${agendas
        .map(
          (ag) =>
            `<div class="speak-brief-agenda"><div class="speak-brief-agenda-title">${esc(ag.title || '')}</div><ul class="speak-brief-agenda-lines">${(ag.lines || [])
              .map((line) => `<li>${esc(line)}</li>`)
              .join('')}</ul></div>`,
        )
        .join('')}</div>`;
    } else if (slides.length) {
      const ptsLabel = de ? 'Punkte zum Besprechen' : 'Points to cover';
      h += `<div class="speak-points-label">${esc(ptsLabel)}</div>`;
      h += `<div class="speak-points speak-slides speak-brief-slides">${slides
        .map(
          (s) =>
            `<div class="speak-brief-item speak-point"><b>${esc(String(s.n ?? ''))}.</b> ${esc(s.title || s.text || '')}</div>`,
        )
        .join('')}</div>`;
    } else if (bullets.length) {
      const ptsLabel = de ? 'Punkte zum Besprechen' : 'Points to cover';
      h += `<div class="speak-points-label">${esc(ptsLabel)}</div><div class="speak-points speak-brief-slides speak-brief-bullets">${bullets.map((p) => `<div class="speak-brief-item speak-point">${esc(p)}</div>`).join('')}</div>`;
    }

    if (briefing.outro) {
      h += `<div class="sprechen-briefing-outro">${esc(briefing.outro)}</div>`;
    }
    h += '</div>';
    return h;
  }

  function renderSoloSpeakPath(part, ui) {
    const de = isDe(ui);
    const teil = Number(part?.teil);
    let hint = ui.speakFmt || '';
    if (isSoloPresentationTeil(part)) {
      hint = de
        ? 'Einzelpräsentation — sprich ins Mikrofon oder tippe dein Transkript (kein KI-Partner).'
        : 'Individual presentation — speak or type your transcript (no AI partner).';
    } else if (de && examLevel(part) === 'B2' && Number(part?.teil) === 2) {
      hint = 'Diskussion — sprich ins Mikrofon oder tippe dein Transkript (Free). Pro: Gespräch mit Partner/in.';
    }
    return `
      <div class="speak-path speak-path--solo speak-path--only">
        <div class="speak-path-head">${de ? 'Nur Aufnahme' : 'Record only'}</div>
        <p class="speak-path-hint">${esc(hint)}</p>
        ${renderTranscriptInput(part, ui)}
      </div>`;
  }

  function isRedundantSprechenPartTitle(title, teilNum) {
    const t = String(title || '').trim();
    const n = String(teilNum ?? '').trim();
    if (!t || !n) return false;
    return new RegExp(`^(teil|sprechen|speaking|part)\\s*${n}\\s*$`, 'i').test(t);
  }

  /** Shared module-tag line for all Sprechen Teile / levels (A2, B1, B2, …). */
  function sprechenPartModuleTag(part, ui) {
    const modLabel = ui?.speaking || 'Sprechen';
    const teilLabel = ui?.teil || 'Teil';
    const teilNum = part?.teil ?? '';
    let line = `${modLabel} — ${teilLabel} ${teilNum}`;
    const title = String(part?.title || '').trim();
    if (title && !isRedundantSprechenPartTitle(title, teilNum)) {
      line += `: ${title}`;
    }
    if (part?.dauer) line += ` · ${part.dauer}`;
    return line;
  }

  function renderGoetheSprechenPart(part, ui) {
    const briefing =
      typeof SprechenBriefing !== 'undefined'
        ? SprechenBriefing.briefingForPart(part)
        : {
            intro: part.situation || '',
            bullets: part.points || part.prompts || [],
            slides: part.slides || [],
            layout: 'none',
            items: [],
            agendas: [],
            outro: '',
          };
    const tagLine = sprechenPartModuleTag(part, ui);
    const usePartner = shouldRenderPartnerShell(part);
    const mode = usePartner
      ? SpeakingModes?.INPUT_MODES?.PARTNER || 'partner'
      : SpeakingModes?.INPUT_MODES?.TRANSCRIPT || 'transcript';

    let h = `<section class="module-wrap speak-part" data-speak-mode="${mode}" data-field-id="${esc(part.fieldId || '')}" data-teil="${esc(String(part.teil ?? ''))}"><div class="module-tag tag-sprechen">${esc(tagLine)}</div>`;
    h += renderSprechenBriefing(briefing, part, ui);

    if (usePartner) {
      h += SpeakingConversation.renderPartShell(part, ui);
    } else {
      h += renderSoloSpeakPath(part, ui);
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
    isRedundantSprechenPartTitle,
    sprechenPartModuleTag,
    renderSprechenBriefing,
    renderSoloSpeakPath,
    renderGoetheSprechenPart,
    initForExam,
    collectPartAnswer,
  };
})();

if (typeof window !== 'undefined') window.SpeakingFlow = SpeakingFlow;
