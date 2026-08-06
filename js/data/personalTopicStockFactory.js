/**
 * Shared UI/stock helpers for personal pool topic picker (any module/level).
 */
const PersonalTopicStockFactory = (() => {
  function topicKeywords() {
    if (typeof PartTopicDetect !== 'undefined' && PartTopicDetect.TOPIC_KEYWORDS) {
      return PartTopicDetect.TOPIC_KEYWORDS;
    }
    return null;
  }

  function foldWord(w) {
    return String(w || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
  }

  function scoreWordsForTopic(words, topic) {
    const norm = typeof B1Topics !== 'undefined' ? B1Topics : null;
    const fold = norm?.foldTopicKey || foldWord;
    const topicKey = fold(topic);
    const kwMap = topicKeywords();
    const topicKw = kwMap?.[topic] || [];
    let score = 0;
    for (const raw of words || []) {
      const w = String(raw || '').trim();
      if (!w) continue;
      const canon = norm?.normalizeB1Topic?.(w);
      if (canon === topic) {
        score += 8;
        continue;
      }
      const wKey = fold(w);
      if (wKey === topicKey || wKey.includes(topicKey) || topicKey.includes(wKey)) {
        score += 3;
        continue;
      }
      const wLower = w.toLowerCase();
      for (const kw of topicKw) {
        const k = String(kw).toLowerCase();
        if (wLower === k || wLower.includes(k) || k.includes(wLower)) {
          score += 4;
          break;
        }
      }
    }
    return score;
  }

  function create(manifest, options = {}) {
    const module = options.module || manifest.module || 'lesen';
    const teilCount = options.teilCount || (manifest.teils || []).length || 5;
    const moduleLabel = options.moduleLabel || { de: 'Lesen', en: 'Reading' };

    function getManifest() {
      return manifest;
    }

    function normalizeTopicSlug(topic) {
      const lv = String(manifest.level || 'B1').toUpperCase();
      if (lv === 'A2' && typeof A2Topics !== 'undefined' && A2Topics.normalizeA2Topic) {
        return A2Topics.normalizeA2Topic(topic) || String(topic || '').trim();
      }
      if (typeof B1Topics !== 'undefined' && B1Topics.normalizeB1Topic) {
        return B1Topics.normalizeB1Topic(topic);
      }
      return String(topic || '').trim();
    }

    function getTopicEntry(topic) {
      const want = normalizeTopicSlug(topic);
      return (manifest.topics || []).find((t) => t.topic === want) || null;
    }

    function isTopicFull(topic) {
      return !!getTopicEntry(topic)?.full;
    }

    function getFullTopics() {
      return (manifest.topics || []).filter((t) => t.full).map((t) => t.topic);
    }

    function badgeLabel(topic, lang) {
      const entry = getTopicEntry(topic);
      const isDE = String(lang || 'de').toLowerCase() === 'de';
      if (!entry) return '';
      if (entry.full) return '✓';
      if (entry.status === 'sparse' || entry.total <= 2) {
        return isDE ? '— sehr wenig' : '— very little';
      }
      if (entry.missing?.length === 1) {
        return isDE ? '— wenig Inhalt' : '— limited content';
      }
      return isDE ? '— Lücken' : '— gaps';
    }

    function badgeHint(topic, lang) {
      const entry = getTopicEntry(topic);
      const isDE = String(lang || 'de').toLowerCase() === 'de';
      if (!entry) return '';
      if (entry.full) {
        return isDE
          ? `${teilCount} Teile aus diesem Thema verfügbar`
          : `All ${teilCount} parts available for this topic`;
      }
      const miss = (entry.missing || []).map((t) => `T${t}`).join(', ');
      if (entry.status === 'sparse') {
        return isDE
          ? `Nur ${entry.total} Aufgabe(n) im Pool — viele Teile aus anderen Themen`
          : `Only ${entry.total} task(s) in pool — many parts from other topics`;
      }
      return isDE
        ? `Teil ${miss || '?'} fehlt — es können Alternativaufgaben erscheinen`
        : `Part ${miss || '?'} missing — alternative tasks may appear`;
    }

    function sortTopicsForSelect() {
      const rows = [...(manifest.topics || [])];
      rows.sort((a, b) => {
        if (a.full !== b.full) return a.full ? -1 : 1;
        if (a.status === 'sparse' && b.status !== 'sparse') return 1;
        if (b.status === 'sparse' && a.status !== 'sparse') return -1;
        return b.total - a.total || a.topic.localeCompare(b.topic, 'de');
      });
      return rows;
    }

    function pickDefaultTopicForWords(words) {
      const candidates = (manifest.topics || []).filter((t) => t.full || t.total > 0);
      const pool = candidates.length ? candidates : manifest.topics || [];
      if (!pool.length) {
        return typeof B1Topics !== 'undefined' && B1Topics.B1_TOPICS?.length
          ? B1Topics.B1_TOPICS[0]
          : 'Umwelt';
      }
      const preferFull = pool.filter((t) => t.full);
      const search = preferFull.length ? preferFull : pool;
      let best = search[0].topic;
      let bestScore = -1;
      for (const row of search) {
        const s = scoreWordsForTopic(words, row.topic);
        if (s > bestScore) {
          bestScore = s;
          best = row.topic;
        }
      }
      if (bestScore <= 0 && preferFull.length) return preferFull[0].topic;
      return best;
    }

    function suggestTopicHint(words, lang) {
      const isDE = String(lang || 'de').toLowerCase() === 'de';
      const suggested = pickDefaultTopicForWords(words);
      const score = scoreWordsForTopic(words, suggested);
      if (!words?.length) {
        return isDE ? 'Wähle Wörter — wir schlagen ein Thema vor.' : 'Pick words — we will suggest a topic.';
      }
      if (score <= 0) {
        return isDE
          ? 'Deine Wörter passen schwach zu einem Thema — du kannst trotzdem eins wählen.'
          : 'Your words match topics weakly — you can still pick one.';
      }
      return isDE
        ? `Empfohlen für deine Auswahl: ${suggested}`
        : `Suggested for your selection: ${suggested}`;
    }

    function formatPersonalExamDisplayTitle(exam, lang) {
      const isDE = String(lang || exam?.lang || 'de').toLowerCase() === 'de';
      const modLbl = isDE ? moduleLabel.de : moduleLabel.en;
      const requested = exam?._poolRequestedTopic || exam?.topicTag || exam?.topic || '';
      const relaxed = exam?._poolRelaxedTeile || [];
      if (requested && !relaxed.length) {
        return isDE ? `Personal · ${requested} · ${modLbl}` : `Personal · ${requested} · ${modLbl}`;
      }
      if (requested && relaxed.length) {
        const altTopics = [...new Set(relaxed.map((r) => r.actualTopic).filter(Boolean))];
        const altList = altTopics.length ? altTopics.join(', ') : '';
        if (isDE) {
          return altList
            ? `Personal · ${requested} + ${altList} · ${modLbl}`
            : `Personal · ${requested} (Alternativaufgaben) · ${modLbl}`;
        }
        return altList
          ? `Personal · ${requested} + ${altList} · ${modLbl}`
          : `Personal · ${requested} (alternatives) · ${modLbl}`;
      }
      return isDE ? `Personal · ${modLbl}` : `Personal · ${modLbl}`;
    }

    function formatRelaxedTeilNote(part, lang) {
      if (!part?._topicRelaxed || !part?._poolTopicTag) return '';
      const isDE = String(lang || 'de').toLowerCase() === 'de';
      const teil = Number(part.teil) || '?';
      const actual = part._poolTopicTag;
      return isDE
        ? `Teil ${teil}: ${actual} — Alternativaufgabe`
        : `Part ${teil}: ${actual} — alternative task`;
    }

    function topicHonestyBanner(exam, lang) {
      const relaxed = exam?._poolRelaxedTeile || [];
      if (!relaxed.length) return '';
      const isDE = String(lang || 'de').toLowerCase() === 'de';
      const requested = exam?._poolRequestedTopic || exam?.topicTag || exam?.topic || '';
      const lines = relaxed.map((r) => {
        const teil = Number(r.teil) || '?';
        const actual = r.actualTopic || '?';
        return isDE ? `Teil ${teil}: ${actual}` : `Part ${teil}: ${actual}`;
      });
      if (isDE) {
        return `Für „${requested}“ nutzen wir an einigen Stellen Aufgaben aus anderen Themen: ${lines.join(' · ')}.`;
      }
      return `For "${requested}", some parts use tasks from other topics: ${lines.join(' · ')}.`;
    }

    return Object.freeze({
      module,
      getManifest,
      getTopicEntry,
      isTopicFull,
      getFullTopics,
      badgeLabel,
      badgeHint,
      sortTopicsForSelect,
      scoreWordsForTopic,
      pickDefaultTopicForWords,
      suggestTopicHint,
      formatPersonalExamDisplayTitle,
      formatRelaxedTeilNote,
      topicHonestyBanner,
    });
  }

  return Object.freeze({ create, scoreWordsForTopic });
})();

if (typeof window !== 'undefined') window.PersonalTopicStockFactory = PersonalTopicStockFactory;
if (typeof module !== 'undefined') module.exports = PersonalTopicStockFactory;
