'use strict';

const { corsHeaders, clearAuthSessionResponse } = require('./lib/http.js');

exports.handler = async (event) => {
  const cors = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') {
    return clearAuthSessionResponse(405, cors, { error: 'method_not_allowed' }, event);
  }
  return clearAuthSessionResponse(200, cors, { ok: true }, event);
};
