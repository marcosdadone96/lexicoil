// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
const S={
  ui:'en',subject:null,level:null,mode:'official',examData:null,activeSession:null,lastMarkedWords:[],
  answers:{},gapAnswers:{},vocabLang:'en',vocabCache:{},
  user:null,flashcards:[],deletedFlashcards:[],fcLang:'en',fcTab:'all',fcSelected:new Set(),fcReverse:false, /* Set of flashcard ids */
  veQuestions:[],veIndex:0,veScore:0,veAudio:false,
  timerInt:null,timerSec:0,history:[],quickMod:null,studyIdx:0,
  savedExams:[],deletedSavedExams:[],savedQuizzes:[],deletedSavedQuizzes:[],listenPlays:2,isDemo:false,examSavedWords:[],
  profileCert:null,profileLevel:null,
  goals:[],activeGoalId:null,deckGoalFilter:null,fcTypeFilter:'all',wsTab:'exams',
  activityLog:[],studyTime:null,dashboardLayout:null,notebook:{tabs:[]},
  activeSessionsByGoal:{},timerEndsAt:null
};
const ACTIVE_SESSIONS_LS_KEY='lc_active_sessions';
const LEGACY_ACTIVE_SESSION_KEY='lc_active_session';
let _activeSessionsSyncTimer=null;
const LEVELS={
  de:[{code:'A1',name:'Start Deutsch 1',desc:'Goethe A1',time:65},{code:'A2',name:'Start Deutsch 2',desc:'Goethe A2',time:65},{code:'B1',name:'Zertifikat B1',desc:'Goethe B1',time:90},{code:'B2',name:'Goethe B2',desc:'Goethe B2',time:105},{code:'C1',name:'Goethe C1',desc:'Goethe C1',time:150},{code:'C2',name:'Goethe C2',desc:'Goethe C2',time:180}],
  en:[{code:'A1',name:'Key (KET)',desc:'Cambridge A1',time:70},{code:'A2',name:'Key for Schools',desc:'Cambridge A2',time:70},{code:'B1',name:'Preliminary (PET)',desc:'Cambridge B1',time:90},{code:'B2',name:'First (FCE)',desc:'Cambridge B2',time:110},{code:'C1',name:'Advanced (CAE)',desc:'Cambridge C1',time:150},{code:'C2',name:'Proficiency (CPE)',desc:'Cambridge C2',time:180}],
  es:[{code:'A1',name:'DELE A1',desc:'Instituto Cervantes',time:90},{code:'A2',name:'DELE A2',desc:'Instituto Cervantes',time:105},{code:'B1',name:'DELE B1',desc:'Instituto Cervantes',time:150},{code:'B2',name:'DELE B2',desc:'Instituto Cervantes',time:175},{code:'C1',name:'DELE C1',desc:'Instituto Cervantes',time:210},{code:'C2',name:'DELE C2',desc:'Instituto Cervantes',time:225}]
};
const LANGS=[{code:'en',l:'EN',n:'English'},{code:'es',l:'ES',n:'Spanish'},{code:'fr',l:'FR',n:'French'},{code:'pt',l:'PT',n:'Portuguese'},{code:'it',l:'IT',n:'Italian'},{code:'nl',l:'NL',n:'Dutch'},{code:'pl',l:'PL',n:'Polish'},{code:'ru',l:'RU',n:'Russian'},{code:'zh',l:'ZH',n:'Chinese'},{code:'ja',l:'JA',n:'Japanese'},{code:'ar',l:'AR',n:'Arabic'},{code:'tr',l:'TR',n:'Turkish'},{code:'uk',l:'UK',n:'Ukrainian'}];
// Product scope (temporary): translation UI shows only these targets.
// Backend/LANGS still support more (e.g. pt); this is a product restriction, not a technical limit.
const VOCAB_UI_LANG_CODES=Object.freeze(['en','es','fr','it']);
function vocabUiLangs(){
  return VOCAB_UI_LANG_CODES.map(code=>LANGS.find(l=>l.code===code)).filter(Boolean);
}
function clampVocabUiLang(code,fallback='en'){
  const c=String(code||'').toLowerCase();
  return VOCAB_UI_LANG_CODES.includes(c)?c:fallback;
}
const GUEST_QUOTA=2, FREE_QUOTA=5, PRO_QUOTA=12;
const AI_CREDITS_FREE=6, AI_CREDITS_PRO=40, AI_CREDITS_PRO_MAX=150, AI_CREDITS_PRO_ROLLOVER_MAX=50, FREE_POOL_PREVIEW=2;
const AI_COST_PERSONAL_EXAM=4, AI_COST_PERSONAL_LESEN=0, AI_COST_PERSONAL_HOREN=0, AI_COST_PERSONAL_SCHREIBEN=2, AI_COST_PERSONAL_SPRECHEN_GEN=2, AI_COST_VOCAB_QUIZ=2, AI_COST_SPEAKING=2, AI_COST_SPEAKING_REALTIME=4, AI_COST_LISTENING_GAME=2, AI_COST_WRITING=1, AI_COST_VOCAB_PHRASES=1, AI_COST_GRAMMAR_COACHING=1;
const PRO_SUBSCRIPTION_EUR=13, PRO_MAX_SUBSCRIPTION_EUR=24;
const CREDIT_PACK_OFFERS=[
  {pack:15,label:'S',credits:15,priceEur:6,pricePerCredit:0.4},
  {pack:40,label:'M',credits:40,priceEur:14,pricePerCredit:0.35},
  {pack:100,label:'L',credits:100,priceEur:30,pricePerCredit:0.3},
];
if(typeof window!=='undefined'){
  window.AI_CREDITS_FREE=AI_CREDITS_FREE;
  window.AI_CREDITS_PRO=AI_CREDITS_PRO;
  window.AI_CREDITS_PRO_MAX=AI_CREDITS_PRO_MAX;
  window.AI_CREDITS_PRO_ROLLOVER_MAX=AI_CREDITS_PRO_ROLLOVER_MAX;
  window.FREE_QUOTA=FREE_QUOTA;
  window.PRO_QUOTA=PRO_QUOTA;
  window.FREE_POOL_PREVIEW=FREE_POOL_PREVIEW;
  window.AI_COST_PERSONAL_EXAM=AI_COST_PERSONAL_EXAM;
  window.AI_COST_PERSONAL_LESEN=AI_COST_PERSONAL_LESEN;
  window.AI_COST_PERSONAL_HOREN=AI_COST_PERSONAL_HOREN;
  window.AI_COST_PERSONAL_SCHREIBEN=AI_COST_PERSONAL_SCHREIBEN;
  window.AI_COST_PERSONAL_SPRECHEN_GEN=AI_COST_PERSONAL_SPRECHEN_GEN;
  window.AI_COST_VOCAB_QUIZ=AI_COST_VOCAB_QUIZ;
  window.AI_COST_SPEAKING=AI_COST_SPEAKING;
  window.AI_COST_SPEAKING_REALTIME=AI_COST_SPEAKING_REALTIME;
  window.AI_COST_LISTENING_GAME=AI_COST_LISTENING_GAME;
  window.AI_COST_WRITING=AI_COST_WRITING;
  window.AI_COST_VOCAB_PHRASES=AI_COST_VOCAB_PHRASES;
  window.AI_COST_GRAMMAR_COACHING=AI_COST_GRAMMAR_COACHING;
  window.PRO_SUBSCRIPTION_EUR=PRO_SUBSCRIPTION_EUR;
  window.PRO_MAX_SUBSCRIPTION_EUR=PRO_MAX_SUBSCRIPTION_EUR;
  window.CREDIT_PACK_OFFERS=CREDIT_PACK_OFFERS;
  // legacy alias
  window.AI_CREDITS_FREE_TRIAL=AI_CREDITS_FREE;
}
/** Unambiguous date, e.g. 19 Jun 2026 (not 19/06/2026). */
function formatAppDate(value){
  if(value==null||value==='')return'';
  const d=value instanceof Date?value:new Date(value);
  if(Number.isNaN(d.getTime()))return'';
  return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
}
if(typeof window!=='undefined')window.formatAppDate=formatAppDate;
const pick=a=>a[Math.floor(Math.random()*a.length)];
function certLbl(s,l){return typeof SubjectMeta!=='undefined'?SubjectMeta.certLabel(s,l):(s==='de'?'Goethe':s==='es'?'DELE':'Cambridge')+' '+l;}
function examFlag(lang){return lang==='de'?'🇩🇪':lang==='es'?'🇪🇸':'🇬🇧';}
function goalPill(s){return typeof SubjectMeta!=='undefined'?SubjectMeta.pill(s):(s==='de'?'DE':s==='es'?'ES':'EN');}
function provSlug(s){return typeof SubjectMeta!=='undefined'?SubjectMeta.providerSlug(s):(s==='de'?'goethe':s==='es'?'dele':'cambridge');}
function vocabLangFor(s){
  // Legacy default when lc_ui_lang unset; product UI lang is always lc_ui_lang (see translationLang()).
  const raw=typeof SubjectMeta!=='undefined'?SubjectMeta.vocabLang(s):(s==='de'?'en':'es');
  return clampVocabUiLang(raw,'en');
}
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
  let genderDirty=false;
  (S.flashcards||[]).forEach(fc=>{
    fcId(fc);
    if(typeof normalizeFlashcard==='function')normalizeFlashcard(fc);
    const before=(fc.gender||'')+'|'+(fc.article||'')+'|'+(fc.type||fc.pos||'');
    if(typeof ManualVocab!=='undefined'&&ManualVocab.enrichFlashcard){
      ManualVocab.enrichFlashcard(fc,fc.sourceLang||S.subject);
    }
    const after=(fc.gender||'')+'|'+(fc.article||'')+'|'+(fc.type||fc.pos||'');
    if(before!==after)genderDirty=true;
  });
  if((genderDirty)&&typeof saveFC==='function')saveFC();
}
function loadLS(){
  try{const u=localStorage.getItem('lc_user');if(u)S.user=JSON.parse(u);}catch(e){}
  try{const f=localStorage.getItem('lc_fc');if(f)S.flashcards=JSON.parse(f);}catch(e){}
  if(!Array.isArray(S.flashcards))S.flashcards=[];
  try{const fd=localStorage.getItem('lc_fc_del');if(fd)S.deletedFlashcards=JSON.parse(fd);}catch(e){}
  if(!Array.isArray(S.deletedFlashcards))S.deletedFlashcards=[];
  try{const h=localStorage.getItem('lc_hist');if(h)S.history=JSON.parse(h);}catch(e){}
  if(!Array.isArray(S.history))S.history=[];
  if(typeof ModuleGrading!=='undefined'&&ModuleGrading.migrateHistoryEntry){
    S.history=S.history.map(e=>ModuleGrading.migrateHistoryEntry(e));
  }
  try{const sv=localStorage.getItem('lc_saved');if(sv)S.savedExams=JSON.parse(sv);}catch(e){}
  if(!Array.isArray(S.savedExams))S.savedExams=[];
  try{const sd=localStorage.getItem('lc_saved_del');if(sd)S.deletedSavedExams=JSON.parse(sd);}catch(e){}
  if(!Array.isArray(S.deletedSavedExams))S.deletedSavedExams=[];
  try{const sq=localStorage.getItem('lc_saved_quizzes');if(sq)S.savedQuizzes=JSON.parse(sq);}catch(e){}
  if(!Array.isArray(S.savedQuizzes))S.savedQuizzes=[];
  try{const sqd=localStorage.getItem('lc_saved_quizzes_del');if(sqd)S.deletedSavedQuizzes=JSON.parse(sqd);}catch(e){}
  if(!Array.isArray(S.deletedSavedQuizzes))S.deletedSavedQuizzes=[];
  try{const gr=localStorage.getItem('lc_goals');if(gr)S.goals=JSON.parse(gr);}catch(e){}
  if(typeof loadNotebookData==='function')loadNotebookData();else try{const n=localStorage.getItem('lc_notes');if(n)S.notebook=JSON.parse(n);}catch(e){}
  if(!Array.isArray(S.goals))S.goals=[];
  try{const ag=localStorage.getItem('lc_active_goal');if(ag)S.activeGoalId=ag;}catch(e){}
  try{const al=localStorage.getItem('lc_activity');if(al)S.activityLog=JSON.parse(al);}catch(e){}
  if(!Array.isArray(S.activityLog))S.activityLog=[];
  try{const lt=localStorage.getItem('lc_time');if(lt)S.studyTime=JSON.parse(lt);}catch(e){}
  if(typeof ActivityTrack!=='undefined'){
    S.studyTime=ActivityTrack.normalizeStudyTime(S.studyTime);
    if(S.activityLog.length){
      S.activityLog=S.activityLog.map(a=>{
        const ts=Number(a?.ts)||Date.now();
        return{...a,day:ActivityTrack.localDayKey(ts)};
      });
      S.studyTime=ActivityTrack.computeStudyTime(S.activityLog);
    }
    bootstrapActivityFromHistory();
  }
  S.dashboardLayout=loadDashboardLayout();
  let migrated=GoalStore.migrateFromLegacy();
  if(migrated)GoalStore.save();
  try{const xl=localStorage.getItem('lc_pref_xlat');if(xl&&!localStorage.getItem('lc_ui_lang'))localStorage.setItem('lc_ui_lang',clampVocabUiLang(xl,'en'));}catch(e){}
  try{const fr=localStorage.getItem('lc_fc_reverse');if(fr==='1')S.fcReverse=true;}catch(e){}
  S.activeSessionsByGoal=readActiveSessionsMap();
  S.activeSession=null;
  S._officialInProgress=null;
  if(S.mode==='real')S.mode='official';
  if(typeof ExamProfile!=='undefined')ExamProfile.migrateFromGoal();
  GoalStore.afterLoad();
  if(typeof fixFlashcardLevels==='function')fixFlashcardLevels();
  ensureFcIds();
  if(typeof ArticleLexicon!=='undefined'&&ArticleLexicon.preload){
    void ArticleLexicon.preload('de').then(()=>{
      if(typeof ManualVocab!=='undefined'&&ManualVocab.reclassifyStoredFlashcards){
        if(ManualVocab.reclassifyStoredFlashcards()&&typeof saveFC==='function')saveFC();
      }
    });
  }
  S.fcSelected=new Set([...S.fcSelected].filter(id=>S.flashcards.some(f=>fcId(f)===id)));
}
function readActiveSessionsMap(){
  try{
    const raw=localStorage.getItem(ACTIVE_SESSIONS_LS_KEY);
    if(raw){
      const map=JSON.parse(raw);
      if(map&&typeof map==='object'){
        Object.values(map).forEach((s)=>{if(s?.mode==='real')s.mode='official';});
        return map;
      }
    }
  }catch(_){}
  try{
    const leg=localStorage.getItem(LEGACY_ACTIVE_SESSION_KEY);
    if(leg){
      const s=JSON.parse(leg);
      if(s?.goalId){
        if(s.mode==='real')s.mode='official';
        const map={[s.goalId]:s};
        writeActiveSessionsMap(map,false);
        localStorage.removeItem(LEGACY_ACTIVE_SESSION_KEY);
        return map;
      }
    }
  }catch(_){}
  return{};
}
function resolveExamGoalId(session){
  const fromGoal=typeof getActiveGoal==='function'?getActiveGoal()?.id:null;
  return S.activeGoalId||session?.goalId||S.examData?.goalId||S.activeSession?.goalId||fromGoal||null;
}
function toSlimActiveSession(gid,s){
  if(!s)return null;
  const ref=s.examSavedId||s.examData?._savedId||s.examData?._flightId||null;
  return{
    goalId:s.goalId||gid,
    mode:normalizeMode(s.mode),
    examSavedId:ref,
    answers:s.answers||{},
    gapAnswers:s.gapAnswers||{},
    fieldValues:s.fieldValues||{},
    markedWords:s.markedWords||[],
    subject:s.subject||s.examData?.lang,
    level:s.level||s.examData?.level,
    vocabLang:s.vocabLang,
    scrollY:s.scrollY||0,
    timerEndsAt:s.timerEndsAt||null,
    startedAt:s.startedAt||null,
    updatedAt:s.updatedAt||Date.now(),
  };
}
function clearResumableExamForGoal(goalId){
  const gid=goalId||S.activeGoalId;
  if(!gid)return;
  const s=getResumableSession(gid);
  const sid=s?.examSavedId||s?.examData?._savedId;
  clearActiveSession(gid);
  if(sid){
    const idx=S.savedExams.findIndex(e=>String(e.id)===String(sid)&&e.status==='in_progress');
    if(idx>=0){S.savedExams.splice(idx,1);saveSaved();}
  }
}
function savedExamById(id){
  if(id==null)return null;
  const sid=String(id);
  return(S.savedExams||[]).find(e=>String(e.id)===sid)||null;
}
function sessionFromSavedExam(entry,goalId){
  if(!entry?.data)return null;
  return{
    goalId:goalId||entry.goalId||null,
    mode:normalizeMode(entry.mode||'official'),
    examData:entry.data,
    answers:{...(entry.answers||{})},
    gapAnswers:{...(entry.gapAnswers||{})},
    fieldValues:entry.fieldValues||{},
    markedWords:(entry.markedWords||[]).map(w=>typeof w==='string'?{word:w}:w),
    subject:entry.lang||entry.data.lang,
    level:entry.level||entry.data.level,
    vocabLang:entry.vocabLang||vocabLangFor(entry.lang||'de'),
    scrollY:entry.scrollY||0,
    timerEndsAt:entry.timerEndsAt||null,
    startedAt:entry.startedAt||null,
    examSavedId:entry.id,
    updatedAt:typeof savedExamTs==='function'?savedExamTs(entry):Date.now(),
  };
}
function hydrateSessionExamData(session){
  if(!session)return null;
  if(session.examData)return session;
  const ref=session.examSavedId||session.examDataRef;
  if(!ref)return null;
  const saved=savedExamById(ref);
  if(!saved?.data)return null;
  session.examData=saved.data;
  if(!session.answers||!Object.keys(session.answers).length)session.answers={...(saved.answers||{})};
  if(!session.gapAnswers||!Object.keys(session.gapAnswers).length)session.gapAnswers={...(saved.gapAnswers||{})};
  if(!session.fieldValues||!Object.keys(session.fieldValues).length)session.fieldValues=saved.fieldValues||{};
  return session;
}
function writeActiveSessionsMap(map,scheduleSync){
  const payload={};
  Object.entries(map||{}).forEach(([gid,s])=>{
    const slim=toSlimActiveSession(gid,s);
    if(slim&&(slim.examSavedId||Object.keys(slim.answers||{}).length))payload[gid]=slim;
  });
  try{
    localStorage.setItem(ACTIVE_SESSIONS_LS_KEY,JSON.stringify(payload));
  }catch(_){
    Object.values(payload).forEach(s=>{delete s.fieldValues;});
    try{localStorage.setItem(ACTIVE_SESSIONS_LS_KEY,JSON.stringify(payload));}catch(_){}
  }
  if(scheduleSync!==false)scheduleActiveSessionsSync();
}
function scheduleActiveSessionsSync(){
  if(typeof Auth==='undefined'||typeof isAppAuthenticated!=='function'||!isAppAuthenticated())return;
  if(_activeSessionsSyncTimer)clearTimeout(_activeSessionsSyncTimer);
  _activeSessionsSyncTimer=setTimeout(()=>{_activeSessionsSyncTimer=null;if(typeof Auth.pushSync==='function')Auth.pushSync();},1500);
}
function getSessionForGoal(goalId){
  if(!goalId)return null;
  return S.activeSessionsByGoal?.[goalId]||null;
}
function setSessionForGoal(goalId,session){
  if(!goalId)return;
  if(!S.activeSessionsByGoal)S.activeSessionsByGoal={};
  if(session)S.activeSessionsByGoal[goalId]=session;
  else delete S.activeSessionsByGoal[goalId];
  writeActiveSessionsMap(S.activeSessionsByGoal);
}
function exportActiveSessionsForSync(){
  const map=S.activeSessionsByGoal&&typeof S.activeSessionsByGoal==='object'?S.activeSessionsByGoal:{};
  const payload={};
  Object.entries(map).forEach(([gid,s])=>{
    const slim=toSlimActiveSession(gid,s);
    if(slim&&(slim.examSavedId||Object.keys(slim.answers||{}).length))payload[gid]=slim;
  });
  return payload;
}
function applyActiveSessionsFromSync(map){
  if(!map||typeof map!=='object')return;
  S.activeSessionsByGoal=map;
  writeActiveSessionsMap(map,false);
}
function saveActiveSession(){
  const s=S.activeSession;
  if(!s)return;
  const gid=resolveExamGoalId(s);
  if(!gid)return;
  s.goalId=gid;
  if(S.examData){
    if(S.activeGoalId)S.examData.goalId=S.activeGoalId;
    s.examSavedId=S.examData._savedId||S.examData._flightId||s.examSavedId||null;
  }
  s.updatedAt=Date.now();
  setSessionForGoal(gid,s);
}
function normalizeMode(m){return m==='real'||m==='official'?'official':'practice';}
function migrateSavedExams(){
  if(!Array.isArray(S.savedExams))S.savedExams=[];
  S.savedExams.forEach(e=>{
    if(!e||typeof e!=='object')return;
    if(!e.status)e.status=e.score!=null?'completed':'in_progress';
    e.mode=normalizeMode(e.mode||'official');
    if(!e.contentKey&&e.data&&typeof getExamContentKey==='function'){
      const key=getExamContentKey(e.data,e.goalId,e.mode);
      if(key)e.contentKey=key;
    }
  });
  if(typeof dedupeSavedExamsByContentKey==='function')dedupeSavedExamsByContentKey();
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
  /** @deprecated transitional — legacy localStorage JWT during cookie migration */
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
  const base={
    goalId:S.activeGoalId,mode:m,examData:null,answers:{},gapAnswers:{},
    markedWords:[],position:0,startedAt:Date.now(),updatedAt:Date.now(),
    subject:S.subject,level:S.level
  };
  S.activeSession=base;
  if(m==='official'){
    S._officialInProgress={id:Date.now(),goalId:S.activeGoalId,examData:null,answers:{},gapAnswers:{},markedWords:[],startedAt:Date.now()};
  }else S._officialInProgress=null;
}
function clearActiveSession(goalId){
  const gid=goalId||S.activeSession?.goalId||S.activeGoalId;
  if(gid)setSessionForGoal(gid,null);
  if(!goalId||S.activeSession?.goalId===gid)S.activeSession=null;
  if(!goalId||S._officialInProgress?.goalId===gid)S._officialInProgress=null;
}
function savedExamMatchesGoal(e,goalId){
  if(!e?.data||e.status!=='in_progress')return false;
  if(e.goalId===goalId)return true;
  const goal=(S.goals||[]).find(g=>g.id===goalId);
  if(goal&&!e.goalId&&e.lang===goal.subject&&e.level===goal.level)return true;
  return false;
}
function getResumableSession(goalId){
  if(!goalId){
    const g=typeof getActiveGoal==='function'?getActiveGoal():null;
    goalId=g?.id||null;
  }
  if(!goalId)return null;
  let s=getSessionForGoal(goalId);
  if(s) s=hydrateSessionExamData({...s});
  if(!s?.examData){
    const saved=(S.savedExams||[])
      .filter(e=>savedExamMatchesGoal(e,goalId))
      .sort((a,b)=>(typeof savedExamTs==='function'?savedExamTs(b):0)-(typeof savedExamTs==='function'?savedExamTs(a):0));
    if(saved[0]) s=sessionFromSavedExam(saved[0],goalId);
  }
  if(!s?.examData)return null;
  const hasAnswers=Object.keys(s.answers||{}).length>0||Object.keys(s.gapAnswers||{}).some(k=>s.gapAnswers[k]?.trim());
  const hasFields=s.fieldValues&&Object.values(s.fieldValues).some(v=>String(v||'').trim());
  if(!hasAnswers&&!hasFields&&!(s.markedWords||[]).length){
    const ts=Number(s.updatedAt)||0;
    if(!ts||Date.now()-ts>86400000)return null;
  }
  const mode=normalizeMode(s.mode);
  if(mode!=='practice'&&mode!=='official')return null;
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
  const escSel=typeof CSS!=='undefined'&&CSS.escape?CSS.escape:(s=>String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"'));
  Object.entries(S.answers||{}).forEach(([k,v])=>{
    if(v==null||v==='')return;
    const radio=document.querySelector(`input[type=radio][name="${escSel(k)}"][value="${escSel(String(v))}"]`);
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
  if(!S.examData||S.quickMod||S.isDemo)return;
  const mode=isOfficialMode()?'official':isPracticeMode()?'practice':normalizeMode(S.mode);
  if(mode!=='practice'&&mode!=='official')return;
  if(S.activeGoalId)S.examData.goalId=S.activeGoalId;
  if(typeof saveCurrentExam==='function'){
    try{saveCurrentExam('in_progress',{silent:true});}catch(err){
      if(typeof lcDebug!=='undefined')lcDebug.warn('[autosaveSession] saveCurrentExam',err);
    }
  }
  if(!S.activeSession)initExamSession(mode);
  const gid=resolveExamGoalId(S.activeSession);
  if(!gid)return;
  S.activeSession.goalId=gid;
  S.activeSession.mode=mode;
  S.activeSession.examSavedId=S.examData._savedId||S.examData._flightId||S.activeSession.examSavedId||null;
  S.activeSession.answers={...S.answers};
  S.activeSession.gapAnswers={...S.gapAnswers};
  S.activeSession.fieldValues=captureExamFieldValues();
  S.activeSession.scrollY=window.scrollY;
  S.activeSession.subject=S.subject||S.examData.lang;
  S.activeSession.level=S.level||S.examData.level;
  S.activeSession.vocabLang=S.vocabLang;
  S.activeSession.markedWords=S.activeSession.markedWords||[];
  S.activeSession.updatedAt=Date.now();
  if(mode==='official'){
    S.activeSession.timerEndsAt=S.timerEndsAt||null;
    S.activeSession.startedAt=S.activeSession.startedAt||Date.now();
    syncOfficialFlight();
  }
  saveActiveSession();
}
function exitExamAndSave(){
  if(S.examData&&!S.quickMod&&!S.isDemo){
    if(typeof flushExamAutosave==='function')flushExamAutosave();
    else autosaveSession();
  }
}
function saveAndExitExam(){
  if(!S.examData||S.quickMod||S.isDemo)return;
  exitExamAndSave();
  const id=S.activeGoalId||resolveExamGoalId(S.activeSession);
  if(id)openGoalWorkspace(id);
  else goHome();
  lcToast('Exam saved — resume anytime from your goal workspace.','info');
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
  if(!src.examData){clearActiveSession(src.goalId||S.activeGoalId);return;}
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
  clearActiveSession(src.goalId||S.activeGoalId);
}
function resumeExamSession(){
  const goalId=S.activeGoalId||(typeof getActiveGoal==='function'?getActiveGoal()?.id:null);
  const s=getResumableSession(goalId)||(S.activeSession?hydrateSessionExamData({...S.activeSession}):null);
  if(!s?.examData){
    lcToast('No saved exam progress found for this goal.','warn');
    return;
  }
  S.examData=s.examData;
  S.answers={...(s.answers||{})};
  S.gapAnswers={...(s.gapAnswers||{})};
  S.mode=normalizeMode(s.mode);
  S.subject=s.subject||s.examData.lang;
  S.level=s.level||s.examData.level;
  if(typeof initVocabUiLang==='function')initVocabUiLang();
  else if(typeof syncUiLangMirrors==='function')syncUiLangMirrors(resolveVocabUiLang());
  if(s.goalId){S.activeGoalId=s.goalId;const g=S.goals.find(x=>x.id===s.goalId);if(g)syncGoalToProfile(g);}
  S.activeSession=s;
  if(S.mode==='official'){
    S._officialInProgress={
      id:s.examData._flightId||Date.now(),goalId:s.goalId,examData:s.examData,
      answers:S.answers,gapAnswers:S.gapAnswers,
      markedWords:s.markedWords||[],startedAt:s.startedAt||Date.now()
    };
  }
  S._resumeFieldValues=s.fieldValues;
  S._resumeScrollY=s.scrollY;
  S._resumeTimerEndsAt=s.timerEndsAt||null;
  hideAll();
  renderExam();
}
function discardActiveSession(){
  clearResumableExamForGoal(S.activeGoalId);
  const id=S.activeGoalId;
  if(id)openGoalWorkspace(id);
  else goHome();
}
function saveUser(u){S.user=u;localStorage.setItem('lc_user',JSON.stringify(u));}
function saveFC(){ensureFcIds();localStorage.setItem('lc_fc',JSON.stringify(S.flashcards));updBadges();Auth.pushSync();}
function lcToast(msg,type='info',ms=3800){if(typeof showToast==='function')showToast(msg,type,ms);else alert(msg);}
function saveHist(){
  if(typeof ModuleGrading!=='undefined'&&ModuleGrading.migrateHistoryEntry&&Array.isArray(S.history)){
    S.history=S.history.map(e=>ModuleGrading.migrateHistoryEntry(e));
  }
  localStorage.setItem('lc_hist',JSON.stringify(S.history));
  Auth.pushSync();
}
function saveNotes(){if(typeof saveNotebookData==='function')saveNotebookData();}
function saveSaved(){
  const write=()=>localStorage.setItem('lc_saved',JSON.stringify(S.savedExams));
  try{write();}
  catch(_){
    const autos=(S.savedExams||[]).filter(e=>e.status==='auto').sort((a,b)=>(typeof savedExamTs==='function'?savedExamTs(a):0)-(typeof savedExamTs==='function'?savedExamTs(b):0));
    while(autos.length&&(S.savedExams||[]).length>8){
      const drop=autos.shift();
      S.savedExams=S.savedExams.filter(e=>e.id!==drop.id);
    }
    try{write();}
    catch(_){
      lcToast('Could not save exam — browser storage is full. Submit or delete old saved exams.','error',6500);
      return;
    }
  }
  if(typeof Auth!=='undefined')Auth.pushSync();
}
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
    const day=typeof ActivityTrack!=='undefined'&&ActivityTrack.localDayKey
      ?ActivityTrack.localDayKey(ts)
      :new Date(ts).toISOString().slice(0,10);
    const mode=normalizeMode(h.mode)==='practice'?'Practice':'Official';
    return{id:'hist_'+h.id,ts,day,type:'exam',goalId:null,label:mode+' exam · '+(h.topic||h.level||''),score:h.score!=null?h.score:null,sec:900};
  });
  saveActivity();
}
function getStudyStreak(){return typeof ActivityTrack!=='undefined'?ActivityTrack.getStreak({studyTime:S.studyTime,activityLog:S.activityLog}):0;}
function getStudyMonthTime(){return typeof ActivityTrack!=='undefined'?ActivityTrack.getMonthSec({studyTime:S.studyTime}):0;}
function formatStudyDuration(sec){return typeof ActivityTrack!=='undefined'?ActivityTrack.formatDuration(sec):'—';}
function studySecForGoal(goal){return typeof ActivityTrack!=='undefined'?ActivityTrack.studySecForGoal(S.activityLog,goal):0;}
