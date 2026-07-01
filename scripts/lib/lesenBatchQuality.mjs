/**
 * Comprobaciones pedagógicas estilo Goethe para batches Lesen B1.
 * Anti–word-matching + trampas de examen (scope, tiempo, opción 0, tono).
 */

const STOP = new Set([
  'eine', 'einer', 'eines', 'einem', 'einen', 'ein', 'der', 'die', 'das', 'den', 'dem', 'des',
  'und', 'oder', 'aber', 'nicht', 'auch', 'sie', 'er', 'es', 'wir', 'ihr', 'ich', 'du', 'man',
  'mit', 'von', 'zu', 'auf', 'in', 'an', 'für', 'bei', 'nach', 'vor', 'über', 'unter', 'durch',
  'als', 'wenn', 'weil', 'dass', 'ob', 'so', 'noch', 'nur', 'schon', 'sehr', 'mehr', 'kann',
  'können', 'muss', 'müssen', 'soll', 'sollen', 'will', 'wollen', 'wird', 'wurde', 'worden',
  'hat', 'hatte', 'sind', 'war', 'waren', 'wurden', 'dieser', 'diese', 'dieses', 'jeder',
  'jede', 'alle', 'viel', 'wenig', 'gut', 'neu', 'alt', 'laut', 'text', 'steht', 'sagt',
  'möchte', 'sucht', 'braucht', 'ohne', 'dort', 'hier', 'gern', 'gerne', 'ganz', 'text',
]);

const EDUCATIONAL_PHRASES = [
  'abschließend lässt sich sagen',
  'experten raten',
  'bewusstsein fördern',
  'im gegenteil',
  'wie wir sehen',
  'zusammenfassend',
  'es ist wichtig zu',
  'man sollte wissen',
];

const SCOPE_TRAP_WORDS = /\b(alle|jede|jeder|immer|nie|nur|ausschließlich|täglich|jeden tag|jede woche|komplett|ohne ausnahme|mindestens fünf|mindestens 5)\b/i;

const SEMANTIC_FAMILIES = [
  ['tablet', 'touchscreen', 'smartphone', 'gerät', 'geräte', 'ipad', 'surf', 'laptop', 'computer', 'technik', 'digital', 'drucker', 'router', 'wlan'],
  ['erwerb', 'kauf', 'anschaff', 'besitzen', 'eigenes', 'erwerben', 'verkauf'],
  ['fahrzeug', 'auto', 'wagen', 'modell', 'kfz', 'gebrauchtwagen', 'probefahrt', 'motor', 'transportmittel', 'gefährt', 'aufbereit', 'werkstatt'],
  ['repar', 'kaputt', 'defekt', 'elektro', 'ausgefallen', 'tropf', 'kleingerät', 'wasserkocher'],
  ['miet', 'leihen', 'kurzzeit', 'mobilität', 'nutzung', 'spontan', 'fahren', 'führerschein'],
  ['garant', 'sicherheit', 'zuverläss', 'prüfbericht', 'absicherung', 'versprechen', 'schriftlich', 'hu'],
  ['stempel', 'bonus', 'treue', 'stamm', 'rabatt', 'preis', 'günstig', 'kostenlos', 'sparen', 'vergünst', 'gebühr', 'cent'],
  ['formell', 'brief', 'email', 'mail', 'schreib', 'schrift', 'korrespond', 'formulier', 'büro', 'kunden', 'ton', 'business'],
  ['koch', 'küche', 'essen', 'rezept'],
  ['reise', 'urlaub', 'flug', 'hotel', 'unterkunft', 'pauschal'],
  ['nachhilfe', 'unterricht', 'schüler', 'prüfung', 'mathe', 'physik'],
  ['versand', 'liefer', 'bestell', 'express', 'sofort', 'warten', 'netz', 'shop', 'abholung'],
  ['pfleg', 'reinig', 'aufbereit', 'politur', 'glanz'],
  ['beschenk', 'geschenk', 'einsteiger', 'schritt', 'kurs'],
  ['kinder', 'mutter', 'kleinkind', 'samstag', 'vormittag'],
];

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zäöüß\-]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

function familyOf(word) {
  const w = String(word).toLowerCase();
  for (const fam of SEMANTIC_FAMILIES) {
    if (fam.some((f) => w.includes(f) || f.includes(w))) return fam[0];
  }
  return null;
}

