/**
 * Explicit consent before first Sprechen voice (Gemini Live) session.
 * No audio retention — transcript-only pilot disclosure.
 */
const SpeakingVoiceConsent = (() => {
  const STORAGE_KEY = 'lc_sprech_voice_consent_v1';

  function hasConsent() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function saveConsent() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch (_) {
      /* ignore */
    }
  }

  function copy(de) {
    return de
      ? {
          title: 'Sprechen mit KI-Stimme',
          body:
            'LexiCoil sendet deine Stimme in Echtzeit an <strong>Google Gemini</strong>, damit du mit Kim, Alex oder Leo sprechen kannst. Wir speichern <strong>kein Audio</strong> — nur das Text-Transkript der Sitzung für die Bewertung (wie beim normalen Sprechen). Diese Funktion ist optional; du kannst weiter mit Text üben.',
          checkbox:
            'Ich willige ein, dass meine Stimme in Echtzeit an Google Gemini übermittelt wird, wie in der <a href="/privacy#sprechen-voice" target="_blank" rel="noopener">Datenschutzerklärung</a> beschrieben.',
          cancel: 'Abbrechen',
          accept: 'Zustimmen und starten',
        }
      : {
          title: 'Speaking with AI voice',
          body:
            'LexiCoil sends your voice in real time to <strong>Google Gemini</strong> so you can talk with Kim, Alex, or Leo. We do <strong>not store audio</strong> — only the text transcript of the session for evaluation (same as regular Sprechen). This is optional; you can keep using text instead.',
          checkbox:
            'I agree that my voice is sent in real time to Google Gemini, as described in the <a href="/privacy#sprechen-voice" target="_blank" rel="noopener">Privacy Policy</a>.',
          cancel: 'Cancel',
          accept: 'Agree and start',
        };
  }

  function ensureModal() {
    let el = document.getElementById('speakVoiceConsentModal');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'speakVoiceConsentModal';
    el.className = 'speak-voice-consent-modal';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="speak-voice-consent-backdrop" data-close="1"></div>
      <div class="speak-voice-consent-card" role="dialog" aria-modal="true" aria-labelledby="speakVoiceConsentTitle">
        <h3 id="speakVoiceConsentTitle"></h3>
        <p id="speakVoiceConsentBody"></p>
        <label class="speak-voice-consent-check" id="speakVoiceConsentLabel">
          <input type="checkbox" id="speakVoiceConsentCheck">
          <span id="speakVoiceConsentCheckText"></span>
        </label>
        <div class="speak-voice-consent-actions">
          <button type="button" class="btn-sm" id="speakVoiceConsentCancel"></button>
          <button type="button" class="btn-sm accent" id="speakVoiceConsentAccept" disabled></button>
        </div>
      </div>`;
    document.body.appendChild(el);
    return el;
  }

  /**
   * @returns {Promise<boolean>} true if user accepted
   */
  function requestConsent(de) {
    if (hasConsent()) return Promise.resolve(true);

    const t = copy(de);
    const modal = ensureModal();
    const title = document.getElementById('speakVoiceConsentTitle');
    const body = document.getElementById('speakVoiceConsentBody');
    const check = document.getElementById('speakVoiceConsentCheck');
    const checkText = document.getElementById('speakVoiceConsentCheckText');
    const btnCancel = document.getElementById('speakVoiceConsentCancel');
    const btnAccept = document.getElementById('speakVoiceConsentAccept');

    title.textContent = t.title;
    body.innerHTML = t.body;
    checkText.innerHTML = t.checkbox;
    btnCancel.textContent = t.cancel;
    btnAccept.textContent = t.accept;
    check.checked = false;
    btnAccept.disabled = true;

    modal.style.display = 'flex';

    return new Promise((resolve) => {
      function cleanup() {
        modal.style.display = 'none';
        check.removeEventListener('change', onCheck);
        btnCancel.removeEventListener('click', onCancel);
        btnAccept.removeEventListener('click', onAccept);
        modal.querySelector('[data-close]')?.removeEventListener('click', onCancel);
      }
      function onCheck() {
        btnAccept.disabled = !check.checked;
      }
      function onCancel() {
        cleanup();
        resolve(false);
      }
      function onAccept() {
        if (!check.checked) return;
        saveConsent();
        cleanup();
        resolve(true);
      }
      check.addEventListener('change', onCheck);
      btnCancel.addEventListener('click', onCancel);
      btnAccept.addEventListener('click', onAccept);
      modal.querySelector('[data-close]')?.addEventListener('click', onCancel);
    });
  }

  return { hasConsent, saveConsent, requestConsent, STORAGE_KEY };
})();

if (typeof window !== 'undefined') window.SpeakingVoiceConsent = SpeakingVoiceConsent;
