const _examConfig={goalId:null,selectedIds:new Set(),skills:new Set(['lesen']),seedCount:0,teilChoice:'all',topicChoice:null,topicTouched:false,blueprintParts:null};
function showExamConfigFootbar(visible){
  const fb=document.getElementById('examConfigFootbar');
  if(fb)fb.style.display=visible?'flex':'none';
}
async function loadExamConfigBlueprintParts(goal){
  if(typeof ExamBlueprint==='undefined')return null;
  try{
    const bp=await ExamBlueprint.load(goal.subject,goal.level);
    if(!bp)return null;
    const parts={};
    for(const mod of bp.modules||[]){
      parts[mod.id]=(mod.parts||[])
        .map(p=>({teil:p.teil,label:p.label||(`Teil ${p.teil}`)}))
        .sort((a,b)=>(a.teil??0)-(b.teil??0));
    }
    return parts;
  }catch(_){return null;}
}
function openExamConfigurator(goalId,preselectedIds){
  const goal=S.goals.find(g=>g.id===goalId);
  if(!goal)return;
  if(typeof isPersonalizedAllowed==='function'&&!isPersonalizedAllowed(goal.subject,goal.level)){
    lcToast(typeof LevelAvailability!=='undefined'?LevelAvailability.personalizedUnavailableMessage(goal.subject,goal.level):'Personalized practice is not available for this level yet.','warn',7000);
    return;
  }
  S.activeGoalId=goalId;
  syncGoalToProfile(goal);
  saveGoals();
  _examConfig.goalId=goalId;
  _examConfig.skills=new Set(['lesen']);
  _examConfig.selectedIds=new Set();
  _examConfig.seedCount=0;
  _examConfig.teilChoice='all';
  _examConfig.topicChoice=null;
  _examConfig.topicTouched=false;
  _examConfig.blueprintParts=null;
  const deck=deckForGoal(goal);
  if(preselectedIds&&preselectedIds.length){
    preselectedIds.forEach(id=>{if(deck.some(f=>fcId(f)===id))_examConfig.selectedIds.add(id);});
    _examConfig.seedCount=_examConfig.selectedIds.size;
  }
  if(goal.subject==='de'&&typeof PersonalTopicStock!=='undefined'&&_examConfig.selectedIds.size){
    PersonalTopicStock.applySuggestedTopicFromSelection(_examConfig,goal);
  }
  hideAll();
  show('examConfigScreen');
  showExamConfigFootbar(true);
  renderExamConfigurator();
  void loadExamConfigBlueprintParts(goal).then(parts=>{
    if(_examConfig.goalId===goalId&&parts){
      _examConfig.blueprintParts=parts;
      renderExamConfigurator();
    }
  });
  if(typeof LcRouter!=='undefined')LcRouter.replaceRoute(LcRouter.goalPath(goal,'config'),'Exams');
  window.scrollTo({top:0,behavior:'smooth'});
}
function examConfigFootAction(){submitExamConfig();}
function examConfigVocabCap(){
  const skills=[..._examConfig.skills];
  if(skills.includes('schreiben')||skills.includes('sprechen'))return null;
  return typeof VocabBatching!=='undefined'?VocabBatching.capacityFor(skills):10;
}
function examConfigVocabDisabled(){
  const skills=[..._examConfig.skills];
  return skills.includes('schreiben')||skills.includes('sprechen');
}
function toggleConfigWord(id){
  if(examConfigVocabDisabled())return;
  const cap=examConfigVocabCap();
  if(!_examConfig.selectedIds.has(id)&&cap!=null&&_examConfig.selectedIds.size>=cap)return;
  if(_examConfig.selectedIds.has(id))_examConfig.selectedIds.delete(id);
  else _examConfig.selectedIds.add(id);
  if(!_examConfig.topicTouched){
    const goal=S.goals.find(g=>g.id===_examConfig.goalId);
    if(goal&&goal.subject==='de'&&typeof PersonalTopicStock!=='undefined'){
      PersonalTopicStock.applySuggestedTopicFromSelection(_examConfig,goal);
    }
  }
  renderExamConfigurator();
}
function selectAllDueConfig(){
  const goal=S.goals.find(g=>g.id===_examConfig.goalId);
  if(!goal)return;
  if(examConfigVocabDisabled())return;
  const cap=examConfigVocabCap();
  deckForGoal(goal).forEach(f=>{
    if(!isDue(f))return;
    if(cap!=null&&_examConfig.selectedIds.size>=cap&&!_examConfig.selectedIds.has(fcId(f)))return;
    _examConfig.selectedIds.add(fcId(f));
  });
  if(typeof PersonalTopicStock!=='undefined')PersonalTopicStock.applySuggestedTopicFromSelection(_examConfig,goal);
  renderExamConfigurator();
}
function setConfigTeilChoice(value){
  _examConfig.teilChoice='all';
  renderExamConfigurator();
}
function setConfigTopicChoice(value){
  const goal=S.goals.find(g=>g.id===_examConfig.goalId);
  const Stock=typeof PersonalTopicStock!=='undefined'?PersonalTopicStock.stockForConfig(goal,configActiveSkillKey(_examConfig.skills)):null;
  const canon=typeof B1Topics!=='undefined'&&B1Topics.normalizeB1Topic?B1Topics.normalizeB1Topic(value):String(value||'').trim();
  _examConfig.topicChoice=canon||value||null;
  _examConfig.topicTouched=true;
  renderExamConfigurator();
}
function resetConfigTopicToSuggestion(){
  const goal=S.goals.find(g=>g.id===_examConfig.goalId);
  if(!goal)return;
  _examConfig.topicTouched=false;
  if(typeof PersonalTopicStock!=='undefined')PersonalTopicStock.applySuggestedTopicFromSelection(_examConfig,goal);
  renderExamConfigurator();
}
window.resetConfigTopicToSuggestion=resetConfigTopicToSuggestion;
window.setConfigTeilChoice=setConfigTeilChoice;
window.setConfigTopicChoice=setConfigTopicChoice;
function configPartBadge(status){
  if(status==='soon')return'<span class="exam-config-badge exam-config-badge--soon">Soon</span>';
  return'<span class="exam-config-badge exam-config-badge--ready">Ready</span>';
}
function configSkillSummary(skills,subject){
  const ui=typeof examUiStrings==='function'?examUiStrings(subject==='de'?'de':subject==='es'?'es':'en'):{reading:'Reading',listening:'Listening',writing:'Writing',speaking:'Speaking'};
  const parts=[];
  if(skills.has('lesen'))parts.push(ui.reading);
  if(skills.has('horen'))parts.push(ui.listening);
  if(skills.has('schreiben'))parts.push(ui.writing);
  if(skills.has('sprechen'))parts.push(ui.speaking);
  return parts.join(' + ')||'—';
}
/** Single selected module label for use in button/summary. */
function configActiveSkillLabel(skills,subject){
  const ui=typeof examUiStrings==='function'?examUiStrings(subject==='de'?'de':subject==='es'?'es':'en'):{reading:'Reading',listening:'Listening',writing:'Writing',speaking:'Speaking'};
  if(skills.has('lesen'))return ui.reading;
  if(skills.has('horen'))return ui.listening;
  if(skills.has('schreiben'))return ui.writing;
  if(skills.has('sprechen'))return ui.speaking;
  return'—';
}
function configActiveSkillKey(skills){
  if(skills.has('lesen'))return'lesen';
  if(skills.has('horen'))return'horen';
  if(skills.has('schreiben'))return'schreiben';
  if(skills.has('sprechen'))return'sprechen';
  return'lesen';
}
function toggleConfigSkill(skill){
  const goal=S.goals.find(g=>g.id===_examConfig.goalId);
  if(goal&&!examConfigSkillPoolReady(skill,goal)){
    examConfigSkillSoon(skill);
    return;
  }
  _examConfig.skills=new Set([skill]);
  _examConfig.teilChoice='all';
  if(skill==='lesen'||skill==='horen'||skill==='schreiben'||skill==='sprechen'){
    _examConfig.selectedIds.clear();
    if(!_examConfig.topicTouched)_examConfig.topicChoice=null;
  }
  if(goal&&goal.subject==='de'&&(skill==='lesen'||skill==='horen')&&typeof PersonalTopicStock!=='undefined'){
    PersonalTopicStock.applySuggestedTopicFromSelection(_examConfig,goal);
  }
  renderExamConfigurator();
}
function examConfigDeselectSection(type){
  const goal=S.goals.find(g=>g.id===_examConfig.goalId);
  if(!goal)return;
  (examConfigGroupDeck(goal)[type]||[]).forEach(f=>_examConfig.selectedIds.delete(fcId(f)));
  renderExamConfigurator();
}
function selectAllConfigWords(){
  const goal=S.goals.find(g=>g.id===_examConfig.goalId);
  if(!goal)return;
  if(examConfigVocabDisabled())return;
  const cap=examConfigVocabCap();
  deckForGoal(goal).forEach(f=>{
    if(cap!=null&&_examConfig.selectedIds.size>=cap&&!_examConfig.selectedIds.has(fcId(f)))return;
    _examConfig.selectedIds.add(fcId(f));
  });
  if(typeof PersonalTopicStock!=='undefined')PersonalTopicStock.applySuggestedTopicFromSelection(_examConfig,goal);
  renderExamConfigurator();
}
function deselectAllConfigWords(){
  _examConfig.selectedIds.clear();
  renderExamConfigurator();
}
function examConfigSelectSection(type){
  const goal=S.goals.find(g=>g.id===_examConfig.goalId);
  if(!goal)return;
  if(examConfigVocabDisabled())return;
  const cap=examConfigVocabCap();
  examConfigGroupDeck(goal)[type].forEach(f=>{
    if(cap!=null&&_examConfig.selectedIds.size>=cap&&!_examConfig.selectedIds.has(fcId(f)))return;
    _examConfig.selectedIds.add(fcId(f));
  });
  renderExamConfigurator();
}
window.selectAllConfigWords=selectAllConfigWords;
window.deselectAllConfigWords=deselectAllConfigWords;
window.examConfigSelectSection=examConfigSelectSection;
window.examConfigDeselectSection=examConfigDeselectSection;
const EC_POS_ORDER=['noun','verb','adjective','adverb','other'];
function examConfigResolveType(fc,subject){
  if(typeof vocabHubResolveType==='function')return vocabHubResolveType(fc,subject);
  return'other';
}
function examConfigGroupDeck(goal){
  const groups={noun:[],verb:[],adjective:[],adverb:[],other:[]};
  deckForGoal(goal).forEach(f=>{
    const t=examConfigResolveType(f,goal.subject);
    const key=EC_POS_ORDER.includes(t)?t:'other';
    groups[key].push(f);
  });
  return groups;
}
function examConfigStepLabel(num,text){
  return`<p class="ec-step-label"><span class="ec-step-num">${num}</span> ${esc(text)}</p>`;
}
function examConfigSkillPoolReady(skill,goal){
  if(goal.subject!=='de'||goal.level!=='B1')return skill!=='sprechen';
  return true;
}
function examConfigSkillGridHtml(ui,goal){
  const isDE=goal.subject==='de';
  const items=[
    {key:'lesen',title:ui.reading,sub:isDE?'Leseverstehen mit deinem Wortschatz':'Reading with your vocabulary'},
    {key:'horen',title:ui.listening,sub:isDE?'Hörverstehen mit deinem Wortschatz':'Listening with your vocabulary'},
    {key:'schreiben',title:ui.writing,sub:isDE?'Schreibaufgaben mit KI (2 Credits)':'Writing tasks with AI (2 credits)'},
    {key:'sprechen',title:ui.speaking,sub:isDE?'Mündliche Aufgaben mit KI (2 Credits)':'Speaking tasks with AI (2 credits)'},
  ];
  return`<div class="ec-skills-grid">${items.map(s=>{
    const on=_examConfig.skills.has(s.key);
    const ready=examConfigSkillPoolReady(s.key,goal);
    const badge=ready?configPartBadge('ready'):configPartBadge('soon');
    const click=ready?`toggleConfigSkill('${s.key}')`:`examConfigSkillSoon('${s.key}')`;
    return`<div class="ec-skill-card${on?' on':''}${ready?'':' soon'}" onclick="${click}" role="radio" aria-checked="${on}" aria-disabled="${ready?'false':'true'}"><span class="ec-skill-dot" aria-hidden="true"></span><div class="ec-skill-body"><div class="ec-skill-name">${esc(s.title)}</div><div class="ec-skill-desc">${esc(s.sub)}</div></div>${badge}</div>`;
  }).join('')}</div>`;
}
function examConfigSkillSoon(skill){
  const goal=S.goals.find(g=>g.id===_examConfig.goalId);
  const isDE=goal?.subject==='de';
  lcToast(isDE?'Dieses Modul ist noch nicht verfügbar.':'This module is not available yet.','warn',6000);
}
window.examConfigSkillSoon=examConfigSkillSoon;
function examConfigRowHtml(f,goal){
  const id=fcId(f);
  const on=_examConfig.selectedIds.has(id);
  const disabled=examConfigVocabDisabled();
  const cap=examConfigVocabCap();
  const lock=!disabled&&cap!=null&&!on&&_examConfig.selectedIds.size>=cap;
  const due=isDue(f);
  if(typeof ManualVocab!=='undefined'&&ManualVocab.enrichFlashcard)ManualVocab.enrichFlashcard(f,goal.subject);
  const art=typeof fcGenderArticle==='function'?fcGenderArticle(f,goal.subject):null;
  const word=typeof vocabHubDisplayWord==='function'?vocabHubDisplayWord(f,goal.subject):f.word;
  const artHtml=art?`<span class="vv-art ${art.cls}">${esc(art.article)}</span>`:'<span class="vv-art vv-art--empty"></span>';
  const dueHtml=due?'<span class="due-dot" title="Due today"></span>':'';
  const usedMark=typeof vocabHubUsedBadgeHtml==='function'?vocabHubUsedBadgeHtml(goal,f):'';
  const chkDisabled=disabled||lock?' disabled':'';
  const rowLock=lock?' vv-row--cap-lock':'';
  const change=disabled?'':` onchange="toggleConfigWord('${esc(id)}')"`;
  return`<div class="vv-row ec-vocab-row${rowLock}"><label class="vv-row-main${disabled?' vv-row-main--disabled':''}"><input type="checkbox"${on?' checked':''}${chkDisabled}${change} aria-label="${esc(word)}"><span class="vv-word-cell">${artHtml}<span class="vv-row-word">${esc(word)}</span>${usedMark}</span>${dueHtml}</label></div>`;
}
function examConfigVocabSectionHtml(type,items,goal){
  if(!items.length)return'';
  const isDE=goal.subject==='de';
  const lbl=typeof fcTypeSectionLabel==='function'?fcTypeSectionLabel(type):type;
  const rows=items.map(f=>examConfigRowHtml(f,goal)).join('');
  const desLbl=isDE?'Abwählen':'Deselect';
  return`<div class="vv-grp ec-vocab-col"><div class="vv-ghead"><span class="vv-gh">${esc(lbl)} · ${items.length}</span><span class="vv-ghead-actions"><button type="button" class="vv-selall" onclick="examConfigSelectSection('${type}')">${isDE?'Alle':'All'}</button><button type="button" class="vv-selall vv-selnone" onclick="examConfigDeselectSection('${type}')">${desLbl}</button></span></div><div class="vv-rows">${rows}</div></div>`;
}
function examConfigVocabPanelHtml(goal,activeSkill){
  const isDE=goal.subject==='de';
  const deck=deckForGoal(goal);
  const selN=_examConfig.selectedIds.size;
  const dueN=dueForGoal(goal).length;
  const isGenModule=activeSkill==='schreiben'||activeSkill==='sprechen';
  const cap=examConfigVocabCap();
  if(!deck.length){
    return`<div class="ec-vocab-card"><p class="exam-config-hint">${isDE?'Noch keine Wörter in diesem Deck. Speichere Wörter während einer Übung.':'No words in this deck yet. Save words during a practice exam.'}</p></div>`;
  }
  const groups=examConfigGroupDeck(goal);
  const cols=EC_POS_ORDER.map(t=>examConfigVocabSectionHtml(t,groups[t],goal)).filter(Boolean).join('');
  const title=isDE?'Deine Wörter':'Your words';
  const countLabel=isGenModule
    ?`${selN} ${isDE?'im Deck':'in deck'}`
    :cap!=null
      ?`${selN} / ${cap} ${isDE?'ausgewählt':'selected'}`
      :`${selN} ${isDE?'ausgewählt':'selected'}`;
  const sub=isGenModule
    ?(isDE
      ?'Schreiben und Sprechen nutzen kein Wort-Picking — nur das Thema zählt. Die Liste ist hier nur zur Info.'
      :'Writing and speaking do not use word selection — only the topic matters. This list is shown for reference only.')
    :cap!=null
      ?(isDE
        ?`Wähle ${cap} Wörter (max.) für ${activeSkill==='horen'?'Hören':'Lesen'}. Liste startet leer — tippe die Wörter an, die du üben willst.`
        :`Pick up to ${cap} words for ${activeSkill==='horen'?'Listening':'Reading'}. The list starts empty — tick the words you want to practice.`)
      :(isDE
        ?'Aus deinem Deck. Tippe an, um ein Wort ein- oder auszuschließen (Pool-Filter).'
        :'From your deck. Tap to include or exclude a word (pool filter).');
  const actionsDisabled=isGenModule?' style="display:none"':'';
  return`<div class="ec-vocab-card${isGenModule?' ec-vocab-card--disabled':''}">
    <div class="ec-vocab-head"><span class="ec-vocab-title">${title}</span><span class="ec-vocab-count">${countLabel}</span></div>
    <p class="ec-vocab-sub">${sub}</p>
    <div class="ec-vocab-actions"${actionsDisabled}>
      <button type="button" onclick="selectAllConfigWords()">${isDE?'Alle auswählen':'Select all'}</button>
      <button type="button" onclick="deselectAllConfigWords()">${isDE?'Alle abwählen':'Deselect all'}</button>
      ${dueN>0?`<button type="button" onclick="selectAllDueConfig()">${isDE?`Nur fällige (${dueN})`:`Due only (${dueN})`}</button>`:''}
    </div>
    <div class="vv-cols ec-vocab-cols ec-vocab-cols${isGenModule?'--readonly':''}">${cols}</div>
    ${!isGenModule&&typeof vocabHubUsedLegendSnippet==='function'?`<p class="ec-vocab-legend vv-legend">${vocabHubUsedLegendSnippet()}</p>`:''}
    ${dueN>0&&!isGenModule?`<p class="ec-vocab-legend"><span class="due-dot"></span> ${isDE?'heute fällig':'due today'}</p>`:''}
  </div>`;
}
function configTopicSelectHtml(goal,activeSkill){
  if(goal.subject!=='de')return'';
  const skill=activeSkill||configActiveSkillKey(_examConfig.skills);
  if(typeof PersonalTopicStock!=='undefined'&&!PersonalTopicStock.supportsTopicPicker(goal,skill))return'';
  const Stock=typeof PersonalTopicStock!=='undefined'
    ?PersonalTopicStock.stockForConfig(goal,skill)
    :(typeof PersonalLesenTopicStock!=='undefined'&&skill==='lesen'?PersonalLesenTopicStock:null);
  if(!Stock)return'';
  const isDE=goal.subject==='de';
  const teilN=Stock.getManifest?.()?.teils?.length||(skill==='horen'?4:5);
  const rows=Stock.sortTopicsForSelect();
  const full=rows.filter(r=>r.full);
  const partial=rows.filter(r=>!r.full);
  const words=deckForGoal(goal).filter(f=>_examConfig.selectedIds.has(fcId(f))).map(f=>f.word);
  if(!_examConfig.topicChoice){
    _examConfig.topicChoice=Stock.pickDefaultTopicForWords(words);
  }
  const cur=_examConfig.topicChoice||Stock.pickDefaultTopicForWords(words);
  const suggested=Stock.pickDefaultTopicForWords(words);
  const fullTopic=Stock.isTopicFull(cur);
  const opt=(row)=>{
    const badge=Stock.badgeLabel(row.topic,isDE?'de':'en');
    const sel=cur===row.topic?' selected':'';
    return`<option value="${esc(row.topic)}"${sel} title="${esc(Stock.badgeHint(row.topic,isDE?'de':'en'))}">${esc(row.topic)} ${esc(badge)}</option>`;
  };
  const suggestHint=Stock.suggestTopicHint?Stock.suggestTopicHint(words,isDE?'de':'en'):'';
  const manifest=Stock.getManifest?.();
  const fallbackNote=manifest?.fallback
    ?(isDE?`<p class="exam-config-topic-hint exam-config-topic-hint--warn">Pool ${goal.level} — stock en actualización; temas pueden tener poco contenido.</p>`
      :`<p class="exam-config-topic-hint exam-config-topic-hint--warn">Pool ${goal.level} — stock updating; topics may have limited content.</p>`)
    :'';
  const resetBtn=_examConfig.topicTouched&&suggested&&suggested!==cur
    ?`<button type="button" class="exam-config-topic-reset" onclick="resetConfigTopicToSuggestion()">${isDE?`Vorschlag: ${esc(suggested)}`:`Suggested: ${esc(suggested)}`}</button>`
    :'';
  const fullLabel=isDE?`✓ Alle ${teilN} Teile verfügbar`:`✓ All ${teilN} parts available`;
  return`${examConfigStepLabel(2,isDE?'Thema wählen':'Choose topic')}
    <select class="exam-config-topic-select" aria-label="${isDE?'Thema wählen':'Choose topic'}" onchange="setConfigTopicChoice(this.value)">
      <optgroup label="${fullLabel}">${full.map(opt).join('')}</optgroup>
      <optgroup label="${isDE?'Mit wenig Inhalt':'Limited content'}">${partial.map(opt).join('')}</optgroup>
    </select>
    <p class="exam-config-topic-hint${fullTopic?' exam-config-topic-hint--ok':''}">${esc(Stock.badgeHint(cur,isDE?'de':'en'))}</p>
    <p class="exam-config-topic-suggest">${esc(suggestHint)}</p>
    ${resetBtn}
    ${fallbackNote}`;
}
function configSectionMeta(skill,goal){
  const parts=_examConfig.blueprintParts?.[skill];
  const n=parts?.length||(skill==='lesen'?5:skill==='horen'?4:3);
  const isDE=goal.subject==='de';
  const mins=Math.max(5,Math.round(n*4));
  if(isDE)return`Alle ${n} Aufgaben · ~${mins} Min.`;
  return`All ${n} parts · ~${mins} min`;
}
function configFootNote(skill,goal){
  const isDE=goal.subject==='de';
  const poolModule=typeof isPersonalModulePoolFirst==='function'&&isPersonalModulePoolFirst([skill],goal.subject,goal.level);
  const poolOnly=typeof isExamPoolOnly==='function'?isExamPoolOnly():true;
  if(poolModule||poolOnly){
    return isDE?'Aus dem Pool · sofort verfügbar · gratis':'From pool · instant · free';
  }
  const action=typeof personalGenCreditAction==='function'?personalGenCreditAction([skill]):'personal_exam';
  const cost=typeof aiActionCost==='function'?aiActionCost(action):2;
  if(isDE)return`KI-Generierung · ${cost} Credit${cost===1?'':'s'}`;
  return`AI generation · ${cost} credit${cost===1?'':'s'}`;
}
function estimateConfigQuestions(nWords,skillsSet){
  const skills=skillsSet instanceof Set?[...skillsSet]:(Array.isArray(skillsSet)?skillsSet:['lesen']);
  if(typeof VocabBatching!=='undefined'){
    return Math.max(4,Math.min(nWords,VocabBatching.capacityFor(skills)));
  }
  return Math.max(4,nWords*skills.length);
}
function renderExamConfigurator(){
  const goal=S.goals.find(g=>g.id===_examConfig.goalId);
  const el=document.getElementById('examConfigContent');
  if(!goal||!el)return;
  const isDE=goal.subject==='de';
  const isES=goal.subject==='es';
  const ui=typeof examUiStrings==='function'?examUiStrings(isDE?'de':isES?'es':'en'):{reading:'Reading',listening:'Listening',writing:'Writing',speaking:'Speaking'};
  const selN=_examConfig.selectedIds.size;
  const activeSkill=configActiveSkillKey(_examConfig.skills);
  const skillLbl=configActiveSkillLabel(_examConfig.skills,goal.subject);
  const topicHtml=configTopicSelectHtml(goal,activeSkill);
  const stepVocab=topicHtml?3:2;
  const h1=isDE?'Übungssatz erstellen':'Section practice';
  const lede=isDE
    ?`Übe einen <b>${esc(goal.level)}</b>-Prüfungsteil mit deinem eigenen Wortschatz.`
    :`Practice one <b>${esc(goalLabel(goal))}</b> section using your vocabulary.`;
  const metaLine=isDE
    ?'Wir wählen passende Wörter aus deinem Deck aus, wo möglich.'
    :'We pre-select suitable words from your deck where possible.';
  el.innerHTML=`
    <h1 class="exam-config-h1">${h1}</h1>
    <p class="exam-config-lede">${lede}</p>
    <p class="exam-config-meta">${metaLine}</p>
    ${examConfigStepLabel(1,isDE?'Prüfungsteil wählen':'Choose section')}
    ${examConfigSkillGridHtml(ui,goal)}
    ${topicHtml}
    ${examConfigStepLabel(stepVocab,isDE?'Wortschatz':'Vocabulary')}
    ${examConfigVocabPanelHtml(goal,activeSkill)}`;
  const summary=document.getElementById('examConfigSummary');
  const genBtn=document.getElementById('examConfigGenerateBtn');
  const qEst=estimateConfigQuestions(selN,_examConfig.skills);
  const remAi=typeof getAiCreditsRemaining==='function'?getAiCreditsRemaining():null;
  const topicLbl=_examConfig.topicChoice&&typeof PersonalTopicStock!=='undefined'&&PersonalTopicStock.supportsTopicPicker(goal,activeSkill)?esc(_examConfig.topicChoice):(_examConfig.topicChoice&&activeSkill==='lesen'?esc(_examConfig.topicChoice):null);
  const footNote=configFootNote(activeSkill,goal);
  if(summary){
    let txt='<b>'+esc(skillLbl);
    if(topicLbl)txt+=' · '+topicLbl;
    txt+='</b> · '+selN+' '+(isDE?'Wörter':'words');
    if(!footNote.includes('Pool')&&!footNote.includes('pool')&&!footNote.includes('gratis')&&!footNote.includes('free'))txt+=' · ~'+qEst+' Q';
    if(typeof getAiCreditsRemaining==='function'&&remAi===3&&!footNote.includes('Pool'))txt+=' · <span class="exam-config-quota-warn">'+(isDE?'Letzte 3 Credits':'Last 3 credits')+'</span>';
    else if(typeof aiCreditsMeterLabel==='function'&&(typeof isPro==='function'&&isPro()||typeof isFreeAiTrial==='function'&&isFreeAiTrial())&&!footNote.includes('Pool')){
      txt+=' · '+esc(aiCreditsMeterLabel());
    }
    summary.innerHTML=txt+'<span class="ec-foot-note">'+esc(footNote)+'</span>';
  }
  const aiCreditsEl=document.getElementById('examConfigAiCredits');
  if(aiCreditsEl){
    if(S.plan!=='guest'&&typeof aiCreditsMeterLabel==='function'&&aiCreditsMeterLabel()){
      aiCreditsEl.textContent=aiCreditsMeterLabel();
      aiCreditsEl.style.display='';
    }else{
      aiCreditsEl.textContent='';
      aiCreditsEl.style.display='none';
    }
  }
  if(genBtn){
    const poolOnly=typeof isExamPoolOnly==='function'?isExamPoolOnly():(typeof window!=='undefined'&&(window.EXAM_POOL_ONLY??true));
    const poolModule=typeof isPersonalModulePoolFirst==='function'&&isPersonalModulePoolFirst([activeSkill],goal.subject,goal.level);
    const poolVocabModule=typeof PersonalTopicStock!=='undefined'&&PersonalTopicStock.skillUsesTopicPicker(activeSkill);
    const minSel=poolVocabModule&&typeof PersonalTopicStock!=='undefined'?PersonalTopicStock.PERSONAL_VOCAB_MIN_SELECT:2;
    const aiOk=poolOnly||poolModule||(typeof canUsePersonalModuleGen==='function'?canUsePersonalModuleGen([activeSkill],goal.subject,goal.level):(typeof canUseAiGeneration==='function'&&canUseAiGeneration()));
    genBtn.disabled=selN<minSel||_examConfig.skills.size<1||!aiOk;
    if(!aiOk){
      if(typeof getAiCreditsRemaining==='function'&&getAiCreditsRemaining()===0)genBtn.textContent=isDE?'Keine Credits — Pro upgraden':'No credits left — upgrade to Pro';
      else if(typeof isPaidPlan==='function'&&!isPaidPlan())genBtn.textContent=isDE?'Personalisiert nur mit Pro':'Personalized exams require Pro';
      else genBtn.textContent=isDE?'Keine KI-Credits':'No AI credits — buy pack';
    }else{
      const creditAction=typeof personalGenCreditAction==='function'?personalGenCreditAction([activeSkill]):'personal_exam';
      const suffix=typeof aiCreditCostSuffix==='function'?aiCreditCostSuffix(creditAction):'';
      genBtn.textContent=isDE?`${skillLbl} üben${suffix} →`:`Practice ${skillLbl}${suffix} →`;
    }
  }
  if(typeof updQuotaUI==='function')updQuotaUI();
}
function submitExamConfig(){
  const goal=S.goals.find(g=>g.id===_examConfig.goalId);
  if(!goal)return;
  if(typeof isPersonalizedAllowed==='function'&&!isPersonalizedAllowed(goal.subject,goal.level)){
    lcToast(typeof LevelAvailability!=='undefined'?LevelAvailability.personalizedUnavailableMessage(goal.subject,goal.level):'Personalized practice is not available for this level yet.','warn',7000);
    return;
  }
  const words=deckForGoal(goal).filter(f=>_examConfig.selectedIds.has(fcId(f))).map(f=>f.word);
  const skills=[..._examConfig.skills].slice(0,1);
  const activeSkill=skills[0]||'lesen';
  const poolVocabModule=typeof PersonalTopicStock!=='undefined'&&PersonalTopicStock.skillUsesTopicPicker(activeSkill);
  const minWords=poolVocabModule&&typeof PersonalTopicStock!=='undefined'?PersonalTopicStock.PERSONAL_VOCAB_MIN_SELECT:2;
  if(words.length<minWords){
    const isDE=goal.subject==='de';
    lcToast(
      poolVocabModule&&minWords>=4
        ?(isDE?`Wähle mindestens ${minWords} Wörter (Ziel: min. 3 im Text).`:`Select at least ${minWords} words (goal: 3+ in the text).`)
        :'Select at least 2 words.',
      'warn',
    );
    return;
  }
  if(skills.length<1){lcToast('Select one exam part.','warn');return;}
  const poolOnly=typeof isExamPoolOnly==='function'?isExamPoolOnly():(typeof window!=='undefined'&&(window.EXAM_POOL_ONLY??true));
  const poolModule=typeof isPersonalModulePoolFirst==='function'&&isPersonalModulePoolFirst(skills,goal.subject,goal.level);
  if(!poolOnly&&!poolModule){
    if(typeof canUsePersonalModuleGen==='function'){
      if(!canUsePersonalModuleGen(skills,goal.subject,goal.level)){
        if(typeof isPaidPlan==='function'&&!isPaidPlan()){
          if(typeof showUpgrade==='function')showUpgrade();
          return;
        }
        if(typeof openCreditPackModal==='function')openCreditPackModal();
        else if(typeof showAiCreditsExhausted==='function')showAiCreditsExhausted();
        return;
      }
      const creditAction=typeof personalGenCreditAction==='function'?personalGenCreditAction(skills):'personal_exam';
      if(creditAction&&typeof requireAiCredits==='function'&&!requireAiCredits(creditAction))return;
    }else{
      if(typeof requirePersonalized==='function'&&!requirePersonalized())return;
      if(typeof canUseAiGeneration==='function'&&!canUseAiGeneration()){
        if(typeof isPro==='function'&&isPro()){
          if(typeof openCreditPackModal==='function')openCreditPackModal();
          else if(typeof showAiCreditsExhausted==='function')showAiCreditsExhausted();
        }else if(typeof showUpgrade==='function')showUpgrade();
        return;
      }
    }
  }
  showExamConfigFootbar(false);
  const gid=_examConfig.goalId;
  generatePersonalExam(words,skills,gid,{teilFilter:'all',topic:_examConfig.topicChoice});
}
function openDeckHub(goalId,options){
  const goal=S.goals.find(g=>g.id===goalId);
  if(!goal)return;
  const fromVocabHub=!!(options&&options.fromVocabHub);
  if(!fromVocabHub){
    clearVocabHubFlashcardMode();
    S.fcSelected.clear();
    S.fcTab='all';
  }
  S.activeGoalId=goalId;
  S.deckGoalFilter=goal.subject;
  S.fcSingleIdx=0;
  S.fcSingleFlipped=false;
  syncGoalToProfile(goal);
  saveGoals();
  hideAll();
  show('flashcardScreen');
  renderDeckHub();
  if(typeof LcRouter!=='undefined')LcRouter.replaceRoute(LcRouter.goalPath(goal,'deck'),'Vocabulary');
  window.scrollTo({top:0,behavior:'smooth'});
}
function renderDeckHub(){
  const inHub=!!S.deckGoalFilter;
  const goal=getActiveGoal();
  const nav=document.getElementById('fcHubNav');
  const head=document.getElementById('fcHubHeader');
  const ways=document.getElementById('fcHubWays');
  const wordsLbl=document.getElementById('fcHubWordsLbl');
  const foot=document.getElementById('fcHubFootnote');
  const legacy=document.getElementById('fcLegacyTop');
  const showLanding=inHub&&S.fcTab==='all';
  if(nav)nav.style.display=inHub?'block':'none';
  if(head)head.style.display=inHub?'block':'none';
  if(wordsLbl)wordsLbl.style.display=showLanding?'block':'none';
  if(foot)foot.style.display=showLanding?'block':'none';
  if(legacy)legacy.style.display=inHub?'none':'block';
  const es=document.getElementById('fcExamSec');
  const ps=document.getElementById('fcPersonalSec');
  const persLevel=document.getElementById('fcPersonalLevel')?.value||goal?.level||S.level||'B1';
  const persLang=goal?.subject||S.subject||'de';
  const persOk=typeof isPersonalizedAllowed!=='function'||isPersonalizedAllowed(persLang,persLevel);
  if(es)es.style.display=inHub?'none':(getDeckViewCards().length>0?'block':'none');
  if(ps)ps.style.display=inHub?'none':(getDeckViewCards().length>0&&persOk?'block':'none');
  if(!inHub||!goal){renderFC(false);return;}
  const title=document.getElementById('fcHubTitle');
  if(title)title.textContent='Flashcards';
  const deck=deckForGoal(goal);
  const due=dueForGoal(goal).length;
  const ctx=document.getElementById('fcHubCtx');
  if(ctx)ctx.innerHTML='<b>'+esc(goalLabel(goal))+'</b> · '+deck.length+' word'+(deck.length===1?'':'s')+' saved'+(due>0?' · <b>'+due+' due for review today</b>':'');
  if(ways){
    const dueBadge=due>0?`<span class="badge-due">${due} due</span>`:'';
    ways.innerHTML=`
      <div class="deck-way${due>0?' accent':''}" onclick="setFcTab('study')">
        <h3>Flashcards ${dueBadge}</h3>
        <p>Spaced-repetition review. Rate each word and we schedule the next.</p>
        <span class="deck-way-cta">Review due →</span>
      </div>
      <div class="deck-way">
        <h3>Quiz <span class="badge-pill badge-purple">Pro · 2 credits</span></h3>
        <p>AI writes a synonym, antonym or hint — you pick the matching word from your deck.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button type="button" class="btn-sm accent" onclick="deckHubStartQuiz()">Start AI quiz →</button>
        </div>
      </div>
      <div class="deck-way soon">
        <h3>Words in sentences <span class="badge-soon">Soon</span></h3>
        <p>Fill the gap or write your own sentence, checked by AI.</p>
      </div>
      <div class="deck-way soon">
        <h3>Match game <span class="badge-soon">Soon</span></h3>
        <p>Pair words with meanings against the clock.</p>
      </div>`;
    ways.style.display=showLanding?'':'none';
  }
  if(foot){
    const other=goal.subject==='de'?'Cambridge':'Goethe';
    foot.textContent='Flashcards and quiz work today. Sentences and the match game are in development. This deck shows only your '+goalLabel(goal)+' words — your '+other+' words live in that goal\'s deck.';
  }
  const ta=document.getElementById('fcTabAll');
  const td=document.getElementById('fcTabDue');
  if(ta)ta.textContent='All · '+deck.length;
  if(td)td.textContent='Due · '+due;
  renderFC(false);
}
function deckHubStartQuiz(){
  const deck=getDeckViewCards();
  if(deck.length<4){lcToast('You need at least 4 words in this deck for a quiz.','warn');return;}
  ensureFcIds();
  S.fcSelected.clear();
  deck.forEach(f=>S.fcSelected.add(fcId(f)));
  if(typeof _vocabHub!=='undefined')_vocabHub.veFromVocab=false;
  startVE();
}
function renderProfileBar(){
  const el=document.getElementById('profileBarExam');
  const demo=document.getElementById('profileBarDemo');
  const goal=getActiveGoal();
  const onWs=document.getElementById('goalWorkspaceScreen')?.style.display==='block';
  if(el){
    if(onWs&&goal)el.textContent=goalLabel(goal);
    else el.textContent=typeof ExamProfile!=='undefined'?ExamProfile.getActiveLabel():getPreparingFor();
  }
  if(demo)demo.style.display='none';
}
function showProfileSetup(){
  if(typeof isFreeAccount==='function'&&isFreeAccount()){
    hideAll();show('profileSetupScreen');
    const fc=typeof getFreeCombo==='function'?getFreeCombo():null;
    const label=typeof freeComboLabel==='function'?freeComboLabel(fc):'your exam';
    document.getElementById('profileCertGrid')?.style.setProperty('display','none');
    document.getElementById('profileLevelGrid')?.style.setProperty('display','none');
    document.querySelector('#profileSetupScreen .u-section-label')?.style.setProperty('display','none');
    document.querySelectorAll('#profileSetupScreen .u-section-label')[1]?.style.setProperty('display','none');
    const h2=document.querySelector('#profileSetupScreen .screen-h1');
    const sub=document.querySelector('#profileSetupScreen .screen-sub');
    if(h2)h2.textContent='Your Free plan exam';
    if(sub)sub.innerHTML=`Free includes one certification: <b>${esc(label)}</b>. You get <b>5 official mock exams</b> per month on this level, plus flashcards and free retakes. Upgrade to Pro for all languages, levels, and personalized practice.`;
    const btn=document.getElementById('btnProfileSave');
    if(btn){btn.disabled=false;btn.textContent='Continue →';btn.onclick=function(){goHome();};}
    const sw=document.getElementById('profileSwitcher');if(sw){sw.style.display='none';sw.innerHTML='';}
    window.scrollTo({top:0,behavior:'smooth'});
    return;
  }
  hideAll();show('profileSetupScreen');S.profileCert=S.subject||null;S.profileLevel=S.level||null;
  document.getElementById('profileCertGrid')?.style.removeProperty('display');
  document.getElementById('profileLevelGrid')?.style.removeProperty('display');
  document.querySelector('#profileSetupScreen .u-section-label')?.style.removeProperty('display');
  document.querySelectorAll('#profileSetupScreen .u-section-label')[1]?.style.removeProperty('display');
  const h2=document.querySelector('#profileSetupScreen .screen-h1');
  const sub=document.querySelector('#profileSetupScreen .screen-sub');
  if(h2)h2.textContent='What are you preparing for?';
  if(sub)sub.textContent='All vocabulary, progress, and exams stay inside this certification profile.';
  const btn=document.getElementById('btnProfileSave');
  if(btn){btn.textContent='Start preparing →';btn.onclick=saveExamProfile;}
  document.querySelectorAll('#profileCertGrid .setup-card').forEach(c=>c.classList.toggle('selected',c.dataset.subject===S.profileCert));
  renderProfileSwitcher();renderProfileLevelGrid();window.scrollTo({top:0,behavior:'smooth'});
}
function renderProfileSwitcher(){
  const box=document.getElementById('profileSwitcher');
  if(!box||typeof ExamProfile==='undefined')return;
  const profiles=ExamProfile.getProfiles();
  if(profiles.length<2){box.style.display='none';box.innerHTML='';return;}
  const active=ExamProfile.getActiveId();
  box.style.display='block';
  box.innerHTML=`<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">Your exam profiles</div>
    <div class="profile-switch-list">${profiles.map(p=>`<div class="profile-switch-item${p.id===active?' active':''}" onclick="switchExamProfile('${p.id}')"><div><div class="profile-switch-item__label">${esc(p.label)}</div><div class="profile-switch-item__meta">${p.id===active?'Active profile':'Switch to this profile'}</div></div><span style="font-size:11px;font-weight:700;color:var(--brand)">${p.id===active?'✓':''}</span></div>`).join('')}</div>
    <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);margin:18px 0 10px">Or add another certification</div>`;
}
function switchExamProfile(id){
  if(typeof ExamProfile==='undefined')return;
  const p=ExamProfile.getProfiles().find(x=>x.id===id);
  if(p&&typeof requireProForCombo==='function'&&!requireProForCombo(p.subject,p.level))return;
  ExamProfile.setActiveProfile(id);
  const active=ExamProfile.getActive();
  if(active){S.subject=active.subject;S.level=active.level;}
  updBadges();goHome();lcToast('Switched to '+ExamProfile.getActiveLabel(),'success');
}
function selectProfileCert(sub,el){
  if(typeof isFreeAccount==='function'&&isFreeAccount()){if(typeof showUpgrade==='function')showUpgrade();return;}
  S.profileCert=sub;document.querySelectorAll('#profileCertGrid .setup-card').forEach(c=>c.classList.remove('selected'));
  if(el)el.classList.add('selected');renderProfileLevelGrid();
}
function renderProfileLevelGrid(){
  const grid=document.getElementById('profileLevelGrid');
  const btn=document.getElementById('btnProfileSave');
  if(!grid||!S.profileCert)return;
  const advertised=typeof LibraryCatalog!=='undefined'?LibraryCatalog.advertisedLevels(S.profileCert):LEVELS[S.profileCert].map(l=>l.code);
  const metaByCode=Object.fromEntries((LEVELS[S.profileCert]||[]).map(l=>[l.code,l]));
  function levelStatus(code){
    if(typeof LibraryCatalog!=='undefined'&&LibraryCatalog.getLevelUiStatus)return LibraryCatalog.getLevelUiStatus(S.profileCert,code);
    if(typeof LevelAvailability!=='undefined')return LevelAvailability.getLevelUiStatus(S.profileCert,code);
    return'ready';
  }
  if(S.profileLevel&&levelStatus(S.profileLevel)==='soon')S.profileLevel=null;
  grid.innerHTML=advertised.map(code=>{
    const meta=metaByCode[code]||{code,name:code};
    const status=levelStatus(code);
    const soon=status==='soon';
    const sel=!soon&&S.profileLevel===code;
    const click=soon?` onclick="openLevelSoonNotify('${S.profileCert}','${code}')"`: ` onclick="selectProfileLevel('${code}')"`;
    const badge=typeof LevelAvailability!=='undefined'?LevelAvailability.levelBadgeHtml(status):'';
    return`<div class="level-card${sel?' selected':''}${soon?' level-card--soon':''}"${click}><div class="lc-code">${meta.code}${badge?'<span class="level-card__badge">'+badge+'</span>':''}</div><div class="lc-name">${esc(meta.name)}</div>${soon?'<div class="level-card__hint">Tap to get notified</div>':''}</div>`;
  }).join('');
  if(btn)btn.disabled=!S.profileLevel||levelStatus(S.profileLevel)==='soon';
}
function selectProfileLevel(code){
  if(typeof isFreeAccount==='function'&&isFreeAccount()){if(typeof showUpgrade==='function')showUpgrade();return;}
  if(typeof LibraryCatalog!=='undefined'&&LibraryCatalog.getLevelUiStatus&&LibraryCatalog.getLevelUiStatus(S.profileCert,code)==='soon'){
    if(typeof openLevelSoonNotify==='function')openLevelSoonNotify(S.profileCert,code);
    return;
  }
  S.profileLevel=code;renderProfileLevelGrid();
}
function saveExamProfile(){
  if(!S.profileCert||!S.profileLevel)return;
  if(typeof requireProForCombo==='function'&&!requireProForCombo(S.profileCert,S.profileLevel))return;
  if(typeof ExamProfile!=='undefined')ExamProfile.createProfile(S.profileCert,S.profileLevel);
  S.subject=S.profileCert;S.level=S.profileLevel;
  goHome();lcToast('Preparing for '+ExamProfile.getActiveLabel(),'success');
}
function userMenuProfile(){closeUserMenu();showProfileSetup();}

