#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { validateT3Blueprint, resetPassingT3BlueprintCache } from '../lesenT3BlueprintStock.mjs';
import { buildValidatedT3Part } from '../../make-t3.mjs';

function mkBp(slug, options, situations) {
  const qs = situations.map((s, i) => ({
    id: `bp-q${i + 1}`,
    module: 'lesen',
    teil: 3,
    type: 'matching',
    question: s.q,
    options,
    correct: s.c,
    correctAnswer: s.c,
    explanation: s.e,
    lang: 'de',
    level: 'B1',
  }));
  return { slug, passages: [], questions: qs };
}

const opts1 = [
  'A) TicketPlus — Monatskarten für den Nahverkehr, günstig für Pendler, Schalter Mo–Fr 8–18 Uhr.',
  'B) RadWeg — Planung neuer Wege für Radfahrer in der Stadt, Beratung Di–Do 10–16 Uhr.',
  'C) GleisInfo — Auskunft zu Anschlüssen und Verspätungen, Service täglich 6–22 Uhr.',
  'D) Park&Ride — Stellplätze am Stadtrand mit Anschluss an den Nahverkehr, 24 Stunden.',
  'E) FahrSchule — Intensivkurs für den Führerschein Klasse B, Theorie und Praxis.',
  'F) Sprachstudio — Deutschkurs für Beruf und Alltag, kleine Gruppen, Mi ab 17 Uhr.',
  'G) UmzugFix — Transporter und Helfer für Ihren Umzug, auch am Wochenende.',
  'H) HandyDoc — Reparatur von Smartphones und Tablets, Express-Service, Mo–Sa.',
  'I) Taxi24 — Fahrten rund um die Uhr, Festpreis zum Flughafen, online buchbar.',
  'J) GartenGrün — Pflege von Gärten und Balkonpflanzen, Sa 9–14 Uhr.',
];

const bp1 = mkBp('bp-oepnv-ticket', opts1, [
  {
    q: 'Maria pendelt täglich zur Arbeit und möchte die Kosten für den öffentlichen Nahverkehr senken.',
    c: 'A',
    e: 'TicketPlus verkauft Monatskarten.',
  },
  {
    q: 'Tom steht an der Haltestelle und braucht Information, ob sein Zug Verspätung hat.',
    c: 'C',
    e: 'GleisInfo informiert über Verspätungen.',
  },
  {
    q: 'Lisa kommt spät nachts am Flughafen an und braucht eine Fahrt in die Innenstadt.',
    c: 'I',
    e: 'Taxi24 fährt auch nachts.',
  },
  {
    q: 'Ben fährt mit dem Auto zur Arbeit und sucht einen günstigen Stellplatz am Stadtrand mit Anschluss an den Nahverkehr.',
    c: 'D',
    e: 'Park&Ride verbindet Parken und ÖPNV.',
  },
  {
    q: 'Anna möchte endlich mobil sein und den Führerschein machen.',
    c: 'E',
    e: 'FahrSchule bietet Führerscheinkurse.',
  },
  {
    q: 'Herr Weber nutzt das Rad für den Weg zur Arbeit und wünscht sich mehr sichere Wege in der Stadt.',
    c: 'B',
    e: 'RadWeg plant Radwege.',
  },
  {
    q: 'Frau Stein sucht einen Privatlehrer für Mathematik-Nachhilfe für ihre Tochter.',
    c: '0',
    e: 'Keine Anzeige bietet Mathe-Nachhilfe.',
  },
]);

const opts2 = [
  'A) VeloWerk — Reparatur von Fahrrädern und E-Bikes, Mo–Sa 9–19 Uhr.',
  'B) StadtRad — Beratung zu neuen Radwegen und Stellplätzen für Fahrräder, Di–Do.',
  'C) NahverkehrCard — Jahreskarte für den regionalen Nahverkehr, online und am Schalter.',
  'D) StauInfo — Live-Meldungen zu Staus und Umleitungen auf der Autobahn.',
  'E) ZugPlan — Reservierung und Auskunft für Fernreisen mit dem Zug.',
  'F) KlangRaum — Unterricht in Gitarre und Klavier für Anfänger.',
  'G) WohnPflege — Betreuung älterer Menschen zu Hause.',
  'H) BlumenArt — Floristik und Geschenke, Lieferung in der Stadt.',
  'I) RollerFix — Reparatur von E-Scootern und kleinen Rollern.',
  'J) KochKurs — Kochkurse für Beruf und Hobby, kleine Gruppen.',
];

