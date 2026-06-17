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
function inferQuestionCorrect(q) {
  if (!q || typeof q !== 'object') return;
  if (q.correct != null && q.correct !== '') return;
  const pick = (...vals) => {
    for (const v of vals) {
      if (v != null && v !== '') return v;
    }
    return null;
  };
  const alias = pick(
    q.answer,
    q.solution,
    q.correctAnswer,
    q.expectedAnswer,
    q.rightAnswer,
    q.expected,
    q.key,
  );
  if (alias != null) q.correct = alias;
  if ((q.correct == null || q.correct === '') && Array.isArray(q.options)) {
    const flagged = q.options.filter(
      (o) => o && typeof o === 'object' && (o.correct === true || o.isCorrect === true),
    );
    if (flagged.length === 1) {
      const o = flagged[0];
      q.correct = o.key != null ? o.key : o.id != null ? o.id : o.label;
    }
  }
}
function coerceMcqOptions(q) {
  inferQuestionCorrect(q);
  if (!q || !Array.isArray(q.options) || !q.options.length) return;
  const type = String(q.type || 'multiple').toLowerCase();
  if (['rf', 'tf', 'richtig_falsch', 'true_false', 'yn', 'ja_nein', 'rfn', 'r_f_n', 'gap_fill', 'gap', 'matching', 'match', 'person_match', 'person_multi'].includes(type)) return;

  const ADS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const normalized = q.options.map((o, i) => {
    const fallbackKey = ADS[i] || String(i + 1);
    if (typeof o === 'string') {
      const m = o.match(/^([A-Za-z0-9]+)\)\s*(.*)$/s);
      if (m) return { key: m[1].toUpperCase(), text: (m[2] || '').trim() };
      return { key: fallbackKey, text: o.trim() };
    }
    if (o && typeof o === 'object') {
      const rawKey = o.key != null ? o.key : o.id;
      const key = rawKey != null
        ? String(rawKey).trim().replace(/^\s*([a-zA-Z0-9]+)\)\s*/, '$1').toUpperCase()
        : fallbackKey;
      const text = String(o.text ?? o.label ?? o.option ?? '').trim();
      return { ...o, key, text: text || key };
    }
    return { key: fallbackKey, text: String(o ?? '').trim() };
  });
  q.options = normalized;

  if (q.correct == null || q.correct === '') {
    const flagged = normalized.filter((o) => o && (o.correct === true || o.isCorrect === true));
    if (flagged.length === 1 && flagged[0].key) {
      q.correct = flagged[0].key;
      return;
    }
    return;
  }
  let corr = Array.isArray(q.correct) ? q.correct[0] : q.correct;
  const corrStr = String(corr ?? '').trim();
  if (!corrStr) return;
  const corrKey = corrStr.replace(/^\s*([a-zA-Z0-9]+)\)\s*/, '$1').toUpperCase();
  const keys = normalized.map((o) => o.key);
  if (keys.includes(corrKey)) {
    q.correct = corrKey;
    return;
  }
  if (/^\d+$/.test(corrStr)) {
    const n = Number(corrStr);
    const pick = n >= 1 && n <= normalized.length ? normalized[n - 1] : normalized[n];
    if (pick?.key) {
      q.correct = pick.key;
      return;
    }
  }
  const lc = corrStr.toLowerCase();
  const byText = normalized.find((o) => {
    const t = String(o.text || '').toLowerCase();
    return t === lc || (t && (t.includes(lc) || lc.includes(t)));
  });
  if (byText?.key) {
    q.correct = byText.key;
    return;
  }
  if (corrStr.length === 1 && keys.includes(corrStr.toUpperCase())) {
    q.correct = corrStr.toUpperCase();
  }
}
function ensureMatchingOptions(q, part) {
  const ADS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (part?.ads?.length) {
    q.options = part.ads.map((a, i) => ({
      key: ADS[i] || String(i + 1),
      text: String(a.title || a.text || a.key || `Anzeige ${ADS[i] || i + 1}`).trim(),
    }));
    if (!q.options.some((o) => o.key === '0')) {
      q.options.push({ key: '0', text: '0 – keine passende Anzeige' });
    }
    q._keyOnlyMatch = true;
  } else if (Array.isArray(q.options) && q.options.length) {
    const seen = new Set();
    q.options = q.options
      .map((o, i) => {
        if (typeof o === 'string') {
          const m = o.match(/^([A-Za-z0-9]+)\)\s*(.*)$/s);
          const key = m ? m[1].toUpperCase() : ADS[i] || String(i + 1);
          return { key, text: (m ? m[2] : o).trim() || key };
        }
        if (o && typeof o === 'object') {
          const key = String(o.key ?? o.id ?? ADS[i] ?? i + 1)
            .trim()
            .replace(/^\s*([a-zA-Z0-9]+)\)\s*/, '$1')
            .toUpperCase();
          return { key, text: String(o.text ?? o.label ?? '').trim() || key };
        }
        return { key: ADS[i] || String(i + 1), text: String(o ?? '').trim() };
      })
      .filter((o) => {
        if (seen.has(o.key)) return false;
        seen.add(o.key);
        return true;
      });
  }
  if (q.correct != null && q.correct !== '') {
    const c = String(q.correct).trim();
    const m = c.match(/^([A-Za-z0-9]+)/);
    q.correct = m ? m[1].toUpperCase() : c.toUpperCase();
  }
  q.type = 'matching';
}
function normalizeGoetheQuestion(q,part){
  inferQuestionCorrect(q);
  const rawType=String(q.type||'').toLowerCase();
  if(rawType==='matching'||rawType==='match'){
    ensureMatchingOptions(q,part);
    return;
  }
  if((!q.type||q.type==='multiple'||q.type==='multiple_choice')&&!(Array.isArray(q.options)&&q.options.length)){
    const c=String(q.correct??'').trim();
    if(/^(R|F|Richtig|Falsch|True|False|W|T)$/i.test(c))q.type='rf';
    else if(/^(J|N|Ja|Nein|Yes|No|Y)$/i.test(c))q.type='yn';
    else if(/^[A-J0]$/i.test(c)&&part?.ads?.length)q.type='matching';
  }
  if(q.type==='matching'||q.type==='match'){
    ensureMatchingOptions(q,part);
    return;
  }
  coerceMcqOptions(q);
  if(q.type==='richtig_falsch'||q.type==='true_false'||q.type==='rf'||q.type==='tf'){q.type='rf';if(q.correct==='Richtig'||q.correct==='True')q.correct='R';else if(q.correct==='Falsch'||q.correct==='False')q.correct='F';}
  if(q.type==='ja_nein'||q.type==='yn'){q.type='yn';if(q.correct==='Ja')q.correct='J';else if(q.correct==='Nein')q.correct='N';}
  if((q.type==='rf'||q.type==='yn')&&(q.correct==null||q.correct===''))inferQuestionCorrect(q);
  if(q.type==='r_f_n')q.type='rfn';
  if(q.type==='person_match_abcd')q.type='abcd';
  if(q.type==='person_match')q.type='person_multi';
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
    if(typeof lesenPartMissingAds==='function'&&lesenPartMissingAds(p))bad=true;
    (p.questions||[]).forEach(checkQ);
    (p.items||[]).forEach(it=>{if(it.question||it.correct!=null)checkQ(it);});
    (p.segments||[]).forEach(s=>(s.questions||[]).forEach(checkQ));
  });
  (exam.horenParts||[]).forEach(p=>{
    (p.questions||[]).forEach(checkQ);
    (p.segments||[]).forEach(s=>(s.questions||[]).forEach(checkQ));
  });
  return bad;
}
window.examHasUnanswerableQuestions=examHasUnanswerableQuestions;
window.horenQuestionHasSubstance=horenQuestionHasSubstance;
function sanitizeExamText(text){
  if(text==null||typeof text!=='string')return'';
  return text.replace(/<br\s*\/?>/gi,'\n').replace(/\r\n/g,'\n');
}
function coalesceLesenPartQuestions(part){
  if(!part)return;
  const slot=String(part.blueprintSlot||'').toLowerCase();
  const existing=part.questions||[];
  const promoted=[];
  (part.items||[]).forEach((item,i)=>{
    const stem=item.question||item.statement;
    if(!stem)return;
    const rawType=String(item.type||'').toLowerCase();
    const forumLike=!!item.signText&&(slot.includes('forum')||slot.includes('opinion')||rawType==='ja_nein'||rawType==='yn');
    const matchingLike=!!item.signText&&(slot.includes('ads')||slot.includes('matching')||['matching','match','person_match','person_multi','abcd'].includes(rawType));
    if(forumLike||matchingLike){
      if(!item.type||item.type==='multiple'||item.type==='multiple_choice'){
        const c=String(item.correct??item.correctAnswer??'').trim();
        if(/^(J|N|Ja|Nein|Yes|No|Y)$/i.test(c))item.type='yn';
        else if(matchingLike)item.type=matchingLike&&rawType!=='multiple'?(rawType==='abcd'?'abcd':'matching'):'matching';
      }
      normalizeGoetheQuestion(item,part);
      return;
    }
    if(item.signText)return;
    const q={
      id:item.id||`l${part.teil||1}q${i+1}`,
      type:item.type,
      question:stem,
      correct:item.correct??item.correctAnswer,
      options:item.options,
    };
    if(slot.includes('richtig')||slot.includes('blog'))q.type='rf';
    if(!q.type||q.type==='multiple'||q.type==='multiple_choice'){
      const c=String(q.correct??'').trim();
      if(/^(R|F|Richtig|Falsch|True|False|W|T)$/i.test(c))q.type='rf';
      else if(/^(J|N|Ja|Nein|Yes|No|Y)$/i.test(c))q.type='yn';
      else if(slot.includes('richtig')||slot.includes('blog'))q.type='rf';
      else if(part.text||part.textTitle)q.type='rf';
    }
    normalizeGoetheQuestion(q,part);
    if(q.options?.length||q.type==='rf'||q.type==='yn'||q.type==='matching'||q.type==='abcd'){
      if(q.type==='matching'||q.type==='abcd')return;
      promoted.push(q);
    }
  });
  if(!promoted.length)return;
  part.questions=[...existing,...promoted];
  part.items=(part.items||[]).filter(item=>!(item.question||item.statement)||item.signText);
}
function isLesenAdsMatchingPart(part){
  if(!part)return false;
  const slot=String(part.blueprintSlot||part.slotType||'').toLowerCase();
  if(slot.includes('ads')||(slot.includes('matching')&&Number(part.teil)===3))return true;
  if(part.ads?.length)return true;
  const items=part.items||[];
  if(!items.length)return false;
  return items.some(it=>{
    const t=String(it.type||'').toLowerCase();
    const c=String(it.correct??'').trim();
    return t==='matching'||t==='match'||((it.signText||it.text)&&/^[A-J0]$/i.test(c));
  });
}
function normalizeLesenAdRecord(a,i,ADS){
  if(typeof a==='string'){
    const parsed=typeof AdsMatching!=='undefined'?AdsMatching.parseAdOptionLine(a):null;
    if(parsed)return parsed;
    return{key:ADS[i]||String(i+1),title:'',text:a.trim()};
  }
  if(!a||typeof a!=='object')return{key:ADS[i]||String(i+1),title:'',text:''};
  return{
    key:String(a.key??a.id??ADS[i]??i+1).trim().replace(/^\s*([a-zA-Z0-9]+)\)\s*/,'$1').toUpperCase(),
    title:String(a.title||a.headline||'').trim(),
    text:String(a.text||a.body||a.content||a.description||'').trim(),
  };
}
function coalesceLesenAdsMatching(part){
  if(!isLesenAdsMatchingPart(part))return;
  const ADS='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  part.blueprintSlot=part.blueprintSlot||'ads_matching';
  if(!part.ads?.length){
    for(const src of[part.advertisements,part.anzeigen,part.classifiedAds]){
      if(Array.isArray(src)&&src.length){
        part.ads=src.map((a,i)=>normalizeLesenAdRecord(a,i,ADS));
        break;
      }
    }
  }
  if(!part.ads?.length&&Array.isArray(part.options)&&part.options[0]&&typeof part.options[0]==='object'&&(part.options[0].text||part.options[0].title)){
    part.ads=part.options.map((a,i)=>normalizeLesenAdRecord(a,i,ADS));
  }
  if(typeof AdsMatching!=='undefined'){
    const pool=[...(part.questions||[]),...(part.items||[])];
    if(!part.ads?.length){
      const built=AdsMatching.buildAdsFromBankQuestions(pool);
      if(built.length>=3)part.ads=built;
    }
  }
  if(part.ads?.length){
    part.ads=part.ads
      .map((a,i)=>normalizeLesenAdRecord(a,i,ADS))
      .filter(a=>a.text||a.title)
      .map((a,i)=>({...a,key:ADS[i]||String(i+1)}));
  }
  const startNum=Number(part.teil)===3?13:1;
  (part.items||[]).forEach((item,i)=>{
    if(!item.signText&&!item.text&&item.question){
      const q=String(item.question).trim();
      if(q.length>15&&!/welche anzeige|which ad|qué anuncio|passende anzeige/i.test(q)){
        item.signText=q;
        item.question='';
      }
    }
    if(!item.signText&&item.text)item.signText=item.text;
    if(!item.id||/^l\d/i.test(String(item.id)))item.id=String(startNum+i);
    if(!item.type||item.type==='multiple'||item.type==='multiple_choice')item.type='matching';
    if(part.ads?.length)delete item.options;
  });
  if(part.items?.length){
    part.questions=(part.questions||[]).filter(q=>{
      const t=String(q?.type||'').toLowerCase();
      return!['matching','match','abcd'].includes(t);
    });
  }
  if(part.items?.length&&part.ads?.length){
    const start=part.items[0].id;
    const end=part.items[part.items.length-1].id;
    const adLo=String(part.ads[0].key).toLowerCase();
    const adHi=String(part.ads[part.ads.length-1].key).toLowerCase();
    part.instruction=
      `Lesen Sie die Situationen ${start} bis ${end} und die Anzeigen ${adLo} bis ${adHi}. `+
      'Welche Anzeige passt zu welcher Situation? Eine Anzeige passt nicht. '+
      'Wenn es keine passende Anzeige gibt, schreiben Sie 0.';
  }
  (part.items||[]).forEach(item=>normalizeGoetheQuestion(item,part));
}
function lesenPartMissingAds(part){
  return isLesenAdsMatchingPart(part)&&!(part.ads?.length>=2);
}
function normalizeHorenQuestionFields(q){
  if(!q||typeof q!=='object')return;
  if(!q.options&&Array.isArray(q.choices))q.options=q.choices;
  if(!q.question&&q.statement)q.question=q.statement;
  if(!q.question&&q.text)q.question=q.text;
  if(!q.question&&q.prompt)q.question=q.prompt;
}
function horenOptionHasSubstance(opt){
  if(opt==null)return false;
  if(typeof opt==='string'){
    const m=opt.match(/^([A-Za-z0-9]+)\)\s*(.*)$/s);
    const body=(m?m[2]:opt).trim();
    if(!body)return false;
    if(m&&body.toUpperCase()===m[1].toUpperCase())return false;
    return body.length>1&&!/^[A-D0]$/i.test(body);
  }
  if(typeof opt==='object'){
    const text=String(opt.text??opt.label??opt.option??'').trim();
    const key=String(opt.key??opt.id??'').trim().toUpperCase();
    if(!text)return false;
    if(key&&text.toUpperCase()===key)return false;
    if(/^[A-D0]$/i.test(text))return false;
    return true;
  }
  return false;
}
function horenQuestionHasSubstance(q){
  if(!q||typeof q!=='object')return false;
  const type=String(q.type||'multiple').toLowerCase();
  if(['rf','tf','richtig_falsch','true_false','yn','ja_nein','rfn','r_f_n'].includes(type)){
    return q.correct!=null&&q.correct!=='';
  }
  const opts=q.options||q.choices||[];
  const substantial=opts.filter(horenOptionHasSubstance);
  if(['matching','match','abcd'].includes(type)){
    const stem=String(q.question||q.statement||'').trim();
    if(!stem)return false;
    if(substantial.length>=1)return true;
    return opts.length>=2&&q.correct!=null&&q.correct!=='';
  }
  return substantial.length>=2;
}
function isKeyOnlyOptionList(options){
  if(!Array.isArray(options)||!options.length)return false;
  return options.every(o=>{
    const s=typeof o==='string'?o.trim():String(o?.key??o?.text??'').trim();
    return /^[A-JM0]$/i.test(s);
  });
}
function extractSpeakerNamesFromTranscript(transcript){
  const seen=new Set();
  const names=[];
  if(!transcript)return names;
  for(const line of String(transcript).split(/\n/)){
    const m=line.match(/^\s*([^:\n]{2,55}):\s+/);
    if(!m)continue;
    const name=m[1].trim();
    const dedupe=name.toLowerCase().replace(/\s+/g,' ');
    if(seen.has(dedupe))continue;
    seen.add(dedupe);
    names.push(name);
  }
  return names;
}
function collectOptionKeysFromQuestions(questions){
  const keys=new Set();
  for(const q of questions||[]){
    for(const o of q.options||[]){
      const k=typeof o==='string'?o.trim().toUpperCase():String(o?.key??'').trim().toUpperCase();
      if(/^[A-JM0]$/.test(k))keys.add(k);
    }
  }
  const order=['M','A','B','C','D','E','F','G','H','I','J','0'];
  return order.filter(k=>keys.has(k));
}
function buildHorenSpeakerMap(transcript,optionKeys,part,seg){
  const map=new Map();
  let names=[];
  const sp=seg?.speakers||part?.speakers;
  if(Array.isArray(sp)){
    names=sp.map(s=>typeof s==='string'?s:(s?.name||s?.label||'')).filter(Boolean);
  }
  if(!names.length)names=extractSpeakerNamesFromTranscript(transcript);
  if(!names.length)return map;
  const keys=optionKeys.length?optionKeys:['M','A','B'];
  const modIdx=names.findIndex(n=>/moderator/i.test(n));
  if(keys.includes('M')){
    map.set('M',modIdx>=0?names[modIdx]:'Moderator/in');
    const guests=names.filter((_,i)=>i!==modIdx);
    keys.filter(k=>k!=='M'&&k!=='0').forEach((k,i)=>{if(guests[i])map.set(k,guests[i]);});
  }else{
    keys.filter(k=>k!=='0').forEach((k,i)=>{if(names[i])map.set(k,names[i]);});
  }
  return map;
}
function enrichHorenSpeakerMatching(seg,part){
  if(!seg)return;
  const transcript=seg.transcript||part?.transcript||'';
  const questions=seg.questions||[];
  const needsEnrich=questions.some(q=>{
    const t=String(q.type||'').toLowerCase();
    return['matching','match','abcd','person_match'].includes(t)||isKeyOnlyOptionList(q.options);
  });
  if(!needsEnrich)return;
  const optionKeys=collectOptionKeysFromQuestions(questions);
  const speakerMap=buildHorenSpeakerMap(transcript,optionKeys,part,seg);
  if(!speakerMap.size)return;
  seg.speakerLegend=[...speakerMap.entries()].map(([k,name])=>`${k} = ${name}`);
  const ADS='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for(const q of questions){
    const opts=q.options||[];
    if(!opts.length)continue;
    if(!isKeyOnlyOptionList(opts)&&!['matching','match','abcd','person_match'].includes(String(q.type||'').toLowerCase()))continue;
    q.options=opts.map((o,i)=>{
      const key=typeof o==='string'?o.trim().toUpperCase():String(o?.key??ADS[i]??i).trim().toUpperCase();
      const labeled=speakerMap.get(key);
      const raw=typeof o==='object'?String(o.text??o.label??'').trim():'';
      const text=labeled||(raw&&raw.toUpperCase()!==key?raw:'');
      return{key,text:text||labeled||key};
    });
    q.type='matching';
    q._keyOnlyMatch=false;
  }
}
function coalesceHorenSegmentQuestions(seg,part){
  if(!seg)return;
  normalizeHorenQuestionFields(seg);
  if(seg.question&&!seg.questions?.length){
    seg.questions=[{
      id:seg.id||'hq1',
      type:seg.type||'multiple_choice',
      question:seg.question,
      options:seg.options||seg.choices,
      correct:seg.correct,
    }];
  }
  if(Array.isArray(seg.items)&&seg.items.length){
    if(!seg.questions)seg.questions=[];
    seg.items.forEach((item,i)=>{
      if(!item||typeof item!=='object')return;
      seg.questions.push({
        id:item.id||`hq${seg.questions.length+1}`,
        type:item.type,
        question:item.question||item.statement,
        options:item.options||item.choices,
        correct:item.correct??item.correctAnswer,
      });
    });
    delete seg.items;
  }
  enrichHorenSpeakerMatching(seg,part);
  seg.questions=(seg.questions||[]).map(q=>{
    normalizeHorenQuestionFields(q);
    if(!q.type||q.type==='multiple'||q.type==='multiple_choice'){
      const c=String(q.correct??'').trim();
      if(/^(R|F|Richtig|Falsch|True|False|W|T)$/i.test(c))q.type='rf';
      else if(/^(J|N|Ja|Nein|Yes|No|Y)$/i.test(c))q.type='yn';
      else if(isKeyOnlyOptionList(q.options))q.type='matching';
    }
    normalizeGoetheQuestion(q,part);
    if(q.type==='matching'&&!q._keyOnlyMatch&&isKeyOnlyOptionList(q.options)){
      enrichHorenSpeakerMatching(seg,part);
    }
    return q;
  }).filter(q=>horenQuestionHasSubstance(q));
}
function coalesceHorenPartSegments(part){
  if(!part)return;
  if(part.segments?.length){
    part.segments.forEach(seg=>coalesceHorenSegmentQuestions(seg,part));
    return;
  }
  const qs=(part.questions||[]).map(q=>({...q}));
  if(!qs.length&&!part.transcript)return;
  part.segments=[{
    label:part.context||'Aufnahme 1',
    transcript:part.transcript||part.audioScript||'',
    questions:qs,
  }];
  coalesceHorenSegmentQuestions(part.segments[0],part);
  delete part.questions;
  delete part.transcript;
  delete part.audioScript;
}
function sanitizeGoetheParts(d){
  const fixT=t=>typeof t==='string'?sanitizeExamText(t):t;
  const ADS='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  (d.lesenParts||[]).forEach((part,pi)=>{
    if(part.text)part.text=fixT(part.text);
    if(part.textTitle)part.textTitle=fixT(part.textTitle);
    if(part.textWithGaps)part.textWithGaps=part.textWithGaps.map(fixT);
    part.teil=part.teil??pi+1;
    coalesceLesenAdsMatching(part);
    if(part.ads)part.ads.forEach((a,i)=>{a.key=ADS[i]||String(i+1);if(!a.title)a.title='';if(!a.text)a.text='';a.title=fixT(a.title);a.text=fixT(a.text);});
    coalesceLesenPartQuestions(part);
    (part.options||[]).forEach(o=>{if(o.text)o.text=fixT(o.text);});
    (part.persons||[]).forEach(p=>{if(p.text)p.text=fixT(p.text);if(p.name)p.name=fixT(p.name);});
    (part.opinions||[]).forEach(o=>{if(o.text)o.text=fixT(o.text);if(o.name)o.name=fixT(o.name);});
    (part.items||[]).forEach(item=>{if(item.signText)item.signText=fixT(item.signText);if(item.text)item.text=fixT(item.text);if(item.type==='matching'||item.type==='match')normalizeGoetheQuestion(item,part);});
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
    coalesceHorenPartSegments(part);
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
      coalesceHorenSegmentQuestions(seg,part);
      (seg.questions||[]).forEach((q,qi)=>{if(!q.id)q.id=`h${pi+1}_${si+1}_${qi+1}`;});
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
  if(e.code==='ai_credits_exhausted'){
    if(typeof showAiCreditsExhausted==='function')showAiCreditsExhausted(e);
    else lcToast('Not enough AI credits for this exam (3 required).','warn',6000);
    return;
  }
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
      if(typeof normalizeExam==='function')S.examData=normalizeExam(S.examData);
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
    if(typeof normalizeExam==='function')S.examData=normalizeExam(S.examData);
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
      if(k==='targetUsage'&&Array.isArray(v)&&Array.isArray(merged[k]))merged[k]=[...merged[k],...v];
      else if(EXAM_PART_KEYS.includes(k)&&Array.isArray(v))merged[k]=[...(merged[k]||[]),...v];
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
function getGeneratorHooks(onStep,hookOpts){
  hookOpts=hookOpts||{};
  let ticketMaxChunks=8;
  let activeGenTicket=null;
  return{
    callAI,
    onStep:onStep||((msg)=>{
      const el=document.getElementById('loaderSub');
      if(el&&msg)el.textContent=msg;
    }),
    onChunkResult:hookOpts.onChunkResult||(()=>{}),
    parseExamJson,
    validateChunkObj,
    mergeExamParts,
    startExamTicket:async(scope,maxChunks)=>{
      ticketMaxChunks=maxChunks||ticketMaxChunks;
      activeGenTicket=await startExamGeneration(scope,maxChunks);
      if(typeof S!=='undefined')S._activeGenTicket=activeGenTicket;
      return activeGenTicket;
    },
    refreshExamTicket:async(_scope,_maxChunks)=>{
      if(!activeGenTicket)throw new Error('no active generation ticket');
      if(typeof renewExamGeneration==='function'){
        activeGenTicket=await renewExamGeneration(activeGenTicket);
      }
      if(typeof S!=='undefined')S._activeGenTicket=activeGenTicket;
      return activeGenTicket;
    },
    releaseExamGeneration,
    normalizeExam:typeof normalizeExam==='function'?normalizeExam:(x)=>x
  };
}
async function refundActiveGenTicket(){
  const ticket=(typeof S!=='undefined'&&S._activeGenTicket)||(S.examData&&S.examData._genTicket);
  if(!ticket||typeof releaseExamGeneration!=='function')return null;
  try{
    const rel=await releaseExamGeneration(ticket);
    if(typeof S!=='undefined'){
      S._activeGenTicket=null;
      if(S.examData)delete S.examData._genTicket;
    }
    return rel;
  }catch(err){
    lcDebug.warn('[personal] quota refund failed:',err);
    return null;
  }
}
const PERSONAL_MODULE_ORDER=['lesen','horen','schreiben','sprechen'];
function orderedPersonalSkills(skills){
  const set=new Set((skills||[]).map(s=>String(s).toLowerCase()));
  return PERSONAL_MODULE_ORDER.filter(s=>set.has(s));
}
function personalModuleLabel(skill,subject){
  const ui=typeof examUiStrings==='function'?examUiStrings(subject==='de'?'de':subject==='es'?'es':'en'):{reading:'Reading',listening:'Listening',writing:'Writing',speaking:'Speaking'};
  if(skill==='lesen')return ui.reading;
  if(skill==='horen')return ui.listening;
  if(skill==='schreiben')return ui.writing;
  if(skill==='sprechen')return ui.speaking;
  return skill;
}
function renderPersonalGenProgress(report){
  const el=document.getElementById('personalGenProgress');
  if(!el)return;
  if(!report||(!report.modules?.length&&!report.teile?.length)){
    el.style.display='none';
    el.innerHTML='';
    return;
  }
  el.style.display='block';
  const modLines=(report.modules||[]).map(m=>{
    const lbl=personalModuleLabel(m.skill,S.subject);
    const cls=m.ok?'ok':'fail';
    const note=m.ok?'✓':'✗ skipped';
    return `<li class="${cls}">${esc(lbl)} — ${note}</li>`;
  }).join('');
  const teileLines=(report.teile||[]).map(t=>{
    const cls=t.status==='ok'?'ok':'fail';
    const mark=t.status==='ok'?'✓':'✗';
    return `<li class="${cls}">${mark} ${esc(t.label)}</li>`;
  }).join('');
  el.innerHTML=`<ul class="personal-gen-progress__list">${modLines}${teileLines}</ul>`;
}
function updatePersonalLoader(moduleIdx,moduleTotal,moduleLabel,report){
  const title=document.getElementById('loaderTitle');
  const sub=document.getElementById('loaderSub');
  if(title)title.textContent=`Generating ${moduleLabel}… (${moduleIdx}/${moduleTotal})`;
  if(sub)sub.textContent='This may take ~1–2 min per module.';
  renderPersonalGenProgress(report);
}
function personalGenFailMessage(err){
  if(err?.quotaReleased){
    return 'No se pudo generar el examen. Tu crédito mensual se ha devuelto — no cuenta como examen generado.';
  }
  const modErr=err?.genReport?.modules?.find(m=>!m.ok)?.error;
  const detail=modErr||err?.message||'Generation failed';
  return `No se pudo generar el examen: ${detail}. Si tu cuota sigue descontada, recarga la página; debería haberse devuelto automáticamente.`;
}
function initPersonalGenReport(skills){
  return{skills:[...skills],modules:[],teile:[],failedModules:[],failedTeile:[],succeededTeile:[]};
}
function recordPersonalChunkResult(report,skill,chunkResult){
  if(!report||!chunkResult)return;
  report.teile.push({skill,label:chunkResult.label,status:chunkResult.status});
  if(chunkResult.status==='ok')report.succeededTeile.push(chunkResult.label);
  else report.failedTeile.push(chunkResult.label);
}
function storePersonalGenRetry(words,skills,goalId,exam,report){
  S.personalGenRetry={
    words:[...(words||[])],
    skills:[...(skills||[])],
    goalId:goalId||S.activeGoalId,
    partialExam:exam?JSON.parse(JSON.stringify(exam)):null,
    failedModules:[...(report?.failedModules||[])],
    failedTeile:[...(report?.failedTeile||[])],
    succeededTeile:[...(report?.succeededTeile||[])]
  };
}
async function generatePersonalExamAiSerial(configWords,configSkills,configGoalId,personalGenOpts,tier){
  let skills=orderedPersonalSkills(configSkills);
  if(skills.length>1){
    lcDebug.warn('[personal] multiple modules requested — using first only:',skills);
    skills=skills.slice(0,1);
  }
  if(!skills.length)throw new Error('No modules selected.');
  let accumulated=null;
  const report=initPersonalGenReport(skills);
  let anyQuotaReleased=false;
  let blueprint=personalGenOpts.blueprint;
  for(let i=0;i<skills.length;i++){
    const skill=skills[i];
    const label=personalModuleLabel(skill,S.subject);
    updatePersonalLoader(i+1,skills.length,label,report);
    if(i>0&&typeof canUseAiGeneration==='function'&&!canUseAiGeneration()){
      report.failedModules.push(skill);
      report.modules.push({skill,ok:false,error:'ai_credits_exhausted'});
      continue;
    }
    const hooks=getGeneratorHooks(
      (msg)=>{const el=document.getElementById('loaderSub');if(el&&msg)el.textContent=msg;},
      {onChunkResult:(r)=>recordPersonalChunkResult(report,skill,r)}
    );
    try{
      const exam=await LexiCoilEngine.generatePersonalExam(
        S.subject,S.level,configWords,[skill],hooks,{...personalGenOpts,blueprint}
      );
      if(exam._chunkMeta){
        report.succeededTeile.push(...(exam._chunkMeta.succeeded||[]));
        report.failedTeile.push(...(exam._chunkMeta.failed||[]));
      }
      report.modules.push({skill,ok:true});
      if(tier==='pro'){
        const dep=buildPoolExamCopy(exam,genericPoolTopic(S.subject,S.level));
        void contributeExamToStaging(S.subject,S.level,dep.topic,dep,{minCoverage:0,words:configWords});
      }
      const topic=accumulated?.topic||exam.topic||'Personal vocabulary review';
      accumulated=accumulated?mergeExamParts(accumulated,exam,topic):exam;
      if(exam._genTicket&&typeof S!=='undefined')S._activeGenTicket=exam._genTicket;
    }catch(modErr){
      if(modErr.quotaReleased)anyQuotaReleased=true;
      report.failedModules.push(skill);
      report.modules.push({skill,ok:false,error:modErr.message});
      if(modErr.chunkMeta?.failed)report.failedTeile.push(...modErr.chunkMeta.failed);
      lcDebug.warn('[personal] module failed:',skill,modErr);
    }
  }
  renderPersonalGenProgress(report);
  if(!accumulated){
    const rel=await refundActiveGenTicket();
    throw Object.assign(new Error('All selected modules failed to generate.'),{
      code:'all_modules_failed',
      genReport:report,
      quotaReleased:!!rel?.released||anyQuotaReleased
    });
  }
  accumulated.vocabSkills=configSkills;
  if(report.failedTeile.length||report.failedModules.length){
    accumulated._partialGen=true;
    accumulated._failedTeile=[...new Set(report.failedTeile)];
    accumulated._succeededTeile=[...new Set(report.succeededTeile)];
    accumulated._genReport=report;
  }
  return{exam:accumulated,source:'ai',genReport:report};
}
async function retryFailedPersonalParts(){
  const st=S.personalGenRetry;
  if(!st){lcToast('Nothing to retry.','warn');return;}
  if(!canGenerate()){showUpgrade();return;}
  const skills=st.failedModules.length
    ?st.failedModules
    :orderedPersonalSkills(st.skills).filter(s=>!(st.partialExam&&personalModuleHasContent(st.partialExam,s)));
  if(!skills.length){lcToast('All parts already generated.','info');return;}
  hideAll();show('loadingScreen');
  document.getElementById('loaderTitle').textContent='Retrying failed parts…';
  document.getElementById('loaderSub').textContent='This may take ~1–2 min per module.';
  try{
    const personalGenOpts={};
    if(typeof ExamBlueprint!=='undefined'){
      try{const bp=await ExamBlueprint.load(S.subject,S.level);if(bp)personalGenOpts.blueprint=bp;}catch(_){}
    }
    const built=await generatePersonalExamAiSerial(st.words,skills,st.goalId,personalGenOpts,'pro');
    let exam=built.exam;
    if(st.partialExam){
      exam=mergeExamParts(st.partialExam,built.exam,st.partialExam.topic||built.exam.topic);
      exam.vocabSkills=st.skills;
    }
    const goalRef=st.goalId?S.goals.find(g=>g.id===st.goalId):getActiveGoal();
    await finalizePersonalExam(st.words,st.skills,st.goalId,goalRef,exam,built.source);
  }catch(e){
    hideAll();
    if(e.code==='exam_invalid'&&e.answerKeyVerify){
      S.examData=null;
      goHome();
      lcToast('Answer-key verification failed. The AI exam was rejected and was not saved to the pool. Try generating again.','error',8000);
      return;
    }
    goHome();
    lcToast('Retry failed: '+e.message,'error',6000);
  }
}
function personalModuleHasContent(exam,skill){
  if(!exam)return false;
  const keys={
    lesen:['lesenParts','lesen'],
    horen:['horenParts','horen'],
    schreiben:['schreibenParts','schreiben'],
    sprechen:['sprechenParts','sprechen']
  }[skill]||[];
  return keys.some(k=>Array.isArray(exam[k])&&exam[k].length>0);
}
window.retryFailedPersonalParts=retryFailedPersonalParts;
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
    const fn=typeof lcApiFetch==='function'?lcApiFetch:fetch;
    const res=await fn('/.netlify/functions/claude-chat',{
      method:'POST',
      credentials:'include',
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
  const directPool=typeof directPoolContribEnabled==='function'&&directPoolContribEnabled();
  // Strategy-A direct mode: content enters the served pool without human review.
  // Structural validation still applies; moderation is a posteriori via admin (disable/delete).
  if(typeof S!=='undefined'&&S.examSource==='ai'&&!directPool){
    void contributeExamToStaging(lang,level,topic,exam,opts);
  }
  if(typeof lcStrategyBEnabled==='function'&&lcStrategyBEnabled()&&!directPool)return;
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
function logAiGeneration(payload){
  const fn=typeof lcApiFetch==='function'?lcApiFetch:fetch;
  void fn('/.netlify/functions/generation-log',{
    method:'POST',
    credentials:'include',
    headers:typeof aiAuthHeaders==='function'?aiAuthHeaders():{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  }).catch(()=>{});
}
window.logAiGeneration=logAiGeneration;
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
    if(typeof normalizeExam==='function')S.examData=normalizeExam(S.examData);
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
  if(typeof lcValidateExamOnServer==='function'&&!S.examData._partialGen){
    const srv=await lcValidateExamOnServer(S.examData,{verifyAnswerKeys:S.examSource==='ai'});
    if(!srv.valid){
      S.examData=null;
      throw Object.assign(
        new Error('AI answer-key verification failed. The exam was rejected.'),
        {code:'exam_invalid',answerKeyVerify:true}
      );
    }
  }
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
  if(source==='ai'){
    void logAiGeneration({
      lang:S.subject,level:S.level,source,topic:S.examData.topic,
      vocabWords:configWords,coverage:coverage.ratio,valid:true,examData:S.examData
    });
  }
  if(S.examData._partialGen){
    storePersonalGenRetry(configWords,configSkills,configGoalId,S.examData,S.examData._genReport);
    lcToast('Some parts could not be generated. You can retry failed parts from the banner.','warn',8000);
  }else{
    S.personalGenRetry=null;
  }
  renderExam();
  if(S.examData?.vocabPersonal){
    try{if(typeof autoSaveExam==='function')autoSaveExam();}catch(_){}
  }
  if(source==='ai'&&S.examData?._genTicket&&typeof deliverExamGeneration==='function'){
    try{
      await deliverExamGeneration(S.examData._genTicket);
    }catch(delErr){lcDebug.warn('[personal] deliverGeneration failed:',delErr);}
    delete S.examData._genTicket;
    if(typeof S!=='undefined')S._activeGenTicket=null;
  }
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
    configSkills=goalRef.vocabPlan.skills||configSkills||['lesen'];
    S.subject=goalRef.subject;S.level=goalRef.level;S.activeGoalId=goalRef.id;syncGoalToProfile(goalRef);
  }else   if(!configWords){
    const cards=getSelectedFC();
    if(cards.length<2){lcToast('Select at least 2 words.','warn');return;}
    const langs=[...new Set(cards.map(c=>c.sourceLang).filter(l=>l==='de'||l==='en'||l==='es'))];
    if(langs.length>1){lcToast('Select words from one language only.','warn');return;}
    S.subject=langs[0]||'de';
    S.level=document.getElementById('fcPersonalLevel')?.value||inferLevelFromCards(cards)||'B1';
    configWords=cards.map(c=>c.word);
    configSkills=['lesen'];
  }else{
    const goal=configGoalId?S.goals.find(g=>g.id===configGoalId):getActiveGoal();
    if(goal){S.subject=goal.subject;S.level=goal.level;S.activeGoalId=goal.id;syncGoalToProfile(goal);}
  }
  configSkills=orderedPersonalSkills(configSkills||['lesen']);
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
  const moduleCount=configSkills.length;
  document.getElementById('loaderTitle').textContent=moduleCount>1
    ?`Generating ${personalModuleLabel(configSkills[0],S.subject)}… (1/${moduleCount})`
    :'Building your personal mock exam…';
  document.getElementById('loaderSub').textContent='This may take ~1–2 min per module.';
  renderPersonalGenProgress(initPersonalGenReport(configSkills));
  try{
    let built=null;
    if(tier==='pro'){
      try{
        if(!engineReady())throw new Error('Content engine not loaded');
        const personalGenOpts={};
        if(typeof ExamBlueprint!=='undefined'){
          try{
            const bp=await ExamBlueprint.load(S.subject,S.level);
            if(bp)personalGenOpts.blueprint=bp;
          }catch(bpErr){lcDebug.warn('[personal] blueprint preload failed:',bpErr);}
        }
        built=await generatePersonalExamAiSerial(configWords,configSkills,configGoalId,personalGenOpts,tier);
      }catch(aiErr){
        const canFallbackLibrary=
          aiErr.code==='ai_credits_exhausted'||
          aiErr.code==='exam_invalid'||
          aiErr.code==='all_modules_failed'||
          /failed validation/i.test(String(aiErr.message||''));
        if(canFallbackLibrary){
          if(aiErr.code==='all_modules_failed'){
            hideAll();
            goHome();
            lcToast(personalGenFailMessage(aiErr),'error',8000);
            return;
          }
          if(aiErr.code==='ai_credits_exhausted'&&typeof showAiCreditsExhausted==='function'){
            showAiCreditsExhausted(aiErr.autoRechargeFailed?{autoRechargeFailed:true,reason:aiErr.reason}:undefined);
          }else if(aiErr.code==='exam_invalid'){
            lcDebug.warn('[personal] AI exam invalid, trying library fallback:',aiErr.message);
          }
          built=await tryPersonalPoolOrLibrary(configWords,configSkills,configGoalId,goalRef);
          if(!built){
            if(aiErr.code==='ai_credits_exhausted'){
              hideAll();
              if(_examConfig.goalId){show('examConfigScreen');showExamConfigFootbar(true);renderExamConfigurator();}
              else show('flashcardScreen');
              return;
            }
            throw aiErr;
          }
          if(aiErr.code==='exam_invalid'){
            lcToast('AI exam could not be validated; assembled from the question library instead.','warn',7000);
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
    if(tier==='pro'){
      void logAiGeneration({
        lang:S.subject,level:S.level,source:'ai',topic:null,
        vocabWords:configWords||[],coverage:null,valid:false,examData:null
      });
    }
    const rel=await refundActiveGenTicket();
    if(rel?.released)e.quotaReleased=true;
    hideAll();
    if(e.code==='all_modules_failed'||e.code==='quota_insufficient_modules'){
      goHome();
      lcToast(
        e.code==='all_modules_failed'?personalGenFailMessage(e):e.message,
        'error',
        8000
      );
      return;
    }
    if(e.code==='exam_invalid'&&e.answerKeyVerify){
      S.examData=null;
      goHome();
      lcToast(e.quotaReleased
        ? 'Answer-key verification failed. Your exam credit was refunded.'
        : 'Answer-key verification failed. The AI exam was rejected and was not saved to the pool. Try generating again.','error',8000);
      return;
    }
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
