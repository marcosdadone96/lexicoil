/**
 * DELE exam normalization — maps readingParts/listeningParts to unified render format.
 * Provider JSON (dele.json) is stable; module titles mirror Instituto Cervantes labels.
 */
const DELE_CERT = {
  A1: 'DELE A1',
  A2: 'DELE A2',
  B1: 'DELE B1',
  B2: 'DELE B2',
  C1: 'DELE C1',
  C2: 'DELE C2',
};

const DELE_MODULES = {
  A1: {
    lesen: { title: 'Comprensión de lectura', time: '45 min' },
    horen: { title: 'Comprensión auditiva', time: '25 min' },
    schreiben: { title: 'Expresión e interacción escritas', time: '25 min' },
    sprechen: { title: 'Expresión e interacción orales', time: '15 min' },
  },
  A2: {
    lesen: { title: 'Comprensión de lectura', time: '60 min' },
    horen: { title: 'Comprensión auditiva', time: '35 min' },
    schreiben: { title: 'Expresión e interacción escritas', time: '50 min' },
    sprechen: { title: 'Expresión e interacción orales', time: '15 min' },
  },
  B1: {
    lesen: { title: 'Comprensión de lectura', time: '70 min' },
    horen: { title: 'Comprensión auditiva', time: '40 min' },
    schreiben: { title: 'Expresión e interacción escritas', time: '60 min' },
    sprechen: { title: 'Expresión e interacción orales', time: '15 min' },
  },
  B2: {
    lesen: { title: 'Comprensión de lectura', time: '70 min' },
    horen: { title: 'Comprensión auditiva', time: '40 min' },
    schreiben: { title: 'Expresión e interacción escritas', time: '80 min' },
    sprechen: { title: 'Expresión e interacción orales', time: '20 min' },
  },
  C1: {
    lesen: { title: 'Comprensión de lectura', time: '75 min' },
    horen: { title: 'Comprensión auditiva', time: '50 min' },
    schreiben: { title: 'Expresión e interacción escritas', time: '80 min' },
    sprechen: { title: 'Expresión e interacción orales', time: '20 min' },
  },
  C2: {
    lesen: { title: 'Comprensión de lectura', time: '80 min' },
    horen: { title: 'Comprensión auditiva', time: '50 min' },
    schreiben: { title: 'Expresión e interacción escritas', time: '80 min' },
    sprechen: { title: 'Expresión e interacción orales', time: '20 min' },
  },
};

function mapReadingParts(readingParts) {
  return (readingParts || []).map((p) => {
    const part = { teil: p.part, arbeitszeit: p.time || '', instruction: p.instruction };
    if (p.items) {
      part.items = p.items.map((it) => ({
        id: it.id,
        signText: it.text,
        question: it.question,
        options: it.options,
        correct: it.correct,
      }));
    }
    if (p.text) {
      part.textTitle = p.textTitle;
      part.text = p.text;
    }
    if (p.speakers) {
      part.textTitle = p.textTitle;
      part.text = p.speakers.map((s) => s.name + ': ' + s.text).join('\n\n');
    }
    if (p.options && p.answers) {
      part.ads = (p.options || []).map((o) => ({ key: o.key, title: o.title, text: o.text }));
      part.questions = Object.entries(p.answers).map(([id, correct]) => {
        const person = (p.people || []).find((x) => x.id === id);
        return {
          id,
          type: 'match',
          question: person?.description || id,
          options: [...(p.options || []).map((o) => o.key), '0'],
          correct,
        };
      });
    }
    if (p.questions && !part.questions) part.questions = p.questions;
    return part;
  });
}

function mapListeningParts(listeningParts) {
  return (listeningParts || []).map((p) => {
    const part = { teil: p.part, plays: p.plays || 2, instruction: p.instruction, context: p.context };
    if (p.segments) {
      part.segments = p.segments.map((seg, si) => ({
        id: seg.id,
        label: seg.label || 'Grabación ' + (si + 1),
        transcript: seg.transcript,
        question: seg.question,
        options: seg.options,
        correct: seg.correct,
      }));
    } else if (p.notes) {
      part.transcript = p.transcript;
      part.notesTitle = p.notes.title;
      part.noteFields = (p.notes.fields || []).map((f) => ({ id: f.id, label: f.label, answer: f.answer }));
    } else {
      part.transcript = p.transcript;
      part.questions = p.questions;
    }
    return part;
  });
}

function mapWritingParts(writingParts) {
  return (writingParts || []).map((p, i) => {
    let task = p.instruction || '';
    if (p.promptEmail) task += '\n\n' + p.promptEmail;
    return {
      aufgabe: p.part || i + 1,
      arbeitszeit: p.time || '',
      fieldId: p.fieldId || 'write' + (i + 1),
      task,
      minWords: p.minWords,
      criteria: p.criteria,
      modelAnswer: p.modelAnswer || p.modelAnswerArticle,
      feedback: p.feedback,
    };
  });
}

function mapSpeakingParts(speakingParts) {
  return (speakingParts || []).map((p, i) => ({
    teil: p.part || i + 1,
    title: p.title,
    dauer: p.duration,
    fieldId: p.fieldId || 'speak' + (i + 1),
    situation: p.situation,
    points: p.points || p.examinerQuestions,
    photoDescriptions: p.photoDescriptions,
    minExchanges: p.minExchanges,
    modelAnswer: p.modelAnswer,
    feedback: p.feedback,
  }));
}

function normalizeSpanishExam(d) {
  if (!d) return d;
  const hasEnParts = d.readingParts || d.listeningParts || d.writingParts || d.speakingParts;
  const hasNative = d.lesenParts || d.horenParts;
  if (!hasEnParts && !hasNative) return d;

  const lv = d.level || 'B1';
  const mods = DELE_MODULES[lv] || DELE_MODULES.B1;

  d.deleFormat = true;
  d.lang = 'es';
  d.goetheFormat = true;

  if (!d.official) {
    d.official = {
      board: 'Instituto Cervantes',
      certificate: DELE_CERT[lv] || 'DELE',
      note:
        'Examen de práctica (generado por IA). Tipos de tarea basados en el formato oficial DELE ' + lv + '.',
    };
  }
  if (!d.modules) {
    d.modules = {
      lesen: { ...mods.lesen },
      horen: { ...mods.horen },
      schreiben: { ...mods.schreiben },
      sprechen: { ...mods.sprechen },
    };
  }

  if (d.readingParts) d.lesenParts = mapReadingParts(d.readingParts);
  if (d.listeningParts) d.horenParts = mapListeningParts(d.listeningParts);
  if (d.writingParts) d.schreibenParts = mapWritingParts(d.writingParts);
  if (d.sprechenParts || d.speakingParts) {
    d.sprechenParts = mapSpeakingParts(d.speakingParts || d.sprechenParts);
  }

  return d;
}

if (typeof window !== 'undefined') window.normalizeSpanishExam = normalizeSpanishExam;
if (typeof module !== 'undefined') module.exports = { normalizeSpanishExam, DELE_CERT, DELE_MODULES };
