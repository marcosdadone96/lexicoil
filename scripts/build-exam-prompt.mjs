#!/usr/bin/env node
/**
 * Genera prompts listos para pegar en Gemini/ChatGPT (Hören, Schreiben, Sprechen B1).
 *
 *   node scripts/build-exam-prompt.mjs --module horen --teil 1
 *   node scripts/build-exam-prompt.mjs --module horen --all-teile --out batches/inbox/prompts-horen-all.txt
 *   node scripts/build-exam-prompt.mjs --module schreiben --out batches/inbox/prompt-schreiben.txt
 *   node scripts/build-exam-prompt.mjs --module sprechen --out batches/inbox/prompt-sprechen.txt
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT } from './lib/loadEnv.mjs';
import {
  buildExamPromptFull,
  pickTargetWords,
  teileForModule,
} from './lib/examTemplatePrompt.mjs';

function parseArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    module: null,
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
    else if (a === '--module') out.module = String(argv[++i]).toLowerCase();
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

function resolveTeile(args) {
  const mod = args.module;
  if (!mod || !['horen', 'schreiben', 'sprechen'].includes(mod)) {
    throw new Error('Indica --module horen|schreiben|sprechen');
  }
  if (mod === 'schreiben' || mod === 'sprechen') return ['all'];
  if (args.allTeile) return [1, 2, 3, 4];
  if (!Number.isFinite(args.teil) || args.teil < 1 || args.teil > 4) {
    throw new Error('Hören: indica --teil 1..4 o --all-teile');
  }
  return [args.teil];
}

function buildOne(module, teil, args) {
  const words = pickTargetWords({
    lang: args.lang,
    level: args.level,
    count: args.count,
    source: args.source,
    safe: !args.unsafe,
  });
  const idSuffix = args.idSuffix || randomBytes(2).toString('hex');
  const prompt = buildExamPromptFull(module, teil, words, { idSuffix });
  return { module, teil, words, idSuffix, prompt };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Uso:
  node scripts/build-exam-prompt.mjs --module horen --teil 1
  node scripts/build-exam-prompt.mjs --module schreiben
  node scripts/build-exam-prompt.mjs --module horen --all-teile --out batches/inbox/prompts-horen-all.txt

Opciones:
  --count 10          Palabras objetivo (default 10)
  --source bank|weak|auto
  --prefer-weak       Alias de --source auto
  --out RUTA          Guarda en archivo
  --id-suffix XXXX    Prefijo fijo de IDs

Atajos npm:
  npm run horen:prompt:t1 … t4
  npm run schreiben:prompt
  npm run sprechen:prompt`);
    process.exit(0);
  }

  const teile = resolveTeile(args);
  const built = teile.map((t) => buildOne(args.module, t, args));
  const body = built
    .map((b) => b.prompt)
    .join('\n\n\n════════════════════════════════════════════════════════════\n\n\n');

  if (args.out) {
    const outPath = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${body}\n`, 'utf8');
    console.log(`Escrito: ${path.relative(ROOT, outPath).replace(/\\/g, '/')}`);
    for (const b of built) {
      const teilLabel = b.teil === 'all' ? '1–3' : b.teil;
      console.log(`  ${b.module} Teil ${teilLabel}: ${b.words.join(', ')}`);
    }
  } else {
    for (const b of built) {
      const teilLabel = b.teil === 'all' ? '1–3' : b.teil;
      console.error(
        `${b.module} T${teilLabel} · PALABRAS (${b.words.length}): ${b.words.join(', ')}`,
      );
    }
    process.stdout.write(`${body}\n`);
  }
}

main();
