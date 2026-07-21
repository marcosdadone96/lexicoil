// ═══════════════════════════════════════════
// EXAM GOALS
// ═══════════════════════════════════════════
function clearVocabHubFlashcardMode(){
  if(typeof _vocabHub!=='undefined'){
    _vocabHub.flashcardMode=false;
    _vocabHub.activity=null;
    _vocabHub.veFromVocab=false;
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
  renderFcSingleView();
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
const _vocabHub={goalId:null,filter:'all',selectedIds:new Set(),collapsed:new Set(),expanded:new Set(),flashcardMode:false,activity:null,veFromVocab:false,manualAddOpen:false};
const VH_POS_ORDER=['noun','verb','adjective','adverb','other'];
const VV_SEMI_OPEN=5;
function vocabHubResolveType(fc,subject){
  if(typeof ManualVocab!=='undefined'&&ManualVocab.inferPos)return ManualVocab.inferPos(fc,subject);
  const t=typeof normWordType==='function'?normWordType(fc.type||fc.pos):'';
  return t||'other';
}
const VV_MIN_CUSTOM=4;
const VV_MIN_DRILL=4;
const VV_MIN_FLASH=1;
const VV_MIN_LISTEN=3;
const VV_MIN_PHRASES=2;
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
    _vocabHub.goalId=goal.id;
    _vocabHub.filter='all';
    _vocabHub.selectedIds=new Set();
    _vocabHub.collapsed=new Set();
    _vocabHub.expanded=new Set();
    _vocabHub.activity=null;
    _vocabHub.flashcardMode=false;
    deckForGoal(goal).forEach(f=>_vocabHub.selectedIds.add(fcId(f)));
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
  vocabHubGroupDeck(goal)[type].forEach(f=>_vocabHub.selectedIds.add(fcId(f)));
  refreshVocabHubPanel();
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
  const labelInner=art
    ?'<span class="vv-word-cell">'+artHtml+wordSpan+'</span>'
    :wordSpan;
  const spellFix=f._spellingSuggestion&&!f.spellingDismissed
    ?'<span class="vv-spell-wrap"><button type="button" class="vv-spell-fix" onclick="event.preventDefault();event.stopPropagation();fixVocabHubSpelling(\''+esc(id)+'\')" title="Apply spelling suggestion">'+esc(f._spellingSuggestion)+'?</button><button type="button" class="vv-spell-dismiss" onclick="event.preventDefault();event.stopPropagation();dismissVocabHubSpelling(\''+esc(id)+'\')" title="Keep my spelling" aria-label="Dismiss suggestion">×</button></span>'
    :'';
  const posType=vocabHubResolveType(f,goal.subject);
  const conjHtml=(posType==='verb'&&typeof VerbConjugation!=='undefined'&&VerbConjugation.conjugationSelectHtml)
    ?VerbConjugation.conjugationSelectHtml(f,goal,id)
    :'';
  const verbRow=conjHtml?`<div class="vv-conj-row">${conjHtml}</div>`:'';
  return'<div class="vv-row'+(posType==='verb'?' vv-row--verb':'')+'"><label class="vv-row-main"><input type="checkbox"'+(on?' checked':'')+' onchange="toggleVocabHubWord(\''+esc(id)+'\')" aria-label="Select '+esc(word)+'">'+labelInner+spellFix+'</label><button type="button" class="vv-del" onclick="delFCById(\''+esc(id)+'\')" aria-label="Remove '+esc(word)+'" title="Remove word">×</button>'+verbRow+'</div>';
}
function vocabHubSectionHtml(type,items,goal){
  if(!items.length)return'';
  const lbl=typeof fcTypeSectionLabel==='function'?fcTypeSectionLabel(type):type;
  const expanded=_vocabHub.expanded.has(type);
  const visible=expanded?items:items.slice(0,VV_SEMI_OPEN);
  const hidden=(!expanded&&items.length>VV_SEMI_OPEN)?items.length-VV_SEMI_OPEN:0;
  const rows=visible.map(f=>vocabHubRowHtml(f,goal)).join('');
  const moreBtn=hidden?'<button type="button" class="vv-more" onclick="expandVocabHubSection(\''+type+'\')">+ '+hidden+' more</button>':'';
  return'<div class="vv-grp vv-col"><div class="vv-ghead"><span class="vv-gh">'+esc(lbl)+' · '+items.length+'</span><button type="button" class="vv-selall" onclick="vocabHubSelectAllInSection(\''+type+'\')">Select all</button></div><div class="vv-rows">'+rows+'</div>'+moreBtn+'</div>';
}
function vocabHubAccordionHtml(goal){
  const groups=vocabHubGroupDeck(goal);
  const parts=VH_POS_ORDER.map(t=>vocabHubSectionHtml(t,groups[t],goal)).filter(Boolean);
  if(!parts.length)return'<p style="font-size:13px;color:var(--text-muted);margin:0">No words match this filter.</p>';
  return'<div class="vv-cols">'+parts.join('')+'</div>';
}
function vocabHubLegendHtml(goal){
  const hint='<span class="vv-legend-hint">Hover a word to see its translation.</span>';
  if(goal.subject==='de')return'<p class="vv-legend">der <b class="art-masc">blue</b> · die <b class="art-fem">red</b> · das <b class="art-neut">green</b> · '+hint+'</p>';
  if(goal.subject==='es')return'<p class="vv-legend">el <b class="art-masc">blue</b> · la <b class="art-fem">red</b> · '+hint+'</p>';
  return'<p class="vv-legend">'+hint+'</p>';
}
function vocabHubSelNoteHtml(selN,deckLen){
  if(!deckLen)return'';
  let extra=' · all words chosen by default — untick any you don\'t need';
  if(selN<VV_MIN_CUSTOM)extra+=' · pick at least '+VV_MIN_CUSTOM+' for custom exam';
  return'<p class="vv-selnote" id="vocabHubSummary"><b>'+selN+' selected</b>'+extra+'</p>';
}
function toggleVocabHubManualAdd(){
  _vocabHub.manualAddOpen=!_vocabHub.manualAddOpen;
  refreshVocabHubPanel();
  if(_vocabHub.manualAddOpen){
    setTimeout(()=>document.getElementById('vvAddWord')?.focus(),50);
  }
}
window.toggleVocabHubManualAdd=toggleVocabHubManualAdd;
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
  const canCustom=deckLen>0&&selN>=VV_MIN_CUSTOM;
  const canFlash=deckLen>0&&selN>=VV_MIN_FLASH;
  const canDrill=deckLen>0&&selN>=VV_MIN_DRILL;
  const canListen=deckLen>0&&selN>=VV_MIN_LISTEN;
  const canPhrases=deckLen>0&&selN>=VV_MIN_PHRASES;
  const creditBadgeAlways=(action)=>' <span class="ai-credit-badge">'+((typeof formatCreditCost==='function'&&typeof aiActionCost==='function')?formatCreditCost(aiActionCost(action)):action)+'</span>';
  const proBadge=' <span class="vv-pro-badge">Pro</span>';
  const persAllowed=goal&&(typeof isPersonalizedAllowed!=='function'||isPersonalizedAllowed(goal.subject,goal.level));
  const aiAllowed=goal&&(typeof isAiFeatureAllowed!=='function'||isAiFeatureAllowed(goal.subject,goal.level));
  const personalBadge=typeof canUsePersonalized==='function'&&!canUsePersonalized()?proBadge:creditBadgeAlways('personal_exam');
  const quizBadge=creditBadgeAlways('vocab_quiz');
  const listenBadge=creditBadgeAlways('listening_game');
  const phrasesBadge=creditBadgeAlways('vocab_phrases');
  const customCard=persAllowed
    ?'<button type="button" class="ws-exam-card ws-exam-card--personal"'+(canCustom?' onclick="launchVocabHubCustomExam()"':' disabled')+'><span class="ws-exam-card-ic">✦</span><span class="ws-exam-card-title">Custom exam'+personalBadge+'</span><span class="ws-exam-card-desc">From your words</span></button>'
    :'';
  const quizCard=aiAllowed
    ?'<button type="button" class="ws-exam-card ws-exam-card--oral"'+(canDrill?' onclick="launchVocabHubQuickDrill()"':' disabled')+'><span class="ws-exam-card-ic">⚡</span><span class="ws-exam-card-title">AI quiz'+quizBadge+'</span><span class="ws-exam-card-desc">Hint → pick the word</span></button>'
    :'';
  const listenCard=aiAllowed
    ?'<button type="button" class="ws-exam-card ws-exam-card--practice"'+(canListen?' onclick="startHorenGameFromHub()"':' disabled')+'><span class="ws-exam-card-ic">🎧</span><span class="ws-exam-card-title">Listening game'+listenBadge+'</span><span class="ws-exam-card-desc">Hear &amp; spot your words</span></button>'
    :'';
  const phrasesCard=aiAllowed
    ?'<button type="button" class="ws-exam-card ws-exam-card--oral"'+(canPhrases?' onclick="launchVocabHubPhrases()"':' disabled')+'><span class="ws-exam-card-ic">💬</span><span class="ws-exam-card-title">Phrases'+phrasesBadge+'</span><span class="ws-exam-card-desc">Gap fill &amp; word order</span></button>'
    :'';
  return'<div class="ws-exam-grid ws-exam-grid--vocab">'+
      customCard+
      '<button type="button" class="ws-exam-card ws-exam-card--practice"'+(canFlash?' onclick="launchVocabHubFlashcards()"':' disabled')+'><span class="ws-exam-card-ic">▭</span><span class="ws-exam-card-title">Flashcards</span><span class="ws-exam-card-desc">Spaced review</span></button>'+
      quizCard+
    '</div>'+
    (aiAllowed?'<div class="ws-exam-grid ws-exam-grid--vocab ws-exam-grid--vocab-second">'+listenCard+phrasesCard+'</div>':'');
}
function renderWsVocabFilterChipsHtml(goal){
  const deck=deckForGoal(goal);
  const dueN=dueForGoal(goal).length;
  const strugN=vocabHubStrugglingCount(goal);
  const newN=countNewWords(goal);
  const mastN=countMasteredWords(goal);
  const diffN=countDifficultWords(goal);
  const filt=_vocabHub.filter||'all';
  const filterChip=(key,lbl,n)=>'<button type="button" class="vv-filter'+(filt===key?' on':'')+'" onclick="setVocabHubFilter(\''+key+'\')">'+lbl+' · '+n+'</button>';
  return'<div class="vv-filters vv-filters--merged">'+filterChip('all','All',deck.length)+filterChip('new','New',newN)+filterChip('due','To review',dueN)+filterChip('mastered','Mastered',mastN)+filterChip('struggling','Struggling',strugN)+(diffN?filterChip('difficult','Difficult',diffN):'')+'</div>';
}
function refreshVocabHubPanel(){
  const goal=getActiveGoal();
  const el=document.getElementById('wsPanelVocabulary');
  if(!goal||!el)return;
  el.innerHTML=renderWsVocabularyHtml(goal);
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
  else _vocabHub.selectedIds.add(id);
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
function launchVocabHubFlashcards(){
  const goal=S.goals.find(g=>g.id===_vocabHub.goalId);
  if(!goal)return;
  const ids=vocabHubSelectedIds(goal);
  if(ids.length<VV_MIN_FLASH){lcToast('Select at least '+VV_MIN_FLASH+' word.','warn');return;}
  ensureFcIds();
  S.activeGoalId=goal.id;
  syncGoalToProfile(goal);
  _vocabHub.flashcardMode=true;
  _vocabHub.activity='flashcards';
  S.fcSelected=new Set(ids);
  S.fcSingleIdx=0;
  S.fcSingleFlipped=false;
  S.fcTab='study';
  if(typeof ActivityTrack!=='undefined')ActivityTrack.beginSession('flashcards',goal.id,'Flashcard review');
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
  const n=vocabHubSelectedIds(goal).length;
  const dueN=vocabHubSelectedIds(goal).filter(id=>{
    const f=deckForGoal(goal).find(x=>fcId(x)===id);
    return f&&isDue(f);
  }).length;
  const langBtns=vocabUiLangs().map(l=>'<button type="button" class="vt-lb'+(resolveVocabUiLang()===l.code?' active':'')+'" onclick="setVocabUiLang(\''+l.code+'\',this)">'+l.l+'</button>').join('');
  const vt=typeof vocabT==='function'?vocabT():null;
  const dueNote=dueN>0?(vt?vt.dueNote(dueN):' · <b>'+dueN+' due first</b>'):(vt?vt.dueFirst:' · reviewing all selected');
  return'<div class="vv-panel vv-panel--fc">'+renderNavBackBtn(vt?vt.vocabulary:'Vocabulary')+'<h1 class="exam-config-h1">'+(vt?vt.flashcardsTitle:'Flashcards')+'</h1><p class="exam-config-lede">'+(vt?vt.flashcardsLede(n,dueNote):n+' word'+(n===1?'':'s')+' selected'+dueNote+' · flip the card, then rate Again/Hard/Good/Easy.')+'</p><div class="ws-panel vv-fc-panel"><div class="fc-lang-bar vocab-ui-lang-bar" data-vocab-ui-lang><span class="fc-lang-label">'+(vt?vt.interfaceLang:'Interface')+':</span><div class="fc-lang-btns" id="vvUiLangBtns">'+langBtns+'</div></div><div id="vvFcDirBar"></div><div id="vvFcSingle"></div></div></div>';
}
function renderWsVocabularyHtml(goal){
  if(_vocabHub.activity==='flashcards')return renderVocabHubFlashcardsHtml(goal);
  const deck=deckForGoal(goal);
  const selN=vocabHubSelectedIds(goal).length;
  const actionsBlock=vocabHubActionsHtml(selN)+vocabHubSelNoteHtml(selN,deck.length);
  const brk=vocabOverviewBreakdown(goal);
  const header='<h1 class="exam-config-h1">Your vocabulary</h1><p class="exam-config-lede"><b>'+esc(goalLabel(goal))+'</b> · '+brk.total+' word'+(brk.total===1?'':'s')+' saved'+(brk.due>0?' · <b>'+brk.due+' due today</b>':'')+'.</p>';
  let bodyHtml='';
  if(!deck.length){
    bodyHtml='<p style="font-size:13px;color:var(--text-muted);margin:0">No words saved yet — add one below or save words during practice exams.</p>';
  }else{
    bodyHtml=vocabHubAccordionHtml(goal);
  }
  return'<div class="vv-panel">'+header+
    '<div class="ws-panel vv-actions-panel vv-actions-panel--top">'+actionsBlock+'</div>'+
    renderWsVocabFilterChipsHtml(goal)+
    '<div class="ws-panel vv-list-panel">'+
    vocabHubManualAddHtml()+
    (deck.length?vocabHubLegendHtml(goal):'')+
    bodyHtml+
    '</div>'+
    (typeof SavedVocabQuizzes!=='undefined'&&SavedVocabQuizzes.renderSavedQuizzesHtml?SavedVocabQuizzes.renderSavedQuizzesHtml(goal):'')+
    '</div>';
}
