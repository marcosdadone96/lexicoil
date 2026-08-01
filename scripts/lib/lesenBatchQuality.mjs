/**
 * Comprobaciones pedagógicas estilo Goethe para batches Lesen B1.
 * Anti–word-matching + trampas de examen (scope, tiempo, opción 0, tono).
 */
import { checkMcqDistinctIssues } from './mcqDistinctCheck.mjs';
import { checkGermanCapsBatch, formatGermanCapsFinding } from './germanCapsGate.mjs';
import { checkT5VocabIntegration } from './lesenT5SubtypeVocab.mjs';
import { collectExplanationOptionTextAlign } from './explanationOptionTextAlign.mjs';
import { appendG2FindingsLog } from './g2FindingsLog.mjs';
import { collectMcqLengthBiasIssues } from './mcqLengthBias.mjs';
import { checkT4TitleSeedAlignment } from './titleVariantBank.mjs';
import {
  isGenericLesenA2T4QuestionStem,
  hasLesenA2T4PersonSituation,
  lesenA2T4QuestionStem,
} from './lesenA2T4Situations.mjs';

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

function checkTeil1(batch, issues, warnings, opts = {}) {
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

  // T1 must be a first-person personal narrative (blog, diary, email) — B1 only
  const level = String(opts?.level || batch?.level || batch?.questions?.[0]?.level || 'B1').toUpperCase();
  if (level !== 'A2' && !/\b(ich|mir|meine|mich)\b/i.test(passage.text || '')) {
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

function checkMcq(batch, teil, issues, opts = {}) {
  const level = opts.level || batch?.level || batch?.questions?.[0]?.level || 'B1';
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

  if (Number(teil) === 2) {
    const distinct = checkMcqDistinctIssues(batch, 2);
    issues.push(...distinct.issues);
  }

  if (Number(teil) === 2 || (Number(teil) === 5 && level !== 'B2')) {
    issues.push(...collectMcqLengthBiasIssues(batch, { level }));
  } else if (level === 'A2' && (Number(teil) === 1 || Number(teil) === 3)) {
    // A2 Lesen T1/T3 = MCQ a/b/c — mismo anti length-bias que T2.
    issues.push(...collectMcqLengthBiasIssues(batch, { level }));
  }

  if (Number(teil) === 5 && level !== 'B2') {
    const vocabGate = checkT5VocabIntegration(batch);
    if (!vocabGate.ok && vocabGate.message) {
      issues.push(vocabGate.message);
    }
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
  /\b(bin dagegen|sage ich nein|lehne ab|lehne.{0,25}ab|lehnt ab|bin gegen|bin nicht daf.r|stimme nicht zu|nicht einverstanden|nicht gut|nicht richtig|nicht sinnvoll)\b/i,
];
// Keywords that strongly indicate the commenter is FOR the proposal
const JA_SIGNALS = [
  /\b(bin daf.r|unterstütze|stimme zu|finde ich gut|finde ich.{0,25}gut|finde es gut|ist gut|ist richtig|ist sinnvoll|befürworte|ist eine gute|halte .+ für (sinnvoll|richtig|gut))\b/i,
];
// Negation patterns that must NOT appear in T4 question text
const NEGATION_IN_QUESTION = /\b(nicht|kein|lehnt|gegen|ablehnen|widerspricht|abgelehnt)\b/i;

/** T4 forum titles must not end on a dangling prep/article (truncated LLM output). */
const T4_TITLE_DANGLING_TAIL =
  /^(?:im|am|zum|zur|vom|für|mit|und|oder|zu|an|auf|in|von|bei|nach|vor|über|unter|durch|als|die|der|das|den|dem|des|ein|eine|einen|einem|einer|eines|pro|sehr|mehr|nur|schon|noch|beim)$/i;

export function checkLesenT4TitleComplete(title, debateSeed = null) {
  const t = String(title || '').trim();
  if (!t) return { ok: false, reason: 'título vacío' };

  const beforeJaNein = t.replace(/\s*[—–-]\s*ja oder nein\?$/i, '').trim();
  const core = beforeJaNein.replace(/[.!?:…]+$/u, '').trim();
  const last = (core.split(/\s+/).pop() || '').replace(/[^\p{L}\p{N}-]/gu, '');
  if (T4_TITLE_DANGLING_TAIL.test(last)) {
    return {
      ok: false,
      reason: /ja oder nein\?$/i.test(t)
        ? `sufijo «ja oder nein?» sobre frase incompleta (termina en «${last}»)`
        : `título truncado (termina en «${last}»)`,
    };
  }
  if (core.length < 24) {
    return { ok: false, reason: 'título demasiado corto para Meinungsforum' };
  }

  if (debateSeed) {
    const align = checkT4TitleSeedAlignment(t, debateSeed);
    if (!align.ok) {
      return { ok: false, reason: align.issue || 'título no alineado con _debateSeed' };
    }
  }
  return { ok: true };
}

export function signTextStance(signText) {
  const t = signText || '';
  if (NEIN_SIGNALS.some((r) => r.test(t))) return 'Nein';
  if (JA_SIGNALS.some((r) => r.test(t))) return 'Ja';
  return null;
}

function checkTeil4(batch, issues, warnings) {
  const qs = batch.questions || [];
  for (const p of batch.passages || []) {
    const titleCheck = checkLesenT4TitleComplete(
      p.title,
      batch._debateSeed || batch.debateSeed || null,
    );
    if (!titleCheck.ok) {
      issues.push(
        `${p.id || 'passage'}: T4 — ${titleCheck.reason}. «${String(p.title || '').slice(0, 80)}»`,
      );
    }
  }
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

function checkLesenA2Teil2(batch, issues) {
  const stockRe = /stock|etage|obergeschoss|untergeschoss|erdgeschoss|welchem stock|welcher etage/i;
  const qs = batch.questions || [];
  let stockQs = 0;
  let andererStockOpts = 0;
  for (const q of qs) {
    const stem = String(q.question || '');
    if (stockRe.test(stem)) stockQs++;
    const opts = (q.options || []).map((o) => String(o).toLowerCase()).join(' ');
    if (/anderer stock|anderes stockwerk|einem anderen stock/i.test(opts)) andererStockOpts++;
  }
  if (stockQs < 4) {
    issues.push(`Lesen A2 T2: mínimo 4/5 preguntas con fórmula Stock/Etage (tiene ${stockQs})`);
  }
  if (andererStockOpts < 4) {
    issues.push(`Lesen A2 T2: mínimo 4/5 preguntas con opción «anderer Stock» (tiene ${andererStockOpts})`);
  }
}

function checkLesenA2Teil4(batch, issues, warnings) {
  const passages = batch.passages || [];
  if (passages.length !== 6) {
    issues.push(`Lesen A2 T4: se esperan exactamente 6 anuncios (tiene ${passages.length})`);
  }
  const qs = batch.questions || [];
  if (qs.length !== 5) {
    issues.push(`Lesen A2 T4: se esperan exactamente 5 preguntas matching (tiene ${qs.length})`);
  }
  const expectedOpts = ['a', 'b', 'c', 'd', 'e', 'f', 'X'];
  let xCount = 0;
  let personSitu = 0;
  for (const q of qs) {
    const opts = (q.options || []).map((o) => String(o).replace(/^[a-z]\)\s*/i, '').trim());
    const normOpts = opts.length === 7 ? opts : (q.options || []).map((o) => String(o).trim().toLowerCase().replace(/^\w\)\s*/, ''));
    if (normOpts.join(',') !== expectedOpts.join(',')) {
      const flat = (q.options || []).map((o) => String(o).trim());
      if (flat.join(',') !== expectedOpts.join(',')) {
        issues.push(`${q.id}: Lesen A2 T4 opciones deben ser ["a","b","c","d","e","f","X"]`);
      }
    }
    const correct = String(q.correct || q.correctAnswer || '').trim();
    if (correct.toUpperCase() === 'X') xCount++;
    if (correct.toLowerCase() === 'g') {
      issues.push(`${q.id}: Lesen A2 T4 usa "g" — debe ser "X"`);
    }
    const stem = lesenA2T4QuestionStem(q);
    if (hasLesenA2T4PersonSituation(stem)) {
      personSitu++;
    }
    if (isGenericLesenA2T4QuestionStem(stem)) {
      issues.push(
        `${q.id}: Lesen A2 T4 — enunciado genérico «Welche Anzeige passt?» sin mini-situación (usar persona + Bedarf im question-Feld).`,
      );
    }
  }
  if (xCount !== 1) {
    issues.push(`Lesen A2 T4: exactamente 1 pregunta con correct "X" (tiene ${xCount})`);
  }
  if (personSitu < 4) {
    issues.push(`Lesen A2 T4: mínimo 4/5 enunciados con mini-situación y persona (tiene ${personSitu})`);
  }
}

function checkLesenB2Teil1Forum(batch, issues, warnings) {
  const ps = batch.passages || [];
  const qs = batch.questions || [];
  if (ps.length !== 4) {
    issues.push(`Lesen B2 T1: se esperan 4 passages Personen (tiene ${ps.length})`);
  }
  if (qs.length !== 9) {
    issues.push(`Lesen B2 T1: se esperan 9 matching (tiene ${qs.length})`);
  }
  const official =
    'Lesen Sie in einem Forum, wie Menschen über ein Thema denken.\nAuf welche der vier Personen treffen die einzelnen Aussagen zu? Die Personen können mehrmals gewählt werden.';
  const blob = qs.map((q) => q.question).join('\n');
  if (!blob.includes('Forum') && !batch._examInstructionIncluded) {
    warnings.push('Lesen B2 T1: consigna oficial del Modellsatz no visible en questions (UI puede inyectarla)');
  }
  void official;

  const personIds = new Map(ps.map((p, i) => [String(p.personKey || 'ABCD'[i] || '').toUpperCase(), p]));
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const q of qs) {
    if (String(q.type || '').toLowerCase() !== 'matching') {
      issues.push(`${q.id}: Lesen B2 T1 type debe ser matching`);
    }
    const ans = String(q.correctAnswer ?? q.correct ?? '').toUpperCase();
    if (!/^[ABCD]$/.test(ans)) {
      issues.push(`${q.id}: Lesen B2 T1 correct debe ser A|B|C|D (tiene ${ans || '?'})`);
    } else counts[ans] = (counts[ans] || 0) + 1;

    const opts = (q.options || []).map((o) => String(o).trim());
    if (opts.length && !opts.every((o) => /^[ABCD]$/i.test(o))) {
      if (!opts.every((o) => /^[abcd][).:\s]/i.test(o) || /^person\s*[abcd]/i.test(o))) {
        issues.push(`${q.id}: options deben ser A,B,C,D`);
      }
    }
    const pid = q.passageId;
    const passage = ps.find((p) => p.id === pid);
    if (!passage) {
      issues.push(`${q.id}: passageId no enlaza a ninguna Person`);
    } else if (passage.id && ans) {
      const pk = String(passage.personKey || '').toUpperCase();
      if (pk && pk !== ans) {
        issues.push(`${q.id}: correct ${ans} no coincide con personKey ${pk} del passageId`);
      }
    }
    if (passage) {
      const literal = hasLongLiteralOverlap(q.question, passage.text || '', 4);
      if (literal) {
        issues.push(`${q.id}: afirmación copia literal del Beitrag («${literal}»)`);
      }
    }
  }
  for (const k of ['A', 'B', 'C', 'D']) {
    if ((counts[k] || 0) < 1) issues.push(`Lesen B2 T1: Person ${k} nunca es respuesta correcta`);
  }
  const repeated = Object.values(counts).filter((n) => n >= 2).length;
  if (repeated < 1) {
    issues.push('Lesen B2 T1: falta repetición de persona (Modellsatz: können mehrmals gewählt werden)');
  }
  for (const p of ps) {
    const w = String(p.text || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    if (w < 80 || w > 180) {
      issues.push(`Lesen B2 T1 ${p.title || p.id}: ${w} Wörter (80–180)`);
    }
  }
}

const B2_LESEN_T2_INSTRUCTION =
  'Lesen Sie in einer Zeitschrift einen Artikel.\nWelche Sätze passen in die Lücken? Zwei Sätze passen nicht.';

function optionLetterFromString(opt) {
  const m = String(opt || '').trim().match(/^([A-Ha-h])[).:\s]/);
  return m ? m[1].toUpperCase() : null;
}

