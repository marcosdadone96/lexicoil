/**
 * Sprechen input tiers and Pro realtime partner personalities.
 *
 * Free: browser STT → transcript textarea → async AI rubric (existing pipeline).
 * Pro:  realtime multi-turn conversation with selectable examiner persona (scaffolded).
 */
(function (global) {
  const INPUT_MODES = Object.freeze({
    TRANSCRIPT: 'transcript',
    REALTIME: 'realtime',
  });

  /** @type {ReadonlyArray<{id:string,label:string,labelDe:string,desc:string,descDe:string,verbosity:'low'|'normal'|'high',systemHint:string}>} */
  const REALTIME_PERSONALITIES = Object.freeze([
    {
      id: 'quiet',
      label: 'Quiet partner',
      labelDe: 'Wenig sprechend',
      desc: 'Short answers, lets you lead the conversation.',
      descDe: 'Kurze Antworten, du führst das Gespräch.',
      verbosity: 'low',
      systemHint:
        'You are a B1 German oral exam partner. Keep replies very short (1–2 sentences). Ask brief follow-ups. Let the candidate speak most of the time.',
    },
    {
      id: 'balanced',
      label: 'Balanced partner',
      labelDe: 'Normal',
      desc: 'Natural back-and-forth, like a typical exam partner.',
      descDe: 'Ausgewogenes Gespräch, wie in der Prüfung.',
      verbosity: 'normal',
      systemHint:
        'You are a B1 German oral exam partner. Reply in natural length (2–4 sentences). Balance questions and reactions fairly.',
    },
    {
      id: 'talkative',
      label: 'Talkative partner',
      labelDe: 'Viel sprechend',
      desc: 'Speaks more, challenges you to interrupt and respond.',
      descDe: 'Spricht mehr — du musst aktiv einsteigen.',
      verbosity: 'high',
      systemHint:
        'You are a B1 German oral exam partner. Give fuller replies (3–5 sentences), add opinions and examples, but stay at B1 level.',
    },
  ]);

  const REALTIME_SESSION = Object.freeze({
    endpoint: '/.netlify/functions/speaking-realtime-session',
    maxMinutes: 15,
    /** Placeholder until OpenAI Realtime / WebRTC is wired. */
    implementationStatus: 'scaffold',
  });

  global.SpeakingModes = Object.freeze({
    INPUT_MODES,
    REALTIME_PERSONALITIES,
    REALTIME_SESSION,
    personalityById(id) {
      return REALTIME_PERSONALITIES.find((p) => p.id === id) || null;
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
