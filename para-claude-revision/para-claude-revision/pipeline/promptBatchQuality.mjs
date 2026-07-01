/**
 * Calidad pedagógica de consignas Schreiben / Sprechen (rúbrica B1 Goethe).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordTokens(s) {
  return normalizeText(s).split(/\s+/).filter((w) => w.length >= 3);
}

/** Proporción de tokens compartidos sobre el texto más largo. */
export function textSimilarityRatio(a, b) {
  const ta = wordTokens(a);
  const tb = wordTokens(b);
  if (!ta.length || !tb.length) return 0;
  const setA = new Set(ta);
  let shared = 0;
  for (const w of tb) {
    if (setA.has(w)) shared++;
  }
  return shared / Math.max(ta.length, tb.length);
}

function countBulletPoints(text) {
  const bullets = (String(text).match(/(?:^|\n)\s*(?:[•\-–—]|\(\d+\)|\d+\))/gm) || []).length;
  const folgende = /\bfolgende\s+punkte\b/i.test(text) ? 2 : 0;
  return Math.max(bullets, folgende);
}

function hasWordTarget(text, target) {
  const t = String(text);
  if (target === 80) {
    return /\b(circa|ca\.?)\s*80\b|80\s*w[öo]rter/i.test(t);
  }
  if (target === 40) {
    return /\b(circa|ca\.?)\s*40\b|40\s*w[öo]rter/i.test(t);
  }
  return false;
}

function hasFormalSie(text) {
  return /\b(Sie|Ihnen|Ihre|Ihrem|Ihrer|Schreiben Sie)\b/.test(String(text));
}

function hasInformalRegister(text) {
  return /\b(du|dir|dein|deine|dich|Hey|Hallo\s+[A-Z]|Liebe\/r)\b/i.test(String(text));
}

function hasDebatableQuestion(text) {
  return /\?/.test(String(text)) || /\b(meinung|stimmen sie|was halten sie|sollte|sollten)\b/i.test(text);
}

function countArgumentPrompts(text) {
  const t = String(text);
  let n = 0;
  if (/\bargument/i.test(t)) n++;
  if (/\bbegr[üu]nd/i.test(t)) n++;
  if (/\bbeispiel/i.test(t)) n++;
  if (/\bvor-?\s*und\s*nachteil/i.test(t)) n++;
  if (/\bpro\s+und\s+contra\b/i.test(t)) n++;
  if (/\b(?:zwei|2|mindestens zwei)\s+argument/i.test(t)) n += 2;
  if (countBulletPoints(t) >= 2) n += 2;
  return n;
}

function checkSchreibenTeil1(text, issues) {
  if (!hasWordTarget(text, 80)) {
    issues.push('Schreiben T1: falta objetivo de palabras (circa/ca. 80 Wörter)');
  }
  if (!/\b(e-mail|email|schreiben sie|schreiben\s+sie)\b/i.test(text) && !/\b(an\s+|an\s*ihre|an\s*ihren)\b/i.test(text)) {
    issues.push('Schreiben T1: no indica destinatario/contexto claro (E-Mail, An …)');
  }
  if (countBulletPoints(text) < 2 && !/\b(?:drei|3)\s+punkte\b/i.test(text)) {
    issues.push('Schreiben T1: se esperan ≥2 puntos concretos a tratar (viñetas o «drei Punkte»)');
  }
  if (!hasFormalSie(text)) {
    issues.push('Schreiben T1: registro formal ausente (Sie / Schreiben Sie)');
  }
}

function checkSchreibenTeil2(text, issues) {
  if (!hasWordTarget(text, 80) && !/\b80\b/.test(text)) {
    issues.push('Schreiben T2: falta objetivo de palabras (~80)');
  }
  if (!hasDebatableQuestion(text)) {
    issues.push('Schreiben T2: falta una pregunta o tema debatible');
  }
  if (countArgumentPrompts(text) < 2) {
    issues.push('Schreiben T2: pide ≥2 argumentos/begründungen/ejemplos');
  }
}

/**
 * T3 = "Persönliche Mitteilung zur Handlungsregulierung" (official Goethe B1).
 * Recipient: a KNOWN person — friend, neighbor, colleague, teacher, etc.
 * Register: informal (du) for friends/family  OR  formal personal (Sie) for teachers/superiors.
 * Both are valid. What is INVALID: anonymous institutions (Bürgerbüro, Sehr geehrte Damen…).
 */
