/**
 * Resolve Netlify Blobs store for CLI-side global counters (Gemini rate limit, etc.).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getStore } = require('@netlify/blobs');
const { STORE_NAME } = require('../../netlify/functions/lib/blobStore.js');

/** @returns {{ store: import('@netlify/blobs').Store|null, backend: string }} */
export function resolveGeminiRateLimitStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) {
    return { store: getStore({ name: STORE_NAME, siteID, token }), backend: 'blob-remote' };
  }
  try {
    return { store: getStore(STORE_NAME), backend: 'blob-local' };
  } catch {
    return { store: null, backend: 'file' };
  }
}
