/**
 * Pro Sprechen: realtime AI conversation UI (scaffold).
 * Wire OpenAI Realtime / WebRTC in startSession() when ready.
 */
const SpeakingConversation = (() => {
  const _state = Object.create(null);

  function personalities(ui) {
    return SpeakingModes?.REALTIME_PERSONALITIES || [];
  }

  function partKey(part) {
    return part.fieldId || `speak_bp_${part.teil || 1}`;
  }

  function stateFor(part) {
    const k = partKey(part);
    if (!_state[k]) {
      _state[k] = { personaId: 'balanced', inputMode: 'realtime', sessionId: null, transcript: '', turns: [] };
    }
    return _state[k];
  }

  function renderPartShell(part, ui) {
    const k = partKey(part);
    const de = ui?.lang === 'de';
    const personas = personalities(ui);
    const st = stateFor(part);
    const pills = personas
      .map((p) => {
        const active = st.personaId === p.id ? ' active' : '';
        const lbl = de ? p.labelDe : p.label;
        return `<button type="button" class="speak-persona-pill${active}" data-persona="${esc(p.id)}" onclick="SpeakingConversation.selectPersona('${esc(k)}','${esc(p.id)}')">${esc(lbl)}</button>`;
      })
      .join('');

    const persona = SpeakingModes?.personalityById(st.personaId);
    const personaDesc = persona ? (de ? persona.descDe : persona.desc) : '';

    return `
      <div class="speak-mode-banner speak-mode-banner--pro">
        <b>${de ? 'Sprechen (Pro)' : 'Speaking (Pro)'}:</b>
        ${de ? 'Wähle einen Gesprächspartner und starte ein Live-Gespräch — wie ChatGPT Voice.' : 'Pick a partner style and start a live conversation — like ChatGPT voice.'}
      </div>
      <div class="speak-persona-picker" role="group" aria-label="${de ? 'Gesprächspartner' : 'Conversation partner'}">${pills}</div>
      <p class="speak-persona-desc" id="speakPersonaDesc_${esc(k)}">${esc(personaDesc)}</p>
      <div class="speak-conv-panel" id="speakConv_${esc(k)}">
        <div class="speak-conv-status" id="speakConvStatus_${esc(k)}">${de ? 'Partner-Stil gewählt. Live-Modus wird als Nächstes angebunden.' : 'Partner style selected. Live mode will connect in the next release.'}</div>
        <div class="speak-conv-transcript-live" id="speakConvLive_${esc(k)}"></div>
        <div class="speak-conv-actions">
          <button type="button" class="btn-sm accent" id="speakConvStart_${esc(k)}" onclick="SpeakingConversation.startSession('${esc(k)}')">${de ? 'Live-Gespräch starten' : 'Start live conversation'}</button>
          <button type="button" class="btn-sm" onclick="SpeakingConversation.showTranscriptFallback('${esc(k)}')">${de ? 'Stattdessen aufnehmen' : 'Record transcript instead'}</button>
        </div>
      </div>
      <div class="speak-conv-fallback" id="speakConvFallback_${esc(k)}" hidden>
        <div style="font-size:12px;color:var(--text-muted);margin:10px 0 7px">${ui.speakFmt}</div>
        ${typeof renderSpeakingMicHtml === 'function' ? renderSpeakingMicHtml(k, typeof S !== 'undefined' ? S.subject : ui?.lang || 'de') : ''}
      </div>
      <textarea class="speak-conv-meta" id="${esc(k)}_meta" aria-hidden="true" tabindex="-1"></textarea>
    `;
  }

  function selectPersona(fieldId, personaId) {
    const st = _state[fieldId];
    if (!st) return;
    st.personaId = personaId;
    const root = document.querySelector(`.speak-part[data-field-id="${fieldId}"]`);
    if (root) {
      root.querySelectorAll('.speak-persona-pill').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.persona === personaId);
      });
    }
    const persona = SpeakingModes?.personalityById(personaId);
    const descEl = document.getElementById('speakPersonaDesc_' + fieldId);
    if (descEl && persona) {
      const de = typeof S !== 'undefined' && S.subject === 'de';
      descEl.textContent = de ? persona.descDe : persona.desc;
    }
    syncMeta(fieldId);
  }

  function syncMeta(fieldId) {
    const st = _state[fieldId];
    const meta = document.getElementById(fieldId + '_meta');
    if (!meta || !st) return;
    meta.value = JSON.stringify({
      inputMode: st.inputMode,
      personaId: st.personaId,
      sessionId: st.sessionId,
      transcript: st.transcript,
      turns: st.turns,
    });
    if (typeof updProg === 'function') updProg();
  }

  function showTranscriptFallback(fieldId) {
    const st = _state[fieldId];
    if (st) st.inputMode = SpeakingModes?.INPUT_MODES?.TRANSCRIPT || 'transcript';
    const fb = document.getElementById('speakConvFallback_' + fieldId);
    if (fb) {
      fb.hidden = false;
      if (typeof initSpeakingMic === 'function') initSpeakingMic(fieldId, S?.subject);
    }
    syncMeta(fieldId);
  }

  async function startSession(fieldId) {
    const st = _state[fieldId];
    if (!st) return;
    const status = document.getElementById('speakConvStatus_' + fieldId);
    const btn = document.getElementById('speakConvStart_' + fieldId);
    const persona = SpeakingModes?.personalityById(st.personaId);
    if (typeof isPaidPlan === 'function' && !isPaidPlan()) {
      if (typeof requireProOnlyAction === 'function') requireProOnlyAction('speaking_realtime');
      return;
    }
    if (typeof requireAiCredits === 'function' && !requireAiCredits('speaking_realtime')) return;

    if (status) status.textContent = S?.subject === 'de' ? 'Verbinde…' : 'Connecting…';
    if (btn) btn.disabled = true;

    try {
      const res = await lcFetch(SpeakingModes?.REALTIME_SESSION?.endpoint || '/.netlify/functions/speaking-realtime-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: st.personaId,
          verbosity: persona?.verbosity,
          subject: S?.subject,
          level: S?.level,
          examId: S?.examData?.examId || S?.examData?.id,
          fieldId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error === 'not_implemented') {
        if (status) {
          status.textContent =
            S?.subject === 'de'
              ? 'Live-Gespräch kommt bald. Nutze vorerst „Stattdessen aufnehmen“ oder warte auf das Update.'
              : 'Live conversation coming soon. Use “Record transcript instead” for now.';
        }
        if (typeof lcToast === 'function') {
          lcToast(
            S?.subject === 'de'
              ? 'Realtime-Sprechen ist vorbereitet, aber noch nicht verbunden.'
              : 'Realtime speaking is scaffolded but not connected yet.',
            'info',
          );
        }
        return;
      }
      st.sessionId = data.sessionId || null;
      syncMeta(fieldId);
      if (status) status.textContent = S?.subject === 'de' ? 'Verbunden — sprich jetzt.' : 'Connected — speak now.';
    } catch (e) {
      if (status) status.textContent = S?.subject === 'de' ? 'Verbindung fehlgeschlagen.' : 'Connection failed.';
      if (typeof lcToast === 'function') lcToast(String(e.message || e), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function initPart(part, subject) {
    stateFor(part);
    syncMeta(partKey(part));
  }

  function collectPartAnswer(part) {
    const k = partKey(part);
    const st = _state[k];
    const fb = document.getElementById('speakConvFallback_' + k);
    const useFallback = fb && !fb.hidden;
    if (useFallback || st?.inputMode === (SpeakingModes?.INPUT_MODES?.TRANSCRIPT || 'transcript')) {
      const ta = document.getElementById(k);
      return {
        fieldId: k,
        inputMode: SpeakingModes?.INPUT_MODES?.TRANSCRIPT || 'transcript',
        personaId: st?.personaId,
        transcript: ta?.value?.trim() || '',
      };
    }
    return {
      fieldId: k,
      inputMode: SpeakingModes?.INPUT_MODES?.REALTIME || 'realtime',
      personaId: st?.personaId,
      sessionId: st?.sessionId,
      transcript: st?.transcript || '',
      turns: st?.turns || [],
    };
  }

  return {
    renderPartShell,
    selectPersona,
    showTranscriptFallback,
    startSession,
    initPart,
    initForExam(parts, subject) {
      (parts || []).forEach((p) => initPart(p, subject));
    },
    collectPartAnswer,
  };
})();

if (typeof window !== 'undefined') window.SpeakingConversation = SpeakingConversation;
