#!/usr/bin/env node
/**
 * Generates 54 demo variants (3 langs × 6 levels × 3) with hookWord, loop, miniPractice.
 * Run: node scripts/generate-demo-variants.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_DIR = path.join(ROOT, 'data', 'demo');
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LANGS = ['de', 'en', 'es'];
const PASS = { de: 60, en: 70, es: 60 };

const SPEAKING_NOTE = {
  de: 'Wird in der Vollversion mit KI bewertet.',
  en: 'Evaluated with AI in the full app.',
  es: 'Evaluado con IA en la app completa.',
};

/** @type {Record<string, [object, object, object]>} */
const HOOKS = {
  de_A1: [
    hookDe('Familie', 'f', 'family', 'familia', 'Hallo! Ich heiße Anna. Ich wohne in München mit meiner Familie. Mein Bruder Tom geht noch in die Schule.', 'work', 'food', 'Meine ganze ___ wohnt in einer kleinen Wohnung.'),
    hookDe('Schule', 'f', 'school', 'escuela', 'Mein Bruder Tom geht noch in die Schule. Er lernt Englisch und Mathematik.', 'hospital', 'office', 'Tom geht jeden Morgen in die ___.'),
    hookDe('Samstag', 'm', 'Saturday', 'sábado', 'Am Samstag kaufen wir oft im Supermarkt ein. Danach kochen wir zusammen.', 'Monday', 'evening', 'Am ___ gehen wir oft einkaufen.'),
  ],
  de_A2: [
    hookDe('Termin', 'm', 'appointment', 'cita', 'Ich habe morgen einen Termin beim Arzt. Können wir uns am Nachmittag treffen?', 'ticket', 'recipe', 'Ich habe einen wichtigen ___ beim Zahnarzt.'),
    hookDe('Reise', 'f', 'trip', 'viaje', 'Nächste Woche fahre ich mit dem Zug nach Wien. Die Reise dauert vier Stunden.', 'meal', 'letter', 'Die ___ nach Berlin war sehr entspannt.'),
    hookDe('Nachbarin', 'f', 'neighbour (f)', 'vecina', 'Meine Nachbarin hilft mir oft beim Einkaufen. Sie ist sehr freundlich.', 'cousin', 'teacher', 'Meine ___ wohnt im gleichen Haus.'),
  ],
  de_B1: [
    hookDe('Flexibilität', 'f', 'flexibility', 'flexibilidad', 'Immer mehr Beschäftigte schätzen die Flexibilität beim Homeoffice, wünschen sich aber klare Regeln.', 'punctuality', 'silence', 'Die neue ___ bei der Arbeit gefällt vielen Mitarbeitenden.'),
    hookDe('Verzögerung', 'f', 'delay', 'retraso', 'Trotz der Verzögerung entschied sich das Unternehmen, das Projekt fortzusetzen.', 'decision', 'advantage', 'Die ___ der Lieferung führte zu Problemen.'),
    hookDe('Energieverbrauch', 'm', 'energy consumption', 'consumo de energía', 'Der Bericht empfiehlt, den Energieverbrauch in Büros zu messen und zu veröffentlichen.', 'water bill', 'rent', 'Der hohe ___ im Büro wurde kritisiert.'),
  ],
  de_B2: [
    hookDe('Digitalisierung', 'f', 'digitalisation', 'digitalización', 'Die Digitalisierung verändert viele Berufsbilder, ohne sie vollständig zu ersetzen.', 'automation only', 'retirement', 'Die ___ verändert die Arbeitswelt schnell.'),
    hookDe('Weiterbildung', 'f', 'further training', 'formación continua', 'Kritiker fordern staatlich geförderte Programme zur Weiterbildung älterer Beschäftigter.', 'vacation', 'tax cut', 'Gute ___ hilft bei der Jobsuche.'),
    hookDe('Umschulung', 'f', 'retraining', 'reciclaje profesional', 'Eine Umschulung in den IT-Bereich kann neue Chancen eröffnen.', 'holiday', 'bonus', 'Nach der ___ fand er schnell eine neue Stelle.'),
  ],
  de_C1: [
    hookDe('Nachhaltigkeit', 'f', 'sustainability', 'sostenibilidad', 'Nachhaltigkeit bleibt ein zentrales Thema in der Wirtschaftspolitik.', 'profit', 'speed', '___ ist für viele Unternehmen ein Kernziel.'),
    hookDe('Ressourcen', 'fpl', 'resources', 'recursos', 'Der knappe Einsatz natürlicher Ressourcen erfordert neue Strategien.', 'debts', 'rumours', 'Wir müssen unsere ___ schonen.'),
    hookDe('Innovation', 'f', 'innovation', 'innovación', 'Innovation entsteht dort, wo Teams verschiedene Perspektiven verbinden.', 'tradition only', 'delay', 'Diese ___ hat den Markt verändert.'),
  ],
  de_C2: [
    hookDe('Komplexität', 'f', 'complexity', 'complejidad', 'Die Komplexität globaler Lieferketten erschwert schnelle Entscheidungen.', 'simplicity', 'luck', 'Die ___ des Problems überraschte alle.'),
    hookDe('Ambivalenz', 'f', 'ambivalence', 'ambivalencia', 'Die Ambivalenz der Maßnahmen wird in der Fachpresse breit diskutiert.', 'clarity', 'certainty', 'Man spürt die ___ der Lage.'),
    hookDe('Resilienz', 'f', 'resilience', 'resiliencia', 'Resilienz von Systemen wird nach der Krise neu bewertet.', 'fragility', 'anger', '___ hilft Organisationen in Krisen.'),
  ],
  en_A1: [
    hookEn('family', 'family', 'familia', 'Hello! My name is Anna. I live in London with my family.', 'work', 'car', 'I live with my ___.'),
    hookEn('school', 'school', 'escuela', 'My brother Tom still goes to school. He likes maths.', 'shop', 'park', 'Tom walks to ___ every day.'),
    hookEn('Saturday', 'Saturday', 'sábado', 'On Saturday we often go shopping together.', 'Monday', 'morning', 'On ___ we visit the market.'),
  ],
  en_A2: [
    hookEn('appointment', 'appointment', 'cita', 'I have a doctor\'s appointment tomorrow afternoon.', 'ticket', 'recipe', 'Don\'t forget your ___.'),
    hookEn('journey', 'journey', 'viaje', 'The journey to Edinburgh takes about four hours by train.', 'meal', 'letter', 'The ___ was longer than expected.'),
    hookEn('neighbour', 'neighbour', 'vecino', 'My neighbour often helps me with shopping.', 'cousin', 'boss', 'Our ___ is very friendly.'),
  ],
  en_B1: [
    hookEn('flexibility', 'flexibility', 'flexibilidad', 'Many employees value flexibility when working from home.', 'punctuality', 'silence', 'More ___ at work is popular.'),
    hookEn('delay', 'delay', 'retraso', 'Despite the delay, the company decided to continue the project.', 'decision', 'advantage', 'The ___ caused serious problems.'),
    hookEn('consumption', 'consumption', 'consumo', 'The report recommends measuring energy consumption in offices.', 'water bill', 'rent', 'High energy ___ was criticised.'),
  ],
  en_B2: [
    hookEn('digitalisation', 'digitalisation', 'digitalización', 'digitalisation is changing many jobs without replacing all of them.', 'automation only', 'retirement', '___ is reshaping the labour market.'),
    hookEn('training', 'training', 'formación', 'Further training programmes help older workers adapt.', 'vacation', 'tax cut', 'Good ___ improves job prospects.'),
    hookEn('retraining', 'retraining', 'reciclaje', 'retraining in IT can open new career paths.', 'holiday', 'bonus', 'After ___ she found a new role quickly.'),
  ],
  en_C1: [
    hookEn('sustainability', 'sustainability', 'sostenibilidad', 'sustainability remains central to economic policy debates.', 'profit', 'speed', '___ is a core goal for many firms.'),
    hookEn('resources', 'resources', 'recursos', 'Careful use of natural resources requires new strategies.', 'debts', 'rumours', 'We must protect our ___.'),
    hookEn('innovation', 'innovation', 'innovación', 'innovation thrives where teams combine diverse perspectives.', 'tradition only', 'delay', 'This ___ changed the market.'),
  ],
  en_C2: [
    hookEn('complexity', 'complexity', 'complejidad', 'The complexity of global supply chains slows quick decisions.', 'simplicity', 'luck', 'The ___ of the issue surprised everyone.'),
    hookEn('ambivalence', 'ambivalence', 'ambivalencia', 'The ambivalence of the policy is widely discussed in the press.', 'clarity', 'certainty', 'You can feel the ___ of the situation.'),
    hookEn('resilience', 'resilience', 'resiliencia', 'Organisational resilience is reassessed after the crisis.', 'fragility', 'anger', '___ helps teams in hard times.'),
  ],
  es_A1: [
    hookEs('familia', 'family', 'familia', 'Hola, me llamo Ana. Vivo en Madrid con mi familia.', 'trabajo', 'coche', 'Vivo con mi ___.'),
    hookEs('escuela', 'school', 'escuela', 'Mi hermano Tom todavía va a la escuela.', 'tienda', 'parque', 'Tom va a la ___ cada día.'),
    hookEs('sábado', 'Saturday', 'sábado', 'Los sábados solemos ir de compras.', 'lunes', 'mañana', 'El ___ vamos al mercado.'),
  ],
  es_A2: [
    hookEs('cita', 'appointment', 'cita', 'Mañana tengo una cita con el médico por la tarde.', 'billete', 'receta', 'No olvides tu ___.'),
    hookEs('viaje', 'trip', 'viaje', 'El viaje a Barcelona dura unas cuatro horas en tren.', 'comida', 'carta', 'El ___ fue más largo de lo esperado.'),
    hookEs('vecina', 'neighbour', 'vecina', 'Mi vecina me ayuda a menudo con la compra.', 'prima', 'jefa', 'Nuestra ___ es muy amable.'),
  ],
  es_B1: [
    hookEs('flexibilidad', 'flexibility', 'flexibilidad', 'Muchos empleados valoran la flexibilidad del teletrabajo.', 'puntualidad', 'silencio', 'La ___ en el trabajo es popular.'),
    hookEs('retraso', 'delay', 'retraso', 'A pesar del retraso, la empresa decidió continuar el proyecto.', 'decisión', 'ventaja', 'El ___ causó problemas serios.'),
    hookEs('consumo', 'consumption', 'consumo', 'El informe recomienda medir el consumo de energía en oficinas.', 'alquiler', 'agua', 'El alto ___ energético fue criticado.'),
  ],
  es_B2: [
    hookEs('digitalización', 'digitalisation', 'digitalización', 'La digitalización cambia muchos empleos sin sustituirlos todos.', 'solo robots', 'jubilación', 'La ___ transforma el mercado laboral.'),
    hookEs('formación', 'training', 'formación', 'Los programas de formación ayudan a los trabajadores mayores.', 'vacaciones', 'impuesto', 'Buena ___ mejora las oportunidades.'),
    hookEs('reciclaje', 'retraining', 'reciclaje profesional', 'El reciclaje profesional en informática abre nuevas salidas.', 'fiesta', 'bonus', 'Tras el ___ encontró un nuevo puesto.'),
  ],
  es_C1: [
    hookEs('sostenibilidad', 'sustainability', 'sostenibilidad', 'La sostenibilidad sigue siendo central en el debate económico.', 'beneficio', 'velocidad', 'La ___ es un objetivo clave.'),
    hookEs('recursos', 'resources', 'recursos', 'El uso cuidadoso de los recursos naturales exige nuevas estrategias.', 'deudas', 'rumores', 'Debemos proteger nuestros ___.'),
    hookEs('innovación', 'innovation', 'innovación', 'La innovación surge donde los equipos combinan perspectivas distintas.', 'solo tradición', 'retraso', 'Esta ___ cambió el mercado.'),
  ],
  es_C2: [
    hookEs('complejidad', 'complexity', 'complejidad', 'La complejidad de las cadenas globales frena decisiones rápidas.', 'simplicidad', 'suerte', 'La ___ del problema sorprendió a todos.'),
    hookEs('ambivalencia', 'ambivalence', 'ambivalencia', 'La ambivalencia de la medida se discute ampliamente.', 'claridad', 'certeza', 'Se nota la ___ de la situación.'),
    hookEs('resiliencia', 'resilience', 'resiliencia', 'La resiliencia organizativa se revalora tras la crisis.', 'fragilidad', 'ira', 'La ___ ayuda en momentos difíciles.'),
  ],
};

