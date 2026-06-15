/** Standalone oral practice — vocab-seeded AI task + mic evaluation (folded from oral.html). */
const _oralSession={goalId:null,words:[],task:null,transcript:'',result:null};

function oralBoardForSubject(subject){
  if(subject==='de')return{board:'Goethe-Institut',label:'Goethe',speechLang:'de-DE'};
  if(subject==='es')return{board:'Instituto Cervantes',label:'DELE',speechLang:'es-ES'};
  return{board:'Cambridge Assessment English',label:'Cambridge',speechLang:'en-GB'};
}

function oralLangName(subject){
  if(typeof SubjectMeta!=='undefined')return SubjectMeta.langName(subject);
  return subject==='de'?'German':subject==='es'?'Spanish':'English';
}

async function generateOralTask(goal,words){
  const board=oralBoardForSubject(goal.subject);
  const lang=oralLangName(goal.subject);
  const list=words.map(w=>`"${w}"`).join(', ');
  const prompt=`You are a ${board.board} examiner. Create one ${goal.level} ${lang} oral speaking task that naturally uses several of these learner vocabulary words: ${list}.
Reply ONLY valid JSON:
{"text":"The speaking task prompt (2-4 sentences, in ${lang})","hints":["hint 1","hint 2","hint 3"]}`;
  const raw=await callAI(prompt,900,{consumeQuota:false});
  const clean=raw.replace(/```json|```/g,'').trim();
  const data=JSON.parse(clean);
  if(!data.text)throw new Error('AI returned an invalid speaking task.');
  return{text:data.text,hints:Array.isArray(data.hints)?data.hints.slice(0,4):[]};
}

async function startOralPractice(goal,words){
  if(!goal||!words?.length)return;
  if(typeof requirePersonalized==='function'&&!requirePersonalized({message:'AI speaking practice from your vocabulary requires Pro.'}))return;
  _oralSession.goalId=goal.id;
  _oralSession.words=words;
  _oralSession.task=null;
  _oralSession.transcript='';
  _oralSession.result=null;
  S.activeGoalId=goal.id;
  syncGoalToProfile(goal);
  saveGoals();
  hideAll();
  show('loadingScreen');
  document.getElementById('loaderTitle').textContent='Preparing speaking task…';
  document.getElementById('loaderSub').textContent='Building a prompt from your vocabulary…';
  try{
    _oralSession.task=await generateOralTask(goal,words);
    renderOralPracticeTask(goal);
  }catch(e){
    backToWorkspace('exams');
    lcToast('Could not create speaking task: '+(e.message||'error'),'error');
  }
}

function renderOralPracticeTask(goal){
  const task=_oralSession.task;
  if(!task)return;
  const board=oralBoardForSubject(goal.subject);
  const hints=(task.hints||[]).map(h=>`<span class="oral-task-hint">💡 ${esc(h)}</span>`).join('');
  const el=document.getElementById('oralPracticeContent');
  if(!el)return;
  el.innerHTML=`
    <div class="oral-practice-tags">
      <span class="exam-badge">${esc(board.label)}</span>
      <span class="exam-badge">${esc(goal.level)}</span>
      <span class="exam-badge practice">Speaking · Oral</span>
    </div>
    <h1 class="exam-config-h1">Speaking practice</h1>
    <p class="exam-config-lede">AI examiner · ${esc(goalLabel(goal))} · built from your deck words.</p>
    <div class="card note-card oral-task-card">
      <p class="exam-config-seclbl" style="margin-bottom:8px">Your task</p>
      <p class="oral-task-text">${esc(task.text)}</p>
      ${hints?`<div class="oral-task-hints">${hints}</div>`:''}
    </div>
    ${renderSpeakingMicHtml('oralTranscript',goal.subject)}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
      <button type="button" class="btn btn-primary" id="oralEvalBtn" onclick="evaluateOralPractice()" disabled>Submit for evaluation →</button>
      <button type="button" class="btn-sm" onclick="navBack()">Cancel</button>
    </div>`;
  hideAll();
  show('oralPracticeScreen');
  if(typeof LcRouter!=='undefined')LcRouter.replaceRoute(LcRouter.goalPath(goal,'oral'),'Exams');
  initSpeakingMic('oralTranscript',goal.subject);
  const ta=document.getElementById('oralTranscript');
  const btn=document.getElementById('oralEvalBtn');
  if(ta&&btn){
    const upd=()=>{btn.disabled=ta.value.trim().length<10;};
    ta.addEventListener('input',upd);
    upd();
  }
  window.scrollTo({top:0,behavior:'smooth'});
}

