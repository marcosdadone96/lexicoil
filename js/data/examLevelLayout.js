/**
 * Client mirror of scripts/lib/examLevelCells.mjs ASSEMBLE_LAYOUT (Lesen/Hören Teile).
 */
const ExamLevelLayout = (() => {
  const LAYOUT = Object.freeze({
    B1: Object.freeze({ lesen: [1, 2, 3, 4, 5], horen: [1, 2, 3, 4] }),
    A2: Object.freeze({ lesen: [1, 2, 3, 4], horen: [1, 2, 3, 4] }),
    B2: Object.freeze({ lesen: [1, 2, 3, 4, 5], horen: [1, 2, 3, 4] }),
    C1: Object.freeze({ lesen: [1, 2, 3, 4], horen: [1, 2, 3, 4] }),
  });

  function normalizeLevel(level) {
    const lv = String(level || 'B1').toUpperCase();
    return LAYOUT[lv] ? lv : 'B1';
  }

  function teilsForModule(level, module) {
    const lv = normalizeLevel(level);
    const layout = LAYOUT[lv] || LAYOUT.B1;
    const mod = String(module || 'lesen').toLowerCase();
    return mod === 'horen' ? [...layout.horen] : [...layout.lesen];
  }

  return Object.freeze({ LAYOUT, normalizeLevel, teilsForModule });
})();

if (typeof window !== 'undefined') window.ExamLevelLayout = ExamLevelLayout;
if (typeof module !== 'undefined') module.exports = ExamLevelLayout;
