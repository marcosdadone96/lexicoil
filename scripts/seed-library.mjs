#!/usr/bin/env node
/**
 * Seeds /library/{lang}/{level}/questions.json for supported levels.
 * Run offline after AI content generation — this script ships starter content.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'library');

const SUPPORTED = [
  ['de', 'B1'],
  ['de', 'B2'],
  ['en', 'B2'],
  ['en', 'C1'],
  ['es', 'B2'],
  ['es', 'C1'],
];

function mcq(id, module, question, options, correct, tags, extra = {}) {
  return {
    id,
    module,
    type: 'multiple',
    question,
    options,
    correct,
    correctAnswer: correct,
    explanation: extra.explanation || '',
    grammarTags: tags.grammar || [],
    topicTags: tags.topic || [],
    difficulty: tags.difficulty || 3,
    ...extra,
  };
}

function tf(id, module, question, correct, tags, extra = {}) {
  const isDe = extra.lang === 'de';
  const val = correct ? (isDe ? 'Richtig' : 'True') : isDe ? 'Falsch' : 'False';
  return {
    id,
    module,
    type: isDe ? 'richtig_falsch' : 'true_false',
    question,
    correct: val,
    correctAnswer: val,
    explanation: extra.explanation || '',
    grammarTags: tags.grammar || [],
    topicTags: tags.topic || [],
    difficulty: tags.difficulty || 3,
    ...extra,
  };
}

const BANKS = {
  de_B1: {
    meta: { language: 'de', level: 'B1', version: 1, generatedAt: '2026-06-09' },
    passages: [
      {
        id: 'p-lesen-1',
        module: 'lesen',
        title: 'Stadtgärten: Grüne Oasen mitten in der Stadt',
        text: 'Immer mehr Menschen in deutschen Städten entscheiden sich für einen eigenen kleinen Garten — nicht auf dem Land, sondern mitten in der Stadt. Sogenannte Stadtgärten boomen seit einigen Jahren. Viele Menschen möchten wissen, woher ihr Essen kommt. Stadtgärten bieten die Möglichkeit, Nachbarn kennenzulernen. Für Kinder ist es besonders wertvoll: Sie lernen, wie Pflanzen wachsen. Auch aus ökologischer Sicht sind Stadtgärten positiv: Sie verbessern das Stadtklima. Die Wartelisten für Stadtgartenparzellen sind in den meisten deutschen Städten sehr lang.',
      },
      {
        id: 'p-horen-1',
        module: 'horen',
        title: 'Radiobericht: Fahrradfreundliche Stadt',
        text: 'Moderator: Heute sprechen wir über Fahrradwege in der Stadt. Gast: Viele Städte bauen neue Radwege, weil immer mehr Menschen das Fahrrad nutzen. Moderator: Ist das sicher? Gast: Ja, wenn die Wege breit genug sind und gut markiert werden. Außerdem braucht man mehr Fahrradstellplätze am Bahnhof.',
      },
    ],
    questions: [
      tf('lb-de-b1-l1', 'lesen', 'Urban-Gardening-Projekte werden in deutschen Städten immer beliebter.', true, { grammar: ['g-de-b1-nebensatz'], topic: ['umwelt'], difficulty: 2 }, { passageId: 'p-lesen-1', teil: 1, lang: 'de', explanation: 'Der Text sagt, dass Stadtgärten „booomen“.' }),
      tf('lb-de-b1-l2', 'lesen', 'Stadtgärten entstehen nur auf Dächern.', false, { grammar: ['g-de-b1-nebensatz'], topic: ['umwelt'], difficulty: 2 }, { passageId: 'p-lesen-1', teil: 1, lang: 'de', explanation: 'Sie entstehen auf Brachflächen, Dächern und in Parks.' }),
      tf('lb-de-b1-l3', 'lesen', 'Viele Menschen möchten wissen, woher ihr Essen kommt.', true, { grammar: ['g-de-b1-nebensatz'], topic: ['umwelt'], difficulty: 2 }, { passageId: 'p-lesen-1', teil: 1, lang: 'de', explanation: 'Das steht direkt im Text.' }),
      tf('lb-de-b1-l4', 'lesen', 'Für Kinder haben Stadtgärten keinen besonderen Wert.', false, { grammar: ['g-de-b1-relativ'], topic: ['bildung'], difficulty: 3 }, { passageId: 'p-lesen-1', teil: 1, lang: 'de', explanation: 'Kinder lernen, wie Pflanzen wachsen — das ist wertvoll.' }),
      mcq('lb-de-b1-l5', 'lesen', 'Was ist laut Text ein Vorteil von Stadtgärten?', ['a) Sie verschlechtern das Klima.', 'b) Sie verbessern das Stadtklima.', 'c) Sie sind nur für Erwachsene.'], 'b', { grammar: ['g-de-b1-passiv'], topic: ['umwelt'], difficulty: 3 }, { passageId: 'p-lesen-1', teil: 2, explanation: 'Ökologisch verbessern sie das Stadtklima.' }),
      mcq('lb-de-b1-l6', 'lesen', 'Warum sind die Wartelisten lang?', ['a) Weil niemand Interesse hat.', 'b) Weil der Platz begrenzt ist und die Nachfrage hoch ist.', 'c) Weil Stadtgärten verboten sind.'], 'b', { grammar: ['g-de-b1-konjunktiv'], topic: ['umwelt'], difficulty: 4 }, { passageId: 'p-lesen-1', teil: 2, explanation: 'Viele Menschen wollen eine Parzelle — die Nachfrage ist hoch.' }),
      mcq('lb-de-b1-h1', 'horen', 'Warum bauen viele Städte neue Radwege?', ['a) Weil weniger Menschen Fahrrad fahren.', 'b) Weil immer mehr Menschen das Fahrrad nutzen.', 'c) Weil Autos verboten sind.'], 'b', { grammar: ['g-de-b1-nebensatz'], topic: ['technologie'], difficulty: 3 }, { passageId: 'p-horen-1', segmentLabel: 'Aufnahme 1', teil: 1, explanation: 'Der Gast sagt, dass immer mehr Menschen das Fahrrad nutzen.' }),
      mcq('lb-de-b1-h2', 'horen', 'Was braucht man laut Gast am Bahnhof?', ['a) Mehr Busse', 'b) Mehr Fahrradstellplätze', 'c) Weniger Tickets'], 'b', { grammar: ['g-de-b1-passiv'], topic: ['reisen'], difficulty: 3 }, { passageId: 'p-horen-1', segmentLabel: 'Aufnahme 1', teil: 1, explanation: 'Er erwähnt Fahrradstellplätze am Bahnhof.' }),
      tf('lb-de-b1-h3', 'horen', 'Radwege sind sicher, wenn sie breit und gut markiert sind.', true, { grammar: ['g-de-b1-konjunktiv'], topic: ['technologie'], difficulty: 4 }, { passageId: 'p-horen-1', segmentLabel: 'Aufnahme 1', teil: 2, lang: 'de', explanation: 'Der Gast sagt: „wenn die Wege breit genug sind und gut markiert werden“.' }),
      mcq('lb-de-b1-h4', 'horen', 'Worum geht es im Gespräch?', ['a) Um Schulferien', 'b) Um Fahrradwege in der Stadt', 'c) Um Flughäfen'], 'b', { grammar: ['g-de-b1-relativ'], topic: ['technologie'], difficulty: 2 }, { passageId: 'p-horen-1', segmentLabel: 'Aufnahme 1', teil: 2, explanation: 'Das Thema wird zu Beginn genannt.' }),
    ],
    vocabulary: {
      Stadtgarten: { en: 'city garden', es: 'jardín urbano', type: 'noun' },
      Radweg: { en: 'cycle path', es: 'carril bici', type: 'noun' },
      Nachfrage: { en: 'demand', es: 'demanda', type: 'noun' },
      Parzelle: { en: 'plot (of land)', es: 'parcela', type: 'noun' },
    },
  },
  de_B2: {
    meta: { language: 'de', level: 'B2', version: 1, generatedAt: '2026-06-09' },
    passages: [
      { id: 'p-lesen-1', module: 'lesen', title: 'Digitalisierung am Arbeitsplatz', text: 'Experten berichten, dass die Digitalisierung viele Berufe verändert, ohne sie vollständig zu ersetzen. Laut einer Studie werden vor allem repetitive Tätigkeiten automatisiert. Gleichzeitig entstehen neue Stellen in der IT-Branche. Kritiker warnen, dass ältere Arbeitnehmer oft weniger Zugang zu Weiterbildung haben. Politiker fordern daher staatlich geförderte Programme.' },
      { id: 'p-horen-1', module: 'horen', title: 'Podcast: Homeoffice', text: 'Moderatorin: Ist Homeoffice die Zukunft? Expertin: Es erhöht die Flexibilität, kann aber die Grenze zwischen Arbeit und Freizeit verwischen. Unternehmen müssen klare Regeln definieren. Moderatorin: Und die Produktivität? Expertin: Sie steigt bei vielen, aber nicht bei allen.' },
    ],
    questions: [
      tf('lb-de-b2-l1', 'lesen', 'Laut Text werden alle Berufe vollständig ersetzt.', false, { grammar: ['g-de-b2-konj1'], topic: ['digitalisierung'], difficulty: 3 }, { passageId: 'p-lesen-1', teil: 1, lang: 'de', explanation: 'Der Text sagt „ohne sie vollständig zu ersetzen“.' }),
      mcq('lb-de-b2-l2', 'lesen', 'Was wird vor allem automatisiert?', ['a) Kreative Aufgaben', 'b) Repetitive Tätigkeiten', 'c) Politische Debatten'], 'b', { grammar: ['g-de-b2-nominal'], topic: ['arbeit'], difficulty: 3 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'Studie: repetitive Tätigkeiten.' }),
      mcq('lb-de-b2-l3', 'lesen', 'Was fordern Politiker?', ['a) Weniger Internet', 'b) Staatlich geförderte Weiterbildung', 'c) Abschaffung der IT'], 'b', { grammar: ['g-de-b2-konj1'], topic: ['bildung'], difficulty: 4 }, { passageId: 'p-lesen-1', teil: 2, explanation: 'Staatlich geförderte Programme.' }),
      mcq('lb-de-b2-h1', 'horen', 'Was kann Homeoffice verwischen?', ['a) Die Grenze zwischen Arbeit und Freizeit', 'b) Den Fernseher', 'c) Die Gehaltshöhe'], 'a', { grammar: ['g-de-b2-nominal'], topic: ['arbeit'], difficulty: 3 }, { passageId: 'p-horen-1', segmentLabel: 'Aufnahme 1', teil: 1, explanation: 'Expertin nennt die Work-Life-Grenze.' }),
      tf('lb-de-b2-h2', 'horen', 'Die Produktivität steigt bei allen Mitarbeitern.', false, { grammar: ['g-de-b2-konj1'], topic: ['arbeit'], difficulty: 4 }, { passageId: 'p-horen-1', segmentLabel: 'Aufnahme 1', teil: 1, lang: 'de', explanation: '„bei vielen, aber nicht bei allen“.' }),
      mcq('lb-de-b2-h3', 'horen', 'Was müssen Unternehmen tun?', ['a) Klare Regeln definieren', 'b) Homeoffice verbieten', 'c) Keine Meetings'], 'a', { grammar: ['g-de-b2-nominal'], topic: ['wirtschaft'], difficulty: 3 }, { passageId: 'p-horen-1', segmentLabel: 'Aufnahme 1', teil: 2, explanation: 'Klare Regeln werden gefordert.' }),
    ],
    vocabulary: {
      Digitalisierung: { en: 'digitalisation', es: 'digitalización', type: 'noun' },
      Weiterbildung: { en: 'continuing education', es: 'formación continua', type: 'noun' },
      Produktivität: { en: 'productivity', es: 'productividad', type: 'noun' },
    },
  },
  en_B2: {
    meta: { language: 'en', level: 'B2', version: 1, generatedAt: '2026-06-09' },
    passages: [
      { id: 'p-lesen-1', module: 'lesen', title: 'Remote Work and City Life', text: 'Many companies now allow employees to work remotely two or three days a week. Supporters argue that commuting less reduces stress and carbon emissions. However, city centre shops and cafés report fewer customers on weekdays. Some economists suggest hybrid models may rebalance urban economies over time.' },
      { id: 'p-horen-1', module: 'horen', title: 'Interview: Climate Policy', text: 'Presenter: Can individual choices really fight climate change? Scientist: They help, but systemic policy is essential. Governments must invest in renewable energy and public transport. Presenter: Are consumers willing to pay more? Scientist: Surveys show growing support among younger voters.' },
    ],
    questions: [
      tf('lb-en-b2-l1', 'lesen', 'Remote work can reduce commuting.', true, { grammar: ['g-en-b2-clauses'], topic: ['technology'], difficulty: 2 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'Supporters argue commuting less reduces stress.' }),
      mcq('lb-en-b2-l2', 'lesen', 'What problem do city centres face?', ['a) Too many tourists', 'b) Fewer weekday customers', 'c) Higher rent only'], 'b', { grammar: ['g-en-b2-reported'], topic: ['economics'], difficulty: 3 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'Shops report fewer customers on weekdays.' }),
      mcq('lb-en-b2-l3', 'lesen', 'What might hybrid models do?', ['a) Rebalance urban economies', 'b) End all office work', 'c) Ban public transport'], 'a', { grammar: ['g-en-b2-clauses'], topic: ['migration'], difficulty: 4 }, { passageId: 'p-lesen-1', teil: 2, explanation: 'Economists suggest rebalancing over time.' }),
      mcq('lb-en-b2-h1', 'horen', 'What does the scientist say is essential?', ['a) Systemic policy', 'b) More advertising', 'c) Shorter holidays'], 'a', { grammar: ['g-en-b2-reported'], topic: ['climate'], difficulty: 3 }, { passageId: 'p-horen-1', segmentLabel: 'Recording 1', teil: 1, explanation: 'Systemic policy is essential.' }),
      tf('lb-en-b2-h2', 'horen', 'Governments should invest in renewable energy.', true, { grammar: ['g-en-b2-clauses'], topic: ['science'], difficulty: 3 }, { passageId: 'p-horen-1', segmentLabel: 'Recording 1', teil: 1, explanation: 'Explicitly stated in the interview.' }),
      mcq('lb-en-b2-h3', 'horen', 'Who shows growing support in surveys?', ['a) Younger voters', 'b) Only retirees', 'c) Nobody'], 'a', { grammar: ['g-en-b2-reported'], topic: ['politics'], difficulty: 4 }, { passageId: 'p-horen-1', segmentLabel: 'Recording 1', teil: 2, explanation: 'Growing support among younger voters.' }),
    ],
    vocabulary: {
      commuting: { es: 'desplazamiento al trabajo', de: 'Pendeln', type: 'noun' },
      renewable: { es: 'renovable', de: 'erneuerbar', type: 'adjective' },
      hybrid: { es: 'híbrido', de: 'hybrid', type: 'adjective' },
    },
  },
  en_C1: {
    meta: { language: 'en', level: 'C1', version: 1, generatedAt: '2026-06-09' },
    passages: [
      { id: 'p-lesen-1', module: 'lesen', title: 'Ethics of Artificial Intelligence', text: 'Philosophers increasingly debate whether autonomous systems should be granted limited moral agency. Proponents claim that transparency in algorithmic decision-making could restore public trust. Critics counter that responsibility must remain with human institutions, lest accountability dissolve into technical obscurity.' },
      { id: 'p-horen-1', module: 'horen', title: 'Lecture excerpt: Democracy', text: 'Lecturer: Democratic resilience depends not only on institutions but on civic literacy. When citizens cannot distinguish evidence from persuasion, deliberation collapses. Education policy, therefore, is not peripheral to democracy — it is foundational.' },
    ],
    questions: [
      mcq('lb-en-c1-l1', 'lesen', 'What could restore public trust according to proponents?', ['a) Secrecy', 'b) Transparency in algorithms', 'c) Faster computers'], 'b', { grammar: ['g-en-c1-inversion'], topic: ['ethics'], difficulty: 4 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'Transparency in algorithmic decision-making.' }),
      tf('lb-en-c1-l2', 'lesen', 'Critics believe accountability should stay with human institutions.', true, { grammar: ['g-en-c1-inversion'], topic: ['politics'], difficulty: 4 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'Responsibility must remain with human institutions.' }),
      mcq('lb-en-c1-h1', 'horen', 'What collapses without civic literacy?', ['a) Deliberation', 'b) Architecture', 'c) Currency'], 'a', { grammar: ['g-en-c1-inversion'], topic: ['politics'], difficulty: 5 }, { passageId: 'p-horen-1', segmentLabel: 'Recording 1', teil: 1, explanation: 'Deliberation collapses without literacy.' }),
      tf('lb-en-c1-h2', 'horen', 'Education policy is foundational to democracy.', true, { grammar: ['g-en-c1-inversion'], topic: ['education'], difficulty: 4 }, { passageId: 'p-horen-1', segmentLabel: 'Recording 1', teil: 1, explanation: 'Stated directly by the lecturer.' }),
    ],
    vocabulary: {
      accountability: { es: 'responsabilidad', de: 'Verantwortlichkeit', type: 'noun' },
      deliberation: { es: 'deliberación', de: 'Beratung', type: 'noun' },
      algorithmic: { es: 'algorítmico', de: 'algorithmisch', type: 'adjective' },
    },
  },
  es_B2: {
    meta: { language: 'es', level: 'B2', version: 1, generatedAt: '2026-06-09' },
    passages: [
      { id: 'p-lesen-1', module: 'lesen', title: 'Turismo sostenible', text: 'Muchas ciudades europeas limitan el número de visitantes para proteger el patrimonio histórico. Los hoteleros afirman que las restricciones reducen los ingresos, pero los vecinos celebran la disminución del ruido. Expertos recomiendan combinar cupos turísticos con transporte público eficiente.' },
      { id: 'p-horen-1', module: 'horen', title: 'Debate radiofónico: energía solar', text: 'Presentadora: ¿Es viable cubrir todos los tejados con paneles solares? Ingeniero: Es una parte de la solución, no la solución completa. Hay que mejorar también el almacenamiento. Presentadora: ¿Y el coste? Ingeniero: Ha bajado un 40% en la última década.' },
    ],
    questions: [
      tf('lb-es-b2-l1', 'lesen', 'Algunas ciudades limitan el número de turistas.', true, { grammar: ['g-es-b2-passive'], topic: ['turismo'], difficulty: 3 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'El texto lo afirma al inicio.' }),
      mcq('lb-es-b2-l2', 'lesen', '¿Qué recomiendan los expertos?', ['a) Prohibir el turismo', 'b) Combinar cupos con transporte público', 'c) Cerrar los museos'], 'b', { grammar: ['g-es-b2-subj-past'], topic: ['medio-ambiente'], difficulty: 4 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'Combinar cupos turísticos con transporte.' }),
      mcq('lb-es-b2-h1', 'horen', '¿Qué dice el ingeniero sobre los tejados solares?', ['a) Son la solución completa', 'b) Son solo una parte de la solución', 'c) Son imposibles'], 'b', { grammar: ['g-es-b2-passive'], topic: ['ciencia'], difficulty: 3 }, { passageId: 'p-horen-1', segmentLabel: 'Grabación 1', teil: 1, explanation: 'Una parte, no la solución completa.' }),
      tf('lb-es-b2-h2', 'horen', 'El coste de la energía solar ha bajado en la última década.', true, { grammar: ['g-es-b2-subj-past'], topic: ['economia'], difficulty: 4 }, { passageId: 'p-horen-1', segmentLabel: 'Grabación 1', teil: 1, explanation: 'Ha bajado un 40%.' }),
    ],
    vocabulary: {
      patrimonio: { en: 'heritage', de: 'Kulturerbe', type: 'noun' },
      tejado: { en: 'roof', de: 'Dach', type: 'noun' },
      almacenamiento: { en: 'storage', de: 'Speicherung', type: 'noun' },
    },
  },
  es_C1: {
    meta: { language: 'es', level: 'C1', version: 1, generatedAt: '2026-06-09' },
    passages: [
      { id: 'p-lesen-1', module: 'lesen', title: 'Literatura y crítica social', text: 'Varios académicos sostienen que la novela contemporánea funciona como archivo moral de tensiones sociales. Lejos de ser mero entretenimiento, articula conflictos que los medios simplifican. El reto del lector crítico consiste en reconocer la ideología sin reducir la obra a un manifiesto.' },
      { id: 'p-horen-1', module: 'horen', title: 'Conferencia: ética de la IA', text: 'Ponente: La regulación debe anticipar riesgos sistémicos, no solo casos aislados. Pregunta: ¿Quién responde cuando falla un algoritmo? Ponente: La cadena de responsabilidad debe ser explícita y verificable.' },
    ],
    questions: [
      mcq('lb-es-c1-l1', 'lesen', '¿Cómo describen los académicos la novela contemporánea?', ['a) Como archivo moral', 'b) Como manual técnico', 'c) Como deporte'], 'a', { grammar: ['g-es-c1-register'], topic: ['literatura'], difficulty: 4 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'Funciona como archivo moral.' }),
      tf('lb-es-c1-l2', 'lesen', 'El lector crítico debe evitar reducir la obra a un manifiesto.', true, { grammar: ['g-es-c1-register'], topic: ['filosofia'], difficulty: 5 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'Reconocer ideología sin reducir la obra.' }),
      mcq('lb-es-c1-h1', 'horen', '¿Qué debe anticipar la regulación?', ['a) Riesgos sistémicos', 'b) Solo moda', 'c) Nada'], 'a', { grammar: ['g-es-c1-register'], topic: ['etica'], difficulty: 5 }, { passageId: 'p-horen-1', segmentLabel: 'Grabación 1', teil: 1, explanation: 'Anticipar riesgos sistémicos.' }),
      tf('lb-es-c1-h2', 'horen', 'La responsabilidad debe ser verificable.', true, { grammar: ['g-es-c1-register'], topic: ['derechos'], difficulty: 4 }, { passageId: 'p-horen-1', segmentLabel: 'Grabación 1', teil: 1, explanation: 'Cadena explícita y verificable.' }),
    ],
    vocabulary: {
      ideología: { en: 'ideology', de: 'Ideologie', type: 'noun' },
      manifiesto: { en: 'manifesto', de: 'Manifest', type: 'noun' },
      verificable: { en: 'verifiable', de: 'überprüfbar', type: 'adjective' },
    },
  },
};

function writeBank(lang, level) {
  const key = `${lang}_${level}`;
  const bank = BANKS[key];
  if (!bank) throw new Error(`No seed bank for ${key}`);
  const dir = path.join(LIB, lang, level);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'questions.json');
  fs.writeFileSync(file, JSON.stringify(bank, null, 2) + '\n', 'utf8');
  console.log('Wrote', path.relative(ROOT, file), `(${bank.questions.length} questions)`);
}

for (const [lang, level] of SUPPORTED) writeBank(lang, level);
console.log('Library seed complete.');
