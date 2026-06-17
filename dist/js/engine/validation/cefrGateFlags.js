/**
 * CEFR gate flags — default OFF for legacy live; ON for curation / publish (Phase 3).
 */
function cefrGateEnabled(options = {}) {
  if (options && typeof options.cefrGate === 'boolean') return options.cefrGate;
  if (options && options.curation === true) return true;
  if (typeof process !== 'undefined' && process.env && process.env.CEFR_GATE === '1') return true;
  if (typeof window !== 'undefined' && window.LC_CEFR_GATE === '1') return true;
  return false;
}

if (typeof module !== 'undefined') {
  module.exports = { cefrGateEnabled };
}
