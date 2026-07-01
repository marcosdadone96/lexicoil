#!/usr/bin/env node
/**
 * Un batch → validar → guardar solo si OK → opcional publicar.
 *
 *   node scripts/paste-lesen-batch.mjs --teil 1 --file batches/inbox/respuesta.txt --tag gemini --publish
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { ROOT } from './lib/loadEnv.mjs';
import { extractJson } from './lib/extractJson.mjs';
import { parsePasteArgs, processLesenBatch, syncLesenPool } from './lib/pasteLesenBatchLib.mjs';

async function readStdin() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const lines = [];
  for await (const line of rl) lines.push(line);
  return lines.join('\n');
}

function readInput(args) {
  if (args.file) {
    const p = path.isAbsolute(args.file) ? args.file : path.join(ROOT, args.file);
    if (!fs.existsSync(p)) throw new Error(`No existe: ${p}`);
    return fs.readFileSync(p, 'utf8');
  }
  return null;
}

async function main() {
  const args = parsePasteArgs(process.argv.slice(2));
  if (!Number.isFinite(args.teil) || args.teil < 1 || args.teil > 5) {
    console.error('Indica --teil 1..5 (o usa paste-lesen-inbox.mjs para varios)');
    process.exit(1);
  }

  let raw = readInput(args);
  if (raw == null) {
    if (process.stdin.isTTY) {
      console.error('Pasa --file batches/inbox/respuesta.txt');
      process.exit(1);
    }
    raw = await readStdin();
  }

  let batch;
  try {
    batch = extractJson(raw);
  } catch (err) {
    console.error(`No se pudo extraer JSON: ${err.message}`);
    process.exit(1);
  }

  const res = processLesenBatch(batch, args, { teil: args.teil, outName: args.outName });
  if (!res.ok) {
    for (const e of res.errors) console.error(e);
    process.exit(1);
  }

  if (args.syncPool) {
    syncLesenPool(args);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