/**
 * Detects whether the T3 prompt instruction mentions a real named person
 * (not an anonymous institution). The prompt says WHO to write to.
 */
function hasMentionedPerson(text) {
  // Named person with title: "Frau Müller", "Herr Schmidt"
  if (/\b(Frau|Herr)\s+[A-ZÄÖÜ][a-zäöüß]{2,}/.test(text)) return true;
  // Personal relationship: Freund, Nachbar, Kollegin, Kursleiterin, etc.
  if (/\b(Freund|Freundin|Nachbar|Nachbarin|Kolleg|Bekannt|Schwester|Bruder|Mutter|Vater|Kursleit|Lehrer|Lehrerin)\b/i.test(text)) return true;
  // Explicit informal greeting in example or instruction
  if (/\b(Hallo|Liebe[r]?)\s+[A-ZÄÖÜ][a-zäöüß]+/.test(text)) return true;
  return false;
}

function hasInstitutionalAddress(text) {
  return /\b(B[üu]rgerbüro|Stadtamt|Stadtverwaltung|Gemeinde|Beh[öo]rde|Sekretariat des|An das|An die\s+(?!Fam)|Sehr geehrte Damen und Herren|Sehr geehrte Damen|Sehr geehrter Herr(?!\s+[A-ZÄÖÜ][a-zäöüß]+\s*,))/i.test(text);
}

function checkSchreibenTeil3(text, issues, warnings) {
  if (!hasWordTarget(text, 40) && !/\b40\b/.test(text)) {
    issues.push('Schreiben T3: falta objetivo de palabras (~40 Wörter)');
  }
  const elements =
    (/\bentschuld/i.test(text) ? 1 : 0) +
    (/\bgrund|motiv|warum|weil\b/i.test(text) ? 1 : 0) +
    (/\bfrage|bitte|anfrage|möchte|wollte|bitten\b/i.test(text) ? 1 : 0);
  if (elements < 3 && countBulletPoints(text) < 3) {
    issues.push('Schreiben T3: deben pedirse 3 elementos (p.ej. Entschuldigung + Grund + Bitte/Frage)');
  }

  // Prohibit anonymous institutional recipients
  if (hasInstitutionalAddress(text)) {
    issues.push(
      'Schreiben T3: se dirige a una institución anónima — T3 debe ser siempre a una persona conocida ' +
      '(ej. "Liebe Frau Müller," o "Hallo Max,")',
    );
  }

  // Verify the prompt refers to a concrete person (not anonymous)
  const hasInformal = hasInformalRegister(text);
  const hasFormal = hasFormalSie(text);
  if (!hasInstitutionalAddress(text) && !hasMentionedPerson(text)) {
    warnings.push('Schreiben T3: la consigna no menciona destinatario personal concreto — añade nombre/relación ("Frau Müller", "Ihr Freund Max", etc.)');
  }

  // Warn about register mixing (but don't fail — it may be intentional in edge cases)
  if (hasInformal && hasFormal) {
    warnings.push('Schreiben T3: mezcla de registro informal (du) y formal (Sie) — mantén uno coherente');
  }
}

function checkSprechenTeil1(text, issues) {
  // T1 = Planungsaufgabe: plan something together.
  // Require ≥4 bullet points OR ≥4 aspect keywords OR both an interactive verb + bullet points.
  const bullets = countBulletPoints(text);
  const hasInteraction =
    /\bplanen\b|\bgemeinsam\b|\bzusammen\b|\bvorschlag\b|\bvorschläge\b|\beinigen\b|\bdiskutieren\b|\besprechen\b/i.test(text);
  const hasActivity =
    /\bausflug\b|\bfest\b|\bkurs\b|\bprojekt\b|\bveranstaltung\b|\baktivit\b|\btreffen\b|\breise\b|\bfeier\b|\bwochenend\b|\bbesuch\b|\bessen\b|\brestaurant\b|\bkino\b|\bmuseum\b|\bwanderung\b|\bsport\b|\bspazier\b|\bparty\b|\bgeburtstag\b|\bkonzert\b|\bvortrag\b|\bworkshop\b|\bseminar\b|\bgruppe\b|\bteam\b|\bkonferenz\b|\bevent\b/i.test(text);

  if (bullets < 4 && !hasInteraction) {
    issues.push(
      'Sprechen T1: faltan ≥4 puntos a planificar o instrucción de interacción ' +
      '(planen/gemeinsam/Vorschläge/sich einigen…)',
    );
  }
  // Only fail if truly no activity AND fewer than 2 bullets (very permissive — avoid false positives)
  if (bullets < 2 && !hasActivity && !hasInteraction) {
    issues.push('Sprechen T1: la situación de planificación no es concreta (añade tipo de actividad: Ausflug/Fest/Kurs…)');
  }
}

