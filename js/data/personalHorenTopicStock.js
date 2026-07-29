// Sync: node scripts/build-pool-stock-manifest.mjs
const PersonalHorenTopicStock = (() => {
  const MANIFEST = {
    "v": 2,
    "lang": "de",
    "level": "B1",
    "module": "horen",
    "teils": [
        1,
        2,
        3,
        4
    ],
    "topics": [
        {
            "topic": "Reisen",
            "counts": {
                "1": 2,
                "2": 2,
                "3": 2,
                "4": 2
            },
            "total": 8,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "partial"
        },
        {
            "topic": "Gesundheit",
            "counts": {
                "1": 2,
                "2": 3,
                "3": 2,
                "4": 2
            },
            "total": 9,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Arbeit",
            "counts": {
                "1": 2,
                "2": 2,
                "3": 2,
                "4": 2
            },
            "total": 8,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "partial"
        },
        {
            "topic": "Technik",
            "counts": {
                "1": 3,
                "2": 4,
                "3": 3,
                "4": 2
            },
            "total": 12,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Medien",
            "counts": {
                "1": 3,
                "2": 3,
                "3": 3,
                "4": 3
            },
            "total": 12,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Wohnen",
            "counts": {
                "1": 3,
                "2": 3,
                "3": 2,
                "4": 2
            },
            "total": 10,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Konsum",
            "counts": {
                "1": 2,
                "2": 3,
                "3": 2,
                "4": 2
            },
            "total": 9,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Bildung",
            "counts": {
                "1": 3,
                "2": 3,
                "3": 3,
                "4": 2
            },
            "total": 11,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Familie",
            "counts": {
                "1": 2,
                "2": 3,
                "3": 3,
                "4": 3
            },
            "total": 11,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Umwelt",
            "counts": {
                "1": 3,
                "2": 3,
                "3": 2,
                "4": 2
            },
            "total": 10,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Ernährung",
            "counts": {
                "1": 3,
                "2": 3,
                "3": 3,
                "4": 3
            },
            "total": 12,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Kultur",
            "counts": {
                "1": 2,
                "2": 5,
                "3": 3,
                "4": 2
            },
            "total": 12,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Sport",
            "counts": {
                "1": 2,
                "2": 5,
                "3": 3,
                "4": 2
            },
            "total": 12,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Freizeit",
            "counts": {
                "1": 2,
                "2": 4,
                "3": 3,
                "4": 2
            },
            "total": 11,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Verkehr",
            "counts": {
                "1": 3,
                "2": 3,
                "3": 2,
                "4": 3
            },
            "total": 11,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        },
        {
            "topic": "Stadtleben",
            "counts": {
                "1": 3,
                "2": 4,
                "3": 2,
                "4": 2
            },
            "total": 11,
            "filled": 4,
            "missing": [],
            "full": true,
            "status": "full"
        }
    ]
};

  return PersonalTopicStockFactory.create(MANIFEST, {
    module: 'horen',
    moduleLabel: { de: 'Hören', en: 'Listening' },
    teilCount: 4,
  });
})();

if (typeof window !== 'undefined') window.PersonalHorenTopicStock = PersonalHorenTopicStock;
if (typeof module !== 'undefined') module.exports = PersonalHorenTopicStock;
