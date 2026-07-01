'use strict';

const { connectLambda, getStore } = require('@netlify/blobs');

const STORE_NAME = 'lexicoil-data';

function getStoreForEvent(event) {
  try {
    if (event?.blobs) {
      connectLambda(event);
    }
    return getStore(STORE_NAME);
  } catch (err) {
    console.warn('[blobs] store unavailable:', err.message);
    return null;
  }
}

module.exports = { getStoreForEvent, STORE_NAME };
