/**
 * Gemini Live WebSocket client — PTT + NO_INTERRUPTION (production Sprechen voice).
 */
const SpeakingLiveClient = (() => {
  function b64ToInt16(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  function downsampleTo16k(float32, inRate) {
    if (inRate === 16000) return float32;
    const ratio = inRate / 16000;
    const outLen = Math.floor(float32.length / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) out[i] = float32[Math.floor(i * ratio)] || 0;
    return out;
  }

  function floatTo16BitPCM(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function int16ToBase64(int16) {
    const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  async function parseMsg(data) {
    if (typeof data === 'string') return JSON.parse(data);
    if (data instanceof Blob) return JSON.parse(await data.text());
    if (data instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(data));
    return JSON.parse(await new Response(data).text());
  }

  function parsePcmSampleRate(mimeType, fallback = 24000) {
    const m = String(mimeType || '').match(/rate=(\d+)/i);
    const rate = m ? Number(m[1]) : fallback;
    return Number.isFinite(rate) && rate > 0 ? rate : fallback;
  }

  function appendTurn(turns, role, text) {
    const chunk = String(text || '').trim();
    if (!chunk) return turns;
    const list = turns.slice();
    const last = list[list.length - 1];
    if (last && last.role === role) last.text = `${last.text} ${chunk}`.replace(/\s+/g, ' ').trim();
    else list.push({ role, text: chunk, at: Date.now() });
    return list;
  }

  /**
   * @param {{
   *   session: object,
   *   ephemeral: object,
   *   onTurns?: (turns: Array) => void,
   *   onPhase?: (phase: string, detail?: string) => void,
   *   onTimer?: (msLeft: number) => void,
   *   onError?: (err: string) => void,
   * }} opts
   */
  function create(opts) {
    const session = opts.session;
    const ephemeral = opts.ephemeral;
    let ws = null;
    let phase = 'idle';
    let recording = false;
    let mediaStream = null;
    let audioCtx = null;
    let processor = null;
    let source = null;
    let playCtx = null;
    let nextPlayTime = 0;
    let turns = [];
    let endsAt = session?.endsAt || Date.now() + (session?.durationMs || 180000);
    let timerId = null;
    let closed = false;
    let pcmBytesIn = 0;
    let pcmBytesOut = 0;
    let lastUsageMetadata = null;
    let geminiLiveConnected = false;

    function setPhase(next, detail) {
      phase = next;
      opts.onPhase?.(next, detail);
    }

    function sendJson(obj) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    }

    function notifyTurns() {
      opts.onTurns?.(turns.slice());
    }

    async function ensurePlayback(sampleRate = 24000) {
      if (typeof window.unlockWebAudio === 'function') window.unlockWebAudio();
      if (!playCtx) playCtx = new AudioContext({ sampleRate });
      if (playCtx.state === 'suspended') await playCtx.resume();
    }

    async function playPcm16(int16, sampleRate = 24000) {
      await ensurePlayback(sampleRate);
      const f32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
      const buf = playCtx.createBuffer(1, f32.length, sampleRate);
      buf.copyToChannel(f32, 0);
      const src = playCtx.createBufferSource();
      src.buffer = buf;
      src.connect(playCtx.destination);
      const startAt = Math.max(playCtx.currentTime, nextPlayTime);
      src.start(startAt);
      nextPlayTime = startAt + buf.duration;
    }

    async function ensureMic() {
      if (mediaStream) return;
      if (typeof window.unlockWebAudio === 'function') window.unlockWebAudio();
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      audioCtx = new AudioContext();
      source = audioCtx.createMediaStreamSource(mediaStream);
      processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (ev) => {
        if (!recording) return;
        const input = ev.inputBuffer.getChannelData(0);
        const down = downsampleTo16k(input, audioCtx.sampleRate);
        const pcm = floatTo16BitPCM(down);
        pcmBytesIn += pcm.byteLength;
        sendJson({
          realtimeInput: {
            audio: { data: int16ToBase64(pcm), mimeType: 'audio/pcm;rate=16000' },
          },
        });
      };
      source.connect(processor);
      processor.connect(audioCtx.destination);
    }

    function tickTimer() {
      const left = endsAt - Date.now();
      opts.onTimer?.(left);
      if (left <= 0) softClose('time_limit');
    }

    async function startPtt() {
      if (recording || closed || (phase !== 'your-turn' && phase !== 'connected')) return false;
      try {
        await ensureMic();
        if (audioCtx?.state === 'suspended') await audioCtx.resume();
        if (playCtx?.state === 'suspended') await playCtx.resume();
        recording = true;
        sendJson({ realtimeInput: { activityStart: {} } });
        setPhase('your-turn', 'recording');
        return true;
      } catch (e) {
        opts.onError?.(e.message || String(e));
        return false;
      }
    }

    function endPtt() {
      if (!recording) return;
      recording = false;
      sendJson({ realtimeInput: { activityEnd: {} } });
      setPhase('partner', 'waiting');
      nextPlayTime = 0;
    }

    function softClose(reason) {
      if (closed) return;
      closed = true;
      setPhase('done', reason || 'closing');
      endPtt();
      const prompt =
        session?.softClosePrompt ||
        'Die Prüfungszeit ist jetzt um. Beende deinen aktuellen Satz höflich und verabschiede dich.';
      sendJson({ realtimeInput: { text: prompt } });
      sendJson({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: prompt }] }],
          turnComplete: true,
        },
      });
      clearInterval(timerId);
      setTimeout(() => {
        try {
          ws?.close();
        } catch (_) {
          /* ignore */
        }
      }, 8000);
    }

    function connect() {
      return new Promise((resolve, reject) => {
        const url = `${ephemeral.websocketUrl}?access_token=${encodeURIComponent(ephemeral.token)}`;
        ws = new WebSocket(url);
        let setupDone = false;

        ws.onopen = () => {
          sendJson({ setup: {} });
        };

        ws.onmessage = async (ev) => {
          let msg;
          try {
            msg = await parseMsg(ev.data);
          } catch {
            return;
          }
          if (msg.error) {
            opts.onError?.(JSON.stringify(msg.error));
            return;
          }
          if (msg.usageMetadata) lastUsageMetadata = msg.usageMetadata;

          if (msg.setupComplete && !setupDone) {
            setupDone = true;
            geminiLiveConnected = true;
            ensurePlayback(24000).catch(() => {});
            endsAt = session.endsAt || Date.now() + session.durationMs;
            clearInterval(timerId);
            tickTimer();
            timerId = setInterval(tickTimer, 250);
            if (session.whoStarts === 'partner') {
              setPhase('partner', 'partner_starts');
              sendJson({
                clientContent: {
                  turns: [
                    {
                      role: 'user',
                      parts: [
                        {
                          text: '(Der Kandidat ist bereit. Bitte begrüße kurz und starte das Gespräch zur Aufgabe.)',
                        },
                      ],
                    },
                  ],
                  turnComplete: true,
                },
              });
            } else {
              setPhase('your-turn', 'user_starts');
            }
            resolve({ turns, session });
            return;
          }

          const sc = msg.serverContent;
          if (!sc) return;
          if (sc.outputTranscription?.text) {
            turns = appendTurn(turns, 'partner', sc.outputTranscription.text);
            notifyTurns();
            setPhase('partner', 'speaking');
          }
          if (sc.inputTranscription?.text) {
            turns = appendTurn(turns, 'user', sc.inputTranscription.text);
            notifyTurns();
          }
          if (sc.modelTurn?.parts) {
            for (const p of sc.modelTurn.parts) {
              if (p.inlineData?.data) {
                try {
                  const int16 = b64ToInt16(p.inlineData.data);
                  pcmBytesOut += int16.byteLength;
                  const rate = parsePcmSampleRate(p.inlineData.mimeType, 24000);
                  playPcm16(int16, rate).catch((e) => {
                    opts.onError?.(e.message || 'playback_error');
                  });
                } catch (e) {
                  opts.onError?.(e.message || 'pcm_decode_error');
                }
              }
            }
          }
          if (sc.turnComplete && !closed) setPhase('your-turn', 'your_turn');
        };

        ws.onerror = () => {
          if (!setupDone) reject(new Error('websocket_error'));
          opts.onError?.('websocket_error');
        };

        ws.onclose = () => {
          clearInterval(timerId);
          if (!closed) setPhase('idle', 'disconnected');
        };

        setTimeout(() => {
          if (!setupDone) reject(new Error('setup_timeout'));
        }, 25000);
      });
    }

    function destroy() {
      closed = true;
      clearInterval(timerId);
      endPtt();
      try {
        ws?.close();
      } catch (_) {
        /* ignore */
      }
      processor?.disconnect();
      source?.disconnect();
      mediaStream?.getTracks().forEach((t) => t.stop());
      ws = null;
    }

    return {
      connect,
      startPtt,
      endPtt,
      softClose,
      destroy,
      getTurns: () => turns.slice(),
      getPhase: () => phase,
      isRecording: () => recording,
      getTelemetry: () => ({
        pcmBytesIn,
        pcmBytesOut,
        usageMetadata: lastUsageMetadata,
        geminiLiveConnected,
      }),
    };
  }

  function formatTranscriptForEval(turns, de) {
    const userLabel = de ? 'Ich' : 'Me';
    return (turns || [])
      .map((t) => {
        const who = t.role === 'partner' ? 'Partner' : userLabel;
        return `${who}: ${t.text || ''}`;
      })
      .join('\n');
  }

  return { create, formatTranscriptForEval, appendTurn };
})();

if (typeof window !== 'undefined') window.SpeakingLiveClient = SpeakingLiveClient;