function checkSprechenTeil2(text, issues) {
  // T2 = Präsentation: present a topic with structured outline.
  const hasTopic =
    /\bpr[äa]sentation\b|\bvortrag\b|\bthema\b|\bstellen sie.*vor\b|\bberichten sie\b/i.test(text);
  if (!hasTopic) {
    issues.push('Sprechen T2: falta tema claro de presentación (Präsentation/Vortrag/Thema)');
  }
  const structure =
    countBulletPoints(text) +
    (text.match(/\d+\./g) || []).length + // numbered items like "1. Einleitung"
    (/\bgliederung\b/i.test(text) ? 2 : 0) +
    (/\beinleitung\b/i.test(text) ? 1 : 0) +
    (/\bschluss\b|\babschluss\b|\bzum schluss\b/i.test(text) ? 1 : 0) +
    (/\bmeinung\b|\bstandpunkt\b/i.test(text) ? 1 : 0) +
    (/\bvor.*nachteil\b|\bnachteil\b|\bvorteil\b/i.test(text) ? 1 : 0);
  if (structure < 3) {
    issues.push('Sprechen T2: falta estructura ≥3 puntos (Einleitung, Punkte, Schluss/Meinung…)');
  }
}

function checkSprechenTeil3(text, issues) {
  // T3 = Rückmeldung/Reaktion: give feedback on partner's T2 presentation + ask questions.
  // Accept: "Feedback geben", "stellen Sie Fragen", "reagieren", "Rückmeldung", "kommentieren"
  const hasFeedback =
    /\bfeedback\b|\br[üu]ckmeldung\b|\bkommentieren\b|\bbewerten\b|\breagieren\b|\bstellungnahme\b/i.test(text) ||
    /\b(beantwort|r[üu]ckfrage|fragen des gespr[äa]chspartners)\b/i.test(text) ||
    /\bantworten sie\b/i.test(text);
  const hasQuestion =
    /\bfrage[n]?\b/i.test(text) &&
    (
      /\bstellen\b|\bformulieren\b|\bselbst\b|\beigene\b|\bmindestens\b|\bzwei\b|\b2\b|\bdrei\b|\b3\b/i.test(text) ||
      /\bbeispiel.*frage\b|\bbeispielsfrage\b/i.test(text)
    );

  if (!hasFeedback) {
    issues.push(
      'Sprechen T3: falta instrucción de dar feedback o reaccionar ' +
      '(Feedback/Rückmeldung/reagieren/kommentieren)',
    );
  }
  if (!hasQuestion) {
    issues.push('Sprechen T3: falta instrucción de formular ≥1 pregunta al interlocutor');
  }
}

function loadExistingPrompts(module, lang = 'de', level = 'B1') {
  const file = path.join(ROOT, 'library', lang, level, 'questions.json');
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (data.questions || [])
    .filter((q) => q.module === module)
    .map((q) => String(q.question || '').trim())
    .filter(Boolean);
}

let _promptCache = null;

function existingPrompts(module, lang, level) {
  const key = `${lang}/${level}/${module}`;
  if (!_promptCache) _promptCache = new Map();
  if (!_promptCache.has(key)) {
    _promptCache.set(key, loadExistingPrompts(module, lang, level));
  }
  return _promptCache.get(key);
}

function checkDuplicatePrompt(text, module, lang, level, issues, warnings) {
  for (const existing of existingPrompts(module, lang, level)) {
    const ratio = textSimilarityRatio(text, existing);
    if (ratio > 0.7) {
      warnings.push(
        `Consigna comparte >70% de texto con una existente en library (${Math.round(ratio * 100)}%)`,
      );
      break;
    }
  }
}

