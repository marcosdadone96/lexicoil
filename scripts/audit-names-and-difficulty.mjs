/**
 * Pool measurement: recurrent person names + difficulty field calibration.
 * Read-only. Does not modify pool content.
 *
 *   node scripts/audit-names-and-difficulty.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/names-and-difficulty-audit-2026-07-11.json',
);

// --- helpers ---

function cellOf(file) {
  let m = file.match(/^lesen-t(\d)/i);
  if (m) return { module: 'lesen', teil: Number(m[1]), cell: `lesen_t${m[1]}` };
  m = file.match(/^horen-t(\d)/i);
  if (m) return { module: 'horen', teil: Number(m[1]), cell: `horen_t${m[1]}` };
  if (/^schreiben/i.test(file)) return { module: 'schreiben', teil: null, cell: 'schreiben' };
  if (/^sprechen/i.test(file)) return { module: 'sprechen', teil: null, cell: 'sprechen' };
  return { module: 'other', teil: null, cell: 'other' };
}

function collectTexts(batch) {
  const chunks = [];
  for (const p of batch.passages || []) {
    for (const k of ['title', 'text', 'transcript', 'signText', 'prompt', 'situation']) {
      if (p[k]) chunks.push(String(p[k]));
    }
  }
  for (const q of batch.questions || []) {
    for (const k of [
      'question',
      'prompt',
      'situation',
      'text',
      'explanation',
      'signText',
      'stimulus',
    ]) {
      if (q[k]) chunks.push(String(q[k]));
    }
    if (Array.isArray(q.options)) {
      for (const o of q.options) {
        if (typeof o === 'string') chunks.push(o);
        else if (o?.text) chunks.push(String(o.text));
      }
    }
    // Sprechen/Schreiben prompts often nest
    if (q.task?.prompt) chunks.push(String(q.task.prompt));
    if (q.task?.situation) chunks.push(String(q.task.situation));
  }
  return chunks.join('\n');
}

/** Role/context hints near a name occurrence (windowed). */
const ROLE_HINTS = [
  [/Nachbarin|Nachbar/i, 'Nachbar/in'],
  [/Kollegin|Kollege/i, 'Kollege/in'],
  [/Freundin|Freund\b/i, 'Freund/in'],
  [/Vermieterin|Vermieter/i, 'Vermieter/in'],
  [/Lehrerin|Lehrer\b/i, 'Lehrer/in'],
  [/Ärztin|Arzt\b/i, 'Arzt/Ärztin'],
  [/Chefin|Chef\b/i, 'Chef/in'],
  [/Kundin|Kunde\b/i, 'Kunde/in'],
  [/Mitarbeiterin|Mitarbeiter\b/i, 'Mitarbeiter/in'],
  [/Mutter|Vater|Eltern|Tochter|Sohn|Schwester|Bruder/i, 'Familie'],
  [/Moderatorin|Moderator\b/i, 'Moderator/in'],
  [/Interviewpartnerin|Interviewpartner/i, 'Interviewpartner/in'],
  [/Bewerberin|Bewerber\b/i, 'Bewerber/in'],
  [/Patientin|Patient\b/i, 'Patient/in'],
  [/Mieterin|Mieter\b/i, 'Mieter/in'],
];

function roleNear(text, index, nameLen) {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + nameLen + 80);
  const window = text.slice(start, end);
  for (const [re, label] of ROLE_HINTS) {
    if (re.test(window)) return label;
  }
  return '(sin rol claro)';
}

// Common German given names (B1 exam dialogues) — used to catch bare first names
const GIVEN = new Set(
  `
  Anna Lena Lisa Maria Sarah Julia Nina Laura Sophie Emma Laura Katharina
  Petra Susanne Claudia Monika Birgit Helga Ingrid Ursula
  Thomas Michael Peter Andreas Markus Stefan Christian Martin Daniel
  Markus Klaus Wolfgang Jürgen Helmut Hans Franz Otto
  Max Tim Tom Jan Paul Lukas Felix Jonas David Alex
  Meier Schmidt Weber Müller Fischer Wagner Becker Hoffmann Schulz
  `.split(/\s+/).filter(Boolean).map((s) => s.trim()),
);

