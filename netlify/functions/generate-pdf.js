'use strict';

/**
 * Server-side PDF generation (Chromium) — Pro-only correction report.
 * POST JSON: { score, mods, d, isDE, correction, speakingParts, grammarCoaching, uiLang }
 */

const { requireAuth } = require('./lib/authLib.js');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { resolvePlan } = require('./lib/quotaLib.js');
const { isPaidPlan } = require('./lib/actionAccessLib.js');
const { corsHeaders, jsonResponse, parseJsonBody } = require('./lib/http.js');
const { buildPdfReportHtml } = require('./lib/pdfHtmlBundle.js');
const { renderPdfFromHtml } = require('./lib/pdfRender.js');

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'POST, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }

  const store = getStoreForEvent(event);
  const auth = await requireAuth(event, store);
  if (!auth.ok) {
    return jsonResponse(auth.status || 401, cors, { error: auth.error || 'login_required' });
  }

  const plan = resolvePlan(auth.user);
  if (!isPaidPlan(plan)) {
    return jsonResponse(403, cors, { error: 'pro_only', message: 'PDF reports require Pro.' });
  }

  let body;
  try {
    body = parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  if (!body || typeof body.score !== 'number' || !body.d) {
    return jsonResponse(400, cors, { error: 'invalid_payload' });
  }

  try {
    const html = buildPdfReportHtml({
      score: body.score,
      mods: body.mods || {},
      d: body.d,
      isDE: !!body.isDE,
      correction: body.correction || null,
      speakingParts: body.speakingParts || body.speakingEvals || null,
      grammarCoaching: body.grammarCoaching || body.correction?.grammarCoaching || null,
      uiLang: body.uiLang || null,
    });
    const pdfBuf = await renderPdfFromHtml(html);
    const filename = `lexicoil-report-${body.d.level || 'exam'}-${Date.now()}.pdf`;
    return {
      statusCode: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
      body: pdfBuf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('[generate-pdf]', err.message || err);
    return jsonResponse(500, cors, { error: 'pdf_generation_failed', message: err.message || 'PDF failed' });
  }
};
