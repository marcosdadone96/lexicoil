/**
 * Build passages.json mirror from questions.json embedded passages[].
 */
export function buildPassagesMirror(questionsBank, lang, level) {
  const today = new Date().toISOString().slice(0, 10);
  const passages = (questionsBank.passages || []).map((p) => {
    const out = {
      id: p.id,
      lang,
      level,
      module: p.module,
      text: p.text,
    };
    if (p.title) out.title = p.title;
    if (p.translations) out.translations = p.translations;
    if (p.wordCount != null) out.wordCount = p.wordCount;
    if (p.cefrMetrics) out.cefrMetrics = p.cefrMetrics;
    if (p.source) out.source = p.source;
    return out;
  });

  const meta = {
    language: lang,
    level,
    version: questionsBank.meta?.version || 1,
    generatedAt: questionsBank.meta?.generatedAt || today,
    syncedFrom: 'questions.json',
  };
  if (questionsBank.meta?.contentStatus) meta.contentStatus = questionsBank.meta.contentStatus;

  return { meta, passages };
}

export function writePassagesMirror(questionsBank, lang, level, destFile, fs) {
  const mirror = buildPassagesMirror(questionsBank, lang, level);
  fs.writeFileSync(destFile, JSON.stringify(mirror, null, 2) + '\n', 'utf8');
  return mirror;
}
