/** Goal workspace shell — tabs, header, navigation */
function setWsTab(tab){
  if(normalizeWsTab(tab)!=='vocabulary')clearVocabHubFlashcardMode();
  S.wsTab=normalizeWsTab(tab);
  const goal=getActiveGoal();
  if(goal&&typeof LcRouter!=='undefined'){
    const t=S.wsTab;
    const seg=t==='vocabulary'?'vocab':t==='progress'?'progress':'exams';
    LcRouter.navigate(LcRouter.goalPath(goal,seg),{label:seg==='progress'?'Progress':seg==='vocab'?'Vocabulary':'Exams',replace:true});
    return;
  }
  renderGoalWorkspace();
}
function backToWorkspace(tab){
  const id=S.activeGoalId;
  if(id)openGoalWorkspace(id,tab||S.wsTab||'exams');
  else goHome();
}
function formatGoalExamDate(goal){
  if(!goal?.examDate)return'No exam date set';
  const d=new Date(goal.examDate+'T00:00:00');
  if(isNaN(d.getTime()))return'No exam date set';
  return'Exam date: '+d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
}
function getSkillPerformance(goal){
  if(typeof AnalyticsStore!=='undefined'){
    const perf=AnalyticsStore.getModulePerformance(goal);
    if(perf.length){
      const isDE=goal.subject==='de';
      const labels={lesen:isDE?'Leseverstehen':'Reading',horen:isDE?'Hörverstehen':'Listening',schreiben:isDE?'Schreiben':'Writing',sprechen:isDE?'Sprechen':'Speaking',reading:'Reading',listening:'Listening',writing:'Writing',speaking:'Speaking'};
      const icons={lesen:'📖',horen:'🎧',schreiben:'✍',sprechen:'🎤',reading:'📖',listening:'🎧',writing:'✍',speaking:'🎤'};
      return perf.map(m=>({key:m.module,label:labels[m.module]||m.module,icon:icons[m.module]||'📊',pct:m.accuracy,mastery:m.mastery}));
    }
  }
  const hist=historyForGoal(goal);
  const sums={listening:[],reading:[],writing:[],speaking:[]};
  const isDE=goal.subject==='de';
  hist.forEach(h=>{
    const m=h.moduleScores||{};
    if(m.horen!=null)sums.listening.push(m.horen);
    if(m.lesen!=null)sums.reading.push(m.lesen);
    if(m.schreiben!=null)sums.writing.push(m.schreiben);
    if(m.sprechen!=null)sums.speaking.push(m.sprechen);
  });
  const avg=a=>a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):null;
  const labels={listening:isDE?'Listening':'Listening',reading:isDE?'Reading':'Reading',writing:isDE?'Writing':'Writing',speaking:isDE?'Speaking':'Speaking'};
  if(isDE){labels.listening='Hörverstehen';labels.reading='Leseverstehen';labels.writing='Schreiben';labels.speaking='Sprechen';}
  const icons={listening:'🎧',reading:'📖',writing:'✍',speaking:'🎤'};
  return['listening','reading','writing','speaking'].map(k=>({key:k,label:labels[k],icon:icons[k],pct:avg(sums[k])})).filter(x=>x.pct!=null);
}
function getKpiDelta(metric,goal){
  const weekAgo=Date.now()-7*86400000;
  if(metric==='words'){
    const n=deckForGoal(goal).filter(f=>(f.savedAt||0)>=weekAgo).length;
    return n>0?'+'+n+' this week':'';
  }
  if(metric==='practice'){
    const n=historyForGoal(goal).filter(h=>{
      if(h.mode!=='practice')return false;
      const d=new Date(h.date);
      return !isNaN(d.getTime())&&d.getTime()>=weekAgo;
    }).length;
    return n>0?'+'+n+' this week':'';
  }
  return'';
}
function normalizeWsTab(tab){
  if(tab==='overview')return'exams';
  if(tab==='exams'||tab==='vocabulary'||tab==='progress')return tab;
  return'exams';
}
function getScoreSeries(goal){
  return historyForGoal(goal).slice(0,12).reverse().map(h=>({date:h.date,score:h.score,topic:h.topic||''}));
}
function countNewWords(goal){
  return deckForGoal(goal).filter(f=>!f.nextReview&&(f.interval==null||f.interval<=1)).length;
}
function countMasteredWords(goal){
  return deckForGoal(goal).filter(f=>f.interval&&f.interval>7).length;
}
function countDifficultWords(goal){
  return deckForGoal(goal).filter(f=>(f.missCount||0)>=2).length;
}
function renderWsTabsHtml(active){
  const tabs=[{id:'exams',label:'Exams'},{id:'vocabulary',label:'Vocabulary'},{id:'progress',label:'Progress'}];
  return'<nav class="ws-tabs-nav" aria-label="Workspace">'+tabs.map(t=>'<button type="button" class="ws-tabs-nav-btn'+(active===t.id?' on':'')+'" onclick="setWsTab(\''+t.id+'\')">'+t.label+'</button>').join('')+'</nav>';
}
function renderWsRecentActivityHtml(goal){
  let items=[];
  const acts=typeof ActivityTrack!=='undefined'?ActivityTrack.activityForGoal(S.activityLog,goal).slice(0,3):[];
  if(acts.length){
    items=acts.map(a=>{
      const sc=a.score!=null?(a.score>=70?'pass':a.score>=50?'mid':'fail'):'';
      const scoreH=a.score!=null?'<span class="ws-recent-score '+sc+'">'+a.score+'%</span>':'<span class="ws-recent-score">'+esc(typeof ActivityTrack!=='undefined'?ActivityTrack.activityIcon(a.type):'📖')+'</span>';
      const when=a.ts?new Date(a.ts).toLocaleDateString():'';
      const dur=a.sec?formatStudyDuration(a.sec):'';
      return'<div class="ws-recent-item" style="cursor:default">'+scoreH+'<span class="ws-recent-info"><b>'+esc(a.label||'Study session')+'</b><span>'+esc(when)+(dur?' · '+esc(dur):'')+'</span></span></div>';
    });
  }else{
    const hist=historyForGoal(goal).slice(0,3);
    items=hist.map(h=>{
      const sc=h.score>=70?'pass':h.score>=50?'mid':'fail';
      const mode=normalizeMode(h.mode)==='practice'?'Practice':'Official';
      return'<button type="button" class="ws-recent-item" onclick="openMistakeReview('+h.id+')"><span class="ws-recent-score '+sc+'">'+h.score+'%</span><span class="ws-recent-info"><b>'+esc(h.topic)+'</b><span>'+esc(h.date)+' · '+mode+'</span></span><span class="ws-recent-cta">Review →</span></button>';
    });
  }
  if(!items.length)return'<p class="ws-recent-empty">No activity yet — start with a practice exam above.</p>';
  return'<div class="ws-recent-list">'+items.join('')+'</div>';
}
function renderWsSkillBarsHtml(goal){
  const skills=getSkillPerformance(goal);
  if(!skills.length)return'<p style="font-size:13px;font-weight:600;color:var(--text-muted);margin:0">Complete exams with module scores to see skill breakdown.</p>';
  return'<div class="ws-skill-list">'+skills.map(s=>{
    const col=s.pct>=70?'var(--green)':s.pct>=50?'var(--brand)':'var(--red)';
    return'<div class="ws-skill-row"><span class="ws-skill-lbl">'+s.icon+' '+esc(s.label)+'</span><div class="ws-skill-bar"><div class="ws-skill-fill" style="width:'+s.pct+'%;background:'+col+'"></div></div><span class="ws-skill-pct">'+s.pct+'%</span></div>';
  }).join('')+'</div>';
}
function renderWsVocabKpisHtml(goal){
  const saved=deckForGoal(goal).length;
  const newN=countNewWords(goal);
  const dueN=dueForGoal(goal).length;
  const mastN=countMasteredWords(goal);
  return'<div class="ws-vkpi-row"><div class="ws-vkpi"><b>'+saved+'</b><span>Saved</span></div><div class="ws-vkpi"><b>'+newN+'</b><span>New</span></div><div class="ws-vkpi"><b>'+dueN+'</b><span>To review</span></div><div class="ws-vkpi"><b>'+mastN+'</b><span>Mastered</span></div></div>';
}
function renderWsVocabCategoriesHtml(goal){
  const deck=deckForGoal(goal);
  if(!deck.length)return'';
  const counts={};
  deck.forEach(f=>{
    const t=vocabHubResolveType(f,goal.subject);
    const key=VH_POS_ORDER.includes(t)?t:'other';
    counts[key]=(counts[key]||0)+1;
  });
  const labels={noun:'Nouns',verb:'Verbs',adjective:'Adjectives',adverb:'Adverbs',other:'Other'};
  return'<p class="ws-seclbl">Study by category</p><div class="vv-filters" style="margin-bottom:16px">'+VH_POS_ORDER.filter(k=>counts[k]).map(k=>'<span class="vv-filter vv-filter--static">'+labels[k]+' · '+counts[k]+'</span>').join('')+'</div>';
}
function wsGoalSubline(goal){
  const parts=[];
  if(goal.examDate){
    parts.push(formatGoalExamDate(goal));
    const days=daysUntilExam(goal.examDate);
    const d=days!==null?Math.max(0,days):0;
    parts.push(d+' day'+(d===1?'':'s')+' left');
  }else{
    parts.push('No exam date set · <button type="button" class="goal-cta" style="margin:0;padding:0;border:none;background:none;cursor:pointer" onclick="editGoal(\''+esc(goal.id)+'\')">Set date →</button>');
  }
  const due=dueForGoal(goal).length;
  if(due>0)parts.push('<b>'+due+' due for review</b>');
  return parts.join(' · ');
}
function renderWsExamsHtml(goal){
  const gid=esc(goal.id);
  const level=goal.level;
  const due=dueForGoal(goal).length;
  const deck=deckForGoal(goal).length;
  const act=getRecommendedActionForGoal(goal);
  _coachAction=act.run;
  const resume=getResumableSession(goal.id);
  const resumeHtml=resume?`<div class="ws-resume"><div class="ws-resume-ic">⏸️</div><h3>You have a ${esc(resume.examData?.level||level)} exam in progress</h3><p>Saved in practice mode. Resume where you left off, or discard it and start fresh.</p><div class="ws-resume-actions"><button type="button" class="btn-sm accent" onclick="resumeExamSession()">Resume exam</button><button type="button" class="btn-sm" onclick="discardActiveSession()">Discard</button></div></div>`:'';
  const persDesc=due>0?'Built around '+due+' due word'+(due===1?'':'s')+'.':deck>0?deck+' words in your deck.':'Save words during practice to unlock.';
  const coachHtml=typeof MasteryView!=='undefined'
    ?MasteryView.renderRecommendedExamCardHtml(goal,{variant:'workspace',compact:true,showArt:false})
    :renderWsCoachBannerHtml(goal,act,true);
  return`${resumeHtml}
    ${coachHtml}
    <div class="ws-quota quota-bar">
      <span id="planBadgeHome"></span>
      <span class="quota-count" id="quotaCount">0/3 used</span>
      <span style="font-size:12px;font-weight:600;color:var(--text-secondary);flex:1" id="quotaHomeHint">Monthly exam quota for AI-generated exams.</span>
      <button type="button" class="btn-sm accent" id="upgradeBtnHome" onclick="showUpgrade()">Upgrade</button>
    </div>
    <p class="ws-seclbl">Start an exam</p>
    <div class="ws-exam-grid">
      <button type="button" class="ws-exam-card ws-exam-card--official" onclick="startOverviewExam('official')"><span class="ws-exam-card-ic">🏛</span><span class="ws-exam-card-title">Official</span><span class="ws-exam-card-desc">Timed · no translations</span></button>
      <button type="button" class="ws-exam-card ws-exam-card--practice" onclick="startOverviewExam('practice')"><span class="ws-exam-card-ic">📚</span><span class="ws-exam-card-title">Practice</span><span class="ws-exam-card-desc">Translations + save words</span></button>
      <button type="button" class="ws-exam-card ws-exam-card--personal" onclick="openExamConfigurator('${gid}')"><span class="ws-exam-card-ic">✦</span><span class="ws-exam-card-title">Personalized</span><span class="ws-exam-card-desc">${esc(persDesc)}</span></button>
    </div>
    <p class="ws-seclbl">Quick modules</p>
    <div class="quick-btns" style="margin-bottom:18px">
      <button class="quick-btn" onclick="startQuickForGoal('${gid}','reading')">Reading</button>
      <button class="quick-btn" onclick="startQuickForGoal('${gid}','listening')">Listening</button>
      <button class="quick-btn" onclick="startQuickForGoal('${gid}','writing')">Writing</button>
      <button class="quick-btn" onclick="startQuickForGoal('${gid}','gapfill')">Speaking prep</button>
    </div>
    <p class="ws-seclbl">Recent activity</p>
    ${renderWsRecentActivityHtml(goal)}
    <p class="ws-seclbl">Saved exams</p>
    <p style="font-size:12px;font-weight:600;color:var(--text-secondary);margin:0 0 12px">Retakes are free — they do not use your monthly quota.</p>
    <div class="saved-grid" id="wsSavedGrid"></div>`;
}
function scoreTrendBarColor(score){
  if(score>=70)return'var(--green)';
  if(score>=50)return'var(--brand)';
  if(score>=40)return'var(--amber,#f59e0b)';
  return'var(--amber,#f59e0b)';
}
function renderScoreTrendHtml(series){
  if(!series||series.length<2){
    return'<div class="chart-wrap chart-wrap--empty" style="display:block;margin-bottom:16px"><h3>Score trend</h3><p style="font-size:13px;font-weight:600;color:var(--text-muted);margin:0">Take a couple of exams to see your score trend.</p></div>';
  }
  const bars=series.map(h=>{
    const height=Math.max(12,Math.min(100,h.score));
    const label=(h.topic||'Exam').slice(0,18);
    const date=h.date||'';
    return'<div class="chart-bar-col" style="flex:1;display:flex;flex-direction:column;align-items:center;min-width:0"><div class="chart-bar-val" style="font-size:10px;font-weight:700;margin-bottom:4px;color:var(--text-secondary)">'+h.score+'%</div><div class="chart-bar" style="height:'+height+'%;min-height:12px;width:100%;max-width:36px;background:'+scoreTrendBarColor(h.score)+';border-radius:4px 4px 0 0" title="'+esc(h.score+'% — '+label)+'"></div><div class="chart-bar-meta" style="font-size:9px;color:var(--text-muted);margin-top:4px;text-align:center;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(date)+'</div></div>';
  }).join('');
  return'<div class="chart-wrap" style="display:block;margin-bottom:16px"><h3>Score trend <span style="font-size:11px;color:var(--text-muted);font-weight:400">Last '+series.length+' exams</span></h3><div class="chart-bars" style="display:flex;align-items:flex-end;gap:6px;height:120px;border-bottom:1px solid var(--border);padding-bottom:4px">'+bars+'</div></div>';
}
function renderGoalHistoryHtml(goal){
  const hist=historyForGoal(goal);
  const pct=getReadinessPctForGoal(goal);
  const weak=getWeakAreasForGoal(goal);
  const series=getScoreSeries(goal);
  const mastery=typeof getMasterySummaryForGoal==='function'?getMasterySummaryForGoal(goal):null;
  let weakHtml='';
  if(mastery?.weakGrammar?.length||mastery?.weakTopics?.length){
    const rows=[...(mastery.weakGrammar||[]),...(mastery.weakTopics||[])].slice(0,5);
    weakHtml='<ul class="ws-weak">'+rows.map(r=>'<li><strong>'+esc(r.tag)+'</strong> — '+r.accuracy+'% <span style="color:var(--text-muted)">('+esc(r.mastery)+')</span></li>').join('')+'</ul>';
  }else if(weak.length){
    weakHtml='<ul class="ws-weak">'+weak.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul>';
  }else{
    weakHtml='<p style="font-size:13px;font-weight:600;color:var(--text-muted);margin:0">Complete a practice exam to identify weak areas.</p>';
  }
  let chartHtml=renderScoreTrendHtml(series);
  const listHtml=hist.length?hist.map(h=>'<div class="hist-card" onclick="openMistakeReview('+h.id+')"><div class="hist-score '+(h.score>=70?'pass':h.score>=50?'mid':'fail')+'">'+h.score+'%</div><div class="hist-info"><div class="hist-title">'+(h.lang==='de'?'🇩🇪':'🇬🇧')+' '+esc(h.topic)+' — '+h.level+'</div><div class="hist-meta">'+h.date+' · '+(h.guidedDemo?'Demo':normalizeMode(h.mode)==='practice'?'Practice':'Official')+'</div></div><span style="font-size:11px;color:var(--brand);font-weight:700">Review →</span></div>').join('')
    :'<div class="hist-empty"><span>📊</span>No exams yet. Start in the Exams tab.</div>';
  const deck=deckForGoal(goal).length;
  const avg=hist.length?Math.round(hist.reduce((s,h)=>s+h.score,0)/hist.length):null;
  const wordsDelta=getKpiDelta('words',goal);
  const practiceDelta=getKpiDelta('practice',goal);
  const ring=readinessRingSvg(pct,hist.length>0,hist.length);
  return`
    <div class="ws-prog-top">
      <div class="ws-panel ws-prog-readiness">
        <p class="ws-seclbl" style="margin:0 0 10px;width:100%">Exam readiness</p>
        <div class="ws-prog-readiness-ring">${ring}<span class="ws-prog-readiness-pct">${readinessRingCaption(pct,hist.length>0,hist.length)}</span></div>
        <div style="flex:1;min-width:180px">
          <p style="font-size:13px;font-weight:700;color:var(--text);margin:0 0 4px">${readinessEstLabelHtml(pct,hist.length>0,hist.length)}</p>
          <p style="font-size:12px;font-weight:600;color:var(--text-secondary);margin:0;line-height:1.55">${hist.length?'Based on recent exams and mastered vocabulary.':'Complete a practice exam to see readiness.'}</p>
        </div>
      </div>
      <div class="ws-panel">
        <p class="ws-seclbl" style="margin:0 0 12px">Skills performance</p>
        ${renderWsSkillBarsHtml(goal)}
      </div>
    </div>
    <div class="stat-tiles" style="margin-bottom:16px">
      <div class="stat-tile"><div class="stat-tile__val">${hist.length}</div><div class="stat-tile__lbl">Exams${practiceDelta?' · '+practiceDelta:''}</div></div>
      <div class="stat-tile"><div class="stat-tile__val">${deck}</div><div class="stat-tile__lbl">Words${wordsDelta?' · '+wordsDelta:''}</div></div>
      <div class="stat-tile"><div class="stat-tile__val">${avg!==null?avg+'%':'—'}</div><div class="stat-tile__lbl">Avg score</div></div>
      <div class="stat-tile"><div class="stat-tile__val">${esc(formatStudyDuration(studySecForGoal(goal)))}</div><div class="stat-tile__lbl">Study time</div></div>
    </div>
    ${chartHtml}
    ${typeof MasteryView!=='undefined'?MasteryView.renderMasteryPanelHtml(goal):('<p class="ws-seclbl">Weak areas</p><div class="ws-panel" style="margin-bottom:16px">'+weakHtml+'</div>')}
    <p class="ws-seclbl">Exam history</p>
    <div class="hist-list">${listHtml}</div>`;
}
function renderWsSavedExams(goal){
  const grid=document.getElementById('wsSavedGrid');
  if(!grid)return;
  const list=S.savedExams.filter(e=>e.lang===goal.subject&&e.level===goal.level);
  if(!list.length){grid.innerHTML='<div class="hist-empty" style="grid-column:1/-1"><span>📁</span>No saved exams for this goal yet.</div>';return;}
  const auto=list.filter(e=>e.status==='auto');
  const pinned=list.filter(e=>e.status!=='auto');
  const cardHtml=(e)=>{
    const i=S.savedExams.indexOf(e);
    const src=e.source||(e.data?.demo?'demo':e.data?.poolSource?'pool':'ai');
    const srcLbl=src==='demo'?'Demo':(src==='pool'||src==='library')?'From library':'AI Generated';
    const st=e.status||'in_progress';
    const stLbl=st==='completed'?'Completed':st==='aborted'?'Aborted':st==='auto'?'Auto':'In progress';
    const modeLbl=normalizeMode(e.mode)==='practice'?'Practice':'Official';
    const scoreH=e.score!=null?`<div class="saved-card-score ${e.score>=70?'pass':e.score>=50?'mid':'fail'}">${e.score}%</div>`:'';
    const pinBtn=st==='auto'?`<button class="btn-sm accent" onclick="pinSavedExam(${i})">Save</button>`:'';
    return `<div class="saved-card${st==='auto'?' saved-card--auto':''}"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div class="saved-card-title">${examFlag(e.lang)} ${esc(e.topic)}</div><span class="saved-src-badge">${srcLbl}</span></div><div class="saved-card-meta">${e.level} · ${modeLbl} · ${st==='auto'?'Generated':'Saved'} ${e.savedAt}</div><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap"><span class="saved-status ${st}">${stLbl}</span>${scoreH}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${pinBtn}<button class="btn-sm" onclick="reviewSavedExam(${i})">Review</button><button class="btn-sm blue" onclick="retakeExam(${i})">↺ Retake</button><button class="btn-sm red" onclick="deleteSaved(${i})">✕</button></div></div>`;
  };
  let html='';
  if(auto.length){
    html+=`<p class="ws-seclbl" style="grid-column:1/-1;margin:0 0 8px">Recientes (auto)</p>`;
    html+=auto.map(cardHtml).join('');
  }
  if(pinned.length){
    if(auto.length)html+=`<p class="ws-seclbl" style="grid-column:1/-1;margin:16px 0 8px">Saved exams</p>`;
    html+=pinned.map(cardHtml).join('');
  }
  grid.innerHTML=html;
}
function renderWsCoachBannerHtml(goal,act,compact){
  const weak=getWeakAreasForGoal(goal);
  const histLen=historyForGoal(goal).length;
  const pct=getReadinessPctForGoal(goal);
  let leadHtml='';
  if(weak.length){
    leadHtml='<p class="ws-coach-lead">Your weak spot right now: '+esc(weak[0])+'</p>';
    if(weak.length>1)leadHtml+='<p class="ws-coach-more">+'+(weak.length-1)+' more</p>';
  }else{
    leadHtml='<p class="ws-coach-lead">Take a practice exam to start your study plan</p>';
  }
  const compactCls=compact?' ws-coach-banner--compact':'';
  return`
    <div class="coach-card coach-card--action ws-coach-banner${compactCls}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <div class="coach-label">Study coach</div>
          ${leadHtml}
          <p class="ws-coach-desc">${esc(act.desc)}</p>
        </div>
      </div>
      <div class="readiness-row" style="margin-top:12px">
        <div class="readiness-bar"><div class="readiness-fill" style="width:${histLen?pct:0}%"></div></div>
        <span class="readiness-estlbl">${readinessEstLabelHtml(pct,histLen>0)}</span>
      </div>
      <button type="button" class="btn-sm accent" style="margin-top:14px" onclick="runRecommendedAction()">${esc(act.cta)}</button>
    </div>`;
}
async function launchGoalExam(mode,options){
  const opts=options||{};
  let goal=opts.goalId?S.goals.find(g=>g.id===opts.goalId):getActiveGoal();
  if(!goal){showAddGoalWizard();return;}
  if(typeof requireProForCombo==='function'&&!requireProForCombo(goal.subject,goal.level))return;
  if(!canGenerate()){showUpgrade();return;}
  const m=normalizeMode(mode);
  const run=async()=>{
    if(m==='official')abortOfficialInProgress();
    S.mode=m;
    S.subject=goal.subject;
    S.level=goal.level;
    S.activeGoalId=goal.id;
    syncGoalToProfile(goal);
    saveGoals();
    setExamMode(m);
    initExamSession(m);
    try{await generateExam();}catch(e){lcToast(e.message||'Exam generation failed','error');}
  };
  confirmQuotaUse(run);
}
async function startOverviewExam(mode){
  return launchGoalExam(mode);
}
function renderGoalWorkspace(){
  const goal=getActiveGoal();
  const el=document.getElementById('goalWorkspaceContent');
  if(!goal||!el)return;
  const tab=normalizeWsTab(S.wsTab||'exams');
  S.wsTab=tab;
  const gid=esc(goal.id);
  _coachAction=getRecommendedActionForGoal(goal).run;
  if(tab==='vocabulary')ensureVocabHubState(goal);
  let bodyHtml='';
  if(tab==='exams'){
    bodyHtml='<div id="wsPanelExams" class="ws-tabpanel on">'+renderWsExamsHtml(goal)+'</div>';
  }else if(tab==='vocabulary'){
    bodyHtml='<div id="wsPanelVocabulary" class="ws-tabpanel on">'+renderWsVocabularyHtml(goal)+'</div>';
  }else if(tab==='progress'){
    bodyHtml='<div id="wsPanelProgress" class="ws-tabpanel on">'+renderGoalHistoryHtml(goal)+'</div>';
  }
  el.innerHTML=`
    <div class="ws-gh"><h1 class="ws-h1">${esc(goalLabel(goal))}</h1><span class="goal-pill">${goalPill(goal.subject)}</span>
      ${typeof grammarNavLinkHtml==='function'?grammarNavLinkHtml(goal):''}
      <button type="button" class="profile-bar__change" style="margin-left:auto" onclick="editGoal('${gid}')">Edit goal</button>
    </div>
    <p class="ws-ghsub">${wsGoalSubline(goal)}</p>
    ${renderWsTabsHtml(tab)}
    ${bodyHtml}`;
  if(tab==='exams'){renderWsSavedExams(goal);updQuotaUI();}
  if(tab==='vocabulary'&&_vocabHub.activity==='flashcards')renderFcSingleView();
  const pb=document.getElementById('profileBar');
  if(pb)pb.classList.toggle('profile-bar--workspace',true);
  const pbl=document.getElementById('profileBarLabel');
  if(pbl)pbl.textContent='Preparing for';
  if(typeof syncWorkspaceBackBtn==='function')syncWorkspaceBackBtn();
}
function openGoalWorkspace(id,tab,skipUrl){
  if(!requireAppAuth())return;
  const goal=S.goals.find(g=>g.id===id);
  if(!goal)return;
  S.activeGoalId=id;
  if(tab)S.wsTab=normalizeWsTab(tab);
  syncGoalToProfile(goal);
  saveGoals();
  hideAll();
  show('goalWorkspaceScreen');
  setNavActive('dashboard');
  if(!skipUrl)updateWorkspaceUrl(goal,{replace:false});
  renderGoalWorkspace();
  renderProfileBar();
  window.scrollTo({top:0,behavior:'smooth'});
}
function startQuickForGoal(goalId,mod){
  const goal=S.goals.find(g=>g.id===goalId);
  if(!goal)return;
  S.activeGoalId=goal.id;
  syncGoalToProfile(goal);
  S.subject=goal.subject;
  S.level=goal.level;
  if(S.mode==='practice')S.vocabLang=vocabLangFor(goal.subject);
  startQuick(mod);
}