// Titles + surname (primary pattern)
const TITLE_RE =
  /\b((?:Frau|Herr|Fräulein|Dr\.?|Prof\.?)\s+(?:[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?(?:\s+(?:von|zu|van|de)\s+[A-ZÄÖÜ][a-zäöüß]+)?))/g;

// "Liebe Frau X" already covered by TITLE_RE after Liebe stripped contextually

// First+Last without title (e.g. "Anna Keller")
const FULL_NAME_RE =
  /\b([A-ZÄÖÜ][a-zäöüß]+)\s+([A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?)\b/g;

// Bare given name as dialogue character: "Hallo, Max!" / "Max:" / speaker turns
const BARE_GIVEN_RE =
  /(?:^|[\s„"«(,:])([A-ZÄÖÜ][a-zäöüß]{2,12})(?=\s*[:!,?]|\s+(?:sagt|fragt|antwortet|meint|ruft|lacht|hört|kommt|geht|ruft))/gm;

const STOP_WORDS = new Set([
  'Der',
  'Die',
  'Das',
  'Ein',
  'Eine',
  'Und',
  'Oder',
  'Aber',
  'Wenn',
  'Weil',
  'Dass',
  'Mit',
  'Nach',
  'Vor',
  'Für',
  'Bei',
  'Zum',
  'Zur',
  'Im',
  'Am',
  'Vom',
  'Auf',
  'Aus',
  'Über',
  'Unter',
  'Seit',
  'Bis',
  'Als',
  'Wie',
  'Was',
  'Wer',
  'Wo',
  'Hier',
  'Dort',
  'Heute',
  'Morgen',
  'Gestern',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
  'Deutschland',
  'Berlin',
  'München',
  'Hamburg',
  'Köln',
  'Frankfurt',
  'Wien',
  'Österreich',
  'Schweiz',
  'Europa',
  'Internet',
  'Email',
  'Montag',
  'Goethe',
  'Institut',
  'Teil',
  'Lesen',
  'Hören',
  'Schreiben',
  'Sprechen',
  'Aufgabe',
  'Text',
  'Frage',
  'Antwort',
  'Richtig',
  'Falsch',
  'Moderator',
  'Moderatorin',
  'Persona',
  'Person',
  'Liebe',
  'Lieber',
  'Hallo',
  'Guten',
  'Tag',
  'Abend',
  'Morgen',
  'Bitte',
  'Danke',
  'Ja',
  'Nein',
  'Okay',
  'Also',
  'Gut',
  'Sehr',
  'Viele',
  'Vielen',
  'Dank',
]);

function isPlausibleSurname(s) {
  if (!s || s.length < 2) return false;
  if (STOP_WORDS.has(s)) return false;
  // German nouns are capitalized — filter very common non-name nouns
  const NON_NAME = /^(Stadt|Land|Haus|Wohnung|Arbeit|Büro|Schule|Kurs|Prüfung|Thema|Problem|Idee|Zeit|Jahr|Monat|Woche|Tag|Uhr|Euro|Prozent|Menschen|Kinder|Eltern|Freunde|Familie|Gesellschaft|Umwelt|Gesundheit|Sport|Kultur|Technik|Medien|Verkehr|Freizeit|Ernährung|Konsum|Bildung|Politik)$/i;
  return !NON_NAME.test(s);
}

function extractNames(text, fileMeta) {
  /** @type {Map<string, {count:number, files:Set<string>, cells:Set<string>, roles:Map<string,number>, examples:string[]}>} */
  const hits = new Map();

  function add(rawName, index) {
    const name = rawName.replace(/\s+/g, ' ').trim();
    if (!name || name.length < 3) return;
    // Drop "Herr Herr", title-only, etc.
    if (/^(Frau|Herr|Fräulein|Dr\.?|Prof\.?)$/i.test(name)) return;
    const role = roleNear(text, index, name.length);
    let rec = hits.get(name);
    if (!rec) {
      rec = {
        count: 0,
        files: new Set(),
        cells: new Set(),
        roles: new Map(),
        examples: [],
      };
      hits.set(name, rec);
    }
    rec.count += 1;
    rec.files.add(fileMeta.file);
    rec.cells.add(fileMeta.cell);
    rec.roles.set(role, (rec.roles.get(role) || 0) + 1);
    if (rec.examples.length < 3) {
      const s = Math.max(0, index - 40);
      const e = Math.min(text.length, index + name.length + 40);
      rec.examples.push(text.slice(s, e).replace(/\s+/g, ' ').trim());
    }
  }

  // 1) Title + surname
  TITLE_RE.lastIndex = 0;
  let m;
  while ((m = TITLE_RE.exec(text))) {
    add(m[1], m.index);
  }

  // 2) First + Last (only if first is a known given name)
  FULL_NAME_RE.lastIndex = 0;
  while ((m = FULL_NAME_RE.exec(text))) {
    const first = m[1];
    const last = m[2];
    if (STOP_WORDS.has(first) || STOP_WORDS.has(last)) continue;
    if (!GIVEN.has(first) && !GIVEN.has(last)) continue;
    // Avoid double-counting "Frau Schmidt" already caught
    const full = `${first} ${last}`;
    // Skip if this span is inside a title match we already counted — approximate:
    const before = text.slice(Math.max(0, m.index - 6), m.index);
    if (/\b(Frau|Herr|Fräulein|Dr\.?|Prof\.?)\s*$/i.test(before)) continue;
    if (isPlausibleSurname(last) || GIVEN.has(first)) add(full, m.index);
  }

  // 3) Bare given names in dialogue-ish contexts (Hören T3/T4, Sprechen)
  if (/horen_t[34]|sprechen|schreiben/i.test(fileMeta.cell)) {
    BARE_GIVEN_RE.lastIndex = 0;
    while ((m = BARE_GIVEN_RE.exec(text))) {
      const n = m[1];
      if (!GIVEN.has(n)) continue;
      if (STOP_WORDS.has(n)) continue;
      add(n, m.index + (m[0].startsWith(n) ? 0 : m[0].length - n.length));
    }
  }

  return hits;
}

function mergeHitMaps(into, from) {
  for (const [name, rec] of from) {
    let t = into.get(name);
    if (!t) {
      t = {
        count: 0,
        files: new Set(),
        cells: new Set(),
        roles: new Map(),
        examples: [],
      };
      into.set(name, t);
    }
    t.count += rec.count;
    for (const f of rec.files) t.files.add(f);
    for (const c of rec.cells) t.cells.add(c);
    for (const [role, n] of rec.roles) t.roles.set(role, (t.roles.get(role) || 0) + n);
    for (const ex of rec.examples) {
      if (t.examples.length < 5) t.examples.push(ex);
    }
  }
}

// --- main ---

const files = fs
  .readdirSync(POOL)
  .filter((f) => f.endsWith('.json') && !f.includes('.raw'))
  .sort();

const allNames = new Map();
const nameByCell = {};

// Difficulty stats
const diffGlobal = {}; // value -> count
const diffByCell = {}; // cell -> { value -> count }
const withinFileVariation = {
  filesWithQs: 0,
  filesWithVaryingDifficulty: 0,
  filesWithSingleDifficulty: 0,
  filesMissingAll: 0,
};
const questionsTotal = { with: 0, missing: 0 };
const perFileDiffSets = [];

for (const file of files) {
  const meta = { file, ...cellOf(file) };
  const batch = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
  const text = collectTexts(batch);
  const hits = extractNames(text, meta);
  mergeHitMaps(allNames, hits);
  if (!nameByCell[meta.cell]) nameByCell[meta.cell] = new Map();
  mergeHitMaps(nameByCell[meta.cell], hits);

  // difficulty
  const qs = batch.questions || [];
  const vals = [];
  const cellKey = meta.teil != null ? `${meta.module}_t${meta.teil}` : meta.module;
  // For schreiben/sprechen, also break by q.teil
  for (const q of qs) {
    const d = q.difficulty;
    const qCell =
      meta.teil != null
        ? cellKey
        : q.teil != null
          ? `${meta.module}_t${q.teil}`
          : meta.module;
    if (d == null || d === '') {
      questionsTotal.missing++;
      continue;
    }
    questionsTotal.with++;
    vals.push(d);
    diffGlobal[d] = (diffGlobal[d] || 0) + 1;
    if (!diffByCell[qCell]) diffByCell[qCell] = {};
    diffByCell[qCell][d] = (diffByCell[qCell][d] || 0) + 1;
  }
  if (qs.length) {
    withinFileVariation.filesWithQs++;
    const uniq = [...new Set(vals.map(String))];
    if (vals.length === 0) withinFileVariation.filesMissingAll++;
    else if (uniq.length === 1) withinFileVariation.filesWithSingleDifficulty++;
    else withinFileVariation.filesWithVaryingDifficulty++;
    perFileDiffSets.push({
      file,
      cell: meta.cell,
      uniqueDifficulties: uniq,
      nQuestions: qs.length,
      nWithDiff: vals.length,
    });
  }
}

function serializeNameRec(name, rec) {
  const roles = [...rec.roles.entries()].sort((a, b) => b[1] - a[1]);
  const dominantRole = roles[0] || ['(none)', 0];
  const roleDominance =
    rec.count > 0 ? Math.round((1000 * dominantRole[1]) / rec.count) / 10 : 0;
  return {
    name,
    occurrences: rec.count,
    files: rec.files.size,
    cells: [...rec.cells].sort(),
    roles: Object.fromEntries(roles),
    dominantRole: dominantRole[0],
    dominantRolePct: roleDominance,
    sameRoleHeavy: roleDominance >= 70 && rec.files.size >= 2,
    examples: rec.examples.slice(0, 3),
  };
}

const ranked = [...allNames.entries()]
  .map(([name, rec]) => serializeNameRec(name, rec))
  .sort((a, b) => b.occurrences - a.occurrences || b.files - a.files);

const top15 = ranked.slice(0, 15);
const sameRoleRecurring = ranked.filter((r) => r.sameRoleHeavy).slice(0, 20);

// Title-form focus (Frau/Herr X) — cleaner staleness signal
const titled = ranked.filter((r) => /^(Frau|Herr|Fräulein|Dr\.|Prof\.)\s/i.test(r.name));

const report = {
  generatedAt: new Date().toISOString(),
  poolFiles: files.length,
  partA: {
    uniqueNames: ranked.length,
    uniqueTitledNames: titled.length,
    totalOccurrences: ranked.reduce((s, r) => s + r.occurrences, 0),
    top15,
    top15Titled: titled.slice(0, 15),
    sameRoleRecurringTop: sameRoleRecurring,
    note:
      'Extraction: Frau/Herr/Fräulein/Dr/Prof + surname; First+Last when given name known; ' +
      'bare given names only in horen_t3/t4 + schreiben/sprechen dialogue contexts. ' +
      'Role = keyword within ±80 chars. German common nouns filtered heuristically.',
  },
  partB: {
    questionsWithDifficulty: questionsTotal.with,
    questionsMissingDifficulty: questionsTotal.missing,
    distinctValues: Object.keys(diffGlobal)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b),
    range: (() => {
      const nums = Object.keys(diffGlobal)
        .map(Number)
        .filter((n) => !Number.isNaN(n));
      if (!nums.length) return null;
      return { min: Math.min(...nums), max: Math.max(...nums) };
    })(),
    distribution: Object.fromEntries(
      Object.entries(diffGlobal).sort((a, b) => Number(a[0]) - Number(b[0])),
    ),
    distributionPct: Object.fromEntries(
      Object.entries(diffGlobal).map(([k, v]) => [
        k,
        Math.round((1000 * v) / Math.max(1, questionsTotal.with)) / 10,
      ]),
    ),
    byModuleTeil: diffByCell,
    withinFile: withinFileVariation,
    sampleVaryingFiles: perFileDiffSets
      .filter((f) => f.uniqueDifficulties.length > 1)
      .slice(0, 10),
    sampleFixedFiles: perFileDiffSets
      .filter((f) => f.uniqueDifficulties.length === 1)
      .slice(0, 5),
    codeAssignment: {
      poolPersisted: 'Almost all pool questions still have integer difficulty (template/default).',
      normalizeBatchDefaults:
        'scripts/lib/normalizeBatch.mjs normalizeDifficulty: horen→5, sprechen→5, schreiben→6, else→4 when missing/invalid.',
      sprechenPromptFixed: 'scripts/lib/examTemplatePrompt.mjs instructs difficulty:5 for Sprechen.',
      stripPoolLegacyOptionB:
        'stripPoolLegacyQuestionFields deletes difficulty for Lesen normalize path (Opción B 2026-07-10) so runtime DifficultyScorer can recompute — but current pool-verified JSON still contains persisted values.',
      runtimeScorer:
        'js/engine/validation/difficultyScorer.js scoreQuestion: if q.difficulty ∈ [1,10] SHORT-CIRCUITS and returns it; else scores via CefrGate metrics. So persisted pool values block recalculation.',
      backlog: 'BACKLOG.md DIFF-SCORE / DIFF-POOL-RO — treat pool difficulty as non-authoritative.',
    },
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log('=== PART A: Person names ===');
console.log(
  `Unique names: ${report.partA.uniqueNames} (titled: ${report.partA.uniqueTitledNames}); total hits: ${report.partA.totalOccurrences}`,
);
console.log('\nTop 15 (all forms):');
for (const r of top15) {
  console.log(
    `  ${String(r.occurrences).padStart(4)}×  ${r.name.padEnd(28)} files=${r.files}  role=${r.dominantRole} (${r.dominantRolePct}%)  cells=${r.cells.join(',')}`,
  );
}
console.log('\nTop 15 titled (Frau/Herr…):');
for (const r of titled.slice(0, 15)) {
  console.log(
    `  ${String(r.occurrences).padStart(4)}×  ${r.name.padEnd(28)} files=${r.files}  role=${r.dominantRole} (${r.dominantRolePct}%)`,
  );
}
console.log('\nSame-role heavy (dom≥70%, ≥2 files):', sameRoleRecurring.length);
for (const r of sameRoleRecurring.slice(0, 10)) {
  console.log(
    `  ${r.name}: ${r.occurrences}× role=${r.dominantRole} ${r.dominantRolePct}% files=${r.files}`,
  );
}

console.log('\n=== PART B: difficulty ===');
console.log(
  `Qs with difficulty: ${questionsTotal.with}; missing: ${questionsTotal.missing}`,
);
console.log('Distribution:', report.partB.distribution, report.partB.distributionPct);
console.log('By module/teil:', JSON.stringify(diffByCell, null, 2));
console.log('Within-file:', withinFileVariation);
console.log(`\nWrote ${OUT}`);
