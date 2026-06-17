/**
 * HorenGame — listening mini-game for the "too few words / library can't satisfy"
 * case (the fallback when VocabBatching.shouldUseGame(...) is true).
 *
 * Mechanic: the player hears a RANDOM SUBSET of their target words (TTS, played
 * twice like a real Hören). Then they mark which words they heard. Scoring tells
 * them which words appeared and, crucially, "cuáles faltan" (which were absent).
 *
 * Cost: uses ONLY word-level TTS, which is tiny and cached server-side
 * (fetchTtsAudio → generateTtsAudio). If TTS is unavailable it falls back to the
 * browser's free speechSynthesis. No AI text generation. No persistent storage.
 *
 * Two layers:
 *   - Pure logic: buildRound / scoreRound (testable in Node, no DOM).
 *   - UI: mount(container, config, handlers) (browser only, guarded).
 */
const HorenGame = (() => {
  // ---------- pure logic ----------

  function uniq(words) {
    return [...new Set((words || []).map((w) => String(w || '').trim()).filter(Boolean))];
  }

  function shuffle(arr, rng) {
    const r = rng || Math.random;
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Build one round.
   * @returns { id, lang, targets, played[], absent[], sequence[] } or null if too few words.
   */
  function buildRound(words, opts = {}) {
    const targets = uniq(words);
    if (targets.length < 2) return null; // need at least one played + one absent
    const rng = opts.rng || Math.random;
    const ratio = typeof opts.playRatio === 'number' ? opts.playRatio : 0.6;
    const n = targets.length;
    // play between 1 and n-1 words, so there's always at least one "missing".
    let k = Math.round(ratio * n);
    k = Math.max(1, Math.min(n - 1, k));
    const order = shuffle(targets, rng);
    const played = order.slice(0, k);
    const absent = order.slice(k);
    return {
      id: 'hg_' + Date.now().toString(36) + '_' + Math.floor((rng() * 1e6)).toString(36),
      lang: opts.lang || 'de',
      targets,
      played,
      absent,
      sequence: shuffle(played, rng), // play order
    };
  }

  /**
   * Score the player's selections against a round.
   * @param selected words the player marked as "heard".
   */
  function scoreRound(round, selected) {
    const sel = new Set(uniq(selected));
    const playedSet = new Set(round.played);
    const detail = round.targets.map((w) => {
      const wasPlayed = playedSet.has(w);
      const marked = sel.has(w);
      let kind;
      if (wasPlayed && marked) kind = 'hit'; // correctly heard
      else if (wasPlayed && !marked) kind = 'missed'; // played but not marked
      else if (!wasPlayed && marked) kind = 'falseAlarm'; // marked but absent
      else kind = 'correctReject'; // absent and not marked
      return { word: w, wasPlayed, marked, correct: wasPlayed === marked, kind };
    });
    const correct = detail.filter((d) => d.correct).length;
    return {
      total: round.targets.length,
      correct,
      ratio: round.targets.length ? correct / round.targets.length : 0,
      heard: round.played, // appeared in the clip
      missing: round.absent, // "cuáles faltan"
      missedByUser: detail.filter((d) => d.kind === 'missed').map((d) => d.word),
      falseAlarms: detail.filter((d) => d.kind === 'falseAlarm').map((d) => d.word),
      detail,
    };
  }

  // ---------- audio ----------

  function voiceFor(lang) {
    if (typeof ttsVoiceForLang !== 'undefined') return ttsVoiceForLang(lang);
    const l = String(lang || 'de').slice(0, 2).toLowerCase();
    return l === 'es' ? 'es-ES' : l === 'en' ? 'en-GB' : 'de-DE';
  }

  function g(name) {
    if (typeof window !== 'undefined' && typeof window[name] === 'function') return window[name];
    try {
      // eslint-disable-next-line no-eval
      const fn = eval(name);
      return typeof fn === 'function' ? fn : null;
    } catch (_) {
      return null;
    }
  }

  function playBase64(audioBase64, mime) {
    return new Promise((resolve) => {
      try {
        const audio = new Audio(`data:${mime || 'audio/mpeg'};base64,${audioBase64}`);
        audio.onended = () => resolve(true);
        audio.onerror = () => resolve(false);
        audio.play().catch(() => resolve(false));
      } catch (_) {
        resolve(false);
      }
    });
  }

  function speak(text, lang) {
    return new Promise((resolve) => {
      try {
        if (typeof window === 'undefined' || !window.speechSynthesis) return resolve(false);
        const u = new SpeechSynthesisUtterance(String(text));
        u.lang = voiceFor(lang);
        u.rate = 0.95;
        u.onend = () => resolve(true);
        u.onerror = () => resolve(false);
        window.speechSynthesis.speak(u);
      } catch (_) {
        resolve(false);
      }
    });
  }

  /** Play a single word: cached TTS → generated TTS → browser voice. */
  async function playWord(word, lang) {
    const voice = voiceFor(lang);
    const fetchTts = g('fetchTtsAudio');
    if (fetchTts) {
      try {
        const cached = await fetchTts(word, voice, lang);
        if (cached && cached.audioBase64) return playBase64(cached.audioBase64, cached.mime);
      } catch (_) {
        /* fall through */
      }
    }
    const genTts = g('generateTtsAudio');
    if (genTts) {
      try {
        const gen = await genTts(word, voice, lang);
        if (gen && gen.audioBase64) return playBase64(gen.audioBase64, gen.mime);
      } catch (_) {
        /* fall through */
      }
    }
    return speak(word, lang);
  }

  // ---------- UI ----------

  const STR = {
    es: {
      title: 'Juego de escucha',
      intro: 'Escucharás algunas de tus palabras (dos veces, como en el examen). Marca las que oigas.',
      play: '▶ Reproducir',
      replay: '▶ Repetir (1 vez más)',
      playing: 'Reproduciendo…',
      check: 'Comprobar',
      again: 'Otra ronda',
      pickPrompt: '¿Qué palabras has oído?',
      heard: 'Aparecieron',
      missing: 'No aparecían (las que faltaban)',
      score: (c, t) => `Acertaste ${c} de ${t}`,
      tooFew: 'Necesitas al menos 2 palabras para jugar.',
    },
    en: {
      title: 'Listening game',
      intro: "You'll hear some of your words (twice, like the exam). Tick the ones you hear.",
      play: '▶ Play',
      replay: '▶ Play again (1 left)',
      playing: 'Playing…',
      check: 'Check',
      again: 'New round',
      pickPrompt: 'Which words did you hear?',
      heard: 'Appeared',
      missing: 'Were absent (the missing ones)',
      score: (c, t) => `You got ${c} of ${t}`,
      tooFew: 'You need at least 2 words to play.',
    },
  };

  function t(lang) {
    return String(lang || '').startsWith('es') ? STR.es : STR.en;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /**
   * Mount the game into a container element.
   * @param container DOM element (the screen/panel to fill)
   * @param config { words: string[], lang: 'de'|'en'|'es', level?, uiLang?: 'es'|'en' }
   * @param handlers { onComplete?(result, round), onExit?() }
   */
  function mount(container, config = {}, handlers = {}) {
    if (!container || typeof document === 'undefined') return null;
    const lang = config.lang || 'de';
    const ui = t(config.uiLang || (lang === 'es' ? 'es' : 'en'));
    const selected = new Set();
    let round = buildRound(config.words, { lang });
    let playsLeft = 2;
    let busy = false;
    let token = 0;

    if (!round) {
      container.innerHTML = `<div class="hg-wrap"><h3>${esc(ui.title)}</h3><p class="hg-muted">${esc(ui.tooFew)}</p></div>`;
      return { destroy() { token++; } };
    }

    function render(phase, result) {
      const chips = round.targets
        .map((w) => {
          const on = selected.has(w);
          let cls = 'hg-chip';
          if (phase === 'result') {
            const d = result.detail.find((x) => x.word === w);
            cls += d.wasPlayed ? ' hg-was-played' : ' hg-was-absent';
            if (!d.correct) cls += ' hg-wrong';
          } else if (on) cls += ' hg-on';
          return `<button type="button" class="${cls}" data-w="${esc(w)}"${phase === 'result' ? ' disabled' : ''}>${esc(w)}</button>`;
        })
        .join('');

      let actions;
      if (phase === 'play') {
        const label = playsLeft === 2 ? ui.play : ui.replay;
        actions = `<button type="button" class="hg-btn hg-primary" data-act="play"${busy ? ' disabled' : ''}>${busy ? esc(ui.playing) : esc(label)}</button>
          <button type="button" class="hg-btn" data-act="check"${selected.size ? '' : ' disabled'}>${esc(ui.check)}</button>`;
      } else {
        actions = `<button type="button" class="hg-btn hg-primary" data-act="again">${esc(ui.again)}</button>`;
      }

      let resultHtml = '';
      if (phase === 'result') {
        const heard = result.heard.map((w) => `<span class="hg-pill hg-pill-yes">${esc(w)}</span>`).join('') || '—';
        const missing = result.missing.map((w) => `<span class="hg-pill hg-pill-no">${esc(w)}</span>`).join('') || '—';
        resultHtml = `<div class="hg-result">
            <p class="hg-score">${esc(ui.score(result.correct, result.total))}</p>
            <p class="hg-lbl">${esc(ui.heard)}</p><div class="hg-pills">${heard}</div>
            <p class="hg-lbl">${esc(ui.missing)}</p><div class="hg-pills">${missing}</div>
          </div>`;
      }

      container.innerHTML = `
        <div class="hg-wrap">
          <h3>${esc(ui.title)}</h3>
          <p class="hg-muted">${esc(ui.intro)}</p>
          <p class="hg-prompt">${esc(ui.pickPrompt)}</p>
          <div class="hg-chips">${chips}</div>
          <div class="hg-actions">${actions}</div>
          ${resultHtml}
        </div>`;
      injectStylesOnce();
      wire(phase, result);
    }

    function wire(phase) {
      container.querySelectorAll('.hg-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (phase !== 'play') return;
          const w = btn.getAttribute('data-w');
          if (selected.has(w)) selected.delete(w);
          else selected.add(w);
          render('play');
        });
      });
      const act = (name) => container.querySelector(`[data-act="${name}"]`);
      act('play')?.addEventListener('click', onPlay);
      act('check')?.addEventListener('click', onCheck);
      act('again')?.addEventListener('click', onAgain);
    }

    async function onPlay() {
      if (busy || playsLeft <= 0) return;
      busy = true;
      const myToken = ++token;
      render('play');
      for (const w of round.sequence) {
        if (myToken !== token) return; // destroyed / new round
        await playWord(w, lang);
        await new Promise((r) => setTimeout(r, 450)); // gap between words
      }
      if (myToken !== token) return;
      playsLeft--;
      busy = false;
      render('play');
    }

    function onCheck() {
      const result = scoreRound(round, [...selected]);
      render('result', result);
      if (typeof handlers.onComplete === 'function') {
        try {
          handlers.onComplete(result, round);
        } catch (_) {
          /* ignore */
        }
      }
    }

    function onAgain() {
      selected.clear();
      playsLeft = 2;
      busy = false;
      round = buildRound(config.words, { lang });
      if (!round) {
        container.innerHTML = `<div class="hg-wrap"><h3>${esc(ui.title)}</h3><p class="hg-muted">${esc(ui.tooFew)}</p></div>`;
        return;
      }
      render('play');
    }

    render('play');
    return {
      destroy() {
        token++;
        if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      },
    };
  }

  function injectStylesOnce() {
    if (typeof document === 'undefined' || document.getElementById('hg-styles')) return;
    const css = `
      .hg-wrap{max-width:560px;margin:0 auto;text-align:center}
      .hg-muted{color:var(--text-muted,#888);font-size:13px;margin:.25rem 0 1rem}
      .hg-prompt{font-weight:600;margin:.5rem 0}
      .hg-chips,.hg-pills{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:.5rem 0}
      .hg-chip{padding:8px 14px;border-radius:999px;border:1px solid var(--border,#3a3a3a);background:transparent;color:inherit;cursor:pointer;font-size:14px}
      .hg-chip.hg-on{background:var(--blue-bg,rgba(93,184,232,.18));border-color:var(--accent,#5db8e8)}
      .hg-chip.hg-was-played{background:rgba(80,200,120,.18);border-color:#50c878}
      .hg-chip.hg-was-absent{opacity:.55}
      .hg-chip.hg-wrong{outline:2px solid #e2685d}
      .hg-actions{display:flex;gap:10px;justify-content:center;margin-top:1rem}
      .hg-btn{padding:9px 18px;border-radius:10px;border:1px solid var(--border,#3a3a3a);background:transparent;color:inherit;cursor:pointer;font-size:14px}
      .hg-btn[disabled]{opacity:.45;cursor:default}
      .hg-primary{background:var(--accent,#5db8e8);border-color:var(--accent,#5db8e8);color:#04243a}
      .hg-result{margin-top:1.25rem;text-align:center}
      .hg-score{font-size:18px;font-weight:700;margin:.25rem 0 1rem}
      .hg-lbl{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#888);margin:.75rem 0 .25rem}
      .hg-pill{padding:5px 12px;border-radius:999px;font-size:13px}
      .hg-pill-yes{background:rgba(80,200,120,.18);color:#50c878}
      .hg-pill-no{background:rgba(226,104,93,.16);color:#e2685d}`;
    const el = document.createElement('style');
    el.id = 'hg-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  return { buildRound, scoreRound, playWord, mount };
})();

if (typeof window !== 'undefined') window.HorenGame = HorenGame;
if (typeof module !== 'undefined') module.exports = HorenGame;
