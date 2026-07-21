/**
 * CHK-21 author extraction tests (question-first).
 * Run: node scripts/lib/__tests__/chk21-author-from-question.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const AUDIT = path.join(ROOT, 'scripts', 'audit-pass-2.mjs');

function runAudit(batch) {
  const tmp = path.join(os.tmpdir(), `chk21-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(tmp, JSON.stringify(batch, null, 2), 'utf8');
  const r = spawnSync(process.execPath, [AUDIT, tmp, '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  const out = (r.stdout || '') + (r.stderr || '');
  let parsed;
  try {
    parsed = JSON.parse(out.trim());
  } catch {
    const m = out.match(/\{[\s\S]*\}\s*$/);
    parsed = m ? JSON.parse(m[0]) : { findings: [], raw: out.slice(-800) };
  }
  const chk21 = (parsed.findings || []).filter((f) => f.id === 'CHK-21');
  return { chk21, all: parsed.findings || [], status: r.status };
}

function authorMsgs(chk21) {
  return chk21.filter((f) => /autores repetidos/i.test(f.message || ''));
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('OK:', msg);
  }
}

// ─── 4a Familie reject ───
{
  const file = path.join(
    ROOT,
    'batches/generated/.rejected/lesen-t4-gemini-003-2026-07-11T16-48-43-104Z.json',
  );
  const batch = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { chk21 } = runAudit(batch);
  const authors = authorMsgs(chk21);
  console.log('\n=== 4a Familie reject ===');
  console.log(
    'authors extracted (inline):',
    (batch.questions || []).map((q) => (q.question || '').match(/^Ist\s+(\S+)/)?.[1]),
  );
  console.log(
    'CHK-21 author findings:',
    authors.length ? authors.map((f) => f.message) : '(none)',
  );
  assert(authors.length === 0, 'Familie reject: no «autores repetidos» CHK-21');
}

// ─── 4b canary T4 that passed ───
{
  console.log('\n=== 4b canary Arbeit/Freizeit/Sport ===');
  const dir = path.join(ROOT, 'batches/ready/lesen-t4-staging-2026-07-11-canary');
  for (const name of ['lesen-t4-gemini-001.json', 'lesen-t4-gemini-002.json', 'lesen-t4-gemini-003.json']) {
    const batch = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    const names = (batch.questions || []).map((q) => (q.question || '').match(/^Ist\s+(\S+)/)?.[1]);
    const { chk21 } = runAudit(batch);
    const authors = authorMsgs(chk21);
    console.log(name, 'names=', names.join(','), 'authorFindings=', authors.length);
    assert(authors.length === 0, `${name}: no autores-repetidos FP`);
    assert(new Set(names).size === names.length && names.every(Boolean), `${name}: 7 unique real names`);
  }
}

// ─── 4c genuine duplicate author ───
{
  console.log('\n=== 4c genuine Anna×2 ===');
  const names = ['Anna', 'Anna', 'Klaus', 'Maria', 'Peter', 'Stefan', 'Jana'];
  const questions = names.map((name, i) => ({
    id: `dup-q${i + 1}`,
    module: 'lesen',
    teil: 4,
    type: 'ja_nein',
    question: `Ist ${name} für den Vorschlag?`,
    signText:
      `Ich habe eine eigene Meinung zu diesem Thema und erkläre sie hier ausführlich mit mehr als fünfzehn Worten Nummer ${i + 1}. Ich bin dafür.`,
    correct: i % 2 === 0 ? 'Ja' : 'Nein',
    correctAnswer: i % 2 === 0 ? 'Ja' : 'Nein',
    explanation: `${name} äußert eine klare Haltung zu dem vorgeschlagenen Plan der Stadt.`,
    options: ['a) Ja', 'b) Nein'],
    lang: 'de',
    level: 'B1',
  }));
  const { chk21 } = runAudit({ questions });
  const authors = authorMsgs(chk21);
  console.log(
    'CHK-21 author findings:',
    authors.map((f) => f.message),
  );
  assert(authors.length >= 1, 'genuine dup: CHK-21 fires');
  assert(authors.some((f) => /Anna×2/i.test(f.message)), 'genuine dup: message mentions Anna×2');
}

console.log(`\n══ ${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`} ══`);
process.exit(failed ? 1 : 0);
