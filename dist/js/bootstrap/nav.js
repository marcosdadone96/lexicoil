// ═══════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════
const SCREENS=['homeScreen','goalWorkspaceScreen','examConfigScreen','oralPracticeScreen','profileSetupScreen','loadingScreen','examScreen','resultsScreen','mistakeReviewScreen','flashcardScreen','vocabExamScreen','horenGameScreen'];
function getActiveScreenId(){
  for(const id of SCREENS){
    const el=document.getElementById(id);
    if(el&&el.style.display==='block')return id;
  }
  return null;
}
function _navExitVocabFlashcards(){
  if(typeof _vocabHub!=='undefined'){
    _vocabHub.activity=null;
    _vocabHub.flashcardMode=false;
  }
  if(typeof refreshVocabHubPanel==='function')refreshVocabHubPanel();
  window.scrollTo({top:0,behavior:'smooth'});
}
function _navCleanupDeckHub(){
  if(typeof clearVocabHubFlashcardMode==='function')clearVocabHubFlashcardMode();
  if(S.fcSelected)S.fcSelected.clear();
  S.deckGoalFilter=null;
}
function navBackLabel(){
  if(typeof LcRouter!=='undefined'&&LcRouter.backLabel)return LcRouter.backLabel();
  return 'Dashboard';
}
function navBack(){
  const screen=getActiveScreenId();
  if(screen==='goalWorkspaceScreen'&&typeof _vocabHub!=='undefined'&&_vocabHub.activity==='flashcards'){
    _navExitVocabFlashcards();
    if(typeof LcRouter!=='undefined'){
      const goal=getActiveGoal();
      if(goal){
        LcRouter.navigate(LcRouter.goalPath(goal,'vocab'),{label:'Vocabulary',replace:true});
      }
    }
    return;
  }
  if(screen==='flashcardScreen'){
    _navCleanupDeckHub();
  }
  if(typeof LcRouter!=='undefined'&&LcRouter.back){
    LcRouter.back();
    return;
  }
  goHome();
}
function renderNavBackBtn(label){
  const lbl=label||navBackLabel();
  return'<button type="button" class="back-btn nav-back-btn" onclick="navBack()">← '+esc(lbl)+'</button>';
}
function syncWorkspaceBackBtn(){
  const wsBack=document.querySelector('#goalWorkspaceScreen > .nav-back-btn');
  if(!wsBack)return;
  const hide=typeof _vocabHub!=='undefined'&&_vocabHub.activity==='flashcards';
  wsBack.style.display=hide?'none':'';
}
function syncNavBackLabels(){
  const screen=getActiveScreenId();
  if(!screen)return;
  const root=document.getElementById(screen);
  if(!root)return;
  const lbl=navBackLabel();
  root.querySelectorAll('.nav-back-btn').forEach(btn=>{btn.textContent='← '+lbl;});
  if(screen==='goalWorkspaceScreen'){
    syncWorkspaceBackBtn();
    const panel=document.getElementById('wsPanelVocabulary');
    if(panel&&typeof _vocabHub!=='undefined'&&_vocabHub.activity==='flashcards'){
      panel.querySelectorAll('.nav-back-btn').forEach(btn=>{btn.textContent='← Vocabulary';});
    }
  }
}
function show(id){
  document.getElementById(id).style.display='block';
  syncNavBackLabels();
  if(typeof LcA11y!=='undefined')LcA11y.onScreenShown(id);
  if(typeof refreshNotebookFab==='function')refreshNotebookFab();
}
function hide(id){document.getElementById(id).style.display='none';if(typeof refreshNotebookFab==='function')refreshNotebookFab();}
function hideAll(){if(typeof unbindExamScrollTop==='function')unbindExamScrollTop();flushOpenStudySession();SCREENS.forEach(hide);stopTimer();showExamConfigFootbar(false);if(typeof refreshNotebookFab==='function')refreshNotebookFab();}
function goHome(){
  if(!requireAppAuth())return;
  if(typeof routerNavigate==='function'){
    routerNavigate('#/',{label:'Dashboard',replace:false});
    return;
  }
  clearVocabHubFlashcardMode();
  hideAll();
  show('homeScreen');
  setNavActive('dashboard');
  updateWorkspaceUrl(null);
  if(S.goals.length===1){
    S.activeGoalId=S.goals[0].id;
    syncGoalToProfile(S.goals[0]);
  }
  updBadges();
  updQuotaUI();
  renderHomeScreen();
  window.scrollTo({top:0,behavior:'smooth'});
}
function goFlashcards(clearGoalFilter){
  const goal=getActiveGoal()||S.goals[0];
  if(goal){
    if(clearGoalFilter!==false)S.deckGoalFilter=goal.subject;
    openDeckHub(goal.id);
    return;
  }
  if(typeof routerNavigate==='function'){
    routerNavigate('#/flashcards',{label:'Dashboard'});
    return;
  }
  hideAll();show('flashcardScreen');
  S.deckGoalFilter=null;
  renderDeckHub();
  window.scrollTo({top:0,behavior:'smooth'});
}
function goHistory(){
  const goal=getActiveGoal()||S.goals[0];
  if(goal){
    if(typeof LcRouter!=='undefined'){
      LcRouter.navigate(LcRouter.goalPath(goal,'progress'),{label:'Progress'});
      return;
    }
    openGoalWorkspace(goal.id,'progress');
    return;
  }
  goHome();
}
function setExamMode(m){
  S.mode=normalizeMode(m);
  if(S.mode==='practice')S.vocabLang=vocabLangFor(S.subject);
}
