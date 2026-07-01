#!/usr/bin/env node

/**

 * Publica batches ya guardados en batches/generated/ (HÃ¶ren / Schreiben / Sprechen).

 *

 * POOL-2: antes de escribir al banco, isPartPoolReady debe dar 0 CRITICAL + 0 IMPORTANT.

 */

import fs from 'node:fs';

import path from 'node:path';

import { spawnSync } from 'node:child_process';

import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

import { isPartPoolReady } from './audit-pass-2.mjs';

import {

  parsePasteArgs,

  validateExamBatch,

  listGeneratedExamFiles,

  syncExamPool,

} from './lib/pasteExamBatchLib.mjs';

import { inferTeilFromBatch } from './lib/extractJson.mjs';



loadEnvFile();



function parsePublishArgs(argv) {

  const out = parsePasteArgs(argv);

  out.tag = 'gemini';

  out.files = [];

  out.allowAuditFailures = false;

  for (let i = 0; i < argv.length; i++) {

    const a = argv[i];

    if (a === '--tag') out.tag = argv[++i];

    else if (a === '--files') {

      out.files = String(argv[++i] || '')

        .split(',')

        .map((s) => s.trim())

        .filter(Boolean);

    } else if (a === '--allow-audit-failures') out.allowAuditFailures = true;

  }

  if (!out.publish && !out.ingest) out.publish = true;

  if (out.allowAuditFailures) {

    process.stderr.write('\n\x1b[31mâš   --allow-audit-failures activo: POOL-2 no bloquearÃ¡ ingestiÃ³n al banco.\x1b[0m\n\n');

  }

  return out;

}



function runNode(script, scriptArgs, { inherit = false } = {}) {

  const res = spawnSync(process.execPath, [script, ...scriptArgs], {

    cwd: ROOT,

    stdio: inherit ? 'inherit' : 'pipe',

    encoding: 'utf8',

  });

  if (res.status !== 0) {

    const msg = `${res.stdout || ''}${res.stderr || ''}`.trim();

    throw new Error(msg || `FallÃ³: node ${script}`);

  }

  return res;

}



function ingestAndPromote(args, relFile) {

  console.log('â”€â”€ Ingest + auto-approve â”€â”€');

  runNode('scripts/ingest-to-staging.mjs', [

    '--lang', args.lang,

    '--level', args.level,

    '--file', relFile,

    '--auto-approve',

  ], { inherit: true });

  if (args.publish) {

    console.log('â”€â”€ Promote approved â†’ banco â”€â”€');

    runNode('scripts/promote-approved.mjs', [

      '--lang', args.lang,

      '--level', args.level,

    ], { inherit: true });

  }

}



function logPoolGateFindings(blocking, header) {

  const byChk = {};

  for (const f of blocking) {

    if (!byChk[f.id]) byChk[f.id] = [];

    byChk[f.id].push(f);

  }

  for (const [chk, list] of Object.entries(byChk).sort()) {

    console.error(`${header}  ${chk} (${list.length}):`);

    for (const f of list.slice(0, 3)) {

      console.error(`${header}    [${f.severity}] ${f.scope}: ${f.message}`);

    }

    if (list.length > 3) console.error(`${header}    â€¦ +${list.length - 3} mÃ¡s`);

  }

}



async function applyPoolGate(batch, args, header) {

  console.log(`${header}â”€â”€ POOL-2 gate (isPartPoolReady â€” 0 CRITICAL + 0 IMPORTANT) â”€â”€`);

  const gate = await isPartPoolReady(batch, { allowFailures: args.allowAuditFailures, semantic: true });

  if (!gate.ok) {

    console.error(`${header}âŒ Rechazada â€” no entra al banco (${gate.blocking.length} blocking)`);

    logPoolGateFindings(gate.blocking, header);

    return { ok: false, rejected: true, gate };

  }

  console.log(`${header}âœ… POOL-2: parte limpia (0/0)`);

  return { ok: true, rejected: false, gate };

}



