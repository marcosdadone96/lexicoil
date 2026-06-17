/**
 * FlashcardGenerator — Phase 07
 * LLM generation of flashcard entries from ContentSpecification
 */
const FlashcardGenerator = (() => {
  function getPromptBuilder() {
    if (typeof PromptBuilder !== 'undefined') return PromptBuilder;
    return require('../prompts/PromptBuilder.js');
  }

  async function generate(spec, hooks) {
    const PB = getPromptBuilder();
    const built = PB.buildPrompt(spec);
    const raw = await hooks.callAI(built.prompt, built.maxTokens, { consumeQuota: false });
    const text = String(raw).replace(/```json|```/g, '').trim();
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.flashcards)) return data.flashcards;
      return [data];
    } catch (e) {
      throw new Error('FlashcardGenerator: invalid JSON from LLM');
    }
  }

  return Object.freeze({
    contentTypes: ['Flashcards'],
    generate,
  });
})();

if (typeof window !== 'undefined') window.FlashcardGenerator = FlashcardGenerator;
if (typeof module !== 'undefined') module.exports = FlashcardGenerator;
