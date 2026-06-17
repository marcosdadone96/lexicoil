'use strict';

const { connectLambda, getStore } = require('@netlify/blobs');

const STORE_NAME = 'lexicoil-data';

function getStoreForEvent(event) {
  connectLambda(event);
  return getStore(STORE_NAME);
}

module.exports = { getStoreForEvent, STORE_NAME };
