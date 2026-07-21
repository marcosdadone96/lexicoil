/**
 * Sprechen T1/T3 voice UI (Gemini Live pilot) — transcript only, no audio storage.
 */
const SpeakingLiveVoice = (() => {
  const _clients = Object.create(null);
  const _state = Object.create(null);

  function endpoint() {
    return SpeakingModes?.REALTIME_SESSION?.endpoint || '/.netlify/functions/speaking-realtime-session';
  }

  function fmtMs(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function renderPanel(fieldId, ui) {
    const de = ui?.lang === 'de';
    const k = esc(fieldId);
    return `
      <div class="speak-live-voice" id="speakLiveVoice_${k}" hidden>
        <div class="speak-live-status" id="speakLiveStatus_${k}">${de ? 'Partner wählen und Stimme starten.' : 'Pick a partner and start voice.'}</div>
        <div class="speak-live-timer" id="speakLiveTimer_${k}">—:—</div>
        <div class="speak-live-transcript" id="speakLiveTranscript_${k}"></div>
        <div class="speak-live-actions">
          <button type="button" class="btn-sm accent" id="speakLiveStart_${k}" onclick="SpeakingLiveVoice.start('${k}')">${de ? 'Stimme starten' : 'Start voice'}${typeof aiCreditCostSuffix==='function'?aiCreditCostSuffix('speaking_realtime'):' (4 credits)'}</button>
          <button type="button" class="btn-sm speak-live-ptt" id="speakLivePtt_${k}" disabled>${de ? 'Gedrückt halten zum Sprechen' : 'Hold to speak'}</button>
          <button type="button" class="btn-sm" id="speakLiveEnd_${k}" style="display:none" onclick="SpeakingLiveVoice.end('${k}')">${de ? 'Beenden' : 'End'}</button>
        </div>
        <p class="speak-live-hint">${de ? 'Pilot: Echtzeit-Gespräch mit Stimme. Kein Audio wird gespeichert — nur das Transkript.' : 'Pilot: real-time voice chat. No audio is stored — transcript only.'}</p>
      </div>`;
  }

  function bindPtt(fieldId) {
    const btn = document.getElementById('speakLivePtt_' + fieldId);
    if (!btn || btn.dataset.pttBound) return;
    btn.dataset.pttBound = '1';
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      _clients[fieldId]?.startPtt();
      btn.classList.add('recording');
    });
    const release = () => {
      _clients[fieldId]?.endPtt();
      btn.classList.remove('recording');
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
  }

  function renderTranscript(fieldId, turns, de) {
    const el = document.getElementById('speakLiveTranscript_' + fieldId);
    if (!el) return;
    if (!turns?.length) {
      el.textContent = '';
      return;
    }
    const userLabel = de ? 'Du' : 'You';
    el.innerHTML = turns
      .map((t) => {
        const who = t.role === 'partner' ? 'Partner' : userLabel;
        const cls = t.role === 'partner' ? 'speak-turn--partner' : 'speak-turn--user';
        return `<div class="speak-turn ${cls}"><b>${esc(who)}:</b> ${esc(t.text || '')}</div>`;
      })
      .join('');
  }

  function syncToConversation(fieldId, turns, sessionId, de) {
    if (typeof SpeakingConversation === 'undefined') return;
    const transcript = SpeakingLiveClient.formatTranscriptForEval(turns, de);
    SpeakingConversation.setLiveVoiceResult(fieldId, {
      sessionId,
      turns,
      transcript,
      inputMode: SpeakingModes?.INPUT_MODES?.VOICE_LIVE || 'voice_live',
    });
  }

  function mintErrorMessage(data, de) {
    const code = data.code || data.error || '';
    if (code === 'tls_proxy_blocked' || /TLS|use-system-ca|antivirus|fetch failed/i.test(data.message || '')) {
      return de
        ? 'Gemini blockiert (Antivirus/TLS). Server stoppen und neu starten mit: npm run dev'
        : 'Gemini blocked (antivirus/TLS). Stop the server and restart with: npm run dev';
    }
    if (code === 'gemini_key_missing') {
      return de
        ? 'GEMINI_API_KEY fehlt in .env — eintragen und Server neu starten.'
        : 'GEMINI_API_KEY missing in .env — add it and restart the server.';
    }
    if (/API key not valid|invalid api key/i.test(data.message || '')) {
      return de
        ? 'Gemini-API-Key ungültig. Prüfe GEMINI_API_KEY in .env (nicht der Netlify-Dashboard-Wert). Server neu starten: npm run dev'
        : 'Invalid Gemini API key. Check GEMINI_API_KEY in .env (not the Netlify dashboard value). Restart: npm run dev';
    }
    if (code === 'ephemeral_mint_failed') {
      return de
        ? `Gemini-Verbindung fehlgeschlagen: ${data.message || 'Netzwerk'}`
        : `Gemini connection failed: ${data.message || 'network'}`;
    }
    return data.message || data.error || (de ? 'Unbekannter Fehler' : 'Unknown error');
  }

  async function start(fieldId) {
    const st = _state[fieldId];
    if (!st) return;
    const de = typeof S !== 'undefined' && S.subject === 'de';

    if (typeof SpeakingVoiceConsent !== 'undefined') {
      const ok = await SpeakingVoiceConsent.requestConsent(de);
      if (!ok) return;
    }

    if (typeof isPaidPlan === 'function' && !isPaidPlan()) {
      if (typeof requireProOnlyAction === 'function') requireProOnlyAction('speaking_realtime');
      return;
    }
    if (typeof requireAiCredits === 'function' && !requireAiCredits('speaking_realtime')) return;

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {
        /* ignore */
      }
    }

    const status = document.getElementById('speakLiveStatus_' + fieldId);
    const startBtn = document.getElementById('speakLiveStart_' + fieldId);
    const endBtn = document.getElementById('speakLiveEnd_' + fieldId);
    const pttBtn = document.getElementById('speakLivePtt_' + fieldId);
    if (status) status.textContent = de ? 'Starte Stimme…' : 'Starting voice…';
    if (startBtn) startBtn.disabled = true;

    try {
      const res = await lcFetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          consent: true,
          personaId: st.personaId,
          situation: st.situation,
          teil: st.teil,
          fieldId,
          examId: S?.examData?.examId || S?.examData?.id,
          subject: S?.subject,
          level: S?.level,
          mode: S?.mode === 'practice' ? 'practice' : 'exam',
          requestId: `speak-live-${fieldId}-${Date.now()}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data.error === 'pilot_not_eligible'
            ? de
              ? 'Stimme-Pilot nicht verfügbar für dieses Konto.'
              : 'Voice pilot not available for this account.'
            : mintErrorMessage(data, de);
        if (typeof lcToast === 'function') lcToast(msg, 'error');
        if (status) status.textContent = de ? 'Start fehlgeschlagen.' : 'Could not start.';
        return;
      }

      st.sessionId = data.session?.sessionId || null;
      const client = SpeakingLiveClient.create({
        session: data.session,
        ephemeral: data.ephemeral,
        onTurns: (turns) => {
          st.turns = turns;
          renderTranscript(fieldId, turns, de);
          syncToConversation(fieldId, turns, st.sessionId, de);
        },
        onPhase: (phase) => {
          if (phase === 'your-turn' && status)
            status.textContent = de ? 'Dein Zug — gedrückt halten zum Sprechen.' : 'Your turn — hold to speak.';
          if (phase === 'partner' && status)
            status.textContent = de ? 'Partner spricht… (Gemini Live)' : 'Partner is speaking… (Gemini Live)';
          if (phase === 'done' && status) status.textContent = de ? 'Sitzung beendet.' : 'Session ended.';
          if (pttBtn) pttBtn.disabled = phase !== 'your-turn' && phase !== 'connected';
        },
        onTimer: (msLeft) => {
          const t = document.getElementById('speakLiveTimer_' + fieldId);
          if (t) {
            t.textContent = fmtMs(msLeft);
            t.classList.toggle('warn', msLeft < 30000);
          }
        },
        onError: (err) => {
          if (typeof lcToast === 'function') lcToast(err, 'warn');
        },
      });

      _clients[fieldId] = client;
      bindPtt(fieldId);
      await client.connect();

      const tel = client.getTelemetry?.() || {};
      if (tel.geminiLiveConnected && typeof lcToast === 'function') {
        lcToast(de ? 'Gemini Live verbunden.' : 'Gemini Live connected.', 'ok');
      }

      if (endBtn) endBtn.style.display = 'inline-flex';
      if (pttBtn) pttBtn.disabled = false;
      if (status) status.textContent = de ? 'Verbunden — Gespräch läuft.' : 'Connected — conversation live.';
    } catch (e) {
      if (typeof lcToast === 'function') lcToast(String(e.message || e), 'error');
      if (status) status.textContent = de ? 'Verbindung fehlgeschlagen.' : 'Connection failed.';
    } finally {
      if (startBtn) startBtn.disabled = false;
    }
  }

  async function end(fieldId) {
    const client = _clients[fieldId];
    const st = _state[fieldId];
    if (!client || !st?.sessionId) return;
    const de = typeof S !== 'undefined' && S.subject === 'de';
    const status = document.getElementById('speakLiveStatus_' + fieldId);

    client.softClose('manual');
    if (status) status.textContent = de ? 'Wird gespeichert…' : 'Saving…';

    await new Promise((r) => setTimeout(r, 8500));

    const turns = client.getTurns();
    const telemetry = client.getTelemetry?.() || {};
    if (telemetry.pcmBytesOut === 0 && typeof lcToast === 'function') {
      lcToast(
        de
          ? 'Kein Partner-Audio von Gemini empfangen — prüfe Konsole/Netzwerk.'
          : 'No partner audio received from Gemini — check console/network.',
        'warn',
      );
    }
    try {
      const res = await lcFetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize',
          sessionId: st.sessionId,
          turns,
          closeReason: 'manual',
          pcmBytesIn: telemetry.pcmBytesIn ?? null,
          pcmBytesOut: telemetry.pcmBytesOut ?? null,
          usageMetadata: telemetry.usageMetadata ?? null,
          geminiLiveConnected: telemetry.geminiLiveConnected ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.session?.turns) {
        st.turns = data.session.turns;
        renderTranscript(fieldId, st.turns, de);
        syncToConversation(fieldId, st.turns, st.sessionId, de);
      } else {
        syncToConversation(fieldId, turns, st.sessionId, de);
      }
    } catch (_) {
      syncToConversation(fieldId, turns, st.sessionId, de);
    }

    client.destroy();
    delete _clients[fieldId];
    if (status) status.textContent = de ? 'Fertig — Transkript gespeichert.' : 'Done — transcript saved.';
    const pttBtn = document.getElementById('speakLivePtt_' + fieldId);
    if (pttBtn) pttBtn.disabled = true;
  }

  function initPart(fieldId, part, personaId) {
    _state[fieldId] = {
      personaId: personaId || 'balanced',
      situation: part?.situation || '',
      teil: Number(part?.teil) || 1,
      sessionId: null,
      turns: [],
    };
    bindPtt(fieldId);
  }

  function setPersona(fieldId, personaId) {
    if (_state[fieldId]) _state[fieldId].personaId = personaId;
  }

  function showPanel(fieldId) {
    const el = document.getElementById('speakLiveVoice_' + fieldId);
    if (el) el.hidden = false;
  }

  function hidePanel(fieldId) {
    const el = document.getElementById('speakLiveVoice_' + fieldId);
    if (el) el.hidden = true;
  }

  return { renderPanel, initPart, setPersona, showPanel, hidePanel, start, end };
})();

if (typeof window !== 'undefined') window.SpeakingLiveVoice = SpeakingLiveVoice;
