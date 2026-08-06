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
                "2": 3,
                "3": 5,
                "4": 4,
                "5": 3
            },
            "total": 19,
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
                "3": 6,
                "4": 3,
                "5": 5
            },
            "total": 20,
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
                "1": 4,
                "2": 3,
                "3": 12,
                "4": 3,
                "5": 6
            },
            "total": 28,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Medien",
            "counts": {
                "1": 4,
                "2": 4,
                "3": 5,
                "4": 3,
                "5": 4
            },
            "total": 20,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Wohnen",
            "counts": {
                "1": 3,
                "2": 4,
                "3": 7,
                "4": 2,
                "5": 3
            },
            "total": 19,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Konsum",
            "counts": {
                "1": 3,
                "2": 6,
                "3": 2,
                "4": 3,
                "5": 3
            },
            "total": 17,
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
                "4": 4,
                "5": 3
            },
            "total": 15,
            "filled": 5,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Familie",
            "counts": {
                "1": 6,
                "2": 4,
                "3": 3,
                "4": 6,
                "5": 5
            },
            "total": 24,
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
                "5": 15
            },
            "total": 31,
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
                "4": 3,
                "5": 3
            },
            "total": 17,
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
                "5": 6
            },
            "total": 35,
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
                "5": 3
            },
            "total": 18,
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

  return PersonalTopicStockFactory.create(MANIFEST, {
    module: 'lesen',
    moduleLabel: { de: 'Lesen', en: 'Reading' },
    teilCount: 5,
  });
})();

if (typeof window !== 'undefined') window.PersonalLesenTopicStock = PersonalLesenTopicStock;
if (typeof module !== 'undefined') module.exports = PersonalLesenTopicStock;
