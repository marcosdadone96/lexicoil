#!/usr/bin/env node
/**
 * Expands library/es/{B2,C1}/questions.json to ~28 questions covering DELE modules.
 * Run offline: node scripts/expand-es-banks.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'library');

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
    questionType: 'multiple_choice',
    ...extra,
  };
}

function tf(id, module, question, correct, tags, extra = {}) {
  const val = correct ? 'True' : 'False';
  return {
    id,
    module,
    type: 'true_false',
    question,
    correct: val,
    correctAnswer: val,
    explanation: extra.explanation || '',
    grammarTags: tags.grammar || [],
    topicTags: tags.topic || [],
    difficulty: tags.difficulty || 3,
    questionType: 'true_false',
    ...extra,
  };
}

function writing(id, question, tags, extra = {}) {
  return {
    id,
    module: 'schreiben',
    type: 'multiple',
    question,
    correct: 'rubric',
    correctAnswer: 'rubric',
    explanation: extra.explanation || 'Evaluado por cohesión, registro y precisión léxica.',
    grammarTags: tags.grammar || [],
    topicTags: tags.topic || [],
    difficulty: tags.difficulty || 5,
    questionType: 'short_answer',
    skills: ['writing'],
    ...extra,
  };
}

const ES_B2 = {
  meta: { language: 'es', level: 'B2', version: 2, generatedAt: '2026-06-11', examType: 'dele' },
  passages: [
    {
      id: 'p-lesen-1',
      module: 'lesen',
      title: 'Turismo sostenible',
      text: 'Muchas ciudades europeas limitan el número de visitantes para proteger el patrimonio histórico. Los hoteleros afirman que las restricciones reducen los ingresos, pero los vecinos celebran la disminución del ruido. Expertos recomiendan combinar cupos turísticos con transporte público eficiente.',
    },
    {
      id: 'p-lesen-2',
      module: 'lesen',
      title: 'Teletrabajo y productividad',
      text: 'Un informe reciente indica que el teletrabajo híbrido puede aumentar la productividad si se establecen horarios claros. Sin embargo, algunos directivos temen la pérdida de espontaneidad creativa en las reuniones presenciales.',
    },
    {
      id: 'p-lesen-3',
      module: 'lesen',
      title: 'Educación digital',
      text: 'Varios centros educativos han integrado plataformas digitales para personalizar el aprendizaje. Los críticos advierten que no todos los estudiantes tienen acceso igual a dispositivos y conexión estable.',
    },
    {
      id: 'p-lesen-4',
      module: 'lesen',
      title: 'Salud mental juvenil',
      text: 'Psicólogos escolares señalan un aumento de la ansiedad entre adolescentes. Recomiendan programas de prevención y la reducción de la presión académica excesiva en exámenes finales.',
    },
    {
      id: 'p-lesen-long',
      module: 'lesen',
      title: 'Economía circular',
      text: 'La economía circular propone reutilizar materiales en lugar de descartarlos tras un solo uso. Empresas pioneras ya diseñan productos desmontables para facilitar el reciclaje. No obstante, los consumidores deben cambiar hábitos de compra impulsivos. El autor subraya que la regulación pública es imprescindible para acelerar la transición, aunque algunos sectores industriales la perciban como una carga. En definitiva, combinar innovación tecnológica, educación ciudadana y políticas coherentes parece la vía más realista hacia un modelo sostenible.',
    },
    {
      id: 'p-horen-1',
      module: 'horen',
      title: 'Debate radiofónico: energía solar',
      text: 'Presentadora: ¿Es viable cubrir todos los tejados con paneles solares? Ingeniero: Es una parte de la solución, no la solución completa. Hay que mejorar también el almacenamiento. Presentadora: ¿Y el coste? Ingeniero: Ha bajado un 40% en la última década.',
    },
    {
      id: 'p-horen-2',
      module: 'horen',
      title: 'Entrevista: movilidad urbana',
      text: 'Periodista: ¿Qué medida ha reducido más el tráfico? Concejala: La ampliación de carriles bici y el peaje urbano en horas punta. Periodista: ¿Hubo protestas? Concejala: Al principio sí, pero la calidad del aire mejoró notablemente.',
    },
    {
      id: 'p-horen-3',
      module: 'horen',
      title: 'Podcast: gastronomía local',
      text: 'Chef: Cocinar con productos de temporada no es moda, es responsabilidad. Apoyar a productores locales fortalece la economía regional. Entrevistador: ¿Es más caro para el restaurante? Chef: A corto plazo puede serlo, pero la clientela valora la transparencia.',
    },
    {
      id: 'p-lesen-5',
      module: 'lesen',
      title: 'Voluntariado internacional',
      text: 'Organizaciones sin ánimo de lucro buscan voluntarios para proyectos de alfabetización en zonas rurales. Se requiere compromiso mínimo de tres meses y nivel intermedio de español.',
    },
    {
      id: 'p-lesen-6',
      module: 'lesen',
      title: 'Deporte y inclusión',
      text: 'Un club local ha abierto equipos mixtos accesibles para personas con discapacidad. Los entrenadores subrayan que la diversidad mejora la cohesión del grupo.',
    },
    {
      id: 'p-lesen-long-2',
      module: 'lesen',
      title: 'Inteligencia artificial en el empleo',
      text: 'El informe analiza cómo la IA automatiza tareas repetitivas pero crea demanda de perfiles híbridos. Recomienda formación continua y negociación colectiva para redistribuir ganancias de productividad. Advierte contra el miedo apocalíptico, pero también contra el optimismo ingenuo.',
    },
    {
      id: 'p-horen-4',
      module: 'horen',
      title: 'Anuncio: curso de idiomas',
      text: 'Locutor: Matrícula abierta para cursos intensivos de verano. Clases presenciales y online. Descuento del 15% antes del 30 de junio.',
    },
    {
      id: 'p-horen-5',
      module: 'horen',
      title: 'Entrevista: cambio climático local',
      text: 'Activista: Necesitamos más zonas verdes y menos asfalto. Alcalde: Estamos plantando mil árboles este año. Activista: Insuficiente si no reducimos emisiones del transporte.',
    },
  ],
  questions: [
    tf('lb-es-b2-l1', 'lesen', 'Algunas ciudades limitan el número de turistas.', true, { grammar: ['g-es-b2-passive'], topic: ['turismo'], difficulty: 3 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'El texto lo afirma al inicio.' }),
    mcq('lb-es-b2-l2', 'lesen', '¿Qué recomiendan los expertos?', ['a) Prohibir el turismo', 'b) Combinar cupos con transporte público', 'c) Cerrar los museos'], 'b', { grammar: ['g-es-b2-subj-past'], topic: ['medio-ambiente'], difficulty: 4 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'Combinar cupos turísticos con transporte.' }),
    tf('lb-es-b2-l3', 'lesen', 'Los hoteleros apoyan sin reservas todas las restricciones.', false, { grammar: ['g-es-b2-passive'], topic: ['turismo'], difficulty: 3 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'Afirman que reducen ingresos.' }),
    mcq('lb-es-b2-l4', 'lesen', '¿Qué condición menciona el informe sobre teletrabajo?', ['a) Horarios claros', 'b) Eliminar reuniones', 'c) Trabajar solo fines de semana'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['trabajo'], difficulty: 4 }, { passageId: 'p-lesen-2', teil: 1, explanation: 'Productividad con horarios claros.' }),
    tf('lb-es-b2-l5', 'lesen', 'Algunos directivos temen perder creatividad presencial.', true, { grammar: ['g-es-b2-passive'], topic: ['trabajo'], difficulty: 3 }, { passageId: 'p-lesen-2', teil: 1, explanation: 'Pérdida de espontaneidad creativa.' }),
    mcq('lb-es-b2-l6', 'lesen', '¿Qué advierten los críticos de la educación digital?', ['a) Falta de acceso equitativo', 'b) Demasiados libros', 'c) Exceso de profesores'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['educacion'], difficulty: 4 }, { passageId: 'p-lesen-3', teil: 1, explanation: 'No todos tienen acceso igual.' }),
    tf('lb-es-b2-l7', 'lesen', 'Las plataformas digitales personalizan el aprendizaje.', true, { grammar: ['g-es-b2-passive'], topic: ['educacion'], difficulty: 3 }, { passageId: 'p-lesen-3', teil: 1, explanation: 'Integración para personalizar.' }),
    mcq('lb-es-b2-l8', 'lesen', '¿Qué recomiendan los psicólogos escolares?', ['a) Más exámenes', 'b) Programas de prevención', 'c) Eliminar vacaciones'], 'b', { grammar: ['g-es-b2-subj-past'], topic: ['salud'], difficulty: 4 }, { passageId: 'p-lesen-4', teil: 1, explanation: 'Programas de prevención.' }),
    tf('lb-es-b2-l9', 'lesen', 'El autor considera suficiente la innovación sin regulación.', false, { grammar: ['g-es-b2-passive'], topic: ['economia'], difficulty: 5 }, { passageId: 'p-lesen-long', teil: 2, explanation: 'La regulación pública es imprescindible.' }),
    mcq('lb-es-b2-l10', 'lesen', '¿Qué diseñan algunas empresas pioneras?', ['a) Productos desmontables', 'b) Envases de un solo uso', 'c) Publicidad masiva'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['economia'], difficulty: 4 }, { passageId: 'p-lesen-long', teil: 2, explanation: 'Productos desmontables para reciclaje.' }),
    tf('lb-es-b2-l11', 'lesen', 'Los consumidores deben cambiar hábitos impulsivos.', true, { grammar: ['g-es-b2-passive'], topic: ['medio-ambiente'], difficulty: 4 }, { passageId: 'p-lesen-long', teil: 2, explanation: 'Cambiar hábitos de compra impulsivos.' }),
    mcq('lb-es-b2-l12', 'lesen', 'Según el autor, ¿qué combinación es más realista?', ['a) Tecnología, educación y políticas', 'b) Solo publicidad', 'c) Cerrar industrias'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['medio-ambiente'], difficulty: 5 }, { passageId: 'p-lesen-long', teil: 2, explanation: 'Innovación, educación y políticas coherentes.' }),
    tf('lb-es-b2-l13', 'lesen', 'Algunos sectores ven la regulación como carga.', true, { grammar: ['g-es-b2-passive'], topic: ['politica'], difficulty: 4 }, { passageId: 'p-lesen-long', teil: 2, explanation: 'La perciben como una carga.' }),
    mcq('lb-es-b2-l14', 'lesen', '¿Cuál es la idea central del texto sobre economía circular?', ['a) Reutilizar materiales', 'b) Aumentar desechos', 'c) Prohibir reciclaje'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['economia'], difficulty: 4 }, { passageId: 'p-lesen-long', teil: 2, explanation: 'Reutilizar en lugar de descartar.' }),
    mcq('lb-es-b2-h1', 'horen', '¿Qué dice el ingeniero sobre los tejados solares?', ['a) Son la solución completa', 'b) Son solo una parte de la solución', 'c) Son imposibles'], 'b', { grammar: ['g-es-b2-passive'], topic: ['ciencia'], difficulty: 3 }, { passageId: 'p-horen-1', segmentLabel: 'Grabación 1', teil: 1, explanation: 'Una parte, no la solución completa.' }),
    tf('lb-es-b2-h2', 'horen', 'El coste de la energía solar ha bajado en la última década.', true, { grammar: ['g-es-b2-subj-past'], topic: ['economia'], difficulty: 4 }, { passageId: 'p-horen-1', segmentLabel: 'Grabación 1', teil: 1, explanation: 'Ha bajado un 40%.' }),
    mcq('lb-es-b2-h3', 'horen', '¿Qué hay que mejorar además de los paneles?', ['a) El almacenamiento', 'b) La moda', 'c) Los hoteles'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['ciencia'], difficulty: 3 }, { passageId: 'p-horen-1', segmentLabel: 'Grabación 1', teil: 1, explanation: 'Mejorar el almacenamiento.' }),
    tf('lb-es-b2-h4', 'horen', 'El ingeniero descarta por completo la energía solar.', false, { grammar: ['g-es-b2-passive'], topic: ['ciencia'], difficulty: 3 }, { passageId: 'p-horen-1', segmentLabel: 'Grabación 1', teil: 1, explanation: 'Es parte de la solución.' }),
    mcq('lb-es-b2-h5', 'horen', '¿Qué medida redujo más el tráfico según la concejala?', ['a) Carril bici y peaje urbano', 'b) Prohibir coches eléctricos', 'c) Cerrar el centro'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['urbanismo'], difficulty: 4 }, { passageId: 'p-horen-2', segmentLabel: 'Grabación 2', teil: 2, explanation: 'Carril bici y peaje en horas punta.' }),
    tf('lb-es-b2-h6', 'horen', 'La calidad del aire mejoró tras las medidas.', true, { grammar: ['g-es-b2-passive'], topic: ['medio-ambiente'], difficulty: 4 }, { passageId: 'p-horen-2', segmentLabel: 'Grabación 2', teil: 2, explanation: 'Mejoró notablemente.' }),
    mcq('lb-es-b2-h7', 'horen', '¿Por qué cocina el chef con productos de temporada?', ['a) Por responsabilidad', 'b) Por obligación legal', 'c) Por aburrimiento'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['cultura'], difficulty: 4 }, { passageId: 'p-horen-3', segmentLabel: 'Grabación 3', teil: 2, explanation: 'No es moda, es responsabilidad.' }),
    tf('lb-es-b2-h8', 'horen', 'Apoyar productores locales fortalece la economía regional.', true, { grammar: ['g-es-b2-passive'], topic: ['economia'], difficulty: 3 }, { passageId: 'p-horen-3', segmentLabel: 'Grabación 3', teil: 2, explanation: 'Fortalece la economía regional.' }),
    writing('lb-es-b2-w1', 'Redacte un texto argumentativo (150–180 palabras): «¿Deben las ciudades limitar el turismo masivo?» Presente ventajas y desventajas con conectores adecuados.', { grammar: ['g-es-b2-subj-past'], topic: ['turismo'], difficulty: 5 }, { teil: 1, explanation: 'Cohesión, conectores y registro formal.' }),
    writing('lb-es-b2-w2', 'Escriba una carta formal (150–180 palabras) al ayuntamiento proponiendo medidas para mejorar el transporte público en su barrio.', { grammar: ['g-es-b2-passive'], topic: ['urbanismo'], difficulty: 5 }, { teil: 1, explanation: 'Formato de carta formal y propuestas concretas.' }),
    mcq('lb-es-b2-l15', 'lesen', '¿Qué buscan las ONG?', ['a) Voluntarios para alfabetización', 'b) Inversores millonarios', 'c) Atletas profesionales'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['educacion'], difficulty: 3 }, { passageId: 'p-lesen-5', teil: 1, explanation: 'Proyectos de alfabetización.' }),
    tf('lb-es-b2-l16', 'lesen', 'Se exige compromiso mínimo de tres meses.', true, { grammar: ['g-es-b2-passive'], topic: ['trabajo'], difficulty: 3 }, { passageId: 'p-lesen-5', teil: 1, explanation: 'Compromiso mínimo de tres meses.' }),
    mcq('lb-es-b2-l17', 'lesen', '¿Qué destacan los entrenadores del club?', ['a) La cohesión mejora con diversidad', 'b) Solo ganar trofeos', 'c) Excluir principiantes'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['deporte'], difficulty: 4 }, { passageId: 'p-lesen-6', teil: 1, explanation: 'Diversidad mejora cohesión.' }),
    tf('lb-es-b2-l18', 'lesen', 'El club ofrece equipos accesibles para personas con discapacidad.', true, { grammar: ['g-es-b2-passive'], topic: ['deporte'], difficulty: 3 }, { passageId: 'p-lesen-6', teil: 1, explanation: 'Equipos mixtos accesibles.' }),
    tf('lb-es-b2-l19', 'lesen', 'El informe recomienda formación continua.', true, { grammar: ['g-es-b2-passive'], topic: ['tecnologia'], difficulty: 4 }, { passageId: 'p-lesen-long-2', teil: 2, explanation: 'Recomienda formación continua.' }),
    mcq('lb-es-b2-l20', 'lesen', '¿Qué perfil crea demanda la IA?', ['a) Perfiles híbridos', 'b) Solo manual', 'c) Ninguno'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['tecnologia'], difficulty: 4 }, { passageId: 'p-lesen-long-2', teil: 2, explanation: 'Demanda de perfiles híbridos.' }),
    tf('lb-es-b2-l21', 'lesen', 'El informe defiende un optimismo ingenuo.', false, { grammar: ['g-es-b2-passive'], topic: ['tecnologia'], difficulty: 5 }, { passageId: 'p-lesen-long-2', teil: 2, explanation: 'Advierte contra optimismo ingenuo.' }),
    mcq('lb-es-b2-l22', 'lesen', '¿Qué propone para ganancias de productividad?', ['a) Negociación colectiva', 'b) Eliminar sindicatos', 'c) Impuestos cero'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['economia'], difficulty: 5 }, { passageId: 'p-lesen-long-2', teil: 2, explanation: 'Negociación colectiva.' }),
    tf('lb-es-b2-l23', 'lesen', 'La IA solo destruye empleo según el informe.', false, { grammar: ['g-es-b2-passive'], topic: ['tecnologia'], difficulty: 4 }, { passageId: 'p-lesen-long-2', teil: 2, explanation: 'También crea demanda.' }),
    mcq('lb-es-b2-l24', 'lesen', '¿Qué equilibrio busca el informe?', ['a) Entre miedo y optimismo ingenuo', 'b) Solo alarmismo', 'c) Ignorar la IA'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['tecnologia'], difficulty: 5 }, { passageId: 'p-lesen-long-2', teil: 2, explanation: 'Evita extremos apocalípticos e ingenuos.' }),
    mcq('lb-es-b2-h9', 'horen', '¿Qué modalidades ofrece el curso?', ['a) Presencial y online', 'b) Solo por correo', 'c) Solo nocturno'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['educacion'], difficulty: 3 }, { passageId: 'p-horen-4', segmentLabel: 'Grabación 4', teil: 1, explanation: 'Presenciales y online.' }),
    tf('lb-es-b2-h10', 'horen', 'Hay descuento antes del 30 de junio.', true, { grammar: ['g-es-b2-passive'], topic: ['educacion'], difficulty: 3 }, { passageId: 'p-horen-4', segmentLabel: 'Grabación 4', teil: 1, explanation: '15% de descuento.' }),
    mcq('lb-es-b2-h11', 'horen', '¿Qué pide la activista?', ['a) Más zonas verdes', 'b) Más asfalto', 'c) Menos árboles'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['medio-ambiente'], difficulty: 4 }, { passageId: 'p-horen-5', segmentLabel: 'Grabación 5', teil: 1, explanation: 'Más zonas verdes.' }),
    tf('lb-es-b2-h12', 'horen', 'El alcalde niega plantar árboles.', false, { grammar: ['g-es-b2-passive'], topic: ['medio-ambiente'], difficulty: 3 }, { passageId: 'p-horen-5', segmentLabel: 'Grabación 5', teil: 1, explanation: 'Mil árboles este año.' }),
    mcq('lb-es-b2-h13', 'horen', '¿Qué considera insuficiente la activista?', ['a) Plantar sin reducir emisiones', 'b) Toda acción municipal', 'c) El transporte público'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['medio-ambiente'], difficulty: 5 }, { passageId: 'p-horen-5', segmentLabel: 'Grabación 5', teil: 2, explanation: 'Insuficiente sin reducir emisiones.' }),
    tf('lb-es-b2-h14', 'horen', 'La activista vincula transporte y emisiones.', true, { grammar: ['g-es-b2-passive'], topic: ['medio-ambiente'], difficulty: 4 }, { passageId: 'p-horen-5', segmentLabel: 'Grabación 5', teil: 2, explanation: 'Reducir emisiones del transporte.' }),
    mcq('lb-es-b2-h15', 'horen', '¿Cuántos árboles plantará el ayuntamiento?', ['a) Mil', 'b) Diez', 'c) Ninguno'], 'a', { grammar: ['g-es-b2-subj-past'], topic: ['medio-ambiente'], difficulty: 3 }, { passageId: 'p-horen-5', segmentLabel: 'Grabación 5', teil: 2, explanation: 'Mil árboles.' }),
    tf('lb-es-b2-h16', 'horen', 'El curso es solo presencial.', false, { grammar: ['g-es-b2-passive'], topic: ['educacion'], difficulty: 3 }, { passageId: 'p-horen-4', segmentLabel: 'Grabación 4', teil: 2, explanation: 'También online.' }),
    writing('lb-es-b2-w3', 'Redacte un correo formal (150–180 palabras) a una empresa solicitando información sobre un programa de prácticas internacionales.', { grammar: ['g-es-b2-subj-past'], topic: ['trabajo'], difficulty: 5 }, { teil: 1, explanation: 'Registro formal en correo electrónico.' }),
    writing('lb-es-b2-w4', 'Escriba un artículo de opinión (150–180 palabras) sobre el impacto de la IA en el mercado laboral joven.', { grammar: ['g-es-b2-passive'], topic: ['tecnologia'], difficulty: 6 }, { teil: 1, explanation: 'Opinión fundamentada con conectores.' }),
  ],
  vocabulary: {
    patrimonio: { en: 'heritage', de: 'Kulturerbe', type: 'noun' },
    tejado: { en: 'roof', de: 'Dach', type: 'noun' },
    almacenamiento: { en: 'storage', de: 'Speicherung', type: 'noun' },
    sostenible: { en: 'sustainable', de: 'nachhaltig', type: 'adjective' },
    circular: { en: 'circular', de: 'zirkulär', type: 'adjective' },
  },
};

const ES_C1 = {
  meta: { language: 'es', level: 'C1', version: 2, generatedAt: '2026-06-11', examType: 'dele' },
  passages: [
    {
      id: 'p-lesen-1',
      module: 'lesen',
      title: 'Literatura y crítica social',
      text: 'Varios académicos sostienen que la novela contemporánea funciona como archivo moral de tensiones sociales. Lejos de ser mero entretenimiento, articula conflictos que los medios simplifican. El reto del lector crítico consiste en reconocer la ideología sin reducir la obra a un manifiesto.',
    },
    {
      id: 'p-lesen-2',
      module: 'lesen',
      title: 'Derecho y algoritmos',
      text: 'Juristas advierten que delegar decisiones administrativas en algoritmos opacos erosiona el debido proceso. Proponen auditorías independientes y trazabilidad de los datos de entrenamiento.',
    },
    {
      id: 'p-lesen-3',
      module: 'lesen',
      title: 'Política migratoria',
      text: 'El editorial defiende políticas migratorias basadas en datos, pero reconoce que la percepción mediática distorsiona el debate. Insiste en distinguir migración laboral de solicitudes humanitarias.',
    },
    {
      id: 'p-lesen-4',
      module: 'lesen',
      title: 'Investigación climática',
      text: 'Un consorcio internacional publicó resultados que vinculan olas de calor extremas con cambios en corrientes oceánicas. Los autores evitan alarmismo, pero piden actuar antes de 2030.',
    },
    {
      id: 'p-lesen-long',
      module: 'lesen',
      title: 'Bioética y consentimiento',
      text: 'El ensayo examina si el consentimiento informado basta cuando la asimetría de información entre paciente y especialista es estructural. El autor argumenta que la transparencia debe incluir incertidumbres científicas y conflictos de interés financieros. Rechaza tanto el paternalismo médico como el relativismo que niega toda autoridad experta. Propone foros deliberativos donde ciudadanos y profesionales negocien prioridades en salud pública. Concluye que la legitimidad democrática de las políticas sanitarias depende de procesos inclusivos, no solo de resultados técnicos.',
    },
    {
      id: 'p-horen-1',
      module: 'horen',
      title: 'Conferencia: ética de la IA',
      text: 'Ponente: La regulación debe anticipar riesgos sistémicos, no solo casos aislados. Pregunta: ¿Quién responde cuando falla un algoritmo? Ponente: La cadena de responsabilidad debe ser explícita y verificable.',
    },
    {
      id: 'p-horen-2',
      module: 'horen',
      title: 'Mesa redonda: prensa digital',
      text: 'Editora: La desinformación prospera cuando el algoritmo premia el clic sensacionalista. Periodista: Hace falta alfabetización mediática desde la escuela. Moderador: ¿Sin regular plataformas? Editora: Regular con criterios de transparencia, no censura previa.',
    },
    {
      id: 'p-horen-3',
      module: 'horen',
      title: 'Seminario: memoria histórica',
      text: 'Historiadora: Recordar no es repetir el pasado, sino interrogarlo críticamente. Estudiante: ¿Cómo evitar la polarización? Historiadora: Con fuentes verificables y espacios de diálogo intergeneracional.',
    },
    {
      id: 'p-lesen-5',
      module: 'lesen',
      title: 'Filosofía política',
      text: 'El ensayo breve distingue libertad negativa y positiva. Critica simplificaciones mediáticas que presentan toda regulación como opresión.',
    },
    {
      id: 'p-lesen-6',
      module: 'lesen',
      title: 'Neurociencia y aprendizaje',
      text: 'Investigadores advierten contra mitos neuromarketing en educación. La repetición espaciada sí tiene evidencia sólida; la supuesta dominancia hemisférica no.',
    },
    {
      id: 'p-lesen-long-2',
      module: 'lesen',
      title: 'Globalización y desigualdad',
      text: 'El texto sostiene que la globalización financiera amplificó desigualdades sin mecanismos redistributivos transnacionales. Propone impuestos mínimos coordinados y mayor transparencia de beneficiarios finales. Rechaza tanto el proteccionismo autárquico como el laissez-faire absoluto.',
    },
    {
      id: 'p-horen-4',
      module: 'horen',
      title: 'Debate: universidad pública',
      text: 'Rector: Hay que diversificar financiación sin mercantilizar titulaciones. Estudiante: La matrícula no debe ser barrera. Moderador: ¿Más becas o más inversión fiscal?',
    },
    {
      id: 'p-horen-5',
      module: 'horen',
      title: 'Coloquio: arte contemporáneo',
      text: 'Curadora: El arte puede incomodar sin ser obsceno. Crítico: La provocación vacía banaliza el debate. Curadora: Distinguamos censura institucional de crítica legítima.',
    },
  ],
  questions: [
    mcq('lb-es-c1-l1', 'lesen', '¿Cómo describen los académicos la novela contemporánea?', ['a) Como archivo moral', 'b) Como manual técnico', 'c) Como deporte'], 'a', { grammar: ['g-es-c1-register'], topic: ['literatura'], difficulty: 4 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'Funciona como archivo moral.' }),
    tf('lb-es-c1-l2', 'lesen', 'El lector crítico debe evitar reducir la obra a un manifiesto.', true, { grammar: ['g-es-c1-register'], topic: ['filosofia'], difficulty: 5 }, { passageId: 'p-lesen-1', teil: 1, explanation: 'Reconocer ideología sin reducir la obra.' }),
    mcq('lb-es-c1-l3', 'lesen', '¿Qué proponen los juristas sobre algoritmos?', ['a) Auditorías independientes', 'b) Eliminar tribunales', 'c) Secreto total'], 'a', { grammar: ['g-es-c1-register'], topic: ['derechos'], difficulty: 5 }, { passageId: 'p-lesen-2', teil: 1, explanation: 'Auditorías y trazabilidad.' }),
    tf('lb-es-c1-l4', 'lesen', 'Los algoritmos opacos pueden erosionar el debido proceso.', true, { grammar: ['g-es-c1-register'], topic: ['derechos'], difficulty: 4 }, { passageId: 'p-lesen-2', teil: 1, explanation: 'Erosiona el debido proceso.' }),
    mcq('lb-es-c1-l5', 'lesen', '¿Qué distingue el editorial en migración?', ['a) Laboral vs humanitaria', 'b) Legal vs ilegal únicamente', 'c) Rural vs urbana'], 'a', { grammar: ['g-es-c1-register'], topic: ['politica'], difficulty: 5 }, { passageId: 'p-lesen-3', teil: 1, explanation: 'Distinguir tipos de migración.' }),
    tf('lb-es-c1-l6', 'lesen', 'El editorial niega que la percepción mediática influya.', false, { grammar: ['g-es-c1-register'], topic: ['politica'], difficulty: 4 }, { passageId: 'p-lesen-3', teil: 1, explanation: 'Reconoce distorsión mediática.' }),
    mcq('lb-es-c1-l7', 'lesen', '¿Qué vinculan los científicos con las olas de calor?', ['a) Corrientes oceánicas', 'b) Fases lunares', 'c) Publicidad'], 'a', { grammar: ['g-es-c1-register'], topic: ['ciencia'], difficulty: 5 }, { passageId: 'p-lesen-4', teil: 1, explanation: 'Cambios en corrientes oceánicas.' }),
    tf('lb-es-c1-l8', 'lesen', 'Los autores piden actuar antes de 2030.', true, { grammar: ['g-es-c1-register'], topic: ['medio-ambiente'], difficulty: 4 }, { passageId: 'p-lesen-4', teil: 1, explanation: 'Pedir actuar antes de 2030.' }),
    tf('lb-es-c1-l9', 'lesen', 'El autor rechaza el paternalismo médico.', true, { grammar: ['g-es-c1-register'], topic: ['etica'], difficulty: 5 }, { passageId: 'p-lesen-long', teil: 2, explanation: 'Rechaza paternalismo y relativismo.' }),
    mcq('lb-es-c1-l10', 'lesen', '¿Qué propone para legitimar políticas sanitarias?', ['a) Foros deliberativos inclusivos', 'b) Decisiones unilaterales', 'c) Eliminar la ciencia'], 'a', { grammar: ['g-es-c1-register'], topic: ['etica'], difficulty: 6 }, { passageId: 'p-lesen-long', teil: 2, explanation: 'Foros deliberativos inclusivos.' }),
    tf('lb-es-c1-l11', 'lesen', 'La transparencia debe incluir incertidumbres científicas.', true, { grammar: ['g-es-c1-register'], topic: ['salud'], difficulty: 5 }, { passageId: 'p-lesen-long', teil: 2, explanation: 'Incluir incertidumbres e intereses.' }),
    mcq('lb-es-c1-l12', 'lesen', '¿Qué cuestiona el ensayo sobre consentimiento informado?', ['a) Si basta con asimetría estructural', 'b) Si existe en deportes', 'c) Si requiere notario'], 'a', { grammar: ['g-es-c1-register'], topic: ['etica'], difficulty: 6 }, { passageId: 'p-lesen-long', teil: 2, explanation: 'Asimetría estructural de información.' }),
    tf('lb-es-c1-l13', 'lesen', 'El autor equipara autoridad experta con censura.', false, { grammar: ['g-es-c1-register'], topic: ['filosofia'], difficulty: 5 }, { passageId: 'p-lesen-long', teil: 2, explanation: 'No niega toda autoridad experta.' }),
    mcq('lb-es-c1-l14', 'lesen', 'Según el ensayo, ¿de qué depende la legitimidad democrática?', ['a) Procesos inclusivos', 'b) Solo marketing', 'c) Resultados técnicos únicamente'], 'a', { grammar: ['g-es-c1-register'], topic: ['politica'], difficulty: 5 }, { passageId: 'p-lesen-long', teil: 2, explanation: 'Procesos inclusivos, no solo técnicos.' }),
    mcq('lb-es-c1-h1', 'horen', '¿Qué debe anticipar la regulación?', ['a) Riesgos sistémicos', 'b) Solo moda', 'c) Nada'], 'a', { grammar: ['g-es-c1-register'], topic: ['etica'], difficulty: 5 }, { passageId: 'p-horen-1', segmentLabel: 'Grabación 1', teil: 1, explanation: 'Anticipar riesgos sistémicos.' }),
    tf('lb-es-c1-h2', 'horen', 'La responsabilidad debe ser verificable.', true, { grammar: ['g-es-c1-register'], topic: ['derechos'], difficulty: 4 }, { passageId: 'p-horen-1', segmentLabel: 'Grabación 1', teil: 1, explanation: 'Cadena explícita y verificable.' }),
    mcq('lb-es-c1-h3', 'horen', '¿Qué premia el algoritmo según la editora?', ['a) Clic sensacionalista', 'b) Investigación lenta', 'c) Silencio'], 'a', { grammar: ['g-es-c1-register'], topic: ['medios'], difficulty: 5 }, { passageId: 'p-horen-2', segmentLabel: 'Grabación 2', teil: 1, explanation: 'Premia el clic sensacionalista.' }),
    tf('lb-es-c1-h4', 'horen', 'La editora defiende censura previa total.', false, { grammar: ['g-es-c1-register'], topic: ['medios'], difficulty: 5 }, { passageId: 'p-horen-2', segmentLabel: 'Grabación 2', teil: 1, explanation: 'Transparencia, no censura previa.' }),
    mcq('lb-es-c1-h5', 'horen', '¿Qué propone el periodista en educación?', ['a) Alfabetización mediática', 'b) Eliminar internet', 'c) Solo memoria'], 'a', { grammar: ['g-es-c1-register'], topic: ['educacion'], difficulty: 5 }, { passageId: 'p-horen-2', segmentLabel: 'Grabación 2', teil: 2, explanation: 'Alfabetización mediática escolar.' }),
    tf('lb-es-c1-h6', 'horen', 'Recordar implica interrogar críticamente el pasado.', true, { grammar: ['g-es-c1-register'], topic: ['historia'], difficulty: 5 }, { passageId: 'p-horen-3', segmentLabel: 'Grabación 3', teil: 2, explanation: 'Interrogar críticamente.' }),
    mcq('lb-es-c1-h7', 'horen', '¿Cómo evitar polarización según la historiadora?', ['a) Fuentes verificables y diálogo', 'b) Prohibir preguntas', 'c) Ignorar archivos'], 'a', { grammar: ['g-es-c1-register'], topic: ['historia'], difficulty: 5 }, { passageId: 'p-horen-3', segmentLabel: 'Grabación 3', teil: 2, explanation: 'Fuentes y diálogo intergeneracional.' }),
    tf('lb-es-c1-h8', 'horen', 'La historiadora equipara recordar con repetir el pasado.', false, { grammar: ['g-es-c1-register'], topic: ['historia'], difficulty: 4 }, { passageId: 'p-horen-3', segmentLabel: 'Grabación 3', teil: 2, explanation: 'No es repetir, es interrogar.' }),
    writing('lb-es-c1-w1', 'Redacte un ensayo argumentativo (220–260 palabras): «¿Debe regularse la inteligencia artificial con criterios de transparencia obligatoria?»', { grammar: ['g-es-c1-register'], topic: ['etica'], difficulty: 7 }, { teil: 1, explanation: 'Ensayo formal con matices y cohesión C1.' }),
    writing('lb-es-c1-w2', 'Escriba una propuesta (220–260 palabras) a su universidad para mejorar la alfabetización mediática del alumnado.', { grammar: ['g-es-c1-register'], topic: ['educacion'], difficulty: 7 }, { teil: 2, explanation: 'Propuesta estructurada con registro formal.' }),
    mcq('lb-es-c1-l15', 'lesen', '¿Qué distingue el ensayo breve?', ['a) Libertad negativa y positiva', 'b) Solo derecho penal', 'c) Gramática escolar'], 'a', { grammar: ['g-es-c1-register'], topic: ['filosofia'], difficulty: 5 }, { passageId: 'p-lesen-5', teil: 1, explanation: 'Distingue dos tipos de libertad.' }),
    tf('lb-es-c1-l16', 'lesen', 'Critica presentar toda regulación como opresión.', true, { grammar: ['g-es-c1-register'], topic: ['politica'], difficulty: 5 }, { passageId: 'p-lesen-5', teil: 1, explanation: 'Simplificaciones mediáticas.' }),
    mcq('lb-es-c1-l17', 'lesen', '¿Qué tiene evidencia sólida según neurocientíficos?', ['a) Repetición espaciada', 'b) Dominancia hemisférica', 'c) Aprender dormido'], 'a', { grammar: ['g-es-c1-register'], topic: ['ciencia'], difficulty: 5 }, { passageId: 'p-lesen-6', teil: 1, explanation: 'Repetición espaciada.' }),
    tf('lb-es-c1-l18', 'lesen', 'Los investigadores apoyan mitos neuromarketing.', false, { grammar: ['g-es-c1-register'], topic: ['educacion'], difficulty: 4 }, { passageId: 'p-lesen-6', teil: 1, explanation: 'Advierten contra mitos.' }),
    tf('lb-es-c1-l19', 'lesen', 'El texto propone impuestos mínimos coordinados.', true, { grammar: ['g-es-c1-register'], topic: ['economia'], difficulty: 6 }, { passageId: 'p-lesen-long-2', teil: 2, explanation: 'Impuestos mínimos coordinados.' }),
    mcq('lb-es-c1-l20', 'lesen', '¿Qué rechaza el autor además del laissez-faire?', ['a) Proteccionismo autárquico', 'b) Toda inversión', 'c) Comercio justo'], 'a', { grammar: ['g-es-c1-register'], topic: ['economia'], difficulty: 6 }, { passageId: 'p-lesen-long-2', teil: 2, explanation: 'Rechaza proteccionismo autárquico.' }),
    tf('lb-es-c1-l21', 'lesen', 'La globalización financiera redujo desigualdades según el texto.', false, { grammar: ['g-es-c1-register'], topic: ['economia'], difficulty: 5 }, { passageId: 'p-lesen-long-2', teil: 2, explanation: 'Amplificó desigualdades.' }),
    mcq('lb-es-c1-l22', 'lesen', '¿Qué pide para beneficiarios finales?', ['a) Mayor transparencia', 'b) Secreto bancario', 'c) Menos datos'], 'a', { grammar: ['g-es-c1-register'], topic: ['politica'], difficulty: 6 }, { passageId: 'p-lesen-long-2', teil: 2, explanation: 'Transparencia de beneficiarios.' }),
    tf('lb-es-c1-l23', 'lesen', 'Faltan mecanismos redistributivos transnacionales.', true, { grammar: ['g-es-c1-register'], topic: ['economia'], difficulty: 5 }, { passageId: 'p-lesen-long-2', teil: 2, explanation: 'Sin mecanismos redistributivos.' }),
    mcq('lb-es-c1-l24', 'lesen', '¿Cuál es la postura general del texto?', ['a) Equilibrio regulador', 'b) Autarquía total', 'c) Desregulación absoluta'], 'a', { grammar: ['g-es-c1-register'], topic: ['economia'], difficulty: 6 }, { passageId: 'p-lesen-long-2', teil: 2, explanation: 'Evita extremos autárquicos y laissez-faire.' }),
    mcq('lb-es-c1-h9', 'horen', '¿Qué teme el rector respecto a titulaciones?', ['a) Mercantilizarlas', 'b) Eliminarlas', 'c) Gratis para todos sin calidad'], 'a', { grammar: ['g-es-c1-register'], topic: ['educacion'], difficulty: 5 }, { passageId: 'p-horen-4', segmentLabel: 'Grabación 4', teil: 1, explanation: 'Sin mercantilizar titulaciones.' }),
    tf('lb-es-c1-h10', 'horen', 'El estudiante considera la matrícula una barrera.', true, { grammar: ['g-es-c1-register'], topic: ['educacion'], difficulty: 5 }, { passageId: 'p-horen-4', segmentLabel: 'Grabación 4', teil: 1, explanation: 'Matrícula no debe ser barrera.' }),
    mcq('lb-es-c1-h11', 'horen', '¿Qué distingue la curadora de censura?', ['a) Crítica legítima vs censura institucional', 'b) Nada', 'c) Solo estética'], 'a', { grammar: ['g-es-c1-register'], topic: ['cultura'], difficulty: 6 }, { passageId: 'p-horen-5', segmentLabel: 'Grabación 5', teil: 1, explanation: 'Distingue censura y crítica.' }),
    tf('lb-es-c1-h12', 'horen', 'El crítico elogia toda provocación vacía.', false, { grammar: ['g-es-c1-register'], topic: ['cultura'], difficulty: 5 }, { passageId: 'p-horen-5', segmentLabel: 'Grabación 5', teil: 1, explanation: 'Banaliza el debate.' }),
    mcq('lb-es-c1-h13', 'horen', '¿Qué opciones plantea el moderador?', ['a) Más becas o más inversión fiscal', 'b) Cerrar universidades', 'c) Solo donaciones privadas'], 'a', { grammar: ['g-es-c1-register'], topic: ['educacion'], difficulty: 6 }, { passageId: 'p-horen-4', segmentLabel: 'Grabación 4', teil: 2, explanation: 'Becas vs inversión fiscal.' }),
    tf('lb-es-c1-h14', 'horen', 'La curadora defiende arte que incomoda.', true, { grammar: ['g-es-c1-register'], topic: ['cultura'], difficulty: 5 }, { passageId: 'p-horen-5', segmentLabel: 'Grabación 5', teil: 2, explanation: 'Puede incomodar sin ser obsceno.' }),
    mcq('lb-es-c1-h15', 'horen', '¿Qué busca el rector en financiación?', ['a) Diversificarla', 'b) Eliminarla', 'c) Solo publicidad'], 'a', { grammar: ['g-es-c1-register'], topic: ['educacion'], difficulty: 5 }, { passageId: 'p-horen-4', segmentLabel: 'Grabación 4', teil: 2, explanation: 'Diversificar financiación.' }),
    tf('lb-es-c1-h16', 'horen', 'El debate universitario ignora becas.', false, { grammar: ['g-es-c1-register'], topic: ['educacion'], difficulty: 4 }, { passageId: 'p-horen-4', segmentLabel: 'Grabación 4', teil: 2, explanation: 'Plantea becas e inversión.' }),
    writing('lb-es-c1-w3', 'Redacte un informe (220–260 palabras) sobre riesgos éticos del uso de algoritmos en la administración pública.', { grammar: ['g-es-c1-register'], topic: ['derechos'], difficulty: 7 }, { teil: 1, explanation: 'Informe formal con evidencia.' }),
    writing('lb-es-c1-w4', 'Escriba un artículo de opinión (220–260 palabras) sobre el papel de la novela en la crítica social contemporánea.', { grammar: ['g-es-c1-register'], topic: ['literatura'], difficulty: 7 }, { teil: 2, explanation: 'Opinión matizada con registro alto.' }),
  ],
  vocabulary: {
    ideología: { en: 'ideology', de: 'Ideologie', type: 'noun' },
    manifiesto: { en: 'manifesto', de: 'Manifest', type: 'noun' },
    verificable: { en: 'verifiable', de: 'überprüfbar', type: 'adjective' },
    deliberativo: { en: 'deliberative', de: 'deliberativ', type: 'adjective' },
    asimetría: { en: 'asymmetry', de: 'Asymmetrie', type: 'noun' },
  },
};

function writeBank(lang, level, bank) {
  const dir = path.join(LIB, lang, level);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'questions.json');
  fs.writeFileSync(file, JSON.stringify(bank, null, 2) + '\n', 'utf8');
  console.log('Wrote', path.relative(ROOT, file), `(${bank.questions.length} questions)`);
}

writeBank('es', 'B2', ES_B2);
writeBank('es', 'C1', ES_C1);
console.log('Spanish banks expanded.');
