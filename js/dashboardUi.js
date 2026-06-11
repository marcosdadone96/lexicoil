/** Dashboard UI — coach, KPIs, home screen, goal cards */
function openDashboardCustomize(){
  _showDashCustomize=true;
  renderHomeScreen();
}
function closeDashboardCustomize(){
  _showDashCustomize=false;
  const host=document.getElementById('dashCustomizeHost');
  if(host)host.innerHTML='';
  renderHomeScreen();
}
function toggleDashWidget(id,on){
  const L=dashLayout();
  if(L.widgets[id]===undefined)return;
  L.widgets[id]=!!on;
  saveDashboardLayout(L);
  renderDashboardCustomizeModal();
  renderHomeScreen();
}
function moveDashListItem(listKey,id,dir){
  const L=dashLayout();
  const list=Array.isArray(L[listKey])?[...L[listKey]]:[];
  const i=list.indexOf(id);
  if(i<0)return;
  const j=i+dir;
  if(j<0||j>=list.length)return;
  list.splice(i,1);
  list.splice(j,0,id);
  L[listKey]=list;
  saveDashboardLayout(L);
  renderDashboardCustomizeModal();
  renderHomeScreen();
}
function renderDashboardCustomizeModal(){
  const host=document.getElementById('dashCustomizeHost');
  if(!host||!_showDashCustomize)return;
  const L=dashLayout();
  const sectionItems=L.sectionOrder.map((id,i)=>{
    const lbl=id==='bottom'?'Bottom row (weak areas, activity, actions)':(DASH_WIDGET_DEFS.find(w=>w.id===id)?.label||id);
    const on=L.widgets[id]!==false;
    const chk=id==='bottom'?'':('<input type="checkbox"'+(on?' checked':'')+' onchange="toggleDashWidget(\''+id+'\',this.checked)">');
    return'<div class="dash-custom-item"><label>'+chk+'<span>'+esc(lbl)+'</span></label><div class="dash-custom-move"><button type="button" '+(i===0?'disabled':'')+' onclick="moveDashListItem(\'sectionOrder\',\''+id+'\',-1)" aria-label="Move up">▲</button><button type="button" '+(i===L.sectionOrder.length-1?'disabled':'')+' onclick="moveDashListItem(\'sectionOrder\',\''+id+'\',1)" aria-label="Move down">▼</button></div></div>';
  }).join('');
  const bottomItems=L.bottomOrder.map((id,i)=>{
    const lbl=DASH_WIDGET_DEFS.find(w=>w.id===id)?.label||id;
    return'<div class="dash-custom-item"><label><input type="checkbox"'+(L.widgets[id]?' checked':'')+' onchange="toggleDashWidget(\''+id+'\',this.checked)"><span>'+esc(lbl)+'</span></label><div class="dash-custom-move"><button type="button" '+(i===0?'disabled':'')+' onclick="moveDashListItem(\'bottomOrder\',\''+id+'\',-1)">▲</button><button type="button" '+(i===L.bottomOrder.length-1?'disabled':'')+' onclick="moveDashListItem(\'bottomOrder\',\''+id+'\',1)">▼</button></div></div>';
  }).join('');
  const kpiItems=L.kpiOrder.map((id,i)=>{
    const lbl=DASH_KPI_DEFS.find(k=>k.id===id)?.label||id;
    return'<div class="dash-custom-item"><span style="flex:1;font-size:13px;font-weight:600;color:var(--text)">'+esc(lbl)+'</span><div class="dash-custom-move"><button type="button" '+(i===0?'disabled':'')+' onclick="moveDashListItem(\'kpiOrder\',\''+id+'\',-1)">▲</button><button type="button" '+(i===L.kpiOrder.length-1?'disabled':'')+' onclick="moveDashListItem(\'kpiOrder\',\''+id+'\',1)">▼</button></div></div>';
  }).join('');
  host.innerHTML='<div class="dash-custom-backdrop" onclick="if(event.target===this)closeDashboardCustomize()"><div class="dash-custom-panel" role="dialog" aria-labelledby="dashCustomTitle"><h2 id="dashCustomTitle">Customize dashboard</h2><p class="dash-custom-lede">Show or hide sections and set their order. Drag goal cards on the dashboard to reorder them.</p><p class="dash-custom-seclbl">Sections</p><div class="dash-custom-list">'+sectionItems+'</div><p class="dash-custom-seclbl">Bottom row panels</p><div class="dash-custom-list">'+bottomItems+'</div><p class="dash-custom-seclbl">Metric order</p><div class="dash-custom-list">'+kpiItems+'</div><p class="dash-custom-note">Tip: use the ⋮⋮ handle on each goal card to drag and reorder your exam goals.</p><div class="dash-custom-actions"><button type="button" class="btn-start" onclick="closeDashboardCustomize()">Done</button><button type="button" class="btn-dash-ghost" onclick="resetDashboardLayout()">Reset defaults</button></div></div></div>';
}
function resetDashboardLayout(){
  saveDashboardLayout(defaultDashboardLayout());
  renderDashboardCustomizeModal();
  renderHomeScreen();
  lcToast('Dashboard layout reset','success');
}
function onGoalDragStart(e,id){
  _goalDragId=id;
  e.dataTransfer.setData('text/plain',id);
  e.dataTransfer.effectAllowed='move';
  const card=e.target.closest('.goal-card');
  if(card)card.classList.add('dragging');
}
function onGoalDragEnd(e){
  document.querySelectorAll('.goal-card').forEach(c=>c.classList.remove('drag-over','dragging'));
  _goalDragId=null;
}
function onGoalDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  const card=e.currentTarget;
  if(card&&!card.classList.contains('dashed'))card.classList.add('drag-over');
}
function onGoalDragLeave(e){
  e.currentTarget.classList.remove('drag-over');
}
function onGoalDrop(e,toId){
  e.preventDefault();
  e.stopPropagation();
  const from=_goalDragId||e.dataTransfer.getData('text/plain');
  e.currentTarget.classList.remove('drag-over');
  if(!from||from===toId)return;
  const order=orderedGoalIds();
  const fi=order.indexOf(from),ti=order.indexOf(toId);
  if(fi<0||ti<0)return;
  order.splice(fi,1);
  order.splice(ti,0,from);
  const L=dashLayout();
  L.goalOrder=order;
  saveDashboardLayout(L);
  renderHomeScreen();
}
function selectDashboardGoal(id){
  const goal=S.goals.find(g=>g.id===id);
  if(!goal)return;
  S.activeGoalId=id;
  syncGoalToProfile(goal);
  saveGoals();
  renderHomeScreen();
}
function renderDashboardCoachHtml(goal){
  const act=getRecommendedActionForGoal(goal);
  _coachAction=act.run;
  const t=document.getElementById('coachActionTitle');if(t)t.textContent=act.title;
  const d=document.getElementById('coachActionDesc');if(d)d.textContent=act.desc;
  const c=document.getElementById('coachActionCta');if(c)c.textContent=act.cta;
  return'<div class="dash-coach">'+
    '<div class="dash-coach-ico" aria-hidden="true">🚀</div>'+
    '<div class="dash-coach-body">'+
      '<div class="dash-eyebrow">Recommended next step for '+esc(goalLabel(goal))+'</div>'+
      '<h2>'+esc(act.title)+'</h2>'+
      '<p>'+esc(act.desc)+'</p>'+
      '<div class="dash-coach-actions">'+
        '<button type="button" class="btn-sm accent dash-coach-cta" onclick="runRecommendedAction()">'+esc(act.cta)+'</button>'+
        '<button type="button" class="btn-sm dash-coach-ws" onclick="openGoal(\''+esc(goal.id)+'\')">Open workspace →</button>'+
      '</div>'+
    '</div>'+
    '<div class="dash-coach-art" aria-hidden="true"><svg width="120" height="90" viewBox="0 0 120 90" fill="none"><circle cx="78" cy="45" r="34" stroke="var(--accent)" stroke-width="2" opacity=".25"/><circle cx="78" cy="45" r="22" stroke="var(--accent)" stroke-width="2" opacity=".45"/><circle cx="78" cy="45" r="10" fill="var(--accent)"/><path d="M14 70 L74 47" stroke="var(--accent2,var(--accent))" stroke-width="3" stroke-linecap="round"/><path d="M70 41 l10 6 -4 -11z" fill="var(--accent2,var(--accent))"/></svg></div>'+
  '</div>';
}
function renderDashboardKpiTile(id,goal){
  const words=deckForGoal(goal).length;
  const practice=historyForGoal(goal).filter(h=>h.mode==='practice').length;
  const wordDelta=getKpiDelta('words',goal);
  const practiceDelta=getKpiDelta('practice',goal);
  const streak=getStudyStreak();
  const monthTime=formatStudyDuration(getStudyMonthTime());
  const streakNote=streak===1?'day in a row':streak>1?'days in a row':'Start today';
  if(id==='words')return'<div class="dash-kpi"><div class="dash-kpi-top"><span class="dash-kpi-label">Words saved</span><span>📖</span></div><div class="dash-kpi-val">'+words+'</div>'+(wordDelta?'<div class="dash-kpi-delta">'+esc(wordDelta)+'</div>':'')+'</div>';
  if(id==='practice')return'<div class="dash-kpi"><div class="dash-kpi-top"><span class="dash-kpi-label">Practice exams</span><span>📝</span></div><div class="dash-kpi-val">'+practice+'</div>'+(practiceDelta?'<div class="dash-kpi-delta">'+esc(practiceDelta)+'</div>':'')+'</div>';
  if(id==='streak')return'<div class="dash-kpi"><div class="dash-kpi-top"><span class="dash-kpi-label">Study streak</span><span>🔥</span></div><div class="dash-kpi-val">'+streak+'</div><div class="dash-kpi-note">'+esc(streakNote)+'</div></div>';
  if(id==='time')return'<div class="dash-kpi"><div class="dash-kpi-top"><span class="dash-kpi-label">Time studied</span><span>⏱</span></div><div class="dash-kpi-val">'+esc(monthTime)+'</div><div class="dash-kpi-note">This month</div></div>';
  return'';
}
function renderDashboardKpisHtml(goal){
  const L=dashLayout();
  const tiles=L.kpiOrder.map(id=>renderDashboardKpiTile(id,goal)).join('');
  return'<div class="dash-kpi-row">'+tiles+'</div>';
}
function renderDashboardWeakAreasHtml(goal){
  const skills=getSkillPerformance(goal);
  let body='';
  if(skills.length){
    body=skills.map(s=>'<div class="dash-skill"><div class="dash-skill-top"><span>'+s.icon+' '+esc(s.label)+'</span><span>'+s.pct+'%</span></div><div class="dash-bar"><i style="width:'+s.pct+'%;background:'+readinessRingColor(s.pct)+'"></i></div></div>').join('');
  }else{
    const areas=getWeakAreasForGoal(goal);
    if(areas.length){
      body=areas.map(a=>'<div class="dash-skill"><div class="dash-skill-top"><span>'+esc(a)+'</span></div><div class="dash-bar"><i style="width:45%;background:var(--orange)"></i></div></div>').join('');
    }else{
      body='<p style="font-size:12px;font-weight:600;color:var(--text3);margin:0">Complete a practice exam to identify weak areas.</p>';
    }
  }
  return'<div class="dash-panel"><h3>Weak areas ('+esc(goalLabel(goal))+')</h3>'+body+
    '<button type="button" class="dash-panel-link" onclick="openGoalWorkspace(\''+esc(goal.id)+'\',\'progress\')">View all skills →</button></div>';
}
function renderDashboardActivityHtml(goal){
  let acts=typeof ActivityTrack!=='undefined'?ActivityTrack.activityForGoal(S.activityLog,goal).slice(0,3):[];
  if(!acts.length){
    acts=historyForGoal(goal).slice(0,3).map(h=>({type:'exam',label:(h.mode==='practice'?'Practice exam':'Official exam')+' · '+(h.topic||''),score:h.score,ts:Date.parse(h.date)||h.id}));
  }
  const body=acts.length?acts.map(a=>{
    const ic=typeof ActivityTrack!=='undefined'?ActivityTrack.activityIcon(a.type):'📝';
    const sub=a.score!=null?'Score: '+a.score+'%':a.sec?formatStudyDuration(a.sec):'';
    const when=a.ts?formatScoreAge(new Date(a.ts).toLocaleDateString()):'';
    return'<div class="dash-act"><div class="dash-act-ico">'+ic+'</div><div class="dash-act-body"><div class="dash-act-title">'+esc(a.label||'Study session')+'</div>'+(sub?'<div class="dash-act-sub">'+esc(sub)+'</div>':'')+'</div><div class="dash-act-time">'+esc(when)+'</div></div>';
  }).join(''):'<p style="font-size:12px;font-weight:600;color:var(--text3);margin:0">No activity yet — your first practice will show up here.</p>';
  return'<div class="dash-panel"><h3>Recent activity ('+esc(goalLabel(goal))+')</h3>'+body+
    '<button type="button" class="dash-panel-link" onclick="openGoalWorkspace(\''+esc(goal.id)+'\',\'progress\')">View all activity →</button></div>';
}
function runDashboardReview(goalId){
  const goal=S.goals.find(g=>g.id===goalId);
  if(!goal)return;
  prepGoalContext(goal);
  const latest=historyForGoal(goal).find(h=>h.correction);
  if(latest)openMistakeReview(latest.id);
  else openGoalWorkspace(goal.id,'progress');
}
function dashQuickPersonalized(goalId){
  prepGoalContext(S.goals.find(g=>g.id===goalId));
  openGoalWorkspace(goalId,'exams');
  openExamConfigurator(goalId);
}
function dashQuickFlashcards(goalId){
  prepGoalContext(S.goals.find(g=>g.id===goalId));
  openDeckHub(goalId);
}
function dashQuickQuiz(goalId){
  const goal=S.goals.find(g=>g.id===goalId);
  if(!goal)return;
  prepGoalContext(goal);
  const mod=goal.subject==='de'?'lesen':'reading';
  startQuickForGoal(goalId,mod);
}
function renderDashboardQuickActionsHtml(goal){
  const gid=esc(goal.id);
  return'<div class="dash-panel"><h3>Quick actions</h3>'+
    '<div class="dash-qa" onclick="runDashboardReview(\''+gid+'\')"><div class="dash-qa-ico" style="background:var(--accent-dim);color:var(--accent)">📋</div><div class="dash-qa-body"><div class="dash-qa-title">Review & mistakes</div><div class="dash-qa-sub">See words from your mistakes</div></div><span class="dash-qa-go">→</span></div>'+
    '<div class="dash-qa" onclick="dashQuickPersonalized(\''+gid+'\')"><div class="dash-qa-ico" style="background:rgba(6,182,212,.12);color:var(--teal)">⚡</div><div class="dash-qa-body"><div class="dash-qa-title">Practice with words</div><div class="dash-qa-sub">Create exam using your words</div></div><span class="dash-qa-go">→</span></div>'+
    '<div class="dash-qa" onclick="dashQuickFlashcards(\''+gid+'\')"><div class="dash-qa-ico" style="background:rgba(245,158,11,.12);color:var(--amber)">🗂</div><div class="dash-qa-body"><div class="dash-qa-title">Flashcards</div><div class="dash-qa-sub">Study with spaced repetition</div></div><span class="dash-qa-go">→</span></div>'+
    '<div class="dash-qa" onclick="dashQuickQuiz(\''+gid+'\')"><div class="dash-qa-ico" style="background:rgba(16,185,129,.1);color:var(--green)">✓</div><div class="dash-qa-body"><div class="dash-qa-title">Quick quiz</div><div class="dash-qa-sub">Test yourself quickly</div></div><span class="dash-qa-go">→</span></div>'+
  '</div>';
}
function renderDashboardFootHtml(){
  return'<div class="dash-foot"><div class="dash-foot-l"><div class="dash-foot-ico">🎯</div><p><b>Keep going!</b> Consistency is the key. A little every day brings you closer to your goal.</p></div></div>';
}
function renderDashboardBottomHtml(goal){
  const L=dashLayout();
  const panels={weak:renderDashboardWeakAreasHtml(goal),activity:renderDashboardActivityHtml(goal),quick:renderDashboardQuickActionsHtml(goal)};
  const html=L.bottomOrder.filter(id=>L.widgets[id]&&panels[id]).map(id=>'<div class="dash-panel-wrap">'+panels[id]+'</div>').join('');
  if(!html)return'';
  return'<div class="dash-bottom-row">'+html+'</div>';
}
function renderDashboardBodyHtml(goal){
  const L=dashLayout();
  const sections={coach:()=>renderDashboardCoachHtml(goal),kpis:()=>renderDashboardKpisHtml(goal),bottom:()=>renderDashboardBottomHtml(goal),foot:()=>renderDashboardFootHtml()};
  return L.sectionOrder.map(sec=>{
    if(sec==='bottom')return L.widgets.weak||L.widgets.activity||L.widgets.quick?sections.bottom():'';
    if(!L.widgets[sec])return'';
    return sections[sec]?sections[sec]():'';
  }).join('');
}
function showAddGoalWizard(){
  _showGoalWizard=true;
  _editingGoalId=null;
  _goalWizard.subject='de';
  _goalWizard.level='B2';
  _goalWizard.examDate='';
  renderHomeScreen();
}
function cancelGoalWizard(){
  _showGoalWizard=false;
  _editingGoalId=null;
  renderHomeScreen();
}
function selectWizSubject(subject){
  _goalWizard.subject=subject;
  renderHomeScreen();
}
function selectWizLevel(level){
  _goalWizard.level=level;
  renderHomeScreen();
}
function submitGoalWizard(){
  const date=_goalWizard.examDate?String(_goalWizard.examDate).trim():null;
  if(_editingGoalId){
    updateGoal(_editingGoalId,{subject:_goalWizard.subject,level:_goalWizard.level,examDate:date||null});
    return;
  }
  createGoal({subject:_goalWizard.subject,level:_goalWizard.level,examDate:date||null});
}
function renderGoalWizardHtml(isFirst){
  const w=_goalWizard;
  const cancelBtn=isFirst?'':`<button type="button" class="goal-wiz-cancel" onclick="cancelGoalWizard()">Cancel</button>`;
  const intro=isFirst?`<div class="goal-empty"><h1 class="goal-h1">Let's set up your first exam goal</h1><p class="goal-lede">Tell us which certification you're preparing for. You can add more later.</p></div>`:(_editingGoalId?`<div class="goal-empty"><h1 class="goal-h1">Edit exam goal</h1><p class="goal-lede">Update certification, level, or exam date.</p></div>`:'');
  return`${intro}
  <div class="goal-wiz goal-card" style="cursor:default">
    <p class="goal-step">Step 1 · Which exam?</p>
    <div class="goal-tiles">
      <div class="goal-tile${w.subject==='de'?' sel':''}" onclick="selectWizSubject('de')"><span class="goal-pill">German</span><h3>Goethe-Institut</h3><span>A1–C2 · official format</span></div>
      <div class="goal-tile${w.subject==='en'?' sel':''}" onclick="selectWizSubject('en')"><span class="goal-pill">English</span><h3>Cambridge English</h3><span>A1–C2 · official format</span></div>
      <div class="goal-tile${w.subject==='es'?' sel':''}" onclick="selectWizSubject('es')"><span class="goal-pill">Spanish</span><h3>DELE · Cervantes</h3><span>A1–C2 · official format</span></div>
    </div>
    <p class="goal-step">Step 2 · Which level?</p>
    <div class="goal-levels">${['A1','A2','B1','B2','C1','C2'].map(l=>`<span class="goal-lvl${w.level===l?' sel':''}" onclick="selectWizLevel('${l}')">${l}</span>`).join('')}</div>
    <p class="goal-step">Step 3 · Exam date <span class="goal-opt-note">(optional — powers your countdown)</span></p>
    <input type="date" class="goal-date" id="wizExamDate" value="${esc(w.examDate||'')}" onchange="_goalWizard.examDate=this.value">
    <div class="goal-wiz-actions">
      <button type="button" class="btn-start" style="width:100%;max-width:none;margin:0" onclick="submitGoalWizard()">${_editingGoalId?'Save changes →':'Create exam goal →'}</button>
      ${cancelBtn}
    </div>
  </div>`;
}
function renderGoalCardHtml(goal){
  const pct=getReadinessPctForGoal(goal);
  const histLen=historyForGoal(goal).length;
  const hasData=histLen>0;
  const days=goal.examDate?daysUntilExam(goal.examDate):null;
  const daysN=days!==null?Math.max(0,days):'—';
  const active=S.activeGoalId===goal.id;
  const gid=esc(goal.id);
  const drag=S.goals.length>1?`<span class="goal-drag-handle" draggable="true" ondragstart="onGoalDragStart(event,'${gid}')" ondragend="onGoalDragEnd(event)" title="Drag to reorder" aria-label="Drag to reorder" onclick="event.stopPropagation()">⋮⋮</span>`:'';
  return`<div class="goal-card has-drag${active?' active':''}" onclick="selectDashboardGoal('${gid}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectDashboardGoal('${gid}');}" ondragover="onGoalDragOver(event)" ondragleave="onGoalDragLeave(event)" ondrop="onGoalDrop(event,'${gid}')">
    ${drag}
    <div class="goal-card-tools">
      <button type="button" class="goal-card-tool" title="Edit goal" aria-label="Edit goal" onclick="event.stopPropagation();editGoal('${gid}')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
      <button type="button" class="goal-card-tool goal-card-tool--danger" title="Remove goal" aria-label="Remove goal" onclick="event.stopPropagation();confirmDeleteGoal('${gid}')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="goal-top"><span class="goal-name">${esc(goalLabel(goal))}</span><span class="goal-pill">${goalPill(goal.subject)}</span></div>
    <p class="goal-date${goal.examDate?'':' muted'}">${esc(formatGoalExamDate(goal))}</p>
    <div class="goal-ring-row">
      <div class="goal-ring">${readinessRingSvg(pct,hasData)}<div class="goal-ring-lbl"><span class="goal-ring-pct">${hasData?pct+'%':'—'}</span><span class="goal-ring-cap">Readiness</span></div></div>
      <div class="goal-days"><div class="goal-days-n">${daysN}</div><div class="goal-days-l">days left</div></div>
    </div>
    <button type="button" class="goal-open" onclick="event.stopPropagation();openGoal('${gid}')">Open workspace →</button>
  </div>`;
}
function renderGoalCardsRow(){
  const cards=orderedGoals().map(g=>renderGoalCardHtml(g)).join('');
  const addCard=`<div class="goal-card dashed" onclick="showAddGoalWizard()"><span class="goal-plus">+</span><b style="font-size:13px;margin-top:6px">Add exam goal</b></div>`;
  return'<div class="goal-row">'+cards+addCard+'</div>';
}
function renderHomeScreen(){
  const area=document.getElementById('homeGoalArea');
  if(!area)return;
  if(S.goals.length===0){
    _editingGoalId=null;
    area.innerHTML=renderGoalWizardHtml(true);
    return;
  }
  if(S.goals.length===1&&!S.activeGoalId){
    S.activeGoalId=S.goals[0].id;
    syncGoalToProfile(S.goals[0]);
  }
  const dashGoal=dashboardGoal();
  if(!dashGoal)return;
  if(_showGoalWizard){
    area.innerHTML=renderGoalWizardHtml(false)+
      '<div class="dash-sec-head" style="margin-top:16px"><div><h1>Your exam goals</h1></div></div>'+
      renderGoalCardsRow();
    return;
  }
  const head='<div class="dash-sec-head"><div><h1>My exam goals</h1><p>Your preparation at a glance</p></div>'+
    '<div class="dash-head-actions"><button type="button" class="btn-dash-ghost'+(_showDashCustomize?' on':'')+'" onclick="openDashboardCustomize()" title="Customize widgets and layout">⚙ Customize dashboard</button>'+
    '<button type="button" class="btn-sm accent" onclick="showAddGoalWizard()">+ Add exam goal</button></div></div>';
  const goalsRow=renderGoalCardsRow();
  area.innerHTML=head+goalsRow+renderDashboardBodyHtml(dashGoal);
  renderCoachDashboard();
  if(_showDashCustomize)renderDashboardCustomizeModal();
}