export function sharedContentTokens(a, b) {
  const setA = new Set(tokenize(a));
  return tokenize(b).filter((t) => setA.has(t));
}

export function sharedSemanticFamilies(a, b) {
  const fa = new Set();
  const fb = new Set();
  for (const t of tokenize(a)) {
    const f = familyOf(t);
    if (f) fa.add(f);
  }
  for (const t of tokenize(b)) {
    const f = familyOf(t);
    if (f) fb.add(f);
  }
  return [...fa].filter((f) => fb.has(f));
}

export function hasLongLiteralOverlap(a, b, minWords = 4) {
  const wa = String(a || '').toLowerCase().replace(/[^a-zäöüß\s]/gi, ' ').split(/\s+/).filter(Boolean);
  const wb = String(b || '').toLowerCase().replace(/[^a-zäöüß\s]/gi, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i <= wa.length - minWords; i++) {
    const slice = wa.slice(i, i + minWords).join(' ');
    if (wb.join(' ').includes(slice)) return slice;
  }
  for (let i = 0; i <= wb.length - minWords; i++) {
    const slice = wb.slice(i, i + minWords).join(' ');
    if (wa.join(' ').includes(slice)) return slice;
  }
  return null;
}

export function optionLetter(opt) {
  const m = String(opt || '').trim().match(/^([A-Ja-j])\)/);
  return m ? m[1].toUpperCase() : null;
}

export function getOptionByLetter(options, letter) {
  const want = String(letter || '').toUpperCase();
  if (want === '0') return '';
  return (options || []).find((o) => optionLetter(o) === want) || '';
}

export function optionTitle(optText) {
  const s = String(optText || '');
  return s.split(/[—–:-]/)[0].replace(/^[A-J]\)\s*/, '').trim();
}

function passageById(batch, passageId) {
  return (batch.passages || []).find((p) => p.id === passageId) || null;
}

export { passageById };

function countThematicCompetitors(options, correctLetter) {
  if (correctLetter === '0') return 0;
  const correctOpt = getOptionByLetter(options, correctLetter);
  const correctFamilies = new Set(tokenize(correctOpt).map(familyOf).filter(Boolean));
  if (!correctFamilies.size) return 0;
  let others = 0;
  for (const opt of options || []) {
    const letter = optionLetter(opt);
    if (!letter || letter === correctLetter) continue;
    const fams = tokenize(opt).map(familyOf).filter(Boolean);
    if (fams.some((f) => correctFamilies.has(f))) others++;
  }
  return others;
}

function hasEducationalTone(text) {
  const low = String(text || '').toLowerCase();
  return EDUCATIONAL_PHRASES.some((p) => low.includes(p));
}

function checkTeil1(batch, issues, warnings) {
  // Structural counts: T1 = exactly 1 passage + 6 richtig/falsch items
  const passageCount = (batch.passages || []).length;
  const questionCount = (batch.questions || []).length;
  if (passageCount !== 1) {
    issues.push(`Teil 1: debe tener exactamente 1 pasaje (tiene ${passageCount})`);
  }
  if (questionCount !== 6) {
    issues.push(`Teil 1: debe tener exactamente 6 preguntas (tiene ${questionCount})`);
  }

  const passage = batch.passages?.[0];
  if (!passage) {
    issues.push('Teil 1: falta pasaje');
    return;
  }
  const body = `${passage.title || ''} ${passage.text || ''}`;
  if (hasEducationalTone(body)) {
    issues.push('Teil 1: tono demasiado educativo/moralizante en el pasaje');
  }

  // T1 must be a first-person personal narrative (blog, diary, email)
  // — informational/institutional texts are an official format violation
  if (!/\b(ich|mir|meine|mich)\b/i.test(passage.text || '')) {
    issues.push(
      'Teil 1: el pasaje carece de pronombres en primera persona (ich/mir/mein/mich) — ' +
      'T1 debe ser un relato personal (blog, diario, mail), no un texto informativo',
    );
  } else {
    const allQ = (batch.questions || [])
      .map((q) => `${q.question || ''} ${q.explanation || ''}`)
      .join(' ');
    const male = /\b(Er|ihm|seine|seinen|seinem|seiner)\b/.test(allQ);
    const female = /\b(Sie|ihre|ihren|ihrer|ihrem)\b/.test(allQ);
    if (male && female) {
      issues.push(
        'Teil 1: pronombres inconsistentes (mezcla er/seine e sie/ihre sobre el mismo pasaje en ich)',
      );
    }
  }

  let falsch = 0;
  let richtig = 0;
  let falschWithScopeTrap = 0;

  for (const q of batch.questions || []) {
    const ans = String(q.correctAnswer || q.correct).toLowerCase();
    if (ans === 'falsch') falsch++;
    if (ans === 'richtig') richtig++;

    const literal = hasLongLiteralOverlap(q.question, body, 4);
    if (literal) {
      issues.push(`${q.id}: afirmación copia literal del pasaje («${literal}»)`);
    }
    const shared = [...new Set(sharedContentTokens(q.question, body))];
    if (shared.length >= 3) {
      issues.push(`${q.id}: ≥3 palabras idénticas con el pasaje (${shared.slice(0, 5).join(', ')})`);
    }
    if (ans === 'falsch' && SCOPE_TRAP_WORDS.test(q.question)) {
      falschWithScopeTrap++;
    }
  }

  if (falsch < 2) issues.push('Teil 1: menos de 2 afirmaciones Falsch');
  if (richtig < 2) issues.push('Teil 1: menos de 2 afirmaciones Richtig');
  // NOTA: se eliminó el requisito de "≥N Falsch con trampa de alcance" porque creaba el patrón
  // "palabra absoluta → Falsch" que permite adivinar sin leer. La correlación la detecta CHK-10
  // en el auditor externo. No forzamos ningún requisito de scope-trap aquí.
}

