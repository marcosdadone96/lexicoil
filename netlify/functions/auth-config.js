'use strict';

const { getJwtSecret } = require('./lib/authLib.js');
const { getSiteUrl } = require('./lib/siteConfig.js');
const { corsHeaders, jsonResponse } = require('./lib/http.js');

function trimEnv(v) {
  return String(v || '').trim();
}

exports.handler = async function handler(event) {
  const cors = corsHeaders(event, 'GET, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }

  const supabaseUrl = trimEnv(process.env.SUPABASE_URL);
  const supabaseAnonKey = trimEnv(process.env.SUPABASE_ANON_KEY);

  return jsonResponse(200, cors, {
    enabled: Boolean(getJwtSecret()),
    siteUrl: getSiteUrl(),
    supabase: Boolean(supabaseUrl && supabaseAnonKey),
    supabaseUrl: supabaseUrl || '',
    supabaseAnonKey: supabaseAnonKey || '',
    emailRedirectTo: `${getSiteUrl()}/confirmacion`,
    oauthRedirectTo: `${getSiteUrl()}/app.html`,
  });
};
