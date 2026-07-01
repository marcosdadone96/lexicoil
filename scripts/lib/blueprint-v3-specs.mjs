/**
 * Official verified blueprint v3 specs — all 18 exams.
 * Part counts sourced from Goethe Modellsatz, Cambridge 2020 handbooks, examenes.cervantes.es.
 */

/** @typedef {{ itemsTotal: number, label?: string, slotType?: string, taskFormat?: string, instruction?: string, [key: string]: unknown }} PartSpec */
/** @typedef {{ time?: string, maxPoints?: number, parts: (number | PartSpec)[] }} ModuleSpec */

/**
 * @typedef {object} BlueprintV3Spec
 * @property {string} fileId
 * @property {string} id
 * @property {'goethe'|'cambridge'|'dele'} examType
 * @property {'de'|'en'|'es'} language
 * @property {string} level
 * @property {string} certificate
 * @property {string} [source]
 * @property {boolean} [modularGrading]
 * @property {number} [passPercentPerModule]
 * @property {number} [maxPointsPerModule]
 * @property {object} [passRule]
 * @property {Record<string, ModuleSpec>} modules
 * @property {Record<string, string>} [notes]
 * @property {boolean} [verifyPending]
 */

/** Shared DELE pass rule (all levels). */
export const DELE_PASS_RULE = {
  scope: 'dele-groups',
  grupo1: { modules: ['lesen', 'schreiben'], minPoints: 30, maxPoints: 50 },
  grupo2: { modules: ['horen', 'sprechen'], minPoints: 30, maxPoints: 50 },
  description:
    'Grupo 1 (Comprensión de lectura + Expresión escrita) ≥ 30/50 UND Grupo 2 (Comprensión auditiva + Expresión oral) ≥ 30/50.',
};