async function evaluateOralPractice(){
  const goal=S.goals.find(g=>g.id===_oralSession.goalId);
  if(!goal||!_oralSession.task)return;
  const transcript=(document.getElementById('oralTranscript')?.value||'').trim();
  if(transcript.length<10){lcToast('Record or type at least a short answer first.','warn');return;}
  _oralSession.transcript=transcript;
  hideAll();
  show('loadingScreen');
  document.getElementById('loaderTitle').textContent='Evaluating your oral production…';
  document.getElementById('loaderSub').textContent='AI examiner is scoring your response…';
  const board=oralBoardForSubject(goal.subject);
  const rubric=`${board.label} ${goal.level} Speaking`;
  const systemPrompt=`You are a certified ${board.board} examiner evaluating a spoken response at level ${goal.level}. Evaluate strictly according to the official ${rubric} rubric. Reply ONLY with valid JSON.`;
  const userPrompt=`Task: ${_oralSession.task.text}
Candidate's transcript:
${transcript}

Evaluate and return JSON:
{"criteria":[{"name":"Task Achievement","score":0-5,"comment":"..."},{"name":"Vocabulary Range","score":0-5,"comment":"..."},{"name":"Grammar Accuracy","score":0-5,"comment":"..."},{"name":"Coherence & Fluency","score":0-5,"comment":"..."}],"totalScore":0-100,"passed":true,"overallFeedback":"2-3 sentences","strongPoints":["..."],"improvements":["..."],"correctedVersion":"improved version"}`;
  try{
    const raw=await callAI(systemPrompt+'\n\n'+userPrompt,1200,{consumeQuota:true,examGeneration:true});
    const result=JSON.parse(raw.replace(/```json|```/g,'').trim());
    if(typeof commitExamQuota==='function')await commitExamQuota();
    _oralSession.result=result;
    renderOralPracticeResults(goal,result,transcript);
  }catch(e){
    renderOralPracticeTask(goal);
    lcToast('Evaluation failed: '+(e.message||'error'),'error');
  }
}

function renderOralPracticeResults(goal,result,transcript){
  const total=Math.round(result.totalScore??result.total??0);
  const grade=total>=70?'pass':total>=50?'mid':'fail';
  const criteria=result.criteria||[];
  const el=document.getElementById('oralPracticeContent');
  if(!el)return;
  el.innerHTML=`
    <div class="oral-results-head">
      <p class="exam-config-seclbl">${esc(oralBoardForSubject(goal.subject).label)} ${esc(goal.level)} · Oral</p>
      <div class="oral-score-ring ${grade}"><span class="oral-score-big ${grade}">${total}</span><span class="oral-score-denom">/100</span></div>
      <p class="oral-results-summary">${esc(result.overallFeedback||'')}</p>
    </div>
    <div class="oral-criteria-grid">${criteria.map(c=>{
      const v=Math.round(c.score||0);
      const g=v>=4?'high':v>=3?'mid':'low';
      return`<div class="card oral-crit-card"><div class="oral-crit-top"><span>${esc(c.name)}</span><span class="oral-crit-val ${g}">${v}/5</span></div><p class="oral-crit-comment">${esc(c.comment||'')}</p></div>`;
    }).join('')}</div>
    ${result.improvements?.length?`<div class="card note-card"><b>To improve</b><ul class="oral-fb-list">${result.improvements.map(i=>`<li>${esc(i)}</li>`).join('')}</ul></div>`:''}
    ${result.strongPoints?.length?`<div class="card note-card"><b>Strengths</b><ul class="oral-fb-list">${result.strongPoints.map(i=>`<li>${esc(i)}</li>`).join('')}</ul></div>`:''}
    <div class="card note-card"><b>Your transcript</b><p style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-top:8px">${esc(transcript)}</p></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
      <button type="button" class="btn btn-primary" onclick="retryOralPractice()">Try again</button>
      <button type="button" class="btn-sm" onclick="navBack()">Back to exams</button>
    </div>`;
  hideAll();
  show('oralPracticeScreen');
  window.scrollTo({top:0,behavior:'smooth'});
}

function retryOralPractice(){
  const goal=S.goals.find(g=>g.id===_oralSession.goalId);
  if(goal)renderOralPracticeTask(goal);
}
