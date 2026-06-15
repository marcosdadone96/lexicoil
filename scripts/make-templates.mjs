#!/usr/bin/env node
/**
 * Auto-generate per-Teil content TEMPLATES from a blueprint, for any lang/level.
 * Output: batches/templates/<lang>_<level>/<module>-t<teil>-TEMPLATE.json
 * Each template is a schema-valid, engine-placeable skeleton with placeholders.
 *
 * Usage: node scripts/make-templates.mjs --lang en --level B1
 *        node scripts/make-templates.mjs --all
 */
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));

const LANGS=['de','en','es'], LEVELS=['B1','B2','C1'];
function bankType(qt){
  const t=String(qt||'').toLowerCase();
  if(t.includes('true_false')||t.includes('richtig')) return 'richtig_falsch';
  if(t.includes('ja_nein')||t.includes('yes_no')) return 'ja_nein';
  if(t.includes('match')) return 'matching';
  if(t.includes('gap')||t.includes('cloze')) return 'gap_fill';
  if(t.includes('short')||t.includes('open')||t.includes('essay')||t.includes('writing')||t.includes('speaking')) return 'short_answer';
  return 'multiple';
}
function skillFor(m){return ({lesen:'reading',reading:'reading',horen:'listening',listening:'listening',schreiben:'writing',writing:'writing',sprechen:'speaking',speaking:'speaking',grammatik:'reading',use_of_english:'reading'})[m]||'reading';}
function optionsFor(type){
  if(type==='multiple') return ['a) [richtige Option / correct]','b) [Distraktor / distractor]','c) [Distraktor / distractor]'];
  if(type==='ja_nein') return ['Ja','Nein'];
  if(type==='matching') return ['A) [Option A]','B) [Option B]','C) [Option C]','D) [Option D]'];
  if(type==='richtig_falsch') return [];
  return [];
}
function correctFor(type){return type==='richtig_falsch'?'Richtig':type==='ja_nein'?'Ja':type==='matching'?'A':(type==='short_answer'?'rubric':'a');}

function buildPartTemplate(lang,level,examType,mod,part){
  const teil=part.teil; const n=part.itemsTotal||part.questionsTotal?.max||part.questionsTotal?.min||1;
  const type=bankType((part.questionTypes||[])[0]);
  const layout=part.layout||''; const module=mod;
  const needsPassage=['lesen','reading','horen','listening'].includes(module) && type!=='matching' && type!=='ja_nein';
  const nPass=needsPassage?(part.passagesPerPart|| (layout==='segments'? Math.max(1,Math.round(n/2)) :1)):0;
  const slug='{SLUG}';
  const passages=[];
  for(let s=1;s<=nPass;s++){
    passages.push({id:`${lang}-${level.toLowerCase()}-p-${module}-t${teil}-${slug}${nPass>1?'-s'+s:''}`,
      module, title:'[Titel / title]',
      text:`[${module==='horen'||module==='listening'?'Transkript des Hörtextes':'Lesetext'} — ${part.wordsPerPassage?part.wordsPerPassage.min+'–'+part.wordsPerPassage.max+' Wörter':'B1/B2/C1'} , Niveau ${level}]`,
      passageVocab:['[lemma1]','[lemma2]']});
  }
  const questions=[];
  for(let i=1;i<=n;i++){
    const q={id:`${lang}-${level.toLowerCase()}-${module[0]}-t${teil}-${slug}-q${i}`,module,teil,type,
      question:'[Frage / question]',correct:correctFor(type),correctAnswer:correctFor(type),
      explanation:'[kurze Begründung / short justification]'};
    if(needsPassage) q.passageId=passages[Math.min(passages.length-1, nPass>1?Math.floor((i-1)/2):0)].id;
    if(type==='ja_nein') q.signText='[Meinungstext / opinion text]';
    const opt=optionsFor(type); if(opt.length||type==='matching'||type==='multiple') q.options=opt; if(type==='richtig_falsch') q.options=[];
    if(type==='short_answer'){q.options=[]; delete q.passageId;}
    if(layout==='segments') q.segmentLabel=`[Aufnahme ${Math.ceil(i/2)}]`;
    Object.assign(q,{grammarTags:['g-'+lang+'-'+level.toLowerCase()+'-[tag]'],topicTags:['[topic]'],vocabularyTags:['[lemma]'],difficulty:level==='C1'?7:level==='B2'?6:5,skills:[skillFor(module)],language:lang,level,examType});
    questions.push(q);
  }
  return {_comment:`${examType} ${level} ${module} Teil ${teil} — ${type} x${n}. Rellena los [campos], usa un SLUG único, omite passageId si no hay pasaje.`,passages,questions};
}

function run(lang,level){
  const id=ExamBlueprint.INDEX[`${lang}_${level}`];
  if(!id){console.log(`(sin blueprint ${lang}_${level})`);return;}
  const bp=JSON.parse(fs.readFileSync(path.join(ROOT,'library/blueprints',id+'.json'),'utf8'));
  const outDir=path.join(ROOT,'batches/templates',`${lang}_${level}`);
  fs.mkdirSync(outDir,{recursive:true});
  let count=0;
  for(const mod of bp.modules||[]) for(const part of mod.parts||[]){
    const tpl=buildPartTemplate(lang,level,bp.examType||id.split('_')[0],mod.id,part);
    fs.writeFileSync(path.join(outDir,`${mod.id}-t${part.teil}-TEMPLATE.json`),JSON.stringify(tpl,null,2)+'\n');
    count++;
  }
  console.log(`  ${lang}_${level} (${id}): ${count} plantillas`);
}

const all=process.argv.includes('--all');
function a(n){const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:null;}
if(all){ for(const l of LANGS) for(const v of LEVELS) run(l,v); }
else { run(a('--lang')||'de', (a('--level')||'B1').toUpperCase()); }