/** @type {Record<string, BlueprintV3Spec>} */
export const BLUEPRINT_V3_SPECS = {
  goethe_A1: {
    fileId: 'goethe_A1',
    id: 'goethe-a1',
    examType: 'goethe',
    language: 'de',
    level: 'A1',
    certificate: 'Goethe-Zertifikat A1 (Start Deutsch 1)',
    source: 'Goethe-Institut Start Deutsch 1 — Modellsatz (Lesen 3×5, Hören 3×5, Schreiben 2, Sprechen 3)',
    modularGrading: false,
    maxPointsPerModule: 25,
    passRule: {
      scope: 'whole-exam-total',
      minTotalPoints: 60,
      maxTotalPoints: 100,
      description: 'Gesamtprüfung ≥ 60/100 Punkte; nicht modular (kein passPercentPerModule).',
    },
    modules: {
      lesen: { time: '25 Minuten', maxPoints: 25, parts: [5, 5, 5] },
      horen: { time: '20 Minuten', maxPoints: 25, parts: [5, 5, 5] },
      schreiben: { time: '20 Minuten', maxPoints: 25, parts: [1, 1] },
      sprechen: { time: '15 Minuten', maxPoints: 25, parts: [1, 1, 1] },
    },
    notes: {
      noGrammarModule: 'Start Deutsch 1 hat KEIN separates Grammatikmodul — nur Lesen, Hören, Schreiben, Sprechen.',
      nonModularGrading: 'Bestehen über Gesamtpunkte 60/100, nicht pro Modul.',
    },
  },

  goethe_A2: {
    fileId: 'goethe_A2',
    id: 'goethe-a2',
    examType: 'goethe',
    language: 'de',
    level: 'A2',
    certificate: 'Goethe-Zertifikat A2',
    source: 'Goethe-Institut A2 Modellsatz Erwachsene (Lesen/Hören je 4×5=20, Schreiben 2, Sprechen 3)',
    modularGrading: false,
    passRule: {
      scope: 'whole-exam',
      writtenMin: { points: 45, of: 75 },
      speakingMin: { points: 15, of: 25 },
    },
    modules: {
      lesen: { time: '30 Minuten', maxPoints: 25, parts: [5, 5, 5, 5] },
      horen: { time: '30 Minuten', maxPoints: 25, parts: [5, 5, 5, 5] },
      schreiben: { time: '30 Minuten', maxPoints: 25, parts: [1, 1] },
      sprechen: { time: '15 Minuten', maxPoints: 25, parts: [1, 1, 1] },
    },
    notes: {
      officialSource: 'goethe.de A2_Modellsatz_Erwachsene.pdf — 20 Messpunkte Lesen/Hören/Schreiben, ×1.25 → 25 Pkt/Modul.',
    },
  },

  goethe_B1: {
    fileId: 'goethe_B1',
    id: 'goethe-b1',
    examType: 'goethe',
    language: 'de',
    level: 'B1',
    certificate: 'Goethe-Zertifikat B1',
    source: 'Goethe-Institut B1 Modellsatz (Lesen 6/6/7/7/4, Hören 10/5/7/8, Schreiben 3, Sprechen 3)',
    modularGrading: true,
    passPercentPerModule: 60,
    modules: {
      lesen: { time: '65 Minuten', maxPoints: 100, parts: [6, 6, 7, 7, 4] },
      horen: { time: '40 Minuten', maxPoints: 100, parts: [10, 5, 7, 8] },
      schreiben: { time: '60 Minuten', maxPoints: 100, parts: [1, 1, 1] },
      sprechen: { time: '15 Minuten', maxPoints: 100, parts: [1, 1, 1] },
    },
    notes: {
      officialSource: 'bfu.goethe.de/b1_mod + Durchführungsbestimmungen B1 — 30 Items/Modul Lesen & Hören.',
    },
  },

  goethe_B2: {
    fileId: 'goethe_B2',
    id: 'goethe-b2',
    examType: 'goethe',
    language: 'de',
    level: 'B2',
    certificate: 'Goethe-Zertifikat B2',
    source: 'Goethe-Institut B2 Modellsatz (Lesen 9/6/6/6/3, Hören 10/6/6/8, Schreiben 2, Sprechen 2)',
    modularGrading: true,
    passPercentPerModule: 60,
    modules: {
      lesen: { time: '65 Minuten', maxPoints: 100, parts: [9, 6, 6, 6, 3] },
      horen: { time: '40 Minuten', maxPoints: 100, parts: [10, 6, 6, 8] },
      schreiben: { time: '80 Minuten', maxPoints: 100, parts: [1, 1] },
      sprechen: { time: '15 Minuten', maxPoints: 100, parts: [1, 1] },
    },
    notes: {
      officialSource: 'goethe.de B2 Modellsatz Erwachsene — 30 Items Lesen & Hören.',
    },
  },

  goethe_C1: {
    fileId: 'goethe_C1',
    id: 'goethe-c1',
    examType: 'goethe',
    language: 'de',
    level: 'C1',
    certificate: 'Goethe-Zertifikat C1',
    source: 'Goethe-Institut Modellsatz C1 (Lesen 8/7/8/7, Hören 6/9/8/7, Schreiben 2, Sprechen 2)',
    modularGrading: true,
    passPercentPerModule: 60,
    maxPointsPerModule: 100,
    modules: {
      lesen: { time: '70 Minuten', maxPoints: 100, parts: [8, 7, 8, 7] },
      horen: { time: '40 Minuten', maxPoints: 100, parts: [6, 9, 8, 7] },
      schreiben: { time: '80 Minuten', maxPoints: 100, parts: [1, 1] },
      sprechen: { time: '15 Minuten (15 Minuten Vorbereitung)', maxPoints: 100, parts: [1, 1] },
    },
    notes: {
      noGrammarModule: 'Goethe C1 hat KEIN separates Grammatikmodul.',
      modularGrading: 'passPercentPerModule 60, modularGrading true, maxPoints 100 pro Modul.',
    },
  },

  goethe_C2: {
    fileId: 'goethe_C2',
    id: 'goethe-c2',
    examType: 'goethe',
    language: 'de',
    level: 'C2',
    certificate: 'Goethe-Zertifikat C2',
    source: 'Goethe-Institut Modellsatz C2 (Lesen 10/6/6/8, Hören 15/5/10 — 3 Teile, Schreiben 2, Sprechen 2)',
    modularGrading: true,
    passPercentPerModule: 60,
    maxPointsPerModule: 100,
    modules: {
      lesen: { time: '80 Minuten', maxPoints: 100, parts: [10, 6, 6, 8] },
      horen: { time: '35 Minuten', maxPoints: 100, parts: [15, 5, 10] },
      schreiben: { time: '80 Minuten', maxPoints: 100, parts: [1, 1] },
      sprechen: { time: '15 Minuten (15 Minuten Vorbereitung)', maxPoints: 100, parts: [1, 1] },
    },
    notes: {
      noGrammarModule: 'Goethe C2 hat KEIN separates Grammatikmodul.',
      horenItemCounts: 'Hören hat 3 Teile (15/5/10 Items); Teil 1 oft mehrere Kurztexte mit je 1–2 Aufgaben.',
      modularGrading: 'passPercentPerModule 60, modularGrading true.',
    },
  },

  cambridge_A1: {
    fileId: 'cambridge_A1',
    id: 'cambridge-a1',
    examType: 'cambridge',
    language: 'en',
    level: 'A1',
    certificate: 'A1 Movers (Cambridge English Qualifications)',
    source: 'Cambridge YLE Movers handbook 2018 — mapped as closest A1 proxy (not main-suite A1)',
    modularGrading: true,
    passPercentPerModule: 60,
    modules: {
      lesen: {
        time: '30 minutes',
        parts: [5, 6, 6, 5, 7],
      },
      schreiben: { time: '30 minutes (Part 6 of R&W)', parts: [{ itemsTotal: 6, label: 'Part 6 — Write sentences about a picture' }] },
      horen: { time: 'about 25 minutes', parts: [5, 5, 5, 5, 5] },
      sprechen: { time: '5–7 minutes', parts: [1, 1, 1, 1] },
    },
    notes: {
      moversMapping:
        'Proxied from Cambridge A1 Movers (YLE), not a main-suite A1 exam. Reading parts 1–5 of R&W (29 items); writing = R&W Part 6 (6 items).',
      noUseOfEnglishModule: 'Four modules only: lesen, horen, schreiben, sprechen — no separate use_of_english.',
      verifyPending: 'No Cambridge main-suite A1 exam — counts from YLE Movers handbook 2018 only.',
    },
    verifyPending: true,
  },

  cambridge_A2: {
    fileId: 'cambridge_A2',
    id: 'cambridge-a2',
    examType: 'cambridge',
    language: 'en',
    level: 'A2',
    certificate: 'A2 Key',
    source: 'Cambridge A2 Key handbook 2020 (Reading 6/7/5/6/6=30; Writing 2 parts; Listening 5×5=25; Speaking 2 parts)',
    modularGrading: true,
    passPercentPerModule: 60,
    modules: {
      lesen: { time: '60 minutes (reading sections)', parts: [6, 7, 5, 6, 6] },
      schreiben: { time: '60 minutes (writing sections)', parts: [1, 1] },
      horen: { time: '30 minutes', parts: [5, 5, 5, 5, 5] },
      sprechen: { time: '8–10 minutes', parts: [1, 1] },
    },
    notes: {
      readingWritingSplit: 'Official paper combines R&W; lesen = Parts 1–5 (30 Q), schreiben = Parts 6–7 (2 tasks).',
      noUseOfEnglishModule: 'Merged into lesen — no use_of_english module.',
    },
  },

  cambridge_B1: {
    fileId: 'cambridge_B1',
    id: 'cambridge-b1',
    examType: 'cambridge',
    language: 'en',
    level: 'B1',
    certificate: 'B1 Preliminary',
    source: 'Cambridge B1 Preliminary handbook 2020 (Reading 5/5/5/5/6/6=32; Listening 7/6/6/6=25; Speaking 4 parts)',
    modularGrading: true,
    passPercentPerModule: 60,
    modules: {
      lesen: { time: '45 minutes', parts: [5, 5, 5, 5, 6, 6] },
      schreiben: { time: '45 minutes', parts: [1, 1] },
      horen: { time: '30 minutes', parts: [7, 6, 6, 6] },
      sprechen: { time: '12–17 minutes', parts: [1, 1, 1, 1] },
    },
    notes: {
      noUseOfEnglishModule: 'Four modules only; reading counts from standalone Reading paper (32 items).',
    },
  },

  cambridge_B2: {
    fileId: 'cambridge_B2',
    id: 'cambridge-b2',
    examType: 'cambridge',
    language: 'en',
    level: 'B2',
    certificate: 'B2 First',
    source: 'Cambridge B2 First handbook 2020 (R&UoE 8/8/8/6/6/6/10=52 merged into lesen; Listening 8/10/5/7=30)',
    modularGrading: true,
    passPercentPerModule: 60,
    modules: {
      lesen: { time: '75 minutes', parts: [8, 8, 8, 6, 6, 6, 10] },
      schreiben: { time: '80 minutes', parts: [1, 1] },
      horen: { time: '40 minutes', parts: [8, 10, 5, 7] },
      sprechen: { time: '14 minutes per pair', parts: [1, 1, 1, 1] },
    },
    notes: {
      mergedReadingUseOfEnglish: 'Full Reading and Use of English paper (7 parts, 52 Q) mapped to lesen module.',
      noUseOfEnglishModule: 'No separate use_of_english — merged into lesen.',
    },
  },

  cambridge_C1: {
    fileId: 'cambridge_C1',
    id: 'cambridge-c1',
    examType: 'cambridge',
    language: 'en',
    level: 'C1',
    certificate: 'C1 Advanced',
    source: 'Cambridge C1 Advanced handbook 2020 (R&UoE 8/8/8/6/6/4/6/10=56; Listening 6/8/6/10=30)',
    modularGrading: true,
    passPercentPerModule: 60,
    modules: {
      lesen: { time: '90 minutes', parts: [8, 8, 8, 6, 6, 4, 6, 10] },
      schreiben: { time: '90 minutes', parts: [1, 1] },
      horen: { time: '40 minutes', parts: [6, 8, 6, 10] },
      sprechen: { time: '15 minutes per pair', parts: [1, 1, 1, 1] },
    },
    notes: {
      mergedReadingUseOfEnglish: 'Full Reading and Use of English paper (8 parts, 56 Q) mapped to lesen.',
      noUseOfEnglishModule: 'No separate use_of_english — merged into lesen.',
    },
  },

  cambridge_C2: {
    fileId: 'cambridge_C2',
    id: 'cambridge-c2',
    examType: 'cambridge',
    language: 'en',
    level: 'C2',
    certificate: 'C2 Proficiency',
    source: 'Cambridge C2 Proficiency handbook (R&UoE 8/8/8/6/6/7/10=53; Listening 6/9/5/10=30)',
    modularGrading: true,
    passPercentPerModule: 60,
    modules: {
      lesen: { time: '90 minutes', parts: [8, 8, 8, 6, 6, 7, 10] },
      schreiben: { time: '90 minutes', parts: [1, 1] },
      horen: { time: '40 minutes', parts: [6, 9, 5, 10] },
      sprechen: { time: '16 minutes per pair', parts: [1, 1, 1, 1] },
    },
    notes: {
      mergedReadingUseOfEnglish: 'Full Reading and Use of English paper (7 parts, 53 Q) mapped to lesen.',
      noUseOfEnglishModule: 'No separate use_of_english — merged into lesen.',
    },
  },

  dele_A1: {
    fileId: 'dele_A1',
    id: 'dele-a1',
    examType: 'dele',
    language: 'es',
    level: 'A1',
    certificate: 'DELE A1',
    source: 'DELE A1 modelo v2020 — examenes.cervantes.es (Lesen 5/6/6/8, Hören 5/5/8/7, Schreiben 2, Sprechen 3)',
    passRule: DELE_PASS_RULE,
    modules: {
      lesen: { time: '45 min', maxPoints: 25, parts: [5, 6, 6, 8] },
      horen: { time: '25 min', maxPoints: 25, parts: [5, 5, 8, 7] },
      schreiben: { time: '25 min', maxPoints: 25, parts: [1, 1] },
      sprechen: { time: '15 min', maxPoints: 25, parts: [1, 1, 1] },
    },
    notes: {
      deleGroups: 'passRule scope dele-groups: grupo1 lesen+schreiben ≥30/50, grupo2 horen+sprechen ≥30/50.',
    },
  },

  dele_A2: {
    fileId: 'dele_A2',
    id: 'dele-a2',
    examType: 'dele',
    language: 'es',
    level: 'A2',
    certificate: 'DELE A2',
    source: 'DELE A2 modelo v2020 — examenes.cervantes.es (Lesen 5/8/6/6, Hören 6/6/6/7, Schreiben 2, Sprechen 3)',
    passRule: DELE_PASS_RULE,
    modules: {
      lesen: { time: '60 min', maxPoints: 25, parts: [5, 8, 6, 6] },
      horen: { time: '35 min', maxPoints: 25, parts: [6, 6, 6, 7] },
      schreiben: { time: '50 min', maxPoints: 25, parts: [1, 1] },
      sprechen: { time: '15 min', maxPoints: 25, parts: [1, 1, 1] },
    },
    notes: {
      deleGroups: 'passRule scope dele-groups: grupo1 lesen+schreiben ≥30/50, grupo2 horen+sprechen ≥30/50.',
    },
  },

  dele_B1: {
    fileId: 'dele_B1',
    id: 'dele-b1',
    examType: 'dele',
    language: 'es',
    level: 'B1',
    certificate: 'DELE B1',
    source: 'DELE B1 — examenes.cervantes.es (Lesen 6×5, Hören 6×5, Schreiben 2, Sprechen 4)',
    passRule: DELE_PASS_RULE,
    modules: {
      lesen: { time: '70 min', maxPoints: 25, parts: [6, 6, 6, 6, 6] },
      horen: { time: '40 min', maxPoints: 25, parts: [6, 6, 6, 6, 6] },
      schreiben: { time: '60 min', maxPoints: 25, parts: [1, 1] },
      sprechen: { time: '15 min', maxPoints: 25, parts: [1, 1, 1, 1] },
    },
    notes: {
      deleGroups: 'passRule scope dele-groups: grupo1 lesen+schreiben ≥30/50, grupo2 horen+sprechen ≥30/50.',
    },
  },

  dele_B2: {
    fileId: 'dele_B2',
    id: 'dele-b2',
    examType: 'dele',
    language: 'es',
    level: 'B2',
    certificate: 'DELE B2',
    source: 'DELE B2 — examenes.cervantes.es (Lesen 6/10/6/14=36, Hören 6×5=30, Schreiben 2, Sprechen 3)',
    passRule: DELE_PASS_RULE,
    modules: {
      lesen: { time: '70 min', maxPoints: 25, parts: [6, 10, 6, 14] },
      horen: { time: '40 min', maxPoints: 25, parts: [6, 6, 6, 6, 6] },
      schreiben: { time: '80 min', maxPoints: 25, parts: [1, 1] },
      sprechen: { time: '20 min', maxPoints: 25, parts: [1, 1, 1] },
    },
    notes: {
      deleGroups: 'passRule scope dele-groups: grupo1 lesen+schreiben ≥30/50, grupo2 horen+sprechen ≥30/50.',
      officialSource: 'Counts verified from examenes.cervantes.es/es/dele/examenes/b2 (2025).',
    },
  },

  dele_C1: {
    fileId: 'dele_C1',
    id: 'dele-c1',
    examType: 'dele',
    language: 'es',
    level: 'C1',
    certificate: 'DELE C1',
    source: 'DELE C1 — examenes.cervantes.es (Lesen 6/6/6/8/14=40, Hören 6/8/6/10=30, Schreiben 2, Sprechen 3)',
    passRule: DELE_PASS_RULE,
    modules: {
      lesen: { time: '90 min', maxPoints: 25, parts: [6, 6, 6, 8, 14] },
      horen: { time: '50 min', maxPoints: 25, parts: [6, 8, 6, 10] },
      schreiben: { time: '80 min', maxPoints: 25, parts: [1, 1] },
      sprechen: { time: '20 min', maxPoints: 25, parts: [1, 1, 1] },
    },
    notes: {
      deleGroups: 'passRule scope dele-groups: grupo1 lesen+schreiben ≥30/50, grupo2 horen+sprechen ≥30/50.',
      officialSource: 'Counts verified from examenes.cervantes.es/es/dele/examenes/c1.',
    },
  },

  dele_C2: {
    fileId: 'dele_C2',
    id: 'dele-c2',
    examType: 'dele',
    language: 'es',
    level: 'C2',
    certificate: 'DELE C2',
    source:
      'DELE C2 modelo 2024 — examenes.cervantes.es (Prueba 1 split: CL 12/6/8=26, CA 5/7/6/8=26; Escritura 3, Oral 3)',
    passRule: {
      scope: 'dele-c2-three-tests',
      minPointsPerTest: 20,
      tests: [
        { id: 'prueba1', modules: ['lesen', 'horen'], maxPoints: 25 },
        { id: 'prueba2', modules: ['schreiben'], maxPoints: 25 },
        { id: 'prueba3', modules: ['sprechen'], maxPoints: 25 },
      ],
      description: 'Apto si ≥20 puntos en cada una de las 3 pruebas (máx. 25 por prueba).',
    },
    modules: {
      lesen: { time: '60 min (Prueba 1 — comprensión de lectura)', maxPoints: 25, parts: [12, 6, 8] },
      horen: { time: '45 min (Prueba 1 — comprensión auditiva)', maxPoints: 25, parts: [5, 7, 6, 8] },
      schreiben: { time: '150 min', maxPoints: 25, parts: [1, 1, 1] },
      sprechen: { time: '20 min (+ 30 min prep)', maxPoints: 25, parts: [1, 1, 1] },
    },
    notes: {
      deleC2ThreeTests:
        'passRule scope dele-c2-three-tests: Apto si cada una de las 3 pruebas ≥20/25 (Prueba 1 = lectura+auditiva, Prueba 2 = escrita, Prueba 3 = oral).',
      combinedPrueba1:
        'Official Prueba 1 combines uso de la lengua + lectura + auditiva (52 items); split here: tareas 1–3 → lesen, 4–7 → horen.',
      officialSource: 'Counts verified from examenes.cervantes.es/es/dele/examenes/c2 and modelo 2024.',
    },
  },
};

/** Blueprint file IDs with v3 Modellsatz specs (all 18 exams). */
export const BLUEPRINT_V3_TARGET_IDS = Object.keys(BLUEPRINT_V3_SPECS);

/** Collect specs flagged verifyPending or with TODO notes. */
export function collectBlueprintV3Todos() {
  const todos = [];
  for (const [fileId, spec] of Object.entries(BLUEPRINT_V3_SPECS)) {
    if (spec.verifyPending) {
      todos.push({ fileId, reason: 'verifyPending: true in spec' });
    }
    if (spec.notes?.moversMapping) {
      todos.push({ fileId, reason: spec.notes.moversMapping });
    }
  }
  return todos;
}
