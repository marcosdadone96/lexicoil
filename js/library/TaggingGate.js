/**
 * Validates AI-assigned tags on bank items before weakness-driven assembly (phase 13d).
 */
const TaggingGate = (() => {
  const TAG_PREFIX = /^g-(de|en|es)-[a-z0-9-]+$/;
  const TOPIC_PREFIX = /^[a-z0-9_-]{2,40}$/;

  function isValidGrammarTag(tag) {
    return typeof tag === 'string' && TAG_PREFIX.test(tag);
  }

  function isValidTopicTag(tag) {
    return typeof tag === 'string' && TOPIC_PREFIX.test(tag);
  }

  function validateQuestionTags(q) {
    const issues = [];
    const grammar = q.grammarTags || [];
    const topic = q.topicTags || [];
    if (!grammar.length) issues.push('missing_grammar_tags');
    grammar.forEach((t) => {
      if (!isValidGrammarTag(t)) issues.push(`invalid_grammar:${t}`);
    });
    topic.forEach((t) => {
      if (!isValidTopicTag(t)) issues.push(`invalid_topic:${t}`);
    });
    if (q.difficulty != null && (q.difficulty < 1 || q.difficulty > 10)) {
      issues.push('invalid_difficulty');
    }
    return { ok: issues.length === 0, issues };
  }

  function filterTrustedQuestions(questions, minGrammar = 1) {
    return (questions || []).filter((q) => {
      const v = validateQuestionTags(q);
      return v.ok && (q.grammarTags || []).length >= minGrammar;
    });
  }

  function gateBank(bank) {
    const qs = bank?.questions || [];
    const trusted = filterTrustedQuestions(qs);
    return {
      total: qs.length,
      trusted: trusted.length,
      ratio: qs.length ? trusted.length / qs.length : 0,
      passed: trusted.length >= 4,
      trustedQuestions: trusted,
    };
  }

  return {
    isValidGrammarTag,
    isValidTopicTag,
    validateQuestionTags,
    filterTrustedQuestions,
    gateBank,
  };
})();

if (typeof window !== 'undefined') window.TaggingGate = TaggingGate;
if (typeof module !== 'undefined') module.exports = TaggingGate;
