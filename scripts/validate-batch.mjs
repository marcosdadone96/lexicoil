#!/usr/bin/env node
/**
 * Validate a single content batch before merging: (1) JSON parse, (2) schema (Ajv),
 * (3) engine placement (merge into a bank copy, assemble, report which Teil it fills),
 * (4) common gotchas (passageId null, teil as string, duplicate ids vs bank).
 *
 * Usage: node scripts/validate-batch.mjs --lang de --level B1 --file batches/generated/horen-t3-x.json
 */
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { checkBatchConformance } from './lib/blueprintConformance.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def){ const i=process.argv.indexOf(name); return i>=0?process.argv[i+1]:def; }
const lang=arg('--lang','de'), level=String(arg('--level','B1')).toUpperCase(), file=arg('--file');
const allowDup=process.argv.includes('--allow-dup');
if(!file){ console.error('Falta --file'); process.exit(1); }

const bankPath=path.join(ROOT,'library',lang,level,'questions.json');
const full=JSON.parse(fs.readFileSync(bankPath,'utf8'));
let batch; try{ batch=JSON.parse(fs.readFileSync(path.resolve(file),'utf8')); }
catch(e){ console.error('JSON inválido:',e.message); process.exit(1); }

let problems=[];
// gotchas
(batch.questions||[]).forEach(q=>{
  if('passageId' in q && q.passageId===null) problems.push(`${q.id}: passageId es null (omítelo)`);
  if(typeof q.teil==='string') problems.push(`${q.id}: teil es texto "${q.teil}" (debe ser número)`);
  if(!q.id||!q.module||!q.question||q.correctAnswer===undefined) problems.push(`${q.id||'??'}: faltan campos obligatorios`);
});
const bankIds=new Set(full.questions.map(q=>q.id));
if (!allowDup) {
  (batch.questions||[]).forEach(q=>{ if(bankIds.has(q.id)) problems.push(`${q.id}: id ya existe en el banco`); });
}
const allPids=new Set([...(full.passages||[]).map(p=>p.id),...(batch.passages||[]).map(p=>p.id)]);
(batch.questions||[]).forEach(q=>{ if(['lesen','horen'].includes(q.module)&&q.passageId&&!allPids.has(q.passageId)) problems.push(`${q.id}: passageId inexistente (${q.passageId})`); });

// schema (Ajv)
let schemaOk='(omitido: ajv no instalado)';
try{
  const Ajv=(await import('ajv')).default;
  const schema=JSON.parse(fs.readFileSync(path.join(ROOT,'library/schemas/questions.schema.json'),'utf8'));
  const validate=new Ajv({allErrors:true,strict:false}).compile(schema);
  const vocab=(full.vocabulary&&!Array.isArray(full.vocabulary))?full.vocabulary:{};
  schemaOk = validate({meta:full.meta,passages:batch.passages||[],questions:batch.questions||[],vocabulary:vocab})
    ? 'OK' : 'ERR '+JSON.stringify(validate.errors?.slice(0,2));
}catch(_){}

// placement
const EB=require(path.join(ROOT,'js/library/ExamBlueprint.js')); globalThis.ExamBlueprint=EB;
require(path.join(ROOT,'js/library/LibraryLoader.js')); globalThis.PassageResolver=require(path.join(ROOT,'js/library/PassageResolver.js'));
const bp=JSON.parse(fs.readFileSync(path.join(ROOT,'library/blueprints',ExamBlueprint.INDEX[`${lang}_${level}`]+'.json'),'utf8'));
const bankBefore={meta:full.meta,passages:full.passages,questions:full.questions,vocabulary:full.vocabulary};
const bankAfter={meta:full.meta,passages:[...full.passages,...(batch.passages||[])],questions:[...full.questions,...(batch.questions||[])],vocabulary:full.vocabulary};
const before=EB.assemble(bankBefore,bp).coverage;
const after=EB.assemble(bankAfter,bp).coverage;
const gains=after.map((c,i)=>({m:c.module,t:c.teil,b:before[i].filled,a:c.filled})).filter(x=>x.a>x.b);

function batchFitsBlueprint(batch, blueprint) {
  if (!(batch.questions || []).length) return false;
  for (const q of batch.questions) {
    const mod = (blueprint.modules || []).find(
      (m) => m.id === q.module || (q.module === 'horen' && m.id === 'horen') || (q.module === 'lesen' && m.id === 'lesen'),
    );
    if (!mod) return false;
    const part = (mod.parts || []).find((p) => p.teil === q.teil);
    if (!part) return false;
  }
  return true;
}

const poolOk = batchFitsBlueprint(batch, bp);

const conformance = checkBatchConformance(batch, bp);
if (!conformance.ok) {
  for (const item of conformance.items.filter((i) => !i.ok)) {
    const line = `${item.id}: ${item.reasons.join('; ')}`;
    console.log(line);
    problems.push(line);
  }
}

console.log(`\n== Validación de ${path.basename(file)} (${lang}_${level}) ==`);
console.log('Preguntas:',(batch.questions||[]).length,'| Pasajes:',(batch.passages||[]).length);
console.log('Esquema:',schemaOk);
console.log('Conformidad blueprint:', conformance.ok ? 'OK' : `FAIL (${conformance.items.filter((i) => !i.ok).length} ítems)`);
console.log('Colocación (Teile que mejora):', gains.length?gains.map(g=>`${g.m}T${g.t} ${g.b}->${g.a}`).join(', '):(poolOk?'Pool válido (Teil ya cubierto en 1 examen — OK para exámenes disjuntos)':'NINGUNA ❌ (revisa type/teil/passageId)'));
console.log(problems.length?('Problemas:\n  - '+problems.join('\n  - ')):'Sin problemas detectados ✅');
process.exit(problems.length||schemaOk.startsWith('ERR')||(!gains.length&&!poolOk)?1:0);
