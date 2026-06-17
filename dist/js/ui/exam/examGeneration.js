// ═══════════════════════════════════════════
// EXAM GENERATION
// ═══════════════════════════════════════════
function seenPoolIds(subject, level) {
  return (S.history || [])
    .filter((h) => h.lang === subject && h.level === level && h.poolId)
    .map((h) => h.poolId);
}
function normalizeCambridgeExam(d){
  if(!d||(!d.readingParts&&!d.listeningParts))return d;
  d.cambridgeFormat=true;
  d.lang=d.lang||'en';
  d.goetheFormat=true;
  if(!d.official){
    d.official={board:'Cambridge Assessment English',certificate:'B1 Preliminary (PET)',note:'Practice exam (AI-generated). Task types based on official Cambridge B1 Preliminary format.'};
  }
  if(!d.modules){
    d.modules={
      lesen:{title:'Reading',time:'45 minutes (Reading and Writing combined)'},
      horen:{title:'Listening',time:'approx. 30 minutes'},
      schreiben:{title:'Writing',time:'45 minutes (Reading and Writing combined)'},
      sprechen:{title:'Speaking',time:'12 minutes'}
    };
  }
  d.lesenParts=(d.readingParts||[]).map(p=>{
    const part={teil:p.part,arbeitszeit:p.time||'',instruction:p.instruction};
    if(p.items){
      part.items=p.items.map(it=>({id:it.id,signText:it.text,question:it.question,options:it.options,correct:it.correct}));
    }
    if(p.text){part.textTitle=p.textTitle;part.text=p.text;}
    if(p.speakers){
      part.textTitle=p.textTitle;
      part.text=p.speakers.map(s=>s.name+': '+s.text).join('\n\n');
    }
    if(p.options&&p.answers){
      part.ads=(p.options||[]).map(o=>({key:o.key,title:o.title,text:o.text}));
      part.questions=Object.entries(p.answers).map(([id,correct])=>{
        const person=(p.people||[]).find(x=>x.id===id);
        return{id,type:'match',question:person?.description||id,options:[...(p.options||[]).map(o=>o.key),'0'],correct};
      });
    }
    if(p.questions&&!part.questions)part.questions=p.questions;
    return part;
  });
  d.horenParts=(d.listeningParts||[]).map(p=>{
    const part={teil:p.part,plays:p.plays||2,instruction:p.instruction,context:p.context};
    if(p.segments){
      part.segments=p.segments.map((seg,si)=>({
        id:seg.id,
        label:seg.label||('Recording '+(si+1)),
        transcript:seg.transcript,
        question:seg.question,
        options:seg.options,
        correct:seg.correct
      }));
    }else if(p.notes){
      part.transcript=p.transcript;
      part.notesTitle=p.notes.title;
      part.noteFields=(p.notes.fields||[]).map(f=>({id:f.id,label:f.label,answer:f.answer}));
    }else{
      part.transcript=p.transcript;
      part.questions=p.questions;
    }
    return part;
  });
  d.schreibenParts=(d.writingParts||[]).map((p,i)=>{
    let task=p.instruction||'';
    if(p.promptEmail)task+='\n\n'+p.promptEmail;
    return{aufgabe:p.part||i+1,arbeitszeit:p.time||'',fieldId:p.fieldId||('write'+(i+1)),task,minWords:p.minWords,criteria:p.criteria,modelAnswer:p.modelAnswer||p.modelAnswerArticle,feedback:p.feedback};
  });
  d.sprechenParts=(d.speakingParts||[]).map((p,i)=>({
    teil:p.part||i+1,title:p.title,dauer:p.duration,fieldId:p.fieldId||('speak'+(i+1)),
    situation:p.situation,points:p.points||p.examinerQuestions,photoDescriptions:p.photoDescriptions,
    minExchanges:p.minExchanges,modelAnswer:p.modelAnswer,feedback:p.feedback
  }));
  return d;
}
function normalizeGoetheQuestion(q,part){
  if(q.type==='richtig_falsch'||q.type==='true_false'){q.type='rf';if(q.correct==='Richtig'||q.correct==='True')q.correct='R';else if(q.correct==='Falsch'||q.correct==='False')q.correct='F';}
  if(q.type==='ja_nein'){q.type='yn';if(q.correct==='Ja')q.correct='J';else if(q.correct==='Nein')q.correct='N';}
  if(q.type==='r_f_n')q.type='rfn';
  if(q.type==='person_match_abcd')q.type='abcd';
  if(q.type==='person_match')q.type='person_multi';
  if(q.type==='matching'&&!q.options?.length){
    if(part?.ads?.length){
      q.type='multiple';
      q.options=part.ads.map(a=>String(a.key).toUpperCase());
      if(!q.options.includes('0'))q.options.push('0');
    }else if(part?.items?.length){
      q.type='multiple';
      q.options=part.items.map(it=>String(it.id||it.key).toUpperCase()).filter(Boolean);
    }
  }
}
function questionTypeAnswerable(q){
  const t=String(q?.type||'multiple').toLowerCase();
  if(['rf','tf','richtig_falsch','true_false','yn','ja_nein','rfn','r_f_n','gap_fill'].includes(t))return true;
  if(t==='person_multi'||t==='abcd'||t==='matching'||t==='multiple'||t==='multiple_choice')return Array.isArray(q.options)&&q.options.length>0;
  return Array.isArray(q.options)&&q.options.length>0;
}
function examHasUnanswerableQuestions(exam){
  if(!exam||typeof exam!=='object')return false;
  let bad=false;
  const checkQ=(q)=>{if(q&&!questionTypeAnswerable(q))bad=true;};
  (exam.lesenParts||[]).forEach(p=>{
    (p.questions||[]).forEach(checkQ);
    (p.items||[]).forEach(it=>{if(it.question)checkQ(it);});
    (p.segments||[]).forEach(s=>(s.questions||[]).forEach(checkQ));
  });
  (exam.horenParts||[]).forEach(p=>{
    (p.questions||[]).forEach(checkQ);
    (p.segments||[]).forEach(s=>(s.questions||[]).forEach(checkQ));
  });
  return bad;
}
window.examHasUnanswerableQuestions=examHasUnanswerableQuestions;
function sanitizeExamText(text){
  if(text==null||typeof text!=='string')return'';
  return text.replace(/<br\s*\/?>/gi,'\n').replace(/\r\n/g,'\n');
}
function sanitizeGoetheParts(d){
  const fixT=t=>typeof t==='string'?sanitizeExamText(t):t;
  const ADS='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  (d.lesenParts||[]).forEach((part,pi)=>{
    if(part.text)part.text=fixT(part.text);
    if(part.textTitle)part.textTitle=fixT(part.textTitle);
    if(part.textWithGaps)part.textWithGaps=part.textWithGaps.map(fixT);
    part.teil=part.teil??pi+1;
    if(part.ads)part.ads.forEach((a,i)=>{if(!a.key)a.key=ADS[i]||String(i+1);if(!a.title)a.title='';if(!a.text)a.text='';a.title=fixT(a.title);a.text=fixT(a.text);});
    (part.options||[]).forEach(o=>{if(o.text)o.text=fixT(o.text);});
    (part.persons||[]).forEach(p=>{if(p.text)p.text=fixT(p.text);if(p.name)p.name=fixT(p.name);});
    (part.opinions||[]).forEach(o=>{if(o.text)o.text=fixT(o.text);if(o.name)o.name=fixT(o.name);});
    (part.items||[]).forEach(item=>{if(item.signText)item.signText=fixT(item.signText);if(item.text)item.text=fixT(item.text);});
    if(part.items?.length&&!part.items.some(it=>it.signText||it.text)&&part.ads?.length){
      if(!part.questions)part.questions=[];
      part.items.forEach((item,i)=>{
        if(!item.question)return;
        const q={id:item.id||`l${pi+1}s${i+1}`,type:item.type||'matching',question:item.question,options:item.options,correct:item.correct};
        normalizeGoetheQuestion(q,part);
        part.questions.push(q);
      });
      part.items=[];
    }
    (part.questions||[]).forEach((q,i)=>{if(!q.id)q.id='l'+(pi*10+i+1);normalizeGoetheQuestion(q,part);});
    (part.items||[]).forEach((item,i)=>{if(!item.id)item.id='l'+(pi*10+i+1);});
    (part.segments||[]).forEach(seg=>{(seg.questions||[]).forEach(q=>normalizeGoetheQuestion(q,part));});
  });
  (d.horenParts||[]).forEach((part,pi)=>{
    part.teil=part.teil??pi+1;
    part.plays=part.plays||2;
    if(!part.instruction)part.instruction=part.context||'';
    if(part.transcript)part.transcript=fixT(part.transcript);
    if(!part.segments&&(part.audios||part.recordings)){
      part.segments=(part.audios||part.recordings).map((a,i)=>({
        label:a.label||a.title||`Aufnahme ${i+1}`,
        transcript:a.transcript||a.text||'',
        questions:a.questions||[],
      }));
      delete part.audios;
      delete part.recordings;
    }
    if(!part.noteFields&&part.notes){
      if(Array.isArray(part.notes)){
        part.noteFields=part.notes.map((n,i)=>({
          id:n.id||'note'+(i+1),
          label:n.label||n.question||n,
          answer:n.answer||'',
        }));
      }else if(part.notes.fields){
        part.noteFields=part.notes.fields;
      }
      delete part.notes;
    }
    if(!part.questions&&part.content?.questions)part.questions=part.content.questions;
    (part.segments||[]).forEach((seg,si)=>{
      if(!seg.id)seg.id='h'+(pi*10+si+1);
      if(seg.transcript)seg.transcript=fixT(seg.transcript);
      (seg.questions||[]).forEach((q,qi)=>{if(!q.id)q.id=`h${pi+1}_${si+1}_${qi+1}`;normalizeGoetheQuestion(q,part);});
    });
    (part.questions||[]).forEach((q,i)=>{if(!q.id)q.id='h'+(pi*10+i+1);normalizeGoetheQuestion(q,part);});
  });
  (d.schreibenParts||[]).forEach((p,i)=>{
    p.aufgabe=p.aufgabe??i+1;
    p.fieldId=p.fieldId||'write'+(i+1);
    if(!p.task)p.task=p.instruction||p.prompt||'';
    p.task=fixT(p.task);
    if(!p.criteria)p.criteria=[];
  });
  (d.sprechenParts||[]).forEach((p,i)=>{
    p.teil=p.teil??i+1;
    p.fieldId=p.fieldId||'speak'+(i+1);
    p.title=p.title||(d.lang==='de'?'Sprechen':'Speaking')+' '+(i+1);
    if(!p.situation)p.situation=p.instruction||p.prompt||p.context||'';
    if(!p.points)p.points=p.prompts||p.examinerQuestions||[];
    if(typeof p.points==='string')p.points=[p.points];
  });
  return d;
}
function normalizeGoetheExam(d){
  if(!d)return d;
  if(d.lesenParts||d.horenParts||d.schreibenParts||d.sprechenParts){
    d.goetheFormat=true;
    d.lang=d.lang||'de';
    sanitizeGoetheParts(d);
    if(!d.modules){
      const lv=d.level||'B1';
      d.modules={
        lesen:{title:'Lesen',time:lv==='A1'?'25 Minuten':'65 Minuten'},
        horen:{title:'Hörverstehen',time:lv==='A1'?'ca. 20 Minuten':'40 Minuten'},
        schreiben:{title:'Schreiben',time:lv==='A1'?'20 Minuten':'60 Minuten'},
        sprechen:{title:'Sprechen',time:lv==='A1'?'ca. 15 Minuten':'15 Minuten (zwei Teilnehmende)'}
      };
    }
    if(!d.official){
      if(d.lang==='es'){
        const cert={A1:'DELE A1',A2:'DELE A2',B1:'DELE B1',B2:'DELE B2',C1:'DELE C1',C2:'DELE C2'};
        d.official={board:'Instituto Cervantes',certificate:cert[d.level]||'DELE',note:'Examen de práctica (generado por IA). Formato oficial DELE '+d.level+'.'};
      }else{
        const cert={A1:'Start Deutsch 1',A2:'Start Deutsch 2',B1:'Goethe-Zertifikat B1',B2:'Goethe-Zertifikat B2',C1:'Goethe-Zertifikat C1',C2:'Goethe-Zertifikat C2'};
        d.official={board:'Goethe-Institut',certificate:cert[d.level]||'Goethe-Zertifikat',note:'Modellsatz (KI-generiert). Aufgabentypen basieren auf dem offiziellen Goethe-Zertifikat '+d.level+'.'};
      }
    }
  }
  return d;
}
function normalizeExam(d){
  if(!d||typeof d!=='object')return null;
  const lang=typeof resolveExamLang==='function'?resolveExamLang(d,S.subject):(d.lang==='de'?'de':d.lang==='es'?'es':'en');
  d={...d,level:d.level||S.level,lang};
  if(lang==='es'){
    d=typeof normalizeSpanishExam==='function'?normalizeSpanishExam(d):d;
  }else if(d.readingParts||d.listeningParts){
    d=normalizeCambridgeExam(d);
  }
  return normalizeGoetheExam(d);
}
function goethePartHasContent(part,mod){
  if(!part||typeof part!=='object')return false;
  if(mod==='lesen')return!!(part.items?.length||part.text||part.ads?.length||part.questions?.length||part.opinions?.length||part.textWithGaps?.length||part.persons?.length);
  if(mod==='horen')return!!(part.segments?.length||part.questions?.length||part.noteFields?.length||part.transcript);
  if(mod==='schreiben')return!!(part.task||part.instruction||part.prompt);
  if(mod==='sprechen')return!!(part.situation||part.points?.length||part.prompts?.length||part.examinerQuestions?.length||part.cardText||part.task);
  return false;
}
function isExamBlueprintComplete(d){
  if(!d||typeof d!=='object')return false;
  if(d.demo||d.guidedDemo||d.vocabPersonal)return true;
  if(d.blueprintComplete===true)return true;
  if(d.blueprintComplete===false)return false;
  if(Array.isArray(d.blueprintCoverage)&&d.blueprintCoverage.length){
    return d.blueprintCoverage.every(c=>c.complete);
  }
  if(d.goetheFormat){
    const mods=['lesen','horen','schreiben','sprechen'];
    return mods.every(m=>{
      const parts=d[m+'Parts']||[];
      return parts.some(p=>goethePartHasContent(p,m));
    });
  }
  return true;
}
function isExamRenderable(d){
  if(!d||typeof d!=='object')return false;
  if(d.goetheFormat){
    const lp=(d.lesenParts||[]).some(p=>goethePartHasContent(p,'lesen'));
    const hp=(d.horenParts||[]).some(p=>goethePartHasContent(p,'horen'));
    const sp=(d.sprechenParts||[]).some(p=>goethePartHasContent(p,'sprechen'));
    const wp=(d.schreibenParts||[]).some(p=>goethePartHasContent(p,'schreiben'));
    if(d.vocabPersonal||d.libraryBuilt)return lp||hp||sp||wp;
    return lp&&hp;
  }
  if(d.readingParts?.length||d.listeningParts?.length||d.lesenParts?.length||d.horenParts?.length){
    const rp=(d.readingParts||d.lesenParts||[]).some(p=>p&&(p.text||p.items?.length||p.questions?.length||p.parts?.length));
    const lp=(d.listeningParts||d.horenParts||[]).some(p=>p&&(p.text||p.transcript||p.segments?.length||p.questions?.length));
    return rp||lp;
  }
  if(d.lesen?.text&&Array.isArray(d.lesen.questions)&&d.lesen.questions.length)return true;
  if(d.horen&&Array.isArray(d.horen.questions)&&d.horen.questions.length)return true;
  if(d.schreiben?.task)return true;
  if(d.sprechen&&Array.isArray(d.sprechen.points)&&d.sprechen.points.length)return true;
  if(d.gapfill&&Array.isArray(d.gapfill.sentences)&&d.gapfill.sentences.length)return true;
  return false;
}
function showExamError(e){
  backToWorkspace('exams');
  if(e.code==='quota_exceeded'){showQuotaExceededModal(e);return;}
  if(e.code==='timeout'||e.code==='gateway_timeout'){
    lcToast('Exam generation timed out. Please try again in 30 seconds.','warn',5000);
    return;
  }
  if(e.code==='exam_low_quality'){
    lcToast('AI returned low-quality content. Please try again — it usually works on the second attempt.','warn',5000);
    return;
  }
  if(e.code==='exam_invalid'){
    lcToast('AI returned an exam with invalid answer keys. Please try again.','warn',5000);
    return;
  }
  if(e.code==='exam_incomplete'){
    lcToast('We couldn\'t assemble a complete exam right now. Please try again later.','error',6000);
    return;
  }
  const msg=e.message||'Unknown error';
  if(/json|parse|unterminated/i.test(msg)){
    lcToast('AI returned incomplete data. Please try again.','error',5000);
    return;
  }
  lcToast(`Error generating exam: ${msg}`,'error',5000);
}
async function startQuick(mod){
  if(!S.subject)S.subject='de';
  if(!S.level)S.level='B1';
  S.quickMod=mod;S.answers={};S.gapAnswers={};
  hideAll();show('loadingScreen');
  document.getElementById('loaderTitle').textContent='Generating quick module…';
  document.getElementById('loaderSub').textContent='One module, instant results — free, no quota used';
  const topic=await pickTopicForSubject();
  const prepMsg='Content is being prepared for this level. Try another language/level.';
  try{
    if(!engineReady())throw new Error('Content engine not loaded');
    const skillMap={reading:['lesen'],listening:['horen'],writing:['schreiben'],gapfill:['lesen']};
    const skills=skillMap[mod]||['lesen'];
    if(typeof QuestionLibrary!=='undefined'&&QuestionLibrary.hasLibrary(S.subject,S.level)){
      S.examData=await QuestionLibrary.buildExam(S.subject,S.level,{skills});
      S.examData=stripExamToSkills(S.examData,skills);
      S.examData.quickMod=mod;
      S.examSource='question-library';
      renderExam();
      return;
    }
    if(typeof liveAiDisabled==='function'&&liveAiDisabled(S.subject,S.level)){
      backToWorkspace('exams');
      lcToast(prepMsg,'warn',6000);
      return;
    }
    S.examData=await LexiCoilEngine.generateQuickExercise(S.subject,S.level,mod,topic,getGeneratorHooks());
    S.examSource='ai';
    renderExam();
    if(S.examSource==='ai'&&!S.examData.vocabPersonal&&!S.examData.reusedItems){
      void contributeExamToStaging(S.subject,S.level,S.examData.topic||genericPoolTopic(S.subject,S.level),S.examData,{minCoverage:0});
    }
  }catch(e){backToWorkspace('exams');lcToast('Quick module failed: '+e.message,'error');}
}