function checkMcq(batch, teil, issues) {
  const literalMinWords = Number(teil) === 5 ? 5 : 4;
  for (const q of batch.questions || []) {
    const passage = passageById(batch, q.passageId);
    if (!passage) continue;
    const body = `${passage.title || ''} ${passage.text || ''}`;
    const correctOpt = (q.options || []).find((o) => {
      const letter = String(q.correctAnswer || q.correct || '').toLowerCase().replace(/[^a-d]/g, '');
      return String(o).toLowerCase().trim().startsWith(`${letter})`);
    });
    if (!correctOpt) continue;
    const optText = String(correctOpt).replace(/^[a-d]\)\s*/i, '');
    const literal = hasLongLiteralOverlap(optText, body, literalMinWords);
    if (literal) {
      issues.push(`${q.id}: opción correcta copia ≥${literalMinWords} palabras del pasaje («${literal}»)`);
    }
    const qShared = sharedContentTokens(q.question, optText);
    if (qShared.length >= 3) {
      issues.push(`${q.id}: pregunta y opción correcta comparten demasiadas palabras (${qShared.join(', ')})`);
    }
  }
  if (batch.passages?.[0] && hasEducationalTone(batch.passages[0].text)) {
    issues.push(`Teil ${teil}: tono demasiado educativo en el pasaje`);
  }

  // Sesgo de respuesta — ninguna letra debe superar el 60% en un mismo batch
  const total = (batch.questions || []).length;
  if (total >= 5) {
    const letterCounts = {};
    for (const q of batch.questions || []) {
      const letter = String(q.correctAnswer || q.correct || '')
        .toLowerCase()
        .replace(/[^a-c]/g, '');
      if (letter) letterCounts[letter] = (letterCounts[letter] || 0) + 1;
    }
    for (const [letter, count] of Object.entries(letterCounts)) {
      const pct = Math.round((count / total) * 100);
      if (pct > 60) {
        issues.push(
          `Teil ${teil}: sesgo de respuesta — opción «${letter}» es correcta en ${pct}% de las preguntas (máx 60%)`,
        );
      }
    }
  }
}