async function publishOneFile(relFile, args, { label } = {}) {

  const abs = path.isAbsolute(relFile) ? relFile : path.join(ROOT, relFile);

  if (!fs.existsSync(abs)) {

    return { ok: false, label, relFile, errors: [`No existe: ${relFile}`], rejected: false };

  }

  const norm = path.relative(ROOT, abs).replace(/\\/g, '/');

  let batch;

  try {

    batch = JSON.parse(fs.readFileSync(abs, 'utf8'));

  } catch (err) {

    return { ok: false, label, relFile: norm, errors: [`JSON invÃ¡lido: ${err.message}`], rejected: false };

  }



  const check = validateExamBatch(batch, args, {

    teil: args.teil ?? inferTeilFromBatch(batch),

    label,

  });

  if (!check.ok) {

    console.log(`${label ? `[${label}] ` : ''}âŒ No publicado (fallÃ³ validaciÃ³n)`);

    return { ok: false, label, module: check.module, teil: check.teil, relFile: norm, errors: check.errors, rejected: false };

  }



  const header = label ? `[${label}] ` : '';

  const teilLabel = check.teil != null ? `Teil ${check.teil}` : 'Teile 1â€“3';

  console.log(`${header}âœ… VÃ¡lido: ${norm} (${check.module} ${teilLabel})`);



  if (args.publish || args.ingest) {

    const pool = await applyPoolGate(batch, args, header);

    if (!pool.ok) {

      return {

        ok: false,

        label,

        module: check.module,

        teil: check.teil,

        relFile: norm,

        errors: [`POOL-2: ${pool.gate.blocking.length} finding(s) bloqueante(s)`],

        rejected: true,

      };

    }

    ingestAndPromote(args, norm);

  }



  return {

    ok: true,

    label,

    module: check.module,

    teil: check.teil,

    relFile: norm,

    errors: [],

    rejected: false,

  };

}



async function main() {

  const args = parsePublishArgs(process.argv.slice(2));



  if (!args.module) {

    console.error(`Uso:

  node scripts/publish-exam-generated.mjs --module horen --teil 1 --tag gemini --continue --publish --allow-bank-dup

  node scripts/publish-exam-generated.mjs --module schreiben --tag gemini --continue --publish --allow-bank-dup



POOL-2: isPartPoolReady bloquea partes con â‰¥1 IMPORTANT/CRITICAL (salvo --allow-audit-failures).`);

    process.exit(1);

  }



  let targets = [];

  if (args.file) targets = [args.file.replace(/\\/g, '/')];

  else if (args.files.length) targets = args.files.map((f) => f.replace(/\\/g, '/'));

  else targets = listGeneratedExamFiles({ module: args.module, teil: args.teil, tag: args.tag });



  if (!targets.length) {

    console.error(`No hay archivos en batches/generated/ para ${args.module}${args.teil ? ` T${args.teil}` : ''}.`);

    process.exit(1);

  }



  console.log(`Publicar ${targets.length} archivo(s)â€¦`);



  const results = [];

  let rejected = 0;

  for (let i = 0; i < targets.length; i++) {

    const rel = targets[i];

    const label = `#${i + 1}/${targets.length}`;

    console.log(`\n${'â•'.repeat(60)}`);

    console.log(`Procesando ${label}: ${rel}`);

    console.log('â•'.repeat(60));

    const res = await publishOneFile(rel, args, { label });

    results.push(res);

    if (res.rejected) rejected++;

    if (!res.ok && !args.continueOnError) process.exit(1);

  }



  const ok = results.filter((r) => r.ok);

  const fail = results.filter((r) => !r.ok);



  console.log(`\n${'â•'.repeat(60)}`);

  console.log(`RESUMEN: ${ok.length} OK, ${fail.length} fallidos (${rejected} rechazadas POOL-2)`);



  if (args.syncPool && ok.length) {

    try {

      syncExamPool(args);

    } catch (err) {

      console.error(`\nSync pool fallÃ³: ${err.message}`);

      process.exit(1);

    }

  }



  process.exit(fail.length ? 1 : 0);

}



main().catch((err) => { console.error(err); process.exit(1); });

