'use strict';

/**
 * Runtime servability gate — mirrors publish pipeline + pool-stock manifest.
 * POOL-2: verified + complete. SEM-1: sem1VerifiedAt (MCQ) or sem1Skipped (Schreiben/Sprechen).
 */
function partPassesPublishGate(part) {
  if (!part || part.disabled === true) return false;
  if (part.complete !== true || part.verified !== true) return false;
  if (part.sem1Skipped) return true;
  return Boolean(part.sem1VerifiedAt);
}

module.exports = { partPassesPublishGate };