function sentenceBodyFromOption(opt) {
  return String(opt || '')
    .replace(/^[A-Ha-h][).:\s]\s*/, '')
    .trim()
    .toLowerCase();
}

function contentTokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zäöüß\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

function tokenOverlapScore(a, b) {
  const ta = new Set(contentTokens(a));
  const tb = new Set(contentTokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.min(ta.size, tb.size);
}

/** Split article at (21)…(26) into gap contexts (before/after each marker). */
function gapContextsFromArticle(text) {
  const markers = [21, 22, 23, 24, 25, 26];
  const parts = String(text || '').split(/\(\s*(2[1-6])\s*\)/);
  const contexts = [];
  for (let i = 0; i < markers.length; i++) {
    const before = parts[i * 2] || '';
    const after = parts[i * 2 + 2] || '';
    contexts.push(`${before.slice(-220)} ${after.slice(0, 220)}`.trim());
  }
  return contexts;
}

function checkLesenB2Teil3PressMcq(batch, issues, warnings) {
  const ps = batch.passages || [];
  const qs = batch.questions || [];
  if (ps.length !== 1) {
    issues.push(`Lesen B2 T3: se espera 1 passage (tiene ${ps.length})`);
  }
  if (qs.length !== 6) {
    issues.push(`Lesen B2 T3: se esperan 6 MCQ (tiene ${qs.length})`);
  }
  const p0 = ps[0];
  if (p0) {
    const w = String(p0.text || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    if (w < 350 || w > 500) {
      issues.push(`Lesen B2 T3: Zeitungsartikel ${w} Wörter (350–500)`);
    }
  }
  const q0 = qs[0]?.question || '';
  if (
    !q0.includes('Zeitung') ||
    !q0.includes('Wählen Sie bei jeder Aufgabe die richtige Lösung')
  ) {
    warnings.push('Lesen B2 T3: consigna oficial no visible en Q1');
  }
  for (const q of qs) {
    if (String(q.type || '').toLowerCase() !== 'multiple_choice') {
      issues.push(`${q.id}: Lesen B2 T3 type debe ser multiple_choice`);
    }
    const opts = q.options || [];
    if (opts.length !== 3) {
      issues.push(`${q.id}: Lesen B2 T3 debe tener 3 opciones a/b/c (tiene ${opts.length})`);
    }
  }
  checkMcq(batch, 3, issues, { level: 'B2' });
  issues.push(...collectMcqLengthBiasIssues(batch, { level: 'B2' }));
}

function checkLesenB2Teil2SentenceInsertion(batch, issues, warnings) {
  const ps = batch.passages || [];
  const qs = batch.questions || [];
  if (ps.length !== 1) {
    issues.push(`Lesen B2 T2: se espera 1 passage (tiene ${ps.length})`);
  }
  if (qs.length !== 6) {
    issues.push(`Lesen B2 T2: se esperan 6 matching (tiene ${qs.length})`);
  }
  const p0 = ps[0];
  if (p0) {
    const w = String(p0.text || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    if (w < 250 || w > 400) {
      issues.push(`Lesen B2 T2: artículo ${w} Wörter (250–400)`);
    }
    const marks = String(p0.text || '').match(/\(\s*2[1-6]\s*\)/g) || [];
    if (marks.length !== 6) {
      issues.push(`Lesen B2 T2: se esperan 6 marcadores (21)–(26) (tiene ${marks.length})`);
    }
  }

  const blob = qs.map((q) => q.question).join('\n');
  if (!blob.includes('Zeitschrift') && !blob.includes('Lücken')) {
    warnings.push('Lesen B2 T2: consigna oficial no visible en questions (UI puede inyectarla)');
  }

  const optionSets = qs.map((q) => JSON.stringify((q.options || []).map(String)));
  const uniqOpts = new Set(optionSets);
  if (uniqOpts.size > 1) {
    issues.push('Lesen B2 T2: las 6 preguntas deben compartir la misma lista de 8 Sätze A–H');
  }

  const firstOpts = qs[0]?.options || [];
  if (firstOpts.length !== 8) {
    issues.push(`Lesen B2 T2: se esperan 8 options A–H (tiene ${firstOpts.length})`);
  } else {
    for (let i = 0; i < 8; i++) {
      const letter = String.fromCharCode(65 + i);
      const got = optionLetterFromString(firstOpts[i]);
      if (got !== letter) {
        issues.push(`Lesen B2 T2: option[${i}] debe empezar por ${letter})`);
      }
    }
  }

  const sentenceByLetter = new Map();
  for (const opt of firstOpts) {
    const L = optionLetterFromString(opt);
    if (L) sentenceByLetter.set(L, sentenceBodyFromOption(opt));
  }

  const correctLetters = [];
  const gapNums = [21, 22, 23, 24, 25, 26];
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    if (String(q.type || '').toLowerCase() !== 'matching') {
      issues.push(`${q.id}: Lesen B2 T2 type debe ser matching`);
    }
    const ans = String(q.correctAnswer ?? q.correct ?? '').toUpperCase().replace(/^([A-H]).*/, '$1');
    if (!/^[A-H]$/.test(ans)) {
      issues.push(`${q.id}: correct debe ser A–H (tiene ${ans || '?'})`);
    } else correctLetters.push(ans);

    const expectGap = gapNums[i];
    if (expectGap && !String(q.question || '').includes(`(${expectGap})`)) {
      issues.push(`${q.id}: pregunta debe referir Lücke (${expectGap})`);
    }
  }

  const used = new Set(correctLetters);
  if (correctLetters.length === 6 && new Set(correctLetters).size !== 6) {
    issues.push('Lesen B2 T2: las 6 respuestas correctas deben ser 6 letras distintas (cada Satz una vez)');
  }
  if (used.size === 6) {
    const spare = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].filter((k) => !used.has(k));
    if (spare.length !== 2) {
      issues.push(`Lesen B2 T2: deben quedar exactamente 2 Sätze sobrantes (sobran ${spare.length} letras sin usar)`);
    }
  }

  if (p0?.text && sentenceByLetter.size === 8 && gapContextsFromArticle(p0.text).length === 6) {
    const contexts = gapContextsFromArticle(p0.text);
    for (let gi = 0; gi < 6; gi++) {
      const q = qs[gi];
      if (!q) continue;
      const correctL = String(q.correctAnswer ?? q.correct ?? '').toUpperCase();
      const sent = sentenceByLetter.get(correctL) || '';
      const scoreOwn = tokenOverlapScore(sent, contexts[gi]);
      for (let gj = 0; gj < 6; gj++) {
        if (gj === gi) continue;
        const scoreOther = tokenOverlapScore(sent, contexts[gj]);
        if (scoreOther >= 0.45 && scoreOther >= scoreOwn - 0.05) {
          issues.push(
            `${q.id}: posible ambigüedad — Satz ${correctL} encaja también en Lücke (${gapNums[gj]}) (solapamiento léxico)`,
          );
          break;
        }
      }
    }
    for (const [letter, sent] of sentenceByLetter) {
      if (used.has(letter)) continue;
      let high = 0;
      for (const ctx of contexts) {
        const sc = tokenOverlapScore(sent, ctx);
        if (sc > high) high = sc;
      }
      if (high >= 0.5) {
        issues.push(`Lesen B2 T2: Satz sobrante ${letter} parece encajar demasiado bien en alguna Lücke (ambigüedad)`);
      }
    }
  }
}

const B2_LESEN_T4_INSTRUCTION =
  'Lesen Sie in einer Zeitschrift Meinungsäußerungen.\nWelche Äußerung passt zu welcher Überschrift? Eine Äußerung passt nicht.';

function checkLesenB2Teil4OpinionHeadline(batch, issues, warnings) {
  const ps = batch.passages || [];
  const qs = batch.questions || [];
  if (ps.length !== 6) {
    issues.push(`Lesen B2 T4: se esperan 6 Meinungsäußerungen en passages (tiene ${ps.length})`);
  }
  if (qs.length !== 6) {
    issues.push(`Lesen B2 T4: se esperan 6 matching (tiene ${qs.length})`);
  }
  for (const p of ps) {
    const w = String(p.text || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    if (w < 40 || w > 100) {
      issues.push(`Lesen B2 T4 ${p.id || p.title || '?'}: ${w} Wörter (40–100)`);
    }
  }
  for (const q of qs) {
    if (String(q.type || '').toLowerCase() === 'ja_nein') {
      issues.push(`${q.id}: Lesen B2 T4 PROHIBIDO ja_nein (formato Meinung↔Überschrift)`);
    }
  }

  const q0 = qs[0]?.question || '';
  if (!q0.includes('Meinungsäußerungen') && !q0.includes('Überschrift')) {
    warnings.push('Lesen B2 T4: consigna oficial no visible en Q1');
  } else if (qs[0] && !String(qs[0].question || '').includes('Meinungsäußerungen')) {
    warnings.push('Lesen B2 T4: falta «Meinungsäußerungen» en instrucción Q1');
  }

  const optionSets = qs.map((q) => JSON.stringify((q.options || []).map(String)));
  if (new Set(optionSets).size > 1) {
    issues.push('Lesen B2 T4: las 6 preguntas deben compartir la misma lista de 8 Überschriften A–H');
  }

  const firstOpts = qs[0]?.options || [];
  if (firstOpts.length !== 8) {
    issues.push(`Lesen B2 T4: se esperan 8 options A–H (tiene ${firstOpts.length})`);
  } else {
    for (let i = 0; i < 8; i++) {
      const letter = String.fromCharCode(65 + i);
      if (optionLetterFromString(firstOpts[i]) !== letter) {
        issues.push(`Lesen B2 T4: option[${i}] debe empezar por ${letter})`);
      }
    }
  }

  const headlineByLetter = new Map();
  for (const opt of firstOpts) {
    const L = optionLetterFromString(opt);
    if (L) headlineByLetter.set(L, sentenceBodyFromOption(opt));
  }

  const passageById = new Map(ps.map((p) => [p.id, String(p.text || '')]));
  const correctLetters = [];
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    if (String(q.type || '').toLowerCase() !== 'matching') {
      issues.push(`${q.id}: Lesen B2 T4 type debe ser matching`);
    }
    const ans = String(q.correctAnswer ?? q.correct ?? '')
      .trim()
      .replace(/^([A-H]).*/, '$1')
      .toUpperCase();
    if (!/^[A-H]$/.test(ans)) {
      issues.push(`${q.id}: correct debe ser A–H (tiene ${ans || '?'})`);
    } else correctLetters.push(ans);
    const pid = q.passageId;
    if (!pid || !passageById.has(pid)) {
      issues.push(`${q.id}: passageId debe apuntar a una de las 6 Meinungen`);
    }
    if (!String(q.question || '').match(/Meinung\s*\(\d+\)/i)) {
      warnings.push(`${q.id}: enunciado debería referir Meinung (n)`);
    }
  }

  const used = new Set(correctLetters);
  if (correctLetters.length === 6 && new Set(correctLetters).size !== 6) {
    issues.push('Lesen B2 T4: las 6 respuestas correctas deben ser 6 letras distintas');
  }
  if (used.size === 6) {
    const spare = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].filter((k) => !used.has(k));
    if (spare.length !== 2) {
      issues.push(`Lesen B2 T4: deben quedar exactamente 2 Überschriften sobrantes (sobran ${spare.length})`);
    }
  }

  if (headlineByLetter.size === 8 && passageById.size >= 6) {
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      const opinionText = passageById.get(q.passageId) || '';
      const correctL = String(q.correctAnswer ?? q.correct ?? '').toUpperCase();
      const headline = headlineByLetter.get(correctL) || '';
      const scoreOwn = tokenOverlapScore(headline, opinionText);
      for (let j = 0; j < qs.length; j++) {
        if (j === i) continue;
        const otherOp = passageById.get(qs[j].passageId) || '';
        const scoreOther = tokenOverlapScore(headline, otherOp);
        if (scoreOther >= 0.42 && scoreOther >= scoreOwn - 0.06) {
          issues.push(
            `${q.id}: posible ambigüedad — Überschrift ${correctL} encaja también con Meinung ${j + 1} (solapamiento léxico)`,
          );
          break;
        }
      }
    }
    for (const [letter, headline] of headlineByLetter) {
      if (used.has(letter)) continue;
      let high = 0;
      for (const text of passageById.values()) {
        high = Math.max(high, tokenOverlapScore(headline, text));
      }
      if (high >= 0.48) {
        issues.push(
          `Lesen B2 T4: Überschrift sobrante ${letter} parece encajar demasiado con alguna Meinung (ambigüedad)`,
        );
      }
    }
  }
}