function hookDe(word, gender, en, es, passage, wrongA, wrongC, miniAfter) {
  return {
    word,
    gender,
    pos: 'noun',
    translations: { en, es },
    passage,
    loopQuestion: `Was bedeutet «${word}»?`,
    loopOptions: [
      { key: 'A', text: wrongA, correct: false },
      { key: 'B', text: en, correct: true },
      { key: 'C', text: wrongC, correct: false },
    ],
    miniPractice: {
      label: 'Built from your mistake · 20 sec',
      before: miniAfter.includes('___') ? miniAfter.split('___')[0] : 'Die ',
      gap: '___',
      after: miniAfter.includes('___') ? miniAfter.split('___')[1] : ` ${miniAfter}`,
      answer: word,
    },
  };
}

function hookEn(word, en, es, passage, wrongA, wrongC, miniTpl) {
  return {
    word,
    pos: 'noun',
    translations: { en, es },
    passage,
    loopQuestion: `What does «${word}» mean?`,
    loopOptions: [
      { key: 'A', text: wrongA, correct: false },
      { key: 'B', text: en, correct: true },
      { key: 'C', text: wrongC, correct: false },
    ],
    miniPractice: {
      label: 'Built from your mistake · 20 sec',
      before: miniTpl.split('___')[0],
      gap: '___',
      after: miniTpl.split('___')[1] || '',
      answer: word,
    },
  };
}

