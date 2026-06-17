// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
const S={
  ui:'en',subject:null,level:null,mode:'official',examData:null,activeSession:null,lastMarkedWords:[],
  answers:{},gapAnswers:{},vocabLang:'en',vocabCache:{},
  user:null,flashcards:[],deletedFlashcards:[],fcLang:'es',fcTab:'all',fcSelected:new Set(), /* Set of flashcard ids */
  veQuestions:[],veIndex:0,veScore:0,veAudio:false,
  timerInt:null,timerSec:0,history:[],quickMod:null,studyIdx:0,
  savedExams:[],deletedSavedExams:[],listenPlays:2,isDemo:false,examSavedWords:[],
  profileCert:null,profileLevel:null,
  goals:[],activeGoalId:null,deckGoalFilter:null,fcTypeFilter:'all',wsTab:'exams',
  activityLog:[],studyTime:null,dashboardLayout:null,notebook:{tabs:[]}
};
const LEVELS={
  de:[{code:'A1',name:'Start Deutsch 1',desc:'Goethe A1',time:65},{code:'A2',name:'Start Deutsch 2',desc:'Goethe A2',time:65},{code:'B1',name:'Zertifikat B1',desc:'Goethe B1',time:90},{code:'B2',name:'Goethe B2',desc:'Goethe B2',time:105},{code:'C1',name:'Goethe C1',desc:'Goethe C1',time:150},{code:'C2',name:'Goethe C2',desc:'Goethe C2',time:180}],
  en:[{code:'A1',name:'Key (KET)',desc:'Cambridge A1',time:70},{code:'A2',name:'Key for Schools',desc:'Cambridge A2',time:70},{code:'B1',name:'Preliminary (PET)',desc:'Cambridge B1',time:90},{code:'B2',name:'First (FCE)',desc:'Cambridge B2',time:110},{code:'C1',name:'Advanced (CAE)',desc:'Cambridge C1',time:150},{code:'C2',name:'Proficiency (CPE)',desc:'Cambridge C2',time:180}],
  es:[{code:'A1',name:'DELE A1',desc:'Instituto Cervantes',time:90},{code:'A2',name:'DELE A2',desc:'Instituto Cervantes',time:105},{code:'B1',name:'DELE B1',desc:'Instituto Cervantes',time:150},{code:'B2',name:'DELE B2',desc:'Instituto Cervantes',time:175},{code:'C1',name:'DELE C1',desc:'Instituto Cervantes',time:210},{code:'C2',name:'DELE C2',desc:'Instituto Cervantes',time:225}]
};
const LANGS=[{code:'en',l:'EN',n:'English'},{code:'es',l:'ES',n:'Spanish'},{code:'fr',l:'FR',n:'French'},{code:'pt',l:'PT',n:'Portuguese'},{code:'it',l:'IT',n:'Italian'},{code:'nl',l:'NL',n:'Dutch'},{code:'pl',l:'PL',n:'Polish'},{code:'ru',l:'RU',n:'Russian'},{code:'zh',l:'ZH',n:'Chinese'},{code:'ja',l:'JA',n:'Japanese'},{code:'ar',l:'AR',n:'Arabic'},{code:'tr',l:'TR',n:'Turkish'},{code:'uk',l:'UK',n:'Ukrainian'}];
const GUEST_QUOTA=2, FREE_QUOTA=5, PRO_QUOTA=12;
const pick=a=>a[Math.floor(Math.random()*a.length)];
function certLbl(s,l){return typeof SubjectMeta!=='undefined'?SubjectMeta.certLabel(s,l):(s==='de'?'Goethe':s==='es'?'DELE':'Cambridge')+' '+l;}
function examFlag(lang){return lang==='de'?'🇩🇪':lang==='es'?'🇪🇸':'🇬🇧';}
function goalPill(s){return typeof SubjectMeta!=='undefined'?SubjectMeta.pill(s):(s==='de'?'DE':s==='es'?'ES':'EN');}
function provSlug(s){return typeof SubjectMeta!=='undefined'?SubjectMeta.providerSlug(s):(s==='de'?'goethe':s==='es'?'dele':'cambridge');}
function vocabLangFor(s){return typeof SubjectMeta!=='undefined'?SubjectMeta.vocabLang(s):(s==='de'?'en':'es');}
async function pickTopicForSubject(){
  if(typeof pickExamTopic==='function')return pickExamTopic(S.subject,S.level);
  if(typeof LexiCoilEngine!=='undefined'&&LexiCoilEngine.pickTopic)return LexiCoilEngine.pickTopic(S.subject,S.level);
  throw new Error('Topic resolver not available');
}