const bp2 = mkBp('bp-radweg-stadt', opts2, [
  { q: 'Lena hat ein Problem mit dem Rad und braucht schnelle Hilfe in der Werkstatt.', c: 'A', e: 'VeloWerk repariert Fahrräder.' },
  { q: 'Anwohner wollen wissen, wo die Stadt neue Wege für Radfahrer plant.', c: 'B', e: 'StadtRad berät zu Radwegen.' },
  { q: 'Markus fährt täglich mit Bus und Tram und sucht eine günstige Jahreskarte.', c: 'C', e: 'NahverkehrCard verkauft Jahreskarten.' },
  { q: 'Nora plant eine lange Autofahrt und möchte vorher wissen, ob es Staus gibt.', c: 'D', e: 'StauInfo meldet Staus.' },
  { q: 'Paul plant eine Reise mit dem Zug und braucht Auskunft und Reservierung.', c: 'E', e: 'ZugPlan bietet Zugauskunft.' },
  { q: 'Tim nutzt einen E-Scooter und braucht eine Reparaturwerkstatt.', c: 'I', e: 'RollerFix repariert E-Scooter.' },
  { q: 'Frau Berger sucht einen Gartenbau-Service für ihre Terrassenpflanzen.', c: '0', e: 'Keine Anzeige für Gartenbau.' },
]);

const opts3 = [
  'A) GleisAuskunft — Information zu Anschlüssen und Verspätungen am Knotenpunkt, 5–23 Uhr.',
  'B) AutoTeile — Ersatzteile für Pkw und Transporter, Bestellung online.',
  'C) FahrradBox — Leih-Räder an zentralen Standorten, Rückgabe in der ganzen Stadt.',
  'D) RechtHilfe — Erstberatung bei Vertragsfragen.',
  'E) Park&Ride — Günstige Stellplätze am Stadtrand mit Ticket für Bus und Tram.',
  'F) FührerscheinPro — Intensivkurs für den Führerschein Klasse B.',
  'G) HundHotel — Betreuung von Hunden im Urlaub.',
  'H) PC-Hilfe — Reparatur von Laptops und Druckern.',
  'I) StadtTaxi — Fahrten vom Zentrum in alle Stadtteile, Festpreis online.',
  'J) YogaFlow — Yoga-Kurse für Anfänger, Di und Do ab 18 Uhr.',
];

const bp3 = mkBp('bp-bahnhof-info', opts3, [
  { q: 'Julia ist am zentralen Knotenpunkt angekommen und braucht Auskunft über Verspätungen und Anschlüsse.', c: 'A', e: 'GleisAuskunft informiert am Knotenpunkt.' },
  { q: 'David ist angekommen und möchte für den restlichen Tag ein Leihrad nutzen.', c: 'C', e: 'FahrradBox vermietet Räder.' },
  { q: 'Sabine fährt mit dem Auto und sucht günstiges Parken plus Ticket für Bus und Tram.', c: 'E', e: 'Park&Ride bietet Park&Ride.' },
  { q: 'Felix braucht nach der Ankunft eine Fahrt in den Stadtteil Nord.', c: 'I', e: 'StadtTaxi fährt in die Stadtteile.' },
  { q: 'Jonas will endlich den Führerschein machen und sucht einen Intensivkurs.', c: 'F', e: 'FührerscheinPro bietet Kurse.' },
  { q: 'Herr Lang braucht Ersatzteile für seinen Transporter und möchte online bestellen.', c: 'B', e: 'AutoTeile liefert Autoteile.' },
  { q: 'Frau Ortiz sucht einen Anwalt für eine Erstberatung zu einem Mietvertrag.', c: '0', e: 'Keine Rechtsberatung in den Anzeigen.' },
]);

const dir = path.join('scripts', 't3-blueprints');
for (const bp of [bp1, bp2, bp3]) {
  const err = validateT3Blueprint(bp);
  if (err.length) throw new Error(`${bp.slug} invalid: ${err.join('; ')}`);
  fs.writeFileSync(path.join(dir, `${bp.slug}.json`), `${JSON.stringify(bp, null, 2)}\n`);
  console.log('wrote', bp.slug);
}

resetPassingT3BlueprintCache();
const out = buildValidatedT3Part({ requestedTopic: 'Verkehr', maxAttempts: 24 });
console.log('BUILD OK', out._blueprintSlug);