// ═══════════════════════════════════════════
// EXAM GENERATION — LexiCoil engine v2
// ═══════════════════════════════════════════
const EXAM_PART_KEYS=['lesenParts','horenParts','schreibenParts','sprechenParts','readingParts','listeningParts','writingParts','speakingParts'];
function extractJsonBlock(raw){
  let s=String(raw).replace(/```json\s*|```/gi,'').trim();
  const start=s.indexOf('{');
  if(start<0)throw new Error('No JSON object in AI response');
  s=s.slice(start);
  let depth=0,inStr=false,esc=false;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(inStr){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')inStr=false;continue;}
    if(c==='"')inStr=true;
    else if(c==='{')depth++;
    else if(c==='}'){depth--;if(depth===0)return s.slice(0,i+1);}
  }
  return s;
}
function salvageJson(text){
  /** @deprecated Prefer structured engine output (phase 03); kept for legacy AI JSON repair. */
  let json=extractJsonBlock(text);
  for(let n=0;n<24;n++){
    try{return JSON.parse(json);}catch(e){
      if(!/unterminated|unexpected end|position/i.test(e.message))throw e;
      const ob=(json.match(/\{/g)||[]).length-(json.match(/\}/g)||[]).length;
      const oa=(json.match(/\[/g)||[]).length-(json.match(/\]/g)||[]).length;
      if(ob>0||oa>0){json=json.replace(/,\s*$/,'')+']'.repeat(Math.max(0,oa))+'}'.repeat(Math.max(0,ob));continue;}
      const cut=json.lastIndexOf(',');
      if(cut>10)json=json.slice(0,cut);else throw e;
    }
  }
  throw new Error('Could not parse AI JSON');
}
function parseExamJson(raw){return salvageJson(raw);}
function mergeExamParts(...parts){
  const topic=parts[parts.length-1];
  const chunks=parts.slice(0,-1);
  let merged={};
  for(const part of chunks){
    const keys=Object.keys(part).filter(k=>EXAM_PART_KEYS.includes(k));
    lcDebug.log('[merge] chunk keys:',keys,keys.map(k=>Array.isArray(part[k])?part[k].length+' items':typeof part[k]));
    for(const[k,v]of Object.entries(part)){
      if(EXAM_PART_KEYS.includes(k)&&Array.isArray(v))merged[k]=[...(merged[k]||[]),...v];
      else if(!(k in merged)||typeof v!=='object'||v===null||Array.isArray(v))merged[k]=v;
      else if(k==='modules')merged[k]={...merged[k],...v};
    }
  }
  lcDebug.log('[merge] final keys:',Object.keys(merged).filter(k=>EXAM_PART_KEYS.includes(k)).map(k=>k+':'+(Array.isArray(merged[k])?merged[k].length:'?')));
  return{...merged,topic:merged.topic||topic,level:merged.level||S.level,lang:merged.lang||S.subject};
}
function normalizeChunkObj(chunk,obj){
  if(!obj||Array.isArray(obj))return obj;
  const key=chunk.expectKey;
  if(obj.parts&&Array.isArray(obj.parts)&&key){
    const o={topic:obj.topic,level:obj.level,lang:obj.lang};
    o[key]=obj.parts;
    return o;
  }
  if(key==='lesenParts'&&(obj.teil1||obj.teil2)){
    return{...obj,lesenParts:[obj.teil1,obj.teil2].filter(Boolean)};
  }
  if(key&&obj[key]&&!Array.isArray(obj[key])&&typeof obj[key]==='object'){
    obj={...obj,[key]:[obj[key]]};
  }
  if((key==='horenParts'||key==='listeningParts')&&!obj[key]&&(obj.segments||obj.transcript||obj.noteFields)){
    obj={...obj,[key]:[{...obj}]};
  }
  if(key==='lesenParts'&&!obj[key]&&(obj.items||obj.text||obj.questions)){
    obj={...obj,lesenParts:[{...obj}]};
  }
  if(key==='readingParts'&&!obj[key]&&(obj.items||obj.text||obj.questions)){
    obj={...obj,readingParts:[{...obj}]};
  }
  return obj;
}
function validateChunkObj(chunk,obj){
  obj=normalizeChunkObj(chunk,obj);
  if(!obj||Array.isArray(obj)||typeof obj!=='object')throw new Error('chunk not an object');
  const key=chunk.expectKey;
  if(!key)return obj;
  if(Array.isArray(obj[key])&&obj[key].length>0)return obj;
  if(Array.isArray(obj[key])&&obj[key].length===0){
    lcDebug.warn('[exam] chunk returned empty array for',key,'— accepting anyway');
    return obj;
  }
  const aliases={
    horenParts:['listeningParts','audioparts','listening','horen'],
    listeningParts:['horenParts','audioparts','listening','horen'],
    lesenParts:['readingParts','reading','lesen'],
    readingParts:['lesenParts','reading','lesen'],
    schreibenParts:['writingParts','writing','schreiben'],
    writingParts:['schreibenParts','writing','schreiben'],
    sprechenParts:['speakingParts','speaking','sprechen'],
    speakingParts:['sprechenParts','speaking','sprechen'],
  };
  for(const alt of(aliases[key]||[])){
    if(Array.isArray(obj[alt])&&obj[alt].length>0){
      lcDebug.warn('[exam] chunk used alias',alt,'for',key,'— remapping');
      obj[key]=obj[alt];
      return obj;
    }
  }
  throw new Error('missing '+key);
}
function getGeneratorHooks(onStep){
  return{
    callAI,
    onStep:onStep||((msg)=>msg),
    parseExamJson,
    validateChunkObj,
    mergeExamParts,
    commitExamQuota,
    normalizeExam:typeof normalizeExam==='function'?normalizeExam:(x)=>x
  };
}
function engineReady(){
  return typeof LexiCoilEngine!=='undefined'&&typeof KnowledgeEngine!=='undefined'&&typeof PromptBuilder!=='undefined'&&typeof LexiCoilDomain!=='undefined';
}
async function generateExamChunks(topic,onStep){
  if(!engineReady())throw new Error('Content engine not loaded');
  const specExtra={};
  const genOpts={};
  const bpEnabled=typeof ExamGenerator!=='undefined'&&ExamGenerator.aiPathBlueprintsEnabled?.();
  if(bpEnabled&&typeof ExamBlueprint!=='undefined'){
    try{
      const bp=await ExamBlueprint.load(S.subject,S.level);
      if(bp){
        specExtra.metadata={blueprint:bp};
        genOpts.useBlueprint=true;
      }
    }catch(bpErr){lcDebug.warn('[exam] blueprint preload failed:',bpErr);}
  }
  return LexiCoilEngine.generateExam(S.subject,S.level,topic,getGeneratorHooks(onStep),{specExtra,...genOpts});
}
const POOL_COVERAGE_THRESHOLD=0.8;
const POOL_CONTRIBUTE_COVERAGE=0.6;
function applyPersonalTargetUsage(exam,words){
  if(!exam||!words?.length)return exam;
  if(typeof TargetUsage!=='undefined')TargetUsage.applyVerified(exam,words);
  return exam;
}
function lcVocabCoverage(exam,words){
  if(!exam||!words?.length)return {ratio:0,found:0,total:0};
  if(exam.targetUsageVerified?.length){
    const found=exam.targetUsageVerified.length;
    return {ratio:found/words.length,found,total:words.length};
  }
  if(Array.isArray(exam.targetUsage)&&exam.targetUsage.length&&typeof TargetUsage!=='undefined'){
    const verified=TargetUsage.verifyTargetUsage(exam,exam.targetUsage);
    const found=verified.length;
    return {ratio:found/words.length,found,total:words.length};
  }
  const blob=JSON.stringify(exam).toLowerCase();
  let found=0;
  words.forEach(w=>{
    if(blob.includes(String(w).toLowerCase()))found++;
  });
  return {ratio:found/words.length,found,total:words.length};
}
function lcExamHasPlaceholders(exam){
  const text=JSON.stringify(exam||{});
  const n=(text.match(/\.\.\.|Option [A-D]"|"Text here"|"Question here"|Ein Text ueber|Ein Text über|An article about/gi)||[]).length;
  return n>5;
}
function buildPoolExamCopy(exam,topic){
  const copy=JSON.parse(JSON.stringify(exam));
  delete copy.vocabPersonal;delete copy.vocabWords;delete copy.vocabSkills;
  delete copy.targetUsage;delete copy.targetUsageVerified;
  delete copy.goalId;delete copy._savedId;delete copy._flightId;
  delete copy.poolSource;delete copy.poolId;delete copy.guidedDemo;
  copy.topic=topic;
  return copy;
}
function lcValidatorStrict(){
  if(typeof window!=='undefined'&&window.LC_VALIDATOR_STRICT==='1')return true;
  return false;
}
function lcExamPassesValidator(exam,opts){
  if(typeof ExamValidator==='undefined')return true;
  const strict=opts?.strict??lcValidatorStrict();
  const r=new ExamValidator().validate(exam,{strict,blueprint:opts?.blueprint});
  if(!r.valid)lcDebug.warn('[exam] validation failed:',r.errors,r.warnings?.length?`(warnings: ${r.warnings.join(', ')})`:'');
  return r.valid;
}
async function lcValidateExamOnServer(exam,opts){
  try{
    const res=await fetch('/.netlify/functions/claude-chat',{
      method:'POST',
      headers:typeof aiAuthHeaders==='function'?aiAuthHeaders():{'Content-Type':'application/json'},
      body:JSON.stringify({
        validateExam:true,
        exam,
        verifyAnswerKeys:!!(opts&&opts.verifyAnswerKeys)
      })
    });
    const data=await res.json().catch(()=>({}));
    if(res.ok&&data.valid)return {valid:true};
    if(res.status===422&&data.error==='exam_invalid'){
      lcDebug.warn('[exam] server validation rejected:',data.validationErrors||data.message);
      return {valid:false,errors:data.validationErrors||[data.message]};
    }
  }catch(e){lcDebug.warn('[exam] server validation unavailable:',e.message);}
  return {valid:true,skipped:true};
}
function lcExamPassesQualityGate(exam,words,minCoverage){
  if(!exam||(typeof isExamRenderable==='function'&&!isExamRenderable(exam)))return false;
  if(!lcExamPassesValidator(exam))return false;
  if(lcExamHasPlaceholders(exam))return false;
  if(words?.length){
    const cov=lcVocabCoverage(exam,words);
    if(cov.ratio<(minCoverage??POOL_CONTRIBUTE_COVERAGE))return false;
  }
  return true;
}
function genericPoolTopic(lang,level){
  return `${certLbl(lang,level)} practice exam`;
}
async function contributeExamToStaging(lang,level,topic,exam,opts){
  if(!exam||exam.vocabPersonal||exam.vocabWords?.length||exam.reusedItems)return;
  if(typeof saveExamPartsToStaging!=='function')return;
  const words=opts?.words;
  const minCov=opts?.minCoverage??(words?.length?POOL_CONTRIBUTE_COVERAGE:0);
  const complete=typeof isExamBlueprintComplete==='function'&&isExamBlueprintComplete(exam);
  const passesQuality=lcExamPassesQualityGate(exam,words,minCov);
  try{
    await saveExamPartsToStaging(lang,level,exam,{complete:complete&&passesQuality,autoApprove:false});
  }catch(err){lcDebug.warn('[staging] remote ingest failed:',err);}
}
async function contributeExamToPool(lang,level,topic,exam,opts){
  if(typeof S!=='undefined'&&S.examSource==='ai'){
    void contributeExamToStaging(lang,level,topic,exam,opts);
  }
  if(typeof lcStrategyBEnabled==='function'&&lcStrategyBEnabled())return;
  if(typeof saveExamToPool!=='function'||!exam)return;
  const words=opts?.words;
  const minCov=opts?.minCoverage??(words?.length?POOL_CONTRIBUTE_COVERAGE:0);
  if(!lcExamPassesQualityGate(exam,words,minCov))return;
  const clean=buildPoolExamCopy(exam,topic||genericPoolTopic(lang,level));
  try{await saveExamToPool(lang,level,clean.topic,clean);}catch(_){}
}
window.contributeExamToPool=contributeExamToPool;
window.contributeExamToStaging=contributeExamToStaging;
window.lcVocabCoverage=lcVocabCoverage;
function stripExamToSkills(exam,skills){
  if(!exam||!skills?.length)return exam;
  const s=new Set(skills);
  if(exam.goetheFormat||S.subject==='de'||S.subject==='es'){
    if(!s.has('lesen')){exam.lesenParts=[];delete exam.lesen;}
    if(!s.has('horen')){exam.horenParts=[];delete exam.horen;}
    if(!s.has('schreiben')){exam.schreibenParts=[];delete exam.schreiben;}
    if(!s.has('sprechen')){exam.sprechenParts=[];delete exam.sprechen;}
  }else{
    if(!s.has('lesen')){exam.readingParts=[];delete exam.reading;}
    if(!s.has('horen')){exam.listeningParts=[];delete exam.listening;}
    if(!s.has('schreiben')){exam.writingParts=[];delete exam.writing;}
    if(!s.has('sprechen')){exam.speakingParts=[];delete exam.speaking;}
  }
  return exam;
}

async function generateWeaknessExam(goalId){
  const goal=goalId?S.goals.find(g=>g.id===goalId):getActiveGoal();
  if(!goal){showAddGoalWizard();return;}
  if(typeof requirePersonalized==='function'&&!requirePersonalized({message:'Personalized weakness exams require Pro.'}))return;
  if(!canGenerate()){showUpgrade();return;}
  const servible=typeof isLevelServable==='function'&&isLevelServable(goal.subject,goal.level);
  if(typeof QuestionLibrary==='undefined'||(!QuestionLibrary.hasLibrary(goal.subject,goal.level)&&!servible)){
    lcToast('Personalized weakness exams require a servible question library for this level.','warn');return;
  }
  confirmQuotaUse(()=>runWeaknessExam(goal));
}
async function runWeaknessExam(goal){
  S.activeGoalId=goal.id;
  syncGoalToProfile(goal);
  saveGoals();
  S.subject=goal.subject;
  S.level=goal.level;
  S.mode='practice';
  S.isDemo=false;
  S.answers={};
  S.gapAnswers={};
  S.quickMod=null;
  initExamSession('practice');
  hideAll();
  show('loadingScreen');
  document.getElementById('loaderTitle').textContent='Building personalized exam…';
  document.getElementById('loaderSub').textContent='70% weakness focus · 30% mixed reinforcement (library, no AI)…';
  try{
    S.examData=await QuestionLibrary.buildWeaknessExam(goal.subject,goal.level,goal);
    S.examData.weaknessExam=true;
    S.examData.personalizedExam=!!S.examData.personalizedSplit;
    S.examData.goalId=goal.id;
    S.examSource='question-library';
    if(typeof commitExamQuota==='function')await commitExamQuota();
    renderExam();
  }catch(e){
    hideAll();
    openGoalWorkspace(goal.id,'exams');
    lcToast('Weakness exam failed: '+e.message,'error',5000);
  }
}
function launchHorenGame(words, lang, level){
  if(typeof requirePersonalized==='function'&&!requirePersonalized({message:'The listening game is included with Pro.'}))return;
  hideAll(); show('horenGameScreen');
  const el=document.getElementById('horenGameMount');
  if(!el||typeof HorenGame==='undefined'){lcToast('Listening game unavailable.','warn');return;}
  HorenGame.mount(el, { words, lang, level, uiLang: lang==='es'?'es':'en' }, {
    onComplete(result){
      if(typeof AnalyticsStore!=='undefined'&&typeof AnalyticsStore.recordWordResults==='function'){
        try{AnalyticsStore.recordWordResults((typeof getActiveGoal==='function')?getActiveGoal():null, result.detail);}catch(_){}
      }
    }
  });
}
function exitHorenGame(){
  if(typeof backToWorkspace==='function')backToWorkspace('vocabulary');
  else if(typeof goHome==='function')goHome();
}
function startHorenGameFromHub(){
  let words=[];
  if(typeof getSelectedFC==='function'){ const sel=getSelectedFC(); if(sel&&sel.length) words=sel.map(c=>c.word); }
  if(!words.length){
    const goal=(typeof getActiveGoal==='function')?getActiveGoal():null;
    if(goal&&Array.isArray(S.flashcards)) words=S.flashcards.filter(f=>f.sourceLang===goal.subject).map(f=>f.word);
  }
  words=[...new Set(words)].slice(0,12);
  if(words.length<2){lcToast('Save at least 2 words to play.','warn');return;}
  const goal=(typeof getActiveGoal==='function')?getActiveGoal():null;
  launchHorenGame(words, goal?goal.subject:(S.subject||'de'), goal?goal.level:(S.level||'B1'));
}
window.exitHorenGame=exitHorenGame;
window.startHorenGameFromHub=startHorenGameFromHub;
async function tryPersonalPoolOrLibrary(configWords,configSkills,configGoalId,goalRef){
  if(typeof fetchExamFromPool==='function'){
    document.getElementById('loaderSub').textContent='Looking for a matching exam…';
    try{
      const pooled=await fetchExamFromPool(S.subject,S.level,seenPoolIds(S.subject,S.level));
      if(pooled?.found&&pooled.exam&&!(typeof BurnedRegistry!=='undefined'&&BurnedRegistry.examTouchesBurned(pooled.exam))){
        const check=validateExamCandidate(pooled.exam);
        let candidate=check.ok?check.normalized:null;
        if(candidate){
          candidate=stripExamToSkills(JSON.parse(JSON.stringify(candidate)),configSkills);
          const cov=lcVocabCoverage(candidate,configWords);
          if(cov.ratio>=POOL_COVERAGE_THRESHOLD&&isExamRenderable(candidate)&&lcExamPassesValidator(candidate)&&!lcExamHasPlaceholders(candidate)){
            candidate.vocabPersonal=true;
            candidate.vocabWords=configWords;
            candidate.vocabSkills=configSkills;
            candidate.poolSource=true;
            candidate.poolId=pooled.id||null;
            if(configGoalId||S.activeGoalId)candidate.goalId=configGoalId||S.activeGoalId;
            candidate.topic='Personal: '+configWords.slice(0,3).join(', ')+(configWords.length>3?'…':'');
            return {exam:candidate,source:'pool',poolId:pooled.id||null};
          }
        }
      }
    }catch(poolErr){lcDebug.warn('[personal] pool fetch failed:',poolErr);}
  }
  if(typeof QuestionLibrary!=='undefined'&&QuestionLibrary.hasLibrary(S.subject,S.level)){
    document.getElementById('loaderSub').textContent=`Assembling from library — ${configWords.length} words…`;
    const exam=await QuestionLibrary.buildPersonalExam(S.subject,S.level,configWords,configSkills);
    return {exam,source:'question-library'};
  }
  return null;
}
async function finalizePersonalExam(configWords,configSkills,configGoalId,goalRef,exam,source){
  S.examData=exam;
  S.examSource=source;
  stripExamToSkills(S.examData,configSkills);
  S.examData.vocabPersonal=true;
  S.examData.vocabWords=configWords;
  S.examData.vocabSkills=configSkills;
  if(configGoalId||S.activeGoalId)S.examData.goalId=configGoalId||S.activeGoalId;
  if(!S.examData.topic||S.examData.topic==='Personal vocabulary review')S.examData.topic='Personal: '+configWords.slice(0,3).join(', ')+(configWords.length>3?'…':'');
  applyPersonalTargetUsage(S.examData,configWords);
  const coverage=lcVocabCoverage(S.examData,configWords);
  if(coverage.ratio<POOL_CONTRIBUTE_COVERAGE){
    lcToast(`Only ${Math.round(coverage.ratio*100)}% of your words appear in this exam (target ${Math.round(POOL_CONTRIBUTE_COVERAGE*100)}%+). You can regenerate from the configurator for better coverage.`,'warn',7000);
  }
  if(S.examSource==='question-library'&&(!isExamRenderable(S.examData)||!lcExamPassesValidator(S.examData,{strict:false}))){
    throw new Error('Library assembly produced an invalid exam.');
  }
  if(typeof lcValidateExamOnServer==='function'){
    const srv=await lcValidateExamOnServer(S.examData);
    if(!srv.valid)throw Object.assign(new Error('Personal exam failed answer-key validation.'),{code:'exam_invalid'});
  }
  if(typeof commitExamQuota==='function')await commitExamQuota();
  if(typeof normalizeExam==='function')S.examData=normalizeExam(S.examData);
  if(examHasUnanswerableQuestions(S.examData)){
    throw Object.assign(new Error('Generated exam has questions without answer options.'),{code:'exam_invalid'});
  }
  if(lcExamPassesQualityGate(S.examData,configWords,POOL_CONTRIBUTE_COVERAGE)){
    if(S.examSource==='ai'){
      const depersonalized=buildPoolExamCopy(S.examData,genericPoolTopic(S.subject,S.level));
      void contributeExamToPool(S.subject,S.level,depersonalized.topic,depersonalized,{minCoverage:0});
    }else{
      void contributeExamToPool(S.subject,S.level,genericPoolTopic(S.subject,S.level),S.examData,{words:configWords,minCoverage:POOL_CONTRIBUTE_COVERAGE});
    }
  }
  if(typeof VocabBatching!=='undefined'&&goalRef?.vocabPlan){
    VocabBatching.advance(goalRef.vocabPlan,configWords);
    saveGoals();
    const cov=VocabBatching.coverage(goalRef.vocabPlan);
    if(!cov.finished){
      lcToast(VocabBatching.summary(goalRef.vocabPlan,S.subject)+'. Use “Next batch” on results when ready.','info',8000);
    }
  }
  renderExam();
}
async function generatePersonalExam(words,skills,goalId,opts){
  let configWords=words;
  let configSkills=skills;
  let configGoalId=goalId;
  const skipBatching=!!(opts&&opts.skipBatching);
  const goalRef=configGoalId?S.goals.find(g=>g.id===configGoalId):getActiveGoal();
  if(skipBatching&&goalRef?.vocabPlan&&typeof VocabBatching!=='undefined'){
    const batch=VocabBatching.nextBatch(goalRef.vocabPlan);
    if(!batch){lcToast('All vocabulary batches completed.','success');return;}
    configWords=batch;
    configSkills=goalRef.vocabPlan.skills||configSkills||['lesen','horen'];
    S.subject=goalRef.subject;S.level=goalRef.level;S.activeGoalId=goalRef.id;syncGoalToProfile(goalRef);
  }else   if(!configWords){
    const cards=getSelectedFC();
    if(cards.length<2){lcToast('Select at least 2 words.','warn');return;}
    const langs=[...new Set(cards.map(c=>c.sourceLang).filter(l=>l==='de'||l==='en'||l==='es'))];
    if(langs.length>1){lcToast('Select words from one language only.','warn');return;}
    S.subject=langs[0]||'de';
    S.level=document.getElementById('fcPersonalLevel')?.value||inferLevelFromCards(cards)||'B1';
    configWords=cards.map(c=>c.word);
    configSkills=['lesen','horen','schreiben','sprechen'];
  }else{
    const goal=configGoalId?S.goals.find(g=>g.id===configGoalId):getActiveGoal();
    if(goal){S.subject=goal.subject;S.level=goal.level;S.activeGoalId=goal.id;syncGoalToProfile(goal);}
  }
  configSkills=configSkills||['lesen','horen'];
  const tier=typeof canUsePersonalizedTier==='function'?canUsePersonalizedTier():'free';
  if(!canGenerate()){showUpgrade();return;}
  let libraryMatchCount;
  if(typeof VocabBatching!=='undefined'&&!skipBatching){
    if(typeof QuestionLibrary!=='undefined'&&QuestionLibrary.hasLibrary(S.subject,S.level)){
      try{
        const bank=await LibraryLoader.load(S.subject,S.level);
        libraryMatchCount=(bank.questions||[]).filter(q=>ExamBuilder.questionContainsWords(q,bank,configWords)).length;
      }catch(_){libraryMatchCount=undefined;}
    }
    if(goalRef&&configWords.length>VocabBatching.capacityFor(configSkills)){
      goalRef.vocabPlan=VocabBatching.planBatches(configWords,configSkills,goalRef);
      saveGoals();
    }
    if(goalRef?.vocabPlan&&!VocabBatching.coverage(goalRef.vocabPlan).finished){
      const batch=VocabBatching.nextBatch(goalRef.vocabPlan);
      if(batch)configWords=batch;
    }
  }
  S.mode='practice';S.isDemo=false;S.answers={};S.gapAnswers={};S.quickMod=null;
  initExamSession('practice');
  S.lastPersonalConfig={words:configWords,skills:configSkills,goalId:configGoalId||S.activeGoalId};
  if(typeof VocabBatching!=='undefined'&&typeof HorenGame!=='undefined'&&VocabBatching.shouldUseGame(configWords,configSkills,libraryMatchCount)){
    launchHorenGame(configWords,S.subject,S.level);return;
  }
  hideAll();show('loadingScreen');
  document.getElementById('loaderTitle').textContent='Building your personal mock exam…';
  document.getElementById('loaderSub').textContent=`Weaving ${configWords.length} words into ${configSkillSummary(new Set(configSkills),S.subject)}…`;
  try{
    let built=null;
    if(tier==='pro'){
      document.getElementById('loaderSub').textContent=`Generating with AI — ${configWords.length} words, ${configSkillSummary(new Set(configSkills),S.subject)}…`;
      try{
        if(typeof lcStrategyBEnabled==='function'&&lcStrategyBEnabled()){
          throw new Error('This level uses the question library only (live AI is disabled).');
        }
        if(!engineReady())throw new Error('Content engine not loaded');
        const exam=await LexiCoilEngine.generatePersonalExam(S.subject,S.level,configWords,configSkills,getGeneratorHooks());
        built={exam,source:'ai'};
      }catch(aiErr){
        if(aiErr.code==='ai_credits_exhausted'){
          if(typeof showAiCreditsExhausted==='function')showAiCreditsExhausted();
          built=await tryPersonalPoolOrLibrary(configWords,configSkills,configGoalId,goalRef);
          if(!built){
            hideAll();
            if(_examConfig.goalId){show('examConfigScreen');showExamConfigFootbar(true);renderExamConfigurator();}
            else show('flashcardScreen');
            return;
          }
        }else throw aiErr;
      }
    }else{
      built=await tryPersonalPoolOrLibrary(configWords,configSkills,configGoalId,goalRef);
      if(!built){
        hideAll();
        if(typeof showUpgrade==='function')showUpgrade();
        lcToast('No exam in the pool/library matches your words. Upgrade to Pro to generate one with AI.','warn',7000);
        if(_examConfig.goalId){show('examConfigScreen');showExamConfigFootbar(true);renderExamConfigurator();}
        else show('flashcardScreen');
        return;
      }
    }
    await finalizePersonalExam(configWords,configSkills,configGoalId,goalRef,built.exam,built.source);
  }catch(e){
    hideAll();
    if(_examConfig.goalId){
      show('examConfigScreen');
      showExamConfigFootbar(true);
      renderExamConfigurator();
    }else show('flashcardScreen');
    lcToast('Personal exam failed: '+e.message,'error',5000);
  }
}

function generateNextVocabBatch(goalId){
  const gid=goalId||S.activeGoalId;
  generatePersonalExam(null,null,gid,{skipBatching:true});
}
window.generateNextVocabBatch=generateNextVocabBatch;

function inferLevelFromCards(cards){
  const levels=cards.map(c=>c.sourceExam?.level).filter(Boolean);
  if(!levels.length)return null;
  const freq={};
  levels.forEach(l=>{freq[l]=(freq[l]||0)+1;});
  return Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0];
}

function getSelectedFC(){
  ensureFcIds();
  if(!S.fcSelected.size)return[];
  return S.flashcards.filter(f=>S.fcSelected.has(fcId(f)));
}

function toggleFCSelect(id,ev){
  if(ev){ev.stopPropagation();}
  if(S.fcSelected.has(id))S.fcSelected.delete(id);else S.fcSelected.add(id);
  updFCSelectUI();
  const card=document.getElementById('fc_'+id);
  if(card)card.classList.toggle('fc-selected',S.fcSelected.has(id));
}

function selectAllFC(){
  ensureFcIds();
  getDeckViewCards().forEach(f=>S.fcSelected.add(fcId(f)));
  renderFC(false);
}

function selectDueFC(){
  ensureFcIds();
  S.fcSelected.clear();
  getDeckViewCards().forEach(f=>{if(isDue(f))S.fcSelected.add(fcId(f));});
  renderFC(false);
}

function selectLastExamFC(){
  ensureFcIds();
  const withExam=getDeckViewCards().filter(f=>f.sourceExam?.id);
  if(!withExam.length){
    notify('No words from an exam yet — use Practice Mode and save words.','warn');
    return;
  }
  const latest=withExam.sort((a,b)=>(b.sourceExam.id||0)-(a.sourceExam.id||0))[0];
  const examId=latest.sourceExam.id;
  S.fcSelected.clear();
  withExam.filter(f=>f.sourceExam.id===examId).forEach(f=>S.fcSelected.add(fcId(f)));
  renderFC(false);
}

function clearFCSelect(){
  S.fcSelected.clear();
  renderFC(false);
}

function updFCSelectUI(){
  const n=S.fcSelected.size;
  const cnt=document.getElementById('fcSelCount');
  const pb=document.getElementById('fcPersonalBadge');
  const eb=document.getElementById('fcExamBadge');
  const btn=document.getElementById('btnPersonalExam');
  if(cnt)cnt.textContent=n;
  if(pb)pb.textContent=n+' word'+(n===1?'':'s');
  if(eb)eb.textContent=n+' selected';
  if(btn){
    const proOnly=typeof canUsePersonalized==='function'&&!canUsePersonalized();
    btn.disabled=n<4||(!proOnly&&!canGenerate());
    btn.textContent=proOnly?'Upgrade for personalized exams →':'Generate personal mock exam →';
  }
  const lv=inferLevelFromCards(getSelectedFC());
  const sel=document.getElementById('fcPersonalLevel');
  if(sel&&lv)sel.value=lv;
}
