/**
 * Personal Lesen B1 — topic pool stock (manifest-driven UI badges + defaults).
 * Source: library/pool-stock/de_B1-lesen.json (regenerate via scripts/build-pool-stock-manifest.mjs)
 */
const PersonalLesenTopicStock = (() => {
  /** Embedded snapshot — keep in sync with library/pool-stock/de_B1-lesen.json */
  const MANIFEST = {
    "v": 2,
    "lang": "de",
    "level": "B1",
    "module": "lesen",
    "teils": [
        1,
        2,
        3,
        4,
        5
    ],
    "topics": [
        {
            "topic": "Reisen",
            "counts": {
                "1": 4,
                "2": 1,
                "3": 5,
                "4": 4,
                "5": 3
            },
            "total": 17,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Gesundheit",
            "counts": {
                "1": 3,
                "2": 3,
                "3": 5,
                "4": 1,
                "5": 4
            },
            "total": 16,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Arbeit",
            "counts": {
                "1": 3,
                "2": 4,
                "3": 4,
                "4": 3,
                "5": 2
            },
            "total": 16,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Technik",
            "counts": {
                "1": 3,
                "2": 3,
                "3": 12,
                "4": 1,
                "5": 6
            },
            "total": 25,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Medien",
            "counts": {
                "1": 4,
                "2": 3,
                "3": 5,
                "4": 1,
                "5": 4
            },
            "total": 17,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Wohnen",
            "counts": {
                "1": 3,
                "2": 3,
                "3": 7,
                "4": 2,
                "5": 3
            },
            "total": 18,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Konsum",
            "counts": {
                "1": 2,
                "2": 6,
                "3": 2,
                "4": 3,
                "5": 3
            },
            "total": 16,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Bildung",
            "counts": {
                "1": 2,
                "2": 3,
                "3": 3,
                "4": 0,
                "5": 3
            },
            "total": 11,
            "filled": 4,
            "missing": [
                4
            ],
            "full": false,
            "status": "partial"
        },
        {
            "topic": "Familie",
            "counts": {
                "1": 6,
                "2": 3,
                "3": 3,
                "4": 6,
                "5": 3
            },
            "total": 21,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Umwelt",
            "counts": {
                "1": 3,
                "2": 2,
                "3": 3,
                "4": 8,
                "5": 13
            },
            "total": 29,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Ernährung",
            "counts": {
                "1": 5,
                "2": 3,
                "3": 3,
                "4": 1,
                "5": 3
            },
            "total": 15,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Kultur",
            "counts": {
                "1": 3,
                "2": 2,
                "3": 3,
                "4": 2,
                "5": 3
            },
            "total": 13,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Sport",
            "counts": {
                "1": 4,
                "2": 3,
                "3": 7,
                "4": 6,
                "5": 4
            },
            "total": 24,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Freizeit",
            "counts": {
                "1": 15,
                "2": 4,
                "3": 7,
                "4": 3,
                "5": 2
            },
            "total": 31,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Verkehr",
            "counts": {
                "1": 4,
                "2": 4,
                "3": 4,
                "4": 3,
                "5": 2
            },
            "total": 17,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Stadtleben",
            "counts": {
                "1": 12,
                "2": 5,
                "3": 5,
                "4": 4,
                "5": 3
            },
            "total": 29,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        }
    ]
};

  function getManifest() {
    return MANIFEST;
  }

  function getTopicEntry(topic) {
    const want = typeof B1Topics !== 'undefined' && B1Topics.normalizeB1Topic
      ? B1Topics.normalizeB1Topic(topic)
      : String(topic || '').trim();
    return (MANIFEST.topics || []).find((t) => t.topic === want) || null;
  }

  function isTopicFull(topic) {
    return !!getTopicEntry(topic)?.full;
  }

  function getFullTopics() {
    return (MANIFEST.topics || []).filter((t) => t.full).map((t) => t.topic);
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
      return isDE ? '5 Teile aus diesem Thema verfügbar' : 'All 5 parts available for this topic';
    }
    const miss = (entry.missing || []).map((t) => `T${t}`).join(', ');
    if (entry.status === 'sparse') {
      return isDE ? `Nur ${entry.total} Aufgabe(n) im Pool — viele Teile aus anderen Themen` : `Only ${entry.total} task(s) in pool — many parts from other topics`;
    }
    return isDE
      ? `Teil ${miss || '?'} fehlt — es können Alternativaufgaben erscheinen`
      : `Part ${miss || '?'} missing — alternative tasks may appear`;
  }

  function sortTopicsForSelect() {
    const rows = [...(MANIFEST.topics || [])];
    rows.sort((a, b) => {
      if (a.full !== b.full) return a.full ? -1 : 1;
      if (a.status === 'sparse' && b.status !== 'sparse') return 1;
      if (b.status === 'sparse' && a.status !== 'sparse') return -1;
      return b.total - a.total || a.topic.localeCompare(b.topic, 'de');
    });
    return rows;
  }

  function scoreWordsForTopic(words, topic) {
    const norm = typeof B1Topics !== 'undefined' ? B1Topics : null;
    const fold = norm?.foldTopicKey || ((s) => String(s || '').toLowerCase());
    const topicKey = fold(topic);
    let score = 0;
    for (const raw of words || []) {
      const w = String(raw || '').trim();
      if (!w) continue;
      const canon = norm?.normalizeB1Topic?.(w);
      if (canon === topic) { score += 5; continue; }
      const wKey = fold(w);
      if (wKey === topicKey || wKey.includes(topicKey) || topicKey.includes(wKey)) score += 2;
    }
    return score;
  }

  /** Best ✓ topic for user vocab; falls back to Technik. */
  function pickDefaultTopicForWords(words) {
    const full = getFullTopics();
    if (!full.length) return 'Technik';
    let best = full[0];
    let bestScore = -1;
    for (const topic of full) {
      const s = scoreWordsForTopic(words, topic);
      if (s > bestScore) { bestScore = s; best = topic; }
    }
    return best;
  }

  function formatPersonalExamDisplayTitle(exam, lang) {
    const isDE = String(lang || exam?.lang || 'de').toLowerCase() === 'de';
    const requested = exam?._poolRequestedTopic || exam?.topicTag || exam?.topic || '';
    const relaxed = exam?._poolRelaxedTeile || [];
    if (requested && !relaxed.length) {
      return isDE ? `Personal · ${requested}` : `Personal · ${requested}`;
    }
    if (requested && relaxed.length) {
      const altTopics = [...new Set(relaxed.map((r) => r.actualTopic).filter(Boolean))];
      const altList = altTopics.length ? altTopics.join(', ') : '';
      if (isDE) {
        return altList
          ? `Personal · ${requested} + ${altList}`
          : `Personal · ${requested} (mit Alternativaufgaben)`;
      }
      return altList
        ? `Personal · ${requested} + ${altList}`
        : `Personal · ${requested} (with alternative tasks)`;
    }
    return isDE ? 'Personal · Lesen' : 'Personal · Reading';
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
    getManifest,
    getTopicEntry,
    isTopicFull,
    getFullTopics,
    badgeLabel,
    badgeHint,
    sortTopicsForSelect,
    pickDefaultTopicForWords,
    formatPersonalExamDisplayTitle,
    formatRelaxedTeilNote,
    topicHonestyBanner,
  });
})();

if (typeof window !== 'undefined') window.PersonalLesenTopicStock = PersonalLesenTopicStock;
if (typeof module !== 'undefined') module.exports = PersonalLesenTopicStock;
