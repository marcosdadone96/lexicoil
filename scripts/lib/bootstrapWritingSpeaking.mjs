/**
 * Build writing-speaking.json scaffold from exam blueprint modules.
 */
export function writingSpeakingFromBlueprint(blueprint, lang, level) {
  const today = new Date().toISOString().slice(0, 10);
  const writing = [];
  const speaking = [];

  for (const mod of blueprint?.modules || []) {
    if (mod.id === 'schreiben' || mod.id === 'writing') {
      const moduleName = mod.id === 'writing' ? 'writing' : 'schreiben';
      for (const part of mod.parts || []) {
        writing.push({
          id: `ws-${lang}-${level}-${moduleName}-t${part.teil}`,
          module: moduleName,
          teil: part.teil,
          prompt: part.instruction || part.label || '',
          minWords: part.wordsTarget?.min ?? part.wordsPerPassage?.min,
          maxWords: part.wordsTarget?.max ?? part.wordsPerPassage?.max,
          taskFormat: part.taskFormat || part.slotType,
          topicTags: [],
        });
      }
    }
    if (mod.id === 'sprechen' || mod.id === 'speaking') {
      const moduleName = mod.id === 'speaking' ? 'speaking' : 'sprechen';
      for (const part of mod.parts || []) {
        speaking.push({
          id: `ws-${lang}-${level}-${moduleName}-t${part.teil}`,
          module: moduleName,
          teil: part.teil,
          prompt: part.instruction || part.label || '',
          taskFormat: part.taskFormat || part.slotType,
          topicTags: [],
        });
      }
    }
  }

  return {
    meta: {
      language: lang,
      level,
      version: 1,
      generatedAt: today,
      source: 'bootstrap-content-cells',
    },
    writing,
    speaking,
  };
}