// ═══════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════
function fcId(fc){
  if(!fc)return'';
  if(!fc.id)fc.id='fc_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);
  return fc.id;
}
function ensureFcIds(){
  (S.flashcards||[]).forEach(fc=>fcId(fc));
}
function loadLS(){
  try{const u=localStorage.getItem('lc_user');if(u)S.user=JSON.parse(u);}catch(e){}
  try{const f=localStorage.getItem('lc_fc');if(f)S.flashcards=JSON.parse(f);}catch(e){}
  if(!Array.isArray(S.flashcards))S.flashcards=[];
  try{const fd=localStorage.getItem('lc_fc_del');if(fd)S.deletedFlashcards=JSON.parse(fd);}catch(e){}
  if(!Array.isArray(S.deletedFlashcards))S.deletedFlashcards=[];
  try{const h=localStorage.getItem('lc_hist');if(h)S.history=JSON.parse(h);}catch(e){}
  if(!Array.isArray(S.history))S.history=[];
  try{const sv=localStorage.getItem('lc_saved');if(sv)S.savedExams=JSON.parse(sv);}catch(e){}
  if(!Array.isArray(S.savedExams))S.savedExams=[];
  try{const sd=localStorage.getItem('lc_saved_del');if(sd)S.deletedSavedExams=JSON.parse(sd);}catch(e){}
  if(!Array.isArray(S.deletedSavedExams))S.deletedSavedExams=[];
  try{const gr=localStorage.getItem('lc_goals');if(gr)S.goals=JSON.parse(gr);}catch(e){}
  if(typeof loadNotebookData==='function')loadNotebookData();else try{const n=localStorage.getItem('lc_notes');if(n)S.notebook=JSON.parse(n);}catch(e){}
  if(!Array.isArray(S.goals))S.goals=[];
  try{const ag=localStorage.getItem('lc_active_goal');if(ag)S.activeGoalId=ag;}catch(e){}
  try{const al=localStorage.getItem('lc_activity');if(al)S.activityLog=JSON.parse(al);}catch(e){}
  if(!Array.isArray(S.activityLog))S.activityLog=[];
  try{const lt=localStorage.getItem('lc_time');if(lt)S.studyTime=JSON.parse(lt);}catch(e){}
  if(typeof ActivityTrack!=='undefined'){
    S.studyTime=ActivityTrack.normalizeStudyTime(S.studyTime);
    if(S.activityLog.length)S.studyTime=ActivityTrack.computeStudyTime(S.activityLog);
    bootstrapActivityFromHistory();
  }
  S.dashboardLayout=loadDashboardLayout();
  let migrated=GoalStore.migrateFromLegacy();
  if(migrated)GoalStore.save();
  try{const xl=localStorage.getItem('lc_pref_xlat');if(xl)S.fcLang=xl;}catch(e){}
  try{const as=localStorage.getItem('lc_active_session');if(as)S.activeSession=JSON.parse(as);}catch(e){}
  if(S.mode==='real')S.mode='official';
  if(S.activeSession?.mode==='real')S.activeSession.mode='official';
  if(S.activeSession&&(S.activeSession.mode==='official'||S.activeSession.mode==='real')){S.activeSession=null;localStorage.removeItem('lc_active_session');}
  S._officialInProgress=null;
  if(typeof ExamProfile!=='undefined')ExamProfile.migrateFromGoal();
  GoalStore.afterLoad();
  ensureFcIds();
  S.fcSelected=new Set([...S.fcSelected].filter(id=>S.flashcards.some(f=>fcId(f)===id)));
}
function saveActiveSession(){
  if(S.activeSession&&normalizeMode(S.activeSession.mode)==='official')return;
  if(S.activeSession)localStorage.setItem('lc_active_session',JSON.stringify(S.activeSession));
  else localStorage.removeItem('lc_active_session');
}
function normalizeMode(m){return m==='real'||m==='official'?'official':'practice';}
function migrateSavedExams(){
  if(!Array.isArray(S.savedExams))S.savedExams=[];
  S.savedExams.forEach(e=>{
    if(!e||typeof e!=='object')return;
    if(!e.status)e.status=e.score!=null?'completed':'in_progress';
    e.mode=normalizeMode(e.mode||'official');
  });
}
function paintDashboard(){
  hideAll();
  show('homeScreen');
  if(typeof setNavActive==='function')setNavActive('dashboard');
  renderHomeScreen();
  renderProfileBar();
  if(typeof updQuotaUI==='function')updQuotaUI();
}
async function bootstrapAuth(timeoutMs){
  if(typeof Auth==='undefined')return false;
  try{
    return await Promise.race([
      Auth.bootstrap(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('auth_timeout')),timeoutMs||8000))
    ]);
  }catch(e){
    lcDebug.warn('[auth] bootstrap failed:',e.message||e);
    return false;
  }
}
function isAppAuthenticated(){
  if(typeof Auth==='undefined'||!S.user)return false;
  if(typeof Auth.isGuest==='function'&&Auth.isGuest())return false;
  try{
    if(localStorage.getItem('lc_guest')==='1')return false;
    if(localStorage.getItem('lc_demo')==='1')return false;
  }catch(_){}
  if(typeof Auth.hasSession==='function'&&Auth.hasSession())return true;
  return !!localStorage.getItem('lc_token');
}
function requireAppAuth(){
  if(isAppAuthenticated())return true;
  switchTab('login');
  showAuthOverlay();
  return false;
}
function gateAppRoute(){
  if(isAppAuthenticated())return true;
  switchTab('login');
  showAuthOverlay();
  try{history.replaceState(null,'',location.pathname+location.search);}catch(_){}
  return false;
}
function isOfficialMode(){return normalizeMode(S.mode)==='official'&&!S.quickMod;}
function isPracticeMode(){return normalizeMode(S.mode)==='practice';}
function initExamSession(mode){
  const m=normalizeMode(mode);
  if(m==='official'){
    S.activeSession={
      goalId:S.activeGoalId,mode:'official',examData:null,answers:{},gapAnswers:{},
      markedWords:[],position:0,startedAt:Date.now(),updatedAt:Date.now()
    };
    S._officialInProgress={id:Date.now(),goalId:S.activeGoalId,examData:null,answers:{},gapAnswers:{},markedWords:[],startedAt:Date.now()};
    return;
  }
  S.activeSession={
    goalId:S.activeGoalId,mode:'practice',examData:null,answers:{},gapAnswers:{},
    markedWords:[],position:0,startedAt:Date.now(),updatedAt:Date.now()
  };
  saveActiveSession();
}
function clearActiveSession(){
  S.activeSession=null;
  saveActiveSession();
}
function getResumableSession(goalId){
  const s=S.activeSession;
  if(!s||normalizeMode(s.mode)!=='practice'||s.goalId!==goalId||!s.examData)return null;
  return s;
}
function captureExamFieldValues(){
  const v={};
  const wa=document.getElementById('writeAns');if(wa)v.writeAns=wa.value;
  const sa=document.getElementById('speakAns');if(sa)v.speakAns=sa.value;
  document.querySelectorAll('[id^="note_"]').forEach(el=>{if(el.id)v[el.id]=el.value;});
  S.examData?.schreibenParts?.forEach(p=>{
    if(p.formFields)p.formFields.forEach((_,i)=>{const el=document.getElementById(p.fieldId+'_'+i);if(el)v[p.fieldId+'_'+i]=el.value;});
    else{const el=document.getElementById(p.fieldId);if(el)v[p.fieldId]=el.value;}
  });
  S.examData?.sprechenParts?.forEach(p=>{const el=document.getElementById(p.fieldId);if(el)v[p.fieldId]=el.value;});
  return v;
}
function restoreExamFieldValues(v){
  if(!v)return;
  Object.entries(v).forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.value=val;});
}
function restoreExamAnswers(){
  Object.entries(S.answers||{}).forEach(([k,v])=>{
    if(v==null||v==='')return;
    const radio=document.querySelector(`input[type=radio][name="${k}"][value="${String(v).replace(/"/g,'\\"')}"]`);
    if(radio){radio.checked=true;radio.closest('.opt')?.classList.add('selected');return;}
    document.querySelectorAll('.gap-select').forEach(selEl=>{
      const m=selEl.getAttribute('onchange')?.match(/S\.answers\['([^']+)'\]/);
      if(m&&m[1]===k)selEl.value=v;
    });
    document.querySelectorAll('.rf-btn').forEach(btn=>{
      const oc=btn.getAttribute('onclick')||'';
      const hitKey=oc.includes("'"+k+"'")||oc.includes('"'+k+'"');
      const hitVal=oc.includes("'"+v+"'")||oc.includes('"'+v+'"');
      if(hitKey&&hitVal)btn.click();
    });
    let sel=[];
    try{sel=JSON.parse(v);}catch(_){}
    if(Array.isArray(sel)){
      document.querySelectorAll(`input[type=checkbox][onchange*="'${k}'"]`).forEach(cb=>{
        const m=cb.getAttribute('onchange')?.match(/decodeURIComponent\('([^']+)'\)/);
        if(m&&sel.includes(decodeURIComponent(m[1]))){cb.checked=true;cb.closest('.opt')?.classList.add('selected');}
      });
    }
  });
  Object.entries(S.gapAnswers||{}).forEach(([id,val])=>{const el=document.getElementById('gap_'+id);if(el&&val)el.value=val;});
}
function autosaveSession(){
  if(!isPracticeMode()||!S.examData||S.quickMod||S.isDemo)return;
  if(!S.activeSession)initExamSession('practice');
  S.activeSession.goalId=S.activeGoalId;
  S.activeSession.mode='practice';
  S.activeSession.examData=S.examData;
  S.activeSession.answers={...S.answers};
  S.activeSession.gapAnswers={...S.gapAnswers};
  S.activeSession.fieldValues=captureExamFieldValues();
  S.activeSession.scrollY=window.scrollY;
  S.activeSession.subject=S.subject;
  S.activeSession.level=S.level;
  S.activeSession.vocabLang=S.vocabLang;
  S.activeSession.updatedAt=Date.now();
  saveActiveSession();
}
function syncOfficialFlight(){
  if(!isOfficialMode()||!S.examData||S.quickMod)return;
  if(!S._officialInProgress)S._officialInProgress={id:Date.now(),goalId:S.activeGoalId,startedAt:Date.now()};
  const f=S._officialInProgress;
  f.examData=S.examData;
  f.answers={...S.answers};
  f.gapAnswers={...S.gapAnswers};
  f.markedWords=S.activeSession?.markedWords?[...S.activeSession.markedWords]:[];
  f.goalId=S.activeGoalId;
  if(S.examData&&!S.examData._flightId){S.examData._flightId=f.id;f.id=S.examData._flightId;}
}
function abortOfficialInProgress(){
  const flight=S._officialInProgress;
  const sess=S.activeSession&&normalizeMode(S.activeSession.mode)==='official'?S.activeSession:null;
  const src=flight||sess;
  if(!src)return;
  if(!src.examData){S._officialInProgress=null;S.activeSession=null;return;}
  const id=src.examData?._flightId||src.id||Date.now();
  const entry={
    id,savedAt:new Date().toLocaleDateString(),
    topic:src.examData.topic||'Official exam',
    level:src.examData.level||S.level,
    lang:src.examData.lang||S.subject,
    mode:'official',status:'aborted',
    goalId:src.goalId||S.activeGoalId,
    source:S.examSource||'ai',
    data:src.examData,
    answers:{...(src.answers||{})},
    gapAnswers:{...(src.gapAnswers||{})},
    markedWords:(src.markedWords||[]).map(m=>typeof m==='string'?m:m.word),
    abortedAt:Date.now()
  };
  const idx=S.savedExams.findIndex(e=>e.id===id);
  if(idx>=0)S.savedExams[idx]={...S.savedExams[idx],...entry};
  else{S.savedExams.unshift(entry);if(S.savedExams.length>50)S.savedExams=S.savedExams.slice(0,50);}
  saveSaved();
  S._officialInProgress=null;
  S.activeSession=null;
}
function resumeExamSession(){
  const s=S.activeSession;
  if(!s||!s.examData)return;
  S.examData=s.examData;
  S.answers={...(s.answers||{})};
  S.gapAnswers={...(s.gapAnswers||{})};
  S.mode='practice';
  S.subject=s.subject||s.examData.lang;
  S.level=s.level||s.examData.level;
  S.vocabLang=s.vocabLang||vocabLangFor(S.subject||'de');
  if(s.goalId){S.activeGoalId=s.goalId;const g=S.goals.find(x=>x.id===s.goalId);if(g)syncGoalToProfile(g);}
  S._resumeFieldValues=s.fieldValues;
  S._resumeScrollY=s.scrollY;
  hideAll();
  renderExam();
}
function discardActiveSession(){
  const sid=S.activeSession?.examData?._savedId;
  clearActiveSession();
  if(sid){
    const idx=S.savedExams.findIndex(e=>e.id===sid&&e.status==='in_progress');
    if(idx>=0){S.savedExams.splice(idx,1);saveSaved();}
  }
  const id=S.activeGoalId;
  if(id)openGoalWorkspace(id);
  else goHome();
}
function saveAndExitExam(){
  if(!isPracticeMode()||!S.examData)return;
  autosaveSession();
  saveCurrentExam('in_progress');
  const id=S.activeGoalId;
  if(id)openGoalWorkspace(id);
  else goHome();
  lcToast('Exam saved — resume anytime from your goal workspace.','info');
}
function saveUser(u){S.user=u;localStorage.setItem('lc_user',JSON.stringify(u));}
function saveFC(){ensureFcIds();localStorage.setItem('lc_fc',JSON.stringify(S.flashcards));updBadges();Auth.pushSync();}
function lcToast(msg,type='info',ms=3800){if(typeof showToast==='function')showToast(msg,type,ms);else alert(msg);}
function saveHist(){localStorage.setItem('lc_hist',JSON.stringify(S.history));Auth.pushSync();}
function saveNotes(){if(typeof saveNotebookData==='function')saveNotebookData();}
function saveSaved(){localStorage.setItem('lc_saved',JSON.stringify(S.savedExams));Auth.pushSync();}
function saveActivity(){
  if(typeof ActivityTrack!=='undefined'&&S.activityLog?.length)S.studyTime=ActivityTrack.computeStudyTime(S.activityLog);
  localStorage.setItem('lc_activity',JSON.stringify(S.activityLog||[]));
  localStorage.setItem('lc_time',JSON.stringify(S.studyTime||{}));
  if(typeof Auth!=='undefined')Auth.pushSync();
}
function recordStudySession(meta){
  if(!meta||typeof ActivityTrack==='undefined')return;
  const next=ActivityTrack.recordSession({activityLog:S.activityLog,studyTime:S.studyTime},meta);
  S.activityLog=next.activityLog;
  S.studyTime=next.studyTime;
  saveActivity();
}
function flushOpenStudySession(extra){
  if(typeof ActivityTrack==='undefined')return;
  const meta=ActivityTrack.flushSession(extra);
  if(meta)recordStudySession(meta);
}
function bootstrapActivityFromHistory(){
  if(S.activityLog.length||!S.history?.length)return;
  S.activityLog=S.history.slice(0,40).map(h=>{
    const ts=Date.parse(h.date)||Number(h.id)||Date.now();
    const day=new Date(ts).toISOString().slice(0,10);
    const mode=normalizeMode(h.mode)==='practice'?'Practice':'Official';
    return{id:'hist_'+h.id,ts,day,type:'exam',goalId:null,label:mode+' exam · '+(h.topic||h.level||''),score:h.score!=null?h.score:null,sec:0};
  });
  saveActivity();
}
function getStudyStreak(){return typeof ActivityTrack!=='undefined'?ActivityTrack.getStreak({studyTime:S.studyTime}):0;}
function getStudyMonthTime(){return typeof ActivityTrack!=='undefined'?ActivityTrack.getMonthSec({studyTime:S.studyTime}):0;}
function formatStudyDuration(sec){return typeof ActivityTrack!=='undefined'?ActivityTrack.formatDuration(sec):'—';}
function studySecForGoal(goal){return typeof ActivityTrack!=='undefined'?ActivityTrack.studySecForGoal(S.activityLog,goal):0;}
