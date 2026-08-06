// ═══════════════════════════════════════════
// FLASHCARDS
// ═══════════════════════════════════════════
// C-1 fix: local esc for user-controlled content (word/translation/example)
function _fcEsc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
/** Normalize legacy/sync flashcards (translation string → translations map). */
function normalizeFlashcard(fc){
  if(!fc||typeof fc!=='object')return fc;
  if(!fc.sourceLang&&fc.lang)fc.sourceLang=fc.lang;
  if(!fc.sourceLevel&&fc.sourceExam?.level)fc.sourceLevel=String(fc.sourceExam.level).toUpperCase();
  if(!fc.translations||typeof fc.translations!=='object')fc.translations={};
  const lang=(typeof translationLang==='function'?translationLang():S?.fcLang)||'en';
  if(typeof fc.translation==='string'&&fc.translation.trim()){
    if(!fc.translations.en)fc.translations.en=fc.translation.trim();
    if(lang==='en'&&!fc.translations.en)fc.translations.en=fc.translation.trim();
  }
  if(lang==='en'&&typeof fc.meaning==='string'&&fc.meaning.trim()&&!fc.translations.en){
    fc.translations.en=fc.meaning.trim();
  }
  ['es','fr','it'].forEach((code)=>{
    const en=fc.translations?.en||fc.translation;
    const v=fc.translations?.[code];
    if(v&&en&&String(v).trim().toLowerCase()===String(en).trim().toLowerCase())delete fc.translations[code];
  });
  if(!fc.examples||typeof fc.examples!=='object')fc.examples={};
  if(typeof fc.context==='string'&&fc.context.trim()&&!Object.values(fc.examples).some(Boolean)){
    fc.examples[lang]=fc.context.trim();
  }
  return fc;
}
function fcUiTranslationLang(){
  if(typeof resolveActiveVocabUiLang==='function')return resolveActiveVocabUiLang();
  if(typeof translationLang==='function')return translationLang();
  return S.fcLang||'en';
}
function fcCardTranslation(fc,langCode){
  if(!fc)return'—';
  normalizeFlashcard(fc);
  const code=(langCode||fcUiTranslationLang()||'en').toLowerCase().slice(0,2);
  const tr=fc.translations;
  let val=tr?.[code];
  if(val==null||!String(val).trim()){
    val=undefined;
  }
  if(val!=null&&String(val).trim())return String(val).trim();
  if(code==='en'){
    if(typeof fc.translation==='string'&&fc.translation.trim())return fc.translation.trim();
    if(typeof fc.meaning==='string'&&fc.meaning.trim())return fc.meaning.trim();
    val=tr?.en;
    if(val!=null&&String(val).trim())return String(val).trim();
  }
  const subject=fc.sourceLang||fc.lang||S.subject||'de';
  const ck=`${fc.word}_${subject}_${code}`;
  const cached=S.vocabCache?.[ck];
  if(cached){
    const t=cached[`translation_${code}`]||(code==='en'?cached.definition_en||cached.translation_en:null);
    if(t&&String(t).trim())return String(t).trim();
  }
  return '—';
}
function applyLookupDataToFc(fc,data,lang,subject){
  if(!fc||!data)return;
  normalizeFlashcard(fc);
  const code=lang||fcUiTranslationLang();
  const isEnDef=subject==='en'&&code==='en';
  const t=isEnDef
    ?(data.definition_en||data.translation_en||data.translation)
    :(data[`translation_${code}`]||(code==='en'?(data.translation_en||data.translation):null)||(code==='es'?data.translation_es:null)||(code==='fr'?data.translation_fr:null)||(code==='it'?data.translation_it:null));
  if(t&&String(t).trim())fc.translations[code]=String(t).trim();
  if(data.definition_en&&!fc.translations.en)fc.translations.en=String(data.definition_en).trim();
  if(data.translation_en&&!fc.translations.en)fc.translations.en=String(data.translation_en).trim();
  if(data.translation_es&&!fc.translations.es)fc.translations.es=String(data.translation_es).trim();
}
async function enrichFlashcardTranslations(fc){
  if(!fc)return false;
  normalizeFlashcard(fc);
  const goal=typeof getActiveGoal==='function'?getActiveGoal():null;
  const subject=fc.sourceLang||goal?.subject||S.deckGoalFilter||S.subject||'de';
  const level=goal?.level||S.level||'B1';
  const lang=fcUiTranslationLang();
  const word=String(fc.word||'').trim();
  if(!word)return false;
  const ck=`${word}_${subject}_${lang}`;
  const hasForLang=()=>{
    const t=fc.translations?.[lang];
    return t!=null&&String(t).trim();
  };
  if(hasForLang())return true;
  if(S.vocabCache?.[ck]){
    applyLookupDataToFc(fc,S.vocabCache[ck],lang,subject);
    if(hasForLang())return true;
  }
  if(typeof PracticeDictionary!=='undefined'){
    try{
      const dict=await PracticeDictionary.lookup(word,subject,level,lang);
      if(dict){applyLookupDataToFc(fc,dict,lang,subject);if(hasForLang())return true;}
    }catch(_){}
  }
  if(typeof ManualVocab!=='undefined'){
    try{
      const r=await ManualVocab.validate(word,subject,level,lang);
      if(r?.ok&&r.entry&&ManualVocab.buildTranslations){
        Object.assign(fc.translations,ManualVocab.buildTranslations(r.entry,subject,lang));
        if(hasForLang())return true;
      }
    }catch(_){}
  }
  if(typeof fetchVocabCache==='function'){
    try{
      const example=fc.examples?.[lang]||fc.context||'';
      const hit=await fetchVocabCache(subject,lang,word,example);
      if(hit?.translation){
        fc.translations[lang]=String(hit.translation).trim();
        const cachePatch={...(S.vocabCache[ck]||{}),[`translation_${lang}`]:hit.translation};
        if(lang==='en')cachePatch.definition_en=hit.translation;
        S.vocabCache[ck]=cachePatch;
        if(hasForLang())return true;
      }
    }catch(_){}
  }
  return hasForLang();
}
async function enrichFlashcardsForQuiz(cards){
  await Promise.all((cards||[]).map(fc=>enrichFlashcardTranslations(fc)));
}
/** Legacy: translation-based MCQ distractors (pre–AI word-pick quiz). Not used; see vocabQuizUtils + server repairQuizOptions. */
function buildVocabQuizOptions(correctFc,pool){
  const tr=fcCardTranslation(correctFc);
  if(!tr||tr==='—')return null;
  const distractors=[];
  const seen=new Set([tr.toLowerCase()]);
  const shuffled=[...(pool||[])].sort(()=>Math.random()-0.5);
  for(const f of shuffled){
    if(f===correctFc)continue;
    const t=fcCardTranslation(f);
    if(!t||t==='—')continue;
    const key=t.toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);
    distractors.push(t);
    if(distractors.length>=3)break;
  }
  if(distractors.length<3)return null;
  return [tr,...distractors].sort(()=>Math.random()-0.5);
}
function countUniqueFcTranslations(cards){
  const seen=new Set();
  (cards||[]).forEach(f=>{
    const t=fcCardTranslation(f);
    if(t&&t!=='—')seen.add(t.toLowerCase());
  });
  return seen.size;
}
function fcIsReverse(){return!!S.fcReverse;}
function fcDirectionLabels(subject){
  const sub=subject||S.subject||'de';
  const tgt=(fcUiTranslationLang()||'en').toUpperCase();
  const src=sub==='de'?'DE':sub==='es'?'ES':sub==='en'?'EN':'A';
  return{forward:src+'→'+tgt,reverse:tgt+'→'+src};
}
function fcTtsLangForCode(code){
  const c=String(code||'en').toLowerCase();
  if(c==='de')return'de-DE';
  if(c==='es')return'es-ES';
  return'en-GB';
}
/** Single source of truth: which face is front/back for display + TTS (SRS unchanged on fc object). */
function fcCardFaces(fc,subject){
  normalizeFlashcard(fc);
  const sub=subject||fc.sourceLang||S.subject||'de';
  const tr=fcCardTranslation(fc);
  const tb=typeof typeBadge==='function'?typeBadge(normWordType(fc.type||fc.pos)):'';
  const wordHtml=typeof fcWordDisplayHtml==='function'?fcWordDisplayHtml(fc,sub):_fcEsc(fc.word);
  const speakWord=typeof fcSpeakPhrase==='function'?fcSpeakPhrase(fc,sub):String(fc.word||'');
  const trLang=fcUiTranslationLang();
  const sourceFace={html:wordHtml,speak:speakWord,ttsLang:fcTtsLangForCode(sub),typeBadge:tb,isWord:true};
  const transFace={html:_fcEsc(tr),speak:tr,ttsLang:fcTtsLangForCode(trLang),typeBadge:'',isWord:false};
  const rev=fcIsReverse();
  return{
    front:rev?transFace:sourceFace,
    back:rev?sourceFace:transFace,
    reverse:rev,
    subject:sub,
    translation:tr,
    example:fcCardExample(fc),
  };
}
function fcFlipHint(faces){
  const vt=typeof vocabT==='function'?vocabT():null;
  if(faces.reverse){
    const langName=faces.subject==='de'?'German':faces.subject==='es'?'Spanish':'English';
    return vt?(vt.tapFlipWord?vt.tapFlipWord(langName):'Tap card for '+langName):'Tap card for '+langName;
  }
  return vt?vt.tapFlip:'Tap card for translation';
}
function fcDirectionBarHtml(subject){
  const sub=subject||(typeof getActiveGoal==='function'?getActiveGoal()?.subject:null)||S.deckGoalFilter||S.subject||'de';
  const labels=fcDirectionLabels(sub);
  const rev=fcIsReverse();
  return'<div class="fc-dir-bar"><span class="fc-lang-label">Direction</span><div class="fc-lang-btns"><button type="button" class="vt-lb fc-dir-btn'+(rev?'':' active')+'" onclick="setFcReverse(false,this)">'+labels.forward+'</button><button type="button" class="vt-lb fc-dir-btn'+(rev?' active':'')+'" onclick="setFcReverse(true,this)">'+labels.reverse+'</button></div></div>';
}
function setFcReverse(reverse,btn){
  S.fcReverse=!!reverse;
  S.fcSingleFlipped=false;
  try{localStorage.setItem('lc_fc_reverse',S.fcReverse?'1':'0');}catch(_){}
  const sub=(typeof getActiveGoal==='function'?getActiveGoal()?.subject:null)||S.deckGoalFilter||S.subject||'de';
  const labels=fcDirectionLabels(sub);
  document.querySelectorAll('.fc-dir-btn').forEach(b=>{
    b.classList.toggle('active',S.fcReverse?b.textContent===labels.reverse:b.textContent===labels.forward);
  });
  if(typeof _vocabHub!=='undefined'&&_vocabHub.activity==='flashcards')renderFcSingleView();
  else renderFC(false);
}
function mountFcDirectionBar(subject){
  const html=fcDirectionBarHtml(subject);
  const ids=['fcDirBar','vvFcDirBar'];
  ids.forEach(id=>{
    let el=document.getElementById(id);
    if(el)el.innerHTML=html;
  });
}
function fcCardExample(fc,langCode){
  if(!fc)return'';
  normalizeFlashcard(fc);
  const code=langCode||(typeof translationLang==='function'?translationLang():S.fcLang)||'en';
  const ex=fc.examples;
  const val=ex?.[code]||Object.values(ex||{}).find(v=>v!=null&&String(v).trim());
  return val!=null?String(val).trim():'';
}
function getSRS(fc,q){const ef=fc.ef||2.5;let iv=fc.interval||1;if(q===0)iv=1;else if(q===1)iv=Math.max(1,Math.round(iv*.5));else if(q===2)iv=iv<=1?3:Math.round(iv*ef);else iv=Math.round(iv*ef*1.3);const nef=Math.max(1.3,ef+(0.1-(3-q)*(0.08+(3-q)*0.02)));return{interval:iv,ef:nef,nextReview:Date.now()+iv*24*60*60*1000};}
function srsRate(i,q){const fc=S.flashcards[i];if(!fc)return;const r=getSRS(fc,q);fc.interval=r.interval;fc.ef=r.ef;fc.nextReview=r.nextReview;saveFC();}
function fcEvidence(fc){
  if(fc.manual)return 'Added manually';
  if(fc.sourceExam){
    const cert=typeof SubjectMeta!=='undefined'?SubjectMeta.get(fc.sourceLang||'en').cert:(fc.sourceLang==='de'?'Goethe':fc.sourceLang==='es'?'DELE':'Cambridge');
    const topic=fc.sourceExam.topic?` · ${fc.sourceExam.topic}`:'';
    return `From ${cert} ${fc.sourceExam.level}${topic}`;
  }
  return 'From practice';
}
function fcMissLabel(fc){
  const n=fc.missCount||1;
  if(n>1)return `Missed ${n} times`;
  if(fc.interval&&fc.interval>7)return 'Mastered';
  if(isDue(fc))return 'Due for review';
  return 'New';
}
function removeSavedWordFromDeck(word){
  const lvl=String(S.level||'').toUpperCase();
  const i=S.flashcards.findIndex(f=>(f.word===word||f.surface===word)&&f.sourceLang===S.subject&&fcSourceLevel(f)===lvl);
  if(i<0)return false;
  const fc=S.flashcards[i];
  if(fc?.word){
    const sourceLang=fc.sourceLang||fc.lang||'';
    const key=`${String(fc.word).toLowerCase().trim()}|${sourceLang}`;
    if(!Array.isArray(S.deletedFlashcards))S.deletedFlashcards=[];
    S.deletedFlashcards.push({key,deletedAt:Date.now()});
    try{localStorage.setItem('lc_fc_del',JSON.stringify(S.deletedFlashcards));}catch(_){}
  }
  S.flashcards.splice(i,1);
  if(Array.isArray(S.examSavedWords))S.examSavedWords=S.examSavedWords.filter(w=>w!==word&&w!==fc?.word&&w!==fc?.surface);
  saveFC();
  if(typeof updBadges==='function')updBadges();
  const dc=document.getElementById('dkCnt');
  if(dc)dc.textContent=getProfileFlashcards().length;
  return true;
}
function saveToFCData(data){
  const word=data.word||'';
  if(!word)return false;
  const goal=typeof getActiveGoal==='function'?getActiveGoal():null;
  const sourceExam=S.examData?{id:S.examData._savedId||S.examData.id||Date.now(),topic:S.examData.topic,level:S.examData.level,lang:S.examData.lang}:null;
  const sourceLang=goal?.subject||S.subject;
  const sourceLevel=String(goal?.level||S.level||sourceExam?.level||'').toUpperCase();
  const clearFcTombstone=()=>{
    const key=`${String(word).toLowerCase().trim()}|${sourceLang}`;
    if(!Array.isArray(S.deletedFlashcards))S.deletedFlashcards=[];
    const next=S.deletedFlashcards.filter((t)=>t?.key!==key);
    if(next.length!==S.deletedFlashcards.length){
      S.deletedFlashcards=next;
      try{localStorage.setItem('lc_fc_del',JSON.stringify(S.deletedFlashcards));}catch(_){}
    }
  };
  if(isWordSaved(word)||(data.surface&&isWordSaved(data.surface))){
    const existing=S.flashcards.find(f=>(f.word===word||f.surface===word||(data.surface&&(f.word===data.surface||f.surface===data.surface)))&&f.sourceLang===sourceLang&&fcSourceLevel(f)===sourceLevel);
    if(existing){existing.missCount=(existing.missCount||1)+1;clearFcTombstone();saveFC();}
    if(!S.examSavedWords)S.examSavedWords=[];
    if(!S.examSavedWords.includes(word))S.examSavedWords.push(word);
    markVocabSaved(data.surface||word,existing?.type||existing?.pos||data.type||data.pos,data.pairId);
    const b=document.getElementById('vtSave');
    if(b){b.textContent='\u2713 In your deck';b.classList.add('saved');}
    return false;
  }
  const tr={},ex={};
  const uiLang=typeof resolveActiveVocabUiLang==='function'?resolveActiveVocabUiLang():(typeof translationLang==='function'?translationLang():S.vocabLang);
  LANGS.forEach(l=>{
    const ck=`${word}_${sourceLang}_${l.code}`;
    const c=S.vocabCache?.[ck];
    if(!c)return;
    if(l.code==='en'){
      const en=c.definition_en||c.translation_en||c.translation;
      if(en&&String(en).trim())tr.en=String(en).trim();
    }else{
      const specific=c[`translation_${l.code}`]||(l.code==='es'?c.translation_es:null)||(l.code==='fr'?c.translation_fr:null)||(l.code==='it'?c.translation_it:null);
      if(specific&&String(specific).trim())tr[l.code]=String(specific).trim();
    }
    ex[l.code]=c[`example_${l.code}`]||'';
  });
  tr[uiLang]=data[`translation_${uiLang}`]||data.translation||'';
  if(data.translation_en)tr.en=data.translation_en;
  if(data.translation_es)tr.es=data.translation_es;
  if(data.translation_fr)tr.fr=data.translation_fr;
  if(data.translation_it)tr.it=data.translation_it;
  if(data.definition_en&&!tr.en)tr.en=data.definition_en;
  ex[uiLang]=data[`example_${uiLang}`]||'';
  const wtype=typeof normWordType==='function'?normWordType(data.type||data.pos):'';
  const fc={id:'fc_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9),word,phonetic:data.phonetic||'',pos:data.pos||data.type||'',type:wtype,translations:tr,examples:ex,sourceLang,sourceLevel,sourceExam,savedAt:Date.now(),interval:1,ef:2.5,nextReview:null,missCount:1};
  if(data.gender)fc.gender=data.gender;
  if(data.article)fc.article=data.article;
  if(data.surface)fc.surface=data.surface;
  if(data.reunified)fc.reunified=true;
  if(data.lemmaUncertain)fc.lemmaUncertain=true;
  if(data.pairId)fc.pairId=data.pairId;
  if(typeof ManualVocab!=='undefined'&&ManualVocab.enrichFlashcard)ManualVocab.enrichFlashcard(fc,S.subject);
  if(typeof ExamProfile!=='undefined')ExamProfile.tagItem(fc);
  S.flashcards.push(fc);
  if(!S.examSavedWords)S.examSavedWords=[];
  if(!S.examSavedWords.includes(word))S.examSavedWords.push(word);
  if(typeof sortFlashcardsByType==='function')S.flashcards=sortFlashcardsByType(S.flashcards);
  clearFcTombstone();
  saveFC();
  markVocabSaved(data.surface||word,fc.type||fc.pos||wtype,data.pairId);
  const b=document.getElementById('vtSave');
  if(b){b.textContent='\u2713 In your deck';b.classList.add('saved');}
  const dc=document.getElementById('dkCnt');
  if(dc)dc.textContent=getProfileFlashcards().length;
  return true;
}
function saveToFC(enc){let data;try{data=JSON.parse(decodeURIComponent(enc));}catch(e){return;}saveToFCData(data);}
const _manualAdd={pending:null,context:null};
function manualAddEls(context){
  if(context==='hub')return{w:'vvAddWord',t:'vvAddTrans',h:'vvAddHint'};
  return{w:'fcAddW',t:'fcAddT',h:'fcAddHint'};
}
function showManualAddHint(context,html){
  const el=document.getElementById(manualAddEls(context).h);
  if(!el)return;
  el.innerHTML=html||'';
  el.style.display=html?'block':'none';
}
function clearManualAddHint(context){
  if(_manualAdd.context===context)_manualAdd.pending=null;
  showManualAddHint(context,'');
}
function useManualSuggestion(context){
  const els=manualAddEls(context);
  if(_manualAdd.pending){
    const wi=document.getElementById(els.w);
    if(wi)wi.value=_manualAdd.pending;
  }
  clearManualAddHint(context);
  void submitManualVocab(context);
}
async function submitManualVocab(context){
  const els=manualAddEls(context);
  const we=document.getElementById(els.w);
  const te=document.getElementById(els.t);
  const word=we?.value.trim();
  const trans=te?.value.trim();
  if(!word){we?.focus();return;}
  const goal=context==='hub'?getActiveGoal():null;
  const subject=goal?.subject||S.deckGoalFilter||S.subject||'de';
  const level=goal?.level||S.level||'B1';
  const targetLang=S.fcLang||'en';
  if(typeof ManualVocab==='undefined'){
    lcToast('Word validation is not available.','error');
    return;
  }
  if(ManualVocab.isDuplicate(word,subject,level)){
    lcToast('"'+word+'" is already in your deck.','warn');
    return;
  }
  clearManualAddHint(context);
  const result=await ManualVocab.validate(word,subject,level,targetLang);
  let useFreeform=!!result.freeform;
  if(!result.ok){
    if(result.reason==='spelling'&&result.suggestion){
      _manualAdd.pending=result.suggestion;
      _manualAdd.context=context;
      showManualAddHint(context,'Did you mean <button type="button" class="vv-add-fix" onclick="useManualSuggestion(\''+context+'\')"><b>'+esc(result.suggestion)+'</b></button>?');
      lcToast('Check the spelling — tap the suggested word to use it.','warn');
      return;
    }
    if(result.reason==='not_in_library'){
      if(!trans){
        showManualAddHint(context,'Not in the '+esc(goalLabel({subject,level}))+' word list. Add a translation below, or fix the spelling.');
        te?.focus();
        lcToast('Add a translation, or correct the spelling.','warn');
        return;
      }
      useFreeform=true;
    }else{
      lcToast('Enter at least 2 characters.','warn');
      return;
    }
  }
  let fc;
  if(useFreeform){
    if(!trans){te?.focus();lcToast('Add a translation for words outside the library.','warn');return;}
    fc=ManualVocab.freeformFlashcard(result.canonical||word,subject,targetLang,trans,level);
  }else{
    fc=ManualVocab.entryToFlashcard(result.entry,subject,targetLang,trans,level);
  }
  if(!fc.sourceLevel&&level)fc.sourceLevel=String(level).toUpperCase();
  if(typeof ManualVocab!=='undefined'&&ManualVocab.enrichGenderAiFallback){
    await ManualVocab.enrichGenderAiFallback(fc,subject);
  }
  S.flashcards.push(fc);
  if(typeof sortFlashcardsByType==='function')S.flashcards=sortFlashcardsByType(S.flashcards);
  saveFC();
  if(we)we.value='';
  if(te)te.value='';
  clearManualAddHint(context);
  const typeLbl=typeof fcTypeSectionLabel==='function'?fcTypeSectionLabel(normWordType(fc.type||fc.pos)):'your deck';
  lcToast('Added to '+typeLbl+': '+fc.word,'success');
  if(context==='hub'){
    const g=goal||getActiveGoal();
    if(g)_vocabHub.selectedIds.add(fcId(fc));
    refreshVocabHubPanel();
  }else{
    renderDeckHub();
  }
}
function addManual(){void submitManualVocab('deck');}
function setFcTypeFilter(type,btn){S.fcTypeFilter=type;S.fcSingleIdx=0;S.fcSingleFlipped=false;document.querySelectorAll('.fc-type-filter').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');renderFC(false);}
function setFcTab(tab){S.fcTab=tab;S.fcSingleIdx=0;S.fcSingleFlipped=false;['all','due','study'].forEach(t=>{const el=document.getElementById('fcTab'+t.charAt(0).toUpperCase()+t.slice(1));if(el)el.classList.toggle('active',t===tab);});if(S.deckGoalFilter&&typeof renderDeckHub==='function'){renderDeckHub();return;}if(tab==='study'&&!S.deckGoalFilter)renderStudy();else renderFC(false);}
function fcSingleCards(){
  let cards;
  const inVocab=typeof _vocabHub!=='undefined'&&_vocabHub.activity==='flashcards';
  const hubPick=inVocab&&S.fcSelected&&S.fcSelected.size>0;
  if(inVocab||(typeof _vocabHub!=='undefined'&&_vocabHub.flashcardMode&&S.fcSelected.size)){
    const goal=(typeof _vocabHub!=='undefined'&&_vocabHub.goalId?S.goals.find(g=>g.id===_vocabHub.goalId):null)||getActiveGoal();
    cards=goal?deckForGoal(goal):getDeckViewCards();
    if(S.fcSelected.size)cards=cards.filter(f=>S.fcSelected.has(fcId(f)));
  }else{
    cards=getDeckViewCards();
  }
  if(hubPick){
    if(typeof VocabQuizUtils!=='undefined'&&VocabQuizUtils.sortCardsByWeakness){
      cards=VocabQuizUtils.sortCardsByWeakness(cards);
    }else{
      const due=cards.filter(f=>isDue(f));
      const rest=cards.filter(f=>!isDue(f));
      cards=[...due,...rest];
    }
  }else if(S.fcTab==='due'){
    cards=cards.filter(f=>isDue(f));
  }else if(S.fcTab==='study'){
    const dueCards=cards.filter(f=>isDue(f));
    cards=dueCards.length?dueCards:cards;
  }
  if(!hubPick&&(S.fcTab==='study'||S.fcTab==='due')&&typeof VocabQuizUtils!=='undefined'&&VocabQuizUtils.sortCardsByWeakness){
    cards=VocabQuizUtils.sortCardsByWeakness(cards);
  }else if(!hubPick&&typeof sortFlashcardsByType==='function'&&(!S.fcTypeFilter||S.fcTypeFilter==='all')){
    cards=sortFlashcardsByType(cards);
  }
  if(typeof filterCardsByType==='function')cards=filterCardsByType(cards);
  return cards;
}
function toggleFcSingleFlip(){
  const el=document.getElementById('fcSingleInner');
  if(el)el.classList.toggle('flipped');
  S.fcSingleFlipped=!!(el&&el.classList.contains('flipped'));
  if(S.fcSingleFlipped&&typeof enrichFlashcardTranslationsForUiLang==='function'){
    void enrichFlashcardTranslationsForUiLang();
  }
}
function enrichFlashcardTranslationsForUiLang(){
  const inHubFc=typeof _vocabHub!=='undefined'&&_vocabHub.activity==='flashcards';
  let cards;
  if(inHubFc&&typeof fcSingleCards==='function'){
    cards=fcSingleCards();
  }else if(typeof getDeckViewCards==='function'){
    cards=getDeckViewCards();
  }else{
    cards=S.flashcards||[];
  }
  const lang=fcUiTranslationLang();
  const idx=S.fcSingleIdx;
  const focused=typeof idx==='number'&&cards[idx]?[cards[idx]]:(cards||[]).filter((fc)=>{
    normalizeFlashcard(fc);
    const t=fc.translations?.[lang];
    return !t||!String(t).trim();
  });
  if(!focused.length){
    if(typeof renderFC==='function'&&document.getElementById('flashcardScreen')?.style.display!=='none')renderFC(false);
    return Promise.resolve();
  }
  return Promise.all(focused.map((fc)=>enrichFlashcardTranslations(fc))).then((results)=>{
    if(results.some(Boolean)&&typeof saveFC==='function')saveFC();
    if(typeof renderFcSingleView==='function'&&(S.deckGoalFilter||inHubFc))renderFcSingleView();
    else if(typeof renderFC==='function')renderFC(false);
  });
}
async function refreshFlashcardTranslationsForUiLang(){
  await enrichFlashcardTranslationsForUiLang();
}
function fcSinglePrev(){
  if((S.fcSingleIdx||0)>0){S.fcSingleIdx--;S.fcSingleFlipped=false;renderFcSingleView();}
}
function fcSingleNext(max){
  if((S.fcSingleIdx||0)<max-1){S.fcSingleIdx++;S.fcSingleFlipped=false;renderFcSingleView();}
}
function fcSingleSrs(fci){
  const q=arguments.length>1?arguments[1]:2;
  srsRate(fci,q);
  const cards=fcSingleCards();
  if((S.fcSingleIdx||0)<cards.length-1)S.fcSingleIdx++;
  S.fcSingleFlipped=false;
  renderFcSingleView();
  if(S.deckGoalFilter){const goal=getActiveGoal();if(goal){const ta=document.getElementById('fcTabAll');const td=document.getElementById('fcTabDue');const deck=deckForGoal(goal);const dueN=dueForGoal(goal).length;if(ta)ta.textContent='All · '+deck.length;if(td)td.textContent='Due · '+dueN;}}
  if(typeof _vocabHub!=='undefined'&&_vocabHub.activity==='flashcards'&&typeof refreshVocabHubPanel==='function'){
    const g=(typeof getActiveGoal==='function'?getActiveGoal():null);
    const fc=S.flashcards[fci];
    if(g&&fc&&fc.word&&typeof VocabBatching!=='undefined'&&VocabBatching.recordActivityUsage){
      VocabBatching.recordActivityUsage(g,'flashcards',[String(fc.word).trim()]);
    }
    refreshVocabHubPanel();
  }
}
function renderFcSingleView(){
  const inVocab=typeof _vocabHub!=='undefined'&&_vocabHub.activity==='flashcards';
  const cards=fcSingleCards().map(fc=>{normalizeFlashcard(fc);return fc;});
  const sc=document.getElementById(inVocab?'vvFcSingle':'fcSingleView');
  const grid=document.getElementById('fcGrid');
  if(!sc)return;
  if(!S.deckGoalFilter&&!inVocab){
    sc.style.display='none';
    if(grid)grid.style.display='';
    return;
  }
  if(grid)grid.style.display='none';
  sc.style.display='block';
  const addRow=document.querySelector('.fc-add-row');
  if(addRow)addRow.style.display='none';
  if(S.fcSingleIdx==null)S.fcSingleIdx=0;
  if(S.fcSingleIdx>=cards.length)S.fcSingleIdx=Math.max(0,cards.length-1);
  if(!cards.length){
    if(inVocab){
      if(S.fcTab==='due'){
        sc.innerHTML='<div class="deck-empty-state"><div class="ic">✅</div><h3>No cards due</h3><p>Nothing due in your selection right now. Review all selected words instead.</p><button type="button" class="btn-start" style="max-width:260px;margin:0 auto" onclick="setVocabHubFcTabAll()">Review all selected</button></div>';
        return;
      }
      sc.innerHTML='<div class="deck-empty-state"><div class="ic">📭</div><h3>No words selected</h3><p>Go back and pick at least 3 words.</p><button type="button" class="btn-start" style="max-width:260px;margin:0 auto" onclick="navBack()">← Vocabulary</button></div>';
      return;
    }
    const goal=getActiveGoal();
    const gid=goal?esc(goal.id):'';
    const practiceBtn=gid&&S.fcTab!=='due'?`<button type="button" class="btn-start" style="max-width:260px;margin:0 auto" onclick="launchGoalExam('practice',{goalId:'${gid}'})">Take a practice exam</button>`:'';
    sc.innerHTML=`<div class="deck-empty-state"><div class="ic">${S.fcTab==='due'||S.fcTab==='study'?'✅':'📭'}</div><h3>${S.fcTab==='due'||S.fcTab==='study'?'No cards due':'No words yet'}</h3><p>${S.fcTab==='due'||S.fcTab==='study'?'Check back later or review all words.':'Take a practice exam and save words you miss.'}</p>${practiceBtn}</div>`;
    return;
  }
  const fc=cards[S.fcSingleIdx];
  const fci=S.flashcards.indexOf(fc);
  const subject=fc.sourceLang||S.subject||'de';
  const faces=fcCardFaces(fc,subject);
  const groupLbl=typeof fcTypeSectionLabel==='function'?fcTypeSectionLabel(normWordType(fc.type||fc.pos)):'';
  const flipped=S.fcSingleFlipped?' flipped':'';
  const goal=getActiveGoal()||(typeof _vocabHub!=='undefined'&&_vocabHub.goalId?S.goals.find(g=>g.id===_vocabHub.goalId):null);
  const posType=typeof normWordType==='function'?normWordType(fc.type||fc.pos):'';
  const conjHtml=(posType==='verb'&&goal&&typeof VerbConjugation!=='undefined'&&VerbConjugation.conjugationSelectHtml)
    ?'<div class="fc-single-conj">'+VerbConjugation.conjugationSelectHtml(fc,goal,fcId(fc))+'</div>'
    :'';
  const ex=faces.example;
  const exHtml=ex?'<div class="fc-single-ex" style="margin-top:12px">'+esc(ex)+'</div>':'';
  const vt=typeof vocabT==='function'?vocabT():null;
  const pronLbl=vt?vt.pronounce:'🔊 Pronounce';
  const frontCls=faces.front.isWord?'fc-single-word':'fc-single-trans';
  const backCls=faces.back.isWord?'fc-single-word':'fc-single-trans';
  const frontTb=faces.front.typeBadge?'<div style="margin-bottom:8px">'+faces.front.typeBadge+'</div>':'';
  const backTb=faces.back.typeBadge?'<div style="margin-bottom:8px">'+faces.back.typeBadge+'</div>':'';
  const frontPhon=faces.front.isWord&&fc.phonetic?'<div class="fc-single-phon">'+esc(fc.phonetic)+'</div>':'';
  const backPhon=faces.back.isWord&&fc.phonetic?'<div class="fc-single-phon">'+esc(fc.phonetic)+'</div>':'';
  const frontFace='<div class="'+frontCls+'">'+faces.front.html+'</div>'+frontTb+frontPhon+'<button type="button" class="btn-sm blue" onclick="event.stopPropagation();speakBtn(\''+encodeURIComponent(faces.front.speak)+'\',\''+faces.front.ttsLang+'\',this)">'+pronLbl+'</button>'+(faces.front.isWord?conjHtml+exHtml:'')+'<p class="fc-single-hint">'+fcFlipHint(faces)+'</p>';
  const backFace='<div class="'+backCls+'">'+faces.back.html+'</div>'+backTb+backPhon+(faces.back.isWord?'<button type="button" class="btn-sm blue" onclick="event.stopPropagation();speakBtn(\''+encodeURIComponent(faces.back.speak)+'\',\''+faces.back.ttsLang+'\',this)">'+pronLbl+'</button>'+(conjHtml+exHtml):'');
  const srsHtml='<div class="srs-row" style="margin-top:16px"><button class="srs-btn srs-a" onclick="event.stopPropagation();fcSingleSrs('+fci+',0)">'+(vt?vt.again:'Again')+'</button><button class="srs-btn srs-h" onclick="event.stopPropagation();fcSingleSrs('+fci+',1)">'+(vt?vt.hard:'Hard')+'</button><button class="srs-btn srs-g" onclick="event.stopPropagation();fcSingleSrs('+fci+',2)">'+(vt?vt.good:'Good')+'</button><button class="srs-btn srs-e" onclick="event.stopPropagation();fcSingleSrs('+fci+',3)">'+(vt?vt.easy:'Easy')+'</button></div>';
  const modeLbl=S.fcTab==='study'?'Due first':'';
  mountFcDirectionBar(subject);
  const trMissing=!faces.translation||faces.translation==='—';
  if(trMissing&&fc&&typeof enrichFlashcardTranslations==='function'&&!S._fcEnrichPending){
    S._fcEnrichPending=true;
    void enrichFlashcardTranslations(fc).then((ok)=>{
      S._fcEnrichPending=false;
      if(ok&&typeof renderFcSingleView==='function')renderFcSingleView();
    }).catch(()=>{S._fcEnrichPending=false;});
  }
  sc.innerHTML='<div class="fc-single-wrap"><div class="progress-wrap" style="margin-bottom:16px"><div class="progress-row"><span>'+(vt?vt.cardOf(S.fcSingleIdx+1,cards.length)+(groupLbl?' · '+esc(groupLbl):'')+(modeLbl?' · '+modeLbl:''):'Card '+(S.fcSingleIdx+1)+' of '+cards.length+(groupLbl?' · '+esc(groupLbl):'')+(modeLbl?' · '+modeLbl:''))+'</span><span>'+Math.round(((S.fcSingleIdx+1)/cards.length)*100)+'%</span></div><div class="progress-track"><div class="progress-fill" style="width:'+Math.round(((S.fcSingleIdx+1)/cards.length)*100)+'%"></div></div></div><div class="fc-single-card"><div class="fc-single-inner'+flipped+'" id="fcSingleInner" onclick="toggleFcSingleFlip()" role="button" tabindex="0" aria-label="Flashcard, tap to flip"><div class="fc-single-face fc-single-front">'+frontFace+'</div><div class="fc-single-face fc-single-back">'+backFace+srsHtml+'</div></div></div><div class="fc-single-nav"><button type="button" class="btn-sm" onclick="fcSinglePrev()"'+((S.fcSingleIdx||0)<=0?' disabled':'')+'>'+(vt?vt.prev:'← Prev')+'</button><button type="button" class="btn-sm accent" onclick="fcSingleNext('+cards.length+')"'+((S.fcSingleIdx||0)>=cards.length-1?' disabled':'')+'>'+(vt?vt.next:'Next →')+'</button></div></div>';
  if(typeof bindFlashcardKeyboard==='function')bindFlashcardKeyboard();
}
function renderFCCard(fc,i){
  const id=fcId(fc);
  const ex=fcCardExample(fc);
  const flag=fc.sourceLang==='de'?'\uD83C\uDDE9\uD83C\uDDEA':fc.sourceLang==='en'?'\uD83C\uDDEC\uD83C\uDDE7':'\uD83D\uDCDD';
  const due=isDue(fc),sel=S.fcSelected.has(id);
  const evidence=fcEvidence(fc);
  const miss=fcMissLabel(fc);
  const subject=fc.sourceLang||S.subject||'de';
  const faces=fcCardFaces(fc,subject);
  const frontMeta=faces.front.isWord?((faces.front.typeBadge||'')+(fc.phonetic?`<div class="fc-phonetic">${esc(fc.phonetic)}</div>`:'')+(fc.pos?`<span class="fc-pos">${esc(fc.pos)}</span>`:'')):'';
  const backMeta=faces.back.isWord?((faces.back.typeBadge||'')+(fc.phonetic?`<div class="fc-phonetic">${esc(fc.phonetic)}</div>`:'')):'';
  const backEx=faces.back.isWord&&ex?`<div class="fc-ex">${esc(ex)}</div>`:'';
  const frontCls=faces.front.isWord?'fc-word':'fc-trans';
  const backCls=faces.back.isWord?'fc-word':'fc-trans';
  return `<div class="fc-card${due?' due-now':''}${sel?' fc-selected':''}" id="fc_${id}" onclick="flipCard('${id}')"><input type="checkbox" class="fc-check" ${sel?'checked':''} onclick="toggleFCSelect('${id}',event)" aria-label="Select"><button class="fc-aud" onclick="event.stopPropagation();speakBtn('${encodeURIComponent(faces.front.speak)}','${faces.front.ttsLang}',this)">\uD83D\uDD0A</button><button class="fc-del" onclick="event.stopPropagation();delFCById('${id}')">\u2715</button><div class="fc-front"><div style="padding-left:22px"><div class="${frontCls}">${faces.front.html}${frontMeta}</div></div><div class="fc-src">${flag} ${fc.sourceLang==='de'?'German':fc.sourceLang==='en'?'English':'Manual'}${fc.sourceExam?.level?' \u00b7 '+fc.sourceExam.level:''}</div><div class="fc-evidence">${esc(evidence)}</div><div class="fc-miss">${esc(miss)}</div><div class="fc-hint">click to reveal \u2192</div></div><div class="fc-back"><div><div class="${backCls}">${faces.back.html}</div>${backMeta}${backEx}</div><div class="srs-row"><button class="srs-btn srs-a" onclick="event.stopPropagation();srsRateById('${id}',0);renderFC(false)">Again</button><button class="srs-btn srs-h" onclick="event.stopPropagation();srsRateById('${id}',1);renderFC(false)">Hard</button><button class="srs-btn srs-g" onclick="event.stopPropagation();srsRateById('${id}',2);renderFC(false)">Good</button><button class="srs-btn srs-e" onclick="event.stopPropagation();srsRateById('${id}',3);renderFC(false)">Easy</button></div></div></div>`;
}
function renderFC(reinit=true){
  if(reinit){S.fcTab='all';S.fcTypeFilter='all';document.querySelectorAll('.fc-type-filter').forEach((b,i)=>b.classList.toggle('active',i===0));}
  const uiLang=typeof resolveVocabUiLang==='function'?resolveVocabUiLang():(S.fcLang||'en');
  const trLbl=document.querySelector('#flashcardScreen .fc-lang-label');
  if(trLbl){const vt=typeof vocabT==='function'?vocabT():null;trLbl.textContent=(vt?vt.interfaceLang:'Interface')+':';}
  const lb=document.getElementById('fcLangBtns');
  if(lb)lb.innerHTML=vocabUiLangs().map(l=>`<button type="button" class="vt-lb${uiLang===l.code?' active':''}" data-lang="${l.code}" onclick="setFcLang('${l.code}',this)">${l.l}</button>`).join('');
  const cb=document.getElementById('fcClearBtn'),es=document.getElementById('fcExamSec'),ps=document.getElementById('fcPersonalSec'),sb=document.getElementById('fcSelectBar');
  const profileCards=getDeckViewCards();
  const inHub=!!S.deckGoalFilter;
  const goal=getActiveGoal();
  mountFcDirectionBar(goal?.subject||S.subject);
  if(cb)cb.style.display=(!inHub&&profileCards.length>0)?'':'none';
  const hasCards=profileCards.length>0;
  if(sb)sb.style.display=hasCards?'flex':'none';
  if(es&&!inHub)es.style.display=hasCards?'block':'none';
  const veHintIf=document.getElementById('veHintModeInterface');
  const veHintIm=document.getElementById('veHintModeImmersion');
  if(veHintIf&&veHintIm){
    const mode=veHintLangMode();
    veHintIf.classList.toggle('accent',mode==='interface');
    veHintIm.classList.toggle('accent',mode==='immersion');
  }
  const persLevel=document.getElementById('fcPersonalLevel')?.value||goal?.level||S.level||'B1';
  const persLang=goal?.subject||S.subject||'de';
  const persOk=typeof isPersonalizedAllowed!=='function'||isPersonalizedAllowed(persLang,persLevel);
  if(ps&&!inHub)ps.style.display=hasCards&&persOk?'block':'none';
  const peCredits=document.getElementById('btnPersonalExamCredits');
  if(peCredits&&typeof aiCreditCostSuffix==='function')peCredits.textContent=aiCreditCostSuffix('personal_exam');
  const vqCredits=document.getElementById('btnVocabQuizCredits');
  if(vqCredits&&typeof aiCreditCostSuffix==='function')vqCredits.textContent=aiCreditCostSuffix('vocab_quiz');
  if(inHub&&goal){
    const ta=document.getElementById('fcTabAll');
    const td=document.getElementById('fcTabDue');
    const dueN=dueForGoal(goal).length;
    if(ta)ta.textContent='All · '+profileCards.length;
    if(td)td.textContent='Due · '+dueN;
  }else{
    const ta=document.getElementById('fcTabAll');
    const td=document.getElementById('fcTabDue');
    if(ta)ta.textContent='All Words';
    if(td)td.textContent='Due for Review';
  }
  document.getElementById('fcMain').style.display='';
  document.getElementById('fcStudy').style.display='none';
  if(inHub){
    const lb=document.getElementById('fcLangBtns');
    if(lb)lb.innerHTML=vocabUiLangs().map(l=>'<button class="vt-lb'+(uiLang===l.code?' active':'')+'" onclick="setFcLang(\''+l.code+'\',this)">'+l.l+'</button>').join('');
    const showLanding=S.fcTab==='all';
    const waysEl=document.getElementById('fcHubWays');
    if(waysEl)waysEl.style.display=showLanding?'':'none';
    const wordsLbl=document.getElementById('fcHubWordsLbl');
    if(wordsLbl)wordsLbl.style.display=showLanding?'block':'none';
    const footEl=document.getElementById('fcHubFootnote');
    if(footEl)footEl.style.display=showLanding?'block':'none';
    if(S.fcTab==='study'||S.fcTab==='due'){
      renderFcSingleView();
      updFCSelectUI();
      return;
    }
    const scSingle=document.getElementById('fcSingleView');
    if(scSingle)scSingle.style.display='none';
    const addRow=document.querySelector('#fcMain .fc-add-row');
    if(addRow)addRow.style.display='none';
  }
  const scSingle=document.getElementById('fcSingleView');
  if(scSingle)scSingle.style.display='none';
  const addRow=document.querySelector('.fc-add-row');
  if(addRow)addRow.style.display='';
  const grid=document.getElementById('fcGrid');
  if(!grid)return;
  let cards=typeof filterCardsByType==='function'?filterCardsByType(profileCards):profileCards;
  if(S.fcTab==='due')cards=cards.filter(f=>isDue(f));
  if(S.fcTab==='all'&&(!S.fcTypeFilter||S.fcTypeFilter==='all')&&typeof sortFlashcardsByType==='function')cards=sortFlashcardsByType(cards);
  if(cards.length===0){
    let emptyHtml;
    if(inHub&&goal&&S.fcTab!=='due'){
      const gid=esc(goal.id);
      emptyHtml=`<div class="deck-empty-state"><div class="ic">📭</div><h3>No difficult words yet</h3><p>Take a practice exam and tap the words you struggle with — they'll appear here as your personal deck.</p><button type="button" class="btn-start" style="max-width:260px;margin:0 auto" onclick="launchGoalExam('practice',{goalId:'${gid}'})">Take a practice exam</button></div>`;
    }else{
      emptyHtml=`<div class="fc-empty"><span>${S.fcTab==='due'?'\u2705':'\uD83D\uDDC2\uFE0F'}</span>${S.fcTab==='due'?'No cards due for review.':'No words yet.<br>In <b>Practice Mode</b>, click a word and <b>+ Save to Deck</b>, or add manually above.'}</div>`;
    }
    grid.innerHTML=emptyHtml;
    updFCSelectUI();return;
  }
  const groupAll=S.fcTab==='all'&&(!S.fcTypeFilter||S.fcTypeFilter==='all');
  let html='',lastType='';
  cards.forEach(fc=>{
    const i=S.flashcards.indexOf(fc);
    const t=typeof normWordType==='function'?normWordType(fc.type||fc.pos):'other';
    if(groupAll&&t!==lastType){
      const lbl=typeof fcTypeSectionLabel==='function'?fcTypeSectionLabel(t):t;
      html+=`<div class="fc-type-section">${lbl}</div>`;
      lastType=t;
    }
    html+=renderFCCard(fc,i);
  });
  grid.innerHTML=html;
  updFCSelectUI();
  if(typeof bindFlashcardKeyboard==='function')bindFlashcardKeyboard();
  if(typeof SavedVocabQuizzes!=='undefined'&&SavedVocabQuizzes.refreshSavedQuizzesDom){
    const goal=(typeof getActiveGoal==='function')?getActiveGoal():null;
    SavedVocabQuizzes.refreshSavedQuizzesDom(goal);
  }
}
function renderStudy(){
  if(S.deckGoalFilter){S.fcTab='study';S.fcSingleIdx=0;S.fcSingleFlipped=false;document.getElementById('fcMain').style.display='';document.getElementById('fcStudy').style.display='none';renderFcSingleView();return;}
  document.getElementById('fcMain').style.display='none';const sc=document.getElementById('fcStudy');sc.style.display='block';const cards=getDeckViewCards().filter(f=>isDue(f));if(cards.length===0){sc.innerHTML='<div class="hist-empty"><span>✅</span>No cards due for review right now.</div>';return;}S.studyIdx=0;renderStudyCard(cards);
}
function renderStudyCard(cards){const sc=document.getElementById('fcStudy');if(S.studyIdx>=cards.length){sc.innerHTML=`<div style="text-align:center;padding:60px 0"><div style="font-size:32px;margin-bottom:14px">🎉</div><div style="font-size:20px;font-weight:700;margin-bottom:6px">Session complete!</div><p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px">All ${cards.length} cards reviewed.</p><button class="btn-start" onclick="setFcTab('all')" style="max-width:200px;margin:0 auto">Back to Deck</button></div>`;return;}const fc=cards[S.studyIdx],fci=S.flashcards.indexOf(fc),tb=typeof typeBadge==='function'?typeBadge(normWordType(fc.type||fc.pos)):'';
const subject=fc.sourceLang||S.subject||'de';
const faces=fcCardFaces(fc,subject);
const topCls=faces.front.isWord?'fc-study-word':'';
const topStyle=faces.front.isWord?'font-size:36px;font-weight:800;margin-bottom:7px;font-family:var(--lc-font),serif;font-style:italic':'font-size:22px;font-weight:700;color:var(--purple);margin-bottom:7px';
const botStyle=faces.back.isWord?'font-size:36px;font-weight:800;margin-bottom:7px;font-family:var(--lc-font),serif;font-style:italic':'font-size:22px;font-weight:700;color:var(--purple);margin-bottom:7px';
const safeEx=_fcEsc(faces.example||''),safePhonetic=_fcEsc(fc.phonetic||'');
mountFcDirectionBar(subject);
sc.innerHTML=`<div style="text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:12px">${S.studyIdx+1} / ${cards.length}</div><div class="progress-track" style="margin-bottom:22px"><div class="progress-fill" style="width:${(S.studyIdx/cards.length)*100}%"></div></div><div class="fc-exam-sec" style="text-align:center"><div class="${topCls}" style="${topStyle}">${faces.front.html}</div>${faces.front.isWord&&tb?`<div style="margin-bottom:8px">${tb}</div>`:''}${faces.front.isWord&&safePhonetic?`<div style="font-size:12px;color:var(--text-muted);font-family:'DM Mono',monospace;margin-bottom:8px">${safePhonetic}</div>`:''}<button class="btn-sm blue" onclick="speakBtn('${encodeURIComponent(faces.front.speak)}','${faces.front.ttsLang}',this)">🔊 Pronounce</button><hr class="section-div" style="margin:16px 0"><div style="${botStyle}">${faces.back.html}</div>${faces.back.isWord&&safePhonetic?`<div style="font-size:12px;color:var(--text-muted);font-family:'DM Mono',monospace;margin-bottom:8px">${safePhonetic}</div>`:''}${safeEx?`<div style="font-size:12px;color:var(--text-secondary);font-style:italic">${safeEx}</div>`:''}<div class="srs-row" style="margin-top:18px"><button class="srs-btn srs-a" onclick="srsRate(${fci},0);S.studyIdx++;renderStudyCard(cards)">Again</button><button class="srs-btn srs-h" onclick="srsRate(${fci},1);S.studyIdx++;renderStudyCard(cards)">Hard</button><button class="srs-btn srs-g" onclick="srsRate(${fci},2);S.studyIdx++;renderStudyCard(cards)">Good</button><button class="srs-btn srs-e" onclick="srsRate(${fci},3);S.studyIdx++;renderStudyCard(cards)">Easy</button></div></div>`;}
function fcIndexById(id){return S.flashcards.findIndex(f=>fcId(f)===id);}
function srsRateById(id,q){const i=fcIndexById(id);if(i>=0)srsRate(i,q);}
function flipCard(id){
  const el=document.getElementById('fc_'+id);
  if(!el)return;
  el.classList.toggle('flipped');
  if(el.classList.contains('flipped')){
    const i=fcIndexById(id);
    const fc=i>=0?S.flashcards[i]:null;
    if(fc&&typeof enrichFlashcardTranslations==='function'){
      void enrichFlashcardTranslations(fc).then((ok)=>{if(ok){if(typeof saveFC==='function')saveFC();renderFC(false);}});
    }
  }
}
function delFCById(id){
  const i=fcIndexById(id);
  if(i<0)return;
  if(!confirm('Remove this word from your deck?'))return;
  const fc=S.flashcards[i];
  if(fc?.word){
    const sourceLang=fc.sourceLang||fc.lang||'';
    const key=`${String(fc.word).toLowerCase().trim()}|${sourceLang}`;
    if(!Array.isArray(S.deletedFlashcards))S.deletedFlashcards=[];
    S.deletedFlashcards.push({key,deletedAt:Date.now()});
    try{localStorage.setItem('lc_fc_del',JSON.stringify(S.deletedFlashcards));}catch(_){}
  }
  S.flashcards.splice(i,1);
  S.fcSelected.delete(id);
  if(typeof _vocabHub!=='undefined'&&_vocabHub.selectedIds)_vocabHub.selectedIds.delete(id);
  saveFC();
  if(typeof updBadges==='function')updBadges();
  if(typeof refreshVocabHubPanel==='function'&&document.getElementById('goalWorkspaceScreen')?.style.display==='block')refreshVocabHubPanel();
  renderFC(false);
}
function setFcLang(lang,btn){
  if(typeof setVocabUiLang==='function'){setVocabUiLang(lang,btn);}
  else{S.fcLang=typeof clampVocabUiLang==='function'?clampVocabUiLang(lang,'en'):lang;try{localStorage.setItem('lc_pref_xlat',S.fcLang);}catch(_){}document.querySelectorAll('#fcLangBtns .vt-lb').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');renderFC(false);}
  void refreshFlashcardTranslationsForUiLang();
  if(typeof Auth!=='undefined'&&typeof Auth.pushSync==='function')Auth.pushSync();
}
function clearFC(){if(confirm('Remove all words?')){S.flashcards=[];S.fcSelected.clear();saveFC();renderFC();}}

// ═══════════════════════════════════════════
// VOCAB EXAM (AI hints → pick the word)
// ═══════════════════════════════════════════
function veHintLangMode(){try{return localStorage.getItem('lc_ve_hint_lang')||'interface';}catch(_){return'interface';}}
function setVeHintLangMode(mode){
  const m=mode==='immersion'?'immersion':'interface';
  try{localStorage.setItem('lc_ve_hint_lang',m);}catch(_){}
  return m;
}
function veHintTypeLabel(hintType,hintLanguage,sourceLang){
  const t=typeof vocabT==='function'?vocabT():null;
  const ht=String(hintType||'').toLowerCase();
  let base=t?t.hint:'Hint';
  if(ht==='synonym')base=t?t.synonym:'Synonym';
  else if(ht==='antonym')base=t?t.antonym:'Antonym';
  const hl=String(hintLanguage||'').toLowerCase();
  const sl=String(sourceLang||'').toLowerCase();
  if(hl&&sl&&hl===sl&&hl!=='en'){
    const langName=typeof vocabHintLangName==='function'?vocabHintLangName(hl):(hl==='de'?'German':hl==='es'?'Spanish':'English');
    return base+' ('+langName+')';
  }
  return base;
}
function veBackFromQuiz(){
  if(typeof _vocabHub!=='undefined'&&_vocabHub.veFromVocab&&typeof backToWorkspace==='function')backToWorkspace('vocabulary');
  else if(S.deckGoalFilter&&typeof openDeckHub==='function'){const g=getActiveGoal();if(g)openDeckHub(g.id);}
  else if(typeof goFlashcards==='function')goFlashcards(true);
}
function veNormalizeQuestions(questions,hintLang,hintLanguageMode,subject){
  const hl=hintLanguageMode==='immersion'?String(subject||'de').slice(0,2):String(hintLang||'en').slice(0,2);
  return(questions||[]).map((q)=>({...q,hintLanguage:hl}));
}
async function startVE(){
  if(typeof requireAiCredits==='function'&&!requireAiCredits('vocab_quiz',{message:'AI vocabulary quiz uses 2 credits from your monthly allowance.'}))return;
  const creditCost=typeof vocabQuizCreditCost==='function'?vocabQuizCreditCost():2;
  if(typeof canUseVocabQuizAi==='function'&&!canUseVocabQuizAi()){
    if(typeof isPro==='function'&&isPro()&&typeof showAiCreditsExhausted==='function')showAiCreditsExhausted();
    else if(typeof notify==='function')notify('Not enough AI credits for a vocab quiz ('+creditCost+' credits per 10 questions).','warn',6000);
    else lcToast('Not enough AI credits for a vocab quiz ('+creditCost+' credits).','warn',6000);
    return;
  }
  ensureFcIds();
  const pool=getSelectedFC();
  if(pool.length<4){lcToast('Select at least 4 flashcards for the quiz.','warn');return;}
  const veGoal=getActiveGoal();
  let words=pool.map(f=>String(f.word||'').trim()).filter(Boolean);
  if(words.length<4){lcToast('Select at least 4 words for the quiz.','warn');return;}
  if(typeof VocabBatching!=='undefined'&&VocabBatching.selectForActivity){
    const sel=VocabBatching.selectForActivity(words,'vocab_quiz',veGoal);
    words=sel.words;
    S.veActivityWords=words.slice();
    if(veGoal&&typeof saveGoals==='function')saveGoals();
  }
  const qCount=Math.min(10,words.length);
  const preferTargets=typeof VocabQuizUtils!=='undefined'&&VocabQuizUtils.weightedPickQuizTargets
    ?VocabQuizUtils.weightedPickQuizTargets(pool,qCount)
    :words.slice(0,qCount);
  hideAll();
  show('loadingScreen');
  const lt=document.getElementById('loaderTitle');
  const ls=document.getElementById('loaderSub');
  if(lt)lt.textContent=(typeof vocabT==='function'?vocabT().generatingQuiz:'Generating quiz…');
  if(ls)ls.textContent=(typeof vocabT==='function'?vocabT().generatingQuizSub(creditCost):'AI is writing hints from your vocabulary ('+creditCost+' credits)');
  const subject=veGoal?.subject||S.deckGoalFilter||S.subject||'de';
  const level=veGoal?.level||S.level||'B1';
  const hintLang=typeof resolveActiveVocabUiLang==='function'?resolveActiveVocabUiLang():(typeof resolveVocabUiLang==='function'?resolveVocabUiLang():(S.fcLang||S.vocabLang||'en'));
  const hintLanguageMode=veHintLangMode();
  if(typeof enrichFlashcardsForQuiz==='function')await enrichFlashcardsForQuiz(pool);
  const wordMeta=typeof VocabQuizUtils!=='undefined'&&VocabQuizUtils.buildWordMeta
    ?VocabQuizUtils.buildWordMeta(pool,(fc)=>fcCardTranslation(fc,hintLang))
    :words.map(w=>({word:w,type:'other',translation:'',missCount:0}));
  let quizGen=null;
  try{
    if(typeof generateVocabQuizWithAI!=='function')throw new Error('AI quiz unavailable');
    quizGen=await generateVocabQuizWithAI(words,{lang:subject,level,hintLang,hintLanguageMode,count:qCount,wordMeta,preferTargets});
  }catch(e){
    hideAll();
    veBackFromQuiz();
    if(e.code==='ai_credits_exhausted'){
      if(typeof showAiCreditsExhausted==='function')showAiCreditsExhausted();
    }else if(e.code==='pro_only'){
      if(typeof requirePersonalized==='function')requirePersonalized();
    }else{
      lcToast('Could not generate quiz: '+(e.message||'AI error'),'error',7000);
    }
    return;
  }
  const usedAi=quizGen&&quizGen.usedAi!==false;
  let questions=veNormalizeQuestions(quizGen?.questions||[],hintLang,hintLanguageMode,subject);
  S.veScore=0;S.veIndex=0;
  S.vePool=pool;
  S.veQuestions=questions;
  S.veRetakeQuizId=null;
  S.veSavedQuizId=null;
  S.veQuizUsedAi=usedAi;
  if(typeof SavedVocabQuizzes!=='undefined'&&SavedVocabQuizzes.persistAfterGeneration){
    S.veSavedQuizId=SavedVocabQuizzes.persistAfterGeneration({goal:veGoal,subject,level,hintLang,hintLanguageMode,questions,pool,questionCount:qCount});
  }
  hide('loadingScreen');
  if(typeof ActivityTrack!=='undefined')ActivityTrack.beginSession('vocab_quiz',veGoal?.id,usedAi?'Vocabulary quiz':'Vocabulary quiz (offline)');
  show('vocabExamScreen');
  if(typeof applyVocabExamChrome==='function')applyVocabExamChrome();
  const vt=typeof vocabT==='function'?vocabT():null;
  document.getElementById('veTitle').textContent=vt?vt.questionsTitle(questions.length):questions.length+' questions';
  const lede=document.getElementById('veLede');
  if(lede){
    const gl=veGoal?goalLabel(veGoal):(vt?vt.yourDeck:'Your deck');
    lede.textContent=usedAi
      ?(vt?vt.quizLede(gl,words.length,creditCost):gl+' · '+words.length+' words · AI hints · '+creditCost+' credits')
      :gl+' · '+words.length+' words · offline hints (no credits used)';
  }
  renderVEQ();window.scrollTo({top:0,behavior:'smooth'});
}
function veFcForWord(word){
  const w=String(word||'').trim().toLowerCase();
  if(!w)return null;
  const pool=S.vePool||[];
  return pool.find(f=>String(f.word||'').trim().toLowerCase()===w)
    ||S.flashcards.find(f=>String(f.word||'').trim().toLowerCase()===w)
    ||null;
}
function veNextQuestion(){
  S.veAnswered=false;
  S.veIndex++;
  renderVEQ();
}
function renderVEQ(){
  const vc=document.getElementById('veContent');
  const vt=typeof vocabT==='function'?vocabT():null;
  S.veAnswered=false;
  if(S.veIndex>=S.veQuestions.length){
    const pct=Math.round(S.veScore/S.veQuestions.length*100);
    const quizId=S.veRetakeQuizId||S.veSavedQuizId;
    if(quizId&&typeof SavedVocabQuizzes!=='undefined'&&SavedVocabQuizzes.recordResult){
      SavedVocabQuizzes.recordResult(quizId,S.veScore,S.veQuestions.length);
    }
    S.veRetakeQuizId=null;
    S.veSavedQuizId=null;
    flushOpenStudySession({type:'vocab_quiz',score:pct,label:'Vocabulary quiz · '+pct+'%'});
    const rotWords=S.veActivityWords||[];
    const g=getActiveGoal();
    if(g&&rotWords.length&&typeof VocabBatching!=='undefined'&&VocabBatching.recordActivityUsage){
      VocabBatching.recordActivityUsage(g,'vocab_quiz',rotWords);
      S.veActivityWords=null;
      if(typeof _vocabHub!=='undefined'&&_vocabHub.veFromVocab&&typeof refreshVocabHubPanel==='function')refreshVocabHubPanel();
    }
    const veDoneBtn='navBack()';
    const veDoneLbl=vt?(typeof _vocabHub!=='undefined'&&_vocabHub.veFromVocab?vt.backToVocab:vt.backToDeck):('← Back to '+(_vocabHub.veFromVocab?'vocabulary':'deck'));
    vc.innerHTML=`<div class="ws-panel ve-results-panel"><div class="ve-big ${pct>=70?'pass':pct>=50?'mid':'fail'}">${pct}%</div><p class="exam-config-lede">${vt?vt.correctCount(S.veScore,S.veQuestions.length):S.veScore+'/'+S.veQuestions.length+' correct'}</p><button class="btn-start" onclick="${veDoneBtn}" style="max-width:220px;margin:16px auto 0">${veDoneLbl}</button></div>`;
    return;
  }
  const q=S.veQuestions[S.veIndex];
  const correct=String(q?.word||'').trim();
  const opts=Array.isArray(q?.options)?q.options.filter(Boolean):[];
  if(!correct||opts.length<4){
    S.veIndex++;
    renderVEQ();
    return;
  }
  document.getElementById('veProg').textContent=vt?vt.questionOf(S.veIndex+1,S.veQuestions.length):`Question ${S.veIndex+1} of ${S.veQuestions.length}`;
  document.getElementById('veScore').textContent=vt?vt.score(S.veScore):`Score: ${S.veScore}`;
  document.getElementById('veBar').style.width=(S.veIndex/S.veQuestions.length*100)+'%';
  const veGoal=getActiveGoal();
  const subject=veGoal?.subject||S.deckGoalFilter||S.subject||'de';
  const hintLbl=veHintTypeLabel(q.hintType,q.hintLanguage,subject);
  const qHtml=`<p class="ve-prompt-lbl">${esc(hintLbl)}</p><div class="ve-word ve-hint">${esc(q.hint||'')}</div><p class="ve-meta">${vt?esc(vt.whichWord):'Which word matches this clue?'}</p>`;
  const optHtml=opts.map((o,oi)=>{
    const fc=veFcForWord(o);
    const label=fc&&typeof fcWordDisplayHtml==='function'?fcWordDisplayHtml(fc,subject):esc(o);
    return `<div class="ve-opt opt" data-ans="${esc(o)}" data-idx="${oi}">${label}</div>`;
  }).join('');
  vc.innerHTML=`<div class="ws-panel ve-question-panel">${qHtml}</div><div class="ve-opts options" id="veOpts" data-correct="${esc(correct)}">${optHtml}</div>`;
  document.getElementById('veOpts')?.addEventListener('click',ansVE,{once:false});
}
function ansVE(ev){
  const el=ev.target.closest('.ve-opt');
  if(!el||el.classList.contains('dis')||S.veAnswered)return;
  const vt=typeof vocabT==='function'?vocabT():null;
  const optsEl=document.getElementById('veOpts');
  const corr=optsEl?.dataset.correct||'';
  const ans=el.dataset.ans||'';
  document.querySelectorAll('.ve-opt').forEach(o=>o.classList.add('dis'));
  const q=S.veQuestions[S.veIndex];
  const targetWord=String(q?.word||corr).trim();
  const fi=S.flashcards.findIndex(f=>String(f.word||'').trim().toLowerCase()===targetWord.toLowerCase());
  const match=ans.trim().toLowerCase()===corr.trim().toLowerCase();
  if(match){el.classList.add('correct');S.veScore++;if(fi>=0)srsRate(fi,3);}
  else{el.classList.add('wrong');document.querySelectorAll('.ve-opt').forEach(o=>{if(o.dataset.ans.trim().toLowerCase()===corr.trim().toLowerCase())o.classList.add('correct');});if(fi>=0)srsRate(fi,0);}
  document.getElementById('veScore').textContent=vt?vt.score(S.veScore):`Score: ${S.veScore}`;
  S.veAnswered=true;
  optsEl?.removeEventListener('click',ansVE);
  const fc=veFcForWord(targetWord);
  const tr=fc?fcCardTranslation(fc):'';
  const trLine=tr&&tr!=='—'?`<div class="ve-feedback-tr">${esc(tr)}</div>`:'';
  const fbClass=match?'ok':'bad';
  const fbLead=match?(vt?vt.correct:'✓ Correct!'):(vt?vt.notQuite:'✗ Not quite — the answer is:');
  const nextLbl=vt?(S.veIndex+1>=S.veQuestions.length?vt.seeResults:vt.nextQuestion):(S.veIndex+1>=S.veQuestions.length?'See results →':'Next question →');
  const fbHtml=`<div class="ve-feedback ${fbClass}"><div>${fbLead}</div><div class="ve-feedback-word">${esc(targetWord)}</div>${trLine}</div><button type="button" class="btn-start ve-next" onclick="veNextQuestion()">${nextLbl}</button>`;
  document.getElementById('veContent')?.insertAdjacentHTML('beforeend',fbHtml);
}
