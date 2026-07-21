'use strict';

/**
 * Live AI personal-exam generation is disabled unless ALLOW_LIVE_GEN=1
 * (Netlify env + matching client flag). Default: off.
 */
function isAllowLiveGenEnabled() {
  const v = String(process.env.ALLOW_LIVE_GEN || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function liveGenDisabledResponse(jsonResponse, cors) {
  return jsonResponse(503, cors, {
    error: 'live_gen_disabled',
    message: 'Live AI exam generation is temporarily unavailable.',
  });
}

function verifyUnavailableResponse(jsonResponse, cors, reason) {
  return jsonResponse(503, cors, {
    error: 'verify_unavailable',
    message: 'Exam verification could not run. The exam was not delivered.',
    reason: reason || 'unavailable',
  });
}

module.exports = {
  isAllowLiveGenEnabled,
  liveGenDisabledResponse,
  verifyUnavailableResponse,
};