const B2_LESEN_T5_INSTRUCTION =
  'Lesen Sie die Studienordnung.\nWelche Überschriften aus dem Inhaltsverzeichnis passen zu den Paragrafen? Vier Überschriften werden nicht gebraucht.';

const B2_T5_GAP_MARKERS = [31, 32, 33];

function gapContextsFromB2RulesText(text) {
  const parts = String(text || '').split(/\(\s*(3[1-3])\s*\)/);
  const contexts = [];
  for (let i = 0; i < B2_T5_GAP_MARKERS.length; i++) {
    const before = parts[i * 2] || '';
    const after = parts[i * 2 + 2] || '';
    contexts.push(`${before.slice(-280)} ${after.slice(0, 280)}`.trim());
  }
  return contexts;
}

function checkLesenB2Teil5RulesMatching(batch, issues, warnings) {
  const ps = batch.passages || [];
  const qs = batch.questions || [];
  if (ps.length !== 1) {
    issues.push(`Lesen B2 T5: se espera 1 Studienordnung en passages (tiene ${ps.length})`);
  }
  if (qs.length !== 3) {
    issues.push(`Lesen B2 T5: se esperan 3 matching (tiene ${qs.length})`);
  }
  const p0 = ps[0];
  if (p0) {
    const w = String(p0.text || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    if (w < 200 || w > 350) {
      issues.push(`Lesen B2 T5: Studienordnung ${w} Wörter (200–350)`);
    }
    const marks = String(p0.text || '').match(/\(\s*3[1-3]\s*\)/g) || [];
    if (marks.length !== 3) {
      issues.push(`Lesen B2 T5: se esperan 3 marcadores (31)–(33) (tiene ${marks.length})`);
    }
  }

  for (const q of qs) {
    if (String(q.type || '').toLowerCase() === 'multiple_choice') {
      issues.push(`${q.id}: Lesen B2 T5 PROHIBIDO MCQ B1 (formato Überschriften matching)`);
    }
  }

  const q0 = qs[0]?.question || '';
  if (!q0.includes('Studienordnung') && !q0.includes('Paragrafen')) {
    warnings.push('Lesen B2 T5: consigna oficial no visible en Q1');
  }

  const optionSets = qs.map((q) => JSON.stringify((q.options || []).map(String)));
  if (new Set(optionSets).size > 1) {
    issues.push('Lesen B2 T5: las 3 preguntas deben compartir la misma lista de 7 Überschriften A–G');
  }

  const firstOpts = qs[0]?.options || [];
  if (firstOpts.length !== 7) {
    issues.push(`Lesen B2 T5: se esperan 7 options A–G (tiene ${firstOpts.length})`);
  } else {
    for (let i = 0; i < 7; i++) {
      const letter = String.fromCharCode(65 + i);
      const got = optionLetterFromString(firstOpts[i]);
      if (got !== letter) {
        issues.push(`Lesen B2 T5: option[${i}] debe empezar por ${letter})`);
      }
    }
  }

  const headingByLetter = new Map();
  for (const opt of firstOpts) {
    const L = optionLetterFromString(opt);
    if (L) headingByLetter.set(L, sentenceBodyFromOption(opt));
  }

  const solePassageId = p0?.id;
  const correctLetters = [];
  const gapNums = B2_T5_GAP_MARKERS;
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    if (String(q.type || '').toLowerCase() !== 'matching') {
      issues.push(`${q.id}: Lesen B2 T5 type debe ser matching`);
    }
    const ans = String(q.correctAnswer ?? q.correct ?? '')
      .trim()
      .replace(/^([A-G]).*/, '$1')
      .toUpperCase();
    if (!/^[A-G]$/.test(ans)) {
      issues.push(`${q.id}: correct debe ser A–G (tiene ${ans || '?'})`);
    } else correctLetters.push(ans);
    if (solePassageId && q.passageId && q.passageId !== solePassageId) {
      issues.push(`${q.id}: passageId debe ser la Studienordnung ${solePassageId}`);
    }
    const expectGap = gapNums[i];
    if (expectGap && !String(q.question || '').includes(`(${expectGap})`)) {
      issues.push(`${q.id}: pregunta debe referir Paragraf (${expectGap})`);
    }
  }

  const used = new Set(correctLetters);
  if (correctLetters.length === 3 && new Set(correctLetters).size !== 3) {
    issues.push('Lesen B2 T5: las 3 respuestas correctas deben ser 3 letras distintas');
  }
  if (used.size === 3) {
    const spare = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].filter((k) => !used.has(k));
    if (spare.length !== 4) {
      issues.push(`Lesen B2 T5: deben quedar exactamente 4 Überschriften sobrantes (sobran ${spare.length})`);
    }
  }

  if (p0?.text && headingByLetter.size === 7 && gapContextsFromB2RulesText(p0.text).length === 3) {
    const contexts = gapContextsFromB2RulesText(p0.text);
    for (let i = 0; i < 3; i++) {
      const q = qs[i];
      if (!q) continue;
      const correctL = String(q.correctAnswer ?? q.correct ?? '').toUpperCase();
      const headline = headingByLetter.get(correctL) || '';
      const scoreOwn = tokenOverlapScore(headline, contexts[i]);
      for (let gj = 0; gj < 3; gj++) {
        if (gj === i) continue;
        const scoreOther = tokenOverlapScore(headline, contexts[gj]);
        if (scoreOther >= 0.42 && scoreOther >= scoreOwn - 0.06) {
          issues.push(
            `${q.id}: posible ambigüedad — Überschrift ${correctL} encaja también con Paragraf (${gapNums[gj]}) (solapamiento léxico)`,
          );
          break;
        }
      }
    }
    for (const [letter, headline] of headingByLetter) {
      if (used.has(letter)) continue;
      let high = 0;
      for (const ctx of contexts) {
        high = Math.max(high, tokenOverlapScore(headline, ctx));
      }
      if (high >= 0.48) {
        issues.push(
          `Lesen B2 T5: Überschrift sobrante ${letter} parece encajar demasiado con algún Paragraf (ambigüedad)`,
        );
      }
    }
  }
}

