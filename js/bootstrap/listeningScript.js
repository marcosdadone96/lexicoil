/**
 * Parse listening transcripts into multi-speaker segments for TTS (phase 13e).
 */
const ListeningScript = (() => {
  const SPEAKER_RE = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .'-]{0,40}):\s*(.+)$/;

  const VOICES = {
    de: ['pNInz6obpgDQGcFmaJgB', '21m00Tcm4TlvDq8ikWAM', 'EXAVitQu4vr4xnSDxMaL'],
    en: ['GBv7mTt0atIp3Br8iCZE', '21m00Tcm4TlvDq8ikWAM', 'pNInz6obpgDQGcFmaJgB'],
    es: ['ErXwobaYiN019PkySvjV', 'EXAVitQu4vr4xnSDxMaL', 'pNInz6obpgDQGcFmaJgB'],
  };

  function defaultVoices(lang) {
    return VOICES[lang] || VOICES.en;
  }

  function parseSegmentsInline(text) {
    const src = String(text || '').trim();
    const re = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .'-]{0,40}):\s*/g;
    const matches = [...src.matchAll(re)];
    if (matches.length < 2) return null;
    const segments = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : src.length;
      segments.push({
        speaker: matches[i][1].trim(),
        text: src.slice(start, end).trim(),
      });
    }
    return segments.filter((s) => s.text);
  }

  function parseSegments(text) {
    const lines = String(text || '')
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const segments = [];
    let currentSpeaker = null;
    let buffer = [];

    function flush() {
      if (!buffer.length) return;
      segments.push({
        speaker: currentSpeaker || 'Narrator',
        text: buffer.join(' ').trim(),
      });
      buffer = [];
    }

    for (const line of lines) {
      const m = line.match(SPEAKER_RE);
      if (m) {
        flush();
        currentSpeaker = m[1].trim();
        buffer.push(m[2].trim());
      } else {
        buffer.push(line);
      }
    }
    flush();

    if (segments.length <= 1) {
      const inline = parseSegmentsInline(text);
      if (inline?.length > 1) return inline;
    }

    if (segments.length <= 1 && text) {
      return [{ speaker: 'Narrator', text: String(text).trim() }];
    }
    return segments;
  }

  function assignVoices(segments, lang) {
    const voices = defaultVoices(lang);
    const map = {};
    let vi = 0;
    return segments.map((seg) => {
      if (!map[seg.speaker]) {
        map[seg.speaker] = voices[vi % voices.length];
        vi++;
      }
      return { ...seg, voice: map[seg.speaker] };
    });
  }

  function prepare(text, lang) {
    const segments = parseSegments(text);
    return assignVoices(segments, lang);
  }

  function isMultiVoice(text) {
    return parseSegments(text).length > 1;
  }

  return { parseSegments, assignVoices, prepare, isMultiVoice, defaultVoices };
})();

if (typeof window !== 'undefined') window.ListeningScript = ListeningScript;
if (typeof module !== 'undefined') module.exports = ListeningScript;