function hookEs(word, en, es, passage, wrongA, wrongC, miniTpl) {
  return {
    word,
    pos: 'noun',
    translations: { en, es },
    passage,
    loopQuestion: `¿Qué significa «${word}»?`,
    loopOptions: [
      { key: 'A', text: wrongA, correct: false },
      { key: 'B', text: es, correct: true },
      { key: 'C', text: wrongC, correct: false },
    ],
    miniPractice: {
      label: 'Generado de tu error · 20 s',
      before: miniTpl.split('___')[0],
      gap: '___',
      after: miniTpl.split('___')[1] || '',
      answer: word,
    },
  };
}

function trimModules(modules) {
  return modules.map((m) => ({
    ...m,
    parts: m.parts.slice(0, 1).map((p) => ({
      ...p,
      items: p.items ? p.items.slice(0, 1) : p.items,
      markableWords: p.markableWords || [],
    })),
  }));
}

function applyHookToModules(modules, hook, lang) {
  const readId = lang === 'de' ? 'lesen' : 'reading';
  return modules.map((m) => {
    if (m.id !== readId || !m.parts?.[0]) return m;
    const part = { ...m.parts[0] };
    part.passage = hook.passage;
    part.markableWords = [
      {
        word: hook.word,
        gender: hook.gender,
        pos: hook.pos || 'noun',
        translations: hook.translations,
      },
    ];
    part.items = [
      {
        id: 'loop1',
        question: hook.loopQuestion,
        options: hook.loopOptions.map((o) => ({ ...o })),
      },
    ];
    return { ...m, parts: [part] };
  });
}