/**
 * @returns {{ ok: boolean, issues: string[], warnings: string[], scoreEstimate: number }}
 */
export function checkLesenBatchQuality(batch, teil, opts = {}) {
  const issues = [];
  const warnings = [];
  const t = Number(teil);
  const level = String(opts.level || batch?.level || batch?.questions?.[0]?.level || 'B1').toUpperCase();
  const isA2 = level === 'A2';

  if (!batch?.questions?.length && !(level === 'B2' && t === 1 && opts.forumPhasePassage)) {
    return { ok: false, issues: ['Batch sin preguntas'], warnings: [], scoreEstimate: 0 };
  }

  if (t === 1) {
    if (level === 'B2') checkLesenB2Teil1Forum(batch, issues, warnings);
    else if (isA2) checkMcq(batch, t, issues, { level });
    else checkTeil1(batch, issues, warnings, opts);
  } else if (t === 2) {
    if (level === 'B2') {
      checkLesenB2Teil2SentenceInsertion(batch, issues, warnings);
    } else if (isA2) {
      const pc = (batch.passages || []).length;
      const qc = (batch.questions || []).length;
      if (pc !== 1) issues.push(`Teil 2 A2: debe tener exactamente 1 pasaje/plano (tiene ${pc})`);
      if (qc !== 5) issues.push(`Teil 2 A2: debe tener exactamente 5 preguntas (tiene ${qc})`);
      checkMcq(batch, t, issues, { level });
      checkLesenA2Teil2(batch, issues);
    } else {
      const pc = (batch.passages || []).length;
      const qc = (batch.questions || []).length;
      if (pc !== 2) issues.push(`Teil 2: debe tener exactamente 2 pasajes (tiene ${pc})`);
      if (qc !== 6) issues.push(`Teil 2: debe tener exactamente 6 preguntas (tiene ${qc})`);
      checkMcq(batch, t, issues, { level });
    }
  } else if (t === 3) {
    if (level === 'B2') checkLesenB2Teil3PressMcq(batch, issues, warnings);
    else if (isA2) checkMcq(batch, t, issues, { level });
    else checkTeil3(batch, issues, warnings);
  } else if (t === 5) {
    if (level === 'B2') checkLesenB2Teil5RulesMatching(batch, issues, warnings);
    else checkMcq(batch, t, issues, { level });
  } else if (t === 4) {
    if (isA2) checkLesenA2Teil4(batch, issues, warnings);
    else if (level === 'B2') checkLesenB2Teil4OpinionHeadline(batch, issues, warnings);
    else checkTeil4(batch, issues, warnings);
  }

  const caps = checkGermanCapsBatch(batch);
  if (!opts.skipG2Log) {
    appendG2FindingsLog(batch, { capsResult: caps, file: opts.file, teil: opts.teil ?? t });
  }
  if (caps.warnings?.length) warnings.push(...caps.warnings);
  const gateMode = String(process.env.GERMAN_CAPS_GATE || 'warn').toLowerCase();
  if (gateMode !== 'off' && !caps.skipped && caps.findings?.length) {
    for (const f of caps.findings) {
      const msg = `Mayúsculas alemanas: ${formatGermanCapsFinding(f)}`;
      if (gateMode === 'warn') warnings.push(msg);
      else issues.push(msg);
    }
  }

  const explAlign = collectExplanationOptionTextAlign(batch);
  for (const b of explAlign.blocking) issues.push(b.message);
  for (const w of explAlign.warnings) warnings.push(w.message);

  const penalty = issues.length * 8 + warnings.length * 2;
  const scoreEstimate = Math.max(0, Math.min(100, 100 - penalty));
  const ok = issues.length === 0;
  return { ok, issues, warnings, scoreEstimate, capsGate: caps };
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
