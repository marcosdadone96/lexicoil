'use strict';

const { getStoreForEvent } = require('./lib/blobStore.js');
const { requireAuth } = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { verifyDeleteConfirmation, deleteAccountFully } = require('./lib/accountDelete.js');

exports.handler = async (event) => {
  const cors = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }

  const store = getStoreForEvent(event);
  if (!store) return jsonResponse(503, cors, { error: 'storage_unavailable' });

  const auth = await requireAuth(event, store);
  if (!auth.ok) return jsonResponse(auth.status || 401, cors, { error: auth.error || 'unauthorized' });

  if (auth.user?.isAdmin) {
    return jsonResponse(403, cors, { error: 'admin_account_protected' });
  }

  let body;
  try {
    body = parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  if (!verifyDeleteConfirmation(body.confirmPhrase)) {
    return jsonResponse(400, cors, { error: 'confirm_phrase_required', expected: 'ELIMINAR' });
  }

  const result = await deleteAccountFully({
    store,
    email: auth.email,
    userId: auth.userId,
    user: auth.user,
  });

  if (!result.ok) {
    return jsonResponse(500, cors, { error: result.error || 'delete_failed' });
  }

  return jsonResponse(200, cors, {
    ok: true,
    deleted: true,
    stripeSubscriptionsCancelled: result.stripe?.cancelled || 0,
  });
};