function buildVariant(base, hook, variantIndex) {
  const id = `${base.lang}_${base.level}_v${variantIndex}`;
  const modules = applyHookToModules(trimModules(base.modules), hook, base.lang);
  const spNote = SPEAKING_NOTE[base.lang];
  const modulesOut = modules.map((m) => {
    if (m.interactive) return m;
    const p = { ...m.parts[0] };
    if (p.note && !p.note.includes('full app') && !p.note.includes('Vollversion') && !p.note.includes('app completa')) {
      p.note = `${p.note} — ${spNote}`;
    } else if (!p.note) {
      p.note = spNote;
    }
    return { ...m, parts: [p] };
  });

  return {
    id,
    lang: base.lang,
    level: base.level,
    variant: variantIndex,
    topic: base.topic,
    board: base.board,
    certificate: base.certificate,
    passPercent: PASS[base.lang] || 60,
    hookWord: {
      word: hook.word,
      gender: hook.gender,
      pos: hook.pos || 'noun',
      translations: hook.translations,
    },
    loop: {
      passage: hook.passage,
      question: hook.loopQuestion,
      options: hook.loopOptions,
    },
    miniPractice: hook.miniPractice,
    modules: modulesOut,
  };
}

const allIds = [];
for (const lang of LANGS) {
  for (const level of LEVELS) {
    const key = `${lang}_${level}`;
    const basePath = path.join(DEMO_DIR, `${key}.json`);
    if (!fs.existsSync(basePath)) {
      console.error('Missing base', key);
      process.exit(1);
    }
    const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    const hooks = HOOKS[key];
    if (!hooks || hooks.length !== 3) {
      console.error('Missing hooks for', key);
      process.exit(1);
    }
    for (let vi = 1; vi <= 3; vi++) {
      const exam = buildVariant(base, hooks[vi - 1], vi);
      const fname = `${key}_v${vi}.json`;
      fs.writeFileSync(path.join(DEMO_DIR, fname), JSON.stringify(exam, null, 2) + '\n', 'utf8');
      allIds.push(fname.replace('.json', ''));
      console.log('Wrote', fname);
    }
  }
}

const manifest = {
  version: 3,
  description: 'Frozen LexiCoil demo loop — 54 variants (3×6×3), offline, no AI.',
  variantsPerExam: 3,
  languages: {
    de: { name: 'German', board: 'Goethe-Institut' },
    en: { name: 'English', board: 'Cambridge English' },
    es: { name: 'Spanish', board: 'Instituto Cervantes (DELE)' },
  },
  levels: LEVELS,
  examKeys: LANGS.flatMap((l) => LEVELS.map((lv) => `${l}_${lv}`)),
  exams: allIds,
};

fs.writeFileSync(path.join(DEMO_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('Done — 54 variants, manifest v3.');
