/**
 * StoryGenerator — Phase 07
 */
const StoryGenerator = (() => {
  function getPromptBuilder() {
    if (typeof PromptBuilder !== 'undefined') return PromptBuilder;
    return require('../prompts/PromptBuilder.js');
  }

  async function generate(spec, hooks) {
    const PB = getPromptBuilder();
    const built = PB.buildPrompt(spec);
    const raw = await hooks.callAI(built.prompt, built.maxTokens, { consumeQuota: false });
    const text = String(raw).replace(/```json|```/g, '').trim();
    return hooks.parseExamJson ? hooks.parseExamJson(text) : JSON.parse(text);
  }

  return Object.freeze({
    contentTypes: ['Story'],
    generate,
  });
})();

if (typeof window !== 'undefined') window.StoryGenerator = StoryGenerator;
if (typeof module !== 'undefined') module.exports = StoryGenerator;
