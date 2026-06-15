/**
 * Blueprint task-type fidelity checks (phase 13b).
 */
function checkBlueprintFidelity(blueprint) {
  const issues = [];
  if (!blueprint?.modules?.length) {
    issues.push('no_modules');
    return { ok: false, issues };
  }

  const modIds = blueprint.modules.map((m) => m.id);
  const examType = blueprint.examType || '';

  if (examType === 'goethe') {
    if (!modIds.includes('schreiben')) issues.push('missing_schreiben');
    if (!modIds.includes('sprechen')) issues.push('missing_sprechen');
    const sch = blueprint.modules.find((m) => m.id === 'schreiben');
    const sp = blueprint.modules.find((m) => m.id === 'sprechen');
    const lv = blueprint.level || 'B1';
    const minSch = lv === 'A1' || lv === 'A2' ? 1 : 3;
    const minSp = lv === 'A1' || lv === 'A2' ? 2 : 3;
    if ((sch?.parts || []).length < minSch) issues.push(`schreiben_parts:${(sch?.parts || []).length}<${minSch}`);
    if ((sp?.parts || []).length < minSp) issues.push(`sprechen_parts:${(sp?.parts || []).length}<${minSp}`);
  }

  if (examType === 'cambridge') {
    const uoe = blueprint.modules.find((m) => m.id === 'use_of_english');
    const slots = (uoe?.parts || []).map((p) => p.slotType);
    for (const required of ['open_cloze', 'word_formation', 'sentence_transformation']) {
      if (!slots.includes(required)) issues.push(`missing_cambridge:${required}`);
    }
    const listen = blueprint.modules.find((m) => m.id === 'listening');
    const lSlots = (listen?.parts || []).map((p) => p.slotType);
    if (!lSlots.includes('dialogue_speakers')) issues.push('missing_cambridge:speaker_matching');
  }

  if (examType === 'dele') {
    if (!modIds.includes('sprechen')) issues.push('missing_sprechen');
  }

  return { ok: issues.length === 0, issues };
}

if (typeof module !== 'undefined') module.exports = { checkBlueprintFidelity };
if (typeof window !== 'undefined') window.BlueprintFidelity = { checkBlueprintFidelity };
