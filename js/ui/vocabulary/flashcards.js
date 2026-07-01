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
  const lang=S?.fcLang||'en';
  if(typeof fc.translation==='string'&&fc.translation.trim()){
    if(!fc.translations[lang])fc.translations[lang]=fc.translation.trim();
    if(!fc.translations.en)fc.translations.en=fc.translation.trim();
  }
  if(typeof fc.meaning==='string'&&fc.meaning.trim()&&!fc.translations[lang]){
    fc.translations[lang]=fc.meaning.trim();
  }
  if(!fc.examples||typeof fc.examples!=='object')fc.examples={};
  if(typeof fc.context==='string'&&fc.context.trim()&&!Object.values(fc.examples).some(Boolean)){
    fc.examples[lang]=fc.context.trim();
  }
  return fc;
}
function fcCardTranslation(fc,langCode){
  if(!fc)return'—';
  normalizeFlashcard(fc);
  const code=langCode||S.fcLang||'en';
  const tr=fc.translations;
  let val=tr?.[code]||tr?.en||tr?.es||tr?.de||Object.values(tr||{}).find(v=>v!=null&&String(v).trim());
  if(val!=null&&String(val).trim())return String(val).trim();
  if(typeof fc.translation==='string'&&fc.translation.trim())return fc.translation.trim();
  if(typeof fc.meaning==='string'&&fc.meaning.trim())return fc.meaning.trim();
  const subject=fc.sourceLang||fc.lang||S.subject||'de';
  const ck=`${fc.word}_${subject}_${code}`;
  const cached=S.vocabCache?.[ck];
  if(cached){
    const t=cached[`translation_${code}`]||cached.definition_en||cached[`translation_en`];
    if(t&&String(t).trim())return String(t).trim();
  }
  return '—';
}
function applyLookupDataToFc(fc,data,lang,subject){
  if(!fc||!data)return;
  normalizeFlashcard(fc);
  const code=lang||S.fcLang||'en';
  const isEnDef=subject==='en'&&code==='en';
  const t=isEnDef
    ?(data.definition_en||data.translation_en||data.translation)
    :(data[`translation_${code}`]||data.translation_en||data.translation_es||data.translation);
  if(t&&String(t).trim())fc.translations[code]=String(t).trim();
  if(data.definition_en&&!fc.translations.en)fc.translations.en=String(data.definition_en).trim();
  if(data.translation_en&&!fc.translations.en)fc.translations.en=String(data.translation_en).trim();
  if(data.translation_es&&!fc.translations.es)fc.translations.es=String(data.translation_es).trim();
}
async function enrichFlashcardTranslations(fc){
  if(!fc)return fcCardTranslation(fc)!=='—';
  normalizeFlashcard(fc);
  if(fcCardTranslation(fc)!=='—')return true;
  const goal=typeof getActiveGoal==='function'?getActiveGoal():null;
  const subject=fc.sourceLang||goal?.subject||S.deckGoalFilter||S.subject||'de';
  const level=goal?.level||S.level||'B1';
  const lang=S.fcLang||'en';
  const word=String(fc.word||'').trim();
  if(!word)return false;
  const ck=`${word}_${subject}_${lang}`;
  if(S.vocabCache?.[ck]){
    applyLookupDataToFc(fc,S.vocabCache[ck],lang,subject);
    if(fcCardTranslation(fc)!=='—')return true;
  }
  if(typeof PracticeDictionary!=='undefined'){
    try{
      const dict=await PracticeDictionary.lookup(word,subject,level,lang);
      if(dict){applyLookupDataToFc(fc,dict,lang,subject);if(fcCardTranslation(fc)!=='—')return true;}
    }catch(_){}
  }
  if(typeof ManualVocab!=='undefined'){
    try{
      const r=await ManualVocab.validate(word,subject,level,lang);
      if(r?.ok&&r.entry&&ManualVocab.buildTranslations){
        Object.assign(fc.translations,ManualVocab.buildTranslations(r.entry,subject,lang));
        if(fcCardTranslation(fc)!=='—')return true;
      }
    }catch(_){}
  }
  if(typeof fetchVocabCache==='function'){
    try{
      const example=fc.examples?.[lang]||fc.context||'';
      const hit=await fetchVocabCache(subject,lang,word,example);
      if(hit?.translation){
        fc.translations[lang]=String(hit.translation).trim();
        if(!fc.translations.en)fc.translations.en=String(hit.translation).trim();
        S.vocabCache[ck]={...(S.vocabCache[ck]||{}),[`translation_${lang}`]:hit.translation,definition_en:hit.translation};
        if(fcCardTranslation(fc)!=='—')return true;
      }
    }catch(_){}
  }
  return fcCardTranslation(fc)!=='—';
}
async function enrichFlashcardsForQuiz(cards){
  await Promise.all((cards||[]).map(fc=>enrichFlashcardTranslations(fc)));
}
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
function fcCardExample(fc,langCode){
  if(!fc)return'';
  normalizeFlashcard(fc);
  const code=langCode||S.fcLang||'en';
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
  const i=S.flashcards.findIndex(f=>f.word===word&&f.sourceLang===S.subject&&fcSourceLevel(f)===lvl);
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
  if(Array.isArray(S.examSavedWords))S.examSavedWords=S.examSavedWords.filter(w=>w!==word);
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
  if(isWordSaved(word)){
    const existing=S.flashcards.find(f=>f.word===word&&f.sourceLang===sourceLang&&fcSourceLevel(f)===sourceLevel);
    if(existing){existing.missCount=(existing.missCount||1)+1;clearFcTombstone();saveFC();}
    if(!S.examSavedWords)S.examSavedWords=[];
    if(!S.examSavedWords.includes(word))S.examSavedWords.push(word);
    markVocabSaved(word);
    const b=document.getElementById('vtSave');
    if(b){b.textContent='\u2713 In your deck';b.classList.add('saved');}
    return false;
  }
  const tr={},ex={};
  LANGS.forEach(l=>{const ck=`${word}_${S.subject}_${l.code}`;if(S.vocabCache[ck]){tr[l.code]=S.vocabCache[ck][`translation_${l.code}`]||S.vocabCache[ck].definition_en||'';ex[l.code]=S.vocabCache[ck][`example_${l.code}`]||'';}});
  tr[S.vocabLang]=data[`translation_${S.vocabLang}`]||data.definition_en||data.translation||'';
  if(data.translation_en)tr.en=data.translation_en;
  if(data.translation_es)tr.es=data.translation_es;
  if(data.definition_en&&!tr.en)tr.en=data.definition_en;
  ex[S.vocabLang]=data[`example_${S.vocabLang}`]||'';
  const wtype=typeof normWordType==='function'?normWordType(data.type||data.pos):'';
  const fc={id:'fc_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9),word,phonetic:data.phonetic||'',pos:data.pos||data.type||'',type:wtype,translations:tr,examples:ex,sourceLang,sourceLevel,sourceExam,savedAt:Date.now(),interval:1,ef:2.5,nextReview:null,missCount:1};
  if(data.gender)fc.gender=data.gender;
  if(data.article)fc.article=data.article;
  if(typeof ManualVocab!=='undefined'&&ManualVocab.enrichFlashcard)ManualVocab.enrichFlashcard(fc,S.subject);
  if(typeof ExamProfile!=='undefined')ExamProfile.tagItem(fc);
  S.flashcards.push(fc);
  if(!S.examSavedWords)S.examSavedWords=[];
  if(!S.examSavedWords.includes(word))S.examSavedWords.push(word);
  if(typeof sortFlashcardsByType==='function')S.flashcards=sortFlashcardsByType(S.flashcards);
  clearFcTombstone();
  saveFC();
  markVocabSaved(word);
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
  if(inVocab||(typeof _vocabHub!=='undefined'&&_vocabHub.flashcardMode&&S.fcSelected.size)){
    const goal=(typeof _vocabHub!=='undefined'&&_vocabHub.goalId?S.goals.find(g=>g.id===_vocabHub.goalId):null)||getActiveGoal();
    cards=goal?deckForGoal(goal):getDeckViewCards();
    if(S.fcSelected.size)cards=cards.filter(f=>S.fcSelected.has(fcId(f)));
  }else{
    cards=getDeckViewCards();
    if(S.fcTab==='due')cards=cards.filter(f=>isDue(f));
    else if(S.fcTab==='study'){
      const dueCards=cards.filter(f=>isDue(f));
      cards=dueCards.length?dueCards:cards;
    }
  }
  if(typeof filterCardsByType==='function')cards=filterCardsByType(cards);
  if(typeof sortFlashcardsByType==='function'&&(!S.fcTypeFilter||S.fcTypeFilter==='all'))cards=sortFlashcardsByType(cards);
  return cards;
}
function toggleFcSingleFlip(){
  const el=document.getElementById('fcSingleInner');
  if(el)el.classList.toggle('flipped');
  S.fcSingleFlipped=!!(el&&el.classList.contains('flipped'));
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
      sc.innerHTML='<div class="deck-empty-state"><div class="ic">📭</div><h3>No words selected</h3><p>Go back and pick at least '+VV_MIN_FLASH+' word.</p><button type="button" class="btn-start" style="max-width:260px;margin:0 auto" onclick="navBack()">← Vocabulary</button></div>';
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
  const lang=fc.sourceLang==='de'?'de-DE':fc.sourceLang==='es'?'es-ES':'en-GB';
  const tr=fcCardTranslation(fc);
  const ex=fcCardExample(fc);
  const exHtml=ex?'<div class="fc-single-ex" style="margin-top:12px">'+esc(ex)+'</div>':'';
  const tb=typeof typeBadge==='function'?typeBadge(normWordType(fc.type||fc.pos)):'';
  const groupLbl=typeof fcTypeSectionLabel==='function'?fcTypeSectionLabel(normWordType(fc.type||fc.pos)):'';
  const flipped=S.fcSingleFlipped?' flipped':'';
  const subject=fc.sourceLang||S.subject||'de';
  const speakPhrase=typeof fcSpeakPhrase==='function'?fcSpeakPhrase(fc,subject):fc.word;
  const wordEnc=encodeURIComponent(speakPhrase);
  const wordHtml=typeof fcWordDisplayHtml==='function'?fcWordDisplayHtml(fc,subject):_fcEsc(fc.word);
  const srsHtml=inVocab?'':'<div class="srs-row" style="margin-top:16px"><button class="srs-btn srs-a" onclick="event.stopPropagation();fcSingleSrs('+fci+',0)">Again</button><button class="srs-btn srs-h" onclick="event.stopPropagation();fcSingleSrs('+fci+',1)">Hard</button><button class="srs-btn srs-g" onclick="event.stopPropagation();fcSingleSrs('+fci+',2)">Good</button><button class="srs-btn srs-e" onclick="event.stopPropagation();fcSingleSrs('+fci+',3)">Easy</button></div>';
  sc.innerHTML='<div class="fc-single-wrap"><div class="progress-wrap" style="margin-bottom:16px"><div class="progress-row"><span>Card '+(S.fcSingleIdx+1)+' of '+cards.length+(groupLbl?' · '+esc(groupLbl):'')+'</span><span>'+Math.round(((S.fcSingleIdx+1)/cards.length)*100)+'%</span></div><div class="progress-track"><div class="progress-fill" style="width:'+Math.round(((S.fcSingleIdx+1)/cards.length)*100)+'%"></div></div></div><div class="fc-single-card"><div class="fc-single-inner'+flipped+'" id="fcSingleInner" onclick="toggleFcSingleFlip()" role="button" tabindex="0" aria-label="Flashcard, tap to flip"><div class="fc-single-face fc-single-front"><div class="fc-single-word">'+wordHtml+'</div>'+(tb?'<div style="margin-bottom:8px">'+tb+'</div>':'')+(fc.phonetic?'<div class="fc-single-phon">'+esc(fc.phonetic)+'</div>':'')+'<button type="button" class="btn-sm blue" onclick="event.stopPropagation();speakBtn(\''+wordEnc+'\',\''+lang+'\',this)">🔊 Pronounce</button>'+exHtml+'<p class="fc-single-hint">Tap card for translation</p></div><div class="fc-single-face fc-single-back"><div class="fc-single-trans">'+esc(tr)+'</div>'+srsHtml+'</div></div></div><div class="fc-single-nav"><button type="button" class="btn-sm" onclick="fcSinglePrev()"'+((S.fcSingleIdx||0)<=0?' disabled':'')+'>← Prev</button><button type="button" class="btn-sm accent" onclick="fcSingleNext('+cards.length+')"'+((S.fcSingleIdx||0)>=cards.length-1?' disabled':'')+'>Next →</button></div></div>';
  if(typeof bindFlashcardKeyboard==='function')bindFlashcardKeyboard();
}
function renderFCCard(fc,i){
  const id=fcId(fc);
  const tr=fcCardTranslation(fc);
  const ex=fcCardExample(fc);
  const flag=fc.sourceLang==='de'?'\uD83C\uDDE9\uD83C\uDDEA':fc.sourceLang==='en'?'\uD83C\uDDEC\uD83C\uDDE7':'\uD83D\uDCDD';
  const due=isDue(fc),sel=S.fcSelected.has(id);
  const tb=typeof typeBadge==='function'?typeBadge(normWordType(fc.type||fc.pos)):'';
  const lang=fc.sourceLang==='de'?'de-DE':'en-GB';
  const evidence=fcEvidence(fc);
  const miss=fcMissLabel(fc);
  const subject=fc.sourceLang||S.subject||'de';
  const speakPhrase=typeof fcSpeakPhrase==='function'?fcSpeakPhrase(fc,subject):fc.word;
  const wordHtml=typeof fcWordDisplayHtml==='function'?fcWordDisplayHtml(fc,subject):_fcEsc(fc.word);
  return `<div class="fc-card${due?' due-now':''}${sel?' fc-selected':''}" id="fc_${id}" onclick="flipCard('${id}')"><input type="checkbox" class="fc-check" ${sel?'checked':''} onclick="toggleFCSelect('${id}',event)" aria-label="Select"><button class="fc-aud" onclick="event.stopPropagation();speakBtn('${encodeURIComponent(speakPhrase)}','${lang}',this)">\uD83D\uDD0A</button><button class="fc-del" onclick="event.stopPropagation();delFCById('${id}')">\u2715</button><div class="fc-front"><div style="padding-left:22px"><div class="fc-word">${wordHtml}${tb}</div>${fc.phonetic?`<div class="fc-phonetic">${esc(fc.phonetic)}</div>`:''} ${fc.pos?`<span class="fc-pos">${esc(fc.pos)}</span>`:''}</div><div class="fc-src">${flag} ${fc.sourceLang==='de'?'German':fc.sourceLang==='en'?'English':'Manual'}${fc.sourceExam?.level?' \u00b7 '+fc.sourceExam.level:''}</div><div class="fc-evidence">${esc(evidence)}</div><div class="fc-miss">${esc(miss)}</div><div class="fc-hint">click to reveal \u2192</div></div><div class="fc-back"><div><div class="fc-trans">${esc(tr)}</div>${ex?`<div class="fc-ex">${esc(ex)}</div>`:''}</div><div class="srs-row"><button class="srs-btn srs-a" onclick="event.stopPropagation();srsRateById('${id}',0);renderFC(false)">Again</button><button class="srs-btn srs-h" onclick="event.stopPropagation();srsRateById('${id}',1);renderFC(false)">Hard</button><button class="srs-btn srs-g" onclick="event.stopPropagation();srsRateById('${id}',2);renderFC(false)">Good</button><button class="srs-btn srs-e" onclick="event.stopPropagation();srsRateById('${id}',3);renderFC(false)">Easy</button></div></div></div>`;
}
function renderFC(reinit=true){
  if(reinit){S.fcTab='all';S.fcTypeFilter='all';document.querySelectorAll('.fc-type-filter').forEach((b,i)=>b.classList.toggle('active',i===0));}
  const lb=document.getElementById('fcLangBtns');
  if(lb)lb.innerHTML=LANGS.map(l=>`<button class="vt-lb${S.fcLang===l.code?' active':''}" onclick="setFcLang('${l.code}',this)">${l.l}</button>`).join('');
  const cb=document.getElementById('fcClearBtn'),es=document.getElementById('fcExamSec'),ps=document.getElementById('fcPersonalSec'),sb=document.getElementById('fcSelectBar');
  const profileCards=getDeckViewCards();
  const inHub=!!S.deckGoalFilter;
  const goal=getActiveGoal();
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
    if(lb)lb.innerHTML=LANGS.map(l=>'<button class="vt-lb'+(S.fcLang===l.code?' active':'')+'" onclick="setFcLang(\''+l.code+'\',this)">'+l.l+'</button>').join('');
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
function renderStudyCard(cards){const sc=document.getElementById('fcStudy');if(S.studyIdx>=cards.length){sc.innerHTML=`<div style="text-align:center;padding:60px 0"><div style="font-size:32px;margin-bottom:14px">🎉</div><div style="font-size:20px;font-weight:700;margin-bottom:6px">Session complete!</div><p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px">All ${cards.length} cards reviewed.</p><button class="btn-start" onclick="setFcTab('all')" style="max-width:200px;margin:0 auto">Back to Deck</button></div>`;return;}const fc=cards[S.studyIdx],lang=fc.sourceLang==='de'?'de-DE':'en-GB',tr=fcCardTranslation(fc),ex=fcCardExample(fc),fci=S.flashcards.indexOf(fc),tb=typeof typeBadge==='function'?typeBadge(normWordType(fc.type||fc.pos)):'';
// C-1 fix: escape user-controlled word/translation/example before innerHTML insertion
const subject=fc.sourceLang||S.subject||'de';
const speakPhrase=typeof fcSpeakPhrase==='function'?fcSpeakPhrase(fc,subject):fc.word;
const wordHtml=typeof fcWordDisplayHtml==='function'?fcWordDisplayHtml(fc,subject):_fcEsc(fc.word);
const safeTr=_fcEsc(tr),safeEx=_fcEsc(ex),safePhonetic=_fcEsc(fc.phonetic||'');
sc.innerHTML=`<div style="text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:12px">${S.studyIdx+1} / ${cards.length}</div><div class="progress-track" style="margin-bottom:22px"><div class="progress-fill" style="width:${(S.studyIdx/cards.length)*100}%"></div></div><div class="fc-exam-sec" style="text-align:center"><div class="fc-study-word" style="font-size:36px;font-weight:800;margin-bottom:7px;font-family:var(--lc-font),serif;font-style:italic">${wordHtml}</div>${tb?`<div style="margin-bottom:8px">${tb}</div>`:''}${safePhonetic?`<div style="font-size:12px;color:var(--text-muted);font-family:'DM Mono',monospace;margin-bottom:8px">${safePhonetic}</div>`:''}<button class="btn-sm blue" onclick="speakBtn('${encodeURIComponent(speakPhrase)}','${lang}',this)">🔊 Pronounce</button><hr class="section-div" style="margin:16px 0"><div style="font-size:22px;font-weight:700;color:var(--purple);margin-bottom:7px">${safeTr}</div>${safeEx?`<div style="font-size:12px;color:var(--text-secondary);font-style:italic">${safeEx}</div>`:''}<div class="srs-row" style="margin-top:18px"><button class="srs-btn srs-a" onclick="srsRate(${fci},0);S.studyIdx++;renderStudyCard(cards)">Again</button><button class="srs-btn srs-h" onclick="srsRate(${fci},1);S.studyIdx++;renderStudyCard(cards)">Hard</button><button class="srs-btn srs-g" onclick="srsRate(${fci},2);S.studyIdx++;renderStudyCard(cards)">Good</button><button class="srs-btn srs-e" onclick="srsRate(${fci},3);S.studyIdx++;renderStudyCard(cards)">Easy</button></div></div>`;}
function fcIndexById(id){return S.flashcards.findIndex(f=>fcId(f)===id);}
function srsRateById(id,q){const i=fcIndexById(id);if(i>=0)srsRate(i,q);}
function flipCard(id){document.getElementById('fc_'+id)?.classList.toggle('flipped');}
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
function setFcLang(lang,btn){S.fcLang=lang;try{localStorage.setItem('lc_pref_xlat',lang);}catch(_){}document.querySelectorAll('#fcLangBtns .vt-lb').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');renderFC(false);if(typeof Auth!=='undefined'&&typeof Auth.pushSync==='function')Auth.pushSync();}
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
  const t=String(hintType||'').toLowerCase();
  let base='Hint';
  if(t==='synonym')base='Synonym';
  else if(t==='antonym')base='Antonym';
  const hl=String(hintLanguage||'').toLowerCase();
  const sl=String(sourceLang||'').toLowerCase();
  if(hl&&sl&&hl===sl&&hl!=='en'){
    const langName=hl==='de'?'German':hl==='es'?'Spanish':'English';
    return base+' ('+langName+')';
  }
  return base;
}
function veBackFromQuiz(){
  if(typeof _vocabHub!=='undefined'&&_vocabHub.veFromVocab&&typeof backToWorkspace==='function')backToWorkspace('vocabulary');
  else if(S.deckGoalFilter&&typeof openDeckHub==='function'){const g=getActiveGoal();if(g)openDeckHub(g.id);}
  else if(typeof goFlashcards==='function')goFlashcards(true);
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
  const words=pool.map(f=>String(f.word||'').trim()).filter(Boolean);
  if(words.length<4){lcToast('Select at least 4 words for the quiz.','warn');return;}
  hideAll();
  show('loadingScreen');
  const lt=document.getElementById('loaderTitle');
  const ls=document.getElementById('loaderSub');
  if(lt)lt.textContent='Generating quiz…';
  if(ls)ls.textContent='AI is writing hints from your vocabulary ('+creditCost+' credits)';
  const veGoal=getActiveGoal();
  const subject=veGoal?.subject||S.deckGoalFilter||S.subject||'de';
  const level=veGoal?.level||S.level||'B1';
  const hintLang=S.fcLang||S.vocabLang||'en';
  const hintLanguageMode=veHintLangMode();
  const qCount=Math.min(10,words.length);
  let questions=[];
  try{
    if(typeof generateVocabQuizWithAI!=='function')throw new Error('AI quiz unavailable');
    questions=await generateVocabQuizWithAI(words,{lang:subject,level,hintLang,hintLanguageMode,count:qCount});
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
  S.veScore=0;S.veIndex=0;
  S.vePool=pool;
  S.veQuestions=questions;
  S.veRetakeQuizId=null;
  S.veSavedQuizId=null;
  if(typeof SavedVocabQuizzes!=='undefined'&&SavedVocabQuizzes.persistAfterGeneration){
    S.veSavedQuizId=SavedVocabQuizzes.persistAfterGeneration({goal:veGoal,subject,level,hintLang,hintLanguageMode,questions,pool,questionCount:qCount});
  }
  hide('loadingScreen');
  if(typeof ActivityTrack!=='undefined')ActivityTrack.beginSession('vocab_quiz',veGoal?.id,'Vocabulary quiz');
  show('vocabExamScreen');
  document.getElementById('veTitle').textContent=questions.length+' questions';
  const lede=document.getElementById('veLede');
  if(lede){
    const gl=veGoal?goalLabel(veGoal):'Your deck';
    lede.innerHTML=esc(gl)+' · '+words.length+' words · AI hints · '+creditCost+' credits';
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
    const veDoneBtn='navBack()';
    const veDoneLbl='← Back to '+(_vocabHub.veFromVocab?'vocabulary':'deck');
    vc.innerHTML=`<div class="ws-panel ve-results-panel"><div class="ve-big ${pct>=70?'pass':pct>=50?'mid':'fail'}">${pct}%</div><p class="exam-config-lede">${S.veScore}/${S.veQuestions.length} correct</p><button class="btn-start" onclick="${veDoneBtn}" style="max-width:220px;margin:16px auto 0">${veDoneLbl}</button></div>`;
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
  document.getElementById('veProg').textContent=`Question ${S.veIndex+1} of ${S.veQuestions.length}`;
  document.getElementById('veScore').textContent=`Score: ${S.veScore}`;
  document.getElementById('veBar').style.width=(S.veIndex/S.veQuestions.length*100)+'%';
  const veGoal=getActiveGoal();
  const subject=veGoal?.subject||S.deckGoalFilter||S.subject||'de';
  const hintLbl=veHintTypeLabel(q.hintType,q.hintLanguage,subject);
  const qHtml=`<p class="ve-prompt-lbl">${esc(hintLbl)}</p><div class="ve-word ve-hint">${esc(q.hint||'')}</div><p class="ve-meta">Which word matches this clue?</p>`;
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
  document.getElementById('veScore').textContent=`Score: ${S.veScore}`;
  S.veAnswered=true;
  optsEl?.removeEventListener('click',ansVE);
  const fc=veFcForWord(targetWord);
  const tr=fc?fcCardTranslation(fc):'';
  const trLine=tr&&tr!=='—'?`<div class="ve-feedback-tr">${esc(tr)}</div>`:'';
  const fbClass=match?'ok':'bad';
  const fbLead=match?'✓ Correct!':'✗ Not quite — the answer is:';
  const fbHtml=`<div class="ve-feedback ${fbClass}"><div>${fbLead}</div><div class="ve-feedback-word">${esc(targetWord)}</div>${trLine}</div><button type="button" class="btn-start ve-next" onclick="veNextQuestion()">${S.veIndex+1>=S.veQuestions.length?'See results →':'Next question →'}</button>`;
  document.getElementById('veContent')?.insertAdjacentHTML('beforeend',fbHtml);
}
