'use strict';

/**
 * Runtime pool source: production Netlify functions use Blobs only.
 * Local dev / CLI keeps library/reusable-seed fallback unless POOL_SOURCE=blobs.
 *
 * POOL_ALLOW_LOCAL_SEED=1  — force local seed (netlify dev without synced blobs)
 * POOL_SOURCE=blobs        — force blobs-only everywhere
 */
function useLocalSeedInRuntime() {
  if (process.env.POOL_ALLOW_LOCAL_SEED === '1' || process.env.POOL_ALLOW_LOCAL_SEED === 'true') {
    return true;
  }
  if (process.env.POOL_SOURCE === 'blobs') return false;
  if (process.env.NETLIFY === 'true' || process.env.AWS_LAMBDA_FUNCTION_NAME) return false;
  return true;
}

module.exports = { useLocalSeedInRuntime };
