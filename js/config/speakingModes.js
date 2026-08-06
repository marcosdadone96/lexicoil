/**
 * Sprechen input tiers and Pro turn-based partner personalities (v1).
 *
 * Free: browser STT → transcript textarea → async AI rubric (existing pipeline).
 * Pro:  turn-based conversation with selectable examiner persona (Kim / Alex / Leo) on Teil 1 + 3.
 * T2:   always transcript (individual presentation — partner only listens in the real exam).
 * Level-aware: B1 (default) and A2 calibrations (simpler vocabulary / shorter turns).
 */
(function (global) {
  const INPUT_MODES = Object.freeze({
    TRANSCRIPT: 'transcript',
    REALTIME: 'partner',
    PARTNER: 'partner',
    VOICE_LIVE: 'voice_live',
  });

  function normalizeLevel(level) {
    return String(level || 'B1').trim().toUpperCase() === 'A2' ? 'A2' : 'B1';
  }

  const REALTIME_PERSONALITIES_B1 = Object.freeze([
    {
      id: 'quiet',
      displayName: 'Kim',
      label: 'Kim — quiet',
      labelDe: 'Kim — wenig sprechend',
      desc: 'Very short answers (≤12 words), lets you lead.',
      descDe: 'Sehr kurze Antworten (≤12 Wörter), du führst das Gespräch.',
      verbosity: 'low',
      maxWordsPerTurn: 12,
      level: 'B1',
    },
    {
      id: 'balanced',
      displayName: 'Alex',
      label: 'Alex — balanced',
      labelDe: 'Alex — normal',
      desc: 'Natural back-and-forth (~20–35 words per turn).',
      descDe: 'Ausgewogenes Gespräch (~20–35 Wörter pro Zug).',
      verbosity: 'normal',
      maxWordsPerTurn: 35,
      level: 'B1',
    },
    {
      id: 'talkative',
      displayName: 'Leo',
      label: 'Leo — talkative',
      labelDe: 'Leo — viel sprechend',
      desc: 'Speaks more (~45–70 words), opinions + examples.',
      descDe: 'Spricht deutlich mehr (~45–70 Wörter), Meinungen + Beispiele.',
      verbosity: 'high',
      maxWordsPerTurn: 70,
      level: 'B1',
    },
  ]);

  const REALTIME_PERSONALITIES_A2 = Object.freeze([
    {
      id: 'quiet',
      displayName: 'Kim',
      label: 'Kim — quiet',
      labelDe: 'Kim — wenig sprechend',
      desc: 'Very short A2 answers (≤8 words), simple everyday words.',
      descDe: 'Sehr kurze A2-Antworten (≤8 Wörter), einfache Alltagswörter.',
      verbosity: 'low',
      maxWordsPerTurn: 8,
      level: 'A2',
    },
    {
      id: 'balanced',
      displayName: 'Alex',
      label: 'Alex — balanced',
      labelDe: 'Alex — normal',
      desc: 'Simple back-and-forth (~12–20 words), short A2 sentences.',
      descDe: 'Einfaches Hin und Her (~12–20 Wörter), kurze A2-Sätze.',
      verbosity: 'normal',
      maxWordsPerTurn: 20,
      level: 'A2',
    },
    {
      id: 'talkative',
      displayName: 'Leo',
      label: 'Leo — talkative',
      labelDe: 'Leo — viel sprechend',
      desc: 'Talkative but still A2 (~25–35 words), one simple example.',
      descDe: 'Gesprächig, aber A2 (~25–35 Wörter), ein einfaches Beispiel.',
      verbosity: 'high',
      maxWordsPerTurn: 35,
      level: 'A2',
    },
  ]);

  /** @deprecated use personalitiesForLevel(level) — B1 default */
  const REALTIME_PERSONALITIES = REALTIME_PERSONALITIES_B1;

  function personalitiesForLevel(level) {
    return normalizeLevel(level) === 'A2' ? REALTIME_PERSONALITIES_A2 : REALTIME_PERSONALITIES_B1;
  }

  const PARTNER_CHAT = Object.freeze({
    endpoint: '/.netlify/functions/speaking-chat',
    maxMinutes: 15,
    implementationStatus: 'turn_based_v1',
  });

  const REALTIME_SESSION = Object.freeze({
    endpoint: '/.netlify/functions/speaking-realtime-session',
    maxMinutes: 8,
    implementationStatus: 'pilot',
  });

  const VOICE_PILOT = Object.freeze({
    endpoint: '/.netlify/functions/speaking-voice-pilot',
  });

  global.SpeakingModes = Object.freeze({
    INPUT_MODES,
    REALTIME_PERSONALITIES,
    REALTIME_PERSONALITIES_B1,
    REALTIME_PERSONALITIES_A2,
    personalitiesForLevel,
    normalizeLevel,
    PARTNER_CHAT,
    REALTIME_SESSION,
    VOICE_PILOT,
    personalityById(id, level) {
      const list = personalitiesForLevel(level);
      return list.find((p) => p.id === id) || list.find((p) => p.id === 'balanced') || null;
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