function openAudioSettings(){
  closeUserMenu();
  const modal=document.getElementById('audioSettingsModal');
  if(!modal)return;
  modal.style.display='flex';
  _renderAudioSettingsContent();
}
function closeAudioSettings(){
  const modal=document.getElementById('audioSettingsModal');
  if(modal)modal.style.display='none';
}
function _renderAudioSettingsContent(){
  const el=document.getElementById('audioSettingsContent');
  if(!el)return;
  const lang=typeof S!=='undefined'?S.subject||'de':'de';
  const langCode=lang==='de'?'de-DE':lang==='es'?'es-ES':'en-GB';
  const langLabel=lang==='de'?'Deutsch':lang==='es'?'Español':'English';

  function render(voices){
    const pref=typeof getTtsVoicePref==='function'?getTtsVoicePref(lang):null;
    if(!voices||!voices.length){
      el.innerHTML='<p style="font-size:13px;color:var(--text-muted)">No voices found for '+langLabel+'. Your browser will use its default voice.</p>';
      return;
    }
    const opts=voices.map(v=>`<option value="${v.name}"${(pref===v.name||(!pref&&voices[0]===v))?' selected':''}>${v.name}${v.localService?' (offline)':''}</option>`).join('');
    el.innerHTML=`
      <div style="margin-bottom:12px">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">${langLabel} voice</label>
        <select id="audioVoicePicker" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px">${opts}</select>
      </div>
      <button class="btn-sm blue" onclick="_testAudioVoice()" style="margin-right:8px">▶ Test voice</button>
      <button class="btn-sm" onclick="_saveAudioVoice()">Save</button>
      <p id="audioVoiceSaved" style="font-size:12px;color:var(--brand);display:none;margin-top:8px">✓ Voice saved</p>
    `;
  }

  if(typeof listBrowserVoices==='function'){
    let voices=listBrowserVoices(lang);
    if(!voices.length&&window.speechSynthesis){
      window.speechSynthesis.onvoiceschanged=function(){
        voices=listBrowserVoices(lang);
        render(voices);
        window.speechSynthesis.onvoiceschanged=null;
      };
      window.speechSynthesis.getVoices();
      setTimeout(()=>{if(!voices.length)render([]);},1500);
    }else{render(voices);}
  }else{
    el.innerHTML='<p style="font-size:13px;color:var(--text-muted)">Audio uses your browser\'s built-in speech synthesizer.</p>';
  }
}
function _testAudioVoice(){
  const picker=document.getElementById('audioVoicePicker');
  const lang=typeof S!=='undefined'?S.subject||'de':'de';
  const voices=typeof listBrowserVoices==='function'?listBrowserVoices(lang):[];
  const name=picker?picker.value:null;
  const voice=name?voices.find(v=>v.name===name):null;
  if(!window.speechSynthesis)return;
  window.speechSynthesis.cancel();
  const testText={'de':'Guten Tag! Das ist ein Hörbeispiel.','es':'¡Hola! Este es un ejemplo de audio.'}[lang]||'Hello! This is a test of your selected voice.';
  const u=new SpeechSynthesisUtterance(testText);
  u.lang=lang==='de'?'de-DE':lang==='es'?'es-ES':'en-GB';
  u.rate=0.9;
  if(voice)u.voice=voice;
  window.speechSynthesis.speak(u);
}
function _saveAudioVoice(){
  const picker=document.getElementById('audioVoicePicker');
  const lang=typeof S!=='undefined'?S.subject||'de':'de';
  if(picker&&typeof setTtsVoicePref==='function'){
    setTtsVoicePref(lang,picker.value);
    const saved=document.getElementById('audioVoiceSaved');
    if(saved){saved.style.display='block';setTimeout(()=>{saved.style.display='none';},2500);}
  }
}
