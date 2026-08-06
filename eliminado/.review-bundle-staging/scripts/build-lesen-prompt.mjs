#!/usr/bin/env node
/**
 * Genera prompt listo para pegar en Gemini (plantilla + 10 palabras aleatorias del banco B1).
 *
 *   node scripts/build-lesen-prompt.mjs --teil 1
 *   node scripts/build-lesen-prompt.mjs --teil 3 --count 10 --source bank
 *   node scripts/build-lesen-prompt.mjs --all-teile --out batches/inbox/prompts-all.txt
 *   node scripts/build-lesen-prompt.mjs --teil 2 --out batches/inbox/prompt-teil2.txt
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT } from './lib/loadEnv.mjs';
import {
  buildLesenPromptFull,
  pickTargetWords,
} from './lib/lesenTemplatePrompt.mjs';

function parseArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    teil: null,
    allTeile: false,
    count: 10,
    source: 'bank',
    out: null,
    idSuffix: null,
    unsafe: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--teil') out.teil = Number(argv[++i]);
    else if (a === '--all-teile') out.allTeile = true;
    else if (a === '--count') out.count = Math.max(1, Number(argv[++i]) || 10);
    else if (a === '--source') out.source = String(argv[++i]).toLowerCase();
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--id-suffix') out.idSuffix = argv[++i];
    else if (a === '--unsafe') out.unsafe = true;
    else if (a === '--prefer-weak') out.source = 'auto';
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function teileToRun(args) {
  if (args.allTeile) return [1, 2, 3, 4, 5];
  if (!Number.isFinite(args.teil) || args.teil < 1 || args.teil > 5) {
    throw new Error('Indica --teil 1..5 o --all-teile');
  }
  return [args.teil];
}

function buildOne(teil, args) {
  const words = pickTargetWords({
    lang: args.lang,
    level: args.level,
    count: args.count,
    source: args.source,
    safe: !args.unsafe,
  });
  const idSuffix = args.idSuffix || randomBytes(2).toString('hex');
  const prompt = buildLesenPromptFull(teil, words, { idSuffix });
  return { teil, words, idSuffix, prompt };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Uso:
  node scripts/build-lesen-prompt.mjs --teil 1
  node scripts/build-lesen-prompt.mjs --all-teile --out batches/inbox/prompts-all.txt

Opciones:
  --count 10          Palabras objetivo (default 10)
  --source bank       Sorteo desde library/vocab/de/B1.json (default)
  --source weak       Solo lemas flojos (data/coverage/weak-de_B1.json)
  --source auto       Flojos primero; si faltan, completa desde banco
  --prefer-weak       Alias de --source auto
  --unsafe            No filtra lemas que suelen fallar CEFR
  --out RUTA          Guarda en archivo (stdout si omites)
  --id-suffix XXXX    Prefijo fijo de IDs en el prompt

Atajos npm: npm run lesen:prompt:t1 … lesen:prompt:all`);
    process.exit(0);
  }

  const teile = teileToRun(args);
  const built = teile.map((t) => buildOne(t, args));
  const body = built
    .map((b) => b.prompt)
    .join('\n\n\n════════════════════════════════════════════════════════════\n\n\n');

  if (args.out) {
    const outPath = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${body}\n`, 'utf8');
    console.log(`Escrito: ${path.relative(ROOT, outPath).replace(/\\/g, '/')}`);
    for (const b of built) {
      console.log(`  Teil ${b.teil}: ${b.words.join(', ')}`);
    }
  } else {
    for (const b of built) {
      console.error(`Teil ${b.teil} · PALABRAS OBJETIVO (${b.words.length}): ${b.words.join(', ')}`);
    }
    process.stdout.write(`${body}\n`);
  }
}

main();
