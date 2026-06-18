const _examConfig={goalId:null,selectedIds:new Set(),skills:new Set(['lesen']),seedCount:0};
function showExamConfigFootbar(visible){
  const fb=document.getElementById('examConfigFootbar');
  if(fb)fb.style.display=visible?'flex':'none';
}
function openExamConfigurator(goalId,preselectedIds){
  const goal=S.goals.find(g=>g.id===goalId);
  if(!goal)return;
  S.activeGoalId=goalId;
  syncGoalToProfile(goal);
  saveGoals();
  _examConfig.goalId=goalId;
  _examConfig.skills=new Set(['lesen']);
  _examConfig.selectedIds=new Set();
  _examConfig.seedCount=0;
  const deck=deckForGoal(goal);
  if(preselectedIds&&preselectedIds.length){
    preselectedIds.forEach(id=>{if(deck.some(f=>fcId(f)===id))_examConfig.selectedIds.add(id);});
    _examConfig.seedCount=_examConfig.selectedIds.size;
  }
  if(_examConfig.selectedIds.size<4){
    deck.forEach(f=>{if(isDue(f))_examConfig.selectedIds.add(fcId(f));});
    if(_examConfig.selectedIds.size<4)deck.forEach(f=>_examConfig.selectedIds.add(fcId(f)));
  }
  hideAll();
  show('examConfigScreen');
  showExamConfigFootbar(true);
  renderExamConfigurator();
  if(typeof LcRouter!=='undefined')LcRouter.replaceRoute(LcRouter.goalPath(goal,'config'),'Exams');
  window.scrollTo({top:0,behavior:'smooth'});
}
function examConfigFootAction(){submitExamConfig();}
function toggleConfigWord(id){
  if(_examConfig.selectedIds.has(id))_examConfig.selectedIds.delete(id);
  else _examConfig.selectedIds.add(id);
  renderExamConfigurator();
}
function selectAllDueConfig(){
  const goal=S.goals.find(g=>g.id===_examConfig.goalId);
  if(!goal)return;
  deckForGoal(goal).forEach(f=>{if(isDue(f))_examConfig.selectedIds.add(fcId(f));});
  renderExamConfigurator();
}
function toggleConfigSkill(skill){
  if(skill==='schreiben')return;
  _examConfig.skills=new Set([skill]);
  renderExamConfigurator();
}
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
  const deck=deckForGoal(goal);
  const dueN=dueForGoal(goal).length;
  const selN=_examConfig.selectedIds.size;
  const seedHtml=_examConfig.seedCount>=4
    ?`<div class="card note-card exam-config-seed"><b>Built from your ${_examConfig.seedCount} selected words</b> — tap to add or remove.</div>`
    :`<div class="card note-card exam-config-seed"><b>Uses words from your deck</b> — we pre-selected due words where possible.</div>`;
  const partCard=(key,title,sub,status)=>{
    const isSoon=status==='soon';
    const on=!isSoon&&_examConfig.skills.has(key);
    const click=isSoon?'':' onclick="toggleConfigSkill(\''+key+'\')"';
    // Radio-button indicator: filled circle when selected, empty otherwise
    const radio=isSoon?'':'<span class="exam-config-radio-dot" aria-hidden="true">'+(on?'●':'○')+'</span>';
    return`<div class="exam-config-part-card${on?' on':''}${isSoon?' soon':''}"${click} role="radio" aria-checked="${on}">${radio}<span class="n">${esc(title)}<small>${esc(sub)}</small></span><span class="exam-config-part-meta">${configPartBadge(status)}</span></div>`;
  };
  const chips=deck.map(f=>{
    const id=fcId(f);
    const on=_examConfig.selectedIds.has(id);
    const due=isDue(f);
    const art=typeof fcGenderArticle==='function'?fcGenderArticle(f,goal.subject):null;
    const word=typeof vocabHubDisplayWord==='function'?vocabHubDisplayWord(f,goal.subject):f.word;
    const artHtml=art?'<span class="vv-art '+art.cls+'">'+esc(art.article)+'</span> ':'';
    return'<span class="exam-config-chip'+(on?' on':'')+'" onclick="toggleConfigWord(\''+esc(id)+'\')"><span class="tk">'+(on?'✓':'')+'</span>'+(due?'<span class="due-dot"></span>':'')+artHtml+esc(word)+'</span>';
  }).join('');
  const chipsHtml=deck.length?'<div class="exam-config-chips">'+chips+'</div><p class="exam-config-hint">● amber dot = due for review today</p>':'<p class="exam-config-hint">No words in this deck yet. Save words during a practice exam first.</p>';
  const skillLbl=configActiveSkillLabel(_examConfig.skills,goal.subject);
  const oralOnly=_examConfig.skills.size===1&&_examConfig.skills.has('sprechen');
  el.innerHTML=`
    <h1 class="exam-config-h1">Section practice</h1>
    <p class="exam-config-lede">Practice one <b>${esc(goalLabel(goal))}</b> section using your vocabulary. Genera y practica una sección cada vez.</p>
    ${seedHtml}
    <p class="exam-config-seclbl">Choose a section</p>
    ${partCard('lesen',ui.reading,'Reading comprehension with your vocabulary','ready')}
    ${partCard('horen',ui.listening,'Listening tasks with your vocabulary','ready')}
    ${partCard('sprechen',ui.speaking,'Speaking task with microphone + AI evaluation','ready')}
    ${partCard('schreiben',ui.writing,'Writing prompts from your vocabulary','soon')}
    <p class="exam-config-hint">~1–2 min · 3 AI credits · each section is saved for reuse.</p>
    <p class="exam-config-seclbl"><span>Words to include · ${selN} selected</span>${dueN>0?'<button type="button" class="exam-config-cta" onclick="selectAllDueConfig()">Select all due ('+dueN+') →</button>':''}</p>
    <div class="exam-config-panel">${chipsHtml}</div>`;
  const summary=document.getElementById('examConfigSummary');
  const genBtn=document.getElementById('examConfigGenerateBtn');
  const qEst=estimateConfigQuestions(selN,_examConfig.skills);
  const remAi=typeof getAiCreditsRemaining==='function'?getAiCreditsRemaining():null;
  if(summary){
    let txt='<b>'+selN+' word'+(selN===1?'':'s')+'</b> · '+esc(skillLbl)+' section';
    if(oralOnly)txt+=' · oral practice';
    else txt+=' · ~'+qEst+' questions · 3 AI credits';
    if(typeof getAiCreditsRemaining==='function'&&remAi===3)txt+=' · <span class="exam-config-quota-warn">Last 3 credits</span>';
    else if(typeof getAiCreditsRemaining==='function'&&typeof aiCreditsMeterLabel==='function'&&isPro()){
      txt+=' · '+esc(aiCreditsMeterLabel());
    }
    summary.innerHTML=txt;
  }
  if(genBtn){
    const aiOk=typeof canUseAiGeneration!=='function'||canUseAiGeneration();
    genBtn.disabled=selN<2||_examConfig.skills.size<1||!aiOk;
    if(!aiOk)genBtn.textContent='No AI credits — buy pack';
    else if(oralOnly)genBtn.textContent='Practice speaking →';
    else genBtn.textContent='Practice '+esc(skillLbl)+' →';
  }
}
function submitExamConfig(){
  const goal=S.goals.find(g=>g.id===_examConfig.goalId);
  if(!goal)return;
  const words=deckForGoal(goal).filter(f=>_examConfig.selectedIds.has(fcId(f))).map(f=>f.word);
  const skills=[..._examConfig.skills].slice(0,1);
  if(words.length<2){lcToast('Select at least 2 words.','warn');return;}
  if(skills.length<1){lcToast('Select one exam part.','warn');return;}
  if(typeof requirePersonalized==='function'&&!requirePersonalized())return;
  if(typeof canUseAiGeneration==='function'&&!canUseAiGeneration()){
    if(typeof openCreditPackModal==='function')openCreditPackModal();
    else if(typeof showAiCreditsExhausted==='function')showAiCreditsExhausted();
    return;
  }
  showExamConfigFootbar(false);
  const gid=_examConfig.goalId;
  const oralOnly=skills.length===1&&skills[0]==='sprechen';
  if(oralOnly)confirmQuotaUse(()=>startOralPractice(goal,words));
  else generatePersonalExam(words,skills,gid);
}
function openDeckHub(goalId,options){
  const goal=S.goals.find(g=>g.id===goalId);
  if(!goal)return;
  const fromVocabHub=!!(options&&options.fromVocabHub);
  if(!fromVocabHub){
    clearVocabHubFlashcardMode();
    S.fcSelected.clear();
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
  if(nav)nav.style.display=inHub?'block':'none';
  if(head)head.style.display=inHub?'block':'none';
  if(ways)ways.style.display='none';
  if(wordsLbl)wordsLbl.style.display=inHub?'block':'none';
  if(foot)foot.style.display=inHub?'block':'none';
  if(legacy)legacy.style.display=inHub?'none':'block';
  const es=document.getElementById('fcExamSec');
  const ps=document.getElementById('fcPersonalSec');
  if(es)es.style.display=inHub?'none':(getDeckViewCards().length>0?'block':'none');
  if(ps)ps.style.display=inHub?'none':(getDeckViewCards().length>0?'block':'none');
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
        <h3>Quiz</h3>
        <p>Multiple-choice on your words. Text or audio. Updates your review schedule.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button type="button" class="btn-sm accent" onclick="deckHubStartQuiz(false)">Text quiz →</button>
          <button type="button" class="btn-sm" onclick="deckHubStartQuiz(true)">🔊 Audio quiz</button>
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
function deckHubStartQuiz(audio){
  const deck=getDeckViewCards();
  if(deck.length<4){lcToast('You need at least 4 words in this deck for a quiz.','warn');return;}
  ensureFcIds();
  S.fcSelected.clear();
  deck.forEach(f=>S.fcSelected.add(fcId(f)));
  startVE(audio);
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
