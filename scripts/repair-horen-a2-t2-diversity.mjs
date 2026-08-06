#!/usr/bin/env node
/**
 * Replace cloned Hören T2 A2 dialogues with 4 theme-unique transcripts.
 *   node scripts/repair-horen-a2-t2-diversity.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANK = path.join(ROOT, 'library/de/A2/questions.json');
const apply = process.argv.includes('--apply');

const PICTURES = [
  { key: 'a', icon: '🚴‍♂️', label: 'Fahrrad fahren' },
  { key: 'b', icon: '🇩🇪', label: 'Deutschkurs' },
  { key: 'c', icon: '👫', label: 'Freunde treffen' },
  { key: 'd', icon: '🏋️‍♀️', label: 'Sport machen' },
  { key: 'e', icon: '🏛️', label: 'Museum' },
  { key: 'f', icon: '🎬', label: 'Kino' },
  { key: 'g', icon: '📚', label: 'Lernen' },
  { key: 'h', icon: '🛒', label: 'Einkaufen' },
  { key: 'i', icon: '🍳', label: 'Kochen' },
];

const THEMES = {
  health: {
    passageId: 'de-a2-p-horen-t2-health-pic01',
    topicTag: 'Gesundheit',
    title: 'Gesund leben — Wochenplan',
    text:
      'Anna: Hallo Tom! Wie sieht deine Woche aus?\n' +
      'Tom: Guten Tag Anna! Am Montag gehe ich zum Arzt für eine Vorsorgeuntersuchung.\n' +
      'Anna: Sehr gut! Ich mache am Montag Yoga im Park.\n' +
      'Tom: Dienstag kaufe ich Gemüse auf dem Markt.\n' +
      'Anna: Ich gehe dienstags ins Fitnessstudio.\n' +
      'Tom: Mittwoch besuche ich einen Vortrag über gesunde Ernährung.\n' +
      'Anna: Ich schwimme am Mittwochnachmittag im Hallenbad.\n' +
      'Tom: Donnerstag hole ich Medikamente in der Apotheke.\n' +
      'Anna: Ich treffe am Donnerstag meine Freundin zum Spaziergang.\n' +
      'Tom: Freitag koche ich eine leichte Gemüsesuppe.\n' +
      'Anna: Am Freitagabend gehe ich früh schlafen — ich brauche Ruhe.',
    answers: { Montag: 'a', Dienstag: 'd', Mittwoch: 'e', Donnerstag: 'h', Freitag: 'i' },
  },
  work: {
    passageId: 'de-a2-p-horen-t2-work-pic01',
    topicTag: 'Arbeit',
    title: 'Arbeitswoche — Büro und Termine',
    text:
      'Sara: Hallo Felix! Was machst du diese Woche?\n' +
      'Felix: Montag habe ich ein wichtiges Meeting im Büro.\n' +
      'Sara: Ich arbeite montags oft von zu Hause.\n' +
      'Felix: Dienstag schreibe ich E-Mails an unsere Kunden.\n' +
      'Sara: Am Dienstagabend lerne ich für eine Prüfung am Beruf.\n' +
      'Felix: Mittwoch fahre ich zu einem Kunden in eine andere Stadt.\n' +
      'Sara: Ich habe mittwochs einen Sprachkurs nach der Arbeit.\n' +
      'Felix: Donnerstag sortiere ich Unterlagen im Archiv.\n' +
      'Sara: Donnerstag gehe ich mit Kollegen ins Café.\n' +
      'Felix: Freitag mache ich Überstunden und bleibe länger.\n' +
      'Sara: Am Freitag kaufe ich Geschenke für meine Familie.',
    answers: { Montag: 'g', Dienstag: 'b', Mittwoch: 'c', Donnerstag: 'h', Freitag: 'd' },
  },
  society: {
    passageId: 'de-a2-p-horen-t2-society-pic01',
    topicTag: 'Gesellschaft',
    title: 'Stadtleben — Freizeit in der Nachbarschaft',
    text:
      'Julia: Hi Paul! Hast du Pläne für die Woche?\n' +
      'Paul: Ja! Am Montag helfe ich beim Stadtfest in unserer Straße.\n' +
      'Julia: Toll! Ich gehe montags in die Bibliothek.\n' +
      'Paul: Dienstag spiele ich Fußball mit Freunden im Park.\n' +
      'Julia: Ich besuche dienstags meine Nachbarin — sie ist krank.\n' +
      'Paul: Mittwoch gehe ich ins Kino mit meinem Bruder.\n' +
      'Julia: Mittwoch koche ich für den Verein „Nachbarschaft hilft“.\n' +
      'Paul: Donnerstag fahre ich mit dem Fahrrad an den See.\n' +
      'Julia: Donnerstag lerne ich neue Leute im Sprachcafé kennen.\n' +
      'Paul: Freitag gehe ich auf ein Konzert in der Stadt.\n' +
      'Julia: Am Freitagabend schaue ich einen Film zu Hause.',
    answers: { Montag: 'g', Dienstag: 'c', Mittwoch: 'i', Donnerstag: 'a', Freitag: 'f' },
  },
  education: {
    passageId: 'de-a2-p-horen-t2-education-pic01',
    topicTag: 'Bildung',
    title: 'Lernen und Kurse — Wochenplan',
    text:
      'Nina: Guten Tag Lukas! Wie ist dein Stundenplan?\n' +
      'Lukas: Montag habe ich Deutschkurs in der Volkshochschule.\n' +
      'Nina: Ich schreibe montags Hausaufgaben für den Abendkurs.\n' +
      'Lukas: Dienstag übe ich Vokabeln in der Bibliothek.\n' +
      'Nina: Dienstag treffe ich mich mit Lernpartnern im Café.\n' +
      'Lukas: Mittwoch besuche ich einen Computerkurs.\n' +
      'Nina: Ich gehe mittwochs ins Museum — wir haben ein Projekt.\n' +
      'Lukas: Donnerstag bereite ich mich auf eine Prüfung vor.\n' +
      'Nina: Donnerstag kaufe ich Bücher für den Kurs.\n' +
      'Lukas: Freitag mache ich eine Präsentation in der Klasse.\n' +
      'Nina: Am Freitagabend lese ich ein Buch auf Deutsch.',
    answers: { Montag: 'b', Dienstag: 'c', Mittwoch: 'e', Donnerstag: 'h', Freitag: 'g' },
  },
};

function main() {
  const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
  let patched = 0;
  for (const spec of Object.values(THEMES)) {
    const pi = (bank.passages || []).findIndex((p) => p.id === spec.passageId);
    if (pi < 0) {
      console.warn(`Missing passage ${spec.passageId}`);
      continue;
    }
    bank.passages[pi] = {
      ...bank.passages[pi],
      title: spec.title,
      topicTag: spec.topicTag,
      text: spec.text,
      pictures: PICTURES,
    };
    patched++;
    for (const q of bank.questions || []) {
      if (q.passageId !== spec.passageId) continue;
      const day = String(q.question || '').trim();
      const letter = spec.answers[day];
      if (letter) {
        q.correct = letter;
        q.correctAnswer = letter;
      }
    }
  }
  const texts = (bank.passages || [])
    .filter((p) => p.module === 'horen' && p.teil === 2)
    .map((p) => p.text);
  const uniq = new Set(texts);
  console.log(`Horen T2 passages patched: ${patched}`);
  console.log(`Unique transcripts: ${uniq.size} / ${texts.length}`);
  if (!apply) {
    console.log('[dry-run] Pass --apply to write bank');
    return;
  }
  fs.writeFileSync(BANK, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');
  console.log(`Applied → ${path.relative(ROOT, BANK)}`);
}

main();
