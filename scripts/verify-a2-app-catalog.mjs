#!/usr/bin/env node
/** Verify A2 catalog + served file + GATE-1 (app-visible exam path). */
import fs from 'node:fs';
import { isExamPublishable } from './audit-pass-2.mjs';

const catalog = JSON.parse(
  fs.readFileSync('library/published-exams/de/A2/_catalog.json', 'utf8'),
);
const live = (catalog.exams || []).filter((e) => e.status === 'live');
const served = JSON.parse(fs.readFileSync('data/exams/de_A2.json', 'utf8'));
const avail = JSON.parse(fs.readFileSync('data/exams/availability.json', 'utf8'));
const gate = isExamPublishable({ exam: served[0], level: 'A2' }, { expectedLevel: 'A2' });

const docs = live.map((e) =>
  JSON.parse(fs.readFileSync(`library/published-exams/de/A2/${e.examId}.json`, 'utf8')),
);

console.log(
  JSON.stringify(
    {
      catalogLive: live.map((e) => ({ examId: e.examId, status: e.status })),
      availabilityDeA2: avail.de?.A2,
      servedCount: served.length,
      servedExamId: served[0]?.examId,
      publishedGate1Ok: docs.every((d) => d.gate1?.ok !== false),
      gate1OkNow: gate.ok,
      gate1Blocking: gate.blocking.length,
      sprechenTeils: served[0]?.sprechenParts?.map((p) => p.teil) || [],
      indexExamSource: fs.readFileSync('index.html', 'utf8').includes("LEXICOIL_EXAM_SOURCE='published'"),
    },
    null,
    2,
  ),
);

const ok =
  live.length === 1 &&
  served.length === 1 &&
  gate.ok &&
  avail.de?.A2?.status === 'live' &&
  avail.de?.A2?.exams === 1;
if (!ok) process.exit(1);
