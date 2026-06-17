// ═══════════════════════════════════════════
// SAVE / LOAD EXAMS
// ═══════════════════════════════════════════
function saveCurrentExam(statusOverride){
  if(!S.examData){lcToast('No exam loaded yet.','warn');return;}
  const id=S.examData._savedId||S.examData._flightId||Date.now();
  S.examData._savedId=id;
  const existing=S.savedExams.findIndex(e=>e.id===id);
  const source=S.examSource||(S.isDemo||S.examData?.demo?'demo':S.examData?.poolSource?'pool':S.examSource==='library'?'library':'ai');
  const status=statusOverride||(existing>=0&&S.savedExams[existing].status==='completed'?'completed':'in_progress');
  const entry={
    id,savedAt:new Date().toLocaleDateString(),topic:S.examData.topic||'Unknown topic',
    level:S.examData.level,lang:S.examData.lang,mode:normalizeMode(S.mode),status,source,
    goalId:S.activeGoalId||S.examData.goalId||null,
    data:S.examData,answers:{...S.answers},gapAnswers:{...S.gapAnswers},
    fieldValues:captureExamFieldValues(),
    markedWords:(S.activeSession?.markedWords||[]).map(m=>m.word)
  };
  if(existing>=0)S.savedExams[existing]={...S.savedExams[existing],...entry};
  else S.savedExams.unshift(entry);
  if(S.savedExams.length>50)S.savedExams=S.savedExams.slice(0,50);
  saveSaved();
  if(typeof syncExamRouteUrl==='function')syncExamRouteUrl();
  document.querySelectorAll('[onclick="saveCurrentExam()"]').forEach(btn=>{
    const orig=btn.textContent;
    btn.textContent='\u2713 Saved!';
    btn.style.color='var(--green)';
    setTimeout(()=>{btn.textContent=orig;btn.style.color='';},2000);
  });
}
function reviewSavedExam(i){
  const e=S.savedExams[i];
  if(!e||!e.data){lcToast('Exam data missing.','warn');return;}
  S.subject=e.lang;S.level=e.level;S.mode=normalizeMode(e.mode||'official');
  if(e.status==='completed'&&e.score!=null&&e.correction){
    const isDE=e.lang==='de';
    const marked=(e.markedWords||[]).map(w=>typeof w==='string'?{word:w}:{word:w.word||w});
    renderResults(e.score,e.moduleScores||{},e.data,isDE,e.writeAns||'',e.speakAns||'',e.id,e.correction,e.speakingEvals||[],e.savedWords||[],marked);
    return;
  }
  hideAll();
  show('resultsScreen');
  const scr=document.getElementById('resultsScreen');
  const stLbl=e.status==='aborted'?'Exam aborted':e.status==='completed'?'Completed exam':'In progress';
  const isDE=e.lang==='de';
  const ansN=Object.keys(e.answers||{}).length+Object.keys(e.gapAnswers||{}).filter(k=>e.gapAnswers[k]?.trim()).length;
  const markedN=(e.markedWords||[]).length;
  scr.innerHTML=`${renderNavBackBtn('Exams')}
    <div class="results-hero"><div class="res-score mid">—</div><div class="res-label">${stLbl} — ${esc(e.level)} ${examFlag(e.lang)} ${esc(e.topic)}</div></div>
    <div class="results-detail"><p style="font-size:13px;font-weight:600;color:var(--text-secondary)">${e.status==='aborted'?'This official exam was ended when you started a new one. It was not submitted.':e.status==='in_progress'?'This practice exam was saved before completion. Resume to continue or retake from scratch.':'Saved exam snapshot.'} ${ansN} answer${ansN===1?'':'s'} recorded${markedN?`, ${markedN} word${markedN===1?'':'s'} marked`:''}.</p></div>
    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:22px">
      ${e.status==='in_progress'?`<button class="btn-sm accent" onclick="retakeExam(${i},true)">Resume</button>`:''}
      <button class="btn-sm blue" onclick="retakeExam(${i})">↺ Retake from start</button>
      <button class="btn-sm" onclick="backToWorkspace('exams')">Back to workspace</button>
    </div>`;
  window.scrollTo({top:0,behavior:'smooth'});
}
function retakeExam(i,resume){
  const e=S.savedExams[i];
  if(!e)return;
  S.examData=e.data;
  S.examData._fromSaved=true;
  S.quickMod=null;
  S.subject=e.lang;S.level=e.level;
  S.mode=normalizeMode(e.mode||'official');
  if(S.mode==='practice')S.vocabLang=vocabLangFor(S.subject);
  if(e.goalId){S.activeGoalId=e.goalId;const g=S.goals.find(x=>x.id===e.goalId);if(g)syncGoalToProfile(g);}
  if(resume&&e.status==='in_progress'){
    S.answers={...(e.answers||{})};
    S.gapAnswers={...(e.gapAnswers||{})};
    S._resumeFieldValues=e.fieldValues;
    initExamSession(S.mode);
    if(S.activeSession){
      S.activeSession.examData=e.data;
      S.activeSession.answers=S.answers;
      S.activeSession.gapAnswers=S.gapAnswers;
      S.activeSession.fieldValues=e.fieldValues;
    }
  }else{
    S.answers={};
    S.gapAnswers={};
    if(isOfficialMode())abortOfficialInProgress();
    initExamSession(S.mode);
  }
  renderExam();
}
function deleteSaved(i){
  if(!confirm('Remove this saved exam?'))return;
  const removed=S.savedExams[i];
  if(removed?.id){
    if(!Array.isArray(S.deletedSavedExams))S.deletedSavedExams=[];
    S.deletedSavedExams.push({id:removed.id,deletedAt:Date.now()});
    try{localStorage.setItem('lc_saved_del',JSON.stringify(S.deletedSavedExams));}catch(_){}
  }
  S.savedExams.splice(i,1);
  saveSaved();
  const goal=getActiveGoal();
  if(goal&&document.getElementById('wsSavedGrid'))renderWsSavedExams(goal);
}

// History UI now lives in the workspace Progress tab (renderGoalHistoryHtml in workspaceUi.js).
