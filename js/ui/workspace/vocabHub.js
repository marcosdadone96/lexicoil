// ═══════════════════════════════════════════
// EXAM GOALS
// ═══════════════════════════════════════════
function commitVocabHubFlashcardSession(){
  if(typeof _vocabHub==='undefined'||_vocabHub.activity!=='flashcards'||_vocabHub._fcSessionCommitted)return;
  const goal=(typeof getActiveGoal==='function'?getActiveGoal():null)||S.goals.find(g=>g.id===_vocabHub.goalId);
  if(!goal)return;
  const deck=typeof deckForGoal==='function'?deckForGoal(goal):(S.flashcards||[]);
  const words=[];
  (S.fcSelected||new Set()).forEach((id)=>{
    const fc=deck.find(f=>fcId(f)===id);
    if(fc&&fc.word)words.push(String(fc.word).trim());
  });
  const uniq=[...new Set(words.filter(Boolean))];
  if(!uniq.length)return;
  _vocabHub._fcSessionCommitted=true;
  if(typeof VocabBatching!=='undefined'&&VocabBatching.recordActivityUsage){
    VocabBatching.recordActivityUsage(goal,'flashcards',uniq);
  }
  if(S._fcSavedSetId&&typeof SavedFlashcardSets!=='undefined'&&SavedFlashcardSets.recordPlay){
    SavedFlashcardSets.recordPlay(S._fcSavedSetId);
  }
  if(typeof SavedVocabPractice!=='undefined'&&SavedVocabPractice.refreshDom){
    SavedVocabPractice.refreshDom(goal);
  }
  if(typeof refreshVocabHubPanel==='function')refreshVocabHubPanel();
}
function clearVocabHubFlashcardMode(){
  commitVocabHubFlashcardSession();
  if(typeof _vocabHub!=='undefined'){
    _vocabHub.flashcardMode=false;
    _vocabHub.activity=null;
    _vocabHub.veFromVocab=false;
    _vocabHub._fcSessionCommitted=false;
  }
}
const _vocabHubGenderAiPending=new Set();
/** Async AI gender for deck rows the lexicon missed (same net as tap-to-save / manual add). */
function vocabHubEnsureGenderAi(goal){
  if(!goal||typeof ManualVocab==='undefined'||!ManualVocab.enrichGenderAiFallback)return;
  const deck=deckForGoal(goal)||[];
  deck.forEach((fc)=>{
    const id=fcId(fc);
    if(_vocabHubGenderAiPending.has(id))return;
    if(!ManualVocab.needsAiGenderFallback(fc,goal.subject))return;
    _vocabHubGenderAiPending.add(id);
    ManualVocab.enrichGenderAiFallback(fc,goal.subject).then(()=>{
      _vocabHubGenderAiPending.delete(id);
      if(fc.article||fc.plural){
        if(typeof saveFC==='function')saveFC();
        refreshVocabHubPanel();
      }
    }).catch(()=>{_vocabHubGenderAiPending.delete(id);});
  });
}
function setVocabHubFcLang(code,btn){
  if(typeof setVocabUiLang==='function')setVocabUiLang(code,btn);
  else{S.fcLang=typeof clampVocabUiLang==='function'?clampVocabUiLang(code,'en'):code;document.querySelectorAll('#vvFcLangBtns .vt-lb').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');}
  if(typeof refreshFlashcardTranslationsForUiLang==='function')void refreshFlashcardTranslationsForUiLang();
  else renderFcSingleView();
}
/** Deck view: active goal deck (lang + level); else ExamProfile-scoped cards. */
function getDeckViewCards(){
  const goal=(typeof getActiveGoal==='function')?getActiveGoal():null;
  if(goal)return deckForGoal(goal);
  const ap=typeof ExamProfile!=='undefined'?ExamProfile.getActive():null;
  if(ap){
    const pseudo={subject:ap.subject,level:ap.level};
    return(S.flashcards||[]).filter(f=>fcMatchesGoal(f,pseudo));
  }
  return S.flashcards||[];
}
function readinessQualLabel(pct,examCount){
  if(examCount<2||pct<25)return 'Getting started';
  if(pct<25)return 'early days';
  if(pct<50)return 'building momentum';
  if(pct<70)return 'on track';
  if(pct<85)return 'getting close';
  return 'well prepared';
}
function readinessEstLabelHtml(pct,hasData,examCount){
  if(!hasData)return 'est. <b>—</b>';
  const qual=readinessQualLabel(pct,examCount||0);
  if(examCount<2||pct<25)return qual;
  return 'est. <b>'+pct+'% ready</b> · '+qual;
}
function readinessIsEarlyDays(pct,examCount){
  return !examCount||examCount<2||pct<25;
}
function readinessRingColor(pct,hasData,examCount){
  if(!hasData||readinessIsEarlyDays(pct,examCount))return'var(--brand)';
  if(pct>=50)return'var(--green)';
  if(pct>=40)return'var(--amber,#f59e0b)';
  return'var(--amber,#f59e0b)';
}
function readinessRingSvg(pct,hasData,examCount){
  const circ=226;
  const early=readinessIsEarlyDays(pct,examCount);
  const showPct=hasData&&!early;
  const off=showPct?Math.round(circ*(1-Math.min(100,Math.max(0,pct))/100)):circ;
  const col=readinessRingColor(pct,hasData,examCount);
  return'<svg width="84" height="84" aria-hidden="true"><circle cx="42" cy="42" r="36" fill="none" stroke="var(--border)" stroke-width="8"/><circle cx="42" cy="42" r="36" fill="none" stroke="'+col+'" stroke-width="8" stroke-linecap="round" stroke-dasharray="'+circ+'" stroke-dashoffset="'+off+'"/></svg>';
}
function readinessRingCaption(pct,hasData,examCount){
  if(!hasData)return'—';
  if(readinessIsEarlyDays(pct,examCount))return'Getting started';
  return pct+'%';
}
function formatScoreAge(dateStr){
  if(!dateStr)return'recent';
  const d=new Date(dateStr);
  if(isNaN(d.getTime()))return String(dateStr);
  const days=Math.floor((Date.now()-d)/86400000);
  if(days<=0)return'today';
  if(days===1)return'yesterday';
  if(days<7)return days+' days ago';
  if(days<14)return'last week';
  const weeks=Math.floor(days/7);
  if(weeks<5)return weeks+' wks ago';
  return d.toLocaleDateString();
}
const _vocabHub={goalId:null,filter:'all',selectedIds:new Set(),collapsed:new Set(),expanded:new Set(),flashcardMode:false,activity:null,veFromVocab:false,manualAddOpen:false,pickActivity:null,textosTopic:null,textosTeil:null,textosExcludeIds:[],textosPayload:null,textosLoading:false,textosError:null};
const VV_PICK={
  flashcards:{min:()=>VV_MIN_FLASH,label:'Flashcards',cap:()=>VV_MAX_FLASH},
  vocab_quiz:{min:()=>VV_MIN_DRILL,label:'AI quiz',cap:(c)=>c.quiz},
  listening_game:{min:()=>VV_MIN_LISTEN,label:'Listening game',cap:(c)=>c.listen},
  vocab_phrases:{min:()=>VV_MIN_PHRASES,label:'Phrases',cap:(c)=>c.phrases},
  custom_exam:{min:()=>VV_MIN_CUSTOM,label:'Custom exam',cap:()=>null},
};
const VH_POS_ORDER=['noun','verb','adjective','adverb','other'];
const VV_SEMI_OPEN=5;
function vocabHubResolveType(fc,subject){
  if(typeof ManualVocab!=='undefined'&&ManualVocab.inferPos)return ManualVocab.inferPos(fc,subject);
  const t=typeof normWordType==='function'?normWordType(fc.type||fc.pos):'';
  return t||'other';
}
const VV_MIN_CUSTOM=4;
const VV_MIN_DRILL=4;
const VV_MIN_FLASH=3;
const VV_MAX_FLASH=10;
const VV_MIN_LISTEN=3;
const VV_MIN_PHRASES=2;
function vocabHubActivityCaps(){
  const c=typeof VocabBatching!=='undefined'&&VocabBatching.ACTIVITY_CAPACITY?VocabBatching.ACTIVITY_CAPACITY:{vocab_quiz:10,listening_game:6,vocab_phrases:7};
  return{quiz:c.vocab_quiz||10,listen:c.listening_game||6,phrases:c.vocab_phrases||7};
}
function vocabHubSelectionCap(){
  const act=_vocabHub.pickActivity;
  const caps=vocabHubActivityCaps();
  if(!act)return Math.max(caps.quiz,caps.listen,caps.phrases);
  const meta=VV_PICK[act];
  if(!meta||!meta.cap)return 9999;
  const c=meta.cap(caps);
  return c==null?9999:c;
}
function vocabHubMinForPick(){
  const act=_vocabHub.pickActivity;
  if(!act||!VV_PICK[act])return VV_MIN_CUSTOM;
  return VV_PICK[act].min();
}
function vocabHubUsedActivityKeys(goal,fc){
  const w=String(fc?.word||'').trim().toLowerCase();
  if(!w||!goal?.vocabActivityStats)return[];
  const keys=[];
  for(const[statsKey,blob]of Object.entries(goal.vocabActivityStats)){
    const covered=blob?.plan?.covered;
    if(!Array.isArray(covered))continue;
    if(covered.some((x)=>String(x).toLowerCase()===w))keys.push(statsKey);
  }
  return keys;
}
function vocabHubUsedBadgeHtml(goal,fc){
  const keys=vocabHubUsedActivityKeys(goal,fc);
  if(!keys.length)return'';
  const icons=keys.map((k)=>{
    if(k==='vocab_quiz')return'⚡';
    if(k==='listening_game')return'🎧';
    if(k==='vocab_phrases')return'💬';
    if(k==='flashcards')return'▭';
    if(k.startsWith('personal:'))return'✦';
    return'·';
  }).join('');
  const title='Used in practice: '+keys.map((k)=>(k.startsWith('personal:')?'custom exam':k.replace(/_/g,' '))).join(', ');
  return'<span class="vv-used-mark" title="'+esc(title)+'" aria-label="'+esc(title)+'">'+icons+'</span>';
}
function vocabHubUsedLegendSnippet(){
  return' <span class="vv-legend-used">⚡🎧💬▭✦ = used before (you can pick again for new content)</span>';
}
function vocabHubAtSelectionCap(goal){
  return vocabHubSelectedIds(goal).length>=vocabHubSelectionCap();
}
function fcTranslation(fc){
  if(typeof fcCardTranslation==='function')return fcCardTranslation(fc);
  if(!fc)return'';
  if(fc.translation)return fc.translation;
  if(fc.meaning)return fc.meaning;
  const tr=fc.translations&&(fc.translations[S.fcLang]||Object.values(fc.translations||{})[0]);
  return tr||'';
}
function vocabHubStruggling(deck){
  return[...deck].filter(f=>(f.missCount||0)>=1).sort((a,b)=>(b.missCount||0)-(a.missCount||0));
}
function vocabHubStrugglingCount(goal){
  return vocabHubStruggling(deckForGoal(goal)).length;
}
function vocabHubFilteredDeck(goal){
  const deck=deckForGoal(goal);
  if(_vocabHub.filter==='due')return deck.filter(isDue);
  if(_vocabHub.filter==='struggling')return vocabHubStruggling(deck);
  if(_vocabHub.filter==='new')return deck.filter(f=>!f.nextReview&&(f.interval==null||f.interval<=1));
  if(_vocabHub.filter==='mastered')return deck.filter(f=>f.interval&&f.interval>7);
  if(_vocabHub.filter==='difficult')return deck.filter(f=>(f.missCount||0)>=2);
  return deck;
}
function normalizeVocabDeckPos(goal){
  if(typeof ManualVocab==='undefined'||!ManualVocab.enrichFlashcard)return;
  let dirty=false;
  deckForGoal(goal).forEach(f=>{
    const before=f.word+'|'+f.type+'|'+f.gender+'|'+f.article;
    ManualVocab.enrichFlashcard(f,goal.subject);
    const after=f.word+'|'+f.type+'|'+f.gender+'|'+f.article;
    if(before!==after)dirty=true;
    if(ManualVocab.spellingSuggestionForAsync){
      void ManualVocab.spellingSuggestionForAsync(f.word,goal.subject,f).then(sug=>{
        if(f.spellingDismissed)return;
        if(sug&&sug.toLowerCase()!==String(f.word||'').toLowerCase()){
          f._spellingSuggestion=sug;
          if(typeof refreshVocabHubPanel==='function')refreshVocabHubPanel();
        }
      });
    }
  });
  if(dirty)saveFC();
}
function dismissVocabHubSpelling(id){
  const fc=(S.flashcards||[]).find(f=>fcId(f)===id);
  if(!fc)return;
  fc.spellingDismissed=true;
  delete fc._spellingSuggestion;
  saveFC();
  refreshVocabHubPanel();
}
window.dismissVocabHubSpelling=dismissVocabHubSpelling;
function fixVocabHubSpelling(id){
  const fc=(S.flashcards||[]).find(f=>fcId(f)===id);
  const goal=S.goals.find(g=>g.id===_vocabHub.goalId);
  if(!fc||!fc._spellingSuggestion)return;
  if(typeof ManualVocab!=='undefined'&&ManualVocab.applySpellingFixToFlashcard){
    ManualVocab.applySpellingFixToFlashcard(fc,goal?.subject||fc.sourceLang,fc._spellingSuggestion);
    delete fc._spellingSuggestion;
    saveFC();
    refreshVocabHubPanel();
    lcToast('Corrected: '+fc.word,'success');
  }
}
window.fixVocabHubSpelling=fixVocabHubSpelling;
function ensureVocabHubState(goal){
  ensureFcIds();
  if(_vocabHub.goalId!==goal.id){
    if(_vocabHub.activity==='flashcards'&&typeof commitVocabHubFlashcardSession==='function')commitVocabHubFlashcardSession();
    _vocabHub.goalId=goal.id;
    _vocabHub.filter='all';
    _vocabHub.selectedIds=new Set();
    _vocabHub.collapsed=new Set();
    _vocabHub.expanded=new Set();
    _vocabHub.activity=null;
    _vocabHub.flashcardMode=false;
    _vocabHub.pickActivity=null;
    _vocabHub.textosTopic=null;
    _vocabHub.textosTeil=null;
    _vocabHub.textosPayload=null;
    _vocabHub.textosExcludeIds=[];
  }
  normalizeVocabDeckPos(goal);
}
function vocabOverviewBreakdown(goal){
  const deck=deckForGoal(goal);
  const counts={noun:0,verb:0,adjective:0,adverb:0,other:0};
  deck.forEach(f=>{
    const t=vocabHubResolveType(f,goal.subject);
    const key=VH_POS_ORDER.includes(t)?t:'other';
    counts[key]++;
  });
  const dueN=dueForGoal(goal).length;
  const parts=[];
  if(counts.noun)parts.push(counts.noun+' noun'+(counts.noun===1?'':'s'));
  if(counts.verb)parts.push(counts.verb+' verb'+(counts.verb===1?'':'s'));
  if(counts.adjective)parts.push(counts.adjective+' adjective'+(counts.adjective===1?'':'s'));
  if(counts.adverb)parts.push(counts.adverb+' adverb'+(counts.adverb===1?'':'s'));
  if(counts.other)parts.push(counts.other+' other');
  const line=parts.length?parts.join(' · '):'No words saved yet';
  return{total:deck.length,due:dueN,line};
}
function fcGenderArticle(fc,subject){
  const sub=subject||fc.sourceLang||'';
  const t=vocabHubResolveType(fc,sub);
  if(t!=='noun')return null;
  if(fc.plural)return{article:'die',cls:'vv-art--fem'};
  let raw=String(fc.gender||fc.article||'').toLowerCase().trim();
  if(!raw&&typeof ManualVocab!=='undefined'&&ManualVocab.parseLeadingArticle){
    const p=ManualVocab.parseLeadingArticle(fc.word,sub);
    if(p.article)raw=p.article;
  }
  if(!raw)return null;
  if(sub==='de'){
    if(raw==='m'||raw==='masc'||raw==='masculine'||raw==='der')return{article:'der',cls:'vv-art--masc'};
    if(raw==='f'||raw==='fem'||raw==='feminine'||raw==='die')return{article:'die',cls:'vv-art--fem'};
    if(raw==='n'||raw==='neut'||raw==='neuter'||raw==='neutral'||raw==='das')return{article:'das',cls:'vv-art--neut'};
    return null;
  }
  if(sub==='es'){
    if(raw==='m'||raw==='masc'||raw==='masculine'||raw==='el')return{article:'el',cls:'vv-art--masc'};
    if(raw==='f'||raw==='fem'||raw==='feminine'||raw==='la')return{article:'la',cls:'vv-art--fem'};
    return null;
  }
  return null;
}
function vocabHubGroupDeck(goal){
  const groups={noun:[],verb:[],adjective:[],adverb:[],other:[]};
  vocabHubFilteredDeck(goal).forEach(f=>{
    const t=vocabHubResolveType(f,goal.subject);
    const key=VH_POS_ORDER.includes(t)?t:'other';
    groups[key].push(f);
  });
  return groups;
}
function expandVocabHubSection(type){
  _vocabHub.expanded.add(type);
  refreshVocabHubPanel();
}
function vocabHubSelectAllInSection(type){
  const goal=S.goals.find(g=>g.id===_vocabHub.goalId);
  if(!goal)return;
  const cap=vocabHubSelectionCap();
  (vocabHubGroupDeck(goal)[type]||[]).forEach(f=>{
    if(_vocabHub.selectedIds.size>=cap&&!_vocabHub.selectedIds.has(fcId(f)))return;
    _vocabHub.selectedIds.add(fcId(f));
  });
  refreshVocabHubPanel();
}
function vocabHubDeselectAllInSection(type){
  const goal=S.goals.find(g=>g.id===_vocabHub.goalId);
  if(!goal)return;
  (vocabHubGroupDeck(goal)[type]||[]).forEach(f=>_vocabHub.selectedIds.delete(fcId(f)));
  refreshVocabHubPanel();
}
function vocabHubDeselectAll(){
  _vocabHub.selectedIds.clear();
  refreshVocabHubPanel();
}
function vocabHubSelectAllVisible(){
  const goal=S.goals.find(g=>g.id===_vocabHub.goalId);
  if(!goal)return;
  const cap=vocabHubSelectionCap();
  vocabHubFilteredDeck(goal).forEach(f=>{
    if(_vocabHub.selectedIds.size>=cap&&!_vocabHub.selectedIds.has(fcId(f)))return;
    _vocabHub.selectedIds.add(fcId(f));
  });
  refreshVocabHubPanel();
}
function vocabHubCancelPick(){
  _vocabHub.pickActivity=null;
  refreshVocabHubPanel();
}
function vocabHubCanStartPick(goal){
  return vocabHubSelectedIds(goal).length>=vocabHubMinForPick();
}
function vocabHubStartPick(){
  const goal=S.goals.find(g=>g.id===_vocabHub.goalId);
  if(!goal||!_vocabHub.pickActivity)return;
  if(!vocabHubCanStartPick(goal)){
    lcToast('Select at least '+vocabHubMinForPick()+' word'+(vocabHubMinForPick()===1?'':'s')+'.','warn');
    return;
  }
  const act=_vocabHub.pickActivity;
  _vocabHub.pickActivity=null;
  if(act==='flashcards')launchVocabHubFlashcards();
  else if(act==='vocab_quiz')launchVocabHubQuickDrill();
  else if(act==='listening_game')startHorenGameFromHub();
  else if(act==='vocab_phrases')launchVocabHubPhrases();
  else if(act==='custom_exam')launchVocabHubCustomExam();
}
function vocabHubTapActivity(act){
  const goal=S.goals.find(g=>g.id===_vocabHub.goalId);
  if(!goal||!deckForGoal(goal).length)return;
  if(_vocabHub.pickActivity===act&&vocabHubCanStartPick(goal)){
    vocabHubStartPick();
    return;
  }
  _vocabHub.pickActivity=act;
  _vocabHub.selectedIds.clear();
  refreshVocabHubPanel();
  setTimeout(()=>document.getElementById('vocabHubPickBar')?.scrollIntoView({behavior:'smooth',block:'nearest'}),80);
}
function vocabHubCardAttrs(baseClass,actKey,disabled){
  const picked=_vocabHub.pickActivity===actKey?' ws-exam-card--picked':'';
  const dis=disabled?' disabled':'';
  return' type="button" class="'+baseClass+picked+'"'+dis+(disabled?'':' onclick="vocabHubTapActivity(\''+actKey+'\')"');
}
function vocabHubDisplayWord(fc,subject){
  const sub=subject||fc.sourceLang||'';
  if(typeof ManualVocab!=='undefined'&&ManualVocab.parseLeadingArticle){
    const p=ManualVocab.parseLeadingArticle(fc.word,sub);
    if(p.article)return p.word;
  }
  return fc.word;
}
function fcWordDisplayHtml(fc,subject){
  const sub=subject||fc?.sourceLang||'';
  if(typeof ManualVocab!=='undefined'&&ManualVocab.enrichFlashcard)ManualVocab.enrichFlashcard(fc,sub);
  const art=fcGenderArticle(fc,sub);
  const word=vocabHubDisplayWord(fc,sub);
  const wordEsc=typeof esc==='function'?esc(word):String(word||'');
  if(!art)return wordEsc;
  const artEsc=typeof esc==='function'?esc(art.article):art.article;
  return'<span class="fc-word-line"><span class="vv-art '+art.cls+'">'+artEsc+'</span><span class="fc-word-lemma">'+wordEsc+'</span></span>';
}
function fcSpeakPhrase(fc,subject){
  const sub=subject||fc?.sourceLang||'';
  if(typeof ManualVocab!=='undefined'&&ManualVocab.enrichFlashcard)ManualVocab.enrichFlashcard(fc,sub);
  const art=fcGenderArticle(fc,sub);
  const word=vocabHubDisplayWord(fc,sub);
  return art?(art.article+' '+word):String(fc?.word||word||'');
}
function vocabHubRowHtml(f,goal){
  const id=fcId(f);
  const on=_vocabHub.selectedIds.has(id);
  const atCap=vocabHubAtSelectionCap(goal);
  const lock=!on&&atCap;
  const tr=fcTranslation(f);
  if(typeof ManualVocab!=='undefined'&&ManualVocab.enrichFlashcard)ManualVocab.enrichFlashcard(f,goal.subject);
  const art=fcGenderArticle(f,goal.subject);
  const artHtml=art
    ?'<span class="vv-art '+art.cls+'">'+esc(art.article)+'</span>'
    :'';
  const word=vocabHubDisplayWord(f,goal.subject);
  const tip=tr?esc(tr).replace(/"/g,'&quot;'):'';
  const wordSpan=tr
    ?'<span class="vv-row-word" data-tip="'+tip+'" title="'+tip+'" tabindex="0">'+esc(word)+'</span>'
    :'<span class="vv-row-word">'+esc(word)+'</span>';
  const usedMark=vocabHubUsedBadgeHtml(goal,f);
  const labelInner=art
    ?'<span class="vv-word-cell">'+artHtml+wordSpan+usedMark+'</span>'
    :wordSpan+usedMark;
  const spellFix=f._spellingSuggestion&&!f.spellingDismissed
    ?'<span class="vv-spell-wrap"><button type="button" class="vv-spell-fix" onclick="event.preventDefault();event.stopPropagation();fixVocabHubSpelling(\''+esc(id)+'\')" title="Apply spelling suggestion">'+esc(f._spellingSuggestion)+'?</button><button type="button" class="vv-spell-dismiss" onclick="event.preventDefault();event.stopPropagation();dismissVocabHubSpelling(\''+esc(id)+'\')" title="Keep my spelling" aria-label="Dismiss suggestion">×</button></span>'
    :'';
  const posType=vocabHubResolveType(f,goal.subject);
  const conjHtml=(posType==='verb'&&typeof VerbConjugation!=='undefined'&&VerbConjugation.conjugationSelectHtml)
    ?VerbConjugation.conjugationSelectHtml(f,goal,id)
    :'';
  const verbRow=conjHtml?`<div class="vv-conj-row">${conjHtml}</div>`:'';
  return'<div class="vv-row'+(posType==='verb'?' vv-row--verb':'')+(lock?' vv-row--cap-lock':'')+'"><label class="vv-row-main'+(lock?' vv-row-main--disabled':'')+'"><input type="checkbox"'+(on?' checked':'')+(lock?' disabled':'')+' onchange="toggleVocabHubWord(\''+esc(id)+'\')" aria-label="Select '+esc(word)+'">'+labelInner+spellFix+'</label><button type="button" class="vv-del" onclick="delFCById(\''+esc(id)+'\')" aria-label="Remove '+esc(word)+'" title="Remove word">×</button>'+verbRow+'</div>';
}
function vocabHubSectionHtml(type,items,goal){
  if(!items.length)return'';
  const lbl=typeof fcTypeSectionLabel==='function'?fcTypeSectionLabel(type):type;
  const expanded=_vocabHub.expanded.has(type);
  const visible=expanded?items:items.slice(0,VV_SEMI_OPEN);
  const hidden=(!expanded&&items.length>VV_SEMI_OPEN)?items.length-VV_SEMI_OPEN:0;
  const rows=visible.map(f=>vocabHubRowHtml(f,goal)).join('');
  const moreBtn=hidden?'<button type="button" class="vv-more" onclick="expandVocabHubSection(\''+type+'\')">+ '+hidden+' more</button>':'';
  return'<div class="vv-grp vv-col"><div class="vv-ghead"><span class="vv-gh">'+esc(lbl)+' · '+items.length+'</span><span class="vv-ghead-actions"><button type="button" class="vv-selall" onclick="vocabHubSelectAllInSection(\''+type+'\')">Select all</button><button type="button" class="vv-selall vv-selnone" onclick="vocabHubDeselectAllInSection(\''+type+'\')">Deselect</button></span></div><div class="vv-rows">'+rows+'</div>'+moreBtn+'</div>';
}
function vocabHubAccordionHtml(goal){
  const groups=vocabHubGroupDeck(goal);
  const parts=VH_POS_ORDER.map(t=>vocabHubSectionHtml(t,groups[t],goal)).filter(Boolean);
  if(!parts.length)return'<p style="font-size:13px;color:var(--text-muted);margin:0">No words match this filter.</p>';
  return'<div class="vv-cols">'+parts.join('')+'</div>';
}
function vocabHubLegendHtml(goal){
  const hint='<span class="vv-legend-hint">Hover a word to see its translation.</span>';
  const used=vocabHubUsedLegendSnippet();
  if(goal.subject==='de')return'<p class="vv-legend">der <b class="art-masc">blue</b> · die <b class="art-fem">red</b> · das <b class="art-neut">green</b> · '+hint+used+'</p>';
  if(goal.subject==='es')return'<p class="vv-legend">el <b class="art-masc">blue</b> · la <b class="art-fem">red</b> · '+hint+used+'</p>';
  return'<p class="vv-legend">'+hint+used+'</p>';
}
function vocabHubListToolbarHtml(){
  if(!_vocabHub.pickActivity)return'';
  const cap=vocabHubSelectionCap();
  const capNote=cap<9999?' (max '+cap+')':'';
  return'<div class="vv-list-toolbar"><button type="button" class="vv-selall" onclick="vocabHubSelectAllVisible()">Select all'+capNote+'</button><button type="button" class="vv-selall vv-selnone" onclick="vocabHubDeselectAll()">Deselect all</button></div>';
}
function vocabHubPickBarHtml(goal){
  const act=_vocabHub.pickActivity;
  if(!act||!VV_PICK[act])return'';
  const meta=VV_PICK[act];
  const caps=vocabHubActivityCaps();
  const capN=meta.cap?meta.cap(caps):null;
  const min=meta.min();
  const selN=vocabHubSelectedIds(goal).length;
  const can=vocabHubCanStartPick(goal);
  const range=capN?min+'–'+capN+' words':'at least '+min+' word'+(min===1?'':'s');
  const startLbl=can?'Start '+meta.label:'Select '+range;
  return'<div class="vv-pick-bar" id="vocabHubPickBar">'+
    '<p class="vv-pick-bar-title"><b>'+esc(meta.label)+'</b> · tick words below ('+range+') · <b>'+selN+'</b> selected</p>'+
    '<p class="vv-pick-bar-hint">Tap the same activity card again or press Start when you have enough words.</p>'+
    '<div class="vv-pick-bar-actions">'+
    '<button type="button" class="btn-sm accent"'+(can?' onclick="vocabHubStartPick()"':' disabled')+'>'+esc(startLbl)+'</button>'+
    '<button type="button" class="btn-sm" onclick="vocabHubCancelPick()">Cancel</button>'+
    '</div></div>';
}
function vocabHubSelNoteHtml(selN,deckLen){
  if(!deckLen)return'';
  const caps=vocabHubActivityCaps();
  const act=_vocabHub.pickActivity;
  if(!act){
    return'<p class="vv-selnote" id="vocabHubSummary">Tap an activity above, then select words · Quiz up to '+caps.quiz+', Listening '+caps.listen+', Phrases '+caps.phrases+'</p>';
  }
  const meta=VV_PICK[act];
  const cap=vocabHubSelectionCap();
  const min=meta?meta.min():VV_MIN_CUSTOM;
  let extra=' · <b>'+selN+'</b> selected';
  if(cap<9999)extra+=' · max '+cap+' for this activity';
  if(selN>=cap&&cap<9999)extra+=' · limit reached — untick to swap';
  if(selN<min)extra+=' · need at least '+min+' to start';
  return'<p class="vv-selnote" id="vocabHubSummary">'+esc(meta.label)+extra+'</p>';
}
function toggleVocabHubManualAdd(){
  _vocabHub.manualAddOpen=!_vocabHub.manualAddOpen;
  refreshVocabHubPanel();
  if(_vocabHub.manualAddOpen){
    setTimeout(()=>document.getElementById('vvAddWord')?.focus(),50);
  }
}
window.vocabHubTapActivity=vocabHubTapActivity;
window.vocabHubStartPick=vocabHubStartPick;
window.vocabHubCancelPick=vocabHubCancelPick;
window.vocabHubDeselectAll=vocabHubDeselectAll;
window.vocabHubDeselectAllInSection=vocabHubDeselectAllInSection;
window.vocabHubSelectAllVisible=vocabHubSelectAllVisible;
function vocabHubManualAddHtml(){
  const open=!!_vocabHub.manualAddOpen;
  const toggleBtn='<button type="button" class="vv-add-toggle" onclick="toggleVocabHubManualAdd()" aria-expanded="'+(open?'true':'false')+'"><span class="vv-add-toggle-ic" aria-hidden="true">+</span> Add a word manually</button>';
  if(!open)return toggleBtn;
  return toggleBtn+
    '<div class="vv-add-expand">'+
    '<div class="vv-add-row">'+
    '<input class="fc-add-input" id="vvAddWord" placeholder="Word in exam language…" onkeydown="if(event.key===\'Enter\')submitManualVocab(\'hub\')" oninput="clearManualAddHint(\'hub\')">'+
    '<input class="fc-add-input" id="vvAddTrans" placeholder="Translation (if not in library)…" onkeydown="if(event.key===\'Enter\')submitManualVocab(\'hub\')">'+
    '<button type="button" class="btn-sm accent" onclick="submitManualVocab(\'hub\')" style="padding:10px 16px">Add</button></div>'+
    '<div id="vvAddHint" class="vv-add-hint" style="display:none"></div>'+
    '<p class="note" style="margin:8px 0 0;font-size:11px">Tip: type <b>der/die/das</b> before a noun, or we infer it from the lexicon.</p></div>';
}
function vocabHubActionsHtml(selN){
  const goal=getActiveGoal();
  const deckLen=goal?deckForGoal(goal).length:0;
  const noDeck=!deckLen;
  const creditBadgeAlways=(action)=>' <span class="ai-credit-badge">'+((typeof formatCreditCost==='function'&&typeof aiActionCost==='function')?formatCreditCost(aiActionCost(action)):action)+'</span>';
  const proBadge=' <span class="vv-pro-badge">Pro</span>';
  const persAllowed=goal&&(typeof isPersonalizedAllowed!=='function'||isPersonalizedAllowed(goal.subject,goal.level));
  const aiAllowed=goal&&(typeof isAiFeatureAllowed!=='function'||isAiFeatureAllowed(goal.subject,goal.level));
  const personalBadge=typeof canUsePersonalized==='function'&&!canUsePersonalized()?proBadge:creditBadgeAlways('personal_exam');
  const quizBadge=creditBadgeAlways('vocab_quiz');
  const listenBadge=creditBadgeAlways('listening_game');
  const phrasesBadge=creditBadgeAlways('vocab_phrases');
  const caps=vocabHubActivityCaps();
  const customCard=persAllowed
    ?'<button'+vocabHubCardAttrs('ws-exam-card ws-exam-card--personal','custom_exam',noDeck)+'><span class="ws-exam-card-ic">✦</span><span class="ws-exam-card-title">Custom exam'+personalBadge+'</span><span class="ws-exam-card-desc">Pick '+VV_MIN_CUSTOM+'+ words · then configure</span></button>'
    :'';
  const quizCard=aiAllowed
    ?'<button'+vocabHubCardAttrs('ws-exam-card ws-exam-card--oral','vocab_quiz',noDeck)+'><span class="ws-exam-card-ic">⚡</span><span class="ws-exam-card-title">AI quiz'+quizBadge+'</span><span class="ws-exam-card-desc">Select '+VV_MIN_DRILL+'–'+caps.quiz+' words · hint → pick word</span></button>'
    :'';
  const listenCard=aiAllowed
    ?'<button'+vocabHubCardAttrs('ws-exam-card ws-exam-card--practice','listening_game',noDeck)+'><span class="ws-exam-card-ic">🎧</span><span class="ws-exam-card-title">Listening game'+listenBadge+'</span><span class="ws-exam-card-desc">Select '+VV_MIN_LISTEN+'–'+caps.listen+' words · hear & spot</span></button>'
    :'';
  const phrasesCard=aiAllowed
    ?'<button'+vocabHubCardAttrs('ws-exam-card ws-exam-card--oral','vocab_phrases',noDeck)+'><span class="ws-exam-card-ic">💬</span><span class="ws-exam-card-title">Phrases'+phrasesBadge+'</span><span class="ws-exam-card-desc">Select '+VV_MIN_PHRASES+'–'+caps.phrases+' words · gap + order</span></button>'
    :'';
  const textosCard=(goal&&typeof textosSupportedForGoal==='function'&&textosSupportedForGoal(goal))
    ?(()=>{const vt=typeof vocabT==='function'?vocabT():null;return '<button type="button" class="ws-exam-card ws-exam-card--practice" onclick="launchVocabHubTextos()"><span class="ws-exam-card-ic">📖</span><span class="ws-exam-card-title">'+(vt?vt.textosTitle:'Texts')+'</span><span class="ws-exam-card-desc">'+(vt?vt.textosDesc:'Pick a topic · read-only · tap words to translate')+'</span></button>';})()
    :'';
  let grid='';
  if(customCard){
    grid+='<div class="ws-exam-grid ws-exam-grid--vocab" style="grid-template-columns:1fr">'+customCard+'</div>';
  }
  grid+='<div class="ws-exam-grid ws-exam-grid--vocab" style="grid-template-columns:1fr 1fr">'+
    '<button'+vocabHubCardAttrs('ws-exam-card ws-exam-card--practice','flashcards',noDeck)+'><span class="ws-exam-card-ic">▭</span><span class="ws-exam-card-title">Flashcards</span><span class="ws-exam-card-desc">Select '+VV_MIN_FLASH+'–'+VV_MAX_FLASH+' words · spaced review</span></button>'+
    textosCard+
    '</div>';
  if(quizCard||listenCard){
    grid+='<div class="ws-exam-grid ws-exam-grid--vocab ws-exam-grid--vocab-second" style="grid-template-columns:1fr 1fr">'+(quizCard||'')+(listenCard||'')+'</div>';
  }
  if(phrasesCard){
    grid+='<div class="ws-exam-grid ws-exam-grid--vocab ws-exam-grid--vocab-second" style="grid-template-columns:1fr">'+phrasesCard+'</div>';
  }
  return grid;
}
function renderWsVocabFilterChipsHtml(goal){
  const deck=deckForGoal(goal);
  const dueN=dueForGoal(goal).length;
  const strugN=vocabHubStrugglingCount(goal);
  const newN=countNewWords(goal);
  const mastN=countMasteredWords(goal);
  const diffN=countDifficultWords(goal);
  const filt=_vocabHub.filter||'all';
  const vt=typeof vocabT==='function'?vocabT():null;
  const filterChip=(key,lbl,n)=>'<button type="button" class="vv-filter'+(filt===key?' on':'')+'" onclick="setVocabHubFilter(\''+key+'\')">'+lbl+' · '+n+'</button>';
  return'<div class="vv-filters vv-filters--merged">'+filterChip('all',vt?vt.filterAll:'All',deck.length)+filterChip('new',vt?vt.filterNew:'New',newN)+filterChip('due',vt?vt.filterDue:'To review',dueN)+filterChip('mastered',vt?vt.filterMastered:'Mastered',mastN)+filterChip('struggling',vt?vt.filterStruggling:'Struggling',strugN)+(diffN?filterChip('difficult',vt?vt.filterDifficult:'Difficult',diffN):'')+'</div>';
}
function refreshVocabHubPanel(){
  const goal=getActiveGoal();
  const el=document.getElementById('wsPanelVocabulary');
  if(!goal||!el)return;
  el.innerHTML=renderWsVocabularyHtml(goal);
  if(_vocabHub.activity!=='flashcards'&&typeof mountVocabUiLangBar==='function')mountVocabUiLangBar('vvHubUiLangMount');
  if(_vocabHub.activity==='flashcards')renderFcSingleView();
  if(typeof syncNavBackLabels==='function')syncNavBackLabels();
  vocabHubEnsureGenderAi(goal);
}
function setVocabHubFilter(filter){
  _vocabHub.filter=filter;
  refreshVocabHubPanel();
}
function toggleVocabHubWord(id){
  const goal=S.goals.find(g=>g.id===_vocabHub.goalId);
  if(!goal)return;
  if(!deckForGoal(goal).some(f=>fcId(f)===id))return;
  if(_vocabHub.selectedIds.has(id))_vocabHub.selectedIds.delete(id);
  else{
    if(vocabHubAtSelectionCap(goal))return;
    _vocabHub.selectedIds.add(id);
  }
  refreshVocabHubPanel();
}
function vocabHubSelectedIds(goal){
  const deck=deckForGoal(goal);
  return[..._vocabHub.selectedIds].filter(id=>deck.some(f=>fcId(f)===id));
}
function launchVocabHubCustomExam(){
  const goal=S.goals.find(g=>g.id===_vocabHub.goalId);
  if(!goal)return;
  const ids=vocabHubSelectedIds(goal);
  if(ids.length<4){lcToast('Select at least 4 words.','warn');return;}
  openExamConfigurator(goal.id,ids);
}
function launchVocabHubFlashcards(opts){
  const skipPersist=!!(opts&&opts.skipPersist);
  const goal=S.goals.find(g=>g.id===_vocabHub.goalId);
  if(!goal)return;
  const ids=vocabHubSelectedIds(goal);
  if(ids.length<VV_MIN_FLASH){lcToast('Select at least '+VV_MIN_FLASH+' word.','warn');return;}
  ensureFcIds();
  S.activeGoalId=goal.id;
  syncGoalToProfile(goal);
  _vocabHub.flashcardMode=true;
  _vocabHub.activity='flashcards';
  if(!_vocabHub.goalId)_vocabHub.goalId=goal.id;
  if(ids.length>VV_MAX_FLASH){
    lcToast('Using first '+VV_MAX_FLASH+' of '+ids.length+' selected words.','warn',5000);
  }
  S.fcSelected=new Set(ids.slice(0,VV_MAX_FLASH));
  S.fcSingleIdx=0;
  S.fcSingleFlipped=false;
  S.fcTab='all';
  if(typeof ActivityTrack!=='undefined')ActivityTrack.beginSession('flashcards',goal.id,'Flashcard review');
  _vocabHub._fcSessionCommitted=false;
  if(!skipPersist&&typeof SavedFlashcardSets!=='undefined'&&SavedFlashcardSets.persistSession){
    S._fcSavedSetId=SavedFlashcardSets.persistSession({goal,selectedIds:[...S.fcSelected]});
  }
  refreshVocabHubPanel();
  window.scrollTo({top:0,behavior:'smooth'});
}
function launchVocabHubQuickDrill(){
  const goal=S.goals.find(g=>g.id===_vocabHub.goalId);
  if(!goal)return;
  const ids=vocabHubSelectedIds(goal);
  if(ids.length<VV_MIN_DRILL){lcToast('Select at least '+VV_MIN_DRILL+' words for a quiz.','warn');return;}
  S.activeGoalId=goal.id;
  syncGoalToProfile(goal);
  saveGoals();
  ensureFcIds();
  S.fcSelected=new Set(ids);
  _vocabHub.veFromVocab=true;
  if(S.mode==='practice'&&typeof syncUiLangMirrors==='function')syncUiLangMirrors(resolveVocabUiLang());
  startVE();
}
function setVocabHubFcTabAll(){
  S.fcTab='all';
  S.fcSingleIdx=0;
  S.fcSingleFlipped=false;
  renderFcSingleView();
}
function renderVocabHubFlashcardsHtml(goal){
  const selIds=S.fcSelected&&S.fcSelected.size?[...S.fcSelected]:vocabHubSelectedIds(goal);
  const n=selIds.length;
  const dueN=selIds.filter(id=>{
    const f=deckForGoal(goal).find(x=>fcId(x)===id);
    return f&&isDue(f);
  }).length;
  const langBtns=vocabUiLangs().map(l=>'<button type="button" class="vt-lb'+(resolveVocabUiLang()===l.code?' active':'')+'" data-lang="'+l.code+'" onclick="setVocabUiLang(\''+l.code+'\',this)">'+l.l+'</button>').join('');
  const vt=typeof vocabT==='function'?vocabT():null;
  const dueNote=dueN>0?(vt?vt.dueNote(dueN):' · <b>'+dueN+' due first</b>'):(vt?vt.dueFirst:' · reviewing all selected');
  return'<div class="vv-panel vv-panel--fc">'+renderNavBackBtn(vt?vt.vocabulary:'Vocabulary')+'<h1 class="exam-config-h1">'+(vt?vt.flashcardsTitle:'Flashcards')+'</h1><p class="exam-config-lede">'+(vt?vt.flashcardsLede(n,dueNote):n+' word'+(n===1?'':'s')+' selected'+dueNote+' · flip the card, then rate Again/Hard/Good/Easy.')+'</p><div class="ws-panel vv-fc-panel"><div class="fc-lang-bar vocab-ui-lang-bar" data-vocab-ui-lang><span class="fc-lang-label">'+(vt?vt.interfaceLang:'Interface')+':</span><div class="fc-lang-btns" id="vvUiLangBtns">'+langBtns+'</div></div><div id="vvFcDirBar"></div><div id="vvFcSingle"></div></div></div>';
}
function renderWsVocabularyHtml(goal){
  if(_vocabHub.activity==='flashcards')return renderVocabHubFlashcardsHtml(goal);
  if(_vocabHub.activity==='textos_read'&&typeof renderTextosHubHtml==='function')return renderTextosHubHtml(goal);
  const deck=deckForGoal(goal);
  const selN=vocabHubSelectedIds(goal).length;
  const actionsBlock=vocabHubActionsHtml(selN)+vocabHubSelNoteHtml(selN,deck.length);
  const brk=vocabOverviewBreakdown(goal);
  const vt=typeof vocabT==='function'?vocabT():null;
  const header='<h1 class="exam-config-h1">'+(vt?vt.hubYourVocabulary:'Your vocabulary')+'</h1><p class="exam-config-lede">'+(vt?vt.hubWordsSaved(esc(goalLabel(goal)),brk.total,brk.due):('<b>'+esc(goalLabel(goal))+'</b> · '+brk.total+' word'+(brk.total===1?'':'s')+' saved'+(brk.due>0?' · <b>'+brk.due+' due today</b>':'')+'.'))+'</p><div id="vvHubUiLangMount" class="vocab-ui-lang-mount"></div>';
  let bodyHtml='';
  if(!deck.length){
    bodyHtml='<p style="font-size:13px;color:var(--text-muted);margin:0">No words saved yet — add one below or save words during practice exams.</p>';
  }else{
    bodyHtml=vocabHubAccordionHtml(goal);
  }
  return'<div class="vv-panel">'+header+
    '<div class="ws-panel vv-actions-panel vv-actions-panel--top">'+actionsBlock+'</div>'+
    vocabHubPickBarHtml(goal)+
    renderWsVocabFilterChipsHtml(goal)+
    '<div class="ws-panel vv-list-panel">'+
    vocabHubManualAddHtml()+
    (deck.length?vocabHubLegendHtml(goal)+vocabHubListToolbarHtml():'')+
    bodyHtml+
    '</div>'+
    (typeof SavedVocabPractice!=='undefined'&&SavedVocabPractice.renderSavedPracticeHtml?SavedVocabPractice.renderSavedPracticeHtml(goal):'')+
    '</div>';
}
