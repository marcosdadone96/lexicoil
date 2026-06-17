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
function setVocabHubFcLang(code,btn){
  S.fcLang=code;
  document.querySelectorAll('#vvFcLangBtns .vt-lb').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderFcSingleView();
}
/** Deck view: when S.deckGoalFilter is set (goal hub), only that language; else ExamProfile filter. Used by renderFC, getSelectedFC, startVE, select*FC. */
function getDeckViewCards(){
  if(S.deckGoalFilter)return(S.flashcards||[]).filter(f=>f.sourceLang===S.deckGoalFilter);
  return typeof ExamProfile!=='undefined'?ExamProfile.filterList(S.flashcards):S.flashcards;
}
function readinessQualLabel(pct){
  if(pct<25)return 'early days';
  if(pct<50)return 'building momentum';
  if(pct<70)return 'on track';
  if(pct<85)return 'getting close';
  return 'well prepared';
}
function readinessEstLabelHtml(pct,hasData){
  if(!hasData)return 'est. <b>—</b>';
  const qual=readinessQualLabel(pct);
  return 'est. <b>'+pct+'% ready</b> · '+qual;
}
function readinessRingColor(pct){
  if(pct>=70)return'var(--green)';
  if(pct>=60)return'var(--amber,#f59e0b)';
  if(pct>=50)return'var(--orange)';
  return'var(--red)';
}
function readinessRingSvg(pct,hasData){
  const circ=226;
  const off=hasData?Math.round(circ*(1-Math.min(100,Math.max(0,pct))/100)):circ;
  const col=hasData?readinessRingColor(pct):'var(--border)';
  return'<svg width="84" height="84" aria-hidden="true"><circle cx="42" cy="42" r="36" fill="none" stroke="var(--border)" stroke-width="8"/><circle cx="42" cy="42" r="36" fill="none" stroke="'+col+'" stroke-width="8" stroke-linecap="round" stroke-dasharray="'+circ+'" stroke-dashoffset="'+off+'"/></svg>';
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
const _vocabHub={goalId:null,filter:'all',selectedIds:new Set(),collapsed:new Set(),expanded:new Set(),flashcardMode:false,activity:null,veFromVocab:false};
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
function fcTranslation(fc){
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
  });
  if(dirty)saveFC();
}
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
function vocabHubRowHtml(f,goal){
  const id=fcId(f);
  const on=_vocabHub.selectedIds.has(id);
  const tr=fcTranslation(f);
  const art=fcGenderArticle(f,goal.subject);
  const artHtml=art
    ?'<span class="vv-art '+art.cls+'">'+esc(art.article)+'</span>'
    :'<span class="vv-art vv-art--empty" aria-hidden="true"></span>';
  const word=vocabHubDisplayWord(f,goal.subject);
  const tip=tr?esc(tr).replace(/"/g,'&quot;'):'';
  const wordHtml=tr
    ?'<span class="vv-row-word" data-tip="'+tip+'" title="'+tip+'" tabindex="0">'+esc(word)+'</span>'
    :'<span class="vv-row-word">'+esc(word)+'</span>';
  return'<div class="vv-row"><label class="vv-row-main"><input type="checkbox"'+(on?' checked':'')+' onchange="toggleVocabHubWord(\''+esc(id)+'\')" aria-label="Select '+esc(word)+'">'+artHtml+wordHtml+'</label><button type="button" class="vv-del" onclick="delFCById(\''+esc(id)+'\')" aria-label="Remove '+esc(word)+'" title="Remove word">×</button></div>';
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
function vocabHubManualAddHtml(){
  return'<p class="vv-add-lbl">Add a word manually</p><div class="vv-add-row">'+
    '<input class="fc-add-input" id="vvAddWord" placeholder="Word in exam language…" onkeydown="if(event.key===\'Enter\')submitManualVocab(\'hub\')" oninput="clearManualAddHint(\'hub\')">'+
    '<input class="fc-add-input" id="vvAddTrans" placeholder="Translation (if not in library)…" onkeydown="if(event.key===\'Enter\')submitManualVocab(\'hub\')">'+
    '<button type="button" class="btn-sm accent" onclick="submitManualVocab(\'hub\')" style="padding:10px 16px">+ Add</button></div>'+
    '<div id="vvAddHint" class="vv-add-hint" style="display:none"></div>'+
    '<p class="note" style="margin:10px 0 0;font-size:11px">Words are sorted into Nouns, Verbs, Adjectives, etc. Spelling is checked against the word list when available.</p>';
}
function vocabHubActionsHtml(selN){
  const canCustom=selN>=VV_MIN_CUSTOM;
  const canFlash=selN>=VV_MIN_FLASH;
  const canDrill=selN>=VV_MIN_DRILL;
  const tier=typeof canUsePersonalizedTier==='function'?canUsePersonalizedTier():'free';
  const proBadge=tier!=='pro'?' <span class="vv-pro-badge">Pro IA</span>':'';
  return'<p class="ws-seclbl">Pick an action — applies to selected words</p>'+
    '<div class="ws-exam-grid ws-exam-grid--vocab">'+
      '<button type="button" class="ws-exam-card ws-exam-card--personal"'+(canCustom?' onclick="launchVocabHubCustomExam()"':' disabled')+'><span class="ws-exam-card-ic">✦</span><span class="ws-exam-card-title">Custom exam'+proBadge+'</span><span class="ws-exam-card-desc">From your words</span></button>'+
      '<button type="button" class="ws-exam-card ws-exam-card--practice"'+(canFlash?' onclick="launchVocabHubFlashcards()"':' disabled')+'><span class="ws-exam-card-ic">▭</span><span class="ws-exam-card-title">Flashcards</span><span class="ws-exam-card-desc">Spaced review</span></button>'+
      '<button type="button" class="ws-exam-card ws-exam-card--oral"'+(canDrill?' onclick="launchVocabHubQuickDrill()"':' disabled')+'><span class="ws-exam-card-ic">⚡</span><span class="ws-exam-card-title">Quick drill</span><span class="ws-exam-card-desc">Fast quiz</span></button>'+
    '</div>'+
    '<div class="ws-exam-grid ws-exam-grid--soon">'+
      '<div class="ws-exam-card ws-act-card" role="button" tabindex="0" onclick="startHorenGameFromHub()"><span class="ws-exam-card-title">Listening game'+(typeof canUsePersonalized==='function'&&!canUsePersonalized()?proBadge:'')+'</span><span class="ws-exam-card-desc">Hear &amp; spot your words</span></div>'+
      '<div class="ws-exam-card ws-act-card soon" aria-disabled="true"><span class="ws-exam-card-title">Phrases <span class="vv-soon-badge">Soon</span></span><span class="ws-exam-card-desc">Sentence practice</span></div>'+
    '</div>';
}
function refreshVocabHubPanel(){
  const goal=getActiveGoal();
  const el=document.getElementById('wsPanelVocabulary');
  if(!goal||!el)return;
  el.innerHTML=renderWsVocabularyHtml(goal);
  if(_vocabHub.activity==='flashcards')renderFcSingleView();
  if(typeof syncNavBackLabels==='function')syncNavBackLabels();
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
  _vocabHub.flashcardMode=true;
  _vocabHub.activity='flashcards';
  S.fcSelected=new Set(ids);
  S.fcSingleIdx=0;
  S.fcSingleFlipped=false;
  S.fcTab='all';
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
  if(S.mode==='practice')S.vocabLang=vocabLangFor(goal.subject);
  startVE(false);
}
function renderVocabHubFlashcardsHtml(goal){
  const n=vocabHubSelectedIds(goal).length;
  const langBtns=LANGS.map(l=>'<button type="button" class="vt-lb'+(S.fcLang===l.code?' active':'')+'" onclick="setVocabHubFcLang(\''+l.code+'\',this)">'+l.l+'</button>').join('');
  return'<div class="vv-panel vv-panel--fc">'+renderNavBackBtn('Vocabulary')+'<h1 class="exam-config-h1">Flashcards</h1><p class="exam-config-lede">'+n+' word'+(n===1?'':'s')+' selected · tap the card to reveal the translation.</p><div class="ws-panel vv-fc-panel"><div class="fc-lang-bar vv-fc-lang"><span class="fc-lang-label">Translation:</span><div class="fc-lang-btns" id="vvFcLangBtns">'+langBtns+'</div></div><div id="vvFcSingle"></div></div></div>';
}
function renderWsVocabularyHtml(goal){
  if(_vocabHub.activity==='flashcards')return renderVocabHubFlashcardsHtml(goal);
  const deck=deckForGoal(goal);
  const dueN=dueForGoal(goal).length;
  const strugN=vocabHubStrugglingCount(goal);
  const newN=countNewWords(goal);
  const mastN=countMasteredWords(goal);
  const diffN=countDifficultWords(goal);
  const filt=_vocabHub.filter||'all';
  const selN=vocabHubSelectedIds(goal).length;
  const filterChip=(key,lbl,n)=>'<button type="button" class="vv-filter'+(filt===key?' on':'')+'" onclick="setVocabHubFilter(\''+key+'\')">'+lbl+' · '+n+'</button>';
  const filters=filterChip('all','All',deck.length)+filterChip('due','To review',dueN)+filterChip('new','New',newN)+filterChip('mastered','Mastered',mastN)+filterChip('difficult','Difficult',diffN)+filterChip('struggling','Struggling',strugN);
  const actionsBlock=deck.length?vocabHubActionsHtml(selN)+vocabHubSelNoteHtml(selN,deck.length):'';
  const brk=vocabOverviewBreakdown(goal);
  const header='<h1 class="exam-config-h1">Your vocabulary</h1><p class="exam-config-lede"><b>'+esc(goalLabel(goal))+'</b> · '+brk.total+' word'+(brk.total===1?'':'s')+' saved'+(brk.due>0?' · <b>'+brk.due+' due today</b>':'')+'.</p>';
  let bodyHtml='';
  if(!deck.length){
    bodyHtml='<p style="font-size:13px;color:var(--text-muted);margin:0">No words saved yet — add one above or save words during practice exams.</p>';
  }else{
    bodyHtml=vocabHubAccordionHtml(goal);
  }
  return'<div class="vv-panel">'+header+renderWsVocabKpisHtml(goal)+renderWsVocabCategoriesHtml(goal)+
    '<div class="ws-panel vv-smart-panel"><p class="ws-seclbl">Smart lists</p><div class="vv-filters">'+filters+'</div></div>'+
    '<div class="ws-panel vv-add-panel">'+vocabHubManualAddHtml()+'</div>'+
    (deck.length?'<div class="ws-panel vv-actions-panel">'+actionsBlock+'</div>':'')+
    '<div class="ws-panel vv-list-panel">'+(deck.length?vocabHubLegendHtml(goal):'')+bodyHtml+'</div>'+
    '</div>';
}
