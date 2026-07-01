/**
 * Shared analytics IDs — single source for landing + app + privacy docs.
 */
(function () {
  'use strict';

  var GA_MEASUREMENT_ID = 'G-RTQJVSZBKC';

  var config = Object.freeze({ GA_MEASUREMENT_ID });

  if (typeof window !== 'undefined') window.LC_ANALYTICS = config;
  if (typeof module !== 'undefined') module.exports = config;
})();
