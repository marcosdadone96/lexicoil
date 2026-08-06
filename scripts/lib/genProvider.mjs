/**
 * Offline batch generation provider selector (Gemini | Claude).
 * Does NOT touch netlify/functions/claude-chat.js (production proxy).
 */
export async function getProvider(name) {
  const provider = (name || process.env.GEN_PROVIDER || 'gemini').trim().toLowerCase();
  if (provider === 'claude') {
    return import('./claudeClient.mjs');
  }
  return import('./geminiClient.mjs');
}

export function providerLabel(name) {
  const provider = (name || process.env.GEN_PROVIDER || 'gemini').trim().toLowerCase();
  return provider === 'claude' ? 'claude' : 'gemini';
}
