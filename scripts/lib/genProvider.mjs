/**
 * Offline batch generation provider selector (Gemini | Claude).
 * Does NOT touch netlify/functions/claude-chat.js (production proxy).
 */
export async function getProvider(name) {
  const provider = (name || process.env.GEN_PROVIDER || 'claude').trim().toLowerCase();
  if (provider === 'gemini') {
    return import('./geminiClient.mjs');
  }
  return import('./claudeClient.mjs');
}

export function providerLabel(name) {
  const provider = (name || process.env.GEN_PROVIDER || 'claude').trim().toLowerCase();
  return provider === 'gemini' ? 'gemini' : 'claude';
}