function checkTeil3(batch, issues, warnings) {
  const ads = batch.questions?.[0]?.options || [];
  if (ads.length < 10) {
    issues.push('Teil 3: se esperan 10 anuncios A–J en options');
  }

  let zeroCount = 0;
  const usedLetters = new Set();

  for (const q of batch.questions || []) {
    const letter = String(q.correctAnswer || q.correct || '').toUpperCase().replace(/[^A-J0]/g, '');

    if (letter === '0') {
      zeroCount++;
      continue;
    }

    usedLetters.add(letter);
    const correctOpt = getOptionByLetter(q.options, letter);
    if (!correctOpt) {
      issues.push(`${q.id}: no se encuentra la opción correcta ${letter}`);
      continue;
    }

    const shared = sharedContentTokens(q.question, correctOpt);
    if (shared.length >= 2) {
      issues.push(`${q.id}: situación↔anuncio comparten tokens (${shared.join(', ')})`);
    }
    const families = sharedSemanticFamilies(q.question, correctOpt);
    if (families.length >= 2) {
      issues.push(`${q.id}: ≥2 familias semánticas compartidas (${families.join(', ')})`);
    }
    const titleShared = sharedContentTokens(q.question, optionTitle(correctOpt));
    if (titleShared.length >= 1) {
      issues.push(`${q.id}: titular del anuncio correcto delata respuesta (${titleShared.join(', ')})`);
    }
    const literal = hasLongLiteralOverlap(q.question, correctOpt, 3);
    if (literal) {
      issues.push(`${q.id}: solapamiento literal («${literal}»)`);
    }
    const competitors = countThematicCompetitors(q.options, letter);
    if (competitors < 2) {
      issues.push(`${q.id}: solo ${competitors} distractor(es) temático(s) peligroso(s) — mínimo 2`);
    }
  }

  if (zeroCount < 1) {
    issues.push('Teil 3: falta al menos 1 situación con respuesta 0 (ningún anuncio encaja)');
  }
  if (usedLetters.size < 6) {
    warnings.push(`Teil 3: solo ${usedLetters.size} anuncios distintos usados como clave (objetivo ≥6)`);
  }

  // [I3] Unicidad de Anzeigen — cada letra (A–J) debe aparecer como clave máximo 1 vez
  const letterCounts = {};
  for (const q of batch.questions || []) {
    const letter = String(q.correctAnswer || q.correct || '').toUpperCase().replace(/[^A-J]/g, '');
    if (!letter) continue;
    letterCounts[letter] = (letterCounts[letter] || 0) + 1;
  }
  for (const [letter, count] of Object.entries(letterCounts)) {
    if (count > 1) {
      issues.push(
        `Teil 3: el anuncio ${letter} se asigna como respuesta correcta ${count} veces. ` +
        'Cada anuncio solo puede ser clave una vez — cambia una de las situaciones.',
      );
    }
  }

  const adTexts = ads.map((a) => String(a).replace(/^[A-J]\)\s*/, ''));
  const hasTimeLimit = adTexts.filter((t) => /\b(nur|mo–|di|sa |uhr|termin|bis )\b/i.test(t)).length;
  if (hasTimeLimit < 4) {
    warnings.push('Teil 3: pocos anuncios con restricción temporal (nur/Di–Sa/Uhr) — trampas Goethe');
  }

  // Diversidad de personajes — aviso si el mismo apellido aparece en ≥3 situaciones
  const COMMON_SURNAMES = /\b(Ott|Müller|Schmidt|Schneider|Fischer|Weber|Meyer|Wagner|Becker|Schulz)\b/gi;
  const surnameCount = {};
  for (const q of batch.questions || []) {
    const matches = (q.question || '').match(COMMON_SURNAMES) || [];
    for (const m of matches) {
      const key = m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
      surnameCount[key] = (surnameCount[key] || 0) + 1;
    }
  }
  for (const [name, count] of Object.entries(surnameCount)) {
    if (count >= 3) {
      warnings.push(
        `Teil 3: personaje «${name}» aparece en ${count} situaciones — diversifica los personajes`,
      );
    }
  }
}

// Keywords that strongly indicate the commenter is AGAINST the proposal
const NEIN_SIGNALS = [
  /\b(bin dagegen|sage ich nein|lehne ab|lehnt ab|bin gegen|bin nicht daf.r|stimme nicht zu|nicht einverstanden|nicht gut|nicht richtig|nicht sinnvoll)\b/i,
];
// Keywords that strongly indicate the commenter is FOR the proposal
const JA_SIGNALS = [
  /\b(bin daf.r|unterstütze|stimme zu|finde ich gut|finde es gut|ist gut|ist richtig|ist sinnvoll|befürworte|ist eine gute|halte .+ für (sinnvoll|richtig|gut))\b/i,
];
// Negation patterns that must NOT appear in T4 question text
const NEGATION_IN_QUESTION = /\b(nicht|kein|lehnt|gegen|ablehnen|widerspricht|abgelehnt)\b/i;

function signTextStance(signText) {
  const t = signText || '';
  if (NEIN_SIGNALS.some((r) => r.test(t))) return 'Nein';
  if (JA_SIGNALS.some((r) => r.test(t))) return 'Ja';
  return null;
}