function checkGermanB1Basics(text, issues) {
  if (!/[äöüßÄÖÜ]/.test(text) && !/\b(und|der|die|Sie|schreiben|Planen)\b/i.test(text)) {
    issues.push('Texto no parece alemán B1 (falta léxico alemán básico)');
  }
}

/**
 * @param {{ questions?: object[], passages?: object[] }} batch
 * @param {'schreiben'|'sprechen'} module
 * @param {number} teil
 * @param {{ lang?: string, level?: string }} opts
 */
export function checkPromptBatchQuality(batch, module, teil, opts = {}) {
  const issues = [];
  const warnings = [];
  const lang = opts.lang || 'de';
  const level = opts.level || 'B1';
  const t = Number(teil);
  const mod = String(module || '').toLowerCase();

  const qs = (batch?.questions || []).filter((q) => !mod || q.module === mod || !q.module);
  if (!qs.length) {
    return { ok: false, issues: ['Batch sin preguntas del módulo'], warnings: [], scoreEstimate: 0 };
  }

  const q = qs.find((x) => Number(x.teil) === t) || qs[0];
  const text = String(q.question || '').trim();
  if (!text) {
    return { ok: false, issues: ['Pregunta/consigna vacía'], warnings: [], scoreEstimate: 0 };
  }

  checkGermanB1Basics(text, issues);

  if (mod === 'schreiben') {
    if (t === 1) checkSchreibenTeil1(text, issues);
    else if (t === 2) checkSchreibenTeil2(text, issues);
    else if (t === 3) {
      checkSchreibenTeil3(text, issues, warnings);
      // [I5] Check that explanation does not reference a hardcoded name absent from question
      const expl = String(q.explanation || '');
      const explNames = expl.match(/\b[A-ZÄÖÜ][a-zäöüß]{2,20}\b/g) || [];
      for (const name of explNames) {
        // Skip common words that aren't names
        if (/^(Bewertung|Inhalt|Grammatik|Wortschatz|Länge|Anrede|Gruß|Punkte|Mitteilung|Empfänger|Aufgabe|Aufgabentext|Schreiben|Kriterien|Rückmeldung|Stil|Niveau|Register|Vollständigkeit|Deutsch|Betreff|Text|Satz|Brief|Mail|Formular)$/.test(name)) continue;
        if (!text.includes(name)) {
          warnings.push(
            `Schreiben T3: la explanation menciona «${name}» que no aparece en la consigna — ` +
            'usa el nombre del destinatario de la consigna o una descripción genérica.',
          );
        }
      }
    }
    else issues.push(`Schreiben: Teil ${t} no soportado (usa 1–3)`);
  } else if (mod === 'sprechen') {
    if (t === 1) checkSprechenTeil1(text, issues);
    else if (t === 2) checkSprechenTeil2(text, issues);
    else if (t === 3) checkSprechenTeil3(text, issues);
    else issues.push(`Sprechen: Teil ${t} no soportado (usa 1–3)`);
  } else {
    issues.push(`Módulo no soportado: ${module} (usa schreiben o sprechen)`);
  }

  checkDuplicatePrompt(text, mod, lang, level, issues, warnings);

  const penalty = issues.length * 10 + warnings.length * 3;
  const scoreEstimate = Math.max(0, Math.min(100, 100 - penalty));
  return { ok: issues.length === 0, issues, warnings, scoreEstimate };
}

export function formatPromptQualityReport(result, module, teil) {
  const mod = String(module || '').toLowerCase();
  const t = Number(teil);
  const lines = [];
  if (result.ok) {
    lines.push(`Calidad ${mod} T${t}: OK ✅ (estimación ~${result.scoreEstimate}%)`);
  } else {
    lines.push(
      `Calidad ${mod} T${t}: FAIL (${result.issues.length} problemas, estimación ~${result.scoreEstimate}%)`,
    );
    lines.push(...result.issues.map((i) => `  - ${i}`));
  }
  if (result.warnings?.length) {
    lines.push(`Avisos (${result.warnings.length}):`);
    lines.push(...result.warnings.map((w) => `  · ${w}`));
  }
  return lines.join('\n');
}