function checkTeil4(batch, issues, warnings) {
  const qs = batch.questions || [];
  for (const q of qs) {
    const passage = passageById(batch, q.passageId);
    if (!passage) continue;
    const literal = hasLongLiteralOverlap(q.question, passage.text || '', 4);
    if (literal) {
      issues.push(`${q.id}: pregunta copia literal del foro («${literal}»)`);
    }

    // [C2] Question text must NOT contain negation — the official format uses
    // one affirmative proposition ("Ist die Person FÜR den Vorschlag?")
    if (NEGATION_IN_QUESTION.test(q.question || '')) {
      issues.push(
        `${q.id}: T4 — pregunta contiene negación ("${q.question.match(NEGATION_IN_QUESTION)?.[0]}"). ` +
        'Las preguntas T4 deben ser afirmativas: "Ist [Person] FÜR den Vorschlag?"',
      );
    }

    // [C1] Coherence check: signText stance must match `correct`
    const stance = signTextStance(q.signText || '');
    const declared = String(q.correct || q.correctAnswer || '').trim();
    if (stance && declared && stance !== declared) {
      issues.push(
        `${q.id}: T4 — clave invertida. signText indica «${stance}» pero correct="${declared}". ` +
        'Ajusta correct/correctAnswer para que coincida con la postura del signText.',
      );
    }
  }

  // Sesgo Ja/Nein — máximo 60% de una respuesta (≤4 de 7 = 57%).
  // Umbral previo (74%) permitía 68% Ja en el corpus → bajamos a 62%.
  const total = qs.length;
  if (total >= 5) {
    const jaCount = qs.filter(
      (q) => String(q.correctAnswer || q.correct || '').toLowerCase() === 'ja',
    ).length;
    const jaPct = Math.round((jaCount / total) * 100);
    const neinPct = 100 - jaPct;
    if (jaPct > 62) {
      issues.push(
        `Teil 4: sesgo grave — Ja=${jaPct}% (máx 62%). ` +
        `Cambia ${jaCount - Math.round(total * 0.57)} Ja→Nein reescribiendo el signText correspondiente.`,
      );
    } else if (neinPct > 62) {
      issues.push(
        `Teil 4: sesgo grave — Nein=${neinPct}% (máx 62%). ` +
        `Cambia ${(total - jaCount) - Math.round(total * 0.57)} Nein→Ja reescribiendo el signText correspondiente.`,
      );
    }
  }
}

/**
 * @returns {{ ok: boolean, issues: string[], warnings: string[], scoreEstimate: number }}
 */
export function checkLesenBatchQuality(batch, teil) {
  const issues = [];
  const warnings = [];
  const t = Number(teil);

  if (!batch?.questions?.length) {
    return { ok: false, issues: ['Batch sin preguntas'], warnings: [], scoreEstimate: 0 };
  }

  if (t === 1) checkTeil1(batch, issues, warnings);
  else if (t === 2) {
    // T2 structural check: exactly 2 passages, exactly 6 questions (3 per passage)
    const pc = (batch.passages || []).length;
    const qc = (batch.questions || []).length;
    if (pc !== 2) issues.push(`Teil 2: debe tener exactamente 2 pasajes (tiene ${pc})`);
    if (qc !== 6) issues.push(`Teil 2: debe tener exactamente 6 preguntas (tiene ${qc})`);
    checkMcq(batch, t, issues);
  } else if (t === 5) checkMcq(batch, t, issues);
  else if (t === 3) checkTeil3(batch, issues, warnings);
  else if (t === 4) checkTeil4(batch, issues, warnings);

  const penalty = issues.length * 8 + warnings.length * 2;
  const scoreEstimate = Math.max(0, Math.min(100, 100 - penalty));
  const ok = issues.length === 0;
  return { ok, issues, warnings, scoreEstimate };
}

export function formatQualityReport(result) {
  const lines = [];
  if (result.ok) {
    lines.push(`Calidad pedagógica OK ✅ (estimación ~${result.scoreEstimate}%)`);
  } else {
    lines.push(`Calidad pedagógica FAIL (${result.issues.length} problemas, estimación ~${result.scoreEstimate}%)`);
    lines.push(...result.issues.map((i) => `  - ${i}`));
  }
  if (result.warnings?.length) {
    lines.push(`Avisos (${result.warnings.length}):`);
    lines.push(...result.warnings.map((w) => `  · ${w}`));
  }
  return lines.join('\n');
